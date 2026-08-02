/**
 * DOM-free tests for Agents/Models canvas document script pure logic.
 * Run: node --test scripts/agents-models-canvas-script.test.mjs
 */
import assert from "node:assert/strict";
import { test, describe } from "node:test";

import {
  PRESET_IDS,
  LAYOUT,
  layoutLanes,
  catalogToNodes,
  catalogNodesToSections,
  catalogErrorNode,
  catalogContentHeight,
  availabilityColor,
  instantiatePreset,
  compileWorkflow,
  fillPresetScriptName,
  collectWorkflowGraph,
  countSpecs,
  suggestWorkflowName,
  resolveAuthToken,
  truncateCatalogLabel,
  packGrid,
  layoutLayered,
  GROK_CONFIG_TOKEN,
  makeStageCard,
  makeSubagentCard,
  formatPortFooter,
  portIdsForNode,
  truncateCardLabel,
  ensureAgentsModelsPage,
} from "./agents-models-canvas-script.mjs";

function minCenterDistance(a, b) {
  const ax = a.x + a.w / 2;
  const ay = a.y + a.h / 2;
  const bx = b.x + b.w / 2;
  const by = b.y + b.h / 2;
  return Math.hypot(ax - bx, ay - by);
}

function minEdgeGap(a, b) {
  // gap between bounding boxes (0 if overlapping)
  const dx = Math.max(0, Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w)));
  const dy = Math.max(0, Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h)));
  if (dx === 0 && dy === 0) {
    // overlapping or touching — use negative of center distance shortfall
    const cx = Math.abs(a.x + a.w / 2 - (b.x + b.w / 2));
    const cy = Math.abs(a.y + a.h / 2 - (b.y + b.h / 2));
    const minSepX = (a.w + b.w) / 2;
    const minSepY = (a.h + b.h) / 2;
    if (cx < minSepX && cy < minSepY) return -1;
    return 0;
  }
  return Math.hypot(dx, dy);
}

describe("layoutLanes", () => {
  test("returns STAGE/SUBAGENT/CATALOG frames and 9 toolbar buttons", () => {
    const layout = layoutLanes([]);
    assert.equal(layout.stageLane.w > 0, true);
    assert.equal(layout.subagentLane.w > 0, true);
    assert.equal(layout.catalog.w > 0, true);
    assert.equal(layout.buttons.length, PRESET_IDS.length + 2);
    const kinds = layout.buttons.map((b) => b.kind);
    assert.equal(kinds.filter((k) => k === "preset").length, 7);
    assert.ok(kinds.includes("apply"));
    assert.ok(kinds.includes("play"));
    for (const id of PRESET_IDS) {
      assert.ok(layout.buttons.some((b) => b.presetId === id));
    }
  });

  test("lane geometry leaves breathing room for native toolbar, lanes, and catalog", () => {
    const layout = layoutLanes([]);
    assert.equal(layout.toolbar.x, 80);
    assert.equal(layout.toolbar.w, 240);
    assert.equal(layout.stageLane.x, 370);
    assert.equal(layout.stageLane.w, 1040);
    assert.equal(layout.subagentLane.x, 370);
    assert.equal(layout.subagentLane.w, 1040);
    assert.ok(layout.subagentLane.h >= 800);
    assert.equal(layout.catalog.x, 1450);
    assert.equal(layout.catalog.w, 420);
    const gap = layout.subagentLane.y - (layout.stageLane.y + layout.stageLane.h);
    assert.ok(gap >= 60, `lane vertical gap ${gap} < 60`);
    // horizontal breathing room between toolbar and stage
    assert.ok(layout.stageLane.x >= layout.toolbar.x + layout.toolbar.w + 40);
    // catalog to the right of stage
    assert.ok(layout.catalog.x >= layout.stageLane.x + layout.stageLane.w + 40);
  });

  test("layoutLanes is deterministic", () => {
    const a = layoutLanes([]);
    const b = layoutLanes([]);
    assert.deepEqual(a, b);
  });
});

