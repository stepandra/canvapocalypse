import React, { useMemo, useState } from 'react';
import { marked } from 'marked';

const TOOLS = [
  { id: 'map', icon: 'map', label: 'Map' },
  { id: 'nodes', icon: 'nodes', label: 'Infrastructure' },
  { id: 'contours', icon: 'contours', label: 'Contours' },
  { id: 'documents', icon: 'documents', label: 'Documents' },
  { id: 'flows', icon: 'flows', label: 'Flows' },
];

export function WorkspaceNavigation({ activeTool, onSelect, counts }) {
  return (
    <nav className="plugin-rail" aria-label="Project tools">
      <div className="plugin-mark" aria-label="Local Isoflow">
        <IsoflowGlyph />
      </div>
      <div className="plugin-rail-separator" aria-hidden="true" />
      {TOOLS.map((tool) => (
        <button
          key={tool.id}
          type="button"
          className={activeTool === tool.id ? 'plugin-tool active' : 'plugin-tool'}
          onClick={() => onSelect(tool.id)}
          aria-label={tool.label}
          aria-pressed={activeTool === tool.id}
          title={tool.label}
        >
          <ToolGlyph name={tool.icon} />
          {counts?.[tool.id] > 0 && <small>{counts[tool.id]}</small>}
        </button>
      ))}
      <div className="plugin-spacer" />
      <div className="plugin-local" title="Repo-backed workspace">
        <i aria-hidden="true" />
        <span>LOCAL</span>
      </div>
    </nav>
  );
}

function IsoflowGlyph() {
  return (
    <svg viewBox="0 0 28 28" aria-hidden="true">
      <path d="m5 8 9-5 9 5-9 5-9-5Z" />
      <path d="m5 14 9 5 9-5M5 20l9 5 9-5" />
    </svg>
  );
}

function ToolGlyph({ name }) {
  if (name === 'map') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m3.5 6.5 5-2.5 7 2.5 5-2.5v13.5l-5 2.5-7-2.5-5 2.5V6.5Z" />
        <path d="M8.5 4v13.5M15.5 6.5V20" />
      </svg>
    );
  }
  if (name === 'nodes') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3.5" y="4" width="6" height="5.5" rx="1.2" />
        <rect x="14.5" y="4" width="6" height="5.5" rx="1.2" />
        <rect x="9" y="15" width="6" height="5.5" rx="1.2" />
        <path d="M6.5 9.5v2.25H12V15m5.5-5.5v2.25H12" />
      </svg>
    );
  }
  if (name === 'contours') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 7.5 8 5l4 2.5L8 10 4 7.5Z" />
        <path d="m12 12 4-2.5 4 2.5-4 2.5L12 12Z" />
        <path d="m5 16.5 4-2.5 4 2.5L9 19l-4-2.5Z" />
      </svg>
    );
  }
  if (name === 'documents') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 3.5h8l4 4V20.5H6V3.5Z" />
        <path d="M14 3.5v4h4M9 12h6M9 15.5h6" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="5" cy="12" r="2" />
      <circle cx="19" cy="6" r="2" />
      <circle cx="19" cy="18" r="2" />
      <path d="M7 12h3.5a3 3 0 0 0 3-3V8a2 2 0 0 1 2-2H17M10.5 12a3 3 0 0 1 3 3v1a2 2 0 0 0 2 2H17" />
    </svg>
  );
}

