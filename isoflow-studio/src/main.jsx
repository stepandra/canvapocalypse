import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import IsoflowPackage from 'isoflow';
import { convertProExport } from '../scripts/lib/pro-export.mjs';
import { deriveLegend, WorkspaceDrawer, WorkspaceNavigation } from './project-workspace.jsx';
import './styles.css';

const Isoflow = IsoflowPackage.default ?? IsoflowPackage.Isoflow ?? IsoflowPackage;

const SESSION_PROJECTS = {
  'autorecruit-ideal': {
    label: 'AUTORECRUIT / IDEAL',
    source: '/sessions/autorecruit-ideal.pro.json'
  },
  'eval-lab': {
    label: 'EVAL LAB / AS-IS → TO-BE',
    source: '/sessions/eval-lab.pro.json'
  },
  'autorecruit-contours': {
    label: 'CONTOURS / MUST',
    source: '/sessions/autorecruit-contours.pro.json'
  },
  'hub-rewrite': {
    label: 'HUB / REWRITE (RUST)',
    source: '/sessions/hub-rewrite.pro.json'
  }
};
const SESSION_MAIN_MENU_OPTIONS = ['EXPORT.JSON', 'EXPORT.PNG'];
const SESSION_RENDERER = { showGrid: true, backgroundColor: '#f7f8fa' };

