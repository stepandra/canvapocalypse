import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  BridgeConflictError,
  applyIsoflowPatch,
  getIsoflowView,
  searchIsoflow,
} from '../scripts/lib/isoflow-bridge.mjs';
import { createIsoflowBridgeStore } from '../scripts/lib/isoflow-bridge-store.mjs';

function makeState() {
  return {
    projectId: 'demo',
    revision: 7,
    model: {
      version: '1.1',
      title: 'Demo',
      description: '',
      icons: [
        { id: 'server', name: 'Server', url: '/isoflow-icons/server.svg' },
        { id: 'db', name: 'Database', url: '/isoflow-icons/database.svg' },
      ],
      colors: [{ id: 'blue', value: '#a5b8f3' }],
      legend: [{ id: 'owned', label: 'Owned', colorId: 'blue' }],
      items: [
        { id: 'api', name: 'API', icon: 'server' },
        { id: 'postgres', name: 'Postgres', icon: 'db' },
      ],
      views: [
        {
          id: 'current',
          name: 'Current',
          items: [
            { id: 'api', tile: { x: 0, y: 0 }, labelHeight: 120 },
            { id: 'postgres', tile: { x: 4, y: 0 }, labelHeight: 120 },
          ],
          connectors: [],
          rectangles: [],
          textBoxes: [],
        },
        {
          id: 'future',
          name: 'Future',
          items: [{ id: 'api', tile: { x: 2, y: 2 }, labelHeight: 120 }],
          connectors: [],
          rectangles: [],
          textBoxes: [],
        },
      ],
      view: 'current',
      fitToView: true,
    },
  };
}

test('applies a revision-guarded semantic patch without mutating the prior state', () => {
  const before = makeState();
  const after = applyIsoflowPatch(before, {
    baseRevision: 7,
    actor: 'amp:test',
    operations: [
      { op: 'move_item', viewId: 'current', itemId: 'api', tile: { x: 8, y: 3 } },
      { op: 'rename_item', itemId: 'api', name: 'Public API' },
      { op: 'set_view', viewId: 'future' },
    ],
  });

  assert.equal(after.revision, 8);
  assert.equal(after.model.view, 'future');
  assert.equal(after.model.items.find((item) => item.id === 'api').name, 'Public API');
  assert.deepEqual(
    after.model.views[0].items.find((item) => item.id === 'api').tile,
    { x: 8, y: 3 },
  );
  assert.deepEqual(before.model.views[0].items[0].tile, { x: 0, y: 0 });
  assert.match(after.summary, /3 operations/);
});

test('rejects a stale patch revision', () => {
  assert.throws(
    () => applyIsoflowPatch(makeState(), {
      baseRevision: 6,
      operations: [{ op: 'rename_item', itemId: 'api', name: 'Stale' }],
    }),
    (error) => error instanceof BridgeConflictError && error.currentRevision === 7,
  );
});

test('adds, connects, and removes items while preserving referential integrity', () => {
  const added = applyIsoflowPatch(makeState(), {
    baseRevision: 7,
    operations: [
      {
        op: 'add_item',
        viewId: 'current',
        item: { id: 'worker', name: 'Worker', icon: 'server', tile: { x: 8, y: 0 } },
      },
      {
        op: 'connect',
        viewId: 'current',
        connectorId: 'api-worker',
        from: 'api',
        to: 'worker',
      },
    ],
  });
  const view = added.model.views.find((candidate) => candidate.id === 'current');
  assert.ok(added.model.items.some((item) => item.id === 'worker'));
  assert.ok(view.items.some((item) => item.id === 'worker'));
  assert.deepEqual(
    view.connectors[0].anchors.map((anchor) => anchor.ref.item),
    ['api', 'worker'],
  );

  const removed = applyIsoflowPatch(added, {
    baseRevision: 8,
    operations: [{ op: 'remove_item', itemId: 'worker' }],
  });
  assert.ok(!removed.model.items.some((item) => item.id === 'worker'));
  assert.equal(removed.model.views[0].connectors.length, 0);
});

