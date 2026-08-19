// client/canvas-kit/grokWorkflowCanvasKit.ts
import {
  PageRecordType,
  createBindingId,
  createShapeId as createShapeId4,
  getIndicesAbove
} from "tldraw";

// client/agents-models/AgentsModelsShape.tsx
import {
  BaseBoxShapeUtil,
  HTMLContainer,
  T,
  TldrawUiButton,
  TldrawUiButtonLabel,
  TldrawUiDialogBody,
  TldrawUiDialogCloseButton,
  TldrawUiDialogFooter,
  TldrawUiDialogHeader,
  TldrawUiDialogTitle,
  createShapeId,
  resizeBox,
  stopEventPropagation,
  useDialogs,
  useEditor as useEditor2,
  useValue as useValue2
} from "tldraw";
import { useMemo, useRef, useState } from "react";

// client/bridge/grokBridgeSupervisorClient.ts
function resolveGrokBridgeOrigin(directOrigin, proxyPath) {
  const currentLocation = globalThis.location;
  const isWeb = currentLocation?.protocol === "http:" || currentLocation?.protocol === "https:";
  const isLoopback = currentLocation?.hostname === "127.0.0.1" || currentLocation?.hostname === "localhost";
  return isWeb && !isLoopback && currentLocation?.origin ? `${currentLocation.origin}${proxyPath}` : directOrigin;
}
var GROK_SUPERVISOR_ORIGIN = globalThis.__AM_GROK_SUPERVISOR_BASE__ ?? resolveGrokBridgeOrigin("http://127.0.0.1:5187", "/__canvas-grok-supervisor");
var GROK_CONFIG_ORIGIN = resolveGrokBridgeOrigin("http://127.0.0.1:5188", "/__canvas-grok-config");
function resolveResidentCapability(injected = globalThis.__AM_GROK_CONFIG_TOKEN__) {
  const value = injected?.trim();
  return value || void 0;
}
function installCanvasBridgeCapability(scope = globalThis, capability = resolveResidentCapability()) {
  if (!capability) return void 0;
  scope.__AM_GROK_CONFIG_TOKEN__ = capability;
  return capability;
}
async function acquireCanvasBridgeCapability(signal, options = {}) {
  const existing = resolveResidentCapability();
  if (existing && !options.refresh) return existing;
  let response;
  try {
    response = await fetch(`${GROK_SUPERVISOR_ORIGIN}/api/session`, {
      method: "GET",
      headers: { accept: "application/json" },
      signal
    });
  } catch {
    throw new Error(
      "Bridge supervisor unavailable. Run npm run supervisor:install once."
    );
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      isRecord(payload) && typeof payload.message === "string" ? payload.message : `Bridge session handoff returned HTTP ${response.status}`
    );
  }
  if (!isRecord(payload) || typeof payload.capability !== "string") {
    throw new Error("Bridge supervisor returned an invalid session capability");
  }
  const capability = payload.capability.trim();
  if (capability.length < 24) {
    throw new Error("Bridge supervisor returned an invalid session capability");
  }
  installCanvasBridgeCapability(
    globalThis,
    capability
  );
  return capability;
}
async function grokConfigFetch(path, init = {}) {
  let capability = await acquireCanvasBridgeCapability(
    init.signal ?? void 0
  );
  const request = () => {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${capability}`);
    headers.set("accept", "application/json");
    return fetch(`${globalThis.__AM_GROK_CONFIG_BASE__ ?? GROK_CONFIG_ORIGIN}${path}`, {
      ...init,
      headers
    });
  };
  let response;
  try {
    response = await request();
    if (response.status === 401) {
      capability = await acquireCanvasBridgeCapability(
        init.signal ?? void 0,
        { refresh: true }
      );
      response = await request();
    }
  } catch {
    throw new Error("Grok config bridge is unavailable. Start it from the Grok palette.");
  }
  return response;
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// client/workflow/WorkflowIcons.tsx
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
function WorkflowIcon({ name }) {
  return /* @__PURE__ */ jsxs(
    "svg",
    {
      className: "workflow-tool-icon",
      viewBox: "0 0 24 24",
      "aria-hidden": "true",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "1.7",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      children: [
        name === "map" && /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx("path", { d: "m3.5 5 5-2 7 2 5-2v16l-5 2-7-2-5 2Z" }),
          /* @__PURE__ */ jsx("path", { d: "M8.5 3v16M15.5 5v16" })
        ] }),
        name === "input" && /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx("rect", { x: "8", y: "5", width: "12", height: "14", rx: "2" }),
          /* @__PURE__ */ jsx("path", { d: "M3 12h10M9.5 8.5 13 12l-3.5 3.5" })
        ] }),
        name === "context" && /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx("path", { d: "M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4" }),
          /* @__PURE__ */ jsx("rect", { x: "8", y: "8", width: "8", height: "8", rx: "2" })
        ] }),
        name === "action" && /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx("path", { d: "M14.8 6.2a4 4 0 0 0-5 5L4 17l3 3 5.8-5.8a4 4 0 0 0 5-5l-2.7 2.7-3-3Z" }),
          /* @__PURE__ */ jsx("path", { d: "m4 17 3 3" })
        ] }),
        name === "prompt-template" && /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx("rect", { x: "4", y: "3", width: "16", height: "18", rx: "2" }),
          /* @__PURE__ */ jsx("path", { d: "M8 8h8M8 12h5" }),
          /* @__PURE__ */ jsx("path", { d: "m9 15-2 2 2 2M15 15l2 2-2 2" })
        ] }),
        name === "decision" && /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx("path", { d: "m12 3 7 7-7 7-7-7Z" }),
          /* @__PURE__ */ jsx("path", { d: "M12 17v4M5 10H2M19 10h3" })
        ] }),
        name === "agent" && /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx("circle", { cx: "12", cy: "8", r: "3" }),
          /* @__PURE__ */ jsx("path", { d: "M6 20v-2a6 6 0 0 1 12 0v2" }),
          /* @__PURE__ */ jsx("path", { d: "M4 5h3M17 5h3M3 8h3M18 8h3", opacity: ".55" })
        ] }),
        name === "data" && /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx("ellipse", { cx: "12", cy: "5.5", rx: "7", ry: "3" }),
          /* @__PURE__ */ jsx("path", { d: "M5 5.5v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" }),
          /* @__PURE__ */ jsx("path", { d: "M5 11.5v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" })
        ] }),
        name === "output" && /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx("rect", { x: "4", y: "5", width: "12", height: "14", rx: "2" }),
          /* @__PURE__ */ jsx("path", { d: "M11 12h10M17.5 8.5 21 12l-3.5 3.5" })
        ] }),
        name === "rich-output" && /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx("rect", { x: "3", y: "4", width: "18", height: "16", rx: "2" }),
          /* @__PURE__ */ jsx("path", { d: "M7 8h6M7 11h10M7 14h4" }),
          /* @__PURE__ */ jsx("path", { d: "m14.5 15.5 2 2 3-4" })
        ] }),
        name === "search" && /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx("circle", { cx: "10.5", cy: "10.5", r: "6.5" }),
          /* @__PURE__ */ jsx("path", { d: "m15.5 15.5 5 5" })
        ] }),
        name === "play" && /* @__PURE__ */ jsx("path", { d: "m8 5 11 7-11 7Z", fill: "currentColor", stroke: "none" }),
        name === "stop" && /* @__PURE__ */ jsx("rect", { x: "7", y: "7", width: "10", height: "10", rx: "1.5", fill: "currentColor", stroke: "none" })
      ]
    }
  );
}

// client/workflow/WorkflowPorts.tsx
import {
  Circle2d,
  Group2d,
  Rectangle2d,
  Vec,
  useEditor,
  useValue
} from "tldraw";

// client/workflow/WorkflowNodePickerState.ts
import { atom } from "tldraw";
var workflowNodePickerState = atom(
  "workflow node picker",
  null
);
function openWorkflowNodePicker(request) {
  const current = workflowNodePickerState.get();
  if (current && current.connectionId !== request.connectionId) {
    cancelWorkflowNodePicker(current.editor);
  }
  workflowNodePickerState.set(request);
}
function cancelWorkflowNodePicker(editor) {
  const request = workflowNodePickerState.get();
  if (!request || editor && request.editor !== editor) return;
  const terminals = new Set(
    request.editor.getBindingsFromShape(request.connectionId, "workflow-port").map((binding) => binding.props?.terminal)
  );
  if (!terminals.has("start") || !terminals.has("end")) {
    request.editor.deleteShapes([request.connectionId]);
  }
  workflowNodePickerState.set(null);
}

// client/workflow/WorkflowPorts.tsx
import { Fragment as Fragment2, jsx as jsx2 } from "react/jsx-runtime";
var ROLE_PORTS = {
  stage: [
    { id: "control-in", terminal: "end", label: "phase input", side: "left" },
    { id: "control-out", terminal: "start", label: "next phase", side: "right" },
    { id: "children-out", terminal: "start", label: "phase children", side: "bottom" },
    { id: "data-in", terminal: "end", label: "phase data", side: "left" }
  ],
  agent: [
    { id: "assignment-in", terminal: "end", label: "phase assignment", side: "top" },
    { id: "resume-in", terminal: "end", label: "resume input", side: "left" },
    { id: "agent-out", terminal: "start", label: "resume output", side: "right" },
    { id: "result-out", terminal: "start", label: "result data", side: "right" },
    { id: "attachments-out", terminal: "start", label: "persona, role or capability", side: "bottom" }
  ],
  subagent: [
    { id: "assignment-in", terminal: "end", label: "phase assignment", side: "top" },
    { id: "resume-in", terminal: "end", label: "resume input", side: "left" },
    { id: "agent-out", terminal: "start", label: "resume output", side: "right" },
    { id: "result-out", terminal: "start", label: "result data", side: "right" },
    { id: "attachments-out", terminal: "start", label: "persona, role or capability", side: "bottom" }
  ],
  persona: [{ id: "persona-in", terminal: "end", label: "persona attachment", side: "top" }],
  role: [{ id: "role-in", terminal: "end", label: "role attachment", side: "top" }],
  capability: [
    { id: "capability-in", terminal: "end", label: "capability attachment", side: "top" }
  ],
  gate: [
    { id: "condition-in", terminal: "end", label: "condition input", side: "left" },
    { id: "pass-out", terminal: "start", label: "condition pass", side: "right" }
  ],
  input: [{ id: "data-out", terminal: "start", label: "input data", side: "right" }],
  artifact: [
    { id: "artifact-in", terminal: "end", label: "artifact input", side: "left" },
    { id: "artifact-out", terminal: "start", label: "artifact data", side: "right" }
  ],
  result: [{ id: "result-in", terminal: "end", label: "workflow result", side: "left" }],
  module: [
    { id: "module-in", terminal: "end", label: "module input", side: "left" },
    { id: "module-out", terminal: "start", label: "module output", side: "right" }
  ],
  // Legacy Skill nodes remain readable while they migrate into Agent.skillRefs.
  skill: [{ id: "skill-in", terminal: "end", label: "legacy skill attachment", side: "top" }]
};
function portPosition(shape, side, index, count) {
  const offset = (index + 1) / (count + 1);
  if (side === "left") return { x: 0, y: shape.props.h * offset };
  if (side === "right") return { x: shape.props.w, y: shape.props.h * offset };
  if (side === "top") return { x: shape.props.w * offset, y: 0 };
  return { x: shape.props.w * offset, y: shape.props.h };
}
function getWorkflowPorts(shape) {
  const meta = shape.meta?.am;
  const contract = ROLE_PORTS[meta?.role ?? ""] ?? ROLE_PORTS.stage;
  const ports = {};
  const sideCounts = /* @__PURE__ */ new Map();
  const sideIndexes = /* @__PURE__ */ new Map();
  for (const descriptor of contract) {
    sideCounts.set(descriptor.side, (sideCounts.get(descriptor.side) ?? 0) + 1);
  }
  for (const descriptor of contract) {
    const sideIndex = sideIndexes.get(descriptor.side) ?? 0;
    sideIndexes.set(descriptor.side, sideIndex + 1);
    ports[descriptor.id] = {
      id: descriptor.id,
      terminal: descriptor.terminal,
      ...portPosition(shape, descriptor.side, sideIndex, sideCounts.get(descriptor.side) ?? 1),
      label: descriptor.label
    };
  }
  return ports;
}
function getWorkflowNodeGeometry(shape, body) {
  const portGeometry = Object.values(getWorkflowPorts(shape)).map(
    (port) => new Circle2d({
      x: port.x - 6,
      y: port.y - 6,
      radius: 6,
      isFilled: true,
      isLabel: true,
      excludeFromShapeBounds: true
    })
  );
  return new Group2d({ children: [body, ...portGeometry] });
}
function getWorkflowNodeIndicatorPath(shape) {
  const path = new Path2D();
  path.roundRect(0, 0, shape.props.w, shape.props.h, 2);
  for (const port of Object.values(getWorkflowPorts(shape))) {
    path.moveTo(port.x + 6, port.y);
    path.arc(port.x, port.y, 6, 0, Math.PI * 2);
  }
  return path;
}
function getWorkflowPortConnections(editor, shapeId) {
  const result = [];
  const bindings = editor.getBindingsToShape(shapeId, "workflow-port");
  for (const binding of bindings) {
    const opposite = editor.getBindingsFromShape(binding.fromId, "workflow-port").find(
      (candidate) => candidate.props?.terminal !== binding.props.terminal
    );
    if (!opposite) continue;
    result.push({
      connectionId: binding.fromId,
      connectedShapeId: opposite.toId,
      terminal: binding.props.terminal,
      ownPortId: binding.props.portId,
      connectedPortId: opposite.props.portId
    });
  }
  return result;
}
function getWorkflowPortAtPoint(editor, point, options = {}) {
  const shape = editor.getShapeAtPoint(point, {
    hitInside: true,
    margin: options.margin ?? 10,
    filter: (candidate) => candidate.type === "agents-models-node"
  });
  if (!shape || shape.type !== "agents-models-node") return null;
  const transform = editor.getShapePageTransform(shape);
  let best;
  let distance = Infinity;
  for (const port of Object.values(getWorkflowPorts(shape))) {
    if (options.terminal && port.terminal !== options.terminal) continue;
    const pagePoint = transform.applyToPoint(port);
    const nextDistance = Vec.Dist(point, pagePoint);
    if (nextDistance < distance && nextDistance <= (options.margin ?? 10) + 8) {
      best = port;
      distance = nextDistance;
    }
  }
  if (!best) return null;
  return {
    shape,
    port: best,
    existingConnections: getWorkflowPortConnections(editor, shape.id).filter(
      (connection) => connection.ownPortId === best?.id
    )
  };
}
function WorkflowPortMarker({
  shapeId,
  portId
}) {
  const editor = useEditor();
  const state = useValue(
    `workflow port ${shapeId}:${portId}`,
    () => {
      const shape = editor.getShape(shapeId);
      if (!shape || shape.type !== "agents-models-node") return null;
      const port = getWorkflowPorts(shape)[portId];
      if (!port) return null;
      return {
        port,
        count: getWorkflowPortConnections(editor, shapeId).filter(
          (connection) => connection.ownPortId === portId
        ).length,
        active: (() => {
          const picker = workflowNodePickerState.get();
          return picker?.editor === editor && picker.sourceShapeId === shapeId && picker.sourcePortId === portId;
        })()
      };
    },
    [editor, shapeId, portId]
  );
  if (!state) return null;
  return /* @__PURE__ */ jsx2(
    "button",
    {
      type: "button",
      className: `workflow-native-port is-${state.port.terminal}${state.count ? " is-connected" : ""}${state.active ? " is-active" : ""} is-port-${state.port.id}`,
      style: {
        left: state.port.x,
        top: state.port.y
      },
      title: `${state.port.label}${state.count ? ` \xB7 ${state.count} connected` : ""}`,
      "aria-label": state.port.label,
      onPointerDown: (event) => {
        event.preventDefault();
        event.stopPropagation();
        handleWorkflowPortPointerDown(editor, {
          shapeId,
          portId,
          terminal: state.port.terminal,
          clickCount: event.detail
        });
      },
      onDoubleClick: (event) => {
        event.preventDefault();
        event.stopPropagation();
        handleWorkflowPortPointerDown(editor, {
          shapeId,
          portId,
          terminal: state.port.terminal,
          clickCount: 2
        });
      }
    }
  );
}
function handleWorkflowPortPointerDown(editor, info) {
  cancelWorkflowNodePicker(editor);
  if (info.clickCount > 1) {
    editor.setCurrentTool("select.idle");
    editor.select(info.shapeId);
    return;
  }
  editor.selectNone();
  editor.setCurrentTool("pointing_workflow_port", {
    shapeId: info.shapeId,
    portId: info.portId,
    terminal: info.terminal
  });
}
function WorkflowPorts({ shape }) {
  const meta = shape.meta?.am;
  if (shape.isLocked || meta?.workflowLocked === true) return null;
  return /* @__PURE__ */ jsx2(Fragment2, { children: Object.keys(getWorkflowPorts(shape)).map((portId) => /* @__PURE__ */ jsx2(
    WorkflowPortMarker,
    {
      shapeId: shape.id,
      portId
    },
    portId
  )) });
}
function workflowPortPositionInPage(editor, shape, portId) {
  const port = getWorkflowPorts(shape)[portId];
  return port ? editor.getShapePageTransform(shape).applyToPoint(port) : null;
}
function workflowNodeBodyGeometry(shape) {
  return new Rectangle2d({
    width: shape.props.w,
    height: shape.props.h,
    isFilled: true
  });
}

// client/agents-models/AgentsModelsShape.tsx
import { Fragment as Fragment3, jsx as jsx3, jsxs as jsxs2 } from "react/jsx-runtime";
var AGENTS_MODELS_SHAPE_TYPE = "agents-models-node";
var WORKFLOW_PHASE_CONTROL_OPTIONS = [
  { value: "single", presetId: "single", label: "Single", description: "one sequential phase" },
  { value: "foreach", presetId: "fanout", label: "For each", description: "fan out over input items" },
  { value: "reduce", presetId: "reduce", label: "Reduce", description: "combine parallel results" },
  { value: "loop", presetId: "loop", label: "Loop", description: "repeat until complete" },
  { value: "dag", presetId: "dag", label: "DAG", description: "dependency-ordered tasks" },
  { value: "dynamic", presetId: "dynamic", label: "Dynamic", description: "decide tasks at runtime" },
  { value: "mesh", presetId: "mesh", label: "Mesh", description: "peer collaboration" }
];
function parsePersonaContractMetadata(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((field) => {
      if (!field || typeof field !== "object" || typeof field.name !== "string") return [];
      const name = field.name.trim();
      if (!name) return [];
      return [
        {
          name,
          ioType: typeof field.ioType === "string" && field.ioType.trim() ? field.ioType.trim() : "file",
          required: field.required === true,
          description: typeof field.description === "string" ? field.description.trim() : ""
        }
      ];
    });
  } catch {
    return [];
  }
}
function workflowNodeSizeForKind(role) {
  if (role === "stage") return { w: 240, h: 126 };
  if (role === "gate" || role === "module") return { w: 248, h: 172 };
  if (["role", "capability", "input", "artifact", "result", "skill"].includes(role)) {
    return { w: 248, h: 140 };
  }
  return { w: 248, h: 128 };
}
function isAgentsModelsNodeLocked(shape) {
  const meta = shape.meta?.am;
  return shape.isLocked || meta?.workflowLocked === true;
}
var AgentsModelsShapeUtil = class extends BaseBoxShapeUtil {
  static type = AGENTS_MODELS_SHAPE_TYPE;
  static props = {
    w: T.number,
    h: T.number
  };
  getDefaultProps() {
    return workflowNodeSizeForKind("agent");
  }
  getGeometry(shape) {
    return getWorkflowNodeGeometry(shape, workflowNodeBodyGeometry(shape));
  }
  component(shape) {
    return /* @__PURE__ */ jsx3(AgentsModelsCard, { shape });
  }
  getIndicatorPath(shape) {
    return getWorkflowNodeIndicatorPath(shape);
  }
  onResize(shape, info) {
    const role = shape.meta?.am?.role;
    const minHeight = role === "catalog" ? 340 : workflowNodeSizeForKind(role ?? "agent").h;
    return resizeBox(shape, info, {
      minWidth: role === "catalog" ? 300 : 220,
      minHeight
    });
  }
  getText(shape) {
    const meta = shape.meta.am;
    if (!meta) return "";
    return [
      meta.label,
      meta.subtitle,
      meta.stageType,
      meta.modelSlot,
      meta.persona,
      meta.roleRef,
      meta.roleDescription,
      meta.roleDefaultCapabilityMode,
      meta.roleModel,
      meta.roleReasoningEffort,
      meta.rolePromptFile,
      meta.roleDefaultIsolation,
      meta.modelRef,
      meta.capabilityMode,
      meta.toolRefsText,
      ...meta.skillRefs ?? [],
      meta.skillRef,
      meta.gateOperator,
      meta.gateValue,
      meta.dataValue,
      meta.artifactRef,
      meta.resultLabel,
      meta.moduleRef,
      meta.moduleVersion,
      meta.moduleParams,
      meta.roleLabel
    ].filter(Boolean).join(" ");
  }
};
function AgentsModelsCard({ shape }) {
  const meta = shape.meta.am;
  if (meta.hiddenControl) return /* @__PURE__ */ jsx3(HTMLContainer, { style: { display: "none" } });
  if (meta.role === "catalog") return /* @__PURE__ */ jsx3(AgentsModelsCatalog, { shape, meta });
  if (meta.role === "stage") return /* @__PURE__ */ jsx3(AgentsModelsStage, { shape, meta });
  if (meta.role === "persona") return /* @__PURE__ */ jsx3(AgentsModelsPersona, { shape, meta });
  if (["role", "capability", "skill", "gate", "input", "artifact", "result", "module"].includes(
    meta.role
  )) {
    return /* @__PURE__ */ jsx3(AgentsModelsExtendedNode, { shape, meta });
  }
  return /* @__PURE__ */ jsx3(AgentsModelsAgent, { shape, meta });
}
function AgentsModelsCatalog({
  shape,
  meta
}) {
  const editor = useEditor2();
  const { addDialog } = useDialogs();
  const sections = meta.catalogSections ?? [];
  const catalogCount = sections.reduce(
    (total, section) => total + section.items.length,
    0
  );
  const [query, setQuery] = useState("");
  const [draggingId, setDraggingId] = useState(null);
  const [expandedSections, setExpandedSections] = useState(
    () => /* @__PURE__ */ new Set()
  );
  const visibleSections = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return sections.filter(
      (section) => section.id === "agents" || section.id === "personas" || section.id === "roles" || section.id === "modules"
    ).map((section) => ({
      ...section,
      items: normalized ? section.items.filter(
        (item) => `${item.label} ${item.value ?? ""}`.toLocaleLowerCase().includes(normalized)
      ) : section.items
    }));
  }, [query, sections]);
  const openCreateDefinition = () => {
    addDialog({
      id: "grok-create-definition",
      preventBackgroundClose: true,
      component: (props) => /* @__PURE__ */ jsx3(
        GrokDefinitionDialog,
        {
          ...props,
          models: sections.find((section) => section.id === "models")?.items ?? [],
          onCreated: (kind, id) => {
            const sectionId = kind === "agent" ? "agents" : kind === "persona" ? "personas" : "roles";
            setQuery(id);
            setExpandedSections(
              (current) => new Set(current).add(sectionId)
            );
            updateAgentsModelsShapeMeta(editor, shape, {
              catalogSections: sections.map(
                (section) => section.id === sectionId && !section.items.some((item) => item.id === id) ? {
                  ...section,
                  items: [
                    { id, label: id, value: "user", status: "green" },
                    ...section.items
                  ]
                } : section
              )
            });
            requestAgentsModelsAction(editor, { kind: "catalog-refresh" });
          }
        }
      )
    });
  };
  const beginDrag = (event, sectionId, item) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const start = { x: event.clientX, y: event.clientY };
    const view = event.currentTarget.ownerDocument.defaultView;
    if (!view) return;
    let didDrag = false;
    const onMove = (moveEvent) => {
      const distance = Math.hypot(
        moveEvent.clientX - start.x,
        moveEvent.clientY - start.y
      );
      if (distance < 6) return;
      didDrag = true;
      setDraggingId(item.id);
    };
    const onUp = (upEvent) => {
      view.removeEventListener("pointermove", onMove);
      view.removeEventListener("pointerup", onUp);
      view.removeEventListener("pointercancel", onCancel);
      setDraggingId(null);
      if (!didDrag) return;
      const pagePoint = editor.screenToPage({
        x: upEvent.clientX,
        y: upEvent.clientY
      });
      const catalogBounds = editor.getShapePageBounds(shape.id);
      const droppedInside = catalogBounds && pagePoint.x >= catalogBounds.minX && pagePoint.x <= catalogBounds.maxX && pagePoint.y >= catalogBounds.minY && pagePoint.y <= catalogBounds.maxY;
      if (droppedInside) return;
      requestAgentsModelsAction(editor, {
        kind: "node",
        nodeKind: sectionId === "agents" ? "agent" : sectionId === "personas" ? "persona" : sectionId === "roles" ? "role" : "module",
        catalogItemId: item.id,
        catalogItemLabel: item.label,
        catalogItemValue: item.value,
        catalogItemMetadata: item.metadata,
        dropPoint: { x: pagePoint.x, y: pagePoint.y },
        source: "catalog"
      });
    };
    const onCancel = () => {
      view.removeEventListener("pointermove", onMove);
      view.removeEventListener("pointerup", onUp);
      view.removeEventListener("pointercancel", onCancel);
      setDraggingId(null);
    };
    view.addEventListener("pointermove", onMove);
    view.addEventListener("pointerup", onUp);
    view.addEventListener("pointercancel", onCancel);
  };
  return /* @__PURE__ */ jsxs2(
    HTMLContainer,
    {
      className: "workflow-node-card agents-models-catalog-node",
      style: { width: shape.props.w, height: shape.props.h },
      children: [
        /* @__PURE__ */ jsx3(
          WorkflowCardHeader,
          {
            icon: "data",
            title: "Agents, personas & roles",
            subtitle: "DRAG FROM CATALOG",
            status: catalogCount > 0 ? "READY" : meta.proxyOk === false ? "STALE" : "SYNCING"
          }
        ),
        /* @__PURE__ */ jsxs2(
          "div",
          {
            className: "agents-models-catalog-search",
            onPointerDown: stopEventPropagation,
            onClick: stopEventPropagation,
            children: [
              /* @__PURE__ */ jsx3(
                "input",
                {
                  value: query,
                  onChange: (event) => setQuery(event.currentTarget.value),
                  placeholder: "Filter agents, personas and roles\u2026",
                  "aria-label": "Filter agents, personas and roles"
                }
              ),
              /* @__PURE__ */ jsxs2(
                "button",
                {
                  type: "button",
                  className: "agents-models-catalog-create",
                  onClick: openCreateDefinition,
                  title: "Create a user-scoped Grok agent, persona, or role",
                  children: [
                    /* @__PURE__ */ jsx3("span", { "aria-hidden": "true", children: "\uFF0B" }),
                    "New"
                  ]
                }
              )
            ]
          }
        ),
        /* @__PURE__ */ jsx3(
          "div",
          {
            className: "agents-models-catalog-body",
            onPointerDown: stopEventPropagation,
            onClick: stopEventPropagation,
            onWheel: stopEventPropagation,
            children: visibleSections.some((section) => section.items.length) ? visibleSections.map((section) => {
              const expanded = Boolean(query.trim()) || expandedSections.has(section.id);
              return /* @__PURE__ */ jsxs2("section", { children: [
                /* @__PURE__ */ jsxs2(
                  "button",
                  {
                    type: "button",
                    className: "agents-models-catalog-section-toggle",
                    "aria-expanded": expanded,
                    onClick: (event) => {
                      editor.markEventAsHandled(event);
                      setExpandedSections((current) => {
                        const next = new Set(current);
                        if (next.has(section.id)) next.delete(section.id);
                        else next.add(section.id);
                        return next;
                      });
                    },
                    children: [
                      /* @__PURE__ */ jsx3("span", { children: section.label }),
                      /* @__PURE__ */ jsx3("small", { children: section.items.length }),
                      /* @__PURE__ */ jsx3("span", { "aria-hidden": "true", children: expanded ? "\u2212" : "+" })
                    ]
                  }
                ),
                expanded && /* @__PURE__ */ jsx3("div", { children: section.items.map((item) => /* @__PURE__ */ jsxs2(
                  "button",
                  {
                    type: "button",
                    className: `agents-models-catalog-row${draggingId === item.id ? " is-dragging" : ""}`,
                    onPointerDown: (event) => beginDrag(event, section.id, item),
                    title: `Drag ${item.label} onto the canvas`,
                    children: [
                      /* @__PURE__ */ jsx3(
                        "span",
                        {
                          className: `agents-models-status-dot is-${item.status ?? "grey"}`
                        }
                      ),
                      /* @__PURE__ */ jsx3("strong", { children: item.label }),
                      /* @__PURE__ */ jsx3("small", { children: item.value }),
                      /* @__PURE__ */ jsx3("span", { className: "agents-models-catalog-drag-handle", children: "\u22EE\u22EE" })
                    ]
                  },
                  item.id
                )) })
              ] }, section.id);
            }) : /* @__PURE__ */ jsx3("div", { className: "agents-models-catalog-empty", children: query ? "No matching entries." : "Catalog bridge is syncing\u2026" })
          }
        ),
        /* @__PURE__ */ jsx3(
          WorkflowCardFooter,
          {
            inCount: 0,
            outCount: visibleSections.reduce(
              (total, section) => total + section.items.length,
              0
            ),
            right: "drag to create"
          }
        )
      ]
    }
  );
}
var EMPTY_DEFINITION_CONTRACT = () => ({
  name: "",
  ioType: "file",
  required: false,
  description: ""
});
function emptyDefinitionDraft(kind = "agent") {
  return {
    kind,
    id: "",
    name: "",
    description: "",
    model: "",
    promptMode: "full",
    permissionMode: "default",
    tools: "",
    skills: "",
    mcpInheritanceMode: "all",
    mcpServers: "",
    prompt: "",
    instructions: "",
    instructionsFile: "",
    reasoningEffort: "",
    defaultIsolation: "",
    defaultCapabilityMode: "all",
    promptFile: "",
    inputs: [],
    outputs: []
  };
}
function validateGrokDefinitionDraft(draft) {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(draft.id.trim())) {
    return "ID must use 1\u201380 letters, digits, underscores, or hyphens.";
  }
  if (draft.kind !== "persona" && !draft.description.trim()) {
    return `${draft.kind === "agent" ? "Agent" : "Role"} description is required.`;
  }
  if (draft.kind === "agent" && !draft.prompt.trim()) {
    return "Agent system prompt is required.";
  }
  if (draft.kind === "agent" && (draft.mcpInheritanceMode === "named" || draft.mcpInheritanceMode === "except") && !draft.mcpServers.split(",").some((server) => server.trim())) {
    return `${draft.mcpInheritanceMode} MCP inheritance requires at least one server name.`;
  }
  if (draft.kind === "persona" && !draft.instructions.trim() && !draft.instructionsFile.trim()) {
    return "Persona requires instructions, instructions_file, or both.";
  }
  if (draft.kind === "persona" && [...draft.inputs, ...draft.outputs].some((field) => !field.name.trim())) {
    return "Every persona contract field requires a name.";
  }
  return null;
}
function GrokDefinitionDialog({
  onClose,
  onCreated,
  models
}) {
  const dialogRef = useRef(null);
  const [draft, setDraft] = useState(() => emptyDefinitionDraft());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState("");
  const patch = (value) => setDraft((current) => ({ ...current, ...value }));
  const switchKind = (kind) => {
    setDraft((current) => ({
      ...emptyDefinitionDraft(kind),
      id: current.id,
      description: current.description,
      model: current.model
    }));
    setError("");
    requestAnimationFrame(() => {
      dialogRef.current?.querySelector(".tlui-dialog__body")?.scrollTo({ top: 0 });
    });
  };
  const submit = async () => {
    const validationError = validateGrokDefinitionDraft(draft);
    if (validationError) {
      setError(validationError);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const list = (value) => value.split(",").map((item) => item.trim()).filter(Boolean);
      const common = {
        kind: draft.kind,
        id: draft.id,
        description: draft.description,
        model: draft.model
      };
      const payload = draft.kind === "agent" ? {
        ...common,
        name: draft.name,
        promptMode: draft.promptMode,
        permissionMode: draft.permissionMode,
        tools: list(draft.tools),
        skills: list(draft.skills),
        mcpInheritance: {
          mode: draft.mcpInheritanceMode,
          servers: list(draft.mcpServers)
        },
        prompt: draft.prompt
      } : draft.kind === "persona" ? {
        ...common,
        instructions: draft.instructions,
        instructionsFile: draft.instructionsFile,
        reasoningEffort: draft.reasoningEffort,
        defaultIsolation: draft.defaultIsolation,
        inputs: draft.inputs,
        outputs: draft.outputs
      } : {
        ...common,
        defaultCapabilityMode: draft.defaultCapabilityMode,
        reasoningEffort: draft.reasoningEffort,
        promptFile: draft.promptFile,
        defaultIsolation: draft.defaultIsolation
      };
      const response = await grokConfigFetch("/api/grok/definitions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(body?.message || `Definition create failed (HTTP ${response.status}).`);
      }
      const sourceRef = String(body?.receipt?.sourceRef ?? "");
      setReceipt(sourceRef || `Created ${draft.kind} ${draft.id}.`);
      onCreated(draft.kind, draft.id.trim());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };
  return /* @__PURE__ */ jsxs2(
    "section",
    {
      ref: dialogRef,
      className: "grok-definition-dialog",
      onPointerDown: stopEventPropagation,
      children: [
        /* @__PURE__ */ jsxs2(TldrawUiDialogHeader, { children: [
          /* @__PURE__ */ jsx3(TldrawUiDialogTitle, { children: "Create Grok definition" }),
          /* @__PURE__ */ jsx3(TldrawUiDialogCloseButton, {})
        ] }),
        /* @__PURE__ */ jsxs2(TldrawUiDialogBody, { children: [
          /* @__PURE__ */ jsx3("div", { className: "grok-definition-kinds", role: "tablist", "aria-label": "Definition kind", children: ["agent", "persona", "role"].map((kind) => /* @__PURE__ */ jsx3(
            "button",
            {
              type: "button",
              role: "tab",
              "aria-selected": draft.kind === kind,
              className: draft.kind === kind ? "is-active" : "",
              disabled: Boolean(receipt),
              onClick: () => switchKind(kind),
              children: kind === "agent" ? "Agent" : kind === "persona" ? "Persona" : "Role"
            },
            kind
          )) }),
          /* @__PURE__ */ jsxs2("p", { className: "grok-definition-doc-note", children: [
            "Fields and resolution semantics follow ",
            /* @__PURE__ */ jsx3("code", { children: "~/.grok/docs/user-guide/16-subagents.md" }),
            ". The new file is user-scoped and existing definitions are never overwritten."
          ] }),
          /* @__PURE__ */ jsxs2("div", { className: "grok-definition-fields", "aria-disabled": Boolean(receipt), children: [
            /* @__PURE__ */ jsx3(DefinitionField, { name: "id", label: "ID / filename", required: true, wide: true, children: /* @__PURE__ */ jsx3(
              "input",
              {
                value: draft.id,
                disabled: Boolean(receipt),
                pattern: "[A-Za-z0-9_-]+",
                maxLength: 80,
                placeholder: "researcher",
                onChange: (event) => patch({ id: event.currentTarget.value })
              }
            ) }),
            draft.kind === "agent" && /* @__PURE__ */ jsx3(DefinitionField, { name: "name", label: "Display name", children: /* @__PURE__ */ jsx3(
              "input",
              {
                value: draft.name,
                disabled: Boolean(receipt),
                placeholder: "defaults to ID",
                onChange: (event) => patch({ name: event.currentTarget.value })
              }
            ) }),
            /* @__PURE__ */ jsx3(
              DefinitionField,
              {
                name: "description",
                label: "Description",
                required: draft.kind !== "persona",
                wide: true,
                children: /* @__PURE__ */ jsx3(
                  "input",
                  {
                    value: draft.description,
                    disabled: Boolean(receipt),
                    maxLength: 320,
                    onChange: (event) => patch({ description: event.currentTarget.value })
                  }
                )
              }
            ),
            /* @__PURE__ */ jsxs2(DefinitionField, { name: "model", label: "Model override", children: [
              /* @__PURE__ */ jsx3(
                "input",
                {
                  value: draft.model,
                  disabled: Boolean(receipt),
                  list: "grok-definition-models",
                  placeholder: "inherit when empty",
                  onChange: (event) => patch({ model: event.currentTarget.value })
                }
              ),
              /* @__PURE__ */ jsx3("datalist", { id: "grok-definition-models", children: models.map((model) => /* @__PURE__ */ jsx3("option", { value: model.id, children: model.label }, model.id)) })
            ] }),
            draft.kind === "agent" && /* @__PURE__ */ jsx3(AgentDefinitionFields, { draft, patch, disabled: Boolean(receipt) }),
            draft.kind === "persona" && /* @__PURE__ */ jsx3(PersonaDefinitionFields, { draft, patch, disabled: Boolean(receipt) }),
            draft.kind === "role" && /* @__PURE__ */ jsx3(RoleDefinitionFields, { draft, patch, disabled: Boolean(receipt) })
          ] }),
          error && /* @__PURE__ */ jsx3("p", { className: "grok-definition-status is-error", children: error }),
          receipt && /* @__PURE__ */ jsxs2("p", { className: "grok-definition-status is-success", children: [
            "Created ",
            receipt
          ] })
        ] }),
        /* @__PURE__ */ jsxs2(TldrawUiDialogFooter, { className: "tlui-dialog__footer__actions", children: [
          /* @__PURE__ */ jsx3(TldrawUiButton, { type: "normal", disabled: saving, onClick: onClose, children: /* @__PURE__ */ jsx3(TldrawUiButtonLabel, { children: receipt ? "Done" : "Cancel" }) }),
          !receipt && /* @__PURE__ */ jsx3(TldrawUiButton, { type: "primary", disabled: saving, onClick: () => void submit(), children: /* @__PURE__ */ jsx3(TldrawUiButtonLabel, { children: saving ? "Creating\u2026" : `Create ${draft.kind}` }) })
        ] })
      ]
    }
  );
}
function DefinitionField({
  name,
  label,
  required = false,
  wide = false,
  children
}) {
  return /* @__PURE__ */ jsxs2("label", { className: wide ? "is-wide" : "", children: [
    /* @__PURE__ */ jsxs2("span", { children: [
      /* @__PURE__ */ jsx3("code", { children: name }),
      required ? " \xB7 required" : ""
    ] }),
    /* @__PURE__ */ jsx3("strong", { children: label }),
    children
  ] });
}
function AgentDefinitionFields({
  draft,
  patch,
  disabled
}) {
  return /* @__PURE__ */ jsxs2(Fragment3, { children: [
    /* @__PURE__ */ jsx3(DefinitionField, { name: "prompt_mode", label: "Prompt mode", children: /* @__PURE__ */ jsx3("input", { value: draft.promptMode, disabled, onChange: (event) => patch({ promptMode: event.currentTarget.value }) }) }),
    /* @__PURE__ */ jsx3(DefinitionField, { name: "permission_mode", label: "Permission mode", children: /* @__PURE__ */ jsx3("select", { value: draft.permissionMode, disabled, onChange: (event) => patch({ permissionMode: event.currentTarget.value }), children: ["default", "auto", "plan", "bypassPermissions"].map((mode) => /* @__PURE__ */ jsx3("option", { value: mode, children: mode }, mode)) }) }),
    /* @__PURE__ */ jsx3(DefinitionField, { name: "tools", label: "Tool allowlist", wide: true, children: /* @__PURE__ */ jsx3("input", { value: draft.tools, disabled, placeholder: "Read, Grep, search_tool (comma-separated)", onChange: (event) => patch({ tools: event.currentTarget.value }) }) }),
    /* @__PURE__ */ jsx3(DefinitionField, { name: "skills", label: "Preloaded skills", wide: true, children: /* @__PURE__ */ jsx3("input", { value: draft.skills, disabled, placeholder: "skill-a, skill-b (comma-separated)", onChange: (event) => patch({ skills: event.currentTarget.value }) }) }),
    /* @__PURE__ */ jsx3(DefinitionField, { name: "mcpInheritance", label: "Parent MCP inheritance", children: /* @__PURE__ */ jsxs2("select", { value: draft.mcpInheritanceMode, disabled, onChange: (event) => patch({ mcpInheritanceMode: event.currentTarget.value }), children: [
      /* @__PURE__ */ jsx3("option", { value: "all", children: "all" }),
      /* @__PURE__ */ jsx3("option", { value: "none", children: "none" }),
      /* @__PURE__ */ jsx3("option", { value: "named", children: "named" }),
      /* @__PURE__ */ jsx3("option", { value: "except", children: "except" })
    ] }) }),
    (draft.mcpInheritanceMode === "named" || draft.mcpInheritanceMode === "except") && /* @__PURE__ */ jsx3(DefinitionField, { name: draft.mcpInheritanceMode, label: "MCP server names", children: /* @__PURE__ */ jsx3("input", { value: draft.mcpServers, disabled, placeholder: "server-a, server-b", onChange: (event) => patch({ mcpServers: event.currentTarget.value }) }) }),
    /* @__PURE__ */ jsx3(DefinitionField, { name: "Markdown body", label: "System prompt", required: true, wide: true, children: /* @__PURE__ */ jsx3("textarea", { value: draft.prompt, disabled, rows: 8, placeholder: "Agent instructions\u2026", onChange: (event) => patch({ prompt: event.currentTarget.value }) }) })
  ] });
}
function PersonaDefinitionFields({
  draft,
  patch,
  disabled
}) {
  return /* @__PURE__ */ jsxs2(Fragment3, { children: [
    /* @__PURE__ */ jsx3(DefinitionField, { name: "reasoning_effort", label: "Reasoning effort", children: /* @__PURE__ */ jsx3("input", { value: draft.reasoningEffort, disabled, placeholder: "model default", onChange: (event) => patch({ reasoningEffort: event.currentTarget.value }) }) }),
    /* @__PURE__ */ jsx3(IsolationField, { draft, patch, disabled }),
    /* @__PURE__ */ jsx3(DefinitionField, { name: "instructions_file", label: "Instructions file", wide: true, children: /* @__PURE__ */ jsx3("input", { value: draft.instructionsFile, disabled, placeholder: "optional path; merged after instructions", onChange: (event) => patch({ instructionsFile: event.currentTarget.value }) }) }),
    /* @__PURE__ */ jsx3(DefinitionField, { name: "instructions", label: "Behavioral overlay", wide: true, children: /* @__PURE__ */ jsx3("textarea", { value: draft.instructions, disabled, rows: 7, placeholder: "Required unless instructions_file is set\u2026", onChange: (event) => patch({ instructions: event.currentTarget.value }) }) }),
    /* @__PURE__ */ jsx3(PersonaContractEditor, { kind: "inputs", fields: draft.inputs, disabled, onChange: (inputs) => patch({ inputs }) }),
    /* @__PURE__ */ jsx3(PersonaContractEditor, { kind: "outputs", fields: draft.outputs, disabled, onChange: (outputs) => patch({ outputs }) })
  ] });
}
function RoleDefinitionFields({
  draft,
  patch,
  disabled
}) {
  return /* @__PURE__ */ jsxs2(Fragment3, { children: [
    /* @__PURE__ */ jsx3(DefinitionField, { name: "default_capability_mode", label: "Capability default", children: /* @__PURE__ */ jsxs2("select", { value: draft.defaultCapabilityMode, disabled, onChange: (event) => patch({ defaultCapabilityMode: event.currentTarget.value }), children: [
      /* @__PURE__ */ jsx3("option", { value: "", children: "agent default" }),
      /* @__PURE__ */ jsx3("option", { value: "all", children: "all" }),
      /* @__PURE__ */ jsx3("option", { value: "read-only", children: "read-only" }),
      /* @__PURE__ */ jsx3("option", { value: "read-write", children: "read-write" }),
      /* @__PURE__ */ jsx3("option", { value: "execute", children: "execute" })
    ] }) }),
    /* @__PURE__ */ jsx3(DefinitionField, { name: "reasoning_effort", label: "Reasoning effort", children: /* @__PURE__ */ jsx3("input", { value: draft.reasoningEffort, disabled, placeholder: "model default", onChange: (event) => patch({ reasoningEffort: event.currentTarget.value }) }) }),
    /* @__PURE__ */ jsx3(DefinitionField, { name: "prompt_file", label: "Prompt filename", wide: true, children: /* @__PURE__ */ jsx3("input", { value: draft.promptFile, disabled, placeholder: ".grok/prompts/researcher.md", onChange: (event) => patch({ promptFile: event.currentTarget.value }) }) }),
    /* @__PURE__ */ jsx3(IsolationField, { draft, patch, disabled })
  ] });
}
function IsolationField({
  draft,
  patch,
  disabled
}) {
  return /* @__PURE__ */ jsx3(DefinitionField, { name: "default_isolation", label: "Isolation default", children: /* @__PURE__ */ jsxs2("select", { value: draft.defaultIsolation, disabled, onChange: (event) => patch({ defaultIsolation: event.currentTarget.value }), children: [
    /* @__PURE__ */ jsx3("option", { value: "", children: "Grok default" }),
    /* @__PURE__ */ jsx3("option", { value: "none", children: "none" }),
    /* @__PURE__ */ jsx3("option", { value: "worktree", children: "worktree" })
  ] }) });
}
function PersonaContractEditor({
  kind,
  fields,
  disabled,
  onChange
}) {
  const update = (index, value) => onChange(fields.map((field, fieldIndex) => fieldIndex === index ? { ...field, ...value } : field));
  return /* @__PURE__ */ jsxs2("section", { className: "grok-definition-contracts", children: [
    /* @__PURE__ */ jsxs2("header", { children: [
      /* @__PURE__ */ jsxs2("span", { children: [
        /* @__PURE__ */ jsx3("code", { children: kind }),
        " \xB7 I/O contract"
      ] }),
      /* @__PURE__ */ jsx3("button", { type: "button", disabled, onClick: () => onChange([...fields, EMPTY_DEFINITION_CONTRACT()]), children: "\uFF0B Add field" })
    ] }),
    fields.length === 0 ? /* @__PURE__ */ jsxs2("small", { children: [
      "No ",
      kind,
      " declared."
    ] }) : fields.map((field, index) => /* @__PURE__ */ jsxs2("div", { className: "grok-definition-contract-row", children: [
      /* @__PURE__ */ jsx3("input", { value: field.name, disabled, placeholder: "name", onChange: (event) => update(index, { name: event.currentTarget.value }) }),
      /* @__PURE__ */ jsx3("input", { value: field.ioType, disabled, placeholder: "io_type \xB7 file", onChange: (event) => update(index, { ioType: event.currentTarget.value }) }),
      /* @__PURE__ */ jsxs2("label", { children: [
        /* @__PURE__ */ jsx3("input", { type: "checkbox", checked: field.required, disabled, onChange: (event) => update(index, { required: event.currentTarget.checked }) }),
        " required"
      ] }),
      /* @__PURE__ */ jsx3("button", { type: "button", disabled, "aria-label": `Remove ${kind} field ${index + 1}`, onClick: () => onChange(fields.filter((_, fieldIndex) => fieldIndex !== index)), children: "\xD7" }),
      /* @__PURE__ */ jsx3("input", { className: "is-description", value: field.description, disabled, placeholder: "description", onChange: (event) => update(index, { description: event.currentTarget.value }) })
    ] }, `${kind}-${index}`))
  ] });
}
function AgentsModelsStage({
  shape,
  meta
}) {
  const editor = useEditor2();
  const update = (patch) => updateAgentsModelsShapeMeta(editor, shape, patch);
  return /* @__PURE__ */ jsxs2(
    HTMLContainer,
    {
      className: `workflow-node-card agents-models-workflow-node agents-models-stage${isAgentsModelsNodeLocked(shape) ? " is-locked" : ""}${shape.props.w < 232 ? " is-compact-width" : ""}${shape.props.h <= 190 ? " is-compact-height" : ""}`,
      style: { width: shape.props.w, height: shape.props.h },
      children: [
        /* @__PURE__ */ jsx3(WorkflowPorts, { shape }),
        /* @__PURE__ */ jsx3(
          WorkflowCardHeader,
          {
            icon: "action",
            title: meta.label || "PHASE",
            subtitle: meta.stageType || meta.subtitle || "task"
          }
        ),
        /* @__PURE__ */ jsx3("p", { className: "workflow-node-card-description", children: meta.description || "Controls execution order and the bounded context passed forward." }),
        /* @__PURE__ */ jsx3(
          "div",
          {
            className: "workflow-node-card-body agents-models-workflow-fields",
            onPointerDown: stopEventPropagation,
            onClick: stopEventPropagation,
            onWheel: stopEventPropagation,
            children: /* @__PURE__ */ jsxs2("label", { className: "workflow-node-field", children: [
              /* @__PURE__ */ jsx3("span", { children: "CONTROL" }),
              /* @__PURE__ */ jsx3(
                "select",
                {
                  value: meta.stageType || "single",
                  onChange: (event) => update({ stageType: event.currentTarget.value }),
                  children: WORKFLOW_PHASE_CONTROL_OPTIONS.map((option) => /* @__PURE__ */ jsx3("option", { value: option.value, children: option.value }, option.value))
                }
              )
            ] })
          }
        ),
        /* @__PURE__ */ jsx3(
          WorkflowCardFooter,
          {
            inCount: meta.inCount,
            outCount: meta.outCount,
            right: "phase"
          }
        )
      ]
    }
  );
}
function AgentsModelsAgent({
  shape,
  meta
}) {
  const editor = useEditor2();
  const options = useCatalogOptions(editor);
  const update = (patch) => updateAgentsModelsShapeMeta(editor, shape, patch);
  return /* @__PURE__ */ jsxs2(
    HTMLContainer,
    {
      className: `workflow-node-card agents-models-workflow-node agents-models-subagent${meta.variable ? " is-variable" : ""}${isAgentsModelsNodeLocked(shape) ? " is-locked" : ""}${shape.props.w < 232 ? " is-compact-width" : ""}${shape.props.h <= 190 ? " is-compact-height" : ""}`,
      style: { width: shape.props.w, height: shape.props.h },
      children: [
        /* @__PURE__ */ jsx3(WorkflowPorts, { shape }),
        /* @__PURE__ */ jsx3(
          WorkflowCardHeader,
          {
            icon: "agent",
            title: meta.label || "subagent run",
            subtitle: meta.roleLabel || "CHILD SESSION"
          }
        ),
        /* @__PURE__ */ jsx3("p", { className: "workflow-node-card-description", children: meta.description || "Launches one child session using the selected subagent type and routed model." }),
        /* @__PURE__ */ jsxs2(
          "div",
          {
            className: "workflow-node-card-body agents-models-workflow-fields is-responsive-fields",
            onPointerDown: stopEventPropagation,
            onClick: stopEventPropagation,
            onWheel: stopEventPropagation,
            children: [
              /* @__PURE__ */ jsxs2("label", { className: "workflow-node-field", children: [
                /* @__PURE__ */ jsx3("span", { children: "SUBAGENT TYPE" }),
                /* @__PURE__ */ jsxs2(
                  "select",
                  {
                    value: meta.agentRef || "",
                    onChange: (event) => update({
                      agentRef: event.currentTarget.value,
                      label: event.currentTarget.value || meta.label || "Subagent Run"
                    }),
                    children: [
                      /* @__PURE__ */ jsx3("option", { value: "", children: "general-purpose \xB7 default" }),
                      options.agents.map((item) => /* @__PURE__ */ jsx3("option", { value: item.id, children: item.label }, item.id))
                    ]
                  }
                )
              ] }),
              /* @__PURE__ */ jsxs2("label", { className: "workflow-node-field", children: [
                /* @__PURE__ */ jsx3("span", { children: "MODEL" }),
                /* @__PURE__ */ jsxs2(
                  "select",
                  {
                    value: meta.modelRef || "",
                    onChange: (event) => update({ modelRef: event.currentTarget.value }),
                    children: [
                      /* @__PURE__ */ jsx3("option", { value: "", children: "runtime routing" }),
                      options.models.map((item) => /* @__PURE__ */ jsx3("option", { value: item.id, children: item.label }, item.id))
                    ]
                  }
                )
              ] })
            ]
          }
        ),
        /* @__PURE__ */ jsx3(
          WorkflowCardFooter,
          {
            inCount: meta.inCount,
            outCount: meta.outCount,
            right: meta.variable ? "parallel slot" : getAgentsModelsSkillRefs(meta).length ? `${getAgentsModelsSkillRefs(meta).length} skill${getAgentsModelsSkillRefs(meta).length === 1 ? "" : "s"}` : "child session"
          }
        )
      ]
    }
  );
}
function getAgentsModelsSkillRefs(meta) {
  if (!meta) return [];
  return [
    ...new Set(
      [
        ...Array.isArray(meta.skillRefs) ? meta.skillRefs : [],
        meta.skillRef
      ].map((value) => String(value ?? "").trim()).filter(Boolean)
    )
  ];
}
function AgentsModelsPersona({
  shape,
  meta
}) {
  const editor = useEditor2();
  const options = useCatalogOptions(editor);
  const selected = options.personas.find((item) => item.id === meta.persona);
  const inputContracts = parsePersonaContractMetadata(selected?.metadata?.inputsJson);
  const outputContracts = parsePersonaContractMetadata(selected?.metadata?.outputsJson);
  const update = (patch) => updateAgentsModelsShapeMeta(editor, shape, patch);
  return /* @__PURE__ */ jsxs2(
    HTMLContainer,
    {
      className: `workflow-node-card agents-models-workflow-node agents-models-persona${isAgentsModelsNodeLocked(shape) ? " is-locked" : ""}${shape.props.w < 232 ? " is-compact-width" : ""}${shape.props.h <= 190 ? " is-compact-height" : ""}`,
      style: { width: shape.props.w, height: shape.props.h },
      children: [
        /* @__PURE__ */ jsx3(WorkflowPorts, { shape }),
        /* @__PURE__ */ jsx3(
          WorkflowCardHeader,
          {
            icon: "prompt-template",
            title: meta.persona || meta.label || "persona",
            subtitle: "BEHAVIOR OVERLAY"
          }
        ),
        /* @__PURE__ */ jsx3("p", { className: "workflow-node-card-description", children: "Adds reusable behavioral instructions without changing graph control." }),
        /* @__PURE__ */ jsxs2(
          "div",
          {
            className: "workflow-node-card-body agents-models-workflow-fields is-responsive-fields",
            onPointerDown: stopEventPropagation,
            onClick: stopEventPropagation,
            onWheel: stopEventPropagation,
            children: [
              /* @__PURE__ */ jsxs2("label", { className: "workflow-node-field", children: [
                /* @__PURE__ */ jsx3("span", { children: "PERSONA" }),
                /* @__PURE__ */ jsxs2(
                  "select",
                  {
                    value: meta.persona || "",
                    onChange: (event) => update({
                      persona: event.currentTarget.value,
                      label: event.currentTarget.value || "persona"
                    }),
                    children: [
                      /* @__PURE__ */ jsx3("option", { value: "", children: "select persona" }),
                      options.personas.map((item) => /* @__PURE__ */ jsx3("option", { value: item.id, children: item.label }, item.id))
                    ]
                  }
                )
              ] }),
              /* @__PURE__ */ jsxs2("label", { className: "workflow-node-field", children: [
                /* @__PURE__ */ jsx3("span", { children: "MODEL OVERRIDE" }),
                /* @__PURE__ */ jsxs2(
                  "select",
                  {
                    value: meta.modelRef || "",
                    onChange: (event) => update({ modelRef: event.currentTarget.value }),
                    children: [
                      /* @__PURE__ */ jsx3("option", { value: "", children: "persona default" }),
                      options.models.map((item) => /* @__PURE__ */ jsx3("option", { value: item.id, children: item.label }, item.id))
                    ]
                  }
                )
              ] })
            ]
          }
        ),
        /* @__PURE__ */ jsx3(
          WorkflowCardFooter,
          {
            inCount: meta.inCount,
            outCount: meta.outCount,
            right: `${inputContracts.length} contract in \xB7 ${outputContracts.length} out`
          }
        )
      ]
    }
  );
}
function AgentsModelsExtendedNode({
  shape,
  meta
}) {
  const editor = useEditor2();
  const options = useCatalogOptions(editor);
  const role = meta.role;
  const presentation = extendedNodePresentation(role);
  const update = (patch) => updateAgentsModelsShapeMeta(editor, shape, patch);
  return /* @__PURE__ */ jsxs2(
    HTMLContainer,
    {
      className: `workflow-node-card agents-models-workflow-node agents-models-${role}${isAgentsModelsNodeLocked(shape) ? " is-locked" : ""}${shape.props.w < 232 ? " is-compact-width" : ""}${shape.props.h <= 190 ? " is-compact-height" : ""}`,
      style: { width: shape.props.w, height: shape.props.h },
      children: [
        /* @__PURE__ */ jsx3(WorkflowPorts, { shape }),
        /* @__PURE__ */ jsx3(
          WorkflowCardHeader,
          {
            icon: presentation.icon,
            title: meta.label || presentation.label,
            subtitle: presentation.subtitle
          }
        ),
        /* @__PURE__ */ jsx3("p", { className: "workflow-node-card-description", children: presentation.description }),
        /* @__PURE__ */ jsxs2(
          "div",
          {
            className: "workflow-node-card-body agents-models-workflow-fields is-responsive-fields",
            onPointerDown: stopEventPropagation,
            onClick: stopEventPropagation,
            onWheel: stopEventPropagation,
            children: [
              role === "role" && /* @__PURE__ */ jsxs2(Fragment3, { children: [
                /* @__PURE__ */ jsxs2("label", { className: "workflow-node-field", children: [
                  /* @__PURE__ */ jsx3("span", { children: "ROLE" }),
                  /* @__PURE__ */ jsxs2(
                    "select",
                    {
                      value: meta.roleRef || "",
                      onChange: (event) => {
                        const selected = options.roles.find(
                          (item) => item.id === event.currentTarget.value
                        );
                        update({
                          roleRef: event.currentTarget.value,
                          label: selected?.label || "Role",
                          roleDescription: selected?.metadata?.description || "",
                          roleDefaultCapabilityMode: selected?.metadata?.defaultCapabilityMode || "all",
                          roleModel: selected?.metadata?.model || "",
                          roleReasoningEffort: selected?.metadata?.reasoningEffort || "",
                          rolePromptFile: selected?.metadata?.promptFile || "",
                          roleDefaultIsolation: selected?.metadata?.defaultIsolation || "none"
                        });
                      },
                      children: [
                        /* @__PURE__ */ jsx3("option", { value: "", children: "select role" }),
                        options.roles.map((item) => /* @__PURE__ */ jsx3("option", { value: item.id, children: item.label }, item.id))
                      ]
                    }
                  )
                ] }),
                /* @__PURE__ */ jsxs2("label", { className: "workflow-node-field", children: [
                  /* @__PURE__ */ jsx3("span", { children: "CAPABILITY DEFAULT" }),
                  /* @__PURE__ */ jsxs2(
                    "select",
                    {
                      value: meta.roleDefaultCapabilityMode || "all",
                      onChange: (event) => update({
                        roleDefaultCapabilityMode: event.currentTarget.value
                      }),
                      children: [
                        /* @__PURE__ */ jsx3("option", { value: "all", children: "all \xB7 default" }),
                        /* @__PURE__ */ jsx3("option", { value: "read-only", children: "read-only" }),
                        /* @__PURE__ */ jsx3("option", { value: "read-write", children: "read-write" }),
                        /* @__PURE__ */ jsx3("option", { value: "execute", children: "execute" })
                      ]
                    }
                  )
                ] })
              ] }),
              role === "capability" && /* @__PURE__ */ jsxs2(Fragment3, { children: [
                /* @__PURE__ */ jsxs2("label", { className: "workflow-node-field", children: [
                  /* @__PURE__ */ jsx3("span", { children: "MODE" }),
                  /* @__PURE__ */ jsxs2(
                    "select",
                    {
                      value: meta.capabilityMode || "all",
                      onChange: (event) => update({
                        capabilityMode: event.currentTarget.value
                      }),
                      children: [
                        /* @__PURE__ */ jsx3("option", { value: "all", children: "all \xB7 default" }),
                        /* @__PURE__ */ jsx3("option", { value: "read-only", children: "read-only" }),
                        /* @__PURE__ */ jsx3("option", { value: "read-write", children: "read-write" }),
                        /* @__PURE__ */ jsx3("option", { value: "execute", children: "execute" })
                      ]
                    }
                  )
                ] }),
                /* @__PURE__ */ jsxs2("label", { className: "workflow-node-field", children: [
                  /* @__PURE__ */ jsx3("span", { children: "TOOL IDS \xB7 OPTIONAL" }),
                  /* @__PURE__ */ jsx3(
                    "input",
                    {
                      value: meta.toolRefsText || "",
                      placeholder: "comma-separated adapter refs",
                      onChange: (event) => update({ toolRefsText: event.currentTarget.value })
                    }
                  )
                ] })
              ] }),
              role === "skill" && /* @__PURE__ */ jsxs2("label", { className: "workflow-node-field is-grow", children: [
                /* @__PURE__ */ jsx3("span", { children: "PROJECT SKILL" }),
                /* @__PURE__ */ jsxs2(
                  "select",
                  {
                    value: meta.skillRef || "",
                    onChange: (event) => update({
                      skillRef: event.currentTarget.value,
                      label: options.skills.find(
                        (item) => item.id === event.currentTarget.value
                      )?.label || "Skill"
                    }),
                    children: [
                      /* @__PURE__ */ jsx3("option", { value: "", children: "select .agents/skills entry" }),
                      options.skills.map((item) => /* @__PURE__ */ jsx3("option", { value: item.id, children: item.label }, item.id))
                    ]
                  }
                )
              ] }),
              role === "gate" && /* @__PURE__ */ jsxs2(Fragment3, { children: [
                /* @__PURE__ */ jsxs2("label", { className: "workflow-node-field", children: [
                  /* @__PURE__ */ jsx3("span", { children: "CONDITION" }),
                  /* @__PURE__ */ jsxs2(
                    "select",
                    {
                      value: meta.gateOperator || "not-empty",
                      onChange: (event) => update({
                        gateOperator: event.currentTarget.value
                      }),
                      children: [
                        /* @__PURE__ */ jsx3("option", { value: "not-empty", children: "not empty" }),
                        /* @__PURE__ */ jsx3("option", { value: "contains", children: "contains" }),
                        /* @__PURE__ */ jsx3("option", { value: "equals", children: "equals" })
                      ]
                    }
                  )
                ] }),
                /* @__PURE__ */ jsxs2("label", { className: "workflow-node-field", children: [
                  /* @__PURE__ */ jsx3("span", { children: "VALUE" }),
                  /* @__PURE__ */ jsx3(
                    "input",
                    {
                      value: meta.gateValue || "",
                      disabled: (meta.gateOperator || "not-empty") === "not-empty",
                      onChange: (event) => update({ gateValue: event.currentTarget.value })
                    }
                  )
                ] }),
                /* @__PURE__ */ jsxs2("label", { className: "workflow-node-field", children: [
                  /* @__PURE__ */ jsx3("span", { children: "ON FALSE" }),
                  /* @__PURE__ */ jsxs2(
                    "select",
                    {
                      value: meta.gateOnFalse || "stop",
                      onChange: (event) => update({
                        gateOnFalse: event.currentTarget.value
                      }),
                      children: [
                        /* @__PURE__ */ jsx3("option", { value: "stop", children: "stop" }),
                        /* @__PURE__ */ jsx3("option", { value: "skip", children: "skip" })
                      ]
                    }
                  )
                ] })
              ] }),
              role === "input" && meta.inputSchema === "research-query" && /* @__PURE__ */ jsxs2(Fragment3, { children: [
                /* @__PURE__ */ jsxs2("label", { className: "workflow-node-field is-research-topic", children: [
                  /* @__PURE__ */ jsx3("span", { children: "RESEARCH TOPIC" }),
                  /* @__PURE__ */ jsx3(
                    "input",
                    {
                      value: meta.researchTopic || "",
                      placeholder: "Enter a topic\u2026",
                      maxLength: 4e3,
                      onChange: (event) => update({ researchTopic: event.currentTarget.value })
                    }
                  )
                ] }),
                /* @__PURE__ */ jsxs2("label", { className: "workflow-node-field", children: [
                  /* @__PURE__ */ jsx3("span", { children: "BREADTH" }),
                  /* @__PURE__ */ jsx3(
                    "select",
                    {
                      value: String(meta.researchBreadth || 4),
                      onChange: (event) => update({ researchBreadth: Number(event.currentTarget.value) }),
                      children: [2, 3, 4, 5, 6].map((value) => /* @__PURE__ */ jsx3("option", { value, children: value }, value))
                    }
                  )
                ] })
              ] }),
              role === "input" && meta.inputSchema !== "research-query" && /* @__PURE__ */ jsxs2("label", { className: "workflow-node-field is-grow", children: [
                /* @__PURE__ */ jsx3("span", { children: "BOUNDED INPUT" }),
                /* @__PURE__ */ jsx3(
                  "textarea",
                  {
                    value: meta.dataValue || "",
                    placeholder: "Value passed into the first Phase",
                    maxLength: 4e3,
                    onChange: (event) => update({ dataValue: event.currentTarget.value })
                  }
                )
              ] }),
              role === "artifact" && /* @__PURE__ */ jsxs2("label", { className: "workflow-node-field is-grow", children: [
                /* @__PURE__ */ jsx3("span", { children: "ARTIFACT REFERENCE" }),
                /* @__PURE__ */ jsx3(
                  "input",
                  {
                    value: meta.artifactRef || "",
                    placeholder: "artifact://\u2026 or project-relative id",
                    onChange: (event) => update({ artifactRef: event.currentTarget.value })
                  }
                )
              ] }),
              role === "result" && /* @__PURE__ */ jsxs2("label", { className: "workflow-node-field is-grow", children: [
                /* @__PURE__ */ jsx3("span", { children: "RESULT LABEL" }),
                /* @__PURE__ */ jsx3(
                  "input",
                  {
                    value: meta.resultLabel || "",
                    placeholder: "workflow-result",
                    onChange: (event) => update({ resultLabel: event.currentTarget.value })
                  }
                )
              ] }),
              role === "module" && /* @__PURE__ */ jsxs2(Fragment3, { children: [
                /* @__PURE__ */ jsxs2("label", { className: "workflow-node-field", children: [
                  /* @__PURE__ */ jsx3("span", { children: "MODULE" }),
                  /* @__PURE__ */ jsxs2(
                    "select",
                    {
                      value: meta.moduleRef || "",
                      onChange: (event) => {
                        const selected = options.modules.find(
                          (item) => item.id === event.currentTarget.value
                        );
                        update({
                          moduleRef: event.currentTarget.value,
                          moduleVersion: selected?.value || "",
                          label: selected?.label || "Module"
                        });
                      },
                      children: [
                        /* @__PURE__ */ jsx3("option", { value: "", children: "select project module" }),
                        options.modules.map((item) => /* @__PURE__ */ jsxs2("option", { value: item.id, children: [
                          item.label,
                          " ",
                          item.value ? `\xB7 ${item.value}` : ""
                        ] }, item.id))
                      ]
                    }
                  )
                ] }),
                /* @__PURE__ */ jsxs2("label", { className: "workflow-node-field", children: [
                  /* @__PURE__ */ jsx3("span", { children: "VERSION" }),
                  /* @__PURE__ */ jsx3(
                    "input",
                    {
                      value: meta.moduleVersion || "",
                      onChange: (event) => update({ moduleVersion: event.currentTarget.value })
                    }
                  )
                ] }),
                /* @__PURE__ */ jsxs2("label", { className: "workflow-node-field is-grow", children: [
                  /* @__PURE__ */ jsx3("span", { children: "PARAMS \xB7 JSON" }),
                  /* @__PURE__ */ jsx3(
                    "textarea",
                    {
                      value: meta.moduleParams || "{}",
                      maxLength: 4e3,
                      onChange: (event) => update({ moduleParams: event.currentTarget.value })
                    }
                  )
                ] })
              ] })
            ]
          }
        ),
        /* @__PURE__ */ jsx3(
          WorkflowCardFooter,
          {
            inCount: meta.inCount,
            outCount: meta.outCount,
            right: role
          }
        )
      ]
    }
  );
}
function extendedNodePresentation(role) {
  if (role === "stage") {
    return {
      icon: "action",
      label: "Phase",
      subtitle: "CONTROL FLOW",
      description: "Controls execution order and bounded context."
    };
  }
  if (role === "agent") {
    return {
      icon: "agent",
      label: "Subagent Run",
      subtitle: "CHILD SESSION",
      description: "Launches one bounded child session."
    };
  }
  if (role === "persona") {
    return {
      icon: "prompt-template",
      label: "Persona",
      subtitle: "BEHAVIOR OVERLAY",
      description: "Adds reusable behavioral instructions."
    };
  }
  if (role === "role") {
    return {
      icon: "agent",
      label: "Role",
      subtitle: "SUBAGENT DEFAULTS",
      description: "Binds a discovered Grok role contract to the workflow."
    };
  }
  if (role === "capability") {
    return {
      icon: "context",
      label: "Capabilities",
      subtitle: "PERMISSION POLICY",
      description: "Sets the attached child session capability mode; defaults to all."
    };
  }
  if (role === "skill") {
    return {
      icon: "rich-output",
      label: "Skill",
      subtitle: "PROJECT INSTRUCTION",
      description: "References one compact project-local skill."
    };
  }
  if (role === "gate") {
    return {
      icon: "decision",
      label: "Gate",
      subtitle: "CONDITION",
      description: "Validates one Phase transition before continuing."
    };
  }
  if (role === "input") {
    return {
      icon: "input",
      label: "Input",
      subtitle: "DATA BOUNDARY",
      description: "Supplies bounded literal input to one Phase."
    };
  }
  if (role === "artifact") {
    return {
      icon: "data",
      label: "Artifact",
      subtitle: "REFERENCE",
      description: "Passes a compact artifact reference, never its contents."
    };
  }
  if (role === "result") {
    return {
      icon: "output",
      label: "Result",
      subtitle: "OUTPUT BOUNDARY",
      description: "Selects one Phase as the workflow result."
    };
  }
  return {
    icon: "map",
    label: "Module",
    subtitle: "VERSIONED SUBGRAPH",
    description: "Expands a versioned project-local subgraph definition."
  };
}
function WorkflowCardHeader({
  icon,
  title,
  subtitle,
  status = "READY"
}) {
  return /* @__PURE__ */ jsxs2("header", { className: "workflow-node-card-header", children: [
    /* @__PURE__ */ jsx3("span", { className: "workflow-node-card-icon", children: /* @__PURE__ */ jsx3(WorkflowIcon, { name: icon }) }),
    /* @__PURE__ */ jsxs2("div", { children: [
      /* @__PURE__ */ jsx3("strong", { children: title }),
      /* @__PURE__ */ jsx3("span", { children: subtitle })
    ] }),
    /* @__PURE__ */ jsx3("span", { className: "workflow-node-card-status", children: status })
  ] });
}
function WorkflowCardFooter({
  inCount = 0,
  outCount = 0,
  right
}) {
  return /* @__PURE__ */ jsxs2("footer", { className: "workflow-node-card-footer", children: [
    /* @__PURE__ */ jsxs2("span", { children: [
      inCount,
      " IN"
    ] }),
    /* @__PURE__ */ jsxs2("span", { children: [
      outCount,
      " OUT"
    ] }),
    /* @__PURE__ */ jsx3("span", { children: right })
  ] });
}
function useCatalogOptions(editor) {
  return useValue2(
    "agents models live catalog options",
    () => {
      const catalog = editor.getCurrentPageShapes().find(
        (candidate) => candidate.meta?.am?.role === "catalog"
      );
      const meta = catalog?.meta?.am;
      const sections = meta?.catalogSections ?? [];
      return {
        models: sections.find((section) => section.id === "models")?.items ?? [],
        agents: sections.find((section) => section.id === "agents")?.items ?? [],
        personas: sections.find((section) => section.id === "personas")?.items ?? [],
        roles: sections.find((section) => section.id === "roles")?.items ?? [],
        skills: sections.find((section) => section.id === "skills")?.items ?? [],
        modules: sections.find((section) => section.id === "modules")?.items ?? []
      };
    },
    [editor]
  );
}
function createAgentsModelsWorkflowMeta(role, patch = {}) {
  const defaults = {
    stage: { label: "Phase", stageType: "single" },
    agent: { label: "Subagent Run", skillRefs: [] },
    persona: { label: "Persona" },
    role: {
      label: "Role",
      roleDefaultCapabilityMode: "all",
      roleDefaultIsolation: "none"
    },
    capability: { label: "Capability", capabilityMode: "all" },
    skill: { label: "Legacy Skill" },
    gate: {
      label: "Gate",
      gateOperator: "not-empty",
      gateOnFalse: "stop"
    },
    input: { label: "Input" },
    artifact: { label: "Artifact" },
    result: { label: "Result" },
    module: { label: "Module", moduleParams: "{}" }
  };
  return omitUndefinedDeep({
    domain: "agents-models",
    role,
    ...defaults[role],
    ...patch
  });
}
function updateAgentsModelsShapeMeta(editor, shape, patch) {
  const latest = editor.getShape(shape.id);
  if (!latest || latest.type !== AGENTS_MODELS_SHAPE_TYPE) return;
  const latestMeta = latest.meta.am;
  if (latest.isLocked || latestMeta.workflowLocked === true) return;
  editor.updateShape({
    id: latest.id,
    type: AGENTS_MODELS_SHAPE_TYPE,
    meta: omitUndefinedDeep({
      ...latest.meta,
      am: {
        ...latestMeta,
        ...patch,
        unmodified: false
      }
    })
  });
}
function omitUndefinedDeep(value) {
  if (Array.isArray(value)) {
    return value.filter((item) => item !== void 0).map((item) => omitUndefinedDeep(item));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).filter(([, item]) => item !== void 0).map(([key, item]) => [key, omitUndefinedDeep(item)])
    );
  }
  return value;
}
function requestAgentsModelsAction(editor, action) {
  const toolbar = editor.getShape(createShapeId("am-toolbar"));
  if (!toolbar || toolbar.type !== AGENTS_MODELS_SHAPE_TYPE) return false;
  const latestMeta = toolbar.meta.am;
  const actionMessage = action.kind === "preset" ? `Materializing ${action.presetId}` : action.kind === "node" ? action.source === "catalog" ? `Creating ${action.catalogItemLabel || action.nodeKind}` : `Adding ${action.nodeKind}` : action.kind === "apply" ? "Compiling workflow" : action.kind === "preflight" ? "Validating workflow graph" : action.kind === "config-sync" ? "Syncing config.toml" : "Preparing launch receipt";
  editor.updateShape({
    id: toolbar.id,
    type: AGENTS_MODELS_SHAPE_TYPE,
    meta: omitUndefinedDeep({
      ...toolbar.meta,
      am: {
        ...latestMeta,
        actionRequest: {
          id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
          ...action,
          requestedAt: Date.now()
        },
        actionState: "running",
        actionMessage
      }
    })
  });
  return true;
}

// client/workflow/WorkflowConnectionShape.tsx
import {
  BaseBoxShapeUtil as BaseBoxShapeUtil2,
  CubicBezier2d,
  Edge2d,
  Group2d as Group2d2,
  HTMLContainer as HTMLContainer2,
  SVGContainer,
  ShapeUtil,
  T as T2,
  Vec as Vec2,
  BindingUtil,
  createShapeId as createShapeId2,
  clamp,
  stopEventPropagation as stopEventPropagation2,
  vecModelValidator,
  useEditor as useEditor3,
  useValue as useValue3
} from "tldraw";
import { jsx as jsx4, jsxs as jsxs3 } from "react/jsx-runtime";
var WORKFLOW_CONNECTION_TYPE = "workflow-connection";
var WORKFLOW_PORT_BINDING_TYPE = "workflow-port";
var WORKFLOW_JUNCTION_TYPE = "workflow-junction";
var WORKFLOW_JUNCTION_BINDING_TYPE = "workflow-junction";
var WORKFLOW_JUNCTION_MIN_SIZE = 36;
var WORKFLOW_BUNDLE_SPACING = 6;
var WORKFLOW_WIRE_WIDTH = 2.25;
var WORKFLOW_TIE_PADDING = 6;
var WORKFLOW_CONNECTION_RULES = [
  { fromRole: "stage", toRole: "stage", fromPortId: "control-out", toPortId: "control-in", kind: "control" },
  { fromRole: "stage", toRole: "gate", fromPortId: "control-out", toPortId: "condition-in", kind: "control" },
  { fromRole: "gate", toRole: "stage", fromPortId: "pass-out", toPortId: "control-in", kind: "condition" },
  { fromRole: "stage", toRole: "agent", fromPortId: "children-out", toPortId: "assignment-in", kind: "assignment" },
  { fromRole: "agent", toRole: "agent", fromPortId: "agent-out", toPortId: "resume-in", kind: "resume" },
  { fromRole: "agent", toRole: "stage", fromPortId: "result-out", toPortId: "data-in", kind: "data" },
  { fromRole: "agent", toRole: "persona", fromPortId: "attachments-out", toPortId: "persona-in", kind: "attachment" },
  { fromRole: "agent", toRole: "role", fromPortId: "attachments-out", toPortId: "role-in", kind: "attachment" },
  { fromRole: "agent", toRole: "capability", fromPortId: "attachments-out", toPortId: "capability-in", kind: "attachment" },
  { fromRole: "input", toRole: "stage", fromPortId: "data-out", toPortId: "data-in", kind: "data" },
  { fromRole: "artifact", toRole: "stage", fromPortId: "artifact-out", toPortId: "data-in", kind: "data" },
  { fromRole: "module", toRole: "stage", fromPortId: "module-out", toPortId: "control-in", kind: "module" },
  { fromRole: "stage", toRole: "result", fromPortId: "control-out", toPortId: "result-in", kind: "control" }
];
function normalizedWorkflowRole(role) {
  return role === "subagent" ? "agent" : String(role ?? "");
}
function compatibleWorkflowConnectionRule(fromRole, toRole, fromPortId, toPortId) {
  const normalizedFrom = normalizedWorkflowRole(fromRole);
  const normalizedTo = normalizedWorkflowRole(toRole);
  return WORKFLOW_CONNECTION_RULES.find(
    (rule) => rule.fromRole === normalizedFrom && rule.toRole === normalizedTo && (!fromPortId || rule.fromPortId === fromPortId) && (!toPortId || rule.toPortId === toPortId)
  );
}
function workflowPortAcceptsFanIn(portId) {
  return ["control-in", "data-in"].includes(portId ?? "");
}
var WorkflowPortBindingUtil = class extends BindingUtil {
  static type = WORKFLOW_PORT_BINDING_TYPE;
  static props = {
    portId: T2.string,
    terminal: T2.literalEnum("start", "end")
  };
  getDefaultProps() {
    return { portId: "", terminal: "start" };
  }
  onBeforeDeleteToShape({ binding }) {
    this.editor.deleteShapes([binding.fromId]);
  }
  onBeforeIsolateToShape({ binding }) {
    this.editor.deleteShapes([binding.fromId]);
  }
};
var WorkflowJunctionBindingUtil = class extends BindingUtil {
  static type = WORKFLOW_JUNCTION_BINDING_TYPE;
  static props = {};
  orphanCandidates = /* @__PURE__ */ new Set();
  getDefaultProps() {
    return {};
  }
  onAfterDelete({ binding }) {
    this.orphanCandidates.add(binding.toId);
    for (const remaining of this.editor.getBindingsFromShape(
      binding.fromId,
      WORKFLOW_JUNCTION_BINDING_TYPE
    )) {
      this.orphanCandidates.add(remaining.toId);
    }
  }
  onOperationComplete() {
    const candidates = [...this.orphanCandidates];
    this.orphanCandidates.clear();
    const pageJunctions = this.editor.getCurrentPageShapes().filter(
      (shape) => shape.type === WORKFLOW_JUNCTION_TYPE
    );
    const orphanBundles = /* @__PURE__ */ new Set();
    const orphans = /* @__PURE__ */ new Set();
    for (const junctionId of candidates) {
      const junction = this.editor.getShape(junctionId);
      if (junction?.type !== WORKFLOW_JUNCTION_TYPE) continue;
      const pairInfo = getWorkflowJunctionPairInfo(junction);
      const memberCount = this.editor.getBindingsToShape(
        junctionId,
        WORKFLOW_JUNCTION_BINDING_TYPE
      ).length;
      if (memberCount === 0) {
        orphans.add(junctionId);
        if (pairInfo) orphanBundles.add(pairInfo.bundleId);
        continue;
      }
      if (pairInfo && !pageJunctions.some((other) => {
        const otherInfo = getWorkflowJunctionPairInfo(other);
        return other.id !== junction.id && otherInfo?.bundleId === pairInfo.bundleId && otherInfo.side !== pairInfo.side;
      })) {
        orphanBundles.add(pairInfo.bundleId);
      }
    }
    for (const junction of pageJunctions) {
      const pairInfo = getWorkflowJunctionPairInfo(junction);
      if (pairInfo && orphanBundles.has(pairInfo.bundleId)) orphans.add(junction.id);
    }
    if (orphans.size) this.editor.deleteShapes([...orphans]);
  }
};
var WorkflowJunctionShapeUtil = class extends BaseBoxShapeUtil2 {
  static type = WORKFLOW_JUNCTION_TYPE;
  static props = { w: T2.number, h: T2.number };
  getDefaultProps() {
    return { w: WORKFLOW_JUNCTION_MIN_SIZE, h: WORKFLOW_JUNCTION_MIN_SIZE };
  }
  canEdit() {
    return false;
  }
  canResize() {
    return false;
  }
  canSnap() {
    return true;
  }
  hideResizeHandles() {
    return true;
  }
  hideRotateHandle() {
    return true;
  }
  hideSelectionBoundsBg() {
    return true;
  }
  hideSelectionBoundsFg() {
    return true;
  }
  component(shape) {
    return /* @__PURE__ */ jsx4(WorkflowJunctionComponent, { shape });
  }
  getIndicatorPath(_shape) {
    return new Path2D();
  }
};
function WorkflowJunctionComponent({ shape }) {
  const editor = useEditor3();
  const state = useValue3(
    `workflow junction ${shape.id}`,
    () => {
      const pair = getWorkflowJunctionPair(editor, shape.id);
      const ownBounds = editor.getShapePageBounds(shape.id);
      const other = pair ? pair.a.id === shape.id ? pair.b : pair.a : null;
      const otherBounds = other ? editor.getShapePageBounds(other.id) : null;
      const members = getWorkflowJunctionMembers(editor, shape.id);
      const layout2 = ownBounds && otherBounds ? getWorkflowBundleLayout(
        members,
        pair?.a.id === shape.id ? ownBounds.center : otherBounds.center,
        pair?.a.id === shape.id ? otherBounds.center : ownBounds.center
      ) : null;
      return {
        angle: layout2 ? Math.atan2(layout2.tangent.y, layout2.tangent.x) * 180 / Math.PI + 90 : 90,
        length: workflowTieLength(members.length),
        selected: editor.getSelectedShapeIds().includes(shape.id)
      };
    },
    [editor, shape.id]
  );
  return /* @__PURE__ */ jsx4(
    HTMLContainer2,
    {
      className: `workflow-junction-shape${state.selected ? " is-selected" : ""}`,
      style: { width: shape.props.w, height: shape.props.h },
      role: "button",
      "aria-label": "Workflow cable tie",
      children: /* @__PURE__ */ jsx4(
        "span",
        {
          className: "workflow-cable-tie",
          style: {
            "--workflow-tie-angle": `${state.angle}deg`,
            "--workflow-tie-length": `${state.length}px`
          },
          "aria-hidden": "true",
          children: /* @__PURE__ */ jsx4("i", { className: "workflow-cable-tie-buckle" })
        }
      )
    }
  );
}
var WorkflowConnectionShapeUtil = class extends ShapeUtil {
  static type = WORKFLOW_CONNECTION_TYPE;
  static props = {
    start: vecModelValidator,
    end: vecModelValidator
  };
  getDefaultProps() {
    return { start: { x: 0, y: 0 }, end: { x: 180, y: 0 } };
  }
  canEdit() {
    return false;
  }
  canResize() {
    return false;
  }
  canSnap() {
    return false;
  }
  hideResizeHandles() {
    return true;
  }
  hideRotateHandle() {
    return true;
  }
  hideSelectionBoundsBg() {
    return true;
  }
  hideSelectionBoundsFg() {
    return true;
  }
  getBoundsSnapGeometry() {
    return { points: [] };
  }
  getGeometry(shape) {
    const route = getWorkflowConnectionRoute(this.editor, shape);
    if (!route.bundle) return workflowConnectionGeometry(route.start, route.end);
    return new Group2d2({
      children: [
        workflowBundleTransitionGeometry(
          route.start,
          route.bundle.start,
          route.bundle.tangent,
          "entry"
        ),
        new Edge2d({ start: route.bundle.start, end: route.bundle.end }),
        workflowBundleTransitionGeometry(
          route.bundle.end,
          route.end,
          route.bundle.tangent,
          "exit"
        )
      ]
    });
  }
  getHandles(shape) {
    const { start, end } = getWorkflowConnectionTerminals(this.editor, shape);
    return [
      { id: "start", type: "vertex", index: "a0", ...start },
      { id: "end", type: "vertex", index: "a1", ...end }
    ];
  }
  onHandleDrag(shape, { handle }) {
    const terminal = handle.id;
    const opposite = terminal === "start" ? "end" : "start";
    const bindings = getWorkflowConnectionBindings(this.editor, shape);
    const oppositeBinding = bindings[opposite];
    const oppositeTarget = oppositeBinding?.toId;
    const pagePoint = this.editor.getShapePageTransform(shape).applyToPoint(handle);
    const target = getWorkflowPortAtPoint(this.editor, pagePoint, {
      terminal,
      margin: 12
    });
    const inputAlreadyUsed = terminal === "end" && !workflowPortAcceptsFanIn(target?.port.id) && target?.existingConnections.some(
      (connection) => connection.connectionId !== shape.id
    );
    const wouldSelfConnect = target?.shape.id === oppositeTarget;
    const oppositeShape = oppositeTarget ? this.editor.getShape(oppositeTarget) : void 0;
    const targetRole = target?.shape.meta?.am?.role;
    const oppositeRole = oppositeShape?.meta?.am?.role;
    const compatible = target && oppositeBinding && (terminal === "end" ? compatibleWorkflowConnectionRule(
      oppositeRole,
      targetRole,
      oppositeBinding.props.portId,
      target.port.id
    ) : compatibleWorkflowConnectionRule(
      targetRole,
      oppositeRole,
      target.port.id,
      oppositeBinding.props.portId
    ));
    if (!target || inputAlreadyUsed || wouldSelfConnect || !compatible) {
      removeWorkflowConnectionBinding(this.editor, shape.id, terminal);
      return {
        ...shape,
        props: {
          ...shape.props,
          [terminal]: { x: handle.x, y: handle.y }
        }
      };
    }
    createOrUpdateWorkflowPortBinding(
      this.editor,
      shape.id,
      target.shape.id,
      { portId: target.port.id, terminal }
    );
    return shape;
  }
  onHandleDragEnd(shape, { handle, isCreatingShape }) {
    const terminal = handle.id;
    const bindings = getWorkflowConnectionBindings(this.editor, shape);
    if (bindings[terminal]) return;
    if (isCreatingShape && terminal === "end" && bindings.start) {
      const pagePoint = this.editor.getShapePageTransform(shape).applyToPoint(handle);
      openWorkflowNodePicker({
        editor: this.editor,
        connectionId: shape.id,
        terminal: "end",
        pagePoint: { x: pagePoint.x, y: pagePoint.y }
      });
      return;
    }
    this.editor.deleteShapes([shape.id]);
  }
  component(shape) {
    return /* @__PURE__ */ jsx4(WorkflowConnectionComponent, { shape });
  }
  getIndicatorPath(shape) {
    const { start, end, bundle } = getWorkflowConnectionRoute(this.editor, shape);
    return new Path2D(workflowConnectionPath(start, end, bundle));
  }
};
function WorkflowConnectionComponent({
  shape
}) {
  const editor = useEditor3();
  const rendering = useValue3(
    `workflow connection ${shape.id}`,
    () => {
      const bindings = getWorkflowConnectionBindings(editor, shape);
      const fromRole = bindings.start ? editor.getShape(bindings.start.toId)?.meta?.am?.role : void 0;
      const toRole = bindings.end ? editor.getShape(bindings.end.toId)?.meta?.am?.role : void 0;
      const startPortId = bindings.start?.props.portId;
      const endPortId = bindings.end?.props.portId;
      const rule = compatibleWorkflowConnectionRule(
        fromRole,
        toRole,
        startPortId,
        endPortId
      );
      return {
        route: getWorkflowConnectionRoute(editor, shape),
        kind: rule?.kind ?? "control",
        selected: editor.getSelectedShapeIds().includes(shape.id)
      };
    },
    [editor, shape]
  );
  return /* @__PURE__ */ jsxs3(
    SVGContainer,
    {
      className: `workflow-native-connection is-${rendering.kind}${rendering.selected ? " is-selected" : ""}`,
      children: [
        /* @__PURE__ */ jsx4("defs", { children: /* @__PURE__ */ jsx4(
          "marker",
          {
            id: `workflow-arrow-${shape.id.replace(/[^A-Za-z0-9_-]/g, "")}`,
            viewBox: "0 0 10 10",
            refX: "9",
            refY: "5",
            markerWidth: "6",
            markerHeight: "6",
            orient: "auto-start-reverse",
            children: /* @__PURE__ */ jsx4("path", { d: "M 0 0 L 10 5 L 0 10 z" })
          }
        ) }),
        /* @__PURE__ */ jsx4(
          "path",
          {
            d: workflowConnectionPath(
              rendering.route.start,
              rendering.route.end,
              rendering.route.bundle
            ),
            markerEnd: `url(#workflow-arrow-${shape.id.replace(/[^A-Za-z0-9_-]/g, "")})`
          }
        )
      ]
    }
  );
}
function getWorkflowConnectionBindings(editor, connection) {
  const connectionId = typeof connection === "string" ? connection : connection.id;
  const result = {};
  for (const binding of editor.getBindingsFromShape(
    connectionId,
    WORKFLOW_PORT_BINDING_TYPE
  )) {
    result[binding.props.terminal] = binding;
  }
  return result;
}
function createOrUpdateWorkflowPortBinding(editor, connectionId, targetId, props) {
  const matching = editor.getBindingsFromShape(
    connectionId,
    WORKFLOW_PORT_BINDING_TYPE
  ).filter((binding) => binding.props.terminal === props.terminal);
  if (matching.length > 1) editor.deleteBindings(matching.slice(1));
  const existing = matching[0];
  if (existing) {
    editor.updateBinding({ ...existing, toId: targetId, props });
  } else {
    editor.createBinding({
      type: WORKFLOW_PORT_BINDING_TYPE,
      fromId: connectionId,
      toId: targetId,
      props
    });
  }
}
function removeWorkflowConnectionBinding(editor, connectionId, terminal) {
  editor.deleteBindings(
    editor.getBindingsFromShape(
      connectionId,
      WORKFLOW_PORT_BINDING_TYPE
    ).filter((binding) => binding.props.terminal === terminal)
  );
}
function getWorkflowConnectionTerminals(editor, shape) {
  const bindings = getWorkflowConnectionBindings(editor, shape);
  const transform = editor.getShapePageTransform(shape);
  const inverse = transform.clone().invert();
  const position = (terminal) => {
    const binding = bindings[terminal];
    if (!binding) return Vec2.From(shape.props[terminal]);
    const target = editor.getShape(binding.toId);
    if (!target || target.type !== "agents-models-node") {
      return Vec2.From(shape.props[terminal]);
    }
    const page = workflowPortPositionInPage(
      editor,
      target,
      binding.props.portId
    );
    return page ? inverse.applyToPoint(page) : Vec2.From(shape.props[terminal]);
  };
  return { start: position("start"), end: position("end") };
}
function getWorkflowConnectionJunctionBindings(editor, connection) {
  const connectionId = typeof connection === "string" ? connection : connection.id;
  return editor.getBindingsFromShape(
    connectionId,
    WORKFLOW_JUNCTION_BINDING_TYPE
  );
}
function getWorkflowJunctionPairInfo(shape) {
  const value = shape.meta.workflowCableBundle;
  if (!value || typeof value !== "object") return null;
  const { bundleId, side } = value;
  if (typeof bundleId !== "string" || side !== "a" && side !== "b") {
    return null;
  }
  return { bundleId, side };
}
function getWorkflowJunctionPair(editor, junctionId) {
  const junction = editor.getShape(junctionId);
  if (junction?.type !== WORKFLOW_JUNCTION_TYPE) return null;
  const info = getWorkflowJunctionPairInfo(junction);
  if (!info) return null;
  const members = editor.getCurrentPageShapes().filter(
    (shape) => shape.type === WORKFLOW_JUNCTION_TYPE && getWorkflowJunctionPairInfo(shape)?.bundleId === info.bundleId
  );
  if (members.length !== 2) return null;
  const a = members.find(
    (shape) => getWorkflowJunctionPairInfo(shape)?.side === "a"
  );
  const b = members.find(
    (shape) => getWorkflowJunctionPairInfo(shape)?.side === "b"
  );
  return a && b ? { bundleId: info.bundleId, a, b } : null;
}
function getWorkflowConnectionJunctionPair(editor, connection) {
  for (const binding of getWorkflowConnectionJunctionBindings(editor, connection)) {
    const pair = getWorkflowJunctionPair(editor, binding.toId);
    if (!pair) continue;
    const pairIds = /* @__PURE__ */ new Set([pair.a.id, pair.b.id]);
    const boundPairIds = new Set(
      getWorkflowConnectionJunctionBindings(editor, connection).map(
        (candidate) => candidate.toId
      )
    );
    if ([...pairIds].every((id) => boundPairIds.has(id))) return pair;
  }
  return null;
}
function workflowTieLength(memberCount) {
  return Math.max(
    24,
    Math.max(0, memberCount - 1) * WORKFLOW_BUNDLE_SPACING + WORKFLOW_WIRE_WIDTH + WORKFLOW_TIE_PADDING * 2
  );
}
function getWorkflowBundleLayout(members, tieA, tieB) {
  const dx = tieB.x - tieA.x;
  const dy = tieB.y - tieA.y;
  const distance = Math.hypot(dx, dy);
  const tangent = distance > 0 ? new Vec2(dx / distance, dy / distance) : new Vec2(1, 0);
  const normal = new Vec2(-tangent.y, tangent.x);
  const orthogonalPosition = (member) => (member.start.x + member.end.x) / 2 * normal.x + (member.start.y + member.end.y) / 2 * normal.y;
  const ordered = [...members].sort(
    (a, b) => orthogonalPosition(a) - orthogonalPosition(b) || a.id.localeCompare(b.id)
  );
  const segments = /* @__PURE__ */ new Map();
  ordered.forEach((member, index) => {
    const offset = (index - (ordered.length - 1) / 2) * WORKFLOW_BUNDLE_SPACING;
    segments.set(member.id, {
      start: new Vec2(tieA.x + normal.x * offset, tieA.y + normal.y * offset),
      end: new Vec2(tieB.x + normal.x * offset, tieB.y + normal.y * offset),
      tangent
    });
  });
  return {
    tangent,
    normal,
    bundleWidth: workflowTieLength(ordered.length),
    segments
  };
}
function getWorkflowJunctionMembers(editor, junctionId) {
  return editor.getBindingsToShape(
    junctionId,
    WORKFLOW_JUNCTION_BINDING_TYPE
  ).flatMap((memberBinding) => {
    const member = editor.getShape(memberBinding.fromId);
    if (!member || member.type !== WORKFLOW_CONNECTION_TYPE) return [];
    const memberShape = member;
    const memberTransform = editor.getShapePageTransform(memberShape);
    const memberTerminals = getWorkflowConnectionTerminals(editor, memberShape);
    return [{
      id: memberShape.id,
      start: memberTransform.applyToPoint(memberTerminals.start),
      end: memberTransform.applyToPoint(memberTerminals.end)
    }];
  });
}
function getWorkflowConnectionRoute(editor, shape) {
  const terminals = getWorkflowConnectionTerminals(editor, shape);
  const pair = getWorkflowConnectionJunctionPair(editor, shape);
  if (!pair) return terminals;
  const aBounds = editor.getShapePageBounds(pair.a.id);
  const bBounds = editor.getShapePageBounds(pair.b.id);
  if (!aBounds || !bBounds) return terminals;
  const members = getWorkflowJunctionMembers(editor, pair.a.id);
  const pageBundle = getWorkflowBundleLayout(
    members,
    aBounds.center,
    bBounds.center
  ).segments.get(shape.id);
  if (!pageBundle) return terminals;
  const inverse = editor.getShapePageTransform(shape).clone().invert();
  const start = inverse.applyToPoint(pageBundle.start);
  const end = inverse.applyToPoint(pageBundle.end);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  return {
    ...terminals,
    bundle: {
      start,
      end,
      tangent: length > 0 ? new Vec2(dx / length, dy / length) : new Vec2(1, 0)
    }
  };
}
function getWorkflowConnectionControlPoints(start, end) {
  if (Math.abs(end.y - start.y) > Math.abs(end.x - start.x)) {
    const distance2 = end.y - start.y;
    const bend2 = Math.max(
      30,
      distance2 > 0 ? distance2 / 3 : clamp(Math.abs(distance2) + 30, 0, 100)
    );
    return [new Vec2(start.x, start.y + bend2), new Vec2(end.x, end.y - bend2)];
  }
  const distance = end.x - start.x;
  const bend = Math.max(
    30,
    distance > 0 ? distance / 3 : clamp(Math.abs(distance) + 30, 0, 100)
  );
  return [new Vec2(start.x + bend, start.y), new Vec2(end.x - bend, end.y)];
}
function getWorkflowBundleTransitionControlPoints(start, end, tangent, position) {
  const [directFirst, directSecond] = getWorkflowConnectionControlPoints(start, end);
  const bend = Math.min(120, Math.max(4, Math.hypot(end.x - start.x, end.y - start.y) * 0.42));
  if (position === "entry") {
    return [
      directFirst,
      new Vec2(end.x - tangent.x * bend, end.y - tangent.y * bend)
    ];
  }
  return [
    new Vec2(start.x + tangent.x * bend, start.y + tangent.y * bend),
    directSecond
  ];
}
function workflowConnectionGeometry(start, end) {
  const [cp1, cp2] = getWorkflowConnectionControlPoints(start, end);
  return new CubicBezier2d({
    start: Vec2.From(start),
    cp1,
    cp2,
    end: Vec2.From(end)
  });
}
function workflowBundleTransitionGeometry(start, end, tangent, position) {
  const [cp1, cp2] = getWorkflowBundleTransitionControlPoints(
    start,
    end,
    tangent,
    position
  );
  return new CubicBezier2d({
    start: Vec2.From(start),
    cp1,
    cp2,
    end: Vec2.From(end)
  });
}
function workflowConnectionSegmentPath(start, end) {
  const [cp1, cp2] = getWorkflowConnectionControlPoints(start, end);
  return `M ${start.x} ${start.y} C ${cp1.x} ${cp1.y} ${cp2.x} ${cp2.y} ${end.x} ${end.y}`;
}
function workflowBundleCurveCommand(start, end, tangent, position, moveToStart) {
  const [cp1, cp2] = getWorkflowBundleTransitionControlPoints(
    start,
    end,
    tangent,
    position
  );
  return `${moveToStart ? `M ${start.x} ${start.y} ` : ""}C ${cp1.x} ${cp1.y} ${cp2.x} ${cp2.y} ${end.x} ${end.y}`;
}
function workflowConnectionPath(start, end, bundle) {
  if (!bundle) return workflowConnectionSegmentPath(start, end);
  return `${workflowBundleCurveCommand(start, bundle.start, bundle.tangent, "entry", true)} L ${bundle.end.x} ${bundle.end.y} ${workflowBundleCurveCommand(bundle.end, end, bundle.tangent, "exit", false)}`;
}