describe("Agents/Models page isolation", () => {
  test("resolves an existing page without creating another", () => {
    const existing = { id: "page:existing", name: "Agents/Models" };
    let createCount = 0;
    const result = ensureAgentsModelsPage({
      getPages: () => [existing],
      createPage: () => {
        createCount += 1;
      },
    });
    assert.equal(result.page, existing);
    assert.equal(result.created, false);
    assert.equal(createCount, 0);
  });

  test("creates the dedicated page when missing", () => {
    const pages = [{ id: "page:other", name: "Other" }];
    const editor = {
      getPages: () => pages,
      createPage: (page) => pages.push(page),
      getPage: (id) => pages.find((page) => page.id === id),
    };
    const result = ensureAgentsModelsPage(editor);
    assert.equal(result.page.name, "Agents/Models");
    assert.equal(result.created, true);
  });
});

describe("availabilityColor / catalogToNodes", () => {
  test("colors status dots by liveMatch and proxy health", () => {
    assert.equal(availabilityColor({ liveMatch: true }, { ok: true }), "green");
    assert.equal(availabilityColor({ liveMatch: false }, { ok: true }), "orange");
    assert.equal(availabilityColor({ liveMatch: true }, { ok: false }), "red");
    assert.equal(availabilityColor({}, null), "grey");
  });

  test("maps model slots with availability coloring and agents/personas", () => {
    const catalog = {
      models: {
        proxy: { ok: true, error: null },
        slots: [
          { id: "builder", name: "Builder", model: "gpt-x", liveMatch: true },
          { id: "fast", name: "Fast", model: "missing-model", liveMatch: false },
        ],
      },
      agents: [{ id: "implementer", modelRef: "builder" }],
      personas: [{ id: "browser-hands", modelRef: "gpt-x" }],
      roles: [{ id: "reviewer", name: "reviewer" }],
    };
    const nodes = catalogToNodes(catalog);
    const slots = nodes.filter((n) => n.kind === "model-slot");
    assert.equal(slots.length, 2);
    assert.equal(slots[0].statusDot.color, "green");
    assert.equal(slots[1].statusDot.color, "orange");
    assert.match(slots[0].text, /Builder/);
    assert.match(slots[0].text, /gpt-x/);
    // single-line row (no newline)
    assert.equal(slots[0].text.includes("\n"), false);
    assert.equal(slots[0].h, LAYOUT.catalogRowH);
    assert.ok(nodes.some((n) => n.kind === "agent" && n.text.includes("implementer")));
    assert.ok(nodes.some((n) => n.kind === "persona" && n.text.includes("browser-hands")));
    assert.ok(nodes.some((n) => n.kind === "role" && n.text.includes("reviewer")));
  });

  test("error-path node for missing catalog / catalogErrorNode", () => {
    const nodes = catalogToNodes(null);
    assert.equal(nodes.length, 1);
    assert.equal(nodes[0].kind, "error");
    assert.match(nodes[0].text, /CATALOG ERROR/);

    const err = catalogErrorNode("fetch_failed", "connect ECONNREFUSED");
    assert.equal(err.kind, "error");
    assert.equal(err.meta.am.code, "fetch_failed");
    assert.match(err.text, /ECONNREFUSED/);
    assert.equal(err.color, "red");
  });

  test("proxy-down forces red status dots", () => {
    const catalog = {
      models: {
        proxy: { ok: false, error: "down" },
        slots: [{ id: "builder", model: "x", liveMatch: true }],
      },
      agents: [],
      personas: [],
      roles: [],
    };
    const nodes = catalogToNodes(catalog);
    const slot = nodes.find((n) => n.kind === "model-slot");
    assert.equal(slot.statusDot.color, "red");
  });

  test("catalog sections MODELS/AGENTS/PERSONAS/ROLES present; max 8 rows + +N more", () => {
    const catalog = {
      models: {
        proxy: { ok: true },
        slots: Array.from({ length: 20 }, (_, i) => ({
          id: `m${i}`,
          name: `ModelSlot${i}-with-a-very-long-name`,
          model: `provider-model-id-${i}-extra`,
          liveMatch: i % 2 === 0,
        })),
      },
      agents: Array.from({ length: 22 }, (_, i) => ({
        id: `agent-${i}-extra-long-identifier`,
        modelRef: `m${i % 5}`,
      })),
      personas: Array.from({ length: 7 }, (_, i) => ({
        id: `persona-${i}`,
        modelRef: "m0",
      })),
      roles: Array.from({ length: 9 }, (_, i) => ({
        id: `role-${i}`,
        name: `role-name-${i}`,
      })),
    };
    const nodes = catalogToNodes(catalog);
    const headers = nodes
      .filter((n) => n.kind === "header")
      .map((n) => n.text);
    assert.deepEqual(headers, ["MODELS", "AGENTS", "PERSONAS", "ROLES"]);

    const modelSlots = nodes.filter((n) => n.kind === "model-slot");
    assert.equal(modelSlots.length, 8);
    const agents = nodes.filter((n) => n.kind === "agent");
    assert.equal(agents.length, 8);
    const personas = nodes.filter((n) => n.kind === "persona");
    assert.equal(personas.length, 7); // all fit under 8
    const roles = nodes.filter((n) => n.kind === "role");
    assert.equal(roles.length, 8);

    const mores = nodes.filter((n) => n.kind === "catalog-more");
    assert.ok(mores.some((m) => m.meta.am.section === "models" && m.text === "+12 more"));
    assert.ok(mores.some((m) => m.meta.am.section === "agents" && m.text === "+14 more"));
    assert.ok(mores.some((m) => m.meta.am.section === "roles" && m.text === "+1 more"));
    assert.equal(
      mores.some((m) => m.meta.am.section === "personas"),
      false,
    );

    // rows truncated <= 39 chars (38 + ellipsis)
    for (const n of nodes) {
      if (["model-slot", "agent", "persona", "role"].includes(n.kind)) {
        assert.ok(n.text.length <= 39, `row text too long: ${n.text.length} "${n.text}"`);
        assert.equal(n.w, LAYOUT.catalogRowW);
        assert.equal(n.h, LAYOUT.catalogRowH);
      }
    }

    // content height uses visible rows only (not full 20+22+...)
    const h = catalogContentHeight(nodes);
    // 4 sections × (header + ≤8 rows + optional more) is compact vs uncapped catalog
    const uncappedMin =
      (20 + 22 + 7 + 9) * (LAYOUT.catalogRowH + LAYOUT.catalogRowGap);
    assert.ok(h < uncappedMin, `catalog height ${h} not compacted vs ${uncappedMin}`);
    assert.ok(h > 200, `catalog height ${h} too small`);
    assert.ok(h < 1400, `catalog height ${h} unexpectedly huge`);
  });

  test("truncateCatalogLabel caps at 38 + ellipsis", () => {
    const long = "abcdefghijklmnopqrstuvwxyz0123456789EXTRA";
    const t = truncateCatalogLabel(long, 38);
    assert.equal(t.length, 39);
    assert.ok(t.endsWith("…"));
    assert.equal(truncateCatalogLabel("short"), "short");
  });

  test("catalog rows collapse into one bounded native catalog payload", () => {
    const nodes = catalogToNodes({
      models: {
        proxy: { ok: true },
        slots: [{ id: "builder", name: "Builder", model: "model-x", liveMatch: true }],
      },
      agents: [{ id: "implementer", modelRef: "builder" }],
      personas: [{ id: "reviewer", modelRef: "builder" }],
      roles: [{ id: "review", name: "Review" }],
    });
    const sections = catalogNodesToSections(nodes);
    assert.deepEqual(
      sections.map((section) => section.id),
      ["models", "agents", "personas", "roles"],
    );
    assert.deepEqual(sections[0].items[0], {
      id: "builder",
      label: "Builder",
      value: "model-x",
      status: "green",
    });
    assert.equal(sections[1].items[0].label, "implementer");
    assert.equal(sections[2].items[0].label, "reviewer");
    assert.equal(sections[3].items[0].label, "Review");
  });
});

