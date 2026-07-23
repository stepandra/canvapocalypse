import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { extname, resolve, sep } from 'node:path';

export class WorkspaceValidationError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'WorkspaceValidationError';
    this.statusCode = statusCode;
  }
}

export class WorkspaceConflictError extends WorkspaceValidationError {
  constructor(currentRevision) {
    super(`Workspace revision conflict; current revision is ${currentRevision}`, 409);
    this.currentRevision = currentRevision;
  }
}

export function validateWorkspace(workspace, expectedProjectId) {
  if (!workspace || typeof workspace !== 'object' || Array.isArray(workspace)) {
    throw new WorkspaceValidationError('Workspace must be an object');
  }
  if (workspace.schemaVersion !== 1) {
    throw new WorkspaceValidationError('Workspace schemaVersion must be 1');
  }
  if (workspace.projectId !== expectedProjectId) {
    throw new WorkspaceValidationError(`Workspace projectId must be ${expectedProjectId}`);
  }
  if (!Number.isInteger(workspace.revision) || workspace.revision < 1) {
    throw new WorkspaceValidationError('Workspace revision must be a positive integer');
  }
  if (typeof workspace.projectRoot !== 'string' || workspace.projectRoot.length === 0) {
    throw new WorkspaceValidationError('Workspace projectRoot is required');
  }
  for (const key of ['nodes', 'documents', 'flows']) {
    if (!Array.isArray(workspace[key])) {
      throw new WorkspaceValidationError(`Workspace ${key} must be an array`);
    }
  }
  assertUniqueIds(workspace.nodes, 'node');
  assertUniqueIds(workspace.documents, 'document');
  assertUniqueIds(workspace.flows, 'flow');
  const documentIds = new Set(workspace.documents.map((document) => document.id));
  workspace.nodes.forEach((node) => {
    for (const key of ['id', 'name', 'type', 'provider', 'location']) {
      if (typeof node[key] !== 'string') {
        throw new WorkspaceValidationError(`Infrastructure node ${node.id ?? '(unknown)'} has invalid ${key}`);
      }
    }
    if (!node.specs || typeof node.specs !== 'object') {
      throw new WorkspaceValidationError(`Infrastructure node ${node.id} requires specs`);
    }
    if (!Array.isArray(node.documentIds)) {
      throw new WorkspaceValidationError(`Infrastructure node ${node.id} requires documentIds`);
    }
    for (const documentId of node.documentIds) {
      if (!documentIds.has(documentId)) {
        throw new WorkspaceValidationError(
          `Infrastructure node ${node.id} references missing document ${documentId}`,
        );
      }
    }
  });
  workspace.documents.forEach((document) => {
    if (typeof document.title !== 'string' || typeof document.path !== 'string') {
      throw new WorkspaceValidationError(`Document ${document.id} requires title and path`);
    }
    if (!['.md', '.mdx'].includes(extname(document.path).toLowerCase())) {
      throw new WorkspaceValidationError(`Document ${document.id} must reference Markdown or MDX`);
    }
  });
  workspace.flows.forEach((flow) => {
    if (typeof flow.name !== 'string' || !Array.isArray(flow.steps)) {
      throw new WorkspaceValidationError(`Flow ${flow.id} requires name and steps`);
    }
    flow.steps.forEach((step) => {
      if (typeof step.itemId !== 'string' || typeof step.name !== 'string') {
        throw new WorkspaceValidationError(`Flow ${flow.id} has an invalid step`);
      }
    });
  });
  return workspace;
}

