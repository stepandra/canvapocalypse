import { BridgeValidationError, getIsoflowView } from './isoflow-bridge.mjs';

const TILE_X = 34;
const TILE_Y = 17;
const PADDING = 72;

export function describeIsoflowRender(state, viewId) {
  const view = getIsoflowView(state, viewId);
  return {
    schemaVersion: 1,
    projectId: state.projectId,
    revision: state.revision,
    viewId: view.view.id,
    title: state.model.title,
    viewName: view.view.name,
    itemCount: view.items.length,
    connectorCount: view.view.connectors.length,
    rectangleCount: view.view.rectangles.length,
    textBoxCount: view.view.textBoxes.length,
    embedUrl: `/?project=${encodeURIComponent(state.projectId)}&view=${encodeURIComponent(view.view.id)}&embed=1`,
    svgUrl: `/api/isoflow/projects/${encodeURIComponent(state.projectId)}/render?viewId=${encodeURIComponent(view.view.id)}&format=svg`,
  };
}

export function renderIsoflowSvg(state, viewId) {
  const compact = getIsoflowView(state, viewId);
  const colorMap = new Map((state.model.colors ?? []).map((color) => [color.id, color.value]));
  const points = [];
  for (const item of compact.items) points.push(project(item.tile));
  for (const rectangle of compact.view.rectangles) {
    points.push(project(rectangle.from), project(rectangle.to));
  }
  if (points.length === 0) throw new BridgeValidationError(`View has no renderable content: ${compact.view.id}`);

  const minX = Math.min(...points.map((point) => point.x)) - PADDING;
  const maxX = Math.max(...points.map((point) => point.x)) + PADDING;
  const minY = Math.min(...points.map((point) => point.y)) - PADDING;
  const maxY = Math.max(...points.map((point) => point.y)) + PADDING;
  const width = Math.max(320, maxX - minX);
  const height = Math.max(220, maxY - minY);
  const shift = (point) => ({ x: point.x - minX, y: point.y - minY });
  const itemMap = new Map(compact.items.map((item) => [item.id, item]));

  const rectangles = compact.view.rectangles.map((rectangle) => {
    const corners = [
      { x: rectangle.from.x, y: rectangle.from.y },
      { x: rectangle.to.x, y: rectangle.from.y },
      { x: rectangle.to.x, y: rectangle.to.y },
      { x: rectangle.from.x, y: rectangle.to.y },
    ].map((tile) => shift(project(tile)));
    const color = colorMap.get(rectangle.color) ?? '#d8dee8';
    return `<polygon points="${corners.map((point) => `${point.x},${point.y}`).join(' ')}" fill="${escapeXml(color)}" fill-opacity=".58" stroke="${escapeXml(color)}" stroke-width="2"/>`;
  }).join('');

  const connectors = compact.view.connectors.map((connector) => {
    const anchors = connector.anchors
      .map((anchor) => itemMap.get(anchor?.ref?.item))
      .filter(Boolean)
      .map((item) => shift(project(item.tile)));
    if (anchors.length < 2) return '';
    const color = colorMap.get(connector.color) ?? '#607186';
    return `<polyline points="${anchors.map((point) => `${point.x},${point.y}`).join(' ')}" fill="none" stroke="${escapeXml(color)}" stroke-width="${Number(connector.width) || 2}" stroke-linecap="round" stroke-linejoin="round"/>`;
  }).join('');

  const items = compact.items.map((item) => {
    const point = shift(project(item.tile));
    return [
      `<g transform="translate(${point.x} ${point.y})">`,
      '<path d="M0 -15 22 0 0 15-22 0Z" fill="#f9fbfd" stroke="#223247" stroke-width="2"/>',
      `<text x="0" y="-24" text-anchor="middle" font-size="11" font-weight="650" fill="#172231">${escapeXml(item.name ?? item.id)}</text>`,
      '</g>',
    ].join('');
  }).join('');

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeXml(compact.view.name)}" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`,
    '<rect width="100%" height="100%" fill="#f7f9fb"/>',
    '<g opacity=".35" stroke="#cbd3dc" stroke-width="1">',
    gridLines(width, height),
    '</g>',
    `<g>${rectangles}${connectors}${items}</g>`,
    `<text x="18" y="25" font-family="ui-monospace,monospace" font-size="11" font-weight="700" fill="#5c6978">${escapeXml(state.model.title)} / ${escapeXml(compact.view.name)} / r${state.revision}</text>`,
    '</svg>',
  ].join('');
}

function project(tile) {
  return {
    x: (Number(tile?.x) - Number(tile?.y)) * TILE_X,
    y: (Number(tile?.x) + Number(tile?.y)) * TILE_Y,
  };
}

function gridLines(width, height) {
  const lines = [];
  const spacing = 68;
  for (let offset = -height; offset < width + height; offset += spacing) {
    lines.push(`<path d="M${offset} 0 ${offset + height * 2} ${height}"/>`);
    lines.push(`<path d="M${offset} ${height} ${offset + height * 2} 0"/>`);
  }
  return lines.join('');
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}
