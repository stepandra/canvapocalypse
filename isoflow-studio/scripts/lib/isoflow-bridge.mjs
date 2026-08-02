export class BridgeValidationError extends Error {
  constructor(message, details) {
    super(message);
    this.name = 'BridgeValidationError';
    this.statusCode = 400;
    this.details = details;
  }
}

export class BridgeConflictError extends Error {
  constructor(expectedRevision, currentRevision) {
    super(`Isoflow revision conflict: expected ${expectedRevision}, current ${currentRevision}`);
    this.name = 'BridgeConflictError';
    this.statusCode = 409;
    this.expectedRevision = expectedRevision;
    this.currentRevision = currentRevision;
  }
}

export const ISOFLOW_BRIDGE_CAPABILITIES = Object.freeze({
  schemaVersion: 2,
  service: 'isoflow-model-bridge',
  reads: ['state', 'view', 'items', 'connectors', 'rectangles', 'textBoxes', 'colors', 'legend', 'icons'],
  transaction: {
    revisionGuarded: true,
    dryRun: true,
    idempotencyKeys: true,
    maxOperations: 100,
    operations: [
      'set_view',
      'create_view',
      'update_view',
      'duplicate_view',
      'remove_view',
      'move_item',
      'rename_item',
      'update_item',
      'add_item',
      'remove_item',
      'connect',
      'update_connector',
      'disconnect',
      'add_rectangle',
      'update_rectangle',
      'remove_rectangle',
      'add_text_box',
      'update_text_box',
      'remove_text_box',
      'update_color',
      'replace_legend',
    ],
  },
  events: { transport: 'sse', scopes: ['model', 'workspace'] },
  history: { list: true, diff: true, revert: true },
  render: { formats: ['svg', 'descriptor'] },
  workspace: {
    reads: ['workspace', 'nodes', 'documents', 'flows'],
    operations: [
      'add_node',
      'update_node',
      'remove_node',
      'add_document',
      'update_document',
      'remove_document',
      'link_document',
      'unlink_document',
      'add_flow',
      'update_flow',
      'remove_flow',
    ],
  },
});

export function getIsoflowBridgeCapabilities() {
  return structuredClone(ISOFLOW_BRIDGE_CAPABILITIES);
}

export function applyIsoflowPatch(state, request) {
  assertState(state);
  assertObject(request, 'Patch request');
  if (request.baseRevision !== state.revision) {
    throw new BridgeConflictError(request.baseRevision, state.revision);
  }
  if (!Array.isArray(request.operations) || request.operations.length === 0) {
    throw new BridgeValidationError('Patch must contain at least one operation');
  }
  if (request.operations.length > ISOFLOW_BRIDGE_CAPABILITIES.transaction.maxOperations) {
    throw new BridgeValidationError(
      `Patch cannot exceed ${ISOFLOW_BRIDGE_CAPABILITIES.transaction.maxOperations} operations`,
    );
  }

  const model = structuredClone(state.model);
  for (const operation of request.operations) applyOperation(model, operation);
  validateIsoflowModel(model);

  const actor = nonEmptyString(request.actor, 'actor', { optional: true }) ?? 'unknown';
  const operationNames = request.operations.map((operation) => operation.op).join(', ');
  return {
    ...state,
    revision: state.revision + 1,
    model,
    updatedAt: new Date().toISOString(),
    updatedBy: actor,
    origin: 'bridge',
    summary: `${request.operations.length} operations by ${actor}: ${operationNames}`,
    ...(request.transactionId ? { transactionId: request.transactionId } : {}),
    ...(request.idempotencyKey ? { idempotencyKey: request.idempotencyKey } : {}),
  };
}

export function replaceIsoflowModel(state, request) {
  assertState(state);
  assertObject(request, 'Model replacement request');
  if (request.baseRevision !== state.revision) {
    throw new BridgeConflictError(request.baseRevision, state.revision);
  }
  validateIsoflowModel(request.model);
  const actor = nonEmptyString(request.actor, 'actor', { optional: true }) ?? 'isoflow-ui';
  return {
    ...state,
    revision: state.revision + 1,
    model: structuredClone(request.model),
    updatedAt: new Date().toISOString(),
    updatedBy: actor,
    origin: 'ui',
    summary: `Model replaced by ${actor}`,
    ...(request.transactionId ? { transactionId: request.transactionId } : {}),
    ...(request.idempotencyKey ? { idempotencyKey: request.idempotencyKey } : {}),
  };
}

