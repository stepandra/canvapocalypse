import { includeAutorecruitIcons } from './autorecruit-icons.mjs';

const DEFAULT_COLORS = [{ id: 'blue', value: '#a5b8f3' }];
const MIN_LABEL_HEIGHT = 120;
const ISOFLOW_PUBLIC_ICON_PREFIX =
  'https://isoflow-public.s3.eu-west-2.amazonaws.com/icons/';
const LOCAL_ICON_PREFIX = '/isoflow-icons/';

export function convertProExport(source) {
  const topology = source?.physicalTopology;
  if (!topology || !Array.isArray(topology.components) || !Array.isArray(topology.views)) {
    throw new Error('Isoflow Pro export is missing physicalTopology components or views');
  }

  const components = new Map(topology.components.map((component) => [component.id, component]));
  const colors = (topology.colors?.length ? topology.colors : DEFAULT_COLORS).map(clone);
  const defaultRectangleColor = colors[0].id;
  const modelItems = new Map();
  const views = topology.views
    .filter((view) => view.items?.length > 0)
    .map((view) => {
      const items = view.items.map((viewItem) => {
        const component = components.get(viewItem.component);
        if (!component) {
          throw new Error(`View item ${viewItem.id} references missing component ${viewItem.component}`);
        }

        const modelItem = {
          id: viewItem.id,
          name: component.name,
          ...(component.icon ? { icon: component.icon } : {}),
          ...(component.description ? { description: component.description } : {})
        };
        const existing = modelItems.get(modelItem.id);
        if (existing && JSON.stringify(existing) !== JSON.stringify(modelItem)) {
          throw new Error(`View item ID ${modelItem.id} resolves to conflicting components`);
        }
        modelItems.set(modelItem.id, modelItem);

        return {
          id: viewItem.id,
          tile: { ...viewItem.tile },
          labelHeight: Math.max(viewItem.labelHeight ?? 80, MIN_LABEL_HEIGHT)
        };
      });

      const connectors = (view.connectors ?? []).map((connector, index) =>
        normalizeConnector(connector, view.id, index)
      );

      return {
        id: view.id,
        name: view.name,
        items,
        connectors,
        rectangles: (view.rectangles ?? []).map((rectangle) => ({
          ...clone(rectangle),
          color: rectangle.color || defaultRectangleColor,
        })),
        textBoxes: (view.textBoxes ?? []).map((textBox) => ({
          ...clone(textBox),
          fontSize: Math.min(textBox.fontSize ?? 0.16, 0.2),
          orientation: textBox.orientation ?? 'X'
        }))
      };
    });

  if (views.length === 0) throw new Error('Isoflow Pro export has no non-empty physical topology views');

  return {
    version: '1.1',
    title: source.project?.title ?? 'Imported Isoflow project',
    description: 'Editable local session adapted from an Isoflow Pro 3.3 export.',
    icons: includeAutorecruitIcons((source.icons ?? []).map(localizeIcon)),
    colors,
    legend: Array.isArray(topology.legend) ? topology.legend.map(clone) : [],
    items: [...modelItems.values()],
    views,
    view: views[0].id,
    fitToView: true
  };
}

function localizeIcon(icon) {
  const localized = clone(icon);
  if (typeof localized.url === 'string' && localized.url.startsWith(ISOFLOW_PUBLIC_ICON_PREFIX)) {
    localized.url = `${LOCAL_ICON_PREFIX}${localized.url.slice(ISOFLOW_PUBLIC_ICON_PREFIX.length)}`;
  }
  return localized;
}

function normalizeConnector(connector, viewId, index) {
  if (Array.isArray(connector.anchors)) return clone(connector);
  if (connector.source && connector.destination) {
    const id = connector.id ?? `${viewId}:connector:${index}`;
    return {
      id,
      anchors: [
        { id: `${id}:source`, ref: { item: connector.source } },
        { id: `${id}:destination`, ref: { item: connector.destination } }
      ]
    };
  }
  throw new Error(`Connector ${connector.id ?? index} has neither anchors nor source/destination`);
}

function clone(value) {
  return structuredClone(value);
}
