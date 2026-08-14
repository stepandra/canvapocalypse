const PAGE_NAME = "Trusted ML Release Demo";
const originalCatalog = editor.getShape("shape:am-catalog");
const catalogSections = originalCatalog?.meta?.am?.catalogSections ?? [];
const runtime = globalThis.__codexGrokRuntime;
if (!runtime) throw new Error("Grok workflow runtime unavailable");

let page = editor.getPages().find((candidate) => candidate.name === PAGE_NAME);
if (!page) {
  editor.createPage({ name: PAGE_NAME });
  page = editor.getPages().find((candidate) => candidate.name === PAGE_NAME);
}
if (!page) throw new Error("Could not create demo page");

editor.setCurrentPage(page.id);
const existing = editor.getCurrentPageShapes();
if (existing.length) editor.deleteShapes(existing.map((shape) => shape.id));
editor.markHistoryStoppingPoint("Build Trusted ML Release demo");

const richText = (text) => ({
  type: "doc",
  content: [
    text
      ? { type: "paragraph", content: [{ type: "text", text }] }
      : { type: "paragraph" },
  ],
});

const workflowNode = (id, role, label, x, y, extra = {}, size = {}) => ({
  id: `shape:demo-${id}`,
  type: "agents-models-node",
  parentId: page.id,
  x,
  y,
  props: {
    w: size.w ?? (role === "stage" ? 280 : 270),
    h: size.h ?? (role === "stage" ? 184 : 226),
  },
  meta: {
    demo: "trusted-ml-release",
    am: {
      domain: "agents-models",
      role,
      card: role,
      label,
      statusColor: "grey",
      inCount: 0,
      outCount: 0,
      unmodified: false,
      ...extra,
    },
  },
});

const phaseFrame = (id, name, x, y, w, h) => ({
  id: `shape:demo-${id}`,
  type: "frame",
  parentId: page.id,
  x,
  y,
  props: { w, h, name, color: "grey" },
  meta: {
    demo: "trusted-ml-release",
    am: { role: "furniture", kind: "phase" },
  },
});

const labelShape = (
  id,
  text,
  x,
  y,
  w,
  size = "l",
  color = "black",
) => ({
  id: `shape:demo-${id}`,
  type: "text",
  parentId: page.id,
  x,
  y,
  props: {
    richText: richText(text),
    color,
    size,
    font: "sans",
    textAlign: "start",
    autoSize: false,
    w,
    scale: 1,
  },
  meta: {
    demo: "trusted-ml-release",
    am: { role: "furniture", kind: "label" },
  },
});