export function getIsoflowView(state, requestedViewId) {
  assertState(state);
  const viewId = requestedViewId ?? state.model.view ?? state.model.views[0]?.id;
  const view = findView(state.model, viewId);
  const modelItems = new Map(state.model.items.map((item) => [item.id, item]));
  return {
    projectId: state.projectId,
    revision: state.revision,
    title: state.model.title,
    activeViewId: state.model.view,
    views: state.model.views.map((candidate) => ({ id: candidate.id, name: candidate.name })),
    legend: structuredClone(state.model.legend ?? []),
    colors: structuredClone(state.model.colors ?? []),
    view: {
      id: view.id,
      name: view.name,
      connectors: structuredClone(view.connectors ?? []),
      rectangles: structuredClone(view.rectangles ?? []),
      textBoxes: structuredClone(view.textBoxes ?? []),
    },
    items: view.items.map((placement) => {
      const item = modelItems.get(placement.id);
      if (!item) throw new BridgeValidationError(`View ${view.id} references missing item ${placement.id}`);
      return { ...structuredClone(item), ...structuredClone(placement) };
    }),
  };
}

export function searchIsoflow(state, options = {}) {
  assertState(state);
  const query = String(options.query ?? '').trim().toLowerCase();
  if (!query) throw new BridgeValidationError('Search query must not be empty');
  const kind = options.kind ?? 'all';
  if (!['all', 'items', 'icons'].includes(kind)) {
    throw new BridgeValidationError(`Unknown search kind: ${kind}`);
  }
  const limit = clampInteger(options.limit, 20, 1, 100);
  const viewFilter = options.viewId
    ? new Set(findView(state.model, options.viewId).items.map((item) => item.id))
    : null;
  const results = [];

  if (kind === 'all' || kind === 'items') {
    for (const item of state.model.items) {
      if (viewFilter && !viewFilter.has(item.id)) continue;
      if (`${item.id} ${item.name ?? ''} ${item.icon ?? ''}`.toLowerCase().includes(query)) {
        results.push({ kind: 'item', ...structuredClone(item) });
      }
    }
  }
  if (kind === 'all' || kind === 'icons') {
    for (const icon of state.model.icons) {
      if (`${icon.id} ${icon.name ?? ''} ${icon.collection ?? ''}`.toLowerCase().includes(query)) {
        results.push({ kind: 'icon', ...structuredClone(icon) });
      }
    }
  }

  return {
    projectId: state.projectId,
    revision: state.revision,
    query,
    results: results.slice(0, limit),
    truncated: results.length > limit,
  };
}

