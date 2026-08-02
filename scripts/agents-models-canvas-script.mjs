/**
 * Agents / Models domain — tldraw Offline document script.
 *
 * Contract: export default function ({ editor, helpers, signal })
 * Pure logic is exported for DOM-free node:test coverage (no tldraw runtime).
 *
 * Network bridge: loopback grok-config-service on 127.0.0.1:5188.
 */

// ---------------------------------------------------------------------------
// Auth token policy (see DECISIONS_LOG.md D-046)
// - Default: script constant placeholder (operators paste token from service
//   stderr / GROK_CONFIG_TOKEN env).
// - Override: globalThis.__AM_GROK_CONFIG_TOKEN__ if set at runtime.
// - Documented alternate: operators may keep the token in a file beside the
//   service (e.g. ~/.grok/config-service.token) and paste/sync it into the
//   constant or global; document scripts cannot read the filesystem.
// ---------------------------------------------------------------------------
export const GROK_CONFIG_TOKEN = "REPLACE_WITH_GROK_CONFIG_TOKEN";
export const GROK_CONFIG_BASE = "http://127.0.0.1:5188";

export const PRESET_IDS = [
  "single",
  "fanout",
  "reduce",
  "loop",
  "dag",
  "dynamic",
  "mesh",
];

export const ID_NS = "am";
export const AGENTS_MODELS_SHAPE_TYPE = "agents-models-node";
export const AGENTS_MODELS_PAGE_NAME = "Agents/Models";
export const AGENTS_MODELS_PAGE_ID = "page:canvapocalypse-agents-models";

/** Dark operational layout constants (notation ADR). */
export const LAYOUT = {
  originX: 80,
  originY: 80,
  // Lane gaps: TOOLBAR | gap | STAGE/SUBAGENT | gap | CATALOG
  toolbar: { x: 80, y: 80, w: 240, h: 610 },
  stageLane: { x: 370, y: 80, w: 1040, h: 290 },
  // vertical gap between STAGE and SUBAGENT lanes >= 60
  subagentLane: { x: 370, y: 430, w: 1040, h: 840 },
  catalog: { x: 1450, y: 80, w: 420, h: 840 },
  buttonW: 220,
  buttonH: 36,
  buttonGap: 10,
  // Stage / subagent nodes — mins from layout task (160x64 / 120x120 / +N more 120x48)
  stageNodeW: 260,
  stageNodeH: 175,
  stageHeaderH: 36,
  stageDividerH: 1,
  stageBodyRowH: 16,
  stageFooterH: 16,
  stagePadX: 10,
  stagePadY: 8,
  subagentW: 220,
  subagentH: 175,
  /** @deprecated use subagentW — kept for any external readers */
  subagentR: 220,
  moreNodeW: 180,
  moreNodeH: 175,
  statusDot: 6,
  portSize: 6,
  laneLabelSize: "s", // ~10px in tldraw size scale
  laneLabelInset: 12,
  colGap: 80,
  rowGap: 40,
  minNodeGap: 40,
  cardLabelTruncate: 22,
  catalogPad: 16,
  catalogHeaderH: 22,
  catalogRowW: 320,
  catalogRowH: 24,
  catalogRowGap: 4,
  catalogSectionGap: 12,
  catalogMaxRows: 8,
  catalogTruncateAt: 38,
};

// ---------------------------------------------------------------------------
// Pure: layout
// ---------------------------------------------------------------------------

/**
 * Compute furniture + lane positions. `shapes` is optional prior state for
 * idempotent offsets; currently layout is fixed operational grid.
 * @param {Array<{id?: string, type?: string, meta?: object}>} [shapes]
 * @returns {{
 *   stageLane: {x:number,y:number,w:number,h:number},
 *   subagentLane: {x:number,y:number,w:number,h:number},
 *   catalog: {x:number,y:number,w:number,h:number},
 *   toolbar: {x:number,y:number,w:number,h:number},
 *   buttons: Array<{id:string, label:string, x:number, y:number, w:number, h:number, kind:string}>,
 *   stageOrigin: {x:number,y:number},
 *   subagentOrigin: {x:number,y:number},
 * }}
 */
export function layoutLanes(shapes = []) {
  void shapes;
  const L = LAYOUT;
  const buttons = [];
  let by = L.toolbar.y + 48;
  for (const id of PRESET_IDS) {
    buttons.push({
      id: `${ID_NS}-btn-preset-${id}`,
      label: id.toUpperCase(),
      x: L.toolbar.x + 10,
      y: by,
      w: L.buttonW,
      h: L.buttonH,
      kind: "preset",
      presetId: id,
    });
    by += L.buttonH + L.buttonGap;
  }
  by += L.buttonGap;
  buttons.push({
    id: `${ID_NS}-btn-apply`,
    label: "APPLY",
    x: L.toolbar.x + 10,
    y: by,
    w: L.buttonW,
    h: L.buttonH,
    kind: "apply",
  });
  by += L.buttonH + L.buttonGap;
  buttons.push({
    id: `${ID_NS}-btn-play`,
    label: "PLAY",
    x: L.toolbar.x + 10,
    y: by,
    w: L.buttonW,
    h: L.buttonH,
    kind: "play",
  });

  const labelInset = L.laneLabelInset ?? 12;
  return {
    stageLane: { ...L.stageLane },
    subagentLane: { ...L.subagentLane },
    catalog: { ...L.catalog },
    toolbar: { ...L.toolbar },
    buttons,
    stageOrigin: {
      x: L.stageLane.x + 40,
      y: L.stageLane.y + labelInset + 28,
    },
    subagentOrigin: {
      x: L.subagentLane.x + 40,
      y: L.subagentLane.y + labelInset + 36,
    },
  };
}

/**
 * Truncate catalog row labels to a single line with ellipsis.
 * At most `at` characters before the ellipsis; result length is <= at+1.
 * @param {string} text
 * @param {number} [at]
 */
export function truncateCatalogLabel(text, at = LAYOUT.catalogTruncateAt) {
  const s = String(text ?? "");
  if (s.length <= at) return s;
  if (at <= 0) return "…";
  return `${s.slice(0, at)}…`;
}

// ---------------------------------------------------------------------------
// Pure: catalog → node specs
// ---------------------------------------------------------------------------

/**
 * Availability color for status dots (tldraw color token names).
 * liveMatch true → green; false with proxy ok → orange; proxy down → red; unknown → grey
 */
export function availabilityColor(slot, proxy) {
  if (proxy && proxy.ok === false) return "red";
  if (slot && slot.liveMatch === true) return "green";
  if (slot && slot.liveMatch === false) return "orange";
  return "grey";
}

/**
 * @param {object|null} catalog
 * @param {{x:number,y:number,w:number,h:number}} [frame]
 * @returns {Array<object>} node specs (not live shapes)
 */