describe("instantiatePreset — all 7 presets", () => {
  const EXPECTED = {
    single: { stages: 1, subagents: 1, arrows: 1, dashedSubs: 0 },
    fanout: { stages: 1, subagents: 3, arrows: 3, dashedSubs: 1 },
    reduce: { stages: 1, subagents: 2, arrows: 2, dashedSubs: 0 },
    loop: { stages: 1, subagents: 1, arrows: 2, dashedSubs: 0 },
    dag: { stages: 3, subagents: 3, arrows: 5, dashedSubs: 0 },
    dynamic: { stages: 2, subagents: 1, arrows: 4, dashedSubs: 0 },
    // mesh: 9 workers + +N more; fan-out/in + 3 peer review edges
    mesh: { stages: 2, subagents: 10, arrows: 23, dashedSubs: 1 },
  };

  for (const id of PRESET_IDS) {
    test(`instantiatePreset(${id}) counts`, () => {
      const result = instantiatePreset({ id, stageType: id === "fanout" ? "foreach" : id });
      const counts = countSpecs(result);
      const exp = EXPECTED[id];
      assert.equal(counts.stages, exp.stages, `${id} stages`);
      assert.equal(counts.subagents, exp.subagents, `${id} subagents`);
      assert.equal(counts.arrows, exp.arrows, `${id} arrows`);
      assert.equal(counts.dashedSubs, exp.dashedSubs, `${id} dashed`);
      // meta carries preset id + stage type
      for (const s of result.shapes) {
        assert.equal(s.meta.am.presetId, id);
        assert.ok(s.meta.am.stageType || s.meta.am.role === "subagent");
      }
      assert.equal(result.graph.unmodified, true);
      assert.equal(result.graph.presetId, id);
    });
  }

  test("fanout/mesh include dashed +N more placeholder", () => {
    const fan = instantiatePreset("fanout");
    assert.ok(fan.shapes.some((s) => s.text === "+N more" && s.dash === "dashed"));
    const mesh = instantiatePreset("mesh");
    assert.ok(mesh.shapes.some((s) => s.text === "+N more" && s.dash === "dashed"));
  });

  test("fanout workers form one parallel row inside the SUBAGENT lane", () => {
    const fan = instantiatePreset("fanout");
    const workers = fan.shapes.filter((shape) => shape.kind === "subagent");
    assert.equal(workers.length, 3);
    assert.equal(new Set(workers.map((shape) => shape.y)).size, 1);
    const ordered = [...workers].sort((a, b) => a.x - b.x);
    for (let index = 1; index < ordered.length; index += 1) {
      assert.ok(
        ordered[index].x - (ordered[index - 1].x + ordered[index - 1].w) >=
          LAYOUT.rowGap,
      );
    }
  });

  test("stage nodes carry monospace semantics subtitle lines", () => {
    const single = instantiatePreset("single");
    const stage = single.shapes.find((s) => s.kind === "stage");
    assert.match(stage.text, /task/i);
    const fan = instantiatePreset("fanout");
    assert.match(fan.shapes.find((s) => s.kind === "stage").text, /foreach/i);
  });

  test("node min sizes support native editable card controls", () => {
    for (const id of PRESET_IDS) {
      const { shapes } = instantiatePreset(id);
      for (const s of shapes) {
        if (s.kind === "stage") {
          assert.ok(s.w >= 160 && s.h >= 64, `${id} stage size`);
        }
        if (s.kind === "subagent") {
          if (s.text === "+N more") {
            assert.ok(s.w >= 180, `${id} +N more width ${s.w}`);
            assert.ok(s.h >= 100);
            assert.equal(s.text.includes("\n"), false);
          } else {
            assert.ok(s.w >= 120 && s.h >= 120, `${id} subagent size`);
          }
        }
      }
    }
  });

  test("layout determinism: same input -> same positions", () => {
    for (const id of PRESET_IDS) {
      const a = instantiatePreset(id);
      const b = instantiatePreset(id);
      const pick = (shapes) =>
        shapes
          .filter((s) => s.kind === "stage" || s.kind === "subagent")
          .map((s) => ({ id: s.id, x: s.x, y: s.y, w: s.w, h: s.h, text: s.text }));
      assert.deepEqual(pick(a.shapes), pick(b.shapes));
      assert.deepEqual(
        a.arrows.map((ar) => ({
          from: ar.fromNode ?? ar.from,
          to: ar.toNode ?? ar.to,
          kind: ar.kind,
        })),
        b.arrows.map((ar) => ({
          from: ar.fromNode ?? ar.from,
          to: ar.toNode ?? ar.to,
          kind: ar.kind,
        })),
      );
    }
  });

  test("no two subagent nodes within 40px for every preset incl mesh", () => {
    for (const id of PRESET_IDS) {
      const { shapes } = instantiatePreset(id);
      // only card roots (kind=subagent), not header/status/port parts
      const subs = shapes.filter((s) => s.kind === "subagent");
      for (let i = 0; i < subs.length; i++) {
        for (let j = i + 1; j < subs.length; j++) {
          const a = subs[i];
          const b = subs[j];
          const dx = Math.max(0, Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w)));
          const dy = Math.max(0, Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h)));
          if (dx === 0 && dy === 0) {
            assert.fail(`${id}: overlapping subagents ${a.text} and ${b.text}`);
          }
          if (dx === 0) {
            assert.ok(dy >= 40, `${id}: vertical gap ${dy} between ${a.text}/${b.text}`);
          }
          if (dy === 0) {
            assert.ok(dx >= 40, `${id}: horizontal gap ${dx} between ${a.text}/${b.text}`);
          }
        }
      }
    }
  });

  test("mesh workers form compact grid not a pile", () => {
    const { shapes } = instantiatePreset("mesh");
    const workers = shapes.filter(
      (s) => s.kind === "subagent" && /^w\d+$/.test(s.text),
    );
    assert.equal(workers.length, 9);
    const xs = new Set(workers.map((w) => w.x));
    const ys = new Set(workers.map((w) => w.y));
    // ceil(sqrt(9)) = 3 columns, 3 rows
    assert.equal(xs.size, 3);
    assert.equal(ys.size, 3);
  });
});