export function WorkspaceDrawer({
  activeTool,
  workspace,
  model,
  modelItems,
  selectedItemId,
  selectedNodeId,
  selectedFlowId,
  documentState,
  workspaceStatus,
  onClose,
  onChange,
  onSave,
  onSaveLegend,
  onSelectNode,
  onSelectFlow,
  onOpenDocument,
}) {
  if (activeTool === 'map') return null;
  const isContours = activeTool === 'contours';
  return (
    <aside className="workspace-drawer">
      <header className="drawer-head">
        <div>
          <span className="drawer-kicker">PROJECT MODULE</span>
          <strong>{TOOLS.find((tool) => tool.id === activeTool)?.label}</strong>
        </div>
        <button className="icon-button" onClick={onClose} aria-label="Close panel">×</button>
      </header>
      {!workspace && !isContours ? (
        <div className="drawer-empty">Loading repo-backed workspace…</div>
      ) : (
        <>
          <div className="drawer-body">
            {isContours && (
              <ContoursPanel model={model} onSave={onSaveLegend} />
            )}
            {activeTool === 'nodes' && (
              <InfrastructurePanel
                workspace={workspace}
                modelItems={modelItems}
                selectedItemId={selectedItemId}
                selectedNodeId={selectedNodeId}
                onChange={onChange}
                onSelect={onSelectNode}
              />
            )}
            {activeTool === 'documents' && (
              <DocumentsPanel
                workspace={workspace}
                documentState={documentState}
                onOpen={onOpenDocument}
              />
            )}
            {activeTool === 'flows' && (
              <FlowsPanel
                workspace={workspace}
                selectedFlowId={selectedFlowId}
                onSelect={onSelectFlow}
              />
            )}
          </div>
          {!isContours && (
            <footer className="drawer-foot">
              <span className={`workspace-status ${workspaceStatus.toLowerCase().replaceAll(' ', '-')}`}>
                {workspaceStatus}
              </span>
              <button className="primary-action" onClick={onSave}>SAVE PROJECT DATA</button>
            </footer>
          )}
        </>
      )}
    </aside>
  );
}

function ContoursPanel({ model, onSave }) {
  const legend = useMemo(() => deriveLegend(model), [model]);
  const [draft, setDraft] = useState(() => legend);
  const [status, setStatus] = useState('BRIDGE-OWNED');

  React.useEffect(() => {
    setDraft(legend);
  }, [legend]);

  const update = (id, patch) => {
    setDraft((current) => current.map((entry) => entry.id === id ? { ...entry, ...patch } : entry));
    setStatus('UNSAVED CHANGES');
  };
  const move = (index, delta) => {
    const target = index + delta;
    if (target < 0 || target >= draft.length) return;
    const next = [...draft];
    [next[index], next[target]] = [next[target], next[index]];
    setDraft(next);
    setStatus('UNSAVED CHANGES');
  };
  const save = async () => {
    setStatus('SAVING');
    try {
      await onSave(draft);
      setStatus('SAVED TO BRIDGE');
    } catch {
      setStatus('SAVE ERROR');
    }
  };

  return (
    <section className="contour-editor">
      <div className="module-intro contour-intro">
        <div><strong>{draft.length}</strong><span>contour classes</span></div>
        <p>The legend is part of the Isoflow model: canvas contours, exports, embeds and agents read the same labels and colors.</p>
      </div>
      <div className="contour-list">
        {draft.map((entry, index) => (
          <div className="contour-row" key={entry.id}>
            <input
              className="contour-color"
              type="color"
              value={entry.value}
              onChange={(event) => update(entry.id, { value: event.target.value })}
              aria-label={`${entry.label} color`}
            />
            <label>
              <span>{entry.id}</span>
              <input
                value={entry.label}
                onChange={(event) => update(entry.id, { label: event.target.value })}
                aria-label={`${entry.id} label`}
              />
            </label>
            <div className="contour-order">
              <button disabled={index === 0} onClick={() => move(index, -1)} aria-label={`Move ${entry.label} up`}>↑</button>
              <button disabled={index === draft.length - 1} onClick={() => move(index, 1)} aria-label={`Move ${entry.label} down`}>↓</button>
            </div>
          </div>
        ))}
      </div>
      <footer className="contour-actions">
        <span className={`workspace-status ${status.toLowerCase().replaceAll(' ', '-')}`}>{status}</span>
        <button className="primary-action" onClick={save}>APPLY LEGEND</button>
      </footer>
    </section>
  );
}

export function deriveLegend(model) {
  const colors = new Map((model?.colors ?? []).map((color) => [color.id, color.value]));
  const fallbackLabels = {
    'trust-owned': 'OWNED',
    'trust-policy': 'POLICY / PROJECTION',
    'trust-management': 'PRIVATE MANAGEMENT',
    'trust-vendor': 'EXTERNAL INGRESS',
    'trust-exposed': 'CONTENT-EXPOSED',
    'trust-semitrusted': 'SEMI-TRUSTED HANDS',
    'trust-hostile': 'HOSTILE WEB',
  };
  const configured = model?.legend?.length
    ? model.legend
    : Object.entries(fallbackLabels)
      .filter(([colorId]) => colors.has(colorId))
      .map(([colorId, label]) => ({ id: colorId.replace('trust-', ''), label, colorId }));
  return configured.map((entry) => ({
    id: entry.id,
    label: entry.label,
    colorId: entry.colorId,
    value: colors.get(entry.colorId) ?? '#9aa5b1',
  }));
}

