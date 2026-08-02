import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import {
  applyIsoflowPatch,
  replaceIsoflowModel,
  validateIsoflowModel,
} from './isoflow-bridge.mjs';

export function createIsoflowBridgeStore({ stateDir, loadInitialModel }) {
  if (typeof stateDir !== 'string' || stateDir.length === 0) {
    throw new Error('stateDir is required');
  }
  if (typeof loadInitialModel !== 'function') {
    throw new Error('loadInitialModel must be a function');
  }
  const cache = new Map();
  const queues = new Map();
  const listeners = new Map();
  const historyCache = new Map();

  const statePath = (projectId) => join(stateDir, `${validateProjectId(projectId)}.json`);
  const historyPath = (projectId) => join(stateDir, `${validateProjectId(projectId)}.history.json`);

  async function loadState(projectId) {
    const id = validateProjectId(projectId);
    if (cache.has(id)) return structuredClone(cache.get(id));
    await mkdir(stateDir, { recursive: true });
    let state;
    try {
      state = JSON.parse(await readFile(statePath(id), 'utf8'));
      validateIsoflowModel(state.model);
      if (!Number.isInteger(state.revision) || state.revision < 1) {
        throw new Error(`Invalid persisted revision for ${id}`);
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      const model = await loadInitialModel(id);
      validateIsoflowModel(model);
      state = {
        projectId: id,
        revision: 1,
        model: structuredClone(model),
        origin: 'source',
        updatedAt: new Date().toISOString(),
        updatedBy: 'source',
        summary: 'Initialized from project source',
      };
      await persistState(state);
    }
    cache.set(id, state);
    await ensureHistory(id, state);
    return structuredClone(state);
  }

  async function persistState(state) {
    await mkdir(stateDir, { recursive: true });
    const target = statePath(state.projectId);
    const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    await rename(temporary, target);
  }

  async function loadHistory(projectId) {
    const id = validateProjectId(projectId);
    if (historyCache.has(id)) return historyCache.get(id);
    let history;
    try {
      history = JSON.parse(await readFile(historyPath(id), 'utf8'));
      if (!Array.isArray(history)) throw new Error(`Invalid history for ${id}`);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      history = [];
    }
    historyCache.set(id, history);
    return history;
  }

  async function persistHistory(projectId, history) {
    const id = validateProjectId(projectId);
    const target = historyPath(id);
    const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(history, null, 2)}\n`, 'utf8');
    await rename(temporary, target);
  }

  async function ensureHistory(projectId, state) {
    const history = await loadHistory(projectId);
    if (history.some((entry) => entry.revision === state.revision)) return;
    history.push(structuredClone(state));
    history.sort((a, b) => a.revision - b.revision);
    while (history.length > 100) history.shift();
    await persistHistory(projectId, history);
  }

  function emit(projectId, state) {
    const event = {
      scope: 'model',
      projectId,
      revision: state.revision,
      updatedAt: state.updatedAt,
      updatedBy: state.updatedBy,
      summary: state.summary,
      transactionId: state.transactionId,
    };
    for (const listener of listeners.get(projectId) ?? []) listener(structuredClone(event));
  }

  function mutate(projectId, mutation) {
    const id = validateProjectId(projectId);
    const previous = queues.get(id) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(async () => {
      const current = await loadState(id);
      const updated = await mutation(current);
      await persistState(updated);
      cache.set(id, updated);
      await ensureHistory(id, updated);
      emit(id, updated);
      return structuredClone(updated);
    });
    queues.set(id, next);
    return next.finally(() => {
      if (queues.get(id) === next) queues.delete(id);
    });
  }

  async function getRevision(projectId, revision) {
    await loadState(projectId);
    const history = await loadHistory(projectId);
    const state = history.find((entry) => entry.revision === revision);
    if (!state) throw historyError(`Revision does not exist: ${revision}`, 404);
    return structuredClone(state);
  }

  async function transact(projectId, request) {
    const id = validateProjectId(projectId);
    const transactionId = request.transactionId ?? randomUUID();
    const idempotencyKey = validateIdempotencyKey(request.idempotencyKey);
    if (idempotencyKey) {
      const history = await loadHistory(id);
      const existing = [...history].reverse().find((entry) => entry.idempotencyKey === idempotencyKey);
      if (existing) return { ...structuredClone(existing), idempotentReplay: true };
    }
    const prepared = { ...request, transactionId, ...(idempotencyKey ? { idempotencyKey } : {}) };
    if (request.dryRun) {
      return { ...applyIsoflowPatch(await loadState(id), prepared), dryRun: true };
    }
    return mutate(id, (state) => applyIsoflowPatch(state, prepared));
  }

  return {
    getState: loadState,
    applyPatch(projectId, request) {
      return transact(projectId, request);
    },
    replaceModel(projectId, request) {
      return mutate(projectId, (state) => replaceIsoflowModel(state, {
        ...request,
        transactionId: request.transactionId ?? randomUUID(),
      }));
    },
    async previewPatch(projectId, request) {
      return applyIsoflowPatch(await loadState(projectId), request);
    },
    transact,
    async getHistory(projectId, { limit = 30 } = {}) {
      await loadState(projectId);
      const history = await loadHistory(projectId);
      return history
        .slice(-Math.min(100, Math.max(1, limit)))
        .reverse()
        .map(summarizeState);
    },
    getRevision,
    async diffRevisions(projectId, fromRevision, toRevision) {
      const from = await getRevision(projectId, fromRevision);
      const to = await getRevision(projectId, toRevision);
      return diffStates(from, to);
    },
    async revert(projectId, request) {
      const target = await getRevision(projectId, request.targetRevision);
      return mutate(projectId, (current) => {
        if (request.baseRevision !== current.revision) {
          const error = historyError(
            `Isoflow revision conflict: expected ${request.baseRevision}, current ${current.revision}`,
            409,
          );
          error.currentRevision = current.revision;
          throw error;
        }
        return {
          ...current,
          revision: current.revision + 1,
          model: structuredClone(target.model),
          origin: 'history',
          updatedAt: new Date().toISOString(),
          updatedBy: request.actor || 'isoflow-ui:history',
          summary: `Reverted model to revision ${target.revision}`,
          transactionId: request.transactionId ?? randomUUID(),
          ...(request.idempotencyKey ? { idempotencyKey: request.idempotencyKey } : {}),
        };
      });
    },
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

function summarizeState(state) {
  return {
    projectId: state.projectId,
    revision: state.revision,
    origin: state.origin,
    updatedAt: state.updatedAt,
    updatedBy: state.updatedBy,
    summary: state.summary,
    transactionId: state.transactionId,
    idempotencyKey: state.idempotencyKey,
  };
}

function diffStates(from, to) {
  const compare = (before, after) => {
    const beforeMap = new Map(before.map((value) => [value.id, value]));
    const afterMap = new Map(after.map((value) => [value.id, value]));
    return {
      added: [...afterMap.keys()].filter((id) => !beforeMap.has(id)),
      removed: [...beforeMap.keys()].filter((id) => !afterMap.has(id)),
      changed: [...afterMap.keys()].filter(
        (id) => beforeMap.has(id) && JSON.stringify(beforeMap.get(id)) !== JSON.stringify(afterMap.get(id)),
      ),
    };
  };
  return {
    projectId: to.projectId,
    fromRevision: from.revision,
    toRevision: to.revision,
    items: compare(from.model.items, to.model.items),
    views: compare(from.model.views, to.model.views),
    colors: compare(from.model.colors ?? [], to.model.colors ?? []),
    legend: compare(from.model.legend ?? [], to.model.legend ?? []),
  };
}

function validateIdempotencyKey(value) {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || value.length > 160) {
    throw historyError('idempotencyKey must be a string no longer than 160 characters');
  }
  return value;
}

function historyError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function validateProjectId(value) {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,79}$/i.test(value)) {
    throw new Error(`Invalid Isoflow project ID: ${value}`);
  }
  return value;
}