export function createProjectWorkspaceStore({ workspaceDir }) {
  const cache = new Map();
  const queues = new Map();
  const listeners = new Map();
  const studioRoot = resolve(workspaceDir, '..');
  const pathFor = (projectId) => resolve(workspaceDir, `${validateProjectId(projectId)}.json`);

  async function getWorkspace(projectId) {
    const id = validateProjectId(projectId);
    if (cache.has(id)) return structuredClone(cache.get(id));
    const workspace = JSON.parse(await readFile(pathFor(id), 'utf8'));
    validateWorkspace(workspace, id);
    cache.set(id, workspace);
    return structuredClone(workspace);
  }

  async function persist(workspace) {
    await mkdir(workspaceDir, { recursive: true });
    const target = pathFor(workspace.projectId);
    const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(workspace, null, 2)}\n`, 'utf8');
    await rename(temporary, target);
  }

  async function replaceWorkspace(projectId, request) {
    const id = validateProjectId(projectId);
    return mutate(id, async (current) => {
      if (request.baseRevision !== current.revision) {
        throw new WorkspaceConflictError(current.revision);
      }
      const proposed = structuredClone(request.workspace);
      proposed.projectId = id;
      proposed.revision = current.revision + 1;
      proposed.updatedAt = new Date().toISOString();
      proposed.updatedBy = request.actor || 'isoflow-ui';
      proposed.transactionId = request.transactionId ?? randomUUID();
      if (request.idempotencyKey) proposed.idempotencyKey = request.idempotencyKey;
      validateWorkspace(proposed, id);
      return proposed;
    });
  }

  function mutate(id, mutation) {
    const previous = queues.get(id) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(async () => {
      const current = await getWorkspace(id);
      const proposed = await mutation(current);
      await persist(proposed);
      cache.set(id, proposed);
      const event = {
        scope: 'workspace',
        projectId: id,
        revision: proposed.revision,
        updatedAt: proposed.updatedAt,
        updatedBy: proposed.updatedBy,
        transactionId: proposed.transactionId,
      };
      for (const listener of listeners.get(id) ?? []) listener(structuredClone(event));
      return structuredClone(proposed);
    });
    queues.set(id, next);
    return next.finally(() => {
      if (queues.get(id) === next) queues.delete(id);
    });
  }

  async function transact(projectId, request) {
    const id = validateProjectId(projectId);
    if (!Array.isArray(request.operations) || request.operations.length === 0) {
      throw new WorkspaceValidationError('Workspace transaction requires operations');
    }
    if (request.operations.length > 100) {
      throw new WorkspaceValidationError('Workspace transaction cannot exceed 100 operations');
    }
    const current = await getWorkspace(id);
    if (request.idempotencyKey && current.idempotencyKey === request.idempotencyKey) {
      return { ...current, idempotentReplay: true };
    }
    if (request.baseRevision !== current.revision) {
      throw new WorkspaceConflictError(current.revision);
    }
    const proposed = structuredClone(current);
    for (const operation of request.operations) applyWorkspaceOperation(proposed, operation);
    proposed.revision = current.revision + 1;
    proposed.updatedAt = new Date().toISOString();
    proposed.updatedBy = request.actor || 'isoflow-ui:workspace';
    proposed.transactionId = request.transactionId ?? randomUUID();
    if (request.idempotencyKey) proposed.idempotencyKey = request.idempotencyKey;
    validateWorkspace(proposed, id);
    if (request.dryRun) return { ...proposed, dryRun: true };
    return mutate(id, (latest) => {
      if (latest.revision !== current.revision) throw new WorkspaceConflictError(latest.revision);
      return proposed;
    });
  }

  async function getDocument(projectId, documentId) {
    const workspace = await getWorkspace(projectId);
    const document = workspace.documents.find((candidate) => candidate.id === documentId);
    if (!document) throw new WorkspaceValidationError(`Unknown document: ${documentId}`, 404);
    const configuredRoot = process.env.ISOFLOW_PROJECT_ROOT || workspace.projectRoot;
    const projectRoot = resolve(studioRoot, configuredRoot);
    const documentPath = resolve(projectRoot, document.path);
    if (documentPath !== projectRoot && !documentPath.startsWith(`${projectRoot}${sep}`)) {
      throw new WorkspaceValidationError(`Document path escapes projectRoot: ${document.path}`);
    }
    return {
      document,
      absolutePath: documentPath,
      content: await readFile(documentPath, 'utf8'),
    };
  }

  return {
    getWorkspace,
    replaceWorkspace,
    transact,
    getDocument,
    subscribe(projectId, listener) {
      const id = validateProjectId(projectId);
      const projectListeners = listeners.get(id) ?? new Set();
      projectListeners.add(listener);
      listeners.set(id, projectListeners);
      return () => {
        projectListeners.delete(listener);
        if (projectListeners.size === 0) listeners.delete(id);
      };
    },
  };
}

export function applyWorkspaceOperation(workspace, operation) {
  if (!operation || typeof operation !== 'object' || Array.isArray(operation)) {
    throw new WorkspaceValidationError('Workspace operation must be an object');
  }
  switch (operation.op) {
    case 'add_node': {
      assertMissing(workspace.nodes, operation.node?.id, 'Infrastructure node');
      workspace.nodes.push(structuredClone(operation.node));
      return;
    }
    case 'update_node': {
      const node = findRecord(workspace.nodes, operation.nodeId, 'Infrastructure node');
      Object.assign(node, structuredClone(operation.patch ?? {}), { id: node.id });
      return;
    }
    case 'remove_node': {
      const id = requiredId(operation.nodeId, 'nodeId');
      findRecord(workspace.nodes, id, 'Infrastructure node');
      workspace.nodes = workspace.nodes.filter((node) => node.id !== id);
      return;
    }
    case 'add_document': {
      assertMissing(workspace.documents, operation.document?.id, 'Document');
      workspace.documents.push(structuredClone(operation.document));
      return;
    }
    case 'update_document': {
      const document = findRecord(workspace.documents, operation.documentId, 'Document');
      Object.assign(document, structuredClone(operation.patch ?? {}), { id: document.id });
      return;
    }
    case 'remove_document': {
      const id = requiredId(operation.documentId, 'documentId');
      findRecord(workspace.documents, id, 'Document');
      workspace.documents = workspace.documents.filter((document) => document.id !== id);
      workspace.nodes.forEach((node) => {
        node.documentIds = (node.documentIds ?? []).filter((documentId) => documentId !== id);
      });
      return;
    }
    case 'link_document': {
      const node = findRecord(workspace.nodes, operation.nodeId, 'Infrastructure node');
      const document = findRecord(workspace.documents, operation.documentId, 'Document');
      node.documentIds = [...new Set([...(node.documentIds ?? []), document.id])];
      return;
    }
    case 'unlink_document': {
      const node = findRecord(workspace.nodes, operation.nodeId, 'Infrastructure node');
      const documentId = requiredId(operation.documentId, 'documentId');
      node.documentIds = (node.documentIds ?? []).filter((id) => id !== documentId);
      return;
    }
    case 'add_flow': {
      assertMissing(workspace.flows, operation.flow?.id, 'Flow');
      workspace.flows.push(structuredClone(operation.flow));
      return;
    }
    case 'update_flow': {
      const flow = findRecord(workspace.flows, operation.flowId, 'Flow');
      Object.assign(flow, structuredClone(operation.patch ?? {}), { id: flow.id });
      return;
    }
    case 'remove_flow': {
      const id = requiredId(operation.flowId, 'flowId');
      findRecord(workspace.flows, id, 'Flow');
      workspace.flows = workspace.flows.filter((flow) => flow.id !== id);
      return;
    }
    default:
      throw new WorkspaceValidationError(`Unsupported workspace operation: ${operation.op}`);
  }
}

function requiredId(value, field) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new WorkspaceValidationError(`${field} is required`);
  }
  return value;
}

function findRecord(values, rawId, label) {
  const id = requiredId(rawId, `${label.toLowerCase()}Id`);
  const value = values.find((candidate) => candidate.id === id);
  if (!value) throw new WorkspaceValidationError(`${label} does not exist: ${id}`, 404);
  return value;
}

function assertMissing(values, rawId, label) {
  const id = requiredId(rawId, `${label.toLowerCase()}Id`);
  if (values.some((candidate) => candidate.id === id)) {
    throw new WorkspaceValidationError(`${label} already exists: ${id}`);
  }
}

function assertUniqueIds(values, label) {
  const ids = new Set();
  values.forEach((value) => {
    if (typeof value?.id !== 'string' || value.id.length === 0) {
      throw new WorkspaceValidationError(`Every ${label} requires an id`);
    }
    if (ids.has(value.id)) throw new WorkspaceValidationError(`Duplicate ${label} id: ${value.id}`);
    ids.add(value.id);
  });
}

function validateProjectId(value) {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,79}$/i.test(value)) {
    throw new WorkspaceValidationError(`Invalid project ID: ${value}`);
  }
  return value;
}
