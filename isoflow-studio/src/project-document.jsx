import React, { useEffect, useMemo, useRef, useState } from 'react';
import IsoflowPackage from 'isoflow';

const Isoflow = IsoflowPackage.default ?? IsoflowPackage.Isoflow ?? IsoflowPackage;
const PREVIEW_RENDERER = { showGrid: false, backgroundColor: '#f4f4f4' };
const VIEWER_RENDERER = { showGrid: true, backgroundColor: '#f4f4f4' };

export function ProjectOverview({
  projectId,
  projects,
  model,
  source,
  workspace,
  bridgeStatus,
  onOpenEditor,
}) {
  const [openViewId, setOpenViewId] = useState(null);
  const document = useMemo(() => selectProjectDocument(source, model), [source, model]);
  const content = document?.data?.content ?? [];
  const firstHeading = content.find((node) => node.type === 'heading' && node.attrs?.level === 1);
  const title = textContent(firstHeading) || document?.title || model.title;
  const body = firstHeading ? content.filter((node) => node !== firstHeading) : content;
  const referencedViews = new Set(
    body
      .filter((node) => node.type === 'itemReference')
      .map((node) => node.attrs?.refId),
  );
  const documentBody = referencedViews.size > 0
    ? body
    : [
        ...body,
        ...model.views.map((view) => ({
          type: 'itemReference',
          attrs: { refId: view.id, itemRefType: 'physicalTopology.view' },
        })),
      ];
  const firstNotesHeading = documentBody.find((node) => node.type === 'heading');
  const openView = model.views.find((view) => view.id === openViewId) ?? null;
  const connectorCount = model.views.reduce((total, view) => total + view.connectors.length, 0);
  const bridgeConnected = /^(AMP )?BRIDGE r\d+$/.test(bridgeStatus);

  return (
    <div className="project-surface">
      <header className="project-global-header">
        <a className="project-product-name" href={`/?project=${projectId}`}>
          <IsoflowMark />
          <span><strong>Isoflow</strong> Studio</span>
        </a>
        <span className="project-header-divider" aria-hidden="true" />
        <span className="project-header-title">{model.title}</span>
        <div className="project-header-actions">
          <span className={`project-runtime-status${bridgeConnected ? '' : ' disconnected'}`}>
            <i />{bridgeConnected ? bridgeStatus : 'LOCAL SESSION'}
          </span>
          <button className="carbon-button carbon-button--ghost" onClick={() => onOpenEditor(model.view)}>
            Open editor <ArrowUpRightIcon />
          </button>
        </div>
      </header>

      <div className="project-frame">
        <aside className="project-navigation" aria-label="Project navigation">
          <div className="project-navigation-label">PROJECT</div>
          <nav>
            <a className="active" href="#overview"><DocumentIcon />Overview</a>
            <a href="#architecture"><DiagramIcon />Architecture views <span>{model.views.length}</span></a>
            <a href="#decisions"><ListIcon />Design notes</a>
          </nav>
          <div className="project-navigation-label project-navigation-label--secondary">VIEWS</div>
          <div className="project-view-links">
            {model.views.map((view, index) => (
              <button key={view.id} onClick={() => setOpenViewId(view.id)}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                {view.name}
              </button>
            ))}
          </div>
          <div className="project-switcher">
            <label htmlFor="project-select">SESSION</label>
            <select
              id="project-select"
              value={projectId}
              onChange={(event) => { window.location.href = `/?project=${event.target.value}`; }}
            >
              {Object.entries(projects).map(([id, project]) => (
                <option key={id} value={id}>{project.label}</option>
              ))}
            </select>
          </div>
        </aside>

        <main className="project-document-scroll" id="overview">
          <article className="project-document">
            <header className="project-document-hero">
              <div className="project-document-kicker">ARCHITECTURE DOCUMENT</div>
              <h1>{title}</h1>
              <p>
                A repo-backed architecture workspace. Every preview below is a live Isoflow view,
                not a flattened image.
              </p>
              <div className="project-document-meta" aria-label="Project metrics">
                <ProjectMetric label="Views" value={model.views.length} />
                <ProjectMetric label="Components" value={model.items.length} />
                <ProjectMetric label="Connections" value={connectorCount} />
                <ProjectMetric label="Runtime nodes" value={workspace?.nodes.length ?? '—'} />
              </div>
            </header>

            <section className="project-document-section" id="architecture">
              <div className="project-section-marker">
                <span>01</span>
                <div><strong>Architecture views</strong><small>Interactive project diagrams</small></div>
              </div>
              <div className="project-rich-content">
                {documentBody.map((node, index) => (
                  <RichDocumentNode
                    key={node.attrs?.refId ?? `${node.type}:${index}`}
                    node={node}
                    model={model}
                    onOpenView={setOpenViewId}
                    anchorId={node === firstNotesHeading ? 'decisions' : undefined}
                  />
                ))}
              </div>
            </section>

            <footer className="project-document-footer">
              <span>Source</span>
              <strong>{document?.title ?? model.title}</strong>
              <code>{bridgeStatus}</code>
            </footer>
          </article>
        </main>
      </div>

      {openView && (
        <DiagramLightbox
          model={model}
          view={openView}
          onClose={() => setOpenViewId(null)}
          onOpenEditor={() => onOpenEditor(openView.id)}
        />
      )}
    </div>
  );
}