export function catalogToNodes(catalog, frame = LAYOUT.catalog) {
  if (!catalog || typeof catalog !== "object") {
    return [catalogErrorNode("catalog_missing", "Catalog payload missing.", frame)];
  }

  const nodes = [];
  const pad = LAYOUT.catalogPad;
  const rowW = Math.min(LAYOUT.catalogRowW, frame.w - pad * 2);
  const rowH = LAYOUT.catalogRowH;
  const rowGap = LAYOUT.catalogRowGap;
  const maxRows = LAYOUT.catalogMaxRows;
  const headerH = LAYOUT.catalogHeaderH;
  const x = frame.x + pad;
  let y = frame.y + 40;
  const proxy = catalog.models?.proxy ?? null;
  const slots = Array.isArray(catalog.models?.slots) ? catalog.models.slots : [];
  const agents = Array.isArray(catalog.agents) ? catalog.agents : [];
  const personas = Array.isArray(catalog.personas) ? catalog.personas : [];
  const roles = Array.isArray(catalog.roles) ? catalog.roles : [];

  /**
   * Append a collapsible-style section: header + up to maxRows item rows + optional +N more.
   * @param {string} sectionKey
   * @param {string} title
   * @param {Array<object>} items
   * @param {(item: object, index: number) => object} mapItem
   */
  const appendSection = (sectionKey, title, items, mapItem) => {
    nodes.push({
      id: `${ID_NS}-catalog-header-${sectionKey}`,
      kind: "header",
      x,
      y,
      w: rowW,
      h: headerH,
      text: title,
      color: "grey",
      meta: { am: { role: "catalog-header", section: sectionKey } },
    });
    y += headerH + 6;

    const visible = items.slice(0, maxRows);
    const hidden = items.length - visible.length;
    for (let i = 0; i < visible.length; i++) {
      const mapped = mapItem(items[i], i);
      nodes.push({
        ...mapped,
        x,
        y,
        w: rowW,
        h: rowH,
      });
      y += rowH + rowGap;
    }
    if (hidden > 0) {
      nodes.push({
        id: `${ID_NS}-catalog-more-${sectionKey}`,
        kind: "catalog-more",
        x,
        y,
        w: rowW,
        h: rowH,
        text: `+${hidden} more`,
        color: "grey",
        dash: "dashed",
        meta: {
          am: {
            role: "catalog-more",
            section: sectionKey,
            hidden,
          },
        },
      });
      y += rowH + rowGap;
    }
    y += LAYOUT.catalogSectionGap;
  };

  appendSection("models", "MODELS", slots, (slot) => {
    const name = slot.name || slot.id || "slot";
    const modelId = slot.model || "—";
    const color = availabilityColor(slot, proxy);
    const raw = `${name} · ${modelId}`;
    return {
      id: `${ID_NS}-catalog-slot-${slot.id}`,
      kind: "model-slot",
      text: truncateCatalogLabel(raw),
      color: "grey",
      statusDot: {
        color,
        size: LAYOUT.statusDot,
        liveMatch: Boolean(slot.liveMatch),
      },
      meta: {
        am: {
          role: "model-slot",
          slotId: slot.id,
          model: slot.model ?? null,
          liveMatch: Boolean(slot.liveMatch),
        },
      },
    };
  });

  appendSection("agents", "AGENTS", agents, (agent) => ({
    id: `${ID_NS}-catalog-agent-${agent.id}`,
    kind: "agent",
    text: truncateCatalogLabel(
      `${agent.id}${agent.modelRef ? ` · ${agent.modelRef}` : ""}`,
    ),
    color: "grey",
    meta: {
      am: {
        role: "agent",
        agentId: agent.id,
        modelRef: agent.modelRef ?? null,
      },
    },
  }));

  appendSection("personas", "PERSONAS", personas, (persona) => ({
    id: `${ID_NS}-catalog-persona-${persona.id}`,
    kind: "persona",
    text: truncateCatalogLabel(
      `${persona.id}${persona.modelRef ? ` · ${persona.modelRef}` : ""}`,
    ),
    color: "grey",
    meta: {
      am: {
        role: "persona",
        personaId: persona.id,
        modelRef: persona.modelRef ?? null,
      },
    },
  }));

  appendSection("roles", "ROLES", roles, (role) => {
    const id = role.id || role.name || "role";
    const label = role.name || role.id || "role";
    return {
      id: `${ID_NS}-catalog-role-${id}`,
      kind: "role",
      text: truncateCatalogLabel(label),
      color: "grey",
      meta: {
        am: {
          role: "role",
          roleId: id,
        },
      },
    };
  });

  // Attach computed content height on the last node's meta for frame sizing helpers.
  const contentBottom = y - LAYOUT.catalogSectionGap;
  const contentH = Math.max(contentBottom - frame.y, 80);
  if (nodes.length) {
    nodes[0].meta = {
      ...nodes[0].meta,
      am: {
        ...nodes[0].meta?.am,
        catalogContentH: contentH,
      },
    };
  }

  return nodes;
}

/**
 * Collapse the layout-oriented catalog rows into the bounded metadata payload
 * consumed by the native catalog custom shape.
 *
 * @param {Array<object>} nodes
 * @returns {Array<{id:string,label:string,items:Array<object>,hidden:number}>}
 */
export function catalogNodesToSections(nodes = []) {
  const definitions = [
    ["models", "MODELS", "model-slot"],
    ["agents", "AGENTS", "agent"],
    ["personas", "PERSONAS", "persona"],
    ["roles", "ROLES", "role"],
  ];
  return definitions.map(([id, label, role]) => {
    const items = nodes
      .filter((node) => node?.meta?.am?.role === role)
      .map((node) => {
        const [itemLabel, value = ""] = String(node.text || "").split(" · ", 2);
        const itemId =
          node.meta?.am?.slotId ??
          node.meta?.am?.agentId ??
          node.meta?.am?.personaId ??
          node.meta?.am?.roleId ??
          node.id;
        return {
          id: String(itemId),
          label: itemLabel,
          value,
          status: node.statusDot?.color ?? "grey",
        };
      });
    const more = nodes.find(
      (node) =>
        node?.meta?.am?.role === "catalog-more" &&
        node?.meta?.am?.section === id,
    );
    return {
      id,
      label,
      items,
      hidden: Number(more?.meta?.am?.hidden ?? 0),
    };
  });
}

/**
 * Height of CATALOG frame from visible section rows only.
 * @param {Array<object>} nodes from catalogToNodes
 * @param {{pad?:number, headerReserve?:number}} [opts]
 */
export function catalogContentHeight(nodes = [], opts = {}) {
  if (!nodes.length) return 120;
  const pad = opts.pad ?? LAYOUT.catalogPad;
  const headerReserve = opts.headerReserve ?? 40;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    minY = Math.min(minY, n.y);
    maxY = Math.max(maxY, n.y + (n.h || 0));
  }
  return Math.ceil(headerReserve + (maxY - minY) + pad);
}

/**
 * Single error node for catalog/fetch failures (never throw to caller).
 */
export function catalogErrorNode(code, message, frame = LAYOUT.catalog) {
  return {
    id: `${ID_NS}-catalog-error`,
    kind: "error",
    x: frame.x + 16,
    y: frame.y + 48,
    w: frame.w - 32,
    h: 96,
    text: `CATALOG ERROR\n${code}\n${message}`,
    color: "red",
    meta: {
      am: {
        role: "catalog-error",
        code: String(code ?? "error"),
        message: String(message ?? ""),
      },
    },
  };
}


// ---------------------------------------------------------------------------
// Pure: card composition (stage / subagent) — DOM-free shape-spec lists
// ---------------------------------------------------------------------------

/**
 * Truncate a single-line card field value.
 * @param {unknown} text
 * @param {number} [at]
 */
export function truncateCardLabel(text, at = LAYOUT.cardLabelTruncate) {
  const s = String(text ?? "");
  if (s.length <= at) return s;
  if (at <= 1) return "…";
  return `${s.slice(0, Math.max(0, at - 1))}…`;
}

/**
 * Format stage footer micro text from edge degrees.
 * @param {number} inCount
 * @param {number} outCount
 */
export function formatPortFooter(inCount, outCount) {
  const inn = Math.max(0, Number(inCount) || 0);
  const out = Math.max(0, Number(outCount) || 0);
  return `${inn} IN · ${out} OUT`;
}

/**
 * Map availability / status to a tldraw color token for 6px status dots.
 * green available · grey unknown · red unavailable (orange when liveMatch false).
 * @param {string|boolean|null|undefined|{liveMatch?: boolean}} status
 * @param {{ok?: boolean}|null} [proxy]
 */
export function cardStatusColor(status, proxy = null) {
  if (proxy && proxy.ok === false) return "red";
  if (status && typeof status === "object") {
    return availabilityColor(status, proxy);
  }
  if (status === "available" || status === true) return "green";
  if (status === "unavailable" || status === false) return "red";
  if (status === "orange" || status === "degraded") return "orange";
  if (
    status === "green" ||
    status === "red" ||
    status === "grey" ||
    status === "orange"
  ) {
    return status;
  }
  return "grey";
}

/**
 * Build structured stage card shape specs (outer card + header + divider +
 * body rows + footer + left/right port dots). Ids share prefix `spec.id`.
 *
 * @param {{
 *   id: string,
 *   x: number,
 *   y: number,
 *   w?: number,
 *   h?: number,
 *   label?: string,
 *   semantics?: string,
 *   modelSlot?: string,
 *   persona?: string,
 *   inCount?: number,
 *   outCount?: number,
 *   dash?: string,
 *   color?: string,
 *   meta?: object,
 * }} spec
 * @returns {object[]}
 */