export function validateIsoflowModel(model) {
  assertObject(model, 'Isoflow model');
  if (!Array.isArray(model.items) || !Array.isArray(model.views) || !Array.isArray(model.icons)) {
    throw new BridgeValidationError('Isoflow model must contain items, views, and icons arrays');
  }
  if (model.views.length === 0) throw new BridgeValidationError('Isoflow model has no views');

  const itemIds = uniqueIds(model.items, 'model item');
  uniqueIds(model.icons, 'icon');
  const colorIds = new Set();
  for (const color of model.colors ?? []) {
    const id = nonEmptyString(color?.id, 'color.id');
    if (colorIds.has(id)) throw new BridgeValidationError(`Duplicate color ID: ${id}`);
    colorIds.add(id);
    validateCssColor(color.value, `color ${id}.value`);
  }
  validateLegend(model.legend ?? [], colorIds);
  uniqueIds(model.views, 'view');
  for (const view of model.views) {
    if (!Array.isArray(view.items) || !Array.isArray(view.connectors)) {
      throw new BridgeValidationError(`View ${view.id} must contain items and connectors arrays`);
    }
    const viewItemIds = uniqueIds(view.items, `view ${view.id} item`);
    for (const placement of view.items) {
      if (!itemIds.has(placement.id)) {
        throw new BridgeValidationError(`View ${view.id} references missing item ${placement.id}`);
      }
      validateTile(placement.tile);
      if (placement.labelHeight !== undefined) {
        finiteNumber(placement.labelHeight, `view ${view.id} item ${placement.id}.labelHeight`);
      }
    }
    uniqueIds(view.connectors, `view ${view.id} connector`);
    for (const connector of view.connectors) {
      if (!Array.isArray(connector.anchors) || connector.anchors.length < 2) {
        throw new BridgeValidationError(`Connector ${connector.id} must contain at least two anchors`);
      }
      for (const anchor of connector.anchors) {
        const itemId = anchor?.ref?.item;
        if (!viewItemIds.has(itemId)) {
          throw new BridgeValidationError(`Connector ${connector.id} references missing view item ${itemId}`);
        }
      }
    }
    uniqueIds(view.rectangles ?? [], `view ${view.id} rectangle`);
    for (const rectangle of view.rectangles ?? []) {
      validateRectangle(rectangle, colorIds, `view ${view.id} rectangle ${rectangle.id}`);
    }
    uniqueIds(view.textBoxes ?? [], `view ${view.id} text box`);
    for (const textBox of view.textBoxes ?? []) {
      validateTextBox(textBox, `view ${view.id} text box ${textBox.id}`);
    }
  }
  if (model.view && !model.views.some((view) => view.id === model.view)) {
    throw new BridgeValidationError(`Active view does not exist: ${model.view}`);
  }
  return model;
}