function InfrastructurePanel({
  workspace,
  modelItems,
  selectedItemId,
  selectedNodeId,
  onChange,
  onSelect,
}) {
  const [filter, setFilter] = useState('');
  const selected = workspace.nodes.find((node) => node.id === selectedNodeId)
    ?? workspace.nodes.find((node) => node.itemId === selectedItemId)
    ?? null;
  const filtered = workspace.nodes.filter((node) => {
    const haystack = `${node.name} ${node.type} ${node.provider} ${node.location} ${node.tags?.join(' ')}`.toLowerCase();
    return haystack.includes(filter.toLowerCase());
  });

  const addNode = () => {
    const id = `infra-${Date.now().toString(36)}`;
    const itemId = modelItems[0]?.id ?? '';
    const node = {
      id,
      itemId,
      name: 'New infrastructure node',
      type: 'vm',
      provider: 'TBD',
      location: 'TBD',
      specs: { ip: 'TBD', cpu: 'TBD', ram: 'TBD', storage: 'TBD', network: 'TBD' },
      documentIds: [],
      tags: [],
    };
    onChange({ ...workspace, nodes: [...workspace.nodes, node] });
    onSelect(node);
  };

  const updateNode = (patch) => {
    onChange({
      ...workspace,
      nodes: workspace.nodes.map((node) => node.id === selected.id ? { ...node, ...patch } : node),
    });
  };

  const updateSpec = (key, value) => {
    updateNode({ specs: { ...selected.specs, [key]: value } });
  };

  return (
    <>
      <div className="module-intro">
        <div><strong>{workspace.nodes.length}</strong><span>runtime nodes</span></div>
        <p>Repo-owned inventory joined to diagram components by stable item ID.</p>
      </div>
      <div className="module-actions">
        <input
          className="search-input"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Filter nodes…"
          aria-label="Filter infrastructure nodes"
        />
        <button onClick={addNode}>＋ NODE</button>
      </div>
      <div className="infra-list">
        {filtered.map((node) => (
          <button
            key={node.id}
            className={selected?.id === node.id ? 'infra-row active' : 'infra-row'}
            onClick={() => onSelect(node)}
          >
            <span className={`infra-type ${node.type}`}>{typeAbbreviation(node.type)}</span>
            <span><strong>{node.name}</strong><small>{node.provider} · {node.location}</small></span>
            <i className="dot green" />
          </button>
        ))}
      </div>
      {selected ? (
        <div className="entity-inspector">
          <div className="inspector-title">
            <span>NODE DETAILS</span>
            <code>{selected.id}</code>
          </div>
          <Field label="Name" value={selected.name} onChange={(value) => updateNode({ name: value })} />
          <div className="field-grid">
            <SelectField
              label="Type"
              value={selected.type}
              values={['bare-metal', 'vps', 'vm', 'container', 'managed', 'other']}
              onChange={(value) => updateNode({ type: value })}
            />
            <Field label="Provider" value={selected.provider} onChange={(value) => updateNode({ provider: value })} />
          </div>
          <Field label="Location" value={selected.location} onChange={(value) => updateNode({ location: value })} />
          <SelectField
            label="Isoflow item"
            value={selected.itemId}
            values={modelItems.map((item) => item.id)}
            labels={new Map(modelItems.map((item) => [item.id, `${item.name} · ${item.id}`]))}
            onChange={(value) => updateNode({ itemId: value })}
          />
          <div className="inspector-title subsection"><span>SPECIFICATIONS</span></div>
          <div className="field-grid">
            {Object.entries(selected.specs).map(([key, value]) => (
              <Field key={key} label={key} value={value} onChange={(next) => updateSpec(key, next)} />
            ))}
          </div>
          <Field
            label="Tags"
            value={(selected.tags ?? []).join(', ')}
            onChange={(value) => updateNode({ tags: value.split(',').map((tag) => tag.trim()).filter(Boolean) })}
          />
          <DocumentLinks workspace={workspace} node={selected} />
        </div>
      ) : (
        <div className="drawer-empty compact">Select a node on the map or in the inventory.</div>
      )}
    </>
  );
}