export function makeStageCard(spec) {
  const id = String(spec?.id || `${ID_NS}-stage`);
  const x = Number(spec?.x ?? 0);
  const y = Number(spec?.y ?? 0);
  const w = Number(spec?.w ?? LAYOUT.stageNodeW);
  const h = Number(spec?.h ?? LAYOUT.stageNodeH);
  const label = String(spec?.label ?? "STAGE");
  const semanticsRaw = String(spec?.semantics ?? "task");
  const semantics = semanticsRaw.toUpperCase();
  const modelSlot = truncateCardLabel(spec?.modelSlot ?? "—");
  const persona = truncateCardLabel(spec?.persona ?? "—");
  const inCount = Number(spec?.inCount ?? 0);
  const outCount = Number(spec?.outCount ?? 0);
  const footer = formatPortFooter(inCount, outCount);
  const dash = spec?.dash === "dashed" ? "dashed" : "solid";
  const color = spec?.color ?? "grey";
  const baseMeta = spec?.meta?.am ? spec.meta : { am: { ...(spec?.meta ?? {}) } };
  const amBase = {
    domain: "agents-models",
    ...(baseMeta.am || {}),
    nodeId: id,
    card: "stage",
    label,
    subtitle: semantics,
    modelSlot,
    persona,
    inCount,
    outCount,
  };

  const padX = LAYOUT.stagePadX;
  const padY = LAYOUT.stagePadY;
  const headerH = LAYOUT.stageHeaderH;
  const divH = LAYOUT.stageDividerH;
  const bodyTop = y + padY + headerH + 4;
  const footerY = y + h - padY - LAYOUT.stageFooterH;
  const port = LAYOUT.portSize ?? LAYOUT.statusDot;
  const midY = y + h / 2 - port / 2;

  const part = (suffix, role, fields) => ({
    id: `${id}-${suffix}`,
    kind: role === "stage" ? "stage" : role,
    color,
    dash,
    meta: {
      am: {
        ...amBase,
        role,
        part: suffix,
        stageType: amBase.stageType ?? null,
      },
    },
    ...fields,
  });

  return [
    part("card", "stage", {
      geo: "rectangle",
      shapeType: "geo",
      x,
      y,
      w,
      h,
      // Keep summary text on the card for graph/tests; visual header is separate.
      text: `${label}\n${semanticsRaw}`,
      fill: "semi",
      font: "mono",
      align: "start",
      verticalAlign: "top",
      size: "s",
    }),
    part("header", "stage-header", {
      geo: "rectangle",
      shapeType: "geo",
      x: x + padX,
      y: y + padY,
      w: w - padX * 2,
      h: headerH,
      text: `${label}\n${semantics}`,
      fill: "none",
      font: "mono",
      align: "start",
      verticalAlign: "middle",
      size: "s",
    }),
    part("divider", "stage-divider", {
      geo: "rectangle",
      shapeType: "geo",
      x: x + padX,
      y: y + padY + headerH + 2,
      w: w - padX * 2,
      h: divH,
      text: "",
      fill: "solid",
      font: "mono",
      size: "s",
    }),
    part("body", "stage-body", {
      geo: "rectangle",
      shapeType: "geo",
      x: x + padX,
      y: bodyTop,
      w: w - padX * 2,
      h: Math.max(LAYOUT.stageBodyRowH * 2, footerY - bodyTop - 4),
      text: `MODEL  ${modelSlot}\nPERSONA  ${persona}`,
      fill: "none",
      font: "mono",
      align: "start",
      verticalAlign: "top",
      size: "s",
    }),
    part("footer", "stage-footer", {
      geo: "rectangle",
      shapeType: "geo",
      x: x + padX,
      y: footerY,
      w: w - padX * 2,
      h: LAYOUT.stageFooterH,
      text: footer,
      fill: "none",
      font: "mono",
      align: "start",
      verticalAlign: "middle",
      size: "s",
      inCount,
      outCount,
    }),
    part("port-in", "port", {
      geo: "ellipse",
      shapeType: "geo",
      x: x - port / 2,
      y: midY,
      w: port,
      h: port,
      text: "",
      fill: "solid",
      port: "in",
      size: "s",
    }),
    part("port-out", "port", {
      geo: "ellipse",
      shapeType: "geo",
      x: x + w - port / 2,
      y: midY,
      w: port,
      h: port,
      text: "",
      fill: "solid",
      port: "out",
      size: "s",
    }),
  ];
}

/**
 * Build compact subagent card: name + caps role subtitle + 6px status dot + ports.
 *
 * @param {{
 *   id: string,
 *   x: number,
 *   y: number,
 *   w?: number,
 *   h?: number,
 *   label?: string,
 *   name?: string,
 *   roleLabel?: string,
 *   status?: string|boolean|object,
 *   statusColor?: string,
 *   inCount?: number,
 *   outCount?: number,
 *   dash?: string,
 *   color?: string,
 *   variable?: boolean,
 *   meta?: object,
 * }} spec
 * @returns {object[]}
 */
export function makeSubagentCard(spec) {
  const id = String(spec?.id || `${ID_NS}-sub`);
  const x = Number(spec?.x ?? 0);
  const y = Number(spec?.y ?? 0);
  const w = Number(spec?.w ?? LAYOUT.subagentW);
  const h = Number(spec?.h ?? LAYOUT.subagentH);
  const name = String(spec?.name ?? spec?.label ?? "agent");
  const roleLabel = String(
    spec?.roleLabel ?? (spec?.variable ? "VARIABLE" : "WORKER"),
  ).toUpperCase();
  const dash = spec?.dash === "dashed" ? "dashed" : "solid";
  const color = spec?.color ?? "grey";
  const statusColor =
    spec?.statusColor ?? cardStatusColor(spec?.status ?? "unknown");
  const inCount = Number(spec?.inCount ?? 0);
  const outCount = Number(spec?.outCount ?? 0);
  const baseMeta = spec?.meta?.am ? spec.meta : { am: { ...(spec?.meta ?? {}) } };
  const amBase = {
    domain: "agents-models",
    ...(baseMeta.am || {}),
    nodeId: id,
    card: "subagent",
    label: name,
    roleLabel,
    statusColor,
    inCount,
    outCount,
  };

  const padX = 8;
  const padY = 6;
  const port = LAYOUT.portSize ?? LAYOUT.statusDot;
  const midY = y + h / 2 - port / 2;
  const dot = LAYOUT.statusDot;

  const part = (suffix, role, fields) => ({
    id: `${id}-${suffix}`,
    kind: role === "subagent" ? "subagent" : role,
    color,
    dash,
    meta: {
      am: {
        ...amBase,
        role,
        part: suffix,
        stageType: amBase.stageType ?? null,
        label: name,
        variable: Boolean(spec?.variable),
      },
    },
    ...fields,
  });

  return [
    part("card", "subagent", {
      geo: "rectangle",
      shapeType: "geo",
      x,
      y,
      w,
      h,
      text: name,
      fill: "semi",
      font: "mono",
      align: "start",
      verticalAlign: "middle",
      size: "s",
    }),
    part("header", "subagent-header", {
      geo: "rectangle",
      shapeType: "geo",
      x: x + padX,
      y: y + padY,
      w: w - padX * 2 - dot - 8,
      h: h - padY * 2,
      text: `${name}\n${roleLabel}`,
      fill: "none",
      font: "mono",
      align: "start",
      verticalAlign: "middle",
      size: "s",
    }),
    part("status", "subagent-status", {
      geo: "ellipse",
      shapeType: "geo",
      x: x + w - padX - dot,
      y: y + padY + 4,
      w: dot,
      h: dot,
      text: "",
      fill: "solid",
      color: statusColor,
      size: "s",
    }),
    part("port-in", "port", {
      geo: "ellipse",
      shapeType: "geo",
      x: x - port / 2,
      y: midY,
      w: port,
      h: port,
      text: "",
      fill: "solid",
      port: "in",
      size: "s",
    }),
    part("port-out", "port", {
      geo: "ellipse",
      shapeType: "geo",
      x: x + w - port / 2,
      y: midY,
      w: port,
      h: port,
      text: "",
      fill: "solid",
      port: "out",
      size: "s",
    }),
  ];
}

/**
 * Port shape ids for a logical node id (card group prefix).
 * @param {string} nodeId
 */
export function portIdsForNode(nodeId) {
  return {
    in: `${nodeId}-port-in`,
    out: `${nodeId}-port-out`,
  };
}

// ---------------------------------------------------------------------------
// Pure: preset instantiation → shape + arrow specs
// ---------------------------------------------------------------------------

/**
 * Evenly space items as a single vertical column (left-to-right layered graph).
 * @param {Array<{id:string,w:number,h:number}>} items
 * @param {number} x left of column
 * @param {number} topY top of first item
 * @param {number} [gap] vertical gap between item boxes
 * @returns {Map<string,{x:number,y:number,w:number,h:number}>}
 */
export function packColumn(items, x, topY, gap = LAYOUT.rowGap) {
  const out = new Map();
  let y = topY;
  for (const item of items) {
    out.set(item.id, { x, y, w: item.w, h: item.h });
    y += item.h + gap;
  }
  return out;
}

/**
 * Compact grid pack: cols = ceil(sqrt(n)). Used for mesh workers.
 * @param {Array<{id:string,w:number,h:number}>} items
 * @param {number} originX
 * @param {number} originY
 * @param {number} [gap]
 * @returns {Map<string,{x:number,y:number,w:number,h:number}>}
 */
export function packGrid(items, originX, originY, gap = LAYOUT.rowGap) {
  const out = new Map();
  const n = items.length;
  if (n === 0) return out;
  const cols = Math.ceil(Math.sqrt(n));
  const maxW = Math.max(...items.map((i) => i.w));
  const maxH = Math.max(...items.map((i) => i.h));
  items.forEach((item, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    out.set(item.id, {
      x: originX + col * (maxW + gap),
      y: originY + row * (maxH + gap),
      w: item.w,
      h: item.h,
    });
  });
  return out;
}