const specs = [
  labelShape(
    "title",
    "TRUSTED ML RELEASE · EVIDENCE-GATED DELIVERY",
    80,
    55,
    2100,
    "xl",
  ),
  labelShape(
    "subtitle",
    "Bounded inputs → parallel ML/security evidence → native Isoflow topology → versioned implementation/review module → ADR + compact receipt",
    82,
    125,
    3050,
    "m",
    "grey",
  ),
  phaseFrame(
    "phase-evidence",
    "01 · BOUNDED INPUT + PARALLEL EVIDENCE",
    80,
    220,
    1740,
    920,
  ),
  phaseFrame(
    "phase-architecture",
    "02 · REVISION-GUARDED ARCHITECTURE",
    1870,
    220,
    1320,
    920,
  ),
  phaseFrame(
    "phase-delivery",
    "03 · VERSIONED DELIVERY + RECEIPT",
    3240,
    220,
    1690,
    920,
  ),

  workflowNode("input", "input", "Release brief", 130, 340, {
    dataValue:
      "Promote the candidate only when evaluation and security evidence are explicit; keep all context bounded.",
  }),
  workflowNode("artifact", "artifact", "Candidate model card", 130, 700, {
    artifactRef: "artifacts/model-candidate/model-card.json",
  }),
  workflowNode("discover", "stage", "FOREACH · Discover + evaluate", 470, 485, {
    stageType: "foreach",
  }),
  workflowNode("ml-agent", "agent", "ML evaluator · ml-llmops", 820, 305, {
    agentRef: "ml-llmops",
    modelRef: "gpt-5.6-sol",
  }),
  workflowNode("ml-persona", "persona", "Evaluation persona", 1160, 245, {
    persona: "autorecruit-ml-evaluator",
  }),
  workflowNode("ml-tools", "capability", "Default project tools", 1160, 545, {
    capabilityMode: "all",
    toolRefsText: "",
  }),
  workflowNode("security-agent", "agent", "Security auditor · read-only", 820, 765, {
    agentRef: "security-auditor",
    modelRef: "claude-fable-5",
  }),
  workflowNode(
    "security-tools",
    "capability",
    "Evidence inspection only",
    1160,
    825,
    {
      capabilityMode: "read-only",
      toolRefsText:
        "read-artifact, inspect-repository, verify-signature",
    },
  ),
  workflowNode("gate", "gate", "CONTAINS evidence:ready · else STOP", 1490, 485, {
    gateOperator: "contains",
    gateValue: "evidence:ready",
    gateOnFalse: "stop",
    retryCount: 1,
    timeoutSeconds: 900,
    errorRoute: "manual-review",
  }),

  workflowNode(
    "topology",
    "stage",
    "SINGLE · Design deployment topology",
    1925,
    485,
    { stageType: "single" },
  ),
  workflowNode("architect", "agent", "Architecture writer · design-doc", 2270, 355, {
    agentRef: "design-doc-writer",
    modelRef: "gpt-5.6-terra",
  }),
  workflowNode(
    "isoflow-skill",
    "skill",
    "SKILL · isoflow-studio",
    2605,
    355,
    {
      skillRef: "isoflow-studio",
      catalogRef: "isoflow-studio",
      catalogValue: ".agents/skills/isoflow-studio/SKILL.md",
    },
  ),
  workflowNode(
    "module",
    "module",
    "MODULE · evidence-review@1.0.0",
    2755,
    745,
    {
      moduleRef: "evidence-review",
      moduleVersion: "1.0.0",
      moduleParams: '{"task":"Implement guarded rollout"}',
      catalogRef: "evidence-review",
      catalogValue: "1.0.0",
    },
  ),

  workflowNode("publish", "stage", "REDUCE · Publish ADR + receipt", 3295, 485, {
    stageType: "reduce",
  }),
  workflowNode("publisher", "agent", "Decision publisher · docs", 3640, 355, {
    agentRef: "docs",
    modelRef: "gpt-5.6-terra",
  }),
  workflowNode(
    "tldraw-skill",
    "skill",
    "SKILL · tldraw-offline-workbench",
    3975,
    355,
    {
      skillRef: "tldraw-offline-workbench",
      catalogRef: "tldraw-offline-workbench",
      catalogValue: ".agents/skills/tldraw-offline-workbench/SKILL.md",
    },
  ),
  workflowNode("result", "result", "Release decision · compact receipt", 4340, 485, {
    resultLabel:
      "Signed ADR, guarded Rhai workflow, and compact mutation receipt",
  }, { w: 300, h: 226 }),

  labelShape(
    "catalog-title",
    "DRAG-OUT CATALOG · agents / personas / skills / modules",
    90,
    1230,
    1500,
    "m",
  ),
  {
    id: "shape:demo-catalog",
    type: "agents-models-node",
    parentId: page.id,
    x: 90,
    y: 1290,
    props: { w: 460, h: 760 },
    meta: {
      demo: "trusted-ml-release",
      am: {
        domain: "agents-models",
        role: "catalog",
        kind: "catalog",
        hiddenControl: false,
        proxyOk: true,
        catalogSections,
      },
    },
  },
  labelShape(
    "demo-notes",
    "WHAT THIS DEMO PROVES\n\n• Agent + Persona are first-class graph nodes\n• Capability defaults to ALL, but can be narrowed per agent\n• Skills are lightweight refs to .agents/skills\n• Gate records condition, retry, timeout, and error route\n• Input / Artifact / Result make context boundaries explicit\n• Versioned Module expands before Rhai compilation\n• Preflight rejects broken refs and topology\n• Apply materializes validated Rhai; config sync remains revision-guarded",
    650,
    1305,
    1800,
    "m",
  ),
  labelShape(
    "publish-note",
    "PUBLISH RECEIPT\nThe primary agent gets only the ADR, artifact references, and compact receipt — never every specialist prompt or the full canvas state.",
    2760,
    1360,
    1850,
    "m",
  ),
];

