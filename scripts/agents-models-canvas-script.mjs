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
export const WORKFLOW_UI_VERSION = "native-graph-v6";
export const WORKFLOW_NODE_ROLES = Object.freeze([
  "stage",
  "agent",
  "persona",
  "capability",
  "skill",
  "gate",
  "input",
  "artifact",
  "result",
  "module",
]);
const WORKFLOW_RUNTIME_ROLES = new Set([
  ...WORKFLOW_NODE_ROLES,
  "subagent",
]);

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
  toolbar: { x: 80, y: 80, w: 240, h: 690 },
  stageLane: { x: 370, y: 80, w: 1040, h: 290 },
  // vertical gap between STAGE and SUBAGENT lanes >= 60
  subagentLane: { x: 370, y: 430, w: 1040, h: 840 },
  catalog: { x: 1450, y: 80, w: 360, h: 720 },
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
  subagentW: 280,
  subagentH: 190,
  /** @deprecated use subagentW — kept for any external readers */
  subagentR: 280,
  moreNodeW: 220,
  moreNodeH: 190,
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
 * Full but bounded catalog payload used by the interactive canvas catalog.
 * The visible node only renders agents and personas, while model entries stay
 * available to the Agent/Persona select controls.
 */
export function catalogToInteractiveSections(catalog, maxPerSection = 64) {
  const proxy = catalog?.models?.proxy ?? null;
  const definitions = [
    [
      "models",
      "MODELS",
      Array.isArray(catalog?.models?.slots) ? catalog.models.slots : [],
      (item) => ({
        id: String(item.id),
        label: String(item.name || item.id || "model"),
        value: String(item.model || ""),
        status: availabilityColor(item, proxy),
      }),
    ],
    [
      "agents",
      "AGENTS",
      Array.isArray(catalog?.agents) ? catalog.agents : [],
      (item) => ({
        id: String(item.id),
        label: String(item.id),
        value: String(item.modelRef || ""),
        status: "grey",
      }),
    ],
    [
      "personas",
      "PERSONAS",
      Array.isArray(catalog?.personas) ? catalog.personas : [],
      (item) => ({
        id: String(item.id),
        label: String(item.id),
        value: String(item.modelRef || ""),
        status: "grey",
      }),
    ],
    [
      "roles",
      "ROLES",
      Array.isArray(catalog?.roles) ? catalog.roles : [],
      (item) => ({
        id: String(item.id || item.name || "role"),
        label: String(item.name || item.id || "role"),
        value: "",
        status: "grey",
      }),
    ],
    [
      "skills",
      "SKILLS",
      Array.isArray(catalog?.skills) ? catalog.skills : [],
      (item) => ({
        id: String(item.id),
        label: String(item.name || item.id || "skill"),
        value: String(item.sourceRef || ""),
        status: "grey",
      }),
    ],
    [
      "modules",
      "MODULES",
      Array.isArray(catalog?.modules) ? catalog.modules : [],
      (item) => ({
        id: String(item.id),
        label: String(item.id || "module"),
        value: String(item.version || ""),
        status: "grey",
      }),
    ],
  ];
  return definitions.map(([id, label, source, mapItem]) => {
    const items = source.slice(0, maxPerSection).map(mapItem);
    return {
      id,
      label,
      items,
      hidden: Math.max(0, source.length - items.length),
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
 * Graph-aware two-lane layout for the native workflow cards.
 *
 * Stages are topologically ordered left-to-right. Agents and personas are
 * assigned to the stage they are bound to and placed directly beneath that
 * stage, so control-flow arrows stay horizontal and assignment arrows stay
 * vertical. Existing dimensions are honored rather than replaced with a
 * fixed card size.
 *
 * @param {Array<{id:string,x?:number,y?:number,w?:number,h?:number,role?:string,meta?:object,props?:object}>} nodes
 * @param {Array<{from:string,to:string}>} edges
 * @param {{stageX?:number,stageY?:number,workerY?:number,stageGap?:number,rowGap?:number}} [opts]
 */
export function layoutWorkflowGraph(nodes = [], edges = [], opts = {}) {
  const stageX = Number(opts.stageX ?? LAYOUT.stageLane.x + 40);
  const stageY = Number(opts.stageY ?? LAYOUT.stageLane.y + 40);
  const workerY = Number(opts.workerY ?? LAYOUT.subagentLane.y + 48);
  const stageGap = Number(opts.stageGap ?? 92);
  const rowGap = Number(opts.rowGap ?? 46);
  const normalized = nodes.map((node) => ({
    ...node,
    id: String(node.id),
    role: String(node.role ?? node.meta?.am?.role ?? ""),
    x: Number(node.x ?? 0),
    y: Number(node.y ?? 0),
    w: Number(node.w ?? node.props?.w ?? LAYOUT.subagentW),
    h: Number(node.h ?? node.props?.h ?? LAYOUT.subagentH),
    variable: Boolean(node.variable ?? node.meta?.am?.variable),
  }));
  const byId = new Map(normalized.map((node) => [node.id, node]));
  const canvasOrder = (left, right) =>
    left.x - right.x ||
    left.y - right.y ||
    left.id.localeCompare(right.id);
  const stages = normalized
    .filter((node) => node.role === "stage")
    .sort(canvasOrder);
  const stageIds = new Set(stages.map((stage) => stage.id));
  const stageEdges = edges.filter(
    (edge) => stageIds.has(String(edge.from)) && stageIds.has(String(edge.to)),
  );
  const outgoing = new Map(stages.map((stage) => [stage.id, []]));
  const indegree = new Map(stages.map((stage) => [stage.id, 0]));
  for (const edge of stageEdges) {
    const from = String(edge.from);
    const to = String(edge.to);
    if (from === to) continue;
    outgoing.get(from)?.push(to);
    indegree.set(to, (indegree.get(to) ?? 0) + 1);
  }
  const stageRank = new Map(stages.map((stage, index) => [stage.id, index]));
  const ready = stages
    .filter((stage) => (indegree.get(stage.id) ?? 0) === 0)
    .map((stage) => stage.id);
  const sortReady = () =>
    ready.sort((left, right) => (stageRank.get(left) ?? 0) - (stageRank.get(right) ?? 0));
  sortReady();
  const stageOrder = [];
  while (ready.length) {
    const id = ready.shift();
    if (!id) break;
    stageOrder.push(id);
    for (const target of outgoing.get(id) ?? []) {
      indegree.set(target, (indegree.get(target) ?? 0) - 1);
      if (indegree.get(target) === 0) {
        ready.push(target);
        sortReady();
      }
    }
  }
  // Cyclic control graphs (loop/dynamic) retain deterministic canvas order.
  for (const stage of stages) {
    if (!stageOrder.includes(stage.id)) stageOrder.push(stage.id);
  }

  const positions = new Map();
  const stageCenters = new Map();
  let nextStageX = stageX;
  for (const id of stageOrder) {
    const stage = byId.get(id);
    if (!stage) continue;
    positions.set(id, {
      x: nextStageX,
      y: stageY,
      w: stage.w,
      h: stage.h,
    });
    stageCenters.set(id, nextStageX + stage.w / 2);
    nextStageX += stage.w + stageGap;
  }

  const workers = normalized
    .filter((node) => node.role !== "stage" && WORKFLOW_RUNTIME_ROLES.has(node.role))
    .sort(
      (left, right) =>
        Number(left.variable) - Number(right.variable) || canvasOrder(left, right),
    );
  const ownerByNode = new Map();
  const personaParentByNode = new Map();
  for (const edge of edges) {
    const from = String(edge.from);
    const to = String(edge.to);
    const fromNode = byId.get(from);
    const toNode = byId.get(to);
    if (!fromNode || !toNode) continue;
    if (stageIds.has(from) && toNode.role !== "stage") {
      ownerByNode.set(to, from);
    }
    if (
      !ownerByNode.has(from) &&
      stageIds.has(to) &&
      fromNode.role !== "stage"
    ) {
      ownerByNode.set(from, to);
    }
    if (
      fromNode.role === "persona" &&
      ["agent", "subagent"].includes(toNode.role)
    ) {
      personaParentByNode.set(from, to);
    }
    if (
      toNode.role === "persona" &&
      ["agent", "subagent"].includes(fromNode.role)
    ) {
      personaParentByNode.set(to, from);
    }
  }
  // Attached policy, skill, persona, and data nodes inherit the Stage owner of
  // the Agent or boundary node they decorate.
  for (let pass = 0; pass < 3; pass += 1) {
    for (const edge of edges) {
      const from = String(edge.from);
      const to = String(edge.to);
      if (!ownerByNode.has(from) && ownerByNode.has(to)) {
        ownerByNode.set(from, ownerByNode.get(to));
      }
      if (!ownerByNode.has(to) && ownerByNode.has(from)) {
        ownerByNode.set(to, ownerByNode.get(from));
      }
    }
  }

  const buckets = new Map(stageOrder.map((id) => [id, []]));
  for (const worker of workers) {
    let owner = ownerByNode.get(worker.id);
    if (!owner && stageOrder.length) {
      owner = stageOrder.reduce((best, candidate) => {
        const center = stageCenters.get(candidate) ?? stageX;
        const bestCenter = stageCenters.get(best) ?? stageX;
        const workerCenter = worker.x + worker.w / 2;
        return Math.abs(center - workerCenter) < Math.abs(bestCenter - workerCenter)
          ? candidate
          : best;
      }, stageOrder[0]);
    }
    if (owner && buckets.has(owner)) buckets.get(owner).push(worker);
  }

  const primaryGridMetrics = (bucket) => {
    const attachedPersonas = bucket.filter(
      (node) => node.role === "persona" && personaParentByNode.has(node.id),
    );
    const primaryBucket = bucket.filter(
      (node) => !attachedPersonas.includes(node),
    );
    const columnCount =
      primaryBucket.length <= 3
        ? Math.max(1, primaryBucket.length)
        : primaryBucket.length <= 6
          ? 2
          : 3;
    const columnWidths = Array.from({ length: columnCount }, (_, column) =>
      Math.max(
        ...primaryBucket
          .filter((_, index) => index % columnCount === column)
          .map((worker) => worker.w),
        0,
      ),
    );
    const gridWidth =
      columnWidths.reduce((sum, width) => sum + width, 0) +
      Math.max(0, columnCount - 1) * rowGap;
    return {
      attachedPersonas,
      primaryBucket,
      columnCount,
      columnWidths,
      gridWidth,
    };
  };

  // Stage columns are sized by the widest content they own, not just the
  // Stage card. This keeps neighboring fan-out grids from colliding.
  positions.clear();
  stageCenters.clear();
  nextStageX = stageX;
  for (const id of stageOrder) {
    const stage = byId.get(id);
    if (!stage) continue;
    const metrics = primaryGridMetrics(buckets.get(id) ?? []);
    const columnWidth = Math.max(stage.w, metrics.gridWidth);
    const stagePositionX = nextStageX + (columnWidth - stage.w) / 2;
    positions.set(id, {
      x: stagePositionX,
      y: stageY,
      w: stage.w,
      h: stage.h,
    });
    stageCenters.set(id, nextStageX + columnWidth / 2);
    nextStageX += columnWidth + stageGap;
  }

  let requiredBottom = workerY;
  for (const stageId of stageOrder) {
    const center = stageCenters.get(stageId) ?? stageX;
    const bucket = buckets.get(stageId) ?? [];
    const {
      attachedPersonas,
      primaryBucket,
      columnCount,
      columnWidths,
      gridWidth,
    } = primaryGridMetrics(bucket);
    const columnStarts = [];
    let nextColumnX = center - gridWidth / 2;
    for (const width of columnWidths) {
      columnStarts.push(nextColumnX);
      nextColumnX += width + rowGap;
    }
    let y = workerY;
    for (
      let rowStart = 0;
      rowStart < primaryBucket.length;
      rowStart += columnCount
    ) {
      const row = primaryBucket.slice(rowStart, rowStart + columnCount);
      const rowHeight = Math.max(...row.map((worker) => worker.h), 0);
      row.forEach((worker, column) => {
        positions.set(worker.id, {
          x:
            columnStarts[column] +
            (columnWidths[column] - worker.w) / 2,
          y,
          w: worker.w,
          h: worker.h,
        });
      });
      requiredBottom = Math.max(requiredBottom, y + rowHeight);
      y += rowHeight + rowGap;
    }
    const nextPersonaYByParent = new Map();
    for (const persona of attachedPersonas) {
      const parentId = personaParentByNode.get(persona.id);
      const parent = positions.get(parentId);
      if (!parent) continue;
      const personaY =
        nextPersonaYByParent.get(parentId) ?? parent.y + parent.h + rowGap;
      positions.set(persona.id, {
        x: parent.x + parent.w / 2 - persona.w / 2,
        y: personaY,
        w: persona.w,
        h: persona.h,
      });
      nextPersonaYByParent.set(parentId, personaY + persona.h + rowGap);
      requiredBottom = Math.max(requiredBottom, personaY + persona.h);
    }
  }

  const positioned = [...positions.values()];
  const rightEdge = Math.max(
    LAYOUT.stageLane.x + LAYOUT.stageLane.w,
    ...positioned.map((position) => position.x + position.w + 40),
  );
  return {
    positions,
    stageOrder,
    requiredLaneWidth: rightEdge - LAYOUT.stageLane.x,
    requiredSubagentHeight: Math.max(
      LAYOUT.subagentLane.h,
      requiredBottom - LAYOUT.subagentLane.y + 56,
    ),
  };
}

export function workflowEdgeStyle(fromRole, toRole) {
  if (fromRole === "stage" && toRole === "stage") {
    return { kind: "control", color: "grey", dash: "solid" };
  }
  if (fromRole === "gate" || toRole === "gate") {
    return { kind: "condition", color: "grey", dash: "solid" };
  }
  if (
    ["capability", "skill"].includes(fromRole) ||
    ["capability", "skill"].includes(toRole)
  ) {
    return { kind: "policy", color: "grey", dash: "dashed" };
  }
  if (
    ["input", "artifact", "result", "module"].includes(fromRole) ||
    ["input", "artifact", "result", "module"].includes(toRole)
  ) {
    return { kind: "data", color: "grey", dash: "dashed" };
  }
  if (fromRole === "persona" || toRole === "persona") {
    return { kind: "persona", color: "orange", dash: "dashed" };
  }
  if (
    (fromRole === "stage" && ["agent", "subagent"].includes(toRole)) ||
    (toRole === "stage" && ["agent", "subagent"].includes(fromRole))
  ) {
    return { kind: "assignment", color: "grey", dash: "solid" };
  }
  return { kind: "flow", color: "grey", dash: "solid" };
}

export function suggestConnectedNodePosition(
  source,
  nodeKind,
  targetSize,
  occupied = [],
  opts = {},
) {
  const gap = Number(opts.gap ?? 92);
  const workerY = Number(opts.workerY ?? LAYOUT.subagentLane.y + 48);
  const sourceRole = String(source?.role ?? source?.meta?.am?.role ?? "");
  const sourceBounds = source?.bounds ?? source;
  const w = Number(targetSize?.w ?? LAYOUT.subagentW);
  const h = Number(targetSize?.h ?? LAYOUT.subagentH);
  let x = Number(sourceBounds?.maxX ?? 0) + gap;
  let y = Number(sourceBounds?.minY ?? 0);

  if (
    sourceRole === "stage" &&
    nodeKind !== "stage"
  ) {
    x = Number(sourceBounds?.center?.x ?? 0) - w / 2;
    y = workerY;
  } else if (
    (sourceRole === "agent" || sourceRole === "subagent") &&
    ["persona", "capability", "skill"].includes(nodeKind)
  ) {
    x = Number(sourceBounds?.center?.x ?? 0) - w / 2;
    y = Number(sourceBounds?.maxY ?? 0) + 58;
  }

  const overlaps = (candidateX, candidateY) =>
    occupied.some((box) => {
      const minX = Number(box.minX ?? box.x ?? 0);
      const minY = Number(box.minY ?? box.y ?? 0);
      const maxX = Number(box.maxX ?? minX + Number(box.w ?? 0));
      const maxY = Number(box.maxY ?? minY + Number(box.h ?? 0));
      return !(
        candidateX + w + 18 < minX ||
        candidateX - 18 > maxX ||
        candidateY + h + 18 < minY ||
        candidateY - 18 > maxY
      );
    });
  let attempts = 0;
  while (overlaps(x, y) && attempts < 24) {
    if (nodeKind === "stage") x += w + gap;
    else y += h + 46;
    attempts += 1;
  }
  return { x, y, w, h };
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

  const graphLayout = layoutWorkflowGraph(
    nodeDefs.map((node) => ({
      id: node.id,
      role: node.kind === "stage" ? "stage" : "agent",
      x: node.x,
      y: node.y,
      w: node.w,
      h: node.h,
      variable: Boolean(node.extra?.variable),
    })),
    arrows.map((edge) => ({ from: edge.fromNode, to: edge.toNode })),
    {
      stageX: ox,
      stageY,
      workerY: subY,
    },
  );
  for (const node of nodeDefs) {
    const position = graphLayout.positions.get(node.id);
    if (!position) continue;
    node.x = position.x;
    node.y = position.y;
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
              role: "agent",
              subLocalId: n.localId,
              label: n.label,
              agentRef: null,
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
    agents: shapes.filter((s) => s.kind === "subagent"),
    subagents: shapes.filter((s) => s.kind === "subagent"),
    personas: [],
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
 * - Otherwise compile the actual bounded Stage / Agent / Persona graph.
 *
 * @param {{
 *   name?: string,
 *   presetId?: string|null,
 *   stageType?: string|null,
 *   unmodified?: boolean,
 *   presetScript?: string|null,
 *   stages?: Array<object>,
 *   agents?: Array<object>,
 *   personas?: Array<object>,
 *   edges?: Array<{from:string,to:string}>,
 *   personaDetails?: Record<string, {instructions?:string}>,
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
  const expanded = expandWorkflowModules({ ...graph, name });

  if (
    expanded.unmodified === true &&
    typeof expanded.presetScript === "string" &&
    expanded.presetScript.length > 0 &&
    !(expanded.personas?.length > 0) &&
    !hasExtendedWorkflowNodes(expanded)
  ) {
    return fillPresetScriptName(expanded.presetScript, name);
  }
  const preflight = preflightWorkflow(expanded);
  if (!preflight.ok) {
    throw new Error(
      `Preflight failed: ${preflight.errors.map((item) => item.message).join(" ")}`,
    );
  }

  return compileConnectedWorkflow(expanded);
}

function hasExtendedWorkflowNodes(graph) {
  return [
    "capabilities",
    "skills",
    "gates",
    "inputs",
    "artifacts",
    "results",
    "modules",
  ].some((key) => Array.isArray(graph?.[key]) && graph[key].length > 0);
}

function workflowNodeId(node) {
  return String(node?.id ?? node?.meta?.am?.nodeId ?? "");
}

function workflowNodeMeta(node) {
  return node?.meta?.am ?? node ?? {};
}

function workflowNodesFromGraph(graph = {}) {
  if (Array.isArray(graph.nodes)) return graph.nodes;
  return [
    ...(graph.stages ?? []),
    ...(graph.agents ?? graph.subagents ?? []),
    ...(graph.personas ?? []),
    ...(graph.capabilities ?? []),
    ...(graph.skills ?? []),
    ...(graph.gates ?? []),
    ...(graph.inputs ?? []),
    ...(graph.artifacts ?? []),
    ...(graph.results ?? []),
    ...(graph.modules ?? []),
  ];
}

function categorizeWorkflowGraph(graph, nodes = workflowNodesFromGraph(graph)) {
  const byRole = (role) =>
    nodes.filter((node) => {
      const value = workflowNodeMeta(node).role;
      return role === "agent" ? value === "agent" || value === "subagent" : value === role;
    });
  const agents = byRole("agent");
  return {
    ...graph,
    nodes,
    stages: byRole("stage"),
    agents,
    subagents: agents,
    personas: byRole("persona"),
    capabilities: byRole("capability"),
    skills: byRole("skill"),
    gates: byRole("gate"),
    inputs: byRole("input"),
    artifacts: byRole("artifact"),
    results: byRole("result"),
    modules: byRole("module"),
  };
}

function compactIssue(code, message, nodeId = null) {
  return { code, message, ...(nodeId ? { nodeId } : {}) };
}

/**
 * Deterministic, bounded graph inspection used before Apply, Play, and Sync.
 * It never mutates editor state and returns compact issues suitable for a receipt.
 */
export function preflightWorkflow(rawGraph = {}) {
  const graph = categorizeWorkflowGraph(rawGraph);
  const nodes = graph.nodes;
  const edges = Array.isArray(graph.edges) ? graph.edges : [];
  const errors = [];
  const warnings = [];
  const ids = new Set();
  const byId = new Map();
  for (const node of nodes) {
    const id = workflowNodeId(node);
    if (!id || ids.has(id)) {
      errors.push(compactIssue("duplicate_node", `Workflow node id "${id || "(empty)"}" is not unique.`));
      continue;
    }
    ids.add(id);
    byId.set(id, node);
  }
  for (const edge of edges) {
    if (!ids.has(String(edge.from)) || !ids.has(String(edge.to))) {
      errors.push(
        compactIssue(
          "broken_edge",
          `Edge "${edge.from}→${edge.to}" references a missing node.`,
        ),
      );
    }
  }
  const incoming = (id, role) =>
    edges
      .filter((edge) => String(edge.to) === id)
      .map((edge) => byId.get(String(edge.from)))
      .filter((node) => node && (!role || workflowNodeMeta(node).role === role));
  const outgoing = (id, role) =>
    edges
      .filter((edge) => String(edge.from) === id)
      .map((edge) => byId.get(String(edge.to)))
      .filter((node) => node && (!role || workflowNodeMeta(node).role === role));
  const neighbors = (id, roles) =>
    edges
      .filter((edge) => String(edge.from) === id || String(edge.to) === id)
      .map((edge) =>
        byId.get(String(edge.from) === id ? String(edge.to) : String(edge.from)),
      )
      .filter(
        (node) =>
          node &&
          (!roles || roles.includes(workflowNodeMeta(node).role)),
      );

  if (!graph.stages.length) {
    errors.push(compactIssue("missing_stage", "Workflow needs at least one Stage node."));
  }
  for (const agent of graph.agents) {
    const id = workflowNodeId(agent);
    if (neighbors(id, ["stage"]).length !== 1) {
      errors.push(
        compactIssue(
          "agent_stage_boundary",
          `Agent "${workflowNodeMeta(agent).label || id}" must attach to exactly one Stage.`,
          id,
        ),
      );
    }
  }
  for (const persona of graph.personas) {
    const id = workflowNodeId(persona);
    if (!String(workflowNodeMeta(persona).persona ?? "").trim()) {
      errors.push(compactIssue("persona_ref_missing", "Every Persona node must select a persona.", id));
    }
    if (!neighbors(id, ["agent", "subagent", "stage"]).length) {
      errors.push(compactIssue("persona_orphan", `Persona "${workflowNodeMeta(persona).label || id}" is not attached.`, id));
    }
  }
  for (const capability of graph.capabilities) {
    const id = workflowNodeId(capability);
    if (neighbors(id, ["agent", "subagent"]).length !== 1) {
      errors.push(compactIssue("capability_boundary", "Capability must attach to exactly one Agent.", id));
    }
    const mode = workflowNodeMeta(capability).capabilityMode || "all";
    if (!["all", "read-only", "read-write", "execute"].includes(mode)) {
      errors.push(compactIssue("capability_mode", `Unknown capability mode "${mode}".`, id));
    }
    if (String(workflowNodeMeta(capability).toolRefsText ?? "").trim()) {
      warnings.push(
        compactIssue(
          "tool_allowlist_advisory",
          "Exact tool ids are preserved as advisory metadata until Grok exposes per-agent workflow allowlists.",
          id,
        ),
      );
    }
  }
  for (const agent of graph.agents) {
    const attached = neighbors(workflowNodeId(agent), ["capability"]);
    if (attached.length > 1) {
      errors.push(
        compactIssue(
          "multiple_capabilities",
          `Agent "${workflowNodeMeta(agent).label || workflowNodeId(agent)}" has more than one Capability node.`,
          workflowNodeId(agent),
        ),
      );
    }
  }
  for (const skill of graph.skills) {
    const id = workflowNodeId(skill);
    if (neighbors(id, ["agent", "subagent"]).length !== 1) {
      errors.push(compactIssue("skill_boundary", "Skill must attach to exactly one Agent.", id));
    }
    if (!String(workflowNodeMeta(skill).skillRef ?? "").trim()) {
      errors.push(compactIssue("skill_ref_missing", "Skill must reference a project-local .agents/skills entry.", id));
    }
  }
  for (const gate of graph.gates) {
    const id = workflowNodeId(gate);
    if (incoming(id, "stage").length !== 1 || outgoing(id, "stage").length !== 1) {
      errors.push(compactIssue("gate_boundary", "Gate needs exactly one incoming Stage and one outgoing Stage.", id));
    }
    if (Number(workflowNodeMeta(gate).retryCount ?? 0) > 0) {
      warnings.push(compactIssue("retry_advisory", "Gate retry is recorded but not materialized by the current Grok workflow API.", id));
    }
    if (Number(workflowNodeMeta(gate).timeoutSeconds ?? 0) > 0) {
      warnings.push(compactIssue("timeout_advisory", "Gate timeout is recorded but not materialized by the current Grok workflow API.", id));
    }
    if (String(workflowNodeMeta(gate).errorRoute ?? "").trim()) {
      warnings.push(compactIssue("error_route_advisory", "Gate error route is recorded but not materialized by the current Grok workflow API.", id));
    }
  }
  for (const node of [...graph.inputs, ...graph.artifacts]) {
    const id = workflowNodeId(node);
    if (neighbors(id, ["stage"]).length !== 1) {
      errors.push(compactIssue("data_boundary", `${workflowNodeMeta(node).role} must attach to exactly one Stage.`, id));
    }
  }
  for (const result of graph.results) {
    const id = workflowNodeId(result);
    if (neighbors(id, ["stage"]).length !== 1) {
      errors.push(compactIssue("result_boundary", "Result must attach to exactly one Stage.", id));
    }
  }
  if (graph.results.length > 1) {
    errors.push(compactIssue("multiple_results", "Workflow may declare only one Result node."));
  } else if (graph.results.length === 0) {
    warnings.push(
      compactIssue(
        "implicit_result",
        "No Result node is present; the final Stage will be returned.",
      ),
    );
  }
  for (const moduleNode of graph.modules) {
    const id = workflowNodeId(moduleNode);
    const meta = workflowNodeMeta(moduleNode);
    const ref = String(meta.moduleRef ?? meta.catalogRef ?? "").trim();
    const version = String(meta.moduleVersion ?? meta.catalogValue ?? "").trim();
    const key = `${ref}@${version}`;
    if (!ref || !version) {
      errors.push(compactIssue("module_ref_missing", "Module needs an id and version.", id));
    } else if (!rawGraph.moduleDetails?.[key] && !rawGraph.moduleDetails?.[ref]) {
      errors.push(compactIssue("module_unavailable", `Module "${key}" was not hydrated.`, id));
    }
    if (
      neighbors(id).length === 0 &&
      graph.stages.length + graph.modules.length > 1
    ) {
      errors.push(compactIssue("module_orphan", `Module "${key}" is not connected.`, id));
    }
    try {
      const params = JSON.parse(String(meta.moduleParams || "{}"));
      if (!params || typeof params !== "object" || Array.isArray(params)) throw new Error();
    } catch {
      errors.push(compactIssue("module_params", "Module params must be a JSON object.", id));
    }
  }

  const stageEdges = edges.filter(
    (edge) =>
      graph.stages.some((node) => workflowNodeId(node) === String(edge.from)) &&
      graph.stages.some((node) => workflowNodeId(node) === String(edge.to)),
  );
  for (const gate of graph.gates) {
    const from = incoming(workflowNodeId(gate), "stage")[0];
    const to = outgoing(workflowNodeId(gate), "stage")[0];
    if (from && to) stageEdges.push({ from: workflowNodeId(from), to: workflowNodeId(to) });
  }
  if (graph.stages.length) {
    try {
      topologicallyOrderStages(graph.stages, stageEdges);
    } catch (error) {
      errors.push(compactIssue("stage_cycle", error instanceof Error ? error.message : String(error)));
    }
  }
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    summary: {
      nodes: nodes.length,
      edges: edges.length,
      stages: graph.stages.length,
      agents: graph.agents.length,
      modules: graph.modules.length,
    },
  };
}

function replaceModuleParams(value, params) {
  if (typeof value === "string") {
    return value.replace(/\{\{([A-Za-z0-9_-]+)\}\}/g, (_, name) =>
      Object.prototype.hasOwnProperty.call(params, name)
        ? String(params[name])
        : `{{${name}}}`,
    );
  }
  if (Array.isArray(value)) return value.map((item) => replaceModuleParams(item, params));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, replaceModuleParams(item, params)]),
    );
  }
  return value;
}

/**
 * Expand versioned project-local modules into ordinary workflow nodes.
 * External edges are rewired through the declared entry/exit boundaries.
 */
export function expandWorkflowModules(rawGraph = {}) {
  const graph = categorizeWorkflowGraph(rawGraph);
  if (!graph.modules.length) return graph;
  const moduleIds = new Set(graph.modules.map(workflowNodeId));
  const nodes = graph.nodes.filter((node) => !moduleIds.has(workflowNodeId(node)));
  let edges = graph.edges.filter(
    (edge) => !moduleIds.has(String(edge.from)) && !moduleIds.has(String(edge.to)),
  );
  for (const moduleNode of graph.modules) {
    const instanceId = workflowNodeId(moduleNode);
    const meta = workflowNodeMeta(moduleNode);
    const ref = String(meta.moduleRef ?? meta.catalogRef ?? "").trim();
    const version = String(meta.moduleVersion ?? meta.catalogValue ?? "").trim();
    const definition =
      rawGraph.moduleDetails?.[`${ref}@${version}`] ??
      rawGraph.moduleDetails?.[ref];
    if (!definition) {
      throw new Error(`Preflight failed: Module "${ref}@${version}" was not hydrated.`);
    }
    let params;
    try {
      params = JSON.parse(String(meta.moduleParams || "{}"));
    } catch {
      throw new Error(`Preflight failed: Module "${ref}" params are not valid JSON.`);
    }
    const prefix = `${instanceId}::`;
    const idMap = new Map(
      definition.nodes.map((node) => [String(node.id), `${prefix}${String(node.id)}`]),
    );
    const expandedNodes = definition.nodes.map((node, index) => {
      const replaced = replaceModuleParams(node, params);
      return {
        ...replaced,
        id: idMap.get(String(node.id)),
        x: Number(moduleNode.x ?? 0) + index * 36,
        y: Number(moduleNode.y ?? 0) + index * 26,
        meta: {
          ...(replaced.meta || {}),
          am: {
            ...(replaced.meta?.am || {}),
            role: replaced.role ?? replaced.meta?.am?.role,
            moduleInstance: instanceId,
            moduleRef: ref,
            moduleVersion: version,
          },
        },
      };
    });
    nodes.push(...expandedNodes);
    edges.push(
      ...definition.edges.map((edge, index) => ({
        id: `${instanceId}:edge:${index}`,
        from: idMap.get(String(edge.from)),
        to: idMap.get(String(edge.to)),
      })),
    );
    const entry = idMap.get(String(definition.entry));
    const exit = idMap.get(String(definition.exit));
    for (const edge of graph.edges.filter((item) => String(item.to) === instanceId)) {
      edges.push({ ...edge, to: entry });
    }
    for (const edge of graph.edges.filter((item) => String(item.from) === instanceId)) {
      edges.push({ ...edge, from: exit });
    }
  }
  return categorizeWorkflowGraph({ ...rawGraph, edges }, nodes);
}

function compileConnectedWorkflow(graph) {
  const stages = [...(graph.stages ?? [])];
  const agents = [...(graph.agents ?? graph.subagents ?? [])];
  const personas = [...(graph.personas ?? [])];
  const capabilities = [...(graph.capabilities ?? [])];
  const skills = [...(graph.skills ?? [])];
  const gates = [...(graph.gates ?? [])];
  const inputs = [...(graph.inputs ?? [])];
  const artifacts = [...(graph.artifacts ?? [])];
  const results = [...(graph.results ?? [])];
  const edges = [...(graph.edges ?? [])];
  if (!stages.length) {
    throw new Error("Workflow needs at least one Stage node.");
  }

  const nodeId = (node) => String(node?.id ?? node?.meta?.am?.nodeId ?? "");
  const am = (node) => node?.meta?.am ?? node ?? {};
  const stageIds = new Set(stages.map(nodeId));
  const agentIds = new Set(agents.map(nodeId));
  const personaIds = new Set(personas.map(nodeId));
  const stageEdges = edges.filter(
    (edge) => stageIds.has(edge.from) && stageIds.has(edge.to),
  );
  const connected = (left, right) =>
    edges.some(
      (edge) =>
        (edge.from === left && edge.to === right) ||
        (edge.from === right && edge.to === left),
    );

  const gateByTransition = new Map();
  for (const gate of gates) {
    const gateId = nodeId(gate);
    const from = edges.find((edge) => edge.to === gateId && stageIds.has(edge.from))?.from;
    const to = edges.find((edge) => edge.from === gateId && stageIds.has(edge.to))?.to;
    if (from && to) {
      stageEdges.push({ id: `gate:${gateId}`, from, to });
      gateByTransition.set(`${from}->${to}`, gate);
    }
  }

  const orderedStages = topologicallyOrderStages(stages, stageEdges);
  const stageVar = new Map(
    orderedStages.map((stage, index) => [nodeId(stage), `stage_${index}`]),
  );
  const lines = [`// Canvas source-of-truth: validated native workflow nodes.
// Persona and Skill nodes are compact compile-time overlays; skill bodies stay on disk.
let meta = #{
    name: ${rhaiString(graph.name)},
    description: "Compiled from a tldraw visual workflow graph",
};
`];

  for (const stage of orderedStages) {
    const stageId = nodeId(stage);
    const stageMeta = am(stage);
    const label = stageMeta.label || stageMeta.stageType || "Stage";
    const stageType = stageMeta.stageType || "single";
    const stageAgents = agents.filter((agent) => connected(stageId, nodeId(agent)));
    const stagePersonas = personas.filter((persona) => connected(stageId, nodeId(persona)));
    const predecessorExpressions = stageEdges
      .filter((edge) => edge.to === stageId)
      .map((edge) => {
        const value = stageVar.get(edge.from);
        if (!value) return null;
        const gate = gateByTransition.get(`${edge.from}->${edge.to}`);
        if (!gate) return `${value}.to_string()`;
        const gateMeta = am(gate);
        const text = `${value}.to_string()`;
        const expected = rhaiString(String(gateMeta.gateValue ?? ""));
        const condition =
          gateMeta.gateOperator === "contains"
            ? `${text}.contains(${expected})`
            : gateMeta.gateOperator === "equals"
              ? `${text} == ${expected}`
              : `${text} != ""`;
        return gateMeta.gateOnFalse === "skip"
          ? `if ${condition} { ${text} } else { "" }`
          : `if ${condition} { ${text} } else { throw ${rhaiString(
              `Gate failed: ${gateMeta.label || nodeId(gate)}`,
            )}; }`;
      })
      .filter(Boolean);
    const boundaryContext = [
      ...inputs
        .filter((node) => connected(stageId, nodeId(node)))
        .map((node) => `[Input]\\n${String(am(node).dataValue ?? "")}`),
      ...artifacts
        .filter((node) => connected(stageId, nodeId(node)))
        .map((node) => `[Artifact]\\n${String(am(node).artifactRef ?? "")}`),
    ].filter((value) => !/\\n$/.test(value));
    const contextPieces = [
      ...(predecessorExpressions.length ? predecessorExpressions : ["args.to_string()"]),
      ...boundaryContext.map((value) => rhaiString(value)),
    ];
    const contextExpr = contextPieces.join(' + "\\n" + ');
    const variable = stageVar.get(stageId);
    lines.push(`phase(${rhaiString(label)});`);

    if (!stageAgents.length) {
      lines.push(`let ${variable} = ${contextExpr};`, "");
      continue;
    }

    const jobs = stageAgents.map((agent, index) => {
      const agentMeta = am(agent);
      const overlays = personas.filter(
        (persona) =>
          connected(nodeId(persona), nodeId(agent)) || stagePersonas.includes(persona),
      );
      const personaText = overlays
        .map((persona) => {
          const ref = String(am(persona).persona ?? "").trim();
          const detail = graph.personaDetails?.[ref];
          const instructions = String(detail?.instructions ?? "").trim();
          if (!instructions) {
            throw new Error(`Persona "${ref}" could not be hydrated for compilation.`);
          }
          return `[Persona ${ref}]\\n${instructions}`;
        })
        .join("\\n\\n");
      const attachedSkills = skills
        .filter((skill) => connected(nodeId(skill), nodeId(agent)))
        .map((skill) => String(am(skill).skillRef ?? "").trim())
        .filter(Boolean)
        .map(
          (ref) =>
            `[Skill reference: .agents/skills/${ref}/SKILL.md]\\nLoad this project-local skill only for this agent.`,
        )
        .join("\\n\\n");
      const promptPrefix = [
        `Stage: ${label}`,
        `Control: ${stageType}`,
        personaText,
        attachedSkills,
        "Complete the bounded task using the supplied workflow context.",
      ]
        .filter(Boolean)
        .join("\\n\\n");
      const prompt = `${rhaiString(`${promptPrefix}\\n\\nContext:\\n`)} + ${contextExpr}`;
      const labelValue = agentMeta.label || agentMeta.agentRef || `agent-${index + 1}`;
      const options = [`label: ${rhaiString(labelValue)}`];
      if (agentMeta.agentRef) {
        options.push(`agent_type: ${rhaiString(agentMeta.agentRef)}`);
      }
      const personaModel = overlays
        .map((persona) => am(persona).modelRef)
        .find(Boolean);
      const model = agentMeta.modelRef || personaModel;
      if (model) options.push(`model: ${rhaiString(model)}`);
      const capability = capabilities.find((node) =>
        connected(nodeId(node), nodeId(agent)),
      );
      options.push(
        `capability_mode: ${rhaiString(
          String(am(capability).capabilityMode || "all"),
        )}`,
      );
      return { prompt, options: `#{ ${options.join(", ")} }` };
    });

    if (jobs.length === 1) {
      lines.push(
        `let ${variable} = agent(`,
        `    ${jobs[0].prompt},`,
        `    ${jobs[0].options},`,
        `);`,
        "",
      );
    } else {
      lines.push(`let ${variable}_jobs = [];`);
      for (const job of jobs) {
        lines.push(
          `${variable}_jobs.push(#{`,
          `    prompt: ${job.prompt},`,
          `    options: ${job.options},`,
          `});`,
        );
      }
      lines.push(`let ${variable} = parallel(${variable}_jobs);`, "");
    }
  }
  const resultStage = results.length
    ? stages.find((stage) => connected(nodeId(stage), nodeId(results[0])))
    : orderedStages.at(-1);
  lines.push(stageVar.get(nodeId(resultStage)) || "()");
  return `${lines.join("\n")}\n`;
}

function topologicallyOrderStages(stages, edges) {
  const byId = new Map(stages.map((stage) => [String(stage.id), stage]));
  const indegree = new Map([...byId.keys()].map((id) => [id, 0]));
  const outgoing = new Map([...byId.keys()].map((id) => [id, []]));
  for (const edge of edges) {
    if (!byId.has(edge.from) || !byId.has(edge.to) || edge.from === edge.to) continue;
    outgoing.get(edge.from).push(edge.to);
    indegree.set(edge.to, indegree.get(edge.to) + 1);
  }
  const sortCanvasOrder = (left, right) =>
    Number(left?.x ?? 0) - Number(right?.x ?? 0) ||
    Number(left?.y ?? 0) - Number(right?.y ?? 0);
  const queue = stages
    .filter((stage) => indegree.get(String(stage.id)) === 0)
    .sort(sortCanvasOrder);
  const ordered = [];
  while (queue.length) {
    const stage = queue.shift();
    ordered.push(stage);
    for (const next of outgoing.get(String(stage.id)) ?? []) {
      indegree.set(next, indegree.get(next) - 1);
      if (indegree.get(next) === 0) {
        queue.push(byId.get(next));
        queue.sort(sortCanvasOrder);
      }
    }
  }
  if (ordered.length !== stages.length) {
    throw new Error("Stage dependency cycle is not materializable; use a bounded loop preset.");
  }
  return ordered;
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
  return `"${String(value)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t")}"`;
}

/**
 * Collect a compile graph from lane shape records (or specs).
 * Pure: no editor required.
 */
export function collectWorkflowGraph(shapes = [], opts = {}) {
  const nodes = shapes.filter((s) => {
    const am = s?.meta?.am;
    return am && WORKFLOW_RUNTIME_ROLES.has(am.role);
  });
  const categorized = categorizeWorkflowGraph({}, nodes);
  const { stages, agents, personas } = categorized;
  const presetId =
    opts.presetId ??
    stages[0]?.meta?.am?.presetId ??
    agents[0]?.meta?.am?.presetId ??
    null;
  const unmodified =
    opts.unmodified ??
    (nodes.length > 0 && nodes.every((s) => s.meta?.am?.unmodified === true));
  const stageType =
    opts.stageType ??
    stages[0]?.meta?.am?.stageType ??
    defaultStageType(presetId || "single");

  return categorizeWorkflowGraph({
    name: opts.name ?? (presetId ? suggestWorkflowName(presetId) : "canvas-workflow"),
    presetId,
    stageType,
    unmodified: Boolean(unmodified),
    presetScript: opts.presetScript ?? null,
    stages,
    agents,
    personas,
    edges: collectBoundWorkflowEdges(
      nodes,
      opts.records ?? [],
      opts.arrows ?? [],
    ),
    moduleDetails: opts.moduleDetails ?? {},
  }, nodes);
}

export function collectBoundWorkflowEdges(nodes = [], records = [], arrows = []) {
  const nodeIds = new Set(nodes.map((node) => String(node.id)));
  const grouped = new Map();
  for (const record of records) {
    if (record?.typeName !== "binding" || record?.type !== "arrow") continue;
    if (!nodeIds.has(String(record.toId))) continue;
    const terminals = grouped.get(String(record.fromId)) ?? {};
    terminals[record.props?.terminal] = String(record.toId);
    grouped.set(String(record.fromId), terminals);
  }
  const edges = [];
  for (const [arrowId, terminals] of grouped) {
    if (terminals.start && terminals.end && terminals.start !== terminals.end) {
      edges.push({ id: arrowId, from: terminals.start, to: terminals.end });
    }
  }
  for (const arrow of arrows) {
    const from = String(
      arrow?.from ?? arrow?.fromNode ?? arrow?.meta?.am?.fromNode ?? "",
    );
    const to = String(arrow?.to ?? arrow?.toNode ?? arrow?.meta?.am?.toNode ?? "");
    if (nodeIds.has(from) && nodeIds.has(to) && from !== to) {
      edges.push({ id: String(arrow?.id ?? `${from}->${to}`), from, to });
    }
  }
  return [...new Map(edges.map((edge) => [`${edge.from}->${edge.to}`, edge])).values()];
}

export function countWorkflowPorts(nodes = [], records = [], arrows = []) {
  const counts = new Map(
    nodes.map((node) => [String(node.id), { inCount: 0, outCount: 0 }]),
  );
  for (const edge of collectBoundWorkflowEdges(nodes, records, arrows)) {
    const from = counts.get(String(edge.from));
    const to = counts.get(String(edge.to));
    if (from) from.outCount += 1;
    if (to) to.inCount += 1;
  }
  return counts;
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

export function resolveGrokConfigBase(env = globalThis) {
  const fromGlobal =
    env && typeof env.__AM_GROK_CONFIG_BASE__ === "string"
      ? env.__AM_GROK_CONFIG_BASE__.trim()
      : "";
  return fromGlobal || GROK_CONFIG_BASE;
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
      ...(Number.isFinite(shape.x) ? { x: shape.x } : {}),
      ...(Number.isFinite(shape.y) ? { y: shape.y } : {}),
      props: { ...(existing.props || {}), ...(shape.props || {}) },
      meta: { ...(existing.meta || {}), ...(shape.meta || {}) },
    });
    if (
      shape.parentId &&
      existing.parentId !== shape.parentId &&
      typeof editor.reparentShapes === "function"
    ) {
      editor.reparentShapes([existing.id], shape.parentId);
    }
    return editor.getShape?.(shape.id) ?? shape;
  };

  const createArrowBetweenShapes =
    typeof helpers.createArrowBetweenShapes === "function"
      ? (fromId, toId, options) =>
          helpers.createArrowBetweenShapes(fromId, toId, options)
      : (fromId, toId, props = {}) => {
          const from = editor.getShapePageBounds?.(fromId);
          const to = editor.getShapePageBounds?.(toId);
          if (!from || !to) {
            throw new Error("Cannot connect nodes before their bounds are available.");
          }
          const id = props.id || createShapeId(`${ID_NS}-arrow-${Date.now()}`);
          editor.createShape?.({
            id,
            type: "arrow",
            x: from.maxX,
            y: from.center.y,
            props: {
              start: { x: 0, y: 0 },
              end: {
                x: to.minX - from.maxX,
                y: to.center.y - from.center.y,
              },
              color: props.color ?? "grey",
              dash: props.dash ?? "solid",
              size: "s",
              arrowheadEnd: props.arrowheadEnd ?? "arrow",
              richText: props.richText ?? toRichText(props.label || ""),
            },
            meta: props.meta ?? {},
          });
          editor.createBindings?.([
            {
              type: "arrow",
              fromId: id,
              toId: fromId,
              props: {
                terminal: "start",
                normalizedAnchor: { x: 1, y: 0.5 },
                isExact: false,
                isPrecise: true,
              },
            },
            {
              type: "arrow",
              fromId: id,
              toId,
              props: {
                terminal: "end",
                normalizedAnchor: { x: 0, y: 0.5 },
                isExact: false,
                isPrecise: true,
              },
            },
          ]);
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
    syncing: false,
  };
  const previousUiVersion = editor.getShape?.(
    createShapeId(`${ID_NS}-toolbar`),
  )?.meta?.am?.uiVersion;

  run(() => {
    // One native toolbar shape replaces the old frame + nine selectable geos.
    upsertNativeShape({
      id: createShapeId(`${ID_NS}-toolbar`),
      type: AGENTS_MODELS_SHAPE_TYPE,
      x: -10_000,
      y: -10_000,
      props: {
        w: 1,
        h: 1,
      },
      meta: {
        am: {
          domain: "agents-models",
          role: "toolbar",
          kind: "toolbar",
          hiddenControl: true,
          uiVersion: WORKFLOW_UI_VERSION,
          actionState: "idle",
          actionMessage: "Choose a preset to begin.",
        },
      },
    });

    // PHASE lane
    upsertNativeShape({
      id: createShapeId(`${ID_NS}-lane-stage`),
      type: "frame",
      x: layout.stageLane.x,
      y: layout.stageLane.y,
      props: {
        w: layout.stageLane.w,
        h: layout.stageLane.h,
        name: "PHASE",
        color: "grey",
      },
      meta: { am: { role: "furniture", kind: "lane", lane: "PHASE" } },
    });
    // SUBAGENT RUN / PERSONA lane
    upsertNativeShape({
      id: createShapeId(`${ID_NS}-lane-subagent`),
      type: "frame",
      x: layout.subagentLane.x,
      y: layout.subagentLane.y,
      props: {
        w: layout.subagentLane.w,
        h: layout.subagentLane.h,
        name: "SUBAGENT RUN / PERSONA",
        color: "grey",
      },
      meta: {
        am: {
          role: "furniture",
          kind: "lane",
          lane: "SUBAGENT RUN / PERSONA",
        },
      },
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
    // It is a real canvas node: operators can resize it and drag rows out.
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
          hiddenControl: false,
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

  // One-time migration from the schematic/fixed-card layout. It keeps every
  // logical node and every valid binding, reparents workflow cards into page
  // space, then lays them out from the actual binding graph. This prevents
  // arrows from mixing coordinate spaces across frame parents.
  if (previousUiVersion !== WORKFLOW_UI_VERSION) {
    run(() => {
      const all = editor.getCurrentPageShapes?.() ?? [];
      const workflowNodes = all.filter((shape) =>
        WORKFLOW_RUNTIME_ROLES.has(shape?.meta?.am?.role),
      );
      const records = editor.store?.allRecords?.() ?? [];
      const arrows = all.filter((shape) => shape?.type === "arrow");
      const edges = collectBoundWorkflowEdges(workflowNodes, records, arrows);
      const pageId = editor.getCurrentPageId?.();
      if (pageId && typeof editor.reparentShapes === "function") {
        editor.reparentShapes(
          workflowNodes.map((shape) => shape.id),
          pageId,
        );
      }
      const graphLayout = layoutWorkflowGraph(
        workflowNodes.map((shape) => {
          const bounds = editor.getShapePageBounds?.(shape.id);
          return {
            id: String(shape.id),
            role: shape.meta.am.role,
            x: bounds?.minX ?? shape.x,
            y: bounds?.minY ?? shape.y,
            w: shape.props?.w,
            h: shape.props?.h,
          };
        }),
        edges,
        {
          stageX: layout.stageOrigin.x,
          stageY: layout.stageOrigin.y,
          workerY: layout.subagentOrigin.y,
        },
      );
      const updates = workflowNodes.flatMap((shape) => {
        const position = graphLayout.positions.get(String(shape.id));
        if (!position) return [];
        const width = Math.max(210, Number(shape.props?.w ?? position.w));
        const compactFields =
          shape.meta.am.role !== "stage" && width < 260;
        return [
          {
            id: shape.id,
            type: AGENTS_MODELS_SHAPE_TYPE,
            x: position.x,
            y: position.y,
            props: {
              w: width,
              h: Math.max(
                shape.meta.am.role === "stage"
                  ? 166
                  : compactFields
                    ? 226
                    : 184,
                Number(shape.props?.h ?? position.h),
              ),
            },
          },
        ];
      });
      if (updates.length) {
        if (typeof editor.updateShapes === "function") {
          editor.updateShapes(updates);
        } else {
          for (const update of updates) editor.updateShape?.(update);
        }
      }
      const subagentLane = editor.getShape?.(
        createShapeId(`${ID_NS}-lane-subagent`),
      );
      const stageLane = editor.getShape?.(createShapeId(`${ID_NS}-lane-stage`));
      if (stageLane && graphLayout.requiredLaneWidth > stageLane.props?.w) {
        editor.updateShape?.({
          id: stageLane.id,
          type: "frame",
          props: { w: graphLayout.requiredLaneWidth },
        });
      }
      if (subagentLane && graphLayout.requiredSubagentHeight > subagentLane.props?.h) {
        editor.updateShape?.({
          id: subagentLane.id,
          type: "frame",
          props: {
            w: Math.max(
              Number(subagentLane.props?.w ?? 0),
              graphLayout.requiredLaneWidth,
            ),
            h: graphLayout.requiredSubagentHeight,
          },
        });
      }

      const workflowById = new Map(
        workflowNodes.map((shape) => [String(shape.id), shape]),
      );
      for (const edge of edges) {
        const arrow = editor.getShape?.(edge.id);
        const fromRole = workflowById.get(String(edge.from))?.meta?.am?.role;
        const toRole = workflowById.get(String(edge.to))?.meta?.am?.role;
        if (!arrow || arrow.type !== "arrow" || !fromRole || !toRole) continue;
        const style = workflowEdgeStyle(fromRole, toRole);
        editor.updateShape?.({
          id: arrow.id,
          type: "arrow",
          props: {
            bend: 0,
            color: style.color,
            dash: style.dash,
            size: "s",
            arrowheadEnd: "arrow",
          },
          meta: {
            ...(arrow.meta || {}),
            am: {
              ...(arrow.meta?.am || {}),
              role: "arrow",
              kind: style.kind,
              fromNode: String(edge.from),
              toNode: String(edge.to),
            },
          },
        });
      }

      const bindingCountByArrow = new Map();
      for (const record of editor.store?.allRecords?.() ?? []) {
        if (record?.typeName !== "binding" || record?.type !== "arrow") continue;
        bindingCountByArrow.set(
          String(record.fromId),
          (bindingCountByArrow.get(String(record.fromId)) ?? 0) + 1,
        );
      }
      const orphanGeneratedArrows = all.filter(
        (shape) =>
          shape?.type === "arrow" &&
          shape?.meta?.am?.role === "arrow" &&
          (bindingCountByArrow.get(String(shape.id)) ?? 0) < 2,
      );
      if (orphanGeneratedArrows.length) {
        editor.deleteShapes?.(orphanGeneratedArrows.map((shape) => shape.id));
      }
    });
  }

  // ---- Catalog sync (debounce + AbortController tied to signal) ----
  let catalogTimer = null;
  let catalogAbort = null;

  const clearCatalogDynamic = () => {
    const all = editor.getCurrentPageShapes?.() ?? [];
    const doomed = all.filter((s) => {
      const role = s?.meta?.am?.role;
      const legacyCatalogId = String(s?.id ?? "").startsWith(
        "shape:am-catalog-",
      );
      return (
        role === "model-slot" ||
        role === "role" ||
        role === "catalog-header" ||
        role === "catalog-more" ||
        role === "catalog-error" ||
        role === "status-dot" ||
        (legacyCatalogId && (role === "agent" || role === "persona"))
      );
    });
    if (doomed.length && editor.deleteShapes) {
      editor.deleteShapes(doomed.map((s) => s.id));
    }
  };

  const renderCatalogNodes = (nodes, proxyOk = null, sections = null) => {
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
              hiddenControl: false,
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
                : sections ?? catalogNodesToSections(nodes),
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
      const res = await fetch(`${resolveGrokConfigBase()}/api/grok/catalog`, {
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
        catalogToInteractiveSections(catalog),
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
      "agent",
      "persona",
      "subagent",
      "capability",
      "skill",
      "gate",
      "input",
      "artifact",
      "result",
      "module",
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
      if (WORKFLOW_RUNTIME_ROLES.has(am.card)) return true;
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

  const refreshWorkflowPortCounts = () => {
    const all = editor.getCurrentPageShapes?.() ?? [];
    const nodes = all.filter((shape) =>
      WORKFLOW_RUNTIME_ROLES.has(shape?.meta?.am?.role),
    );
    const counts = countWorkflowPorts(
      nodes,
      editor.store?.allRecords?.() ?? [],
      all.filter((shape) => shape?.type === "arrow"),
    );
    const updates = nodes.flatMap((shape) => {
      const count = counts.get(String(shape.id)) ?? {
        inCount: 0,
        outCount: 0,
      };
      const meta = shape.meta?.am ?? {};
      if (
        meta.inCount === count.inCount &&
        meta.outCount === count.outCount
      ) {
        return [];
      }
      return [
        {
          id: shape.id,
          type: AGENTS_MODELS_SHAPE_TYPE,
          meta: {
            ...(shape.meta || {}),
            am: {
              ...meta,
              ...count,
            },
          },
        },
      ];
    });
    if (updates.length) {
      run(() => {
        if (typeof editor.updateShapes === "function") {
          editor.updateShapes(updates);
        } else {
          for (const update of updates) editor.updateShape?.(update);
        }
      });
    }
    return counts;
  };

  const relayoutWorkflowGraph = () => {
    const all = editor.getCurrentPageShapes?.() ?? [];
    const workflowNodes = all.filter((shape) =>
      WORKFLOW_RUNTIME_ROLES.has(shape?.meta?.am?.role),
    );
    if (!workflowNodes.length) return null;
    const arrows = all.filter((shape) => shape?.type === "arrow");
    const edges = collectBoundWorkflowEdges(
      workflowNodes,
      editor.store?.allRecords?.() ?? [],
      arrows,
    );
    const pageId = editor.getCurrentPageId?.();
    if (pageId && typeof editor.reparentShapes === "function") {
      editor.reparentShapes(
        workflowNodes.map((shape) => shape.id),
        pageId,
      );
    }
    const graphLayout = layoutWorkflowGraph(
      workflowNodes.map((shape) => {
        const bounds = editor.getShapePageBounds?.(shape.id);
        return {
          id: String(shape.id),
          role: shape.meta?.am?.role,
          x: bounds?.minX ?? shape.x,
          y: bounds?.minY ?? shape.y,
          w: shape.props?.w,
          h: shape.props?.h,
        };
      }),
      edges,
      {
        stageX: layout.stageOrigin.x,
        stageY: layout.stageOrigin.y,
        workerY: layout.subagentOrigin.y,
      },
    );
    const updates = workflowNodes.flatMap((shape) => {
      const position = graphLayout.positions.get(String(shape.id));
      if (!position) return [];
      return [
        {
          id: shape.id,
          type: AGENTS_MODELS_SHAPE_TYPE,
          x: position.x,
          y: position.y,
        },
      ];
    });
    if (updates.length) {
      if (typeof editor.updateShapes === "function") editor.updateShapes(updates);
      else for (const update of updates) editor.updateShape?.(update);
    }

    const stageLane = editor.getShape?.(createShapeId(`${ID_NS}-lane-stage`));
    const subagentLane = editor.getShape?.(
      createShapeId(`${ID_NS}-lane-subagent`),
    );
    if (stageLane) {
      editor.updateShape?.({
        id: stageLane.id,
        type: "frame",
        props: {
          w: Math.max(
            Number(stageLane.props?.w ?? 0),
            graphLayout.requiredLaneWidth,
          ),
        },
      });
    }
    if (subagentLane) {
      editor.updateShape?.({
        id: subagentLane.id,
        type: "frame",
        props: {
          w: Math.max(
            Number(subagentLane.props?.w ?? 0),
            graphLayout.requiredLaneWidth,
          ),
          h: Math.max(
            Number(subagentLane.props?.h ?? 0),
            graphLayout.requiredSubagentHeight,
          ),
        },
      });
    }

    const workflowById = new Map(
      workflowNodes.map((shape) => [String(shape.id), shape]),
    );
    for (const edge of edges) {
      const arrow = editor.getShape?.(edge.id);
      const fromRole = workflowById.get(String(edge.from))?.meta?.am?.role;
      const toRole = workflowById.get(String(edge.to))?.meta?.am?.role;
      if (!arrow || arrow.type !== "arrow" || !fromRole || !toRole) continue;
      const style = workflowEdgeStyle(fromRole, toRole);
      editor.updateShape?.({
        id: arrow.id,
        type: "arrow",
        props: {
          bend: 0,
          color: style.color,
          dash: style.dash,
          size: "s",
          arrowheadEnd: "arrow",
        },
        meta: {
          ...(arrow.meta || {}),
          am: {
            ...(arrow.meta?.am || {}),
            role: "arrow",
            kind: style.kind,
            fromNode: String(edge.from),
            toNode: String(edge.to),
          },
        },
      });
    }
    return graphLayout;
  };

  const addWorkflowNode = (nodeKind, options = {}) => {
    if (!WORKFLOW_NODE_ROLES.includes(nodeKind)) {
      throw new Error(`Unsupported workflow node kind: ${nodeKind}`);
    }
    const all = editor.getCurrentPageShapes?.() ?? [];
    const peers = all.filter((shape) => {
      const role = shape?.meta?.am?.role;
      return nodeKind === "stage"
        ? role === "stage"
        : WORKFLOW_RUNTIME_ROLES.has(role) && role !== "stage";
    });
    const index = peers.length;
    const inStageLane = nodeKind === "stage";
    const targetW =
      nodeKind === "stage" ? LAYOUT.stageNodeW : LAYOUT.subagentW;
    const targetH =
      nodeKind === "stage"
        ? LAYOUT.stageNodeH
        : ["capability", "skill", "gate", "input", "artifact", "result", "module"].includes(nodeKind)
          ? 226
          : LAYOUT.subagentH;
    let x =
      (inStageLane ? layout.stageOrigin.x : layout.subagentOrigin.x) +
      (index % 3) * 300;
    let y =
      (inStageLane ? layout.stageOrigin.y : layout.subagentOrigin.y) +
      Math.floor(index / 3) * 220;
    const connectFrom = options.connectFromId
      ? editor.getShape?.(options.connectFromId)
      : null;
    if (
      Number.isFinite(options.dropPoint?.x) &&
      Number.isFinite(options.dropPoint?.y)
    ) {
      x = Number(options.dropPoint.x) - targetW / 2;
      y = Number(options.dropPoint.y) - 28;
    } else if (connectFrom) {
      const sourceBounds = editor.getShapePageBounds?.(connectFrom.id);
      if (sourceBounds) {
        const suggested = suggestConnectedNodePosition(
          {
            role: connectFrom.meta?.am?.role,
            bounds: sourceBounds,
          },
          nodeKind,
          { w: targetW, h: targetH },
          all.flatMap((shape) => {
            if (
              !WORKFLOW_RUNTIME_ROLES.has(shape?.meta?.am?.role)
            ) {
              return [];
            }
            const bounds = editor.getShapePageBounds?.(shape.id);
            return bounds ? [bounds] : [];
          }),
          { workerY: layout.subagentOrigin.y },
        );
        x = suggested.x;
        y = suggested.y;
      }
    }
    const id = createShapeId(
      `${ID_NS}-${nodeKind}-${Date.now().toString(36)}-${index}`,
    );
    const defaultLabels = {
      stage: "Stage",
      agent: "Agent",
      persona: "Persona",
      capability: "Capabilities",
      skill: "Skill",
      gate: "Gate",
      input: "Input",
      artifact: "Artifact",
      result: "Result",
      module: "Module",
    };
    const label = options.catalogItemLabel
      ? String(options.catalogItemLabel)
      : `${defaultLabels[nodeKind] || nodeKind} ${index + 1}`;
    const nodeMeta = {
      domain: "agents-models",
      role: nodeKind,
      card: nodeKind,
      label,
      statusColor: "grey",
      inCount: 0,
      outCount: 0,
      unmodified: false,
    };
    if (nodeKind === "stage") nodeMeta.stageType = "single";
    if (nodeKind === "agent") {
      nodeMeta.agentRef = options.catalogItemId
        ? String(options.catalogItemId)
        : null;
    }
    if (nodeKind === "persona") {
      nodeMeta.persona = options.catalogItemId
        ? String(options.catalogItemId)
        : "";
    }
    if (nodeKind === "capability") {
      nodeMeta.capabilityMode = "all";
      nodeMeta.toolRefsText = "";
    }
    if (nodeKind === "skill") {
      nodeMeta.skillRef = options.catalogItemId
        ? String(options.catalogItemId)
        : "";
    }
    if (nodeKind === "gate") {
      nodeMeta.gateOperator = "not-empty";
      nodeMeta.gateValue = "";
      nodeMeta.gateOnFalse = "stop";
      nodeMeta.retryCount = 0;
      nodeMeta.timeoutSeconds = 0;
      nodeMeta.errorRoute = "";
    }
    if (nodeKind === "input") nodeMeta.dataValue = "";
    if (nodeKind === "artifact") nodeMeta.artifactRef = "";
    if (nodeKind === "result") nodeMeta.resultLabel = "Workflow result";
    if (nodeKind === "module") {
      nodeMeta.moduleRef = options.catalogItemId
        ? String(options.catalogItemId)
        : "";
      nodeMeta.moduleVersion = options.catalogItemValue
        ? String(options.catalogItemValue)
        : "";
      nodeMeta.moduleParams = "{}";
    }
    if (options.catalogItemId) {
      nodeMeta.catalogRef = String(options.catalogItemId);
      nodeMeta.catalogValue = String(options.catalogItemValue ?? "");
    }
    run(() => {
      upsertNativeShape({
        id,
        type: AGENTS_MODELS_SHAPE_TYPE,
        parentId: editor.getCurrentPageId?.(),
        x,
        y,
        props: {
          w: targetW,
          h: targetH,
        },
        meta: {
          am: nodeMeta,
        },
      });
      editor.select?.(id);
    });
    if (connectFrom) {
      const arrowId = createArrowBetweenShapes(connectFrom.id, id, {
        bend: 0,
        arrowheadEnd: "arrow",
        richText: toRichText(""),
      });
      const arrow = editor.getShape?.(arrowId);
      if (arrow?.type === "arrow") {
        const style = workflowEdgeStyle(
          connectFrom.meta?.am?.role,
          nodeKind,
        );
        editor.updateShape?.({
          id: arrow.id,
          type: "arrow",
          props: {
            bend: 0,
            dash: style.dash,
            color: style.color,
            size: "s",
            arrowheadEnd: "arrow",
          },
          meta: {
            ...(arrow.meta || {}),
            am: {
              role: "arrow",
              kind: style.kind,
              fromNode: String(connectFrom.id),
              toNode: String(id),
            },
          },
        });
      }
    }
    refreshWorkflowPortCounts();
    state.unmodified = false;
    updateToolbarReceipt(
      "succeeded",
      options.catalogItemId
        ? `Created ${nodeKind} “${label}” from the live catalog.`
        : connectFrom
        ? `Added ${nodeKind} and connected it with a bound arrow.`
        : `Added ${nodeKind}.`,
    );
    return id;
  };

  const materializePreset = async (presetId) => {
    if (state.instantiating) return;
    state.instantiating = true;
    const token = resolveAuthToken();
    try {
      let preset = { id: presetId, stageType: defaultStageType(presetId) };
      try {
        const res = await fetch(`${resolveGrokConfigBase()}/api/grok/workflow-presets`, {
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
            parentId: editor.getCurrentPageId?.(),
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
                role: spec.kind === "subagent" ? "agent" : spec.kind,
                card: spec.kind === "subagent" ? "agent" : spec.kind,
                label: spec.meta?.am?.label ?? spec.text ?? spec.kind,
                agentRef: spec.meta?.am?.agentRef ?? null,
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
      relayoutWorkflowGraph();
      refreshWorkflowPortCounts();

      state.lastPresetId = presetId;
      state.lastPresetScript =
        typeof preset.script === "string" ? preset.script : graph.presetScript;
      state.unmodified = true;
      updateToolbarReceipt(
        "succeeded",
        `${presetId.toUpperCase()} ready · ${graph.stages.length} stage(s) · ${graph.agents.length} agent(s)`,
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

  const hydratePersonaDetails = async (graph) => {
    const refs = [
      ...new Set(
        (graph.personas ?? [])
          .map((persona) => String(persona?.meta?.am?.persona ?? "").trim())
          .filter(Boolean),
      ),
    ];
    const details = {};
    for (const ref of refs) {
      const res = await fetch(
        `${resolveGrokConfigBase()}/api/grok/personas/${encodeURIComponent(ref)}`,
        {
          method: "GET",
          headers: authHeaders(resolveAuthToken()),
          signal: signal ?? undefined,
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.persona?.instructions) {
        throw new Error(
          body?.message || `Persona "${ref}" instructions are unavailable.`,
        );
      }
      details[ref] = {
        instructions: String(body.persona.instructions).slice(0, 12_000),
      };
    }
    return details;
  };

  const hydrateModuleDetails = async (graph) => {
    const refs = [
      ...new Map(
        (graph.modules ?? [])
          .map((node) => {
            const meta = node?.meta?.am ?? {};
            const id = String(meta.moduleRef ?? meta.catalogRef ?? "").trim();
            const version = String(
              meta.moduleVersion ?? meta.catalogValue ?? "",
            ).trim();
            return id && version ? [`${id}@${version}`, { id, version }] : null;
          })
          .filter(Boolean),
      ).entries(),
    ];
    const details = {};
    for (const [key, ref] of refs) {
      const res = await fetch(
        `${resolveGrokConfigBase()}/api/grok/modules/${encodeURIComponent(
          ref.id,
        )}?version=${encodeURIComponent(ref.version)}`,
        {
          method: "GET",
          headers: authHeaders(resolveAuthToken()),
          signal: signal ?? undefined,
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.module?.nodes) {
        throw new Error(
          body?.message || `Module "${key}" definition is unavailable.`,
        );
      }
      details[key] = body.module;
    }
    return details;
  };

  const inspectCurrentWorkflow = async () => {
    const all = editor.getCurrentPageShapes?.() ?? [];
    const graph = collectWorkflowGraph(all, {
      presetId: state.lastPresetId,
      unmodified: state.unmodified,
      presetScript: state.lastPresetScript,
      records: editor.store?.allRecords?.() ?? [],
    });
    graph.moduleDetails = await hydrateModuleDetails(graph);
    return { all, graph, report: preflightWorkflow(graph) };
  };

  const handlePreflight = async () => {
    try {
      const { report } = await inspectCurrentWorkflow();
      if (!report.ok) {
        updateToolbarReceipt(
          "failed",
          `PREFLIGHT · ${report.errors[0]?.message || "Graph is invalid."} · ${
            report.errors.length
          } error(s)`,
        );
        return report;
      }
      updateToolbarReceipt(
        "succeeded",
        `PREFLIGHT OK · ${report.summary.nodes} nodes · ${report.summary.edges} edges · ${report.warnings.length} warning(s)`,
      );
      return report;
    } catch (error) {
      updateToolbarReceipt(
        "failed",
        `PREFLIGHT ERROR · ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  };

  const handleApply = async (mode = "apply") => {
    if (state.applying) return;
    state.applying = true;
    try {
      const { all, graph, report } = await inspectCurrentWorkflow();
      // Detect modification: any workflow node without unmodified flag
      const wf = all.filter((s) => {
        const r = s?.meta?.am?.role;
        return WORKFLOW_RUNTIME_ROLES.has(r);
      });
      if (wf.some((s) => s.meta?.am?.unmodified !== true)) {
        graph.unmodified = false;
      }

      if (!report.ok) {
        throw new Error(
          `${report.errors[0]?.message || "Graph is invalid."} (${report.errors.length} error(s))`,
        );
      }
      graph.personaDetails = await hydratePersonaDetails(graph);
      const script = compileWorkflow(graph);
      const name = graph.name;
      const token = resolveAuthToken();
      let receipt;
      try {
        const res = await fetch(`${resolveGrokConfigBase()}/api/grok/workflows/save`, {
          method: "POST",
          headers: {
            ...authHeaders(token),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name,
            script,
            scope: "user",
            overwrite: true,
          }),
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

      if (receipt.ok) {
        updateToolbarReceipt(
          "succeeded",
          mode === "play"
            ? `Materialized ${name}. Run /workflow ${name} in Grok.`
            : `Saved ${name}. Ready for /workflow ${name}.`,
        );
      }
    } catch (error) {
      updateToolbarReceipt(
        "failed",
        `COMPILE ERROR · ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      state.applying = false;
    }
  };

  const handlePlay = () => handleApply("play");

  const handleConfigSync = async () => {
    if (state.syncing) return;
    state.syncing = true;
    try {
      const { report } = await inspectCurrentWorkflow();
      if (!report.ok) {
        throw new Error(
          `Preflight failed: ${report.errors[0]?.message || "Graph is invalid."}`,
        );
      }
      const assignments = [
        ...new Map(
          (editor.getCurrentPageShapes?.() ?? [])
            .filter((shape) =>
              ["agent", "subagent"].includes(shape?.meta?.am?.role),
            )
            .map((shape) => ({
              agentId: String(shape.meta?.am?.agentRef ?? "").trim(),
              modelRef: String(shape.meta?.am?.modelRef ?? "").trim(),
            }))
            .filter((item) => item.agentId && item.modelRef)
            .map((item) => [item.agentId, item]),
        ).values(),
      ];
      if (!assignments.length) {
        throw new Error(
          "Select an explicit Agent and Model on at least one Agent node first.",
        );
      }
      const token = resolveAuthToken();
      const base = resolveGrokConfigBase();
      const snapshotRes = await fetch(`${base}/api/grok/config-snapshot`, {
        method: "GET",
        headers: authHeaders(token),
        signal: signal ?? undefined,
      });
      const snapshot = await snapshotRes.json().catch(() => ({}));
      if (!snapshotRes.ok) {
        throw new Error(snapshot.message || `Snapshot failed (${snapshotRes.status}).`);
      }
      const requestId = `canvas-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      const payload = {
        expectedRevision: snapshot.revision,
        requestId,
        assignments,
      };
      const previewRes = await fetch(`${base}/api/grok/config-sync`, {
        method: "POST",
        headers: {
          ...authHeaders(token),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ...payload, dryRun: true }),
        signal: signal ?? undefined,
      });
      const preview = await previewRes.json().catch(() => ({}));
      if (!previewRes.ok) {
        throw new Error(preview.message || `Sync preview failed (${previewRes.status}).`);
      }
      if (!preview.changeCount) {
        updateToolbarReceipt(
          "succeeded",
          `config.toml already matches · rev ${String(snapshot.revision).slice(0, 8)}`,
        );
        return;
      }
      const commitRes = await fetch(`${base}/api/grok/config-sync`, {
        method: "POST",
        headers: {
          ...authHeaders(token),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ...payload, dryRun: false }),
        signal: signal ?? undefined,
      });
      const receipt = await commitRes.json().catch(() => ({}));
      if (!commitRes.ok) {
        throw new Error(receipt.message || `Config sync failed (${commitRes.status}).`);
      }
      updateToolbarReceipt(
        "succeeded",
        `Synced ${receipt.changeCount} assignment(s) · rev ${String(
          receipt.beforeRevision,
        ).slice(0, 7)}→${String(receipt.afterRevision).slice(0, 7)} · next session`,
      );
    } catch (error) {
      updateToolbarReceipt(
        "failed",
        `CONFIG SYNC ERROR · ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      state.syncing = false;
    }
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
    // Store listeners run inside the transaction that wrote the action
    // request. Defer the mutation so a newly-created custom node is committed
    // before createArrowBetweenShapes resolves its bounds and writes bindings.
    queueMicrotask(() => {
      if (request.kind === "preset" && request.presetId) {
        materializePreset(request.presetId);
      } else if (request.kind === "node" && request.nodeKind) {
        try {
          addWorkflowNode(request.nodeKind, {
            connectFromId: request.connectFromId,
            catalogItemId: request.catalogItemId,
            catalogItemLabel: request.catalogItemLabel,
            catalogItemValue: request.catalogItemValue,
            dropPoint: request.dropPoint,
          });
        } catch (error) {
          updateToolbarReceipt(
            "failed",
            `NODE ERROR · ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      } else if (request.kind === "apply") {
        handleApply();
      } else if (request.kind === "play") {
        handlePlay();
      } else if (request.kind === "preflight") {
        handlePreflight();
      } else if (request.kind === "config-sync") {
        handleConfigSync();
      } else {
        updateToolbarReceipt("failed", "Unknown toolbar action request.");
      }
    });
  };

  let unlistenDoc = null;
  let portRefreshTimer = null;
  if (editor.store?.listen) {
    unlistenDoc = editor.store.listen(
      (entry) => {
        try {
          onToolbarActionMaybe();
          const changes = entry?.changes;
          if (!changes) return;
          const changedRecords = [
            ...Object.values(changes.added || {}),
            ...Object.values(changes.removed || {}),
            ...Object.values(changes.updated || {}).flatMap((change) =>
              Array.isArray(change) ? change : [change],
            ),
          ];
          if (
            changedRecords.some(
              (record) =>
                record?.typeName === "binding" ||
                record?.type === "arrow" ||
                WORKFLOW_RUNTIME_ROLES.has(record?.meta?.am?.role),
            )
          ) {
            if (portRefreshTimer) clearTimeout(portRefreshTimer);
            portRefreshTimer = setTimeout(() => {
              portRefreshTimer = null;
              refreshWorkflowPortCounts();
            }, 0);
          }
          const updated = changes.updated || {};
          for (const change of Object.values(updated)) {
            const shape = Array.isArray(change) ? change[1] : change;
            const role = shape?.meta?.am?.role;
            if (WORKFLOW_RUNTIME_ROLES.has(role)) {
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
    if (portRefreshTimer) clearTimeout(portRefreshTimer);
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
    _addWorkflowNode: addWorkflowNode,
    _refreshWorkflowPortCounts: refreshWorkflowPortCounts,
    _handleApply: handleApply,
    _handlePlay: handlePlay,
    _handlePreflight: handlePreflight,
    _handleConfigSync: handleConfigSync,
    _scheduleCatalog: scheduleCatalog,
  };
}