function applyOperation(model, operation) {
  assertObject(operation, 'Patch operation');
  switch (operation.op) {
    case 'set_view': {
      const viewId = nonEmptyString(operation.viewId, 'viewId');
      findView(model, viewId);
      model.view = viewId;
      model.fitToView = true;
      return;
    }
    case 'create_view': {
      assertObject(operation.view, 'view');
      const id = nonEmptyString(operation.view.id, 'view.id');
      if (model.views.some((view) => view.id === id)) {
        throw new BridgeValidationError(`View already exists: ${id}`);
      }
      const view = {
        id,
        name: nonEmptyString(operation.view.name, 'view.name'),
        items: structuredClone(operation.view.items ?? []),
        connectors: structuredClone(operation.view.connectors ?? []),
        rectangles: structuredClone(operation.view.rectangles ?? []),
        textBoxes: structuredClone(operation.view.textBoxes ?? []),
      };
      model.views.push(view);
      if (operation.activate !== false) {
        model.view = id;
        model.fitToView = true;
      }
      return;
    }
    case 'update_view': {
      const view = findView(model, nonEmptyString(operation.viewId, 'viewId'));
      assertObject(operation.patch, 'view patch');
      if (operation.patch.name !== undefined) {
        view.name = nonEmptyString(operation.patch.name, 'view.name');
      }
      return;
    }
    case 'duplicate_view': {
      const source = findView(model, nonEmptyString(operation.viewId, 'viewId'));
      const id = nonEmptyString(operation.newViewId, 'newViewId');
      if (model.views.some((view) => view.id === id)) {
        throw new BridgeValidationError(`View already exists: ${id}`);
      }
      const duplicate = structuredClone(source);
      duplicate.id = id;
      duplicate.name = nonEmptyString(operation.name ?? `${source.name} copy`, 'name');
      model.views.push(duplicate);
      if (operation.activate !== false) {
        model.view = id;
        model.fitToView = true;
      }
      return;
    }
    case 'remove_view': {
      const viewId = nonEmptyString(operation.viewId, 'viewId');
      findView(model, viewId);
      if (model.views.length === 1) {
        throw new BridgeValidationError('Cannot remove the last view');
      }
      model.views = model.views.filter((view) => view.id !== viewId);
      if (model.view === viewId) {
        model.view = model.views[0].id;
        model.fitToView = true;
      }
      return;
    }
    case 'move_item': {
      const view = findView(model, nonEmptyString(operation.viewId, 'viewId'));
      const itemId = nonEmptyString(operation.itemId, 'itemId');
      const placement = findPlacement(view, itemId);
      placement.tile = validateTile(operation.tile);
      return;
    }
    case 'rename_item': {
      const item = findModelItem(model, nonEmptyString(operation.itemId, 'itemId'));
      item.name = nonEmptyString(operation.name, 'name');
      return;
    }
    case 'update_item': {
      const item = findModelItem(model, nonEmptyString(operation.itemId, 'itemId'));
      assertObject(operation.patch, 'item patch');
      if (operation.patch.name !== undefined) {
        item.name = nonEmptyString(operation.patch.name, 'item.name');
      }
      if (operation.patch.description !== undefined) {
        item.description = nonEmptyString(operation.patch.description, 'item.description', { optional: true });
        if (!item.description) delete item.description;
      }
      if (operation.patch.icon !== undefined) {
        const icon = nonEmptyString(operation.patch.icon, 'item.icon', { optional: true });
        if (icon && !model.icons.some((candidate) => candidate.id === icon)) {
          throw new BridgeValidationError(`Icon does not exist: ${icon}`);
        }
        if (icon) item.icon = icon;
        else delete item.icon;
      }
      return;
    }
    case 'add_item': {
      const view = findView(model, nonEmptyString(operation.viewId, 'viewId'));
      assertObject(operation.item, 'item');
      const id = nonEmptyString(operation.item.id, 'item.id');
      if (model.items.some((item) => item.id === id)) {
        throw new BridgeValidationError(`Item already exists: ${id}`);
      }
      const icon = nonEmptyString(operation.item.icon, 'item.icon', { optional: true });
      if (icon && !model.icons.some((candidate) => candidate.id === icon)) {
        throw new BridgeValidationError(`Icon does not exist: ${icon}`);
      }
      const item = { id, name: nonEmptyString(operation.item.name, 'item.name') };
      if (icon) item.icon = icon;
      model.items.push(item);
      view.items.push({
        id,
        tile: validateTile(operation.item.tile),
        labelHeight: finiteNumber(operation.item.labelHeight, 'item.labelHeight', 120),
      });
      return;
    }
    case 'remove_item': {
      const itemId = nonEmptyString(operation.itemId, 'itemId');
      findModelItem(model, itemId);
      model.items = model.items.filter((item) => item.id !== itemId);
      for (const view of model.views) {
        view.items = view.items.filter((item) => item.id !== itemId);
        view.connectors = view.connectors.filter(
          (connector) => !connector.anchors.some((anchor) => anchor?.ref?.item === itemId),
        );
      }
      return;
    }
    case 'connect': {
      const view = findView(model, nonEmptyString(operation.viewId, 'viewId'));
      const connectorId = nonEmptyString(operation.connectorId, 'connectorId');
      if (view.connectors.some((connector) => connector.id === connectorId)) {
        throw new BridgeValidationError(`Connector already exists: ${connectorId}`);
      }
      const from = nonEmptyString(operation.from, 'from');
      const to = nonEmptyString(operation.to, 'to');
      findPlacement(view, from);
      findPlacement(view, to);
      view.connectors.push({
        id: connectorId,
        anchors: [
          { id: `${connectorId}:source`, ref: { item: from } },
          { id: `${connectorId}:destination`, ref: { item: to } },
        ],
        ...sanitizeConnectorPatch(operation.connector ?? {}),
      });
      return;
    }
    case 'update_connector': {
      const view = findView(model, nonEmptyString(operation.viewId, 'viewId'));
      const connectorId = nonEmptyString(operation.connectorId, 'connectorId');
      const connector = view.connectors.find((candidate) => candidate.id === connectorId);
      if (!connector) throw new BridgeValidationError(`Connector does not exist: ${connectorId}`);
      Object.assign(connector, sanitizeConnectorPatch(operation.patch));
      return;
    }
    case 'disconnect': {
      const view = findView(model, nonEmptyString(operation.viewId, 'viewId'));
      const connectorId = nonEmptyString(operation.connectorId, 'connectorId');
      if (!view.connectors.some((connector) => connector.id === connectorId)) {
        throw new BridgeValidationError(`Connector does not exist: ${connectorId}`);
      }
      view.connectors = view.connectors.filter((connector) => connector.id !== connectorId);
      return;
    }
    case 'add_rectangle': {
      const view = findView(model, nonEmptyString(operation.viewId, 'viewId'));
      assertObject(operation.rectangle, 'rectangle');
      const id = nonEmptyString(operation.rectangle.id, 'rectangle.id');
      if ((view.rectangles ?? []).some((rectangle) => rectangle.id === id)) {
        throw new BridgeValidationError(`Rectangle already exists: ${id}`);
      }
      view.rectangles ??= [];
      view.rectangles.push(structuredClone(operation.rectangle));
      return;
    }
    case 'update_rectangle': {
      const view = findView(model, nonEmptyString(operation.viewId, 'viewId'));
      const rectangle = findById(view.rectangles ?? [], operation.rectangleId, 'Rectangle');
      assertObject(operation.patch, 'rectangle patch');
      Object.assign(rectangle, structuredClone(operation.patch), { id: rectangle.id });
      return;
    }
    case 'remove_rectangle': {
      const view = findView(model, nonEmptyString(operation.viewId, 'viewId'));
      const id = nonEmptyString(operation.rectangleId, 'rectangleId');
      findById(view.rectangles ?? [], id, 'Rectangle');
      view.rectangles = (view.rectangles ?? []).filter((rectangle) => rectangle.id !== id);
      return;
    }
    case 'add_text_box': {
      const view = findView(model, nonEmptyString(operation.viewId, 'viewId'));
      assertObject(operation.textBox, 'textBox');
      const id = nonEmptyString(operation.textBox.id, 'textBox.id');
      if ((view.textBoxes ?? []).some((textBox) => textBox.id === id)) {
        throw new BridgeValidationError(`Text box already exists: ${id}`);
      }
      view.textBoxes ??= [];
      view.textBoxes.push(structuredClone(operation.textBox));
      return;
    }
    case 'update_text_box': {
      const view = findView(model, nonEmptyString(operation.viewId, 'viewId'));
      const textBox = findById(view.textBoxes ?? [], operation.textBoxId, 'Text box');
      assertObject(operation.patch, 'text box patch');
      Object.assign(textBox, structuredClone(operation.patch), { id: textBox.id });
      return;
    }
    case 'remove_text_box': {
      const view = findView(model, nonEmptyString(operation.viewId, 'viewId'));
      const id = nonEmptyString(operation.textBoxId, 'textBoxId');
      findById(view.textBoxes ?? [], id, 'Text box');
      view.textBoxes = (view.textBoxes ?? []).filter((textBox) => textBox.id !== id);
      return;
    }
    case 'update_color': {
      const colorId = nonEmptyString(operation.colorId, 'colorId');
      const color = findById(model.colors ?? [], colorId, 'Color');
      color.value = validateCssColor(operation.value, `color ${colorId}.value`);
      return;
    }
    case 'replace_legend': {
      if (!Array.isArray(operation.legend)) {
        throw new BridgeValidationError('legend must be an array');
      }
      model.legend = structuredClone(operation.legend);
      return;
    }
    default:
      throw new BridgeValidationError(`Unsupported patch operation: ${operation.op}`);
  }
}