function ProjectSession({ projectId, config }) {
  const query = new URLSearchParams(window.location.search);
  const isEmbed = query.get('embed') === '1';
  const requestedViewId = query.get('view');
  const [model, setModel] = useState(null);
  const [activeViewId, setActiveViewId] = useState(null);
  const [error, setError] = useState(null);
  const [renderKey, setRenderKey] = useState(0);
  const [saveStatus, setSaveStatus] = useState('LOADING');
  const [savedAt, setSavedAt] = useState(null);
  const [activeTool, setActiveTool] = useState('map');
  const [workspace, setWorkspace] = useState(null);
  const [workspaceDraft, setWorkspaceDraft] = useState(null);
  const [workspaceStatus, setWorkspaceStatus] = useState('LOADING');
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [selectedFlowId, setSelectedFlowId] = useState(null);
  const [focusItemIds, setFocusItemIds] = useState([]);
  const [isItemInspectorOpen, setItemInspectorOpen] = useState(false);
  const [documentState, setDocumentState] = useState({
    id: null,
    loading: false,
    content: '',
    absolutePath: '',
    error: null,
  });
  const editedModel = useRef(null);
  const canvasElement = useRef(null);
  const wheelDelta = useRef(0);
  const lastPersistedModel = useRef(null);
  const bridgeRevision = useRef(null);
  const bridgePersistTimer = useRef(null);
  const suppressBridgePersistUntil = useRef(0);
  const storageKey = `isoflow-studio-session:${projectId}`;

  const loadFresh = async ({ restoreSaved = true } = {}) => {
    const source = await fetch(config.source).then((response) => {
      if (!response.ok) throw new Error(`Export not found: ${config.source}`);
      return response.json();
    });
    const fresh = convertProExport(source);
    const saved = restoreSaved ? readCompatibleSessionModel(storageKey, fresh) : null;
    let nextModel = saved ?? fresh;
    try {
      let bridge = await fetchBridgeState(projectId);
      if (!restoreSaved) {
        bridge = await replaceBridgeModel(projectId, bridge.revision, fresh, 'isoflow-ui:reset');
      } else if (bridge.origin === 'source' && saved) {
        bridge = await replaceBridgeModel(projectId, bridge.revision, saved, 'isoflow-ui:restore');
      }
      bridgeRevision.current = bridge.revision;
      nextModel = bridge.model;
    } catch {
      bridgeRevision.current = null;
    }
    if (requestedViewId && nextModel.views.some((view) => view.id === requestedViewId)) {
      nextModel = { ...nextModel, view: requestedViewId, fitToView: true };
    }
    lastPersistedModel.current = JSON.stringify(nextModel);
    suppressBridgePersistUntil.current = Date.now() + 1500;
    editedModel.current = nextModel;
    setModel(nextModel);
    setActiveViewId(nextModel.view ?? nextModel.views[0].id);
    setSaveStatus(bridgeRevision.current ? `BRIDGE r${bridgeRevision.current}` : saved ? 'RESTORED DRAFT' : 'SOURCE LOADED');
    setSavedAt(null);
    setRenderKey((value) => value + 1);
  };

  const currentModel = () => {
    if (!model) return null;
    return { ...(editedModel.current ?? model), view: activeViewId ?? model.view };
  };

  const persistDraft = () => {
    const payload = currentModel();
    if (!payload) return;
    editedModel.current = payload;
    localStorage.setItem(storageKey, JSON.stringify(payload));
    scheduleBridgePersist(payload, 'isoflow-ui:save');
    setSaveStatus('SAVED');
    setSavedAt(new Date());
  };

  const downloadModel = () => {
    const payload = currentModel();
    if (!payload) return;
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${projectId}-edited-isoflow.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setSaveStatus('DOWNLOADED JSON');
    setSavedAt(new Date());
  };

  const resetSession = async () => {
    if (!window.confirm('Discard the saved draft and restore the source export?')) return;
    localStorage.removeItem(storageKey);
    editedModel.current = null;
    setError(null);
    await loadFresh({ restoreSaved: false });
  };

  const handleCmdWheel = (event) => {
    if (!event.metaKey && !event.ctrlKey) return;
    event.preventDefault();
    event.stopPropagation();
    wheelDelta.current += event.deltaY;
    if (Math.abs(wheelDelta.current) < 40) return;
    const label = wheelDelta.current < 0 ? 'Zoom in' : 'Zoom out';
    wheelDelta.current = 0;
    const button = [...(canvasElement.current?.querySelectorAll('button') ?? [])]
      .find((candidate) => candidate.getAttribute('aria-label') === label);
    button?.click();
  };

  const scheduleBridgePersist = useCallback((payload, actor = 'isoflow-ui:edit') => {
    if (bridgeRevision.current === null) return;
    window.clearTimeout(bridgePersistTimer.current);
    bridgePersistTimer.current = window.setTimeout(async () => {
      const baseRevision = bridgeRevision.current;
      try {
        const bridge = await replaceBridgeModel(projectId, baseRevision, payload, actor);
        bridgeRevision.current = bridge.revision;
        setSaveStatus(`BRIDGE r${bridge.revision}`);
        setSavedAt(new Date());
      } catch (bridgeError) {
        setSaveStatus(bridgeError.status === 409 ? 'BRIDGE CONFLICT' : 'BRIDGE OFFLINE');
      }
    }, 300);
  }, [projectId]);

  const handleModelUpdated = useCallback((updated) => {
    const currentExtensions = editedModel.current ?? model;
    const persisted = {
      ...updated,
      ...(currentExtensions?.legend ? { legend: structuredClone(currentExtensions.legend) } : {}),
      view: activeViewId ?? model?.view,
    };
    const serialized = JSON.stringify(persisted);
    if (serialized === lastPersistedModel.current) return;
    lastPersistedModel.current = serialized;
    editedModel.current = persisted;
    localStorage.setItem(storageKey, serialized);
    if (Date.now() >= suppressBridgePersistUntil.current) scheduleBridgePersist(persisted);
    setSaveStatus('AUTOSAVED');
    setSavedAt(new Date());
  }, [activeViewId, model?.view, scheduleBridgePersist, storageKey]);

  useEffect(() => {
    loadFresh().catch((nextError) => setError(nextError));
  }, [config.source, storageKey]);

  useEffect(() => {
    fetchProjectWorkspace(projectId)
      .then((nextWorkspace) => {
        setWorkspace(nextWorkspace);
        setWorkspaceDraft(nextWorkspace);
        setWorkspaceStatus(`REPO r${nextWorkspace.revision}`);
      })
      .catch((nextError) => {
        setWorkspaceStatus('WORKSPACE ERROR');
        setDocumentState((current) => ({ ...current, error: nextError.message }));
      });
  }, [projectId]);

  useEffect(() => {
    if (!model) return undefined;
    let cancelled = false;
    const poll = async () => {
      try {
        const bridge = await fetchBridgeState(projectId);
        if (cancelled || bridge.revision === bridgeRevision.current) return;
        const nextModel = requestedViewId && bridge.model.views.some((view) => view.id === requestedViewId)
          ? { ...bridge.model, view: requestedViewId, fitToView: true }
          : bridge.model;
        const serialized = JSON.stringify(nextModel);
        bridgeRevision.current = bridge.revision;
        lastPersistedModel.current = serialized;
        suppressBridgePersistUntil.current = Date.now() + 1500;
        editedModel.current = nextModel;
        localStorage.setItem(storageKey, serialized);
        setModel(nextModel);
        setActiveViewId(nextModel.view ?? nextModel.views[0].id);
        setSaveStatus(`AMP BRIDGE r${bridge.revision}`);
        setSavedAt(new Date());
        setRenderKey((value) => value + 1);
      } catch {
        // Keep the local editor usable while the bridge server is unavailable.
      }
    };
    const timer = window.setInterval(poll, 750);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.clearTimeout(bridgePersistTimer.current);
    };
  }, [Boolean(model), projectId, requestedViewId, storageKey]);

  useEffect(() => {
    const handleSaveKey = (event) => {
      if ((!event.metaKey && !event.ctrlKey) || event.key.toLowerCase() !== 's') return;
      event.preventDefault();
      if (event.shiftKey) downloadModel();
      else persistDraft();
    };
    window.addEventListener('keydown', handleSaveKey);
    return () => window.removeEventListener('keydown', handleSaveKey);
  }, [model, activeViewId, projectId]);

  useEffect(() => {
    const canvas = canvasElement.current;
    if (!canvas) return undefined;
    canvas.addEventListener('wheel', handleCmdWheel, { capture: true, passive: false });
    return () => canvas.removeEventListener('wheel', handleCmdWheel, { capture: true });
  }, [model, renderKey]);

  if (error) return <div className="loading error">SESSION ERROR: {error.message}</div>;
  if (!model) return <div className="loading">LOADING ISOFLOW SESSION…</div>;

  const connectorCount = model.views.reduce((total, view) => total + view.connectors.length, 0);
  const workspaceCounts = {
    nodes: workspaceDraft?.nodes.length ?? 0,
    contours: deriveLegend(model).length,
    documents: workspaceDraft?.documents.length ?? 0,
    flows: workspaceDraft?.flows.length ?? 0,
  };

  const saveWorkspace = async () => {
    if (!workspace || !workspaceDraft) return;
    setWorkspaceStatus('SAVING');
    try {
      const saved = await replaceProjectWorkspace(projectId, workspace.revision, workspaceDraft);
      setWorkspace(saved);
      setWorkspaceDraft(saved);
      setWorkspaceStatus(`REPO r${saved.revision}`);
    } catch (workspaceError) {
      setWorkspaceStatus(workspaceError.status === 409 ? 'REVISION CONFLICT' : 'SAVE ERROR');
    }
  };

  const changeWorkspace = (nextWorkspace) => {
    setWorkspaceDraft(nextWorkspace);
    setWorkspaceStatus('UNSAVED CHANGES');
  };

  const saveLegend = async (entries) => {
    const operations = [
      {
        op: 'replace_legend',
        legend: entries.map(({ id, label, colorId }) => ({ id, label: label.trim(), colorId })),
      },
      ...entries.map(({ colorId, value }) => ({ op: 'update_color', colorId, value })),
    ];
    const baseRevision = bridgeRevision.current;
    if (baseRevision === null) throw new Error('Isoflow bridge is offline');
    const result = await transactBridgeModel(projectId, {
      baseRevision,
      actor: 'isoflow-ui:contour-legend',
      idempotencyKey: `legend:${projectId}:${baseRevision}`,
      operations,
    });
    bridgeRevision.current = result.revision;
    const serialized = JSON.stringify(result.model);
    lastPersistedModel.current = serialized;
    editedModel.current = result.model;
    localStorage.setItem(storageKey, serialized);
    setModel(result.model);
    setSaveStatus(`BRIDGE r${result.revision}`);
    setSavedAt(new Date());
    setRenderKey((value) => value + 1);
  };

  const selectInfrastructureNode = (node) => {
    setSelectedNodeId(node.id);
    setSelectedFlowId(null);
    setFocusItemIds(node.itemId ? [node.itemId] : []);
    const linkedView = model.views.find((view) => view.items.some((item) => item.id === node.itemId));
    if (linkedView && linkedView.id !== activeViewId) selectView(linkedView.id);
  };

  const selectFlow = (flow) => {
    const flowItemIds = flow.steps.map((step) => step.itemId);
    setSelectedFlowId(flow.id);
    setSelectedNodeId(null);
    setFocusItemIds(flowItemIds);
    const rankedViews = model.views
      .map((view) => ({
        view,
        score: view.items.filter((item) => flowItemIds.includes(item.id)).length,
      }))
      .sort((a, b) => b.score - a.score);
    if (rankedViews[0]?.score > 0 && rankedViews[0].view.id !== activeViewId) {
      selectView(rankedViews[0].view.id);
    }
  };

  const openDocument = async (documentId) => {
    setDocumentState({
      id: documentId,
      loading: true,
      content: '',
      absolutePath: '',
      error: null,
    });
    try {
      const result = await fetchProjectDocument(projectId, documentId);
      setDocumentState({
        id: documentId,
        loading: false,
        content: result.content,
        absolutePath: result.absolutePath,
        error: null,
      });
    } catch (documentError) {
      setDocumentState({
        id: documentId,
        loading: false,
        content: '',
        absolutePath: '',
        error: documentError.message,
      });
    }
  };

  const selectView = (viewId) => {
    const nextModel = { ...(editedModel.current ?? model), view: viewId, fitToView: true };
    editedModel.current = nextModel;
    setModel(nextModel);
    setActiveViewId(viewId);
    localStorage.setItem(storageKey, JSON.stringify(nextModel));
    scheduleBridgePersist(nextModel, 'isoflow-ui:set-view');
    setRenderKey((value) => value + 1);
  };

  return (
    <div className={`session-shell${isEmbed ? ' embed-mode' : ''}`}>
      {!isEmbed && <header className="topbar session-topbar">
        <div>
          <div className="eyebrow">ISOFLOW PRO EXPORT / LOCAL EDITABLE SESSION</div>
          <h1>{model.title}</h1>
        </div>
        <nav className="session-nav" aria-label="Isoflow project sessions">
          {Object.entries(SESSION_PROJECTS).map(([id, project]) => (
            <a key={id} className={id === projectId ? 'active' : ''} href={`/?project=${id}`}>
              <span className="dot green" />{project.label}
            </a>
          ))}
        </nav>
        <div className="metrics">
          <Metric label="VIEWS" value={model.views.length} tone="blue" />
          <Metric label="ITEMS" value={model.items.length} tone="purple" />
          <Metric label="EDGES" value={connectorCount} tone="green" />
          <Metric label="INFRA" value={workspaceCounts.nodes} tone="amber" />
          <button className="save-button" onClick={persistDraft}>SAVE DRAFT <kbd>⌘S</kbd></button>
          <button onClick={downloadModel}>DOWNLOAD JSON <kbd>⇧⌘S</kbd></button>
          <button onClick={resetSession}>RESET SOURCE</button>
        </div>
      </header>}
      <div className="session-workspace">
        {!isEmbed && (
          <WorkspaceNavigation
            activeTool={activeTool}
            onSelect={(tool) => {
              setActiveTool(tool);
              if (tool === 'map') {
                setFocusItemIds([]);
                setSelectedFlowId(null);
              }
            }}
            counts={workspaceCounts}
          />
        )}
        {!isEmbed && (
          <WorkspaceDrawer
            activeTool={activeTool}
            workspace={workspaceDraft}
            model={model}
            modelItems={model.items}
            selectedItemId={selectedItemId}
            selectedNodeId={selectedNodeId}
            selectedFlowId={selectedFlowId}
            documentState={documentState}
            workspaceStatus={workspaceStatus}
            onClose={() => {
              setActiveTool('map');
              setFocusItemIds([]);
            }}
            onChange={changeWorkspace}
            onSave={saveWorkspace}
            onSaveLegend={saveLegend}
            onSelectNode={selectInfrastructureNode}
            onSelectFlow={selectFlow}
            onOpenDocument={openDocument}
          />
        )}
        <main
          ref={canvasElement}
          className={`session-canvas${isItemInspectorOpen ? ' item-inspector-open' : ''}`}
        >
          <label className="session-view-picker">
            <span>VIEW</span>
            <select value={activeViewId ?? model.view} onChange={(event) => selectView(event.target.value)}>
              {model.views.map((view) => <option key={view.id} value={view.id}>{view.name}</option>)}
            </select>
          </label>
          {!isEmbed && deriveLegend(model).length > 0 && (
            <ContourLegend
              model={model}
              onEdit={() => setActiveTool('contours')}
            />
          )}
          <Isoflow
            key={`${projectId}:${renderKey}`}
            initialData={model}
            editorMode="EDITABLE"
            mainMenuOptions={SESSION_MAIN_MENU_OPTIONS}
            renderer={SESSION_RENDERER}
            onModelUpdated={handleModelUpdated}
            focusItemIds={focusItemIds}
            onItemSelected={(item) => {
              setItemInspectorOpen(Boolean(item));
              const itemId = item?.type === 'ITEM' ? item.id : null;
              setSelectedItemId(itemId);
              if (!itemId) return;
              const infrastructureNode = workspaceDraft?.nodes.find((node) => node.itemId === itemId);
              if (infrastructureNode) setSelectedNodeId(infrastructureNode.id);
            }}
          />
        </main>
      </div>
      {!isEmbed && <footer className="session-foot">
        <span><i className="dot green" /> {saveStatus}{savedAt ? ` ${savedAt.toLocaleTimeString()}` : ''}</span>
        <span><kbd>⌘</kbd> + WHEEL ZOOM · <kbd>⌘S</kbd> SAVE · <kbd>⇧⌘S</kbd> DOWNLOAD</span>
        <span>STORAGE: {storageKey}</span>
      </footer>}
    </div>
  );
}