/**
 * Deterministic layered (column-per-depth) placement.
 * depths: array of layers; each layer is { mode: 'column'|'grid', items: [...] }.
 * @param {Array<{mode?:'column'|'grid', items: Array<{id:string,w:number,h:number}>}>} depths
 * @param {{x:number,y:number}} origin
 * @param {{colGap?:number,rowGap?:number}} [opts]
 * @returns {Map<string,{x:number,y:number,w:number,h:number}>}
 */
export function layoutLayered(depths, origin, opts = {}) {
  const colGap = opts.colGap ?? LAYOUT.colGap;
  const rowGap = opts.rowGap ?? LAYOUT.rowGap;
  const positions = new Map();
  let x = origin.x;
  for (const layer of depths) {
    const items = layer.items || [];
    if (!items.length) continue;
    const mode = layer.mode || "column";
    const pack =
      mode === "grid"
        ? packGrid(items, x, origin.y, rowGap)
        : packColumn(items, x, origin.y, rowGap);
    let maxRight = x;
    for (const [id, pos] of pack) {
      positions.set(id, pos);
      maxRight = Math.max(maxRight, pos.x + pos.w);
    }
    x = maxRight + colGap;
  }
  return positions;
}

/**
 * Build graph skeleton specs for a preset.
 * @param {{id:string, stageType?:string, title?:string, script?:string}|string} preset
 * @param {{x:number,y:number,stageY?:number,subagentY?:number}} origin
 * @returns {{shapes: object[], arrows: object[], graph: object}}
 */
export function instantiatePreset(preset, origin = {}) {
  const presetId = typeof preset === "string" ? preset : preset?.id;
  if (!presetId || !PRESET_IDS.includes(presetId)) {
    throw new Error(`Unknown preset id: ${presetId}`);
  }
  const stageType =
    (typeof preset === "object" && preset?.stageType) ||
    defaultStageType(presetId);
  const script =
    typeof preset === "object" && typeof preset.script === "string"
      ? preset.script
      : null;

  const ox = Number(origin.x ?? LAYOUT.stageLane.x + 40);
  const stageY = Number(origin.stageY ?? origin.y ?? LAYOUT.stageLane.y + 40);
  const subY = Number(origin.subagentY ?? LAYOUT.subagentLane.y + 48);

  /** @type {Array<object>} */
  const nodeDefs = [];
  const arrows = [];
  const stamp = {
    domain: "agents-models",
    presetId,
    stageType,
    unmodified: true,
  };

  const stageW = LAYOUT.stageNodeW;
  const stageH = LAYOUT.stageNodeH;
  const subW = LAYOUT.subagentW;
  const subH = LAYOUT.subagentH;
  const moreW = LAYOUT.moreNodeW;
  const moreH = LAYOUT.moreNodeH;

  const stage = (localId, label, semantics, x, y, extra = {}) => {
    const id = `${ID_NS}-wf-${presetId}-stage-${localId}`;
    nodeDefs.push({
      kind: "stage",
      id,
      localId,
      label,
      semantics,
      x,
      y,
      w: stageW,
      h: stageH,
      extra,
    });
    return id;
  };

  const sub = (localId, label, x, y, extra = {}) => {
    const id = `${ID_NS}-wf-${presetId}-sub-${localId}`;
    const isMore = label === "+N more" || Boolean(extra.variable);
    const w = isMore ? moreW : subW;
    const h = isMore ? moreH : subH;
    nodeDefs.push({
      kind: "subagent",
      id,
      localId,
      label,
      x,
      y,
      w,
      h,
      extra: {
        ...extra,
        variable: Boolean(extra.variable) || isMore,
        roleLabel: extra.roleLabel ?? (isMore ? "VARIABLE" : "WORKER"),
      },
    });
    return id;
  };

  const arrow = (from, to, opts = {}) => {
    const portsFrom = portIdsForNode(from);
    const portsTo = portIdsForNode(to);
    arrows.push({
      id: `${ID_NS}-wf-${presetId}-arr-${arrows.length}`,
      fromNode: from,
      toNode: to,
      // Bind to port dots so edges attach at card edges, not centers.
      from: portsFrom.out,
      to: portsTo.in,
      dash: opts.dash === "dashed" ? "dashed" : "solid",
      label: opts.label ?? "",
      kind: opts.kind ?? "flow",
      meta: {
        am: {
          ...stamp,
          role: "arrow",
          kind: opts.kind ?? "flow",
          label: opts.label ?? "",
          fromNode: from,
          toNode: to,
        },
      },
    });
  };

  /** Place stage + related subagents using layered columns. */
  const place = (depths) => layoutLayered(depths, { x: ox, y: stageY });

  switch (presetId) {
    case "single": {
      // col0 stage, col1 worker (worker y anchored to subagent lane when possible)
      const pos = place([
        { items: [{ id: "main", w: stageW, h: stageH }] },
        { items: [{ id: "w0", w: subW, h: subH }] },
      ]);
      const s = stage(
        "main",
        "STAGE",
        "task",
        pos.get("main").x,
        pos.get("main").y,
        { stageType: "single" },
      );
      const w = sub("w0", "worker", pos.get("w0").x, Math.max(pos.get("w0").y, subY));
      arrow(s, w);
      break;
    }
    case "fanout": {
      const gap = LAYOUT.rowGap;
      const rowWidth = subW * 2 + moreW + gap * 2;
      const stageX = ox + (rowWidth - stageW) / 2;
      const s = stage(
        "foreach",
        "FOREACH",
        "foreach",
        stageX,
        stageY,
        { stageType: "foreach" },
      );
      const a = sub("w0", "w0", ox, subY);
      const b = sub("w1", "w1", ox + subW + gap, subY);
      const more = sub(
        "more",
        "+N more",
        ox + subW * 2 + gap * 2,
        subY,
        { dash: "dashed", variable: true },
      );
      arrow(s, a, { kind: "fan-out" });
      arrow(s, b, { kind: "fan-out" });
      arrow(s, more, { kind: "fan-out", dash: "dashed" });
      break;
    }
    case "reduce": {
      // workers first (sources), then reduce stage — BFS from worker sources
      const pos = layoutLayered(
        [
          {
            items: [
              { id: "w0", w: subW, h: subH },
              { id: "w1", w: subW, h: subH },
            ],
          },
          { items: [{ id: "reduce", w: stageW, h: stageH }] },
        ],
        { x: ox, y: subY },
      );
      // stage stays in STAGE lane
      const a = sub("w0", "w0", pos.get("w0").x, pos.get("w0").y);
      const b = sub("w1", "w1", pos.get("w1").x, pos.get("w1").y);
      const r = stage(
        "reduce",
        "REDUCE",
        "reduce",
        pos.get("reduce").x,
        stageY,
        { stageType: "reduce" },
      );
      arrow(a, r, { kind: "fan-in" });
      arrow(b, r, { kind: "fan-in" });
      break;
    }
    case "loop": {
      const pos = place([
        { items: [{ id: "loop", w: stageW, h: stageH }] },
        { items: [{ id: "w0", w: subW, h: subH }] },
      ]);
      const s = stage("loop", "LOOP", "loop", pos.get("loop").x, pos.get("loop").y, {
        stageType: "loop",
      });
      const w = sub("w0", "worker", pos.get("w0").x, Math.max(pos.get("w0").y, subY));
      arrow(s, w, { kind: "flow" });
      arrow(w, s, { kind: "loop-back", label: "retry" });
      break;
    }
    case "dag": {
      // BFS depths: scout(0) → impl(1) → review(2); each stage has a worker column sibling row in sub lane
      const stagePos = layoutLayered(
        [
          { items: [{ id: "scout", w: stageW, h: stageH }] },
          { items: [{ id: "impl", w: stageW, h: stageH }] },
          { items: [{ id: "review", w: stageW, h: stageH }] },
        ],
        { x: ox, y: stageY },
      );
      const workerPos = layoutLayered(
        [
          { items: [{ id: "scout", w: subW, h: subH }] },
          { items: [{ id: "impl", w: subW, h: subH }] },
          { items: [{ id: "review", w: subW, h: subH }] },
        ],
        { x: ox, y: subY },
      );
      const s0 = stage(
        "scout",
        "SCOUT",
        "dag",
        stagePos.get("scout").x,
        stagePos.get("scout").y,
        { stageType: "dag" },
      );
      const s1 = stage(
        "impl",
        "IMPLEMENT",
        "dag",
        stagePos.get("impl").x,
        stagePos.get("impl").y,
        { stageType: "dag" },
      );
      const s2 = stage(
        "review",
        "REVIEW",
        "dag",
        stagePos.get("review").x,
        stagePos.get("review").y,
        { stageType: "dag" },
      );
      const w0 = sub("scout", "scout", workerPos.get("scout").x, workerPos.get("scout").y, {
        roleLabel: "SCOUT",
      });
      const w1 = sub(
        "impl",
        "implementer",
        workerPos.get("impl").x,
        workerPos.get("impl").y,
        { roleLabel: "IMPLEMENTER" },
      );
      const w2 = sub(
        "review",
        "reviewer",
        workerPos.get("review").x,
        workerPos.get("review").y,
        { roleLabel: "REVIEWER" },
      );
      arrow(s0, w0);
      arrow(s0, s1, { kind: "chain" });
      arrow(s1, w1);
      arrow(s1, s2, { kind: "chain" });
      arrow(s2, w2);
      break;
    }
    case "dynamic": {
      const pos = place([
        { items: [{ id: "ctrl", w: stageW, h: stageH }] },
        { items: [{ id: "plan", w: stageW, h: stageH }] },
        { items: [{ id: "w0", w: subW, h: subH }] },
      ]);
      const ctrl = stage(
        "ctrl",
        "CONTROLLER",
        "dynamic",
        pos.get("ctrl").x,
        pos.get("ctrl").y,
        { stageType: "dynamic" },
      );
      const plan = stage(
        "plan",
        "PLANNER",
        "dynamic",
        pos.get("plan").x,
        pos.get("plan").y,
        { stageType: "dynamic" },
      );
      const w = sub("w0", "worker", pos.get("w0").x, Math.max(pos.get("w0").y, subY));
      arrow(ctrl, plan, { kind: "control" });
      arrow(plan, w, { kind: "flow" });
      arrow(w, ctrl, {
        kind: "control",
        dash: "dashed",
        label: "adjust",
      });
      // enough path is a dashed note-edge from controller (self-signal placeholder)
      arrow(ctrl, plan, {
        kind: "control",
        dash: "dashed",
        label: "enough",
      });
      break;
    }
    case "mesh": {
      // 9 workers in compact grid (ceil(sqrt(9))=3); +N more sits under the grid (not in sqrt pack)
      const workerCount = 9;
      const workerItems = [];
      for (let i = 0; i < workerCount; i++) {
        workerItems.push({ id: `w${i}`, w: subW, h: subH });
      }

      const meshOnly = layoutLayered(
        [{ items: [{ id: "mesh", w: stageW, h: stageH }] }],
        { x: ox, y: stageY },
        { colGap: LAYOUT.colGap, rowGap: LAYOUT.rowGap },
      );
      const meshRight = meshOnly.get("mesh").x + stageW + LAYOUT.colGap;
      const workerPack = packGrid(workerItems, meshRight, subY, LAYOUT.rowGap);
      let gridRight = meshRight;
      let gridBottom = subY;
      for (const p of workerPack.values()) {
        gridRight = Math.max(gridRight, p.x + p.w);
        gridBottom = Math.max(gridBottom, p.y + p.h);
      }
      const morePos = {
        x: meshRight,
        y: gridBottom + LAYOUT.rowGap,
        w: moreW,
        h: moreH,
      };
      gridRight = Math.max(gridRight, morePos.x + morePos.w);
      const reduceX = gridRight + LAYOUT.colGap;

      const mesh = stage(
        "mesh",
        "MESH",
        "mesh",
        meshOnly.get("mesh").x,
        meshOnly.get("mesh").y,
        { stageType: "mesh" },
      );
      const reduce = stage(
        "reduce",
        "REDUCE",
        "reduce",
        reduceX,
        stageY,
        { stageType: "reduce" },
      );

      const workerIds = [];
      for (let i = 0; i < workerCount; i++) {
        const p = workerPack.get(`w${i}`);
        const id = sub(`w${i}`, `w${i}`, p.x, p.y);
        workerIds.push(id);
        arrow(mesh, id, { kind: "fan-out" });
        arrow(id, reduce, { kind: "fan-in" });
      }
      const more = sub("more", "+N more", morePos.x, morePos.y, {
        dash: "dashed",
        variable: true,
      });
      arrow(mesh, more, { kind: "fan-out", dash: "dashed" });
      arrow(more, reduce, { kind: "fan-in", dash: "dashed" });

      // sparse peer review edges on the first row of the grid (w0-w1-w2 cycle)
      if (workerIds.length >= 3) {
        arrow(workerIds[0], workerIds[1], {
          kind: "mesh",
          dash: "dashed",
          label: "review",
        });
        arrow(workerIds[1], workerIds[2], {
          kind: "mesh",
          dash: "dashed",
          label: "review",
        });
        arrow(workerIds[2], workerIds[0], {
          kind: "mesh",
          dash: "dashed",
          label: "review",
        });
      }
      break;
    }
    default:
      break;
  }

  // Materialize card groups with footer degrees from actual edges.
  const shapes = [];
  for (const n of nodeDefs) {
    const inCount = arrows.filter((a) => a.toNode === n.id).length;
    const outCount = arrows.filter((a) => a.fromNode === n.id).length;
    if (n.kind === "stage") {
      const st = n.extra.stageType ?? stageType;
      shapes.push(
        ...makeStageCard({
          id: n.id,
          x: n.x,
          y: n.y,
          w: n.w,
          h: n.h,
          label: n.label,
          semantics: n.semantics,
          modelSlot: n.extra.modelSlot ?? "default",
          persona: n.extra.persona ?? "—",
          inCount,
          outCount,
          dash: n.extra.dash,
          meta: {
            am: {
              ...stamp,
              role: "stage",
              stageLocalId: n.localId,
              stageType: st,
              semantics: n.semantics,
              label: n.label,
              inCount,
              outCount,
            },
          },
        }),
      );
    } else {
      shapes.push(
        ...makeSubagentCard({
          id: n.id,
          x: n.x,
          y: n.y,
          w: n.w,
          h: n.h,
          label: n.label,
          name: n.label,
          roleLabel: n.extra.roleLabel,
          variable: Boolean(n.extra.variable),
          dash: n.extra.dash,
          status: n.extra.status ?? "unknown",
          statusColor: n.extra.statusColor,
          inCount,
          outCount,
          meta: {
            am: {
              ...stamp,
              role: "subagent",
              subLocalId: n.localId,
              label: n.label,
              variable: Boolean(n.extra.variable),
            },
          },
        }),
      );
    }
  }

  const graph = {
    name: suggestWorkflowName(presetId),
    presetId,
    stageType,
    unmodified: true,
    presetScript: script,
    stages: shapes.filter((s) => s.kind === "stage"),
    subagents: shapes.filter((s) => s.kind === "subagent"),
    arrows,
  };

  return { shapes, arrows, graph };
}