function sanitizeConnectorPatch(value) {
  assertObject(value, 'connector patch');
  const patch = {};
  if (value.color !== undefined) patch.color = nonEmptyString(value.color, 'connector.color', { optional: true });
  if (value.width !== undefined) patch.width = finiteNumber(value.width, 'connector.width');
  if (value.style !== undefined) {
    const style = nonEmptyString(value.style, 'connector.style').toUpperCase();
    if (!['SOLID', 'DASHED', 'DOTTED'].includes(style)) {
      throw new BridgeValidationError(`Unsupported connector style: ${style}`);
    }
    patch.style = style;
  }
  if (value.direction !== undefined) {
    const direction = nonEmptyString(value.direction, 'connector.direction').toUpperCase();
    if (!['FORWARD', 'REVERSE', 'BOTH', 'NONE'].includes(direction)) {
      throw new BridgeValidationError(`Unsupported connector direction: ${direction}`);
    }
    patch.direction = direction;
  }
  return patch;
}

function validateLegend(legend, colorIds) {
  if (!Array.isArray(legend)) throw new BridgeValidationError('legend must be an array');
  const ids = new Set();
  for (const entry of legend) {
    assertObject(entry, 'legend entry');
    const id = nonEmptyString(entry.id, 'legend.id');
    if (ids.has(id)) throw new BridgeValidationError(`Duplicate legend ID: ${id}`);
    ids.add(id);
    nonEmptyString(entry.label, `legend ${id}.label`);
    const colorId = nonEmptyString(entry.colorId, `legend ${id}.colorId`);
    if (!colorIds.has(colorId)) {
      throw new BridgeValidationError(`Legend ${id} references missing color ${colorId}`);
    }
  }
}

