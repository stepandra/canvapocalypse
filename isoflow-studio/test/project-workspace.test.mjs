import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createProjectWorkspaceStore,
  WorkspaceConflictError,
  WorkspaceValidationError,
} from '../scripts/lib/project-workspace.mjs';

function workspace(projectRoot) {
  return {
    schemaVersion: 1,
    projectId: 'demo',
    revision: 1,
    projectRoot,
    nodes: [{
      id: 'node-1',
      itemId: 'api',
      name: 'API host',
      type: 'vps',
      provider: 'Example',
      location: 'eu-west',
      specs: { ip: '10.0.0.2', cpu: '4 vCPU', ram: '8 GB', storage: '80 GB', network: '1 Gbps' },
      documentIds: ['overview'],
      tags: ['production'],
    }],
    documents: [{ id: 'overview', title: 'Overview', path: 'docs/overview.md' }],
    flows: [{ id: 'request', name: 'Request', steps: [{ itemId: 'api', name: 'API' }] }],
  };
}

test('persists workspace revisions and reads declared Markdown documents', async () => {
  const root = await mkdtemp(join(tmpdir(), 'isoflow-workspace-'));
  const projectRoot = join(root, 'project');
  const workspaceDir = join(root, 'workspaces');
  try {
    await mkdir(join(projectRoot, 'docs'), { recursive: true });
    await writeFile(join(projectRoot, 'docs/overview.md'), '# Real file\n', 'utf8');
    await mkdir(workspaceDir, { recursive: true });
    await writeFile(join(workspaceDir, 'demo.json'), JSON.stringify(workspace(projectRoot)), 'utf8');
    const store = createProjectWorkspaceStore({ workspaceDir });
    const initial = await store.getWorkspace('demo');
    const updated = await store.replaceWorkspace('demo', {
      baseRevision: 1,
      workspace: {
        ...initial,
        nodes: [{
          ...initial.nodes[0],
          specs: { ...initial.nodes[0].specs, ram: '16 GB' },
        }],
      },
      actor: 'test',
    });
    assert.equal(updated.revision, 2);
    assert.equal(updated.updatedBy, 'test');
    assert.equal(updated.nodes[0].specs.ram, '16 GB');
    const document = await store.getDocument('demo', 'overview');
    assert.equal(document.content, '# Real file\n');
    assert.equal(document.absolutePath, join(projectRoot, 'docs/overview.md'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects stale revisions and document traversal', async () => {
  const root = await mkdtemp(join(tmpdir(), 'isoflow-workspace-'));
  const workspaceDir = join(root, 'workspaces');
  try {
    await mkdir(workspaceDir, { recursive: true });
    const invalid = workspace(join(root, 'project'));
    invalid.documents[0].path = '../secret.md';
    await writeFile(join(workspaceDir, 'demo.json'), JSON.stringify(invalid), 'utf8');
    const store = createProjectWorkspaceStore({ workspaceDir });
    await assert.rejects(
      () => store.replaceWorkspace('demo', { baseRevision: 0, workspace: invalid }),
      WorkspaceConflictError,
    );
    await assert.rejects(() => store.getDocument('demo', 'overview'), WorkspaceValidationError);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('applies revision-guarded workspace document and flow transactions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'isoflow-workspace-transact-'));
  const workspaceDir = join(root, 'workspaces');
  try {
    await mkdir(workspaceDir, { recursive: true });
    await writeFile(join(workspaceDir, 'demo.json'), JSON.stringify(workspace(join(root, 'project'))), 'utf8');
    const store = createProjectWorkspaceStore({ workspaceDir });
    const events = [];
    const unsubscribe = store.subscribe('demo', (event) => events.push(event));
    const preview = await store.transact('demo', {
      baseRevision: 1,
      dryRun: true,
      operations: [{
        op: 'add_document',
        document: { id: 'runbook', title: 'Runbook', path: 'docs/runbook.md' },
      }],
    });
    assert.equal(preview.dryRun, true);
    assert.equal((await store.getWorkspace('demo')).revision, 1);

    const updated = await store.transact('demo', {
      baseRevision: 1,
      actor: 'amp:test',
      operations: [
        {
          op: 'add_document',
          document: { id: 'runbook', title: 'Runbook', path: 'docs/runbook.md' },
        },
        { op: 'link_document', nodeId: 'node-1', documentId: 'runbook' },
        { op: 'update_flow', flowId: 'request', patch: { name: 'Request path' } },
      ],
    });
    assert.equal(updated.revision, 2);
    assert.deepEqual(updated.nodes[0].documentIds, ['overview', 'runbook']);
    assert.equal(updated.flows[0].name, 'Request path');
    assert.equal(events.length, 1);
    unsubscribe();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