// client/workflow/WorkflowLayoutBinding.ts
import {
  BindingUtil as BindingUtil2,
  T as T3
} from "tldraw";
var WORKFLOW_LAYOUT_BINDING_TYPE = "workflow-layout";
function computeWorkflowAnchorPosition(owner, item, offsetX, offsetY) {
  return {
    id: item.id,
    x: owner.minX + offsetX,
    y: owner.minY + offsetY
  };
}
function computeWorkflowLayout(owner, items, axis, gap) {
  const safeGap = Math.max(0, gap);
  let cursor = axis === "x" ? owner.maxX + safeGap : owner.maxY + safeGap;
  return [...items].sort((left, right) => left.order - right.order || left.id.localeCompare(right.id)).map((item) => {
    const position = axis === "x" ? {
      id: item.id,
      x: cursor,
      y: owner.minY + (owner.h - item.h) / 2
    } : {
      id: item.id,
      x: owner.minX + (owner.w - item.w) / 2,
      y: cursor
    };
    cursor += (axis === "x" ? item.w : item.h) + safeGap;
    return position;
  });
}
var WorkflowLayoutBindingUtil = class extends BindingUtil2 {
  static type = WORKFLOW_LAYOUT_BINDING_TYPE;
  static props = {
    axis: T3.literalEnum("x", "y"),
    gap: T3.number,
    order: T3.number,
    offsetX: T3.number.optional(),
    offsetY: T3.number.optional()
  };
  isLayingOut = false;
  getDefaultProps() {
    return { axis: "x", gap: 72, order: 0 };
  }
  onAfterCreate({ binding }) {
    this.relayout(binding.toId);
  }
  onAfterChange({ bindingAfter }) {
    this.relayout(bindingAfter.toId);
  }
  onAfterChangeFromShape({ binding }) {
    this.relayout(binding.toId);
  }
  onAfterChangeToShape({ binding }) {
    this.relayout(binding.toId);
  }
  relayout(ownerId) {
    if (this.isLayingOut) return;
    this.isLayingOut = true;
    try {
      relayoutWorkflowOwner(this.editor, ownerId);
    } finally {
      this.isLayingOut = false;
    }
  }
};
function relayoutWorkflowOwner(editor, ownerId) {
  const owner = editor.getShape(ownerId);
  const ownerBounds = owner && editor.getShapePageBounds(owner);
  if (!owner || !ownerBounds) return;
  const bindings = editor.getBindingsToShape(
    ownerId,
    WORKFLOW_LAYOUT_BINDING_TYPE
  ).filter((binding) => Boolean(editor.getShape(binding.fromId)));
  if (!bindings.length) return;
  const lanes = /* @__PURE__ */ new Map();
  for (const binding of bindings) {
    const anchored = Number.isFinite(binding.props.offsetX) && Number.isFinite(binding.props.offsetY);
    const key = anchored ? `anchor:${binding.id}` : `${binding.props.axis}:${binding.props.gap}`;
    const lane = lanes.get(key) ?? {
      axis: binding.props.axis,
      gap: binding.props.gap,
      bindings: []
    };
    lane.bindings.push(binding);
    lanes.set(key, lane);
  }
  const updates = [];
  for (const lane of lanes.values()) {
    const items = lane.bindings.flatMap((binding2) => {
      const shape = editor.getShape(binding2.fromId);
      if (!shape) return [];
      const geometry = editor.getShapeGeometry(shape).bounds;
      return [
        {
          id: shape.id,
          w: geometry.w,
          h: geometry.h,
          order: binding2.props.order,
          shape,
          geometry
        }
      ];
    });
    const binding = lane.bindings[0];
    const anchored = lane.bindings.length === 1 && Number.isFinite(binding.props.offsetX) && Number.isFinite(binding.props.offsetY);
    const positions = anchored ? items.map(
      (item) => computeWorkflowAnchorPosition(
        ownerBounds,
        item,
        binding.props.offsetX,
        binding.props.offsetY
      )
    ) : computeWorkflowLayout(ownerBounds, items, lane.axis, lane.gap);
    for (const position of positions) {
      const item = items.find((candidate) => candidate.id === position.id);
      if (!item) continue;
      const desiredPageOrigin = {
        x: position.x - item.geometry.minX,
        y: position.y - item.geometry.minY
      };
      const parentTransform = editor.getShapeParentTransform(item.shape);
      const local = parentTransform.clone().invert().applyToPoint(desiredPageOrigin);
      const rotation = -parentTransform.rotation();
      if (Math.abs(item.shape.x - local.x) < 0.01 && Math.abs(item.shape.y - local.y) < 0.01 && Math.abs(item.shape.rotation - rotation) < 1e-4) {
        continue;
      }
      updates.push({
        id: item.shape.id,
        type: item.shape.type,
        x: local.x,
        y: local.y,
        rotation
      });
    }
  }
  if (updates.length) editor.updateShapes(updates);
}