function defaultStageType(presetId) {
  switch (presetId) {
    case "single":
      return "single";
    case "fanout":
      return "foreach";
    case "reduce":
      return "reduce";
    case "loop":
      return "loop";
    case "dag":
      return "dag";
    case "dynamic":
      return "dynamic";
    case "mesh":
      return "mesh";
    default:
      return "single";
  }
}

export function suggestWorkflowName(presetId) {
  return `canvas-${presetId}`;
}

// ---------------------------------------------------------------------------
// Pure: compile workflow graph → rhai
// ---------------------------------------------------------------------------

/**
 * Compile a collected workflow graph to a Rhai script string.
 *
 * Rules:
 * - When graph was preset-instantiated and unmodified and presetScript is
 *   present, reuse the preset script with {{name}} / meta.name filled.
 * - Otherwise emit a best-effort skeleton from stage types + graph.name.
 *
 * @param {{
 *   name?: string,
 *   presetId?: string|null,
 *   stageType?: string|null,
 *   unmodified?: boolean,
 *   presetScript?: string|null,
 *   stages?: Array<object>,
 *   subagents?: Array<object>,
 * }} graph
 * @returns {string}
 */
export function compileWorkflow(graph = {}) {
  const name =
    typeof graph.name === "string" && graph.name.trim()
      ? graph.name.trim()
      : graph.presetId
        ? suggestWorkflowName(graph.presetId)
        : "canvas-workflow";

  if (
    graph.unmodified === true &&
    typeof graph.presetScript === "string" &&
    graph.presetScript.length > 0
  ) {
    return fillPresetScriptName(graph.presetScript, name);
  }

  // Build skeleton from graph topology when modified or no preset script.
  const stageType =
    graph.stageType ||
    graph.stages?.[0]?.meta?.am?.stageType ||
    graph.stages?.[0]?.stageType ||
    "single";
  const presetId = graph.presetId || stageType;
  const header = `// unverified-skeleton — canvas compile; not executed by grok-config
// Compiled from Agents/Models graph (preset=${presetId}, stageType=${stageType}).
let meta = #{
    name: ${rhaiString(name)},
    description: "Canvas-compiled workflow skeleton",
};
`;

  switch (stageType) {
    case "foreach":
    case "fanout":
      return (
        header +
        `
let items = if args.items != () { args.items } else { ["item-1", "item-2"] };
let jobs = [];
for item in items {
    jobs.push(#{
        prompt: "Work on item: " + item,
        options: #{ label: "fanout-" + item },
    });
}
let results = parallel(jobs);
results
`
      );
    case "reduce":
      return (
        header +
        `
let worker_outputs = if args.outputs != () { args.outputs } else { ["a", "b"] };
let synthesis = agent(
    "Synthesize the following worker outputs into one result:\\n" + worker_outputs.to_string(),
    #{ label: "reducer" },
);
synthesis
`
      );
    case "loop":
      return (
        header +
        `
let max_rounds = 3;
let draft = if args.draft != () { args.draft } else { "" };
let critique = ();
for round in 0..max_rounds {
    let attempt = agent(
        "Produce or refine the draft (round " + round.to_string() + "). Prior critique: " + critique.to_string(),
        #{ label: "loop-worker-" + round.to_string() },
    );
    draft = attempt;
    critique = agent(
        "Critique the draft and say whether it is done.",
        #{ label: "loop-critic-" + round.to_string() },
    );
}
draft
`
      );
    case "dag":
      return (
        header +
        `
phase("Scout");
let scout = agent("Scout the task.", #{ label: "scout" });
phase("Implement");
let implementer = agent("Implement based on scout: " + scout.to_string(), #{ label: "implementer" });
phase("Review");
let reviewer = agent("Review: " + implementer.to_string(), #{ label: "reviewer" });
reviewer
`
      );
    case "dynamic":
      return (
        header +
        `
let plan = agent("Plan the next bounded steps: " + args.to_string(), #{ label: "controller" });
let work = agent("Execute the controller plan: " + plan.to_string(), #{ label: "worker" });
work
`
      );
    case "mesh":
      return (
        header +
        `
let n = 3;
let seeds = [];
for i in 0..n { seeds.push("perspective-" + i.to_string()); }
let draft_jobs = [];
for seed in seeds {
    draft_jobs.push(#{ prompt: "Draft from " + seed, options: #{ label: "mesh-draft-" + seed } });
}
let drafts = parallel(draft_jobs);
let final = agent("Reduce mesh drafts: " + drafts.to_string(), #{ label: "mesh-reduce" });
final
`
      );
    case "single":
    default:
      return (
        header +
        `
let result = agent(
    "Do the requested work.",
    #{ label: "worker" },
);
result
`
      );
  }
}