async function fetchBridgeState(projectId) {
  return bridgeRequest(`/api/isoflow/projects/${encodeURIComponent(projectId)}/state`);
}

async function replaceBridgeModel(projectId, baseRevision, model, actor) {
  return bridgeRequest(`/api/isoflow/projects/${encodeURIComponent(projectId)}/model`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ baseRevision, model, actor })
  });
}

async function transactBridgeModel(projectId, request) {
  return bridgeRequest(`/api/isoflow/projects/${encodeURIComponent(projectId)}/transact`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
  });
}

async function fetchProjectWorkspace(projectId) {
  return bridgeRequest(`/api/isoflow/projects/${encodeURIComponent(projectId)}/workspace`);
}

async function replaceProjectWorkspace(projectId, baseRevision, workspace) {
  return bridgeRequest(`/api/isoflow/projects/${encodeURIComponent(projectId)}/workspace`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ baseRevision, workspace, actor: 'isoflow-ui:workspace' }),
  });
}

async function fetchProjectDocument(projectId, documentId) {
  return bridgeRequest(
    `/api/isoflow/projects/${encodeURIComponent(projectId)}/workspace/documents/${encodeURIComponent(documentId)}`,
  );
}

async function bridgeRequest(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(payload.error ?? `Bridge request failed with ${response.status}`);
    error.status = response.status;
    error.currentRevision = payload.currentRevision;
    throw error;
  }
  return payload;
}