describe("layout helpers", () => {
  test("packGrid uses ceil(sqrt(n)) columns", () => {
    const items = Array.from({ length: 9 }, (_, i) => ({
      id: `w${i}`,
      w: 120,
      h: 120,
    }));
    const pack = packGrid(items, 0, 0, 40);
    const cols = new Set([...pack.values()].map((p) => p.x));
    assert.equal(cols.size, 3);
  });

  test("layoutLayered places depths left-to-right", () => {
    const pos = layoutLayered(
      [
        { items: [{ id: "a", w: 160, h: 64 }] },
        { items: [{ id: "b", w: 120, h: 120 }] },
      ],
      { x: 100, y: 50 },
      { colGap: 80 },
    );
    assert.equal(pos.get("a").x, 100);
    assert.ok(pos.get("b").x >= 100 + 160 + 80);
  });
});

describe("compileWorkflow", () => {
  test("fills meta.name from graph when reusing preset script verbatim", () => {
    const presetScript = `// unverified-skeleton
let meta = #{
    name: "{{name}}",
    description: "Single-agent workflow skeleton",
};

let result = agent("Do the requested work.", #{ label: "worker" });
result
`;
    const out = compileWorkflow({
      name: "my-canvas-flow",
      presetId: "single",
      stageType: "single",
      unmodified: true,
      presetScript,
    });
    assert.match(out, /name:\s*"my-canvas-flow"/);
    assert.doesNotMatch(out, /\{\{name\}\}/);
    // verbatim body preserved
    assert.match(out, /let result = agent\(/);
    assert.match(out, /Do the requested work/);
  });

  test("fillPresetScriptName replaces placeholder", () => {
    const s = fillPresetScriptName('name: "{{name}}"', "abc");
    assert.match(s, /name:\s*"abc"/);
  });

  test("modified graph emits skeleton with meta.name (not verbatim)", () => {
    const presetScript = `let meta = #{ name: "{{name}}" };\nlet keep_me = 1;\n`;
    const out = compileWorkflow({
      name: "edited-flow",
      presetId: "single",
      stageType: "single",
      unmodified: false,
      presetScript,
    });
    assert.match(out, /name:\s*"edited-flow"/);
    assert.doesNotMatch(out, /keep_me/);
    assert.match(out, /unverified-skeleton/);
    assert.match(out, /agent\(/);
  });

  test("foreach/mesh stage types compile parallel skeletons", () => {
    const fan = compileWorkflow({
      name: "f",
      stageType: "foreach",
      unmodified: false,
    });
    assert.match(fan, /parallel\(/);
    const mesh = compileWorkflow({
      name: "m",
      stageType: "mesh",
      unmodified: false,
    });
    assert.match(mesh, /parallel\(/);
  });

  test("suggestWorkflowName", () => {
    assert.equal(suggestWorkflowName("dag"), "canvas-dag");
  });
});

describe("collectWorkflowGraph", () => {
  test("collects stages/subagents and unmodified flag", () => {
    const { shapes } = instantiatePreset("reduce");
    const graph = collectWorkflowGraph(
      shapes.map((s) => ({ ...s, meta: s.meta })),
      { presetScript: "let meta = #{ name: \"{{name}}\" };" },
    );
    assert.equal(graph.presetId, "reduce");
    assert.equal(graph.stages.length, 1);
    assert.equal(graph.subagents.length, 2);
    assert.equal(graph.unmodified, true);
    const script = compileWorkflow({
      ...graph,
      presetScript: `let meta = #{ name: "{{name}}" };\nreduce_body\n`,
      unmodified: true,
    });
    assert.match(script, /name:\s*"canvas-reduce"/);
    assert.match(script, /reduce_body/);
  });
});

describe("resolveAuthToken", () => {
  test("prefers global override over placeholder constant", () => {
    const token = resolveAuthToken({
      __AM_GROK_CONFIG_TOKEN__: "gk_test_token_override_xx",
    });
    assert.equal(token, "gk_test_token_override_xx");
    // placeholder constant itself is returned only when no override and still placeholder
    assert.equal(typeof GROK_CONFIG_TOKEN, "string");
  });
});


describe("makeStageCard / makeSubagentCard", () => {
  test("stage card ids are prefixed and include ports + footer", () => {
    const parts = makeStageCard({
      id: "am-stage-foreach",
      x: 10,
      y: 20,
      label: "FOREACH",
      semantics: "foreach",
      modelSlot: "builder",
      persona: "browser-hands",
      inCount: 1,
      outCount: 3,
    });
    const ids = parts.map((p) => p.id);
    assert.ok(ids.includes("am-stage-foreach-card"));
    assert.ok(ids.includes("am-stage-foreach-header"));
    assert.ok(ids.includes("am-stage-foreach-body"));
    assert.ok(ids.includes("am-stage-foreach-footer"));
    assert.ok(ids.includes("am-stage-foreach-port-in"));
    assert.ok(ids.includes("am-stage-foreach-port-out"));
    const footer = parts.find((p) => p.kind === "stage-footer");
    assert.equal(footer.text, "1 IN · 3 OUT");
    assert.equal(footer.inCount, 1);
    assert.equal(footer.outCount, 3);
    const header = parts.find((p) => p.kind === "stage-header");
    assert.match(header.text, /FOREACH/);
    assert.match(header.text, /FOREACH/);
    const root = parts.find((p) => p.kind === "stage");
    assert.match(root.text, /foreach/);
    const ports = portIdsForNode("am-stage-foreach");
    assert.equal(ports.in, "am-stage-foreach-port-in");
    assert.equal(ports.out, "am-stage-foreach-port-out");
  });

  test("subagent card has name, caps role subtitle, status dot, ports", () => {
    const parts = makeSubagentCard({
      id: "am-sub-w0",
      x: 0,
      y: 0,
      name: "worker",
      roleLabel: "worker",
      status: "available",
    });
    assert.ok(parts.some((p) => p.id === "am-sub-w0-card" && p.kind === "subagent"));
    const header = parts.find((p) => p.kind === "subagent-header");
    assert.match(header.text, /worker/);
    assert.match(header.text, /WORKER/);
    const status = parts.find((p) => p.kind === "subagent-status");
    assert.equal(status.color, "green");
    assert.equal(status.w, 6);
    assert.ok(parts.some((p) => p.id === "am-sub-w0-port-in"));
    assert.ok(parts.some((p) => p.id === "am-sub-w0-port-out"));
  });

  test("fanout stage footer shows N OUT from actual edges (3 workers)", () => {
    const fan = instantiatePreset("fanout");
    const stageCard = fan.shapes.find((s) => s.kind === "stage");
    assert.ok(stageCard);
    const nodeId = stageCard.meta.am.nodeId;
    const footer = fan.shapes.find(
      (s) => s.kind === "stage-footer" && s.meta.am.nodeId === nodeId,
    );
    assert.equal(footer.text, formatPortFooter(0, 3));
    assert.equal(footer.outCount, 3);
    for (const a of fan.arrows) {
      assert.match(a.from, /-port-out$/);
      assert.match(a.to, /-port-in$/);
      assert.ok(a.fromNode);
      assert.ok(a.toNode);
    }
    assert.ok(fan.shapes.some((s) => s.id.endsWith("-port-in")));
    assert.ok(fan.shapes.some((s) => s.id.endsWith("-port-out")));
    assert.equal(fan.shapes.filter((s) => s.kind === "subagent").length, 3);
  });

  test("formatPortFooter / truncateCardLabel helpers", () => {
    assert.equal(formatPortFooter(1, 1), "1 IN · 1 OUT");
    assert.equal(truncateCardLabel("abcdefghij", 5), "abcd…");
    assert.equal(truncateCardLabel("short", 22), "short");
  });
});