function DocumentsPanel({ workspace, documentState, onOpen }) {
  const html = useMemo(
    () => documentState.content ? marked.parse(documentState.content) : '',
    [documentState.content],
  );
  return (
    <>
      <div className="module-intro documents-intro">
        <div><strong>{workspace.documents.length}</strong><span>real files</span></div>
        <p>Markdown is read from the configured project root. No shadow CMS and no copied content.</p>
      </div>
      <div className="project-root">
        <span>PROJECT ROOT</span>
        <code>{workspace.projectRoot}</code>
      </div>
      <div className="document-list">
        {workspace.documents.map((document) => (
          <button
            key={document.id}
            className={documentState.id === document.id ? 'document-row active' : 'document-row'}
            onClick={() => onOpen(document.id)}
          >
            <span className="file-glyph">MD</span>
            <span>
              <strong>{document.title}</strong>
              <small>{document.path}</small>
            </span>
          </button>
        ))}
      </div>
      {documentState.loading && <div className="drawer-empty compact">Reading file…</div>}
      {documentState.error && <div className="document-error">{documentState.error}</div>}
      {documentState.content && (
        <section className="document-preview">
          <header>
            <span>LIVE FILE</span>
            <code>{documentState.absolutePath}</code>
          </header>
          <article dangerouslySetInnerHTML={{ __html: html }} />
        </section>
      )}
    </>
  );
}

function FlowsPanel({ workspace, selectedFlowId, onSelect }) {
  const selected = workspace.flows.find((flow) => flow.id === selectedFlowId) ?? workspace.flows[0];
  return (
    <>
      <div className="module-intro flow-intro">
        <div><strong>{workspace.flows.length}</strong><span>semantic flows</span></div>
        <p>Ordered steps bind to real diagram items. Choosing a flow lights its topology on the canvas.</p>
      </div>
      <div className="flow-tabs">
        {workspace.flows.map((flow) => (
          <button
            key={flow.id}
            className={flow.id === selected?.id ? 'active' : ''}
            onClick={() => onSelect(flow)}
          >
            <i style={{ background: flow.color }} />
            <span>{flow.name}</span>
            <small>{flow.steps.length}</small>
          </button>
        ))}
      </div>
      {selected && (
        <section className="flow-detail">
          <header>
            <span>ACTIVE FLOW</span>
            <strong>{selected.name}</strong>
            <p>{selected.description}</p>
          </header>
          <ol className="flow-steps">
            {selected.steps.map((step, index) => (
              <li key={`${step.itemId}:${index}`}>
                <span className="step-index">{String(index + 1).padStart(2, '0')}</span>
                <div>
                  <strong>{step.name}</strong>
                  <code>{step.itemId}</code>
                  {step.description && <p>{step.description}</p>}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  );
}

function DocumentLinks({ workspace, node }) {
  const documents = workspace.documents.filter((document) => node.documentIds?.includes(document.id));
  return (
    <div className="linked-documents">
      <span>LINKED DOCUMENTS</span>
      {documents.length
        ? documents.map((document) => <code key={document.id}>{document.path}</code>)
        : <small>No linked files</small>}
    </div>
  );
}

function Field({ label, value, onChange }) {
  return (
    <label className="data-field">
      <span>{label}</span>
      <input value={value ?? ''} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function SelectField({ label, value, values, labels, onChange }) {
  return (
    <label className="data-field">
      <span>{label}</span>
      <select value={value ?? ''} onChange={(event) => onChange(event.target.value)}>
        {values.map((option) => <option key={option} value={option}>{labels?.get(option) ?? option}</option>)}
      </select>
    </label>
  );
}

function typeAbbreviation(type) {
  return ({
    'bare-metal': 'BM',
    vps: 'VPS',
    vm: 'VM',
    container: 'CTR',
    managed: 'SVC',
    other: 'NODE',
  })[type] ?? 'NODE';
}
