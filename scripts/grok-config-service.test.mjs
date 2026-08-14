import assert from "node:assert/strict";
import {
  chmod,
  mkdtemp,
  mkdir,
  readFile,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  buildGrokCatalog,
  configRevision,
  createGrokConfigServer,
  createGrokConfigService,
  listModelSlotsFromConfig,
  listWorkflowPresets,
  parseAgentMarkdown,
  parseSkillMarkdown,
  parseSimpleToml,
  parseWorkflowModule,
  parseWorkflowRhai,
  rewriteAgentModel,
  rewriteModelSlotLines,
  rewritePersonaModel,
  rewriteSubagentModelAssignments,
} from "./grok-config-service.mjs";

const TEST_TOKEN = "gk_test_token_for_unit_tests_only";

test("loopback server exposes browser preflight without weakening route auth", async () => {
  const server = createGrokConfigServer({
    port: 0,
    authToken: TEST_TOKEN,
  });
  const address = await server.listen();
  const listening = server.server.address();
  assert.ok(listening && typeof listening === "object");
  const baseUrl = `http://${address.host}:${listening.port}`;

  try {
    const preflight = await fetch(`${baseUrl}/api/grok/catalog`, {
      method: "OPTIONS",
      headers: {
        Origin: "tldraw://desktop",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "authorization",
      },
    });
    assert.equal(preflight.status, 204);
    assert.equal(
      preflight.headers.get("access-control-allow-origin"),
      "tldraw://desktop",
    );
    assert.match(
      preflight.headers.get("access-control-allow-headers") ?? "",
      /Authorization/,
    );

    const unauthorized = await fetch(`${baseUrl}/api/grok/health`, {
      headers: { Origin: "tldraw://desktop" },
    });
    assert.equal(unauthorized.status, 401);
    assert.equal(
      unauthorized.headers.get("access-control-allow-origin"),
      "tldraw://desktop",
    );
  } finally {
    await server.close();
  }
});

test("parses model slots from config.toml and rewrites only model lines", () => {
  const source = `# keep me
[ui]
theme = "grokday"
hooks = true

[model.builder]
model = "old-model"
name = "Builder"
base_url = "https://localhost:8317/v1"
description = "coding"

[model."gpt-5.6-sol"]
model = "gpt-5.6-sol"
env_key = "CLIPROXY_API_KEY"

[mcp_servers.openrouter]
url = "https://example.test"
enabled = true
`;
  const slots = listModelSlotsFromConfig(source);
  assert.equal(slots.length, 2);
  assert.equal(slots[0].id, "builder");
  assert.equal(slots[0].model, "old-model");
  assert.equal(slots[1].id, "gpt-5.6-sol");

  const rewritten = rewriteModelSlotLines(
    source,
    new Map([["builder", "new-model"]]),
  );
  assert.match(rewritten, /\[model\.builder\][\s\S]*model = "new-model"/);
  assert.match(rewritten, /\[model\."gpt-5\.6-sol"\][\s\S]*model = "gpt-5\.6-sol"/);
  assert.match(rewritten, /\[ui\][\s\S]*theme = "grokday"/);
  assert.match(rewritten, /\[mcp_servers\.openrouter\][\s\S]*enabled = true/);
  assert.equal(
    rewritten.includes('hooks = true'),
    true,
  );
  // Unrelated bytes around other sections preserved.
  assert.equal(
    rewritten.split("\n").find((l) => l.startsWith("theme")),
    'theme = "grokday"',
  );
});