function ProjectMetric({ label, value }) {
  return <div><strong>{value}</strong><span>{label}</span></div>;
}

function RichDocumentNode({ node, model, onOpenView, anchorId }) {
  if (node.type === 'itemReference' && node.attrs?.itemRefType === 'physicalTopology.view') {
    const view = model.views.find((candidate) => candidate.id === node.attrs.refId);
    return view ? <DiagramPreview model={model} view={view} onOpen={() => onOpenView(view.id)} /> : null;
  }
  if (node.type === 'heading') {
    const level = Math.min(Math.max(node.attrs?.level ?? 2, 2), 4);
    const Heading = `h${level}`;
    return <Heading id={anchorId}>{renderInline(node.content)}</Heading>;
  }
  if (node.type === 'paragraph') return <p>{renderInline(node.content)}</p>;
  if (node.type === 'bulletList') {
    return <ul>{(node.content ?? []).map((item, index) => <RichDocumentNode key={index} node={item} model={model} onOpenView={onOpenView} />)}</ul>;
  }
  if (node.type === 'orderedList') {
    return <ol>{(node.content ?? []).map((item, index) => <RichDocumentNode key={index} node={item} model={model} onOpenView={onOpenView} />)}</ol>;
  }
  if (node.type === 'listItem') {
    return <li>{(node.content ?? []).map((item, index) => <RichDocumentNode key={index} node={item} model={model} onOpenView={onOpenView} />)}</li>;
  }
  if (node.content) {
    return <>{node.content.map((item, index) => <RichDocumentNode key={index} node={item} model={model} onOpenView={onOpenView} />)}</>;
  }
  return null;
}