test('returns compact view data and searches items and icons', () => {
  const state = makeState();
  const view = getIsoflowView(state, 'current');
  assert.equal(view.revision, 7);
  assert.equal(view.view.id, 'current');
  assert.equal(view.items[0].name, 'API');
  assert.equal(view.items[0].tile.x, 0);
  assert.deepEqual(view.legend, [{ id: 'owned', label: 'Owned', colorId: 'blue' }]);

  assert.deepEqual(
    searchIsoflow(state, { query: 'post', kind: 'items' }).results.map((result) => result.id),
    ['postgres'],
  );
  assert.deepEqual(
    searchIsoflow(state, { query: 'server', kind: 'icons' }).results.map((result) => result.id),
    ['server'],
  );
});

test('updates contours, legend, connectors, and views in one atomic transaction', () => {
  const after = applyIsoflowPatch(makeState(), {
    baseRevision: 7,
    operations: [
      { op: 'update_color', colorId: 'blue', value: '#112233' },
      {
        op: 'replace_legend',
        legend: [{ id: 'controlled', label: 'Controlled', colorId: 'blue' }],
      },
      {
        op: 'add_rectangle',
        viewId: 'current',
        rectangle: {
          id: 'boundary',
          from: { x: -1, y: -1 },
          to: { x: 5, y: 1 },
          color: 'blue',
        },
      },
      { op: 'duplicate_view', viewId: 'current', newViewId: 'review', name: 'Review' },
    ],
  });

  assert.equal(after.revision, 8);
  assert.equal(after.model.colors[0].value, '#112233');
  assert.equal(after.model.legend[0].label, 'Controlled');
  assert.equal(after.model.views.find((view) => view.id === 'current').rectangles[0].id, 'boundary');
  assert.equal(after.model.view, 'review');
});

test('persists bridge revisions and reloads them from disk', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'isoflow-bridge-'));
  try {
    const store = createIsoflowBridgeStore({
      stateDir: directory,
      loadInitialModel: async () => makeState().model,
    });
    const initial = await store.getState('demo');
    assert.equal(initial.revision, 1);
    assert.equal(initial.origin, 'source');

    const updated = await store.applyPatch('demo', {
      baseRevision: 1,
      actor: 'amp:test',
      operations: [{ op: 'rename_item', itemId: 'api', name: 'Bridge API' }],
    });
    assert.equal(updated.revision, 2);

    const reloaded = createIsoflowBridgeStore({
      stateDir: directory,
      loadInitialModel: async () => {
        throw new Error('persisted state should be reused');
      },
    });
    assert.equal((await reloaded.getState('demo')).model.items[0].name, 'Bridge API');
    const persisted = JSON.parse(await readFile(join(directory, 'demo.json'), 'utf8'));
    assert.equal(persisted.revision, 2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('keeps bounded history, supports idempotent replay, diff, revert, and events', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'isoflow-bridge-history-'));
  try {
    const store = createIsoflowBridgeStore({
      stateDir: directory,
      loadInitialModel: async () => makeState().model,
    });
    const events = [];
    const unsubscribe = store.subscribe('demo', (event) => events.push(event));
    const updated = await store.transact('demo', {
      baseRevision: 1,
      actor: 'amp:test',
      idempotencyKey: 'rename-api',
      operations: [{ op: 'rename_item', itemId: 'api', name: 'Bridge API' }],
    });
    const replay = await store.transact('demo', {
      baseRevision: 1,
      actor: 'amp:test',
      idempotencyKey: 'rename-api',
      operations: [{ op: 'rename_item', itemId: 'api', name: 'Ignored replay' }],
    });
    assert.equal(replay.idempotentReplay, true);
    assert.equal(replay.revision, updated.revision);
    assert.equal(events.length, 1);

    const history = await store.getHistory('demo');
    assert.deepEqual(history.map((entry) => entry.revision), [2, 1]);
    const diff = await store.diffRevisions('demo', 1, 2);
    assert.deepEqual(diff.items.changed, ['api']);

    const reverted = await store.revert('demo', {
      baseRevision: 2,
      targetRevision: 1,
      actor: 'amp:test',
    });
    assert.equal(reverted.revision, 3);
    assert.equal(reverted.model.items[0].name, 'API');
    unsubscribe();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