editor.createShapes(specs);

const ids = {
  input: "shape:demo-input",
  artifact: "shape:demo-artifact",
  discover: "shape:demo-discover",
  ml: "shape:demo-ml-agent",
  persona: "shape:demo-ml-persona",
  mlTools: "shape:demo-ml-tools",
  security: "shape:demo-security-agent",
  securityTools: "shape:demo-security-tools",
  gate: "shape:demo-gate",
  topology: "shape:demo-topology",
  architect: "shape:demo-architect",
  isoflow: "shape:demo-isoflow-skill",
  module: "shape:demo-module",
  publish: "shape:demo-publish",
  publisher: "shape:demo-publisher",
  tldraw: "shape:demo-tldraw-skill",
  result: "shape:demo-result",
};

const edges = [
  [ids.input, ids.discover, "data"],
  [ids.artifact, ids.discover, "artifact"],
  [ids.discover, ids.ml, "fan-out"],
  [ids.discover, ids.security, "fan-out"],
  [ids.ml, ids.persona, "persona"],
  [ids.ml, ids.mlTools, "capability"],
  [ids.security, ids.securityTools, "capability"],
  [ids.discover, ids.gate, "control"],
  [ids.gate, ids.topology, "guarded"],
  [ids.topology, ids.architect, "assignment"],
  [ids.architect, ids.isoflow, "skill"],
  [ids.topology, ids.module, "module"],
  [ids.module, ids.publish, "module"],
  [ids.publish, ids.publisher, "assignment"],
  [ids.publisher, ids.tldraw, "skill"],
  [ids.publish, ids.result, "result"],
];

const nodeRole = (id) => editor.getShape(id)?.meta?.am?.role;
for (const [from, to, kind] of edges) {
  const arrowId = helpers.createArrowBetweenShapes(from, to, {
    bend: 0,
    arrowheadEnd: "arrow",
    richText: richText(""),
  });
  const arrow = editor.getShape(arrowId);
  if (!arrow) continue;
  const semantic = [
    "persona",
    "capability",
    "skill",
    "data",
    "artifact",
  ].includes(kind);
  editor.updateShape({
    id: arrow.id,
    type: "arrow",
    props: {
      bend: 0,
      color: kind === "guarded" ? "blue" : "grey",
      dash: semantic ? "dashed" : "solid",
      size: "s",
      arrowheadEnd: "arrow",
    },
    meta: {
      ...(arrow.meta || {}),
      demo: "trusted-ml-release",
      am: {
        role: "arrow",
        kind,
        fromNode: from,
        toNode: to,
        fromRole: nodeRole(from),
        toRole: nodeRole(to),
      },
    },
  });
}

runtime._state.lastPresetId = "trusted-ml-release-demo";
runtime._state.lastPresetScript = null;
runtime._state.unmodified = false;
runtime._refreshWorkflowPortCounts();
editor.selectNone();
editor.zoomToFit({ animation: { duration: 0 } });

return {
  pageId: page.id,
  pageName: page.name,
  shapes: editor.getCurrentPageShapes().length,
  workflowNodes: editor
    .getCurrentPageShapes()
    .filter((shape) =>
      [
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
      ].includes(shape.meta?.am?.role),
    ).length,
  edges: editor
    .getCurrentPageShapes()
    .filter((shape) => shape.type === "arrow").length,
  catalogSections: catalogSections.length,
};