function readCompatibleSessionModel(storageKey, generated) {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (!saved) return null;
    const signature = (candidate) => candidate.views
      .flatMap((view) => view.items.map((item) => `${view.id}:${item.id}`))
      .sort()
      .join('|');
    if (signature(saved) !== signature(generated)) return null;

    const normalized = structuredClone(saved);
    const generatedViews = new Map(generated.views.map((view) => [view.id, view]));
    for (const view of normalized.views) {
      const generatedView = generatedViews.get(view.id);
      const generatedItems = new Map((generatedView?.items ?? []).map((item) => [item.id, item]));
      const generatedText = new Map((generatedView?.textBoxes ?? []).map((textBox) => [textBox.id, textBox]));
      view.items = view.items.map((item) => ({
        ...item,
        labelHeight: Math.max(item.labelHeight ?? 80, 120),
        ...(view.id === 'vi_must_deployment' && item.id === 'md_macbox'
          ? { tile: { ...generatedItems.get(item.id).tile } }
          : {})
      }));
      view.textBoxes = (view.textBoxes ?? []).map((textBox) => {
        const sourceText = generatedText.get(textBox.id);
        return {
          ...textBox,
          fontSize: sourceText?.fontSize ?? Math.min(textBox.fontSize ?? 0.16, 0.2),
          orientation: sourceText?.orientation ?? textBox.orientation ?? 'X'
        };
      });
      if (view.id === 'vi_must_deployment' && generatedView) {
        view.rectangles = structuredClone(generatedView.rectangles);
      }
    }
    return {
      ...normalized,
      icons: structuredClone(generated.icons),
      fitToView: true
    };
  } catch {
    return null;
  }
}

function Metric({ label, value, tone }) {
  return <div className="metric"><span className={`dot ${tone}`} /><small>{label}</small><strong>{value}</strong></div>;
}

function ContourLegend({ model, onEdit }) {
  const entries = deriveLegend(model);
  return (
    <aside className="trust-legend" aria-label="Contour exposure legend">
      <header>
        <strong>CONTOUR LEGEND</strong>
        <button type="button" onClick={onEdit}>EDIT</button>
      </header>
      {entries.map((entry) => (
        <span key={entry.id}>
          <i className="swatch" style={{ background: entry.value }} />
          {entry.label}
        </span>
      ))}
    </aside>
  );
}

const requestedProjectId = new URLSearchParams(window.location.search).get('project');
const projectId = SESSION_PROJECTS[requestedProjectId] ? requestedProjectId : 'autorecruit-contours';
const sessionConfig = SESSION_PROJECTS[projectId];

createRoot(document.getElementById('root')).render(
  <ProjectSession projectId={projectId} config={sessionConfig} />
);