// client/workflow/PointingWorkflowPort.ts
import {
  StateNode,
  createShapeId as createShapeId3
} from "tldraw";
var PointingWorkflowPort = class extends StateNode {
  static id = "pointing_workflow_port";
  info;
  transitionToSelect(path, info = {}) {
    this.editor.setCurrentTool(`select.${path}`, info);
  }
  onEnter(info) {
    this.info = info;
  }
  onPointerMove(info) {
    if (!this.info || !this.editor.inputs.getIsDragging()) return;
    const existing = getWorkflowPortConnections(
      this.editor,
      this.info.shapeId
    ).find((connection) => connection.ownPortId === this.info?.portId);
    if (this.info.terminal === "end" && existing) {
      const shape2 = this.editor.getShape(existing.connectionId);
      const handle2 = this.editor.getShapeHandles(existing.connectionId)?.find((candidate) => candidate.id === "end");
      if (shape2 && handle2) {
        this.transitionToSelect("dragging_handle", {
          ...info,
          target: "handle",
          shape: shape2,
          handle: handle2
        });
      }
      return;
    }
    const creatingMarkId = this.editor.markHistoryStoppingPoint();
    const connectionId = createShapeId3();
    const sourcePoint = this.editor.inputs.getCurrentPagePoint();
    this.editor.createShape({
      id: connectionId,
      type: WORKFLOW_CONNECTION_TYPE,
      x: 0,
      y: 0,
      props: {
        start: { x: sourcePoint.x, y: sourcePoint.y },
        end: { x: sourcePoint.x, y: sourcePoint.y }
      }
    });
    createOrUpdateWorkflowPortBinding(
      this.editor,
      connectionId,
      this.info.shapeId,
      { portId: this.info.portId, terminal: this.info.terminal }
    );
    const draggingTerminal = this.info.terminal === "start" ? "end" : "start";
    const shape = this.editor.getShape(connectionId);
    const handle = this.editor.getShapeHandles(connectionId)?.find((candidate) => candidate.id === draggingTerminal);
    if (!shape || !handle) return;
    this.transitionToSelect("dragging_handle", {
      ...info,
      target: "handle",
      shape,
      handle,
      creatingMarkId,
      isCreating: true
    });
  }
  onPointerUp(info) {
    if (this.info) {
      const existing = getWorkflowPortConnections(
        this.editor,
        this.info.shapeId
      ).some((connection) => connection.ownPortId === this.info?.portId);
      if (!existing) this.openPickerFromPin();
    }
    this.transitionToSelect("idle", info);
  }
  openPickerFromPin() {
    if (!this.info) return;
    const shape = this.editor.getShape(this.info.shapeId);
    if (!shape || shape.type !== "agents-models-node") return;
    const port = getWorkflowPorts(shape)[this.info.portId];
    const pinPoint = workflowPortPositionInPage(
      this.editor,
      shape,
      this.info.portId
    );
    if (!port || !pinPoint) return;
    const pagePoint = { ...pinPoint };
    if (port.x === 0) pagePoint.x -= 220;
    else if (port.x === shape.props.w) pagePoint.x += 220;
    else if (port.y === 0) pagePoint.y -= 220;
    else pagePoint.y += 220;
    const connectionId = createShapeId3();
    this.editor.createShape({
      id: connectionId,
      type: WORKFLOW_CONNECTION_TYPE,
      x: 0,
      y: 0,
      props: {
        start: this.info.terminal === "start" ? pinPoint : pagePoint,
        end: this.info.terminal === "end" ? pinPoint : pagePoint
      }
    });
    createOrUpdateWorkflowPortBinding(
      this.editor,
      connectionId,
      this.info.shapeId,
      { portId: this.info.portId, terminal: this.info.terminal }
    );
    openWorkflowNodePicker({
      editor: this.editor,
      connectionId,
      terminal: this.info.terminal === "start" ? "end" : "start",
      pagePoint,
      sourceShapeId: this.info.shapeId,
      sourcePortId: this.info.portId
    });
  }
  onCancel() {
    this.transitionToSelect("idle");
  }
  onComplete() {
    this.transitionToSelect("idle");
  }
};

