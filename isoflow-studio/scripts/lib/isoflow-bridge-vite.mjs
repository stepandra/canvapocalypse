import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { convertProExport } from './pro-export.mjs';
import {
  BridgeValidationError,
  getIsoflowBridgeCapabilities,
  getIsoflowView,
  searchIsoflow,
} from './isoflow-bridge.mjs';
import { createIsoflowBridgeStore } from './isoflow-bridge-store.mjs';
import { createProjectWorkspaceStore } from './project-workspace.mjs';
import { describeIsoflowRender, renderIsoflowSvg } from './isoflow-render.mjs';

export function isoflowBridgePlugin({
  root,
  projectSources,
  stateDir = '.runtime/isoflow-bridge',
  workspaceDir = 'workspaces',
}) {
  const absoluteRoot = resolve(root);
  const store = createIsoflowBridgeStore({
    stateDir: resolve(absoluteRoot, stateDir),
    async loadInitialModel(projectId) {
      const sourcePath = projectSources[projectId];
      if (!sourcePath) throw new BridgeValidationError(`Unknown Isoflow project: ${projectId}`);
      const source = JSON.parse(await readFile(resolve(absoluteRoot, sourcePath), 'utf8'));
      return convertProExport(source);
    },
  });
  const workspaceStore = createProjectWorkspaceStore({
    workspaceDir: resolve(absoluteRoot, workspaceDir),
  });
  const middleware = createIsoflowBridgeMiddleware(store, workspaceStore);

  return {
    name: 'isoflow-model-bridge',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

export function createIsoflowBridgeMiddleware(store, workspaceStore) {
  return async function isoflowBridgeMiddleware(request, response, next) {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (!url.pathname.startsWith('/api/isoflow/')) return next();

    response.setHeader('cache-control', 'no-store');
    response.setHeader('access-control-allow-origin', '*');
    response.setHeader('access-control-allow-headers', 'content-type, last-event-id');
    response.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
    if (request.method === 'OPTIONS') return sendJson(response, 204, null);

    try {
      if (url.pathname === '/api/isoflow/health' && request.method === 'GET') {
        return sendJson(response, 200, {
          ok: true,
          service: 'isoflow-model-bridge',
          schemaVersion: getIsoflowBridgeCapabilities().schemaVersion,
        });
      }
      if (url.pathname === '/api/isoflow/capabilities' && request.method === 'GET') {
        return sendJson(response, 200, getIsoflowBridgeCapabilities());
      }

      const workspaceTransactionMatch = url.pathname.match(
        /^\/api\/isoflow\/projects\/([^/]+)\/workspace\/transact$/,
      );
      if (workspaceTransactionMatch) {
        if (request.method !== 'POST') return sendJson(response, 405, { error: 'Method not allowed' });
        const projectId = decodeURIComponent(workspaceTransactionMatch[1]);
        return sendJson(
          response,
          200,
          await workspaceStore.transact(projectId, await readJsonBody(request)),
        );
      }
      const workspaceMatch = url.pathname.match(
        /^\/api\/isoflow\/projects\/([^/]+)\/workspace(?:\/documents\/([^/]+))?$/,
      );
      if (workspaceMatch) {
        const projectId = decodeURIComponent(workspaceMatch[1]);
        const documentId = workspaceMatch[2] ? decodeURIComponent(workspaceMatch[2]) : null;
        if (request.method === 'GET' && documentId) {
          return sendJson(response, 200, await workspaceStore.getDocument(projectId, documentId));
        }
        if (request.method === 'GET' && !documentId) {
          return sendJson(response, 200, await workspaceStore.getWorkspace(projectId));
        }
        if (request.method === 'POST' && !documentId) {
          return sendJson(
            response,
            200,
            await workspaceStore.replaceWorkspace(projectId, await readJsonBody(request)),
          );
        }
        return sendJson(response, 405, { error: 'Method not allowed' });
      }

      const match = url.pathname.match(
        /^\/api\/isoflow\/projects\/([^/]+)\/(state|view|search|inspect|patch|transact|model|events|history|render)(?:\/(diff|revert))?$/,
      );
      if (!match) return sendJson(response, 404, { error: 'Isoflow bridge route not found' });
      const projectId = decodeURIComponent(match[1]);
      const action = match[2];
      const subAction = match[3];

      if (request.method === 'GET' && action === 'state') {
        return sendJson(response, 200, await store.getState(projectId));
      }
      if (request.method === 'GET' && action === 'view') {
        const state = await store.getState(projectId);
        return sendJson(response, 200, getIsoflowView(state, url.searchParams.get('viewId') || undefined));
      }
      if (request.method === 'GET' && action === 'search') {
        const state = await store.getState(projectId);
        return sendJson(response, 200, searchIsoflow(state, {
          query: url.searchParams.get('query'),
          kind: url.searchParams.get('kind') || 'all',
          viewId: url.searchParams.get('viewId') || undefined,
          limit: Number.parseInt(url.searchParams.get('limit') ?? '', 10) || undefined,
        }));
      }
      if (request.method === 'POST' && action === 'inspect') {
        const body = await readJsonBody(request);
        return sendJson(
          response,
          200,
          await inspectProject(store, workspaceStore, projectId, body),
        );
      }
      if (request.method === 'POST' && (action === 'patch' || action === 'transact')) {
        const body = await readJsonBody(request);
        const result = await store.transact(projectId, body);
        return sendJson(response, 200, { ...result, dryRun: Boolean(body.dryRun) });
      }
      if (request.method === 'POST' && action === 'model') {
        return sendJson(response, 200, await store.replaceModel(projectId, await readJsonBody(request)));
      }
      if (request.method === 'GET' && action === 'events') {
        return openEventStream(request, response, store, workspaceStore, projectId);
      }
      if (request.method === 'GET' && action === 'history' && subAction === 'diff') {
        return sendJson(
          response,
          200,
          await store.diffRevisions(
            projectId,
            parseRequiredRevision(url.searchParams.get('from'), 'from'),
            parseRequiredRevision(url.searchParams.get('to'), 'to'),
          ),
        );
      }
      if (request.method === 'POST' && action === 'history' && subAction === 'revert') {
        return sendJson(response, 200, await store.revert(projectId, await readJsonBody(request)));
      }
      if (request.method === 'GET' && action === 'history' && !subAction) {
        return sendJson(response, 200, {
          projectId,
          revisions: await store.getHistory(projectId, {
            limit: Number.parseInt(url.searchParams.get('limit') ?? '', 10) || undefined,
          }),
        });
      }
      if (request.method === 'GET' && action === 'render') {
        const state = await store.getState(projectId);
        const viewId = url.searchParams.get('viewId') || undefined;
        const format = url.searchParams.get('format') || 'descriptor';
        if (format === 'descriptor') {
          return sendJson(response, 200, describeIsoflowRender(state, viewId));
        }
        if (format === 'svg') {
          response.setHeader('content-type', 'image/svg+xml; charset=utf-8');
          response.statusCode = 200;
          return response.end(renderIsoflowSvg(state, viewId));
        }
        throw new BridgeValidationError(`Unsupported render format: ${format}`);
      }
      return sendJson(response, 405, { error: 'Method not allowed' });
    } catch (error) {
      const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
      return sendJson(response, statusCode, {
        error: error?.message ?? String(error),
        ...(error?.details ? { details: error.details } : {}),
        ...(error?.currentRevision ? { currentRevision: error.currentRevision } : {}),
      });
    }
  };
}

async function inspectProject(store, workspaceStore, projectId, request) {
  const kind = request.kind ?? 'state';
  const state = await store.getState(projectId);
  const limit = Math.min(100, Math.max(1, Number(request.limit) || 50));
  const view = request.viewId
    ? state.model.views.find((candidate) => candidate.id === request.viewId)
    : state.model.views.find((candidate) => candidate.id === state.model.view) ?? state.model.views[0];
  if (request.viewId && !view) throw new BridgeValidationError(`View does not exist: ${request.viewId}`);
  const selectIds = (values) => {
    const ids = Array.isArray(request.ids) ? new Set(request.ids) : null;
    const selected = ids ? values.filter((value) => ids.has(value.id)) : values;
    return { values: structuredClone(selected.slice(0, limit)), truncated: selected.length > limit };
  };

  if (kind === 'capabilities') return getIsoflowBridgeCapabilities();
  if (kind === 'state') {
    return request.full === true
      ? state
      : {
        projectId,
        revision: state.revision,
        activeViewId: state.model.view,
        title: state.model.title,
        views: state.model.views.map(({ id, name }) => ({ id, name })),
        counts: {
          items: state.model.items.length,
          icons: state.model.icons.length,
          colors: state.model.colors?.length ?? 0,
          legend: state.model.legend?.length ?? 0,
        },
      };
  }
  if (kind === 'view') return getIsoflowView(state, request.viewId);
  if (kind === 'items') return { projectId, revision: state.revision, ...selectIds(state.model.items) };
  if (kind === 'icons') return { projectId, revision: state.revision, ...selectIds(state.model.icons) };
  if (kind === 'colors') return { projectId, revision: state.revision, ...selectIds(state.model.colors ?? []) };
  if (kind === 'legend') {
    const colorMap = new Map((state.model.colors ?? []).map((color) => [color.id, color.value]));
    return {
      projectId,
      revision: state.revision,
      legend: (state.model.legend ?? []).map((entry) => ({
        ...entry,
        value: colorMap.get(entry.colorId) ?? null,
      })),
    };
  }
  if (kind === 'connectors') {
    return { projectId, revision: state.revision, viewId: view.id, ...selectIds(view.connectors ?? []) };
  }
  if (kind === 'rectangles') {
    return { projectId, revision: state.revision, viewId: view.id, ...selectIds(view.rectangles ?? []) };
  }
  if (kind === 'textBoxes') {
    return { projectId, revision: state.revision, viewId: view.id, ...selectIds(view.textBoxes ?? []) };
  }
  if (kind === 'workspace') return workspaceStore.getWorkspace(projectId);
  if (['nodes', 'documents', 'flows'].includes(kind)) {
    const workspace = await workspaceStore.getWorkspace(projectId);
    return { projectId, revision: workspace.revision, kind, ...selectIds(workspace[kind]) };
  }
  if (kind === 'history') {
    return { projectId, revisions: await store.getHistory(projectId, { limit }) };
  }
  throw new BridgeValidationError(`Unsupported inspect kind: ${kind}`);
}

async function openEventStream(request, response, store, workspaceStore, projectId) {
  const [state, workspace] = await Promise.all([
    store.getState(projectId),
    workspaceStore.getWorkspace(projectId).catch(() => null),
  ]);
  response.setHeader('content-type', 'text/event-stream; charset=utf-8');
  response.setHeader('connection', 'keep-alive');
  response.setHeader('x-accel-buffering', 'no');
  response.statusCode = 200;
  response.flushHeaders?.();
  const send = (event, payload) => {
    response.write(`event: ${event}\n`);
    response.write(`data: ${JSON.stringify(payload)}\n\n`);
  };
  send('ready', {
    projectId,
    modelRevision: state.revision,
    workspaceRevision: workspace?.revision ?? null,
  });
  const unsubscribeModel = store.subscribe(projectId, (event) => send('model', event));
  const unsubscribeWorkspace = workspaceStore.subscribe(projectId, (event) => send('workspace', event));
  const keepalive = setInterval(() => response.write(': keepalive\n\n'), 20_000);
  const close = () => {
    clearInterval(keepalive);
    unsubscribeModel();
    unsubscribeWorkspace();
    if (!response.writableEnded) response.end();
  };
  request.once('close', close);
  request.once('aborted', close);
}

function parseRequiredRevision(value, name) {
  const revision = Number.parseInt(value ?? '', 10);
  if (!Number.isInteger(revision) || revision < 1) {
    throw new BridgeValidationError(`${name} must be a positive revision number`);
  }
  return revision;
}

async function readJsonBody(request) {
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > 10 * 1024 * 1024) throw new BridgeValidationError('Request body exceeds 10 MB');
    chunks.push(chunk);
  }
  if (chunks.length === 0) throw new BridgeValidationError('JSON request body is required');
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new BridgeValidationError('Request body is not valid JSON');
  }
}

function sendJson(response, statusCode, payload) {
  if (!response.hasHeader('content-type')) {
    response.setHeader('content-type', 'application/json; charset=utf-8');
  }
  response.statusCode = statusCode;
  response.end(payload === null ? '' : `${JSON.stringify(payload)}\n`);
}