function validateRectangle(rectangle, colorIds, label) {
  assertObject(rectangle, label);
  validateTile(rectangle.from);
  validateTile(rectangle.to);
  const color = nonEmptyString(rectangle.color, `${label}.color`);
  if (colorIds.size > 0 && !colorIds.has(color)) {
    throw new BridgeValidationError(`${label} references missing color ${color}`);
  }
}

function validateTextBox(textBox, label) {
  assertObject(textBox, label);
  validateTile(textBox.tile);
  nonEmptyString(textBox.content, `${label}.content`);
  if (textBox.fontSize !== undefined) finiteNumber(textBox.fontSize, `${label}.fontSize`);
  if (textBox.orientation !== undefined && !['X', 'Y'].includes(textBox.orientation)) {
    throw new BridgeValidationError(`${label}.orientation must be X or Y`);
  }
}

function validateCssColor(value, field) {
  if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) {
    throw new BridgeValidationError(`${field} must be a six-digit hex color`);
  }
  return value;
}

function findById(values, rawId, label) {
  const id = nonEmptyString(rawId, `${label.toLowerCase()}Id`);
  const value = values.find((candidate) => candidate.id === id);
  if (!value) throw new BridgeValidationError(`${label} does not exist: ${id}`);
  return value;
}

function assertState(state) {
  assertObject(state, 'Bridge state');
  if (!Number.isInteger(state.revision) || state.revision < 1) {
    throw new BridgeValidationError('Bridge state revision must be a positive integer');
  }
  validateIsoflowModel(state.model);
}

function findView(model, viewId) {
  const view = model.views.find((candidate) => candidate.id === viewId);
  if (!view) throw new BridgeValidationError(`View does not exist: ${viewId}`);
  return view;
}

function findModelItem(model, itemId) {
  const item = model.items.find((candidate) => candidate.id === itemId);
  if (!item) throw new BridgeValidationError(`Item does not exist: ${itemId}`);
  return item;
}

function findPlacement(view, itemId) {
  const item = view.items.find((candidate) => candidate.id === itemId);
  if (!item) throw new BridgeValidationError(`Item ${itemId} is not present in view ${view.id}`);
  return item;
}

function validateTile(tile) {
  assertObject(tile, 'tile');
  return {
    x: finiteNumber(tile.x, 'tile.x'),
    y: finiteNumber(tile.y, 'tile.y'),
  };
}

function finiteNumber(value, field, fallback) {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new BridgeValidationError(`${field} must be a finite number`);
  }
  return value;
}

function nonEmptyString(value, field, options = {}) {
  if ((value === undefined || value === null) && options.optional) return undefined;
  if (typeof value !== 'string' || value.trim() === '') {
    throw new BridgeValidationError(`${field} must be a non-empty string`);
  }
  return value.trim();
}

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BridgeValidationError(`${label} must be an object`);
  }
}

function uniqueIds(values, label) {
  const ids = new Set();
  for (const value of values) {
    const id = nonEmptyString(value?.id, `${label}.id`);
    if (ids.has(id)) throw new BridgeValidationError(`Duplicate ${label} ID: ${id}`);
    ids.add(id);
  }
  return ids;
}

function clampInteger(value, fallback, min, max) {
  const parsed = Number.isInteger(value) ? value : fallback;
  return Math.min(max, Math.max(min, parsed));
}