// client/canvas-kit/grokWorkflowCanvasKit.ts
var GROK_WORKFLOW_KIT_ID = "grok.workflow";
var GROK_TRUSTED_ML_RELEASE_PRESET_ID = "grok.trusted-ml-release";
var GROK_WORKFLOW_SHAPE_UTILS = Object.freeze([
  AgentsModelsShapeUtil,
  WorkflowConnectionShapeUtil,
  WorkflowJunctionShapeUtil
]);
var GROK_WORKFLOW_BINDING_UTILS = Object.freeze([
  WorkflowPortBindingUtil,
  WorkflowJunctionBindingUtil,
  WorkflowLayoutBindingUtil
]);
var GROK_WORKFLOW_TOOLS = Object.freeze([
  PointingWorkflowPort
]);
var GROK_WORKFLOW_SHAPE_TYPES = [
  AGENTS_MODELS_SHAPE_TYPE,
  WORKFLOW_CONNECTION_TYPE,
  WORKFLOW_JUNCTION_TYPE
];
var GROK_WORKFLOW_BINDING_TYPES = [
  WORKFLOW_PORT_BINDING_TYPE,
  WORKFLOW_JUNCTION_BINDING_TYPE,
  WORKFLOW_LAYOUT_BINDING_TYPE
];
var GROK_WORKFLOW_TOOL_TYPES = [PointingWorkflowPort.id];
var GROK_TRUSTED_ML_RELEASE_IDS = {
  input: createShapeId4("grok-trusted-ml-release-brief"),
  discover: createShapeId4("grok-trusted-ml-release-discover"),
  agent: createShapeId4("grok-trusted-ml-release-evaluator"),
  persona: createShapeId4("grok-trusted-ml-release-persona"),
  capability: createShapeId4("grok-trusted-ml-release-capability"),
  gate: createShapeId4("grok-trusted-ml-release-gate"),
  publish: createShapeId4("grok-trusted-ml-release-publish"),
  result: createShapeId4("grok-trusted-ml-release-result"),
  catalog: createShapeId4("grok-trusted-ml-release-catalog"),
  toolbar: createShapeId4("am-toolbar")
};
var GROK_TRUSTED_ML_RELEASE_SOURCE_CENTER = {
  x: 869,
  y: 459
};
function createGrokTrustedMlReleaseFixture(pageId, point = GROK_TRUSTED_ML_RELEASE_SOURCE_CENTER) {
  assertFinitePoint(point);
  const offsetX = point.x - GROK_TRUSTED_ML_RELEASE_SOURCE_CENTER.x;
  const offsetY = point.y - GROK_TRUSTED_ML_RELEASE_SOURCE_CENTER.y;
  const at = (x, y) => ({
    x: x + offsetX,
    y: y + offsetY
  });
  const nodes = [
    {
      id: GROK_TRUSTED_ML_RELEASE_IDS.input,
      kind: "input",
      ...at(40, 180),
      meta: {
        label: "Release brief",
        dataValue: "Validate evidence before publishing the release decision."
      }
    },
    {
      id: GROK_TRUSTED_ML_RELEASE_IDS.discover,
      kind: "stage",
      ...at(380, 150),
      meta: { label: "Discover + evaluate", stageType: "foreach" }
    },
    {
      id: GROK_TRUSTED_ML_RELEASE_IDS.agent,
      kind: "agent",
      ...at(380, 420),
      meta: {
        label: "ML evaluator",
        agentRef: "ml-llmops",
        modelRef: "gpt-5.6-sol",
        skillRefs: ["promptfoo-evals"]
      }
    },
    {
      id: GROK_TRUSTED_ML_RELEASE_IDS.persona,
      kind: "persona",
      ...at(250, 650),
      meta: {
        label: "Evaluation persona",
        persona: "evidence-editor"
      }
    },
    {
      id: GROK_TRUSTED_ML_RELEASE_IDS.capability,
      kind: "capability",
      ...at(525, 650),
      meta: {
        label: "Evidence inspection only",
        capabilityMode: "read-only",
        toolRefsText: "read_file, grep"
      }
    },
    {
      id: GROK_TRUSTED_ML_RELEASE_IDS.gate,
      kind: "gate",
      ...at(760, 128),
      meta: {
        label: "Evidence ready?",
        gateOperator: "contains",
        gateValue: "evidence:ready",
        gateOnFalse: "stop"
      }
    },
    {
      id: GROK_TRUSTED_ML_RELEASE_IDS.publish,
      kind: "stage",
      ...at(1110, 150),
      meta: { label: "Publish ADR + receipt", stageType: "reduce" }
    },
    {
      id: GROK_TRUSTED_ML_RELEASE_IDS.result,
      kind: "result",
      ...at(1450, 180),
      meta: {
        label: "Inspected workflow",
        resultLabel: "release decision"
      }
    }
  ];
  const edges = [
    edge(
      "input-discover",
      GROK_TRUSTED_ML_RELEASE_IDS.input,
      GROK_TRUSTED_ML_RELEASE_IDS.discover
    ),
    edge(
      "discover-agent",
      GROK_TRUSTED_ML_RELEASE_IDS.discover,
      GROK_TRUSTED_ML_RELEASE_IDS.agent
    ),
    edge(
      "agent-persona",
      GROK_TRUSTED_ML_RELEASE_IDS.agent,
      GROK_TRUSTED_ML_RELEASE_IDS.persona
    ),
    edge(
      "agent-capability",
      GROK_TRUSTED_ML_RELEASE_IDS.agent,
      GROK_TRUSTED_ML_RELEASE_IDS.capability
    ),
    edge(
      "discover-gate",
      GROK_TRUSTED_ML_RELEASE_IDS.discover,
      GROK_TRUSTED_ML_RELEASE_IDS.gate
    ),
    edge(
      "gate-publish",
      GROK_TRUSTED_ML_RELEASE_IDS.gate,
      GROK_TRUSTED_ML_RELEASE_IDS.publish
    ),
    edge(
      "publish-result",
      GROK_TRUSTED_ML_RELEASE_IDS.publish,
      GROK_TRUSTED_ML_RELEASE_IDS.result
    )
  ];
  const layouts = [
    layout(
      "discover-agent",
      GROK_TRUSTED_ML_RELEASE_IDS.agent,
      GROK_TRUSTED_ML_RELEASE_IDS.discover,
      0,
      270,
      0
    ),
    layout(
      "agent-persona",
      GROK_TRUSTED_ML_RELEASE_IDS.persona,
      GROK_TRUSTED_ML_RELEASE_IDS.agent,
      -130,
      230,
      0
    ),
    layout(
      "agent-capability",
      GROK_TRUSTED_ML_RELEASE_IDS.capability,
      GROK_TRUSTED_ML_RELEASE_IDS.agent,
      145,
      230,
      1
    ),
    layout(
      "discover-gate",
      GROK_TRUSTED_ML_RELEASE_IDS.gate,
      GROK_TRUSTED_ML_RELEASE_IDS.discover,
      380,
      -22,
      1
    ),
    layout(
      "gate-publish",
      GROK_TRUSTED_ML_RELEASE_IDS.publish,
      GROK_TRUSTED_ML_RELEASE_IDS.gate,
      350,
      22,
      2
    )
  ];
  return {
    pageId,
    nodes,
    edges,
    layouts,
    selectedShapeIds: [GROK_TRUSTED_ML_RELEASE_IDS.agent]
  };
}
function createGrokTrustedMlReleaseRecords(store, fixture, options = {}) {
  const records = [];
  if (options.includePage) {
    records.push(
      PageRecordType.create({
        id: fixture.pageId,
        name: options.pageName ?? "Grok trusted ML release",
        index: "a2",
        meta: {}
      })
    );
  }
  const shapeCount = fixture.nodes.length + fixture.edges.length + 2;
  const indexes = indicesFrom(options.firstIndex ?? "a1", shapeCount);
  const shapes = fixture.nodes.map(
    (node, index) => createNodeRecord(store, fixture.pageId, node, indexes[index])
  );
  shapes.push(
    createHiddenControlRecord(
      store,
      fixture.pageId,
      GROK_TRUSTED_ML_RELEASE_IDS.toolbar,
      indexes[fixture.nodes.length]
    ),
    createCatalogRecord(
      store,
      fixture.pageId,
      GROK_TRUSTED_ML_RELEASE_IDS.catalog,
      indexes[fixture.nodes.length + 1]
    )
  );
  const nodeById = new Map(
    shapes.filter(
      (shape) => shape.type === AGENTS_MODELS_SHAPE_TYPE
    ).map((shape) => [shape.id, shape])
  );
  const connections = fixture.edges.map(
    (connection, index) => createConnectionRecords(
      store,
      fixture.pageId,
      connection,
      nodeById,
      indexes[fixture.nodes.length + 2 + index]
    )
  );
  return [
    ...records,
    ...shapes,
    ...connections.flatMap((connection) => connection),
    ...fixture.layouts.map((binding) => createLayoutRecord(store, binding))
  ];
}
function buildGrokTrustedMlReleasePlan(editor, options) {
  const fixture = createGrokTrustedMlReleaseFixture(options.pageId, options.point);
  const records = createGrokTrustedMlReleaseRecords(editor.store, fixture, {
    firstIndex: editor.getHighestIndexForParent(options.pageId)
  });
  const shapes = records.filter(
    (record) => record.typeName === "shape"
  );
  const bindings = records.filter(
    (record) => record.typeName === "binding"
  );
  return {
    fixture,
    shapes,
    bindings,
    shapeIds: shapes.map((shape) => shape.id),
    bindingIds: bindings.map((binding) => binding.id)
  };
}
function validateCanvasKitContributions(contributions) {
  const kitIds = /* @__PURE__ */ new Set();
  const presetIds = /* @__PURE__ */ new Set();
  const shapeTypes = /* @__PURE__ */ new Set();
  const bindingTypes = /* @__PURE__ */ new Set();
  const toolIds = /* @__PURE__ */ new Set();
  for (const contribution of contributions) {
    assertUniqueId(kitIds, contribution.kitId, "kit");
    if (contribution.presetIds.length === 0) {
      throw new Error(`Canvas kit ${contribution.kitId} has no preset IDs.`);
    }
    for (const presetId of contribution.presetIds) {
      assertUniqueId(presetIds, presetId, "preset");
    }
    for (const util of contribution.shapeUtils) {
      assertUniqueId(shapeTypes, util.type, "shape");
    }
    for (const util of contribution.bindingUtils) {
      assertUniqueId(bindingTypes, util.type, "binding");
    }
    for (const tool of contribution.tools) {
      assertUniqueId(toolIds, tool.id, "tool");
    }
  }
  return contributions;
}
function insertGrokPreset(editor, presetId, options) {
  if (presetId !== GROK_TRUSTED_ML_RELEASE_PRESET_ID) {
    throw new Error(`Unknown ${GROK_WORKFLOW_KIT_ID} preset: ${presetId}`);
  }
  if (!options || !editor.getPage(options.pageId)) {
    throw new Error(`Grok workflow insertion page ${options?.pageId} does not exist.`);
  }
  assertFinitePoint(options.point);
  if (editor.getIsReadonly()) {
    throw new Error("Cannot insert a Grok workflow into a read-only editor.");
  }
  assertEditorRegistrations(editor);
  const plan = buildGrokTrustedMlReleasePlan(editor, options);
  if (editor.getPageShapeIds(options.pageId).size + plan.shapeIds.length > editor.options.maxShapesPerPage) {
    throw new Error("The target page does not have room for the Grok workflow preset.");
  }
  for (const id of [...plan.shapeIds, ...plan.bindingIds]) {
    if (editor.store.has(id)) {
      throw new Error(`Grok workflow preset record already exists: ${id}`);
    }
  }
  const shapeById = new Map(plan.shapes.map((shape) => [shape.id, shape]));
  for (const binding of plan.bindings) {
    const fromShape = shapeById.get(binding.fromId);
    const toShape = shapeById.get(binding.toId);
    if (!fromShape || !toShape) {
      throw new Error(`Grok workflow binding ${binding.id} targets a missing shape.`);
    }
    if (!editor.canBindShapes({ fromShape, toShape, binding })) {
      throw new Error(`Grok workflow binding ${binding.id} is not supported.`);
    }
  }
  const mark = editor.markHistoryStoppingPoint("Insert trusted ML release");
  try {
    editor.run(() => {
      editor.createShapes(plan.shapes);
      editor.createBindings(plan.bindings);
      if (editor.getCurrentPageId() === options.pageId) {
        editor.setSelectedShapes(plan.fixture.selectedShapeIds);
      }
    });
    for (const id of plan.shapeIds) {
      if (!editor.getShape(id)) {
        throw new Error(`Grok workflow insertion skipped shape ${id}.`);
      }
    }
    for (const id of plan.bindingIds) {
      if (!editor.getBinding(id)) {
        throw new Error(`Grok workflow insertion skipped binding ${id}.`);
      }
    }
  } catch (error) {
    editor.bailToMark(mark);
    throw error;
  }
  editor.markHistoryStoppingPoint("Inserted trusted ML release");
  return {
    kitId: GROK_WORKFLOW_KIT_ID,
    presetId,
    shapeIds: [...plan.shapeIds],
    bindingIds: [...plan.bindingIds]
  };
}
var GROK_WORKFLOW_CANVAS_KIT_CONTRIBUTION = Object.freeze({
  kitId: GROK_WORKFLOW_KIT_ID,
  presetIds: Object.freeze([GROK_TRUSTED_ML_RELEASE_PRESET_ID]),
  shapeUtils: GROK_WORKFLOW_SHAPE_UTILS,
  bindingUtils: GROK_WORKFLOW_BINDING_UTILS,
  tools: GROK_WORKFLOW_TOOLS,
  insertPreset: insertGrokPreset
});
var CANVAS_KIT_CONTRIBUTIONS = Object.freeze([
  ...validateCanvasKitContributions([
    GROK_WORKFLOW_CANVAS_KIT_CONTRIBUTION
  ])
]);
function assertEditorRegistrations(editor) {
  for (const Util of GROK_WORKFLOW_SHAPE_UTILS) {
    try {
      editor.getShapeUtil(Util.type);
    } catch {
      throw new Error(`Missing Grok workflow shape registration: ${Util.type}`);
    }
  }
  for (const Util of GROK_WORKFLOW_BINDING_UTILS) {
    try {
      editor.getBindingUtil(Util.type);
    } catch {
      throw new Error(`Missing Grok workflow binding registration: ${Util.type}`);
    }
  }
  for (const Tool of GROK_WORKFLOW_TOOLS) {
    if (!editor.getStateDescendant(Tool.id)) {
      throw new Error(`Missing Grok workflow tool registration: ${Tool.id}`);
    }
  }
}
function assertFinitePoint(point) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new Error("Grok workflow insertion point must contain finite x and y values.");
  }
}
function assertUniqueId(ids, id, kind) {
  if (!id) throw new Error(`Canvas kit ${kind} ID must not be empty.`);
  if (ids.has(id)) throw new Error(`Duplicate Canvas kit ${kind} ID: ${id}`);
  ids.add(id);
}
function indicesFrom(first, count) {
  if (count <= 0) return [];
  return [first, ...getIndicesAbove(first, count - 1)];
}
function createNodeRecord(store, pageId, node, index) {
  return store.schema.types.shape.create({
    id: node.id,
    type: AGENTS_MODELS_SHAPE_TYPE,
    parentId: pageId,
    index,
    x: node.x,
    y: node.y,
    props: workflowNodeSizeForKind(node.kind),
    meta: { am: createAgentsModelsWorkflowMeta(node.kind, node.meta) }
  });
}
function createConnectionRecords(store, pageId, connectionSpec, nodeById, index) {
  const from = nodeById.get(connectionSpec.fromId);
  const to = nodeById.get(connectionSpec.toId);
  if (!from || !to) {
    throw new Error(`Missing Grok workflow nodes for ${connectionSpec.id}.`);
  }
  const fromRole = from.meta.am.role;
  const toRole = to.meta.am.role;
  const rule = compatibleWorkflowConnectionRule(
    fromRole,
    toRole,
    connectionSpec.fromPortId,
    connectionSpec.toPortId
  );
  if (!rule) {
    throw new Error(`Unsupported Grok workflow edge ${fromRole} \u2192 ${toRole}.`);
  }
  const connection = store.schema.types.shape.create({
    id: connectionSpec.id,
    type: WORKFLOW_CONNECTION_TYPE,
    parentId: pageId,
    index,
    x: 0,
    y: 0,
    props: {
      start: { x: from.x, y: from.y },
      end: { x: to.x, y: to.y }
    },
    meta: {}
  });
  const idStem = connectionSpec.id.slice("shape:".length);
  const start = store.schema.types.binding.create({
    id: createBindingId(`${idStem}-start`),
    type: WORKFLOW_PORT_BINDING_TYPE,
    fromId: connectionSpec.id,
    toId: from.id,
    props: { terminal: "start", portId: rule.fromPortId },
    meta: {}
  });
  const end = store.schema.types.binding.create({
    id: createBindingId(`${idStem}-end`),
    type: WORKFLOW_PORT_BINDING_TYPE,
    fromId: connectionSpec.id,
    toId: to.id,
    props: { terminal: "end", portId: rule.toPortId },
    meta: {}
  });
  return [connection, start, end];
}
function createLayoutRecord(store, layoutSpec) {
  return store.schema.types.binding.create({
    id: layoutSpec.id,
    type: WORKFLOW_LAYOUT_BINDING_TYPE,
    fromId: layoutSpec.fromId,
    toId: layoutSpec.toId,
    props: {
      axis: "x",
      gap: 0,
      order: layoutSpec.order,
      offsetX: layoutSpec.offsetX,
      offsetY: layoutSpec.offsetY
    },
    meta: {}
  });
}
function createHiddenControlRecord(store, pageId, id, index) {
  return store.schema.types.shape.create({
    id,
    type: AGENTS_MODELS_SHAPE_TYPE,
    parentId: pageId,
    index,
    x: -1e4,
    y: -1e4,
    props: { w: 1, h: 1 },
    meta: {
      am: {
        domain: "agents-models",
        role: "toolbar",
        hiddenControl: true,
        actionState: "succeeded",
        actionMessage: "Trusted ML release preset \xB7 no live service required"
      }
    }
  });
}
function createCatalogRecord(store, pageId, id, index) {
  return store.schema.types.shape.create({
    id,
    type: AGENTS_MODELS_SHAPE_TYPE,
    parentId: pageId,
    index,
    x: -1e4,
    y: -9e3,
    props: { w: 360, h: 720 },
    meta: {
      am: {
        domain: "agents-models",
        role: "catalog",
        hiddenControl: true,
        proxyOk: true,
        catalogSections: [
          {
            id: "models",
            label: "Models",
            items: [
              {
                id: "gpt-5.6-sol",
                label: "GPT 5.6 Sol",
                value: "trusted preset",
                status: "green"
              },
              {
                id: "claude-fable-5",
                label: "Claude Fable 5",
                value: "trusted preset",
                status: "green"
              }
            ]
          },
          {
            id: "agents",
            label: "Agents",
            items: [
              {
                id: "ml-llmops",
                label: "ML / LLMOps",
                value: "specialist",
                status: "green"
              },
              {
                id: "docs",
                label: "Docs",
                value: "specialist",
                status: "green"
              }
            ]
          },
          {
            id: "personas",
            label: "Personas",
            items: [
              {
                id: "evidence-editor",
                label: "Evidence editor",
                value: "source-backed evaluator",
                status: "green",
                metadata: {
                  inputsJson: '[{"name":"model_card","ioType":"file","required":true,"description":"Candidate model card"}]',
                  outputsJson: '[{"name":"evidence_receipt","ioType":"json","required":true,"description":"Compact evidence receipt"}]'
                }
              }
            ]
          },
          { id: "roles", label: "Roles", items: [] },
          {
            id: "skills",
            label: "Skills",
            items: [
              {
                id: "promptfoo-evals",
                label: "Promptfoo evals",
                value: "project-local",
                status: "green"
              }
            ]
          },
          { id: "modules", label: "Modules", items: [] }
        ]
      }
    }
  });
}
function edge(id, fromId, toId) {
  return {
    id: createShapeId4(`grok-trusted-ml-release-edge-${id}`),
    fromId,
    toId
  };
}
function layout(id, fromId, toId, offsetX, offsetY, order) {
  return {
    id: createBindingId(`grok-trusted-ml-release-layout-${id}`),
    fromId,
    toId,
    offsetX,
    offsetY,
    order
  };
}
export {
  CANVAS_KIT_CONTRIBUTIONS,
  GROK_TRUSTED_ML_RELEASE_IDS,
  GROK_TRUSTED_ML_RELEASE_PRESET_ID,
  GROK_TRUSTED_ML_RELEASE_SOURCE_CENTER,
  GROK_WORKFLOW_BINDING_TYPES,
  GROK_WORKFLOW_BINDING_UTILS,
  GROK_WORKFLOW_CANVAS_KIT_CONTRIBUTION,
  GROK_WORKFLOW_KIT_ID,
  GROK_WORKFLOW_SHAPE_TYPES,
  GROK_WORKFLOW_SHAPE_UTILS,
  GROK_WORKFLOW_TOOLS,
  GROK_WORKFLOW_TOOL_TYPES,
  buildGrokTrustedMlReleasePlan,
  createGrokTrustedMlReleaseFixture,
  createGrokTrustedMlReleaseRecords,
  validateCanvasKitContributions
};