function DiagramPreview({ model, view, onOpen }) {
  const container = useRef(null);
  const [shouldRender, setShouldRender] = useState(false);
  const previewModel = useMemo(
    () => ({ ...model, view: view.id, fitToView: true }),
    [model, view.id],
  );

  useEffect(() => {
    const element = container.current;
    if (!element || typeof IntersectionObserver === 'undefined') {
      setShouldRender(true);
      return undefined;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setShouldRender(true);
        observer.disconnect();
      }
    }, { rootMargin: '360px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <section className="diagram-preview" ref={container} aria-label={view.name}>
      <header>
        <div>
          <span>ISOFLOW VIEW</span>
          <h2>{view.name}</h2>
        </div>
        <button className="carbon-icon-button" onClick={onOpen} aria-label={`Expand ${view.name}`}>
          <ExpandIcon />
        </button>
      </header>
      <div className="diagram-preview-canvas">
        {shouldRender ? (
          <Isoflow
            initialData={previewModel}
            editorMode="NON_INTERACTIVE"
            mainMenuOptions={[]}
            renderer={PREVIEW_RENDERER}
          />
        ) : <div className="diagram-preview-loading">Preparing live view…</div>}
        <button className="diagram-preview-hitbox" onClick={onOpen} aria-label={`Open ${view.name}`} />
      </div>
      <footer>
        <span>{view.items.length} components</span>
        <span>{view.connectors.length} connections</span>
        <button onClick={onOpen}>Explore diagram <ArrowRightIcon /></button>
      </footer>
    </section>
  );
}

function DiagramLightbox({ model, view, onClose, onOpenEditor }) {
  const canvas = useRef(null);
  const viewerModel = useMemo(
    () => ({ ...model, view: view.id, fitToView: true }),
    [model, view.id],
  );

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  return (
    <div className="diagram-lightbox-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="diagram-lightbox" role="dialog" aria-modal="true" aria-labelledby="diagram-lightbox-title">
        <header>
          <div className="diagram-lightbox-title">
            <DiagramIcon />
            <div><span>ARCHITECTURE VIEW</span><h2 id="diagram-lightbox-title">{view.name}</h2></div>
          </div>
          <div className="diagram-lightbox-actions">
            <span className="diagram-live-badge"><i />LIVE MODEL</span>
            <button className="carbon-button carbon-button--primary" onClick={onOpenEditor}>
              Open editor <ArrowUpRightIcon />
            </button>
            <button className="carbon-icon-button diagram-lightbox-close" onClick={onClose} aria-label="Close diagram">
              <CloseIcon />
            </button>
          </div>
        </header>
        <div className="diagram-lightbox-canvas" ref={canvas}>
          <Isoflow
            key={view.id}
            initialData={viewerModel}
            editorMode="EXPLORABLE_READONLY"
            mainMenuOptions={[]}
            renderer={VIEWER_RENDERER}
          />
          <div className="diagram-lightbox-hint">Drag to pan · use the controls to zoom</div>
        </div>
      </section>
    </div>
  );
}

export function selectProjectDocument(source, model) {
  const viewIds = new Set(model.views.map((view) => view.id));
  return (source?.documents?.list ?? [])
    .map((document) => ({
      document,
      score: (document.data?.content ?? []).filter(
        (node) => node.type === 'itemReference' && viewIds.has(node.attrs?.refId),
      ).length,
    }))
    .sort((a, b) => b.score - a.score)[0]?.document ?? null;
}

function textContent(node) {
  if (typeof node?.text === 'string') return node.text;
  return (node?.content ?? []).map(textContent).join('');
}

function renderInline(nodes = []) {
  return nodes.map((node, index) => {
    if (typeof node.text !== 'string') return renderInline(node.content);
    let content = node.text;
    for (const mark of node.marks ?? []) {
      if (mark.type === 'bold') content = <strong key={`bold:${index}`}>{content}</strong>;
      if (mark.type === 'italic') content = <em key={`italic:${index}`}>{content}</em>;
      if (mark.type === 'code') content = <code key={`code:${index}`}>{content}</code>;
    }
    return <React.Fragment key={index}>{content}</React.Fragment>;
  });
}

function IsoflowMark() {
  return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="m4 9 12-7 12 7-12 7L4 9Zm0 7 12 7 12-7M4 23l12 7 12-7" /></svg>;
}

function DocumentIcon() {
  return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M8 2h11l7 7v21H8V2Zm11 0v7h7M12 15h10M12 20h10M12 25h7" /></svg>;
}

function DiagramIcon() {
  return <svg viewBox="0 0 32 32" aria-hidden="true"><rect x="2" y="4" width="10" height="8" /><rect x="20" y="4" width="10" height="8" /><rect x="11" y="21" width="10" height="8" /><path d="M7 12v5h9v4M25 12v5h-9" /></svg>;
}

function ListIcon() {
  return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M11 8h18M11 16h18M11 24h18" /><circle cx="4" cy="8" r="1.5" /><circle cx="4" cy="16" r="1.5" /><circle cx="4" cy="24" r="1.5" /></svg>;
}

function ExpandIcon() {
  return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M18 4h10v10M28 4 17 15M14 28H4V18M4 28l11-11" /></svg>;
}

function CloseIcon() {
  return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="m6 6 20 20M26 6 6 26" /></svg>;
}

function ArrowRightIcon() {
  return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M4 16h22M19 9l7 7-7 7" /></svg>;
}

function ArrowUpRightIcon() {
  return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M8 24 24 8M12 8h12v12" /></svg>;
}