test("parses agent frontmatter and persona contracts", () => {
  const agent = parseAgentMarkdown(
    `---
name: implementer
description: Focused feature implementer.
model: claude-sonnet-5
prompt_mode: full
---

# Implementer

Do the work.
`,
    "implementer.md",
  );
  assert.equal(agent.id, "implementer");
  assert.equal(agent.modelRef, "claude-sonnet-5");
  assert.equal(agent.heading, "Implementer");
  assert.match(agent.description, /Focused feature/);

  const rewritten = rewriteAgentModel(
    `---
name: implementer
description: Focused feature implementer.
model: claude-sonnet-5
---

Body
`,
    "gpt-5.6-sol",
  );
  assert.match(rewritten, /model: gpt-5\.6-sol/);
  assert.match(rewritten, /name: implementer/);

  const personaSource = `description = "Browser hands persona"
model = "hands-slot"

[[inputs]]
name = "brief"
io_type = "text"
required = true
description = "Task brief."

[[outputs]]
name = "evidence"
io_type = "text"
required = true
description = "Evidence."
`;
  const rewrittenPersona = rewritePersonaModel(personaSource, "scout");
  assert.match(rewrittenPersona, /model = "scout"/);
  assert.match(rewrittenPersona, /\[\[inputs\]\]/);
});

test("parses compact project skill and bounded workflow module contracts", () => {
  const skill = parseSkillMarkdown(
    `---
name: diagram-review
description: Reviews a bounded architecture diagram.
---

# Diagram review
`,
    "diagram-review",
  );
  assert.deepEqual(skill, {
    id: "diagram-review",
    name: "diagram-review",
    description: "Reviews a bounded architecture diagram.",
    sourceRef: ".agents/skills/diagram-review/SKILL.md",
  });

  const module = parseWorkflowModule(
    JSON.stringify({
      id: "review-loop",
      version: "1.0.0",
      entry: "draft",
      exit: "review",
      params: ["brief"],
      nodes: [
        { id: "draft", role: "stage", meta: { am: { label: "{{brief}}" } } },
        { id: "review", role: "stage" },
      ],
      edges: [{ from: "draft", to: "review" }],
    }),
    "review-loop.json",
  );
  assert.equal(module.id, "review-loop");
  assert.equal(module.version, "1.0.0");
  assert.equal(module.nodes.length, 2);
  assert.deepEqual(module.edges, [{ from: "draft", to: "review" }]);
  assert.equal(module.sourceRef, ".grok/workflow-modules/review-loop.json");
});

test("simple TOML parser handles quoted table keys and underscores", () => {
  const { root } = parseSimpleToml(`
[model."gpt-5.6-sol"]
model = "gpt-5.6-sol"
context_window = 1_050_000
top_p = 0.95
`);
  assert.equal(root.model["gpt-5.6-sol"].model, "gpt-5.6-sol");
  assert.equal(root.model["gpt-5.6-sol"].context_window, 1_050_000);
  assert.equal(root.model["gpt-5.6-sol"].top_p, 0.95);
});