export function fillPresetScriptName(script, name) {
  let out = String(script);
  // Placeholder form used by grok-config-service presets.
  out = out.replaceAll("{{name}}", name);
  // Force meta.name (first occurrence under let meta) to the requested name.
  out = out.replace(
    /(let\s+meta\s*=\s*#\{[\s\S]*?\bname:\s*)"[^"]*"/m,
    `$1${rhaiString(name)}`,
  );
  // Fallback: bare name: "..." near top if meta block missing.
  if (!out.includes(`name: ${rhaiString(name)}`)) {
    out = out.replace(/\bname:\s*"[^"]*"/, `name: ${rhaiString(name)}`);
  }
  return out;
}

function rhaiString(value) {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * Collect a compile graph from lane shape records (or specs).
 * Pure: no editor required.
 */
export function collectWorkflowGraph(shapes = [], opts = {}) {
  const nodes = shapes.filter((s) => {
    const am = s?.meta?.am;
    return am && (am.role === "stage" || am.role === "subagent");
  });
  const stages = nodes.filter((s) => s.meta.am.role === "stage");
  const subagents = nodes.filter((s) => s.meta.am.role === "subagent");
  const presetId =
    opts.presetId ??
    stages[0]?.meta?.am?.presetId ??
    subagents[0]?.meta?.am?.presetId ??
    null;
  const unmodified =
    opts.unmodified ??
    (nodes.length > 0 && nodes.every((s) => s.meta?.am?.unmodified === true));
  const stageType =
    opts.stageType ??
    stages[0]?.meta?.am?.stageType ??
    defaultStageType(presetId || "single");

  return {
    name: opts.name ?? (presetId ? suggestWorkflowName(presetId) : "canvas-workflow"),
    presetId,
    stageType,
    unmodified: Boolean(unmodified),
    presetScript: opts.presetScript ?? null,
    stages,
    subagents,
  };
}

// ---------------------------------------------------------------------------
// Document script helpers (used by default export; still pure-ish)
// ---------------------------------------------------------------------------

export function resolveAuthToken(env = globalThis) {
  const fromGlobal =
    env && typeof env.__AM_GROK_CONFIG_TOKEN__ === "string"
      ? env.__AM_GROK_CONFIG_TOKEN__.trim()
      : "";
  if (fromGlobal) return fromGlobal;
  const constant = String(GROK_CONFIG_TOKEN || "").trim();
  if (constant && constant !== "REPLACE_WITH_GROK_CONFIG_TOKEN") return constant;
  return constant || "";
}

export function authHeaders(token) {
  const headers = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

/** Count helpers for tests. */
export function countSpecs(result) {
  const stages = result.shapes.filter((s) => s.kind === "stage").length;
  const subagents = result.shapes.filter((s) => s.kind === "subagent").length;
  const arrows = result.arrows.length;
  // Count logical dashed subagents (card root only; parts share dash).
  const dashedSubs = result.shapes.filter(
    (s) => s.kind === "subagent" && s.dash === "dashed",
  ).length;
  return { stages, subagents, arrows, dashedSubs, shapes: result.shapes.length };
}

// ---------------------------------------------------------------------------
// Default export — tldraw Offline document script
// ---------------------------------------------------------------------------

/**
 * Create or resolve the domain page before any script-owned shapes are read or
 * written. This keeps Agents/Models furniture out of whichever page happened
 * to be active when the script reloaded.
 *
 * @param {any} editor
 */
export function ensureAgentsModelsPage(editor) {
  const existing = editor
    .getPages?.()
    ?.find((page) => page?.name === AGENTS_MODELS_PAGE_NAME);
  if (existing) return { page: existing, created: false };
  editor.createPage?.({
    id: AGENTS_MODELS_PAGE_ID,
    name: AGENTS_MODELS_PAGE_NAME,
  });
  const created =
    editor.getPage?.(AGENTS_MODELS_PAGE_ID) ??
    editor
      .getPages?.()
      ?.find((page) => page?.name === AGENTS_MODELS_PAGE_NAME);
  if (!created) {
    throw new Error("Could not create the Agents/Models domain page.");
  }
  return { page: created, created: true };
}

/**
 * @param {{ editor: any, helpers: any, signal?: AbortSignal }} ctx
 */
export default function agentsModelsDocumentScript(ctx) {
  const editor = ctx?.editor;
  const helpers = ctx?.helpers ?? {};
  const signal = ctx?.signal ?? ctx?.AbortSignal ?? null;

  if (!editor) {
    // Allow pure import without runtime.
    return { ok: false, reason: "no_editor" };
  }

  const { page: agentsModelsPage, created: pageCreated } =
    ensureAgentsModelsPage(editor);
  editor.setCurrentPage?.(agentsModelsPage.id);

  const createShapeId =
    typeof helpers.createShapeId === "function"
      ? helpers.createShapeId
      : (id) => (id.startsWith("shape:") ? id : `shape:${id}`);

  // Optional toRichText from helpers or global tldraw inject.
  const toRichText =
    helpers.toRichText ||
    globalThis.toRichText ||
    ((text) => ({
      type: "doc",
      content: String(text)
        .split("\n")
        .map((line) => ({
          type: "paragraph",
          content: line ? [{ type: "text", text: line }] : [],
        })),
    }));

  const createShapeIfMissing =
    helpers.createShapeIfMissing ||
    ((shape) => {
      const id = shape.id;
      if (editor.getShape?.(id)) return editor.getShape(id);
      editor.createShape?.(shape);
      return shape;
    });

  const upsertNativeShape = (shape) => {
    const existing = editor.getShape?.(shape.id);
    if (existing && existing.type !== shape.type) {
      editor.deleteShapes?.([existing.id]);
      editor.createShape?.(shape);
      return shape;
    }
    if (!existing) {
      editor.createShape?.(shape);
      return shape;
    }
    editor.updateShape?.({
      id: existing.id,
      type: existing.type,
      props: { ...(existing.props || {}), ...(shape.props || {}) },
      meta: { ...(existing.meta || {}), ...(shape.meta || {}) },
    });
    return editor.getShape?.(shape.id) ?? shape;
  };

  const createArrowBetweenShapes =
    typeof helpers.createArrowBetweenShapes === "function"
      ? (fromId, toId, options) =>
          helpers.createArrowBetweenShapes(fromId, toId, options)
      : (fromId, toId, props = {}) => {
      const id = props.id || createShapeId(`${ID_NS}-arrow-${Date.now()}`);
      editor.createShape?.({
        id,
        type: "arrow",
        x: 0,
        y: 0,
        props: {
          color: props.color ?? "grey",
          dash: props.dash ?? "draw",
          size: "s",
          arrowheadEnd: "arrow",
          richText: toRichText(props.label || ""),
        },
        meta: props.meta ?? {},
      });
      return id;
    };

  const run = (fn) => {
    if (typeof editor.run === "function") {
      return editor.run(fn, { history: "ignore" });
    }
    return fn();
  };

  // ---- Bootstrap furniture (idempotent) ----
  const layout = layoutLanes();
  const state = {
    layout,
    lastPresetId: null,
    lastPresetScript: null,
    unmodified: false,
    lastSavedName: null,
    applying: false,
    instantiating: false,
  };

  run(() => {
    // One native toolbar shape replaces the old frame + nine selectable geos.
    upsertNativeShape({
      id: createShapeId(`${ID_NS}-toolbar`),
      type: AGENTS_MODELS_SHAPE_TYPE,
      x: layout.toolbar.x,
      y: layout.toolbar.y,
      props: {
        w: layout.toolbar.w,
        h: layout.toolbar.h,
      },
      meta: {
        am: {
          domain: "agents-models",
          role: "toolbar",
          kind: "toolbar",
          actionState: "idle",
          actionMessage: "Choose a preset to begin.",
        },
      },
    });

    // STAGE lane
    upsertNativeShape({
      id: createShapeId(`${ID_NS}-lane-stage`),
      type: "frame",
      x: layout.stageLane.x,
      y: layout.stageLane.y,
      props: {
        w: layout.stageLane.w,
        h: layout.stageLane.h,
        name: "STAGE",
        color: "grey",
      },
      meta: { am: { role: "furniture", kind: "lane", lane: "STAGE" } },
    });
    // SUBAGENT lane
    upsertNativeShape({
      id: createShapeId(`${ID_NS}-lane-subagent`),
      type: "frame",
      x: layout.subagentLane.x,
      y: layout.subagentLane.y,
      props: {
        w: layout.subagentLane.w,
        h: layout.subagentLane.h,
        name: "SUBAGENT",
        color: "grey",
      },
      meta: { am: { role: "furniture", kind: "lane", lane: "SUBAGENT" } },
    });
    // Native frames render their own names. Remove the superseded duplicate
    // text labels from the stock-geo implementation.
    const duplicateLaneLabels = [
      createShapeId(`${ID_NS}-lane-stage-label`),
      createShapeId(`${ID_NS}-lane-subagent-label`),
    ].filter((id) => editor.getShape?.(id));
    if (duplicateLaneLabels.length) {
      editor.deleteShapes?.(duplicateLaneLabels);
    }

    // One native, scrollable catalog shape replaces dozens of stacked geos.
    upsertNativeShape({
      id: createShapeId(`${ID_NS}-catalog`),
      type: AGENTS_MODELS_SHAPE_TYPE,
      x: layout.catalog.x,
      y: layout.catalog.y,
      props: {
        w: layout.catalog.w,
        h: layout.catalog.h,
      },
      meta: {
        am: {
          domain: "agents-models",
          role: "catalog",
          kind: "catalog",
          proxyOk: null,
          catalogSections: [],
        },
      },
    });

    // Remove only the superseded namespaced button stack from earlier v1 runs.
    const oldButtons = (editor.getCurrentPageShapes?.() ?? []).filter(
      (shape) =>
        shape?.meta?.am?.role === "toolbar-button" &&
        String(shape.id).startsWith("shape:am-btn-"),
    );
    if (oldButtons.length) {
      editor.deleteShapes?.(oldButtons.map((shape) => shape.id));
    }
  });

  // ---- Catalog sync (debounce + AbortController tied to signal) ----
  let catalogTimer = null;
  let catalogAbort = null;

  const clearCatalogDynamic = () => {
    const all = editor.getCurrentPageShapes?.() ?? [];
    const doomed = all.filter((s) => {
      const role = s?.meta?.am?.role;
      return (
        role === "model-slot" ||
        role === "agent" ||
        role === "persona" ||
        role === "role" ||
        role === "catalog-header" ||
        role === "catalog-more" ||
        role === "catalog-error" ||
        role === "status-dot"
      );
    });
    if (doomed.length && editor.deleteShapes) {
      editor.deleteShapes(doomed.map((s) => s.id));
    }
  };

  const renderCatalogNodes = (nodes, proxyOk = null) => {
    run(() => {
      clearCatalogDynamic();
      const catalogId = createShapeId(`${ID_NS}-catalog`);
      const existing = editor.getShape?.(catalogId);
      if (existing && editor.updateShape) {
        const currentMeta = existing.meta?.am ?? {};
        const errorNode = nodes.find((node) =>
          ["catalog-error", "error"].includes(node?.meta?.am?.role ?? node?.kind),
        );
        editor.updateShape({
          id: catalogId,
          type: AGENTS_MODELS_SHAPE_TYPE,
          props: {
            ...(existing.props || {}),
            w: layout.catalog.w,
            h: layout.catalog.h,
          },
          meta: {
            ...(existing.meta || {}),
            am: {
              ...currentMeta,
              domain: "agents-models",
              role: "catalog",
              kind: "catalog",
              proxyOk: errorNode ? false : proxyOk,
              catalogSections: errorNode
                ? [
                    {
                      id: "models",
                      label: "CATALOG ERROR",
                      items: [
                        {
                          id: errorNode.id,
                          label: "Bridge unavailable",
                          value: String(errorNode.text || "catalog fetch failed"),
                          status: "red",
                        },
                      ],
                      hidden: 0,
                    },
                  ]
                : catalogNodesToSections(nodes),
            },
          },
        });
      }
    });
  };

  const fetchCatalog = async () => {
    if (catalogAbort) catalogAbort.abort();
    catalogAbort = new AbortController();
    const linked = signal;
    const onParentAbort = () => catalogAbort.abort();
    if (linked) {
      if (linked.aborted) catalogAbort.abort();
      else linked.addEventListener("abort", onParentAbort, { once: true });
    }
    const token = resolveAuthToken();
    try {
      const res = await fetch(`${GROK_CONFIG_BASE}/api/grok/catalog`, {
        method: "GET",
        headers: authHeaders(token),
        signal: catalogAbort.signal,
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        renderCatalogNodes([
          catalogErrorNode(
            `http_${res.status}`,
            body || res.statusText || "catalog fetch failed",
            layout.catalog,
          ),
        ], false);
        return;
      }
      const catalog = await res.json();
      renderCatalogNodes(
        catalogToNodes(catalog, layout.catalog),
        catalog.models?.proxy?.ok ?? true,
      );
    } catch (err) {
      if (err?.name === "AbortError") return;
      renderCatalogNodes([
        catalogErrorNode(
          "fetch_failed",
          err instanceof Error ? err.message : String(err),
          layout.catalog,
        ),
      ], false);
    } finally {
      if (linked) linked.removeEventListener?.("abort", onParentAbort);
    }
  };

  const scheduleCatalog = () => {
    if (catalogTimer) clearTimeout(catalogTimer);
    catalogTimer = setTimeout(() => {
      catalogTimer = null;
      fetchCatalog();
    }, 250);
  };

  scheduleCatalog();

  // ---- Clear prior workflow instance shapes ----
  const clearWorkflowInstance = () => {
    const all = editor.getCurrentPageShapes?.() ?? [];
    const cardRoles = new Set([
      "stage",
      "subagent",
      "arrow",
      "stage-header",
      "stage-divider",
      "stage-body",
      "stage-footer",
      "subagent-header",
      "subagent-status",
      "port",
    ]);
    const doomed = all.filter((s) => {
      const am = s?.meta?.am;
      if (!am) return false;
      if (cardRoles.has(am.role)) return true;
      if (am.role === "receipt" || am.role === "play-note") return true;
      if (am.card === "stage" || am.card === "subagent") return true;
      return false;
    });
    // The desktop helper creates real arrow bindings but accepts no id/meta
    // options. Collect arrows through bindings before deleting endpoints so
    // rerunning a preset cannot leave orphan connectors behind.
    const doomedIds = new Set(doomed.map((shape) => shape.id));
    const connectedArrowIds = new Set(
      (editor.store?.allRecords?.() ?? [])
        .filter(
          (record) =>
            record?.typeName === "binding" &&
            record?.type === "arrow" &&
            doomedIds.has(record.toId),
        )
        .map((record) => record.fromId),
    );
    for (const arrowId of connectedArrowIds) {
      const arrow = editor.getShape?.(arrowId);
      if (arrow && !doomedIds.has(arrow.id)) {
        doomed.push(arrow);
        doomedIds.add(arrow.id);
      }
    }
    if (doomed.length && editor.deleteShapes) {
      editor.deleteShapes(doomed.map((s) => s.id));
    }
  };

  const materializePreset = async (presetId) => {
    if (state.instantiating) return;
    state.instantiating = true;
    const token = resolveAuthToken();
    try {
      let preset = { id: presetId, stageType: defaultStageType(presetId) };
      try {
        const res = await fetch(`${GROK_CONFIG_BASE}/api/grok/workflow-presets`, {
          method: "GET",
          headers: authHeaders(token),
          signal: signal ?? undefined,
        });
        if (res.ok) {
          const body = await res.json();
          const found = (body.presets || []).find((p) => p.id === presetId);
          if (found) preset = found;
        }
      } catch {
        // fall through with local skeleton
      }

      const origin = {
        x: layout.stageOrigin.x,
        stageY: layout.stageOrigin.y,
        subagentY: layout.subagentOrigin.y,
      };
      const { shapes, arrows, graph } = instantiatePreset(preset, origin);

      const idMap = new Map();
      run(() => {
        clearWorkflowInstance();
        const logicalShapes = shapes.filter(
          (spec) => spec.kind === "stage" || spec.kind === "subagent",
        );
        for (const spec of logicalShapes) {
          const sid = createShapeId(spec.id);
          idMap.set(spec.id, sid);
          if (spec.meta?.am?.nodeId) {
            idMap.set(spec.meta.am.nodeId, sid);
          }
          upsertNativeShape({
            id: sid,
            type: AGENTS_MODELS_SHAPE_TYPE,
            x: spec.x,
            y: spec.y,
            props: {
              w: spec.w,
              h: spec.h,
            },
            meta: {
              ...spec.meta,
              am: {
                ...(spec.meta?.am || {}),
                domain: "agents-models",
                role: spec.kind,
                card: spec.kind,
                label: spec.meta?.am?.label ?? spec.text ?? spec.kind,
                variable: Boolean(spec.meta?.am?.variable),
              },
            },
          });
        }
      });
      // The helper resolves endpoint geometry from the committed store. Run
      // this as a second phase so freshly created custom roots are visible.
      for (const a of arrows) {
        const from = idMap.get(a.fromNode);
        const to = idMap.get(a.toNode);
        if (!from || !to) continue;
        const arrowId = createArrowBetweenShapes(from, to, {
          bend: 0,
          arrowheadEnd: "arrow",
          richText: toRichText(a.label || ""),
        });
        const arrow = editor.getShape?.(arrowId);
        if (arrow?.type === "arrow") {
          editor.updateShape?.({
            id: arrow.id,
            type: "arrow",
            props: {
              dash: a.dash === "dashed" ? "dashed" : "solid",
              color: "grey",
              size: "s",
            },
            meta: {
              ...(arrow.meta || {}),
              ...(a.meta || {}),
              am: {
                ...(a.meta?.am || {}),
                role: "arrow",
                fromNode: a.fromNode,
                toNode: a.toNode,
              },
            },
          });
        }
      }

      state.lastPresetId = presetId;
      state.lastPresetScript =
        typeof preset.script === "string" ? preset.script : graph.presetScript;
      state.unmodified = true;
      updateToolbarReceipt(
        "succeeded",
        `${presetId.toUpperCase()} ready · ${graph.stages.length} stage(s) · ${graph.subagents.length} subagent(s)`,
      );
    } catch (error) {
      updateToolbarReceipt(
        "failed",
        `PRESET ERROR · ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      state.instantiating = false;
    }
  };

  const updateToolbarReceipt = (actionState, actionMessage) => {
    run(() => {
      const toolbarId = createShapeId(`${ID_NS}-toolbar`);
      const toolbar = editor.getShape?.(toolbarId);
      if (!toolbar || toolbar.type !== AGENTS_MODELS_SHAPE_TYPE) return;
      editor.updateShape?.({
        id: toolbar.id,
        type: AGENTS_MODELS_SHAPE_TYPE,
        meta: {
          ...(toolbar.meta || {}),
          am: {
            ...(toolbar.meta?.am || {}),
            actionState,
            actionMessage,
          },
        },
      });
    });
  };

  const handleApply = async () => {
    if (state.applying) return;
    state.applying = true;
    try {
      const all = editor.getCurrentPageShapes?.() ?? [];
      const graph = collectWorkflowGraph(all, {
        presetId: state.lastPresetId,
        unmodified: state.unmodified,
        presetScript: state.lastPresetScript,
      });
      // Detect modification: any workflow node without unmodified flag
      const wf = all.filter((s) => {
        const r = s?.meta?.am?.role;
        return r === "stage" || r === "subagent";
      });
      if (wf.some((s) => s.meta?.am?.unmodified !== true)) {
        graph.unmodified = false;
      }

      const script = compileWorkflow(graph);
      const name = graph.name;
      const token = resolveAuthToken();
      let receipt;
      try {
        const res = await fetch(`${GROK_CONFIG_BASE}/api/grok/workflows/save`, {
          method: "POST",
          headers: {
            ...authHeaders(token),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name, script, scope: "user" }),
          signal: signal ?? undefined,
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          receipt = {
            ok: false,
            error: body.error || `http_${res.status}`,
            message: body.message || res.statusText,
            path: null,
            bytes: 0,
          };
        } else {
          const r = body.receipt || body;
          receipt = {
            ok: true,
            path: r.path || null,
            bytes:
            r.size ??
            r.bytes ??
            (typeof Buffer !== "undefined"
              ? Buffer.byteLength(script)
              : new TextEncoder().encode(script).length),
            error: null,
          };
          state.lastSavedName = name;
        }
      } catch (err) {
        receipt = {
          ok: false,
          error: "fetch_failed",
          message: err instanceof Error ? err.message : String(err),
          path: null,
          bytes: 0,
        };
      }

      const receiptText = receipt.ok
        ? `Saved ${name} · ${receipt.bytes} bytes`
        : `APPLY ERROR · ${receipt.error}: ${receipt.message || ""}`;
      updateToolbarReceipt(receipt.ok ? "succeeded" : "failed", receiptText);

      // PLAY is disabled in v1 — after successful save, surface a compact
      // receipt in the native toolbar instead of creating another stock note.
      if (receipt.ok) {
        updateToolbarReceipt(
          "succeeded",
          `Saved ${name}. Launch with /workflow ${name} in Grok.`,
        );
      }
    } finally {
      state.applying = false;
    }
  };

  const handlePlay = () => {
    const name = state.lastSavedName || "NAME";
    updateToolbarReceipt(
      "succeeded",
      `PLAY is intentionally external: /workflow ${name} in Grok.`,
    );
  };

  // ---- Native toolbar action requests + workflow edits ----
  // The custom shape writes an explicit request into its own metadata. This is
  // reliable across pointer/selection modes and leaves an inspectable record.
  const handledActionRequests = new Set();

  const onToolbarActionMaybe = () => {
    const toolbar = editor.getShape?.(createShapeId(`${ID_NS}-toolbar`));
    const request = toolbar?.meta?.am?.actionRequest;
    if (!request?.id || handledActionRequests.has(request.id)) return;
    handledActionRequests.add(request.id);
    if (request.kind === "preset" && request.presetId) {
      materializePreset(request.presetId);
    } else if (request.kind === "apply") {
      handleApply();
    } else if (request.kind === "play") {
      handlePlay();
    } else {
      updateToolbarReceipt("failed", "Unknown toolbar action request.");
    }
  };

  let unlistenDoc = null;
  if (editor.store?.listen) {
    unlistenDoc = editor.store.listen(
      (entry) => {
        try {
          onToolbarActionMaybe();
          const changes = entry?.changes;
          if (!changes) return;
          const updated = changes.updated || {};
          for (const change of Object.values(updated)) {
            const shape = Array.isArray(change) ? change[1] : change;
            const role = shape?.meta?.am?.role;
            if (role === "stage" || role === "subagent") {
              if (shape.meta?.am?.unmodified === false) {
                state.unmodified = false;
              }
            }
          }
        } catch {
          /* ignore */
        }
      },
      { source: "user", scope: "document" },
    );
  }
  onToolbarActionMaybe();

  // Periodic soft re-sync of catalog
  const catalogInterval = setInterval(() => {
    if (signal?.aborted) return;
    scheduleCatalog();
  }, 30_000);

  const cleanup = () => {
    if (catalogTimer) clearTimeout(catalogTimer);
    if (catalogAbort) catalogAbort.abort();
    clearInterval(catalogInterval);
    if (typeof unlistenDoc === "function") unlistenDoc();
  };

  if (signal) {
    if (signal.aborted) cleanup();
    else signal.addEventListener("abort", cleanup, { once: true });
  }

  return {
    ok: true,
    pageId: agentsModelsPage.id,
    pageCreated,
    cleanup,
    layout,
    // test seams
    _state: state,
    _materializePreset: materializePreset,
    _handleApply: handleApply,
    _handlePlay: handlePlay,
    _scheduleCatalog: scheduleCatalog,
  };
}