test("rewrites only requested subagent model assignments", () => {
  const source = `[ui]
theme = "keep-me"

[subagents.models]
implementer = "old" # preserve comment
oracle = "oracle-slot"

[mcp_servers.local]
enabled = true
`;
  const rewritten = rewriteSubagentModelAssignments(
    source,
    new Map([
      ["implementer", "builder"],
      ["new-agent", "scout"],
    ]),
  );
  assert.match(rewritten, /implementer = "builder" # preserve comment/);
  assert.match(rewritten, /new-agent = "scout"/);
  assert.match(rewritten, /oracle = "oracle-slot"/);
  assert.match(rewritten, /\[ui\]\ntheme = "keep-me"/);
  assert.match(rewritten, /\[mcp_servers\.local\]\nenabled = true/);
  assert.equal(configRevision(source).length, 64);
  assert.notEqual(configRevision(source), configRevision(rewritten));
});

test("parses workflow meta blocks and lists presets", () => {
  const parsed = parseWorkflowRhai(
    `let meta = #{
    name: "deep-research",
    description: "Research a query with bounded parallelism",
    phases: [
        #{ title: "Plan", detail: "Choose questions" },
    ],
};

// body
let x = agent("go", #{ label: "a" });
`,
    "deep-research.rhai",
  );
  assert.equal(parsed.id, "deep-research");
  assert.equal(parsed.name, "deep-research");
  assert.match(parsed.description, /Research a query/);
  assert.deepEqual(parsed.meta.phases, ["Plan"]);

  const noMeta = parseWorkflowRhai(
    `// A first-line description for the workflow
let x = 1;
`,
    "plain.rhai",
  );
  assert.equal(noMeta.name, "plain");
  assert.match(noMeta.description, /first-line description/);

  const presets = listWorkflowPresets();
  assert.equal(presets.length, 7);
  assert.deepEqual(
    presets.map((p) => p.id).sort(),
    ["dag", "dynamic", "fanout", "loop", "mesh", "reduce", "single"].sort(),
  );
  for (const preset of presets) {
    assert.ok(preset.script.includes("unverified-skeleton"));
    assert.ok(preset.script.includes('name: "{{name}}"'));
    assert.ok(typeof preset.stageType === "string");
  }
});

test("service endpoints use injected paths and never touch real ~/.grok", async () => {
  const root = await mkdtemp(join(tmpdir(), "grok-config-service-"));
  const grokHome = join(root, ".grok");
  const agentsDir = join(grokHome, "agents");
  const personasDir = join(grokHome, "personas");
  const workflowsDir = join(grokHome, "workflows");
  const rolesDir = join(grokHome, "bundled", "roles");
  const projectRoot = join(root, "project");
  const projectWorkflowsDir = join(projectRoot, ".grok", "workflows");
  const projectSkillsDir = join(projectRoot, ".agents", "skills");
  const projectModulesDir = join(projectRoot, ".grok", "workflow-modules");
  await mkdir(agentsDir, { recursive: true });
  await mkdir(personasDir, { recursive: true });
  await mkdir(workflowsDir, { recursive: true });
  await mkdir(rolesDir, { recursive: true });
  await mkdir(projectWorkflowsDir, { recursive: true });
  await mkdir(join(projectSkillsDir, "diagram-review"), { recursive: true });
  await mkdir(projectModulesDir, { recursive: true });

  const configPath = join(grokHome, "config.toml");
  await writeFile(
    configPath,
    `[ui]
theme = "keep-me"
yolo = false

[models]
default = "builder"
web_search = "scout"

[model.builder]
model = "kimi-k2.7-code"
name = "Builder"
description = "coding workhorse"
base_url = "https://localhost:8317/v1"
env_key = "CLIPROXY_API_KEY"

[model.scout]
model = "grok-4.5"
name = "Scout"

[model.oracle]
model = "claude-fable-5"
name = "Oracle"

[subagents.models]
implementer = "claude-sonnet-5"
oracle = "claude-fable-5"

[mcp_servers.openrouter]
url = "https://example.test"
enabled = true
`,
    "utf8",
  );
  await chmod(configPath, 0o640);

  await writeFile(
    join(agentsDir, "implementer.md"),
    `---
name: implementer
description: Autonomous code implementer.
model: claude-sonnet-5
prompt_mode: full
---

# Implementer

Implement the change.
`,
    "utf8",
  );
  await writeFile(
    join(agentsDir, "oracle.md"),
    `---
name: oracle
description: Judgment agent.
model: missing-model-ref
---

Read only.
`,
    "utf8",
  );

  await writeFile(
    join(personasDir, "browser-hands.toml"),
    `description = "Browser hands persona"
model = "scout"
instructions = """
Inspect only the bounded browser evidence.
Return a compact verdict.
"""

[[inputs]]
name = "hands_brief"
io_type = "text"
required = true
description = "Task"

[[outputs]]
name = "evidence"
io_type = "text"
required = true
description = "Verdict"
`,
    "utf8",
  );
  await writeFile(
    join(personasDir, "ml-llmops.toml"),
    `description = "ML persona without model pin"

[[inputs]]
name = "task_brief"
io_type = "text"
required = true
description = "Question"
`,
    "utf8",
  );

  await writeFile(
    join(workflowsDir, "deep-research.rhai"),
    `// Research helper
let meta = #{
    name: "deep-research",
    description: "Bounded parallel research workflow",
    phases: [
        #{ title: "Plan", detail: "Questions" },
        #{ title: "Report", detail: "Write" },
    ],
};

let result = agent("research", #{ label: "planner" });
result
`,
    "utf8",
  );
  await writeFile(
    join(projectWorkflowsDir, "local-ship.rhai"),
    `// Project-scoped ship checklist
let x = agent("ship it", #{ label: "ship" });
x
`,
    "utf8",
  );
  await writeFile(
    join(projectSkillsDir, "diagram-review", "SKILL.md"),
    `---
name: diagram-review
description: Reviews a bounded architecture diagram.
---

# Diagram review
`,
    "utf8",
  );
  await writeFile(
    join(projectModulesDir, "review-loop.json"),
    JSON.stringify(
      {
        id: "review-loop",
        version: "1.0.0",
        description: "Draft then review.",
        entry: "draft",
        exit: "review",
        params: ["brief"],
        nodes: [
          { id: "draft", role: "stage", meta: { am: { label: "{{brief}}" } } },
          { id: "review", role: "stage" },
        ],
        edges: [{ from: "draft", to: "review" }],
      },
      null,
      2,
    ),
    "utf8",
  );

  await writeFile(
    join(rolesDir, "plan.toml"),
    `# Plan role
description = "Software architect that designs implementation plans"
default_capability_mode = "read-only"
reasoning_effort = "high"
model = "builder"
`,
    "utf8",
  );
  await writeFile(
    join(rolesDir, "explore.toml"),
    `description = "Fast read-only exploration"
`,
    "utf8",
  );

  let proxyCalls = 0;
  const liveModels = [
    { id: "kimi-k2.7-code" },
    { id: "grok-4.5" },
    { id: "claude-fable-5" },
    { id: "claude-sonnet-5" },
    { id: "gpt-5.6-sol" },
  ];
  const fetchLiveModels = async () => {
    proxyCalls += 1;
    return {
      ok: true,
      url: "https://localhost:8317/v1/models",
      error: null,
      models: liveModels,
    };
  };

  const service = createGrokConfigService({
    grokHome,
    configPath,
    agentsDir,
    personasDir,
    workflowsDir,
    projectWorkflowsDir,
    projectSkillsDir,
    projectModulesDir,
    rolesDir,
    projectCwd: projectRoot,
    authToken: TEST_TOKEN,
    env: {
      GROK_CONFIG_TOKEN: TEST_TOKEN,
      CLIPROXY_API_KEY: "test-key-must-not-leak",
    },
    fetchLiveModels,
    now: () => Date.parse("2026-08-02T12:00:00.000Z"),
  });

  const unauthorized = await invoke(service, "http://bridge/api/grok/models", {
    method: "GET",
    headers: {},
  });
  assert.equal(unauthorized.status, 401);

  const request = (url, init = {}) =>
    invoke(service, url, {
      method: init.method ?? "GET",
      headers: {
        Authorization: `Bearer ${TEST_TOKEN}`,
        ...(init.headers ?? {}),
      },
      body: init.body,
    });

  const models = await request("http://bridge/api/grok/models");
  assert.equal(models.status, 200);
  assert.equal(models.body.proxy.ok, true);
  assert.equal(models.body.slots.length, 3);
  assert.equal(models.body.defaults.default, "builder");
  assert.equal(
    models.body.slots.find((s) => s.id === "builder").liveMatch,
    true,
  );
  assert.doesNotMatch(JSON.stringify(models.body), /test-key-must-not-leak/);

  const agents = await request("http://bridge/api/grok/agents");
  assert.equal(agents.status, 200);
  assert.equal(agents.body.agents.length, 2);
  assert.equal(agents.body.agents[0].id, "implementer");
  assert.equal(agents.body.agents[0].modelRef, "claude-sonnet-5");

  const personas = await request("http://bridge/api/grok/personas");
  assert.equal(personas.status, 200);
  assert.equal(personas.body.personas.length, 2);
  const browserHands = personas.body.personas.find(
    (p) => p.id === "browser-hands",
  );
  assert.equal(browserHands.modelRef, "scout");
  assert.equal(browserHands.inputs[0].name, "hands_brief");
  assert.equal(browserHands.outputs[0].name, "evidence");
  assert.equal("instructions" in browserHands, false);

  const skills = await request("http://bridge/api/grok/skills");
  assert.equal(skills.status, 200);
  assert.deepEqual(
    skills.body.skills.map((skill) => skill.id),
    ["diagram-review"],
  );
  assert.equal(
    skills.body.skills[0].sourceRef,
    ".agents/skills/diagram-review/SKILL.md",
  );
  assert.equal("body" in skills.body.skills[0], false);

  const modules = await request("http://bridge/api/grok/modules");
  assert.equal(modules.status, 200);
  assert.equal(modules.body.modules[0].id, "review-loop");
  assert.equal(modules.body.modules[0].version, "1.0.0");
  assert.equal("nodes" in modules.body.modules[0], false);

  const moduleDetail = await request(
    "http://bridge/api/grok/modules/review-loop?version=1.0.0",
  );
  assert.equal(moduleDetail.status, 200);
  assert.equal(moduleDetail.body.module.nodes.length, 2);
  assert.deepEqual(moduleDetail.body.module.edges, [
    { from: "draft", to: "review" },
  ]);

  const personaDetail = await request(
    "http://bridge/api/grok/personas/browser-hands",
  );
  assert.equal(personaDetail.status, 200);
  assert.equal(personaDetail.body.persona.id, "browser-hands");
  assert.match(
    personaDetail.body.persona.instructions,
    /bounded browser evidence/,
  );

  const assignments = await request("http://bridge/api/grok/assignments");
  assert.equal(assignments.status, 200);
  const implementer = assignments.body.agents.find(
    (a) => a.id === "implementer",
  );
  assert.equal(implementer.authoritativeRef, "claude-sonnet-5");
  assert.equal(implementer.resolvable, true);
  const ml = assignments.body.personas.find((p) => p.id === "ml-llmops");
  assert.equal(ml.resolvable, false);
  assert.equal(ml.unresolved, "missing_model_ref");

  const configBeforeSync = await readFile(configPath, "utf8");
  const snapshot = await request("http://bridge/api/grok/config-snapshot");
  assert.equal(snapshot.status, 200);
  assert.match(snapshot.body.revision, /^[a-f0-9]{64}$/);
  assert.equal(snapshot.body.writable.defaultModel, "builder");
  assert.equal(
    snapshot.body.writable.subagentModels.implementer,
    "claude-sonnet-5",
  );
  assert.doesNotMatch(JSON.stringify(snapshot.body), /env_key|test-key/i);

  const syncPayload = {
    expectedRevision: snapshot.body.revision,
    requestId: "canvas-sync-test",
    assignments: [{ agentId: "implementer", modelRef: "builder" }],
  };
  const syncPreview = await request("http://bridge/api/grok/config-sync", {
    method: "POST",
    body: JSON.stringify({ ...syncPayload, dryRun: true }),
  });
  assert.equal(syncPreview.status, 200);
  assert.equal(syncPreview.body.changeCount, 1);
  assert.equal(syncPreview.body.applies, "next-session");
  assert.equal(await readFile(configPath, "utf8"), configBeforeSync);

  const syncCommit = await request("http://bridge/api/grok/config-sync", {
    method: "POST",
    body: JSON.stringify(syncPayload),
  });
  assert.equal(syncCommit.status, 200);
  assert.equal(syncCommit.body.changeCount, 1);
  assert.equal(syncCommit.body.diff[0].agentId, "implementer");
  const syncedConfig = await readFile(configPath, "utf8");
  assert.match(syncedConfig, /\[subagents\.models\][\s\S]*implementer = "builder"/);
  assert.match(syncedConfig, /\[ui\][\s\S]*theme = "keep-me"/);
  assert.match(
    syncedConfig,
    /\[mcp_servers\.openrouter\][\s\S]*enabled = true/,
  );
  assert.equal((await stat(configPath)).mode & 0o777, 0o640);

  const staleSync = await request("http://bridge/api/grok/config-sync", {
    method: "POST",
    body: JSON.stringify(syncPayload),
  });
  assert.equal(staleSync.status, 409);
  assert.equal(staleSync.body.error, "revision_conflict");

  const workflows = await request("http://bridge/api/grok/workflows");
  assert.equal(workflows.status, 200);
  assert.equal(workflows.body.workflows.length, 2);
  const deep = workflows.body.workflows.find((w) => w.id === "deep-research");
  assert.equal(deep.scope, "user");
  assert.equal(deep.name, "deep-research");
  assert.match(deep.description, /Research helper/);
  assert.ok(typeof deep.size === "number" && deep.size > 0);
  assert.ok(typeof deep.mtime === "string");
  const localShip = workflows.body.workflows.find((w) => w.id === "local-ship");
  assert.equal(localShip.scope, "project");
  assert.match(localShip.description, /Project-scoped ship/);

  const workflowDetail = await request(
    "http://bridge/api/grok/workflows/deep-research",
  );
  assert.equal(workflowDetail.status, 200);
  assert.equal(workflowDetail.body.name, "deep-research");
  assert.equal(workflowDetail.body.scope, "user");
  assert.match(workflowDetail.body.script, /let meta = #\{/);
  assert.equal(workflowDetail.body.meta.name, "deep-research");
  assert.equal(
    workflowDetail.body.meta.description,
    "Bounded parallel research workflow",
  );
  assert.deepEqual(workflowDetail.body.meta.phases, ["Plan", "Report"]);

  const projectDetail = await request(
    "http://bridge/api/grok/workflows/local-ship",
  );
  assert.equal(projectDetail.status, 200);
  assert.equal(projectDetail.body.scope, "project");

  const missingWorkflow = await request(
    "http://bridge/api/grok/workflows/nope",
  );
  assert.equal(missingWorkflow.status, 404);
  assert.equal(missingWorkflow.body.error, "workflow_not_found");

  const badName = await request(
    "http://bridge/api/grok/workflows/bad%20name",
  );
  assert.equal(badName.status, 400);
  assert.equal(badName.body.error, "invalid_workflow_name");

  const saveConflict = await request("http://bridge/api/grok/workflows/save", {
    method: "POST",
    body: JSON.stringify({
      name: "deep-research",
      script: "let x = 1;\n",
      scope: "user",
    }),
  });
  assert.equal(saveConflict.status, 409);
  assert.equal(saveConflict.body.error, "workflow_exists");

  const saveNew = await request("http://bridge/api/grok/workflows/save", {
    method: "POST",
    body: JSON.stringify({
      name: "canvas-draft",
      script: `// from canvas\nlet meta = #{ name: "canvas-draft" };\nlet r = agent("hi", #{ label: "a" });\nr\n`,
      scope: "user",
    }),
  });
  assert.equal(saveNew.status, 200);
  assert.equal(saveNew.body.receipt.operation, "workflow-save");
  assert.equal(saveNew.body.receipt.name, "canvas-draft");
  assert.ok(saveNew.body.receipt.path.endsWith("canvas-draft.rhai"));
  assert.ok(saveNew.body.receipt.bytes > 0);
  assert.equal(saveNew.body.receipt.overwritten, false);
  const savedText = await readFile(saveNew.body.receipt.path, "utf8");
  assert.match(savedText, /from canvas/);

  const saveOverwrite = await request("http://bridge/api/grok/workflows/save", {
    method: "POST",
    body: JSON.stringify({
      name: "canvas-draft",
      script: "// overwritten\n",
      scope: "user",
      overwrite: true,
    }),
  });
  assert.equal(saveOverwrite.status, 200);
  assert.equal(saveOverwrite.body.receipt.overwritten, true);
  assert.match(saveOverwrite.body.receipt.backupPath, /\.bak-canvas-/);
  const backup = await readFile(saveOverwrite.body.receipt.backupPath, "utf8");
  assert.match(backup, /from canvas/);
  const after = await readFile(saveOverwrite.body.receipt.path, "utf8");
  assert.equal(after, "// overwritten\n");

  const saveProject = await request("http://bridge/api/grok/workflows/save", {
    method: "POST",
    body: JSON.stringify({
      name: "proj-only",
      script: "// project workflow\n",
      scope: "project",
    }),
  });
  assert.equal(saveProject.status, 200);
  assert.equal(saveProject.body.receipt.scope, "project");
  assert.ok(
    saveProject.body.receipt.path.includes(join(".grok", "workflows")),
  );

  const saveBadName = await request("http://bridge/api/grok/workflows/save", {
    method: "POST",
    body: JSON.stringify({
      name: "../escape",
      script: "x",
      scope: "user",
    }),
  });
  assert.equal(saveBadName.status, 400);
  assert.equal(saveBadName.body.error, "invalid_workflow_name");

  const presets = await request("http://bridge/api/grok/workflow-presets");
  assert.equal(presets.status, 200);
  assert.equal(presets.body.presets.length, 7);
  const fanout = presets.body.presets.find((p) => p.id === "fanout");
  assert.equal(fanout.stageType, "foreach");
  assert.match(fanout.script, /parallel\(/);
  assert.match(fanout.script, /unverified-skeleton/);

  const roles = await request("http://bridge/api/grok/roles");
  assert.equal(roles.status, 200);
  assert.equal(roles.body.roles.length, 2);
  const plan = roles.body.roles.find((r) => r.id === "plan");
  assert.equal(plan.name, "plan");
  assert.match(plan.description, /Software architect/);
  assert.equal(plan.model, "builder");
  const explore = roles.body.roles.find((r) => r.id === "explore");
  assert.equal(explore.model, null);

  const badApply = await request("http://bridge/api/grok/apply", {
    method: "POST",
    body: JSON.stringify({
      changes: [
        { target: "model-slot", id: "nope", model: "gpt-5.6-sol" },
        { target: "model-slot", id: "builder", model: "not-live" },
      ],
    }),
  });
  assert.equal(badApply.status, 422);
  assert.equal(badApply.body.error, "apply_validation_failed");
  assert.equal(badApply.body.details.errors.length, 2);

  const apply = await request("http://bridge/api/grok/apply", {
    method: "POST",
    body: JSON.stringify({
      changes: [
        { target: "model-slot", id: "builder", model: "gpt-5.6-sol" },
        { target: "agent", id: "implementer", model: "gpt-5.6-sol" },
        { target: "persona", id: "browser-hands", model: "gpt-5.6-sol" },
      ],
    }),
  });
  assert.equal(apply.status, 200);
  assert.equal(apply.body.receipt.operation, "apply");
  assert.equal(apply.body.diff.length, 3);
  assert.match(apply.body.receipt.backupPath, /\.bak-canvas-/);

  const nextConfig = await readFile(configPath, "utf8");
  assert.match(nextConfig, /\[model\.builder\][\s\S]*model = "gpt-5\.6-sol"/);
  assert.match(nextConfig, /\[ui\][\s\S]*theme = "keep-me"/);
  assert.match(nextConfig, /\[mcp_servers\.openrouter\][\s\S]*enabled = true/);
  assert.doesNotMatch(nextConfig, /model = "kimi-k2\.7-code"/);

  const nextAgent = await readFile(join(agentsDir, "implementer.md"), "utf8");
  assert.match(nextAgent, /model: gpt-5\.6-sol/);

  const nextPersona = await readFile(
    join(personasDir, "browser-hands.toml"),
    "utf8",
  );
  assert.match(nextPersona, /model = "gpt-5\.6-sol"/);
  assert.match(nextPersona, /\[\[inputs\]\]/);

  // Backup exists and preserves previous builder model.
  const applyBackup = await readFile(apply.body.receipt.backupPath, "utf8");
  assert.match(applyBackup, /model = "kimi-k2\.7-code"/);

  assert.ok(proxyCalls >= 2);

  const catalog = await buildGrokCatalog({
    grokHome,
    configPath,
    agentsDir,
    personasDir,
    workflowsDir,
    projectWorkflowsDir,
    projectSkillsDir,
    projectModulesDir,
    rolesDir,
    env: { CLIPROXY_API_KEY: "x" },
    fetchLiveModels,
    now: () => Date.parse("2026-08-02T12:00:00.000Z"),
  });
  assert.equal(catalog.service, "grok-config");
  assert.equal(catalog.agents.length, 2);
  assert.equal(catalog.skills.length, 1);
  assert.equal(catalog.modules.length, 1);
  assert.equal(catalog.models.slots.find((s) => s.id === "builder").model, "gpt-5.6-sol");
  assert.ok(catalog.workflows.some((w) => w.id === "deep-research"));
  assert.ok(catalog.workflows.some((w) => w.id === "canvas-draft"));
  assert.deepEqual(
    catalog.presets.slice().sort(),
    ["dag", "dynamic", "fanout", "loop", "mesh", "reduce", "single"].sort(),
  );
  assert.equal(catalog.roles.length, 2);

  const catalogRoute = await request("http://bridge/api/grok/catalog");
  assert.equal(catalogRoute.status, 200);
  assert.ok(Array.isArray(catalogRoute.body.workflows));
  assert.ok(Array.isArray(catalogRoute.body.presets));
  assert.ok(Array.isArray(catalogRoute.body.roles));
  assert.ok(Array.isArray(catalogRoute.body.skills));
  assert.ok(Array.isArray(catalogRoute.body.modules));
});

test("graceful models receipt when proxy is down", async () => {
  const root = await mkdtemp(join(tmpdir(), "grok-config-proxy-down-"));
  const grokHome = join(root, ".grok");
  await mkdir(grokHome, { recursive: true });
  const configPath = join(grokHome, "config.toml");
  await writeFile(
    configPath,
    `[model.builder]
model = "kimi-k2.7-code"
`,
    "utf8",
  );

  const service = createGrokConfigService({
    grokHome,
    configPath,
    agentsDir: join(grokHome, "agents"),
    personasDir: join(grokHome, "personas"),
    workflowsDir: join(grokHome, "workflows"),
    projectWorkflowsDir: join(root, "project", ".grok", "workflows"),
    rolesDir: join(grokHome, "bundled", "roles"),
    authToken: TEST_TOKEN,
    env: { GROK_CONFIG_TOKEN: TEST_TOKEN, CLIPROXY_API_KEY: "x" },
    fetchLiveModels: async () => ({
      ok: false,
      url: "https://localhost:8317/v1/models",
      error: "connect ECONNREFUSED",
      models: [],
    }),
    now: () => 0,
  });

  const models = await invoke(service, "http://bridge/api/grok/models", {
    method: "GET",
    headers: { Authorization: `Bearer ${TEST_TOKEN}` },
  });
  assert.equal(models.status, 200);
  assert.equal(models.body.proxy.ok, false);
  assert.match(models.body.proxy.error, /ECONNREFUSED/);
  assert.equal(models.body.liveModels.length, 0);
  assert.equal(models.body.slots[0].liveMatch, false);

  const apply = await invoke(service, "http://bridge/api/grok/apply", {
    method: "POST",
    headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    body: JSON.stringify({
      changes: [{ target: "model-slot", id: "builder", model: "x" }],
    }),
  });
  assert.equal(apply.status, 502);
  assert.equal(apply.body.error, "proxy_unavailable");

  // Empty workflow/roles dirs are graceful.
  const workflows = await invoke(service, "http://bridge/api/grok/workflows", {
    method: "GET",
    headers: { Authorization: `Bearer ${TEST_TOKEN}` },
  });
  assert.equal(workflows.status, 200);
  assert.deepEqual(workflows.body.workflows, []);

  const roles = await invoke(service, "http://bridge/api/grok/roles", {
    method: "GET",
    headers: { Authorization: `Bearer ${TEST_TOKEN}` },
  });
  assert.equal(roles.status, 200);
  assert.deepEqual(roles.body.roles, []);
});

async function invoke(service, input, request) {
  const response = {
    headers: {},
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = value;
    },
  };
  let sent;
  const handled = await service(
    new URL(input),
    request,
    response,
    async () => request.body ?? "",
    (_response, status, body) => {
      sent = {
        status,
        body: body ? JSON.parse(body) : undefined,
        headers: response.headers,
      };
      return sent;
    },
  );
  assert.notEqual(handled, false);
  return sent;
}
