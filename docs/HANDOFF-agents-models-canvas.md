# HANDOFF — Agents/Models canvas domain (tldraw Offline + Grok Build)

Date: 2026-08-02
From: Hermes session (kimi-k3). To: Codex app session.
Repo: /Users/jerryjohnson/dev/canvapocalypse

## Mission (user's words, condensed)

Personal tldraw Offline (Electron desktop, NOT the web lib) workbench.
Domain pages per project document (Architecture, UI/UX, Product/PM, ML/LLM,
Agents/Models + unbound Freeform). The Agents/Models page is a visual
configurator for Grok Build CLI: browse models on the local proxy
(https://localhost:8317/v1), agents (~/.grok/agents, 22), personas
(~/.grok/personas, 7), roles (~/.grok/bundled/roles, 9), reassign models to
agents, compose agent workflows visually (pi-workflow notation), compile to
.rhai scripts (Grok workflows: ~/.grok/workflows/*.rhai, launched via
/workflow <name> in Grok), apply in batch with backups.

## Methodology ADRs (read these first)

- docs/decisions/canvas-workbench-methodology-v1.md — consolidated v1
  (supersedes domain-bound-pages-and-freeform.md and
  companion-dispatch-protocol.md). Domain registry data-driven, frozen/working
  layers (Decided/In progress frames, status proposed->accepted->superseded),
  companion dispatch through loopback bridge, page->mode binding.
- docs/decisions/canvas-workflow-notation-and-rhai.md — canonical visual
  notation: two lanes STAGE (rounded-rect control cards) / SUBAGENT (worker
  cards); six stage types single/foreach/reduce/loop/dag/dynamic mapped to
  Rhai (foreach->parallel(), agent_budget default 128/max 1024); presets
  single|fanout|reduce|loop|dag|dynamic|mesh; Play = compile+save+new run
  (runs immutable, no cross-process resume, resume not exactly-once).
- DECISIONS_LOG.md D-046 — token handling + native action requests + PLAY
  disabled.

## What exists and works

1. scripts/grok-config-service.mjs — loopback bridge 127.0.0.1:5188, bearer
   token (auto gk_… printed on stderr; ALSO stored by hand at
   ~/.grok/config-service.token). Routes: /api/grok/{health,models,agents,
   personas,assignments,roles,workflows,workflows/:name,workflow-presets,
   catalog}, POST /api/grok/apply (batch model reassignment to config.toml,
   timestamped .bak-canvas-<ISO> backup, validates vs live proxy models),
   POST /api/grok/workflows/save (atomic, backup, 512KB cap).
   CLI: node scripts/grok-config-service.mjs --dump. Tests: 6/6 pass.
   The session token is deliberately not stored in this handoff or canvas
   metadata; obtain it from the service process environment when restarting.

2. scripts/agents-models-canvas-script.mjs — tldraw Offline document script
   (contract: export default ({editor, helpers, signal})). Pure exported
   fns: instantiatePreset, compileWorkflow, catalogToNodes, layoutLanes,
   layoutLayered/packGrid, makeStageCard, makeSubagentCard, etc.
   Tests: 39/39 pass (node --test scripts/agents-models-canvas-script.test.mjs).

3. scripts/build-tldraw-document-template.mjs — emits a document script that
   creates domain pages + Freeform + Decided/In progress frames from a
   data-driven registry (REGISTRY_VERSION=1). pnpm template:build.
   Tests 10/10.

4. Live deployment: document 'autorecruit-eval-lab-ml-intern-контекст'
   (id 4P-1ZfIwAVpdWO8sVnEFG), scriptDir
   ~/Library/Application Support/tldraw/working/wd-88188-0/script/.
   main.js loads the repo runtime through an explicit `file://` dynamic import
   with a token global (backup main.js.bak-canvas-* beside it). The isolated
   `Agents/Models` page (`page:canvapocalypse-agents-models`) contains the
   native toolbar (7 presets + APPLY + PLAY), STAGE/SUBAGENT lanes, bounded
   CATALOG sections (MODELS/AGENTS/PERSONAS/ROLES), and bound workflow arrows.

## Native-card correction implemented by Codex

- `client/agents-models/AgentsModelsShape.tsx` registers one native
  `agents-models-node` type with role-specific toolbar, catalog, stage, and
  subagent renderers.
- Preset / APPLY / PLAY are real HTML buttons. They write a bounded
  `meta.am.actionRequest`; the document script consumes each request id once
  and returns a compact receipt to the toolbar.
- Stage and subagent cards expose real model/persona/agent selects and mark
  edited workflow metadata as modified.
- The document script creates or reuses an isolated `Agents/Models` page and
  materializes one custom root per logical node. Stock frames remain only as
  lane furniture; arrows remain native bound tldraw arrows.
- The catalog is one bounded, scrollable custom shape instead of dozens of
  stacked geos.
- 2026-08-02 validation: 39 Agents/Models tests, 6 bridge tests, 10 template
  tests, 10 focused vitest assertions, TypeScript, and the production Vite
  build passed. Live FANOUT inspection returned 1 stage, 3 subagents,
  3 arrows, 6 bindings, and zero canvas lints.

## Remaining boundaries / honest state

- helpers.createArrowBetweenShapes ignores requested ids (returns random id
  string; the arrow lands on the page, bound to ports — verified 12 bindings)
  — so arrow identity can't be stable; idempotent redraw must clear by
  binding endpoints (fromId/toId in binding records) instead of ids.
- PLAY is a stub note ('launch via /workflow <name> in Grok') by design (D-046).
- pnpm run test has a PRE-EXISTING failure: ERR_PNPM_IGNORED_BUILDS install
  policy hook, unrelated to our changes. node --test + vitest green
  (77 pass node, 271 vitest).

## tldraw Offline API cheatsheet (verified)

- server.json: ~/Library/Application Support/tldraw/server.json {port:7236,
  token}; re-read per shell. Header: Authorization: Bearer <token>.
- Docs: POST /api/search body 'return await api.getDocs()' (text/plain).
- Exec: POST /api/doc/:id/exec {"code":"... editor, helpers in scope ..."}
  (content-type application/json). editor.store.allRecords() works;
  editor.getPageShapes does NOT exist; use store records.
- Script workspace: POST /api/doc/:id/script-workspace -> scriptDir,
  mainJsPath; watcher applies main.js edits; error log at
  .script-workspace/error.log (was empty even when script silently no-op'd —
  don't trust it).
- Import of ES module by absolute path inside /exec works
  (await import('/abs/path.mjs?bust='+Date.now())).
- Native toolbar id is `shape:am-toolbar`; button actions are recorded as
  `meta.am.actionRequest`. Namespaced ids still use
  `createShapeId('am-...') => 'shape:am-...'`.

## Original implementation brief (now completed)

User wants proper native node cards (like the MLflow/LLM reference: card with
header icon+title+caps subtitle+status, field rows, footer, ports) — likely
as real custom shape utils / native tldraw shapes instead of composed geo
stacks. Concretely:

1. Decide: custom ShapeUtil in a document-script-loadable module vs composed
   geo cards (current). Native custom shapes give real ports, selection
   behavior, and clean rendering. The repo has client/ (React, custom shapes
   like WorkflowNodeShape.tsx, RichOutputShape.tsx) for the WEB contour — for
   tldraw Offline, custom utils must be loadable in the desktop app's script
   sandbox (verify what the sandbox allows; check .script-workspace/
   script-context.d.ts in the doc's working dir).
2. Fix click handling (see defect 1) — native button shape with real onClick
   or verified selection polling.
3. Re-render STAGE/SUBAGENT/CATALOG with native cards; keep id-prefix
   conventions (am-...) and idempotent create-if-missing.
4. Wire APPLY -> POST /api/grok/workflows/save (already implemented in script;
   keep). PLAY stays stub until Grok headless launch path is chosen.
5. Deploy the template script (build-tldraw-document-template.mjs output)
   into the doc FIRST (creates Agents/Models page), then render the domain UI
   onto that page, not the active one.
6. Keep tests green: node --test scripts/agents-models-canvas-script.test.mjs
   (35) + scripts/grok-config-service.test.mjs (6) +
   scripts/build-tldraw-document-template.test.mjs (10).

## User preferences (do not violate)

- Dark operational UI: flat, 1px borders, 2px radius, 6px colored status
  dots, 10px uppercase headers, JetBrains Mono refs, max 14px headings; NO
  gradients/shadows/pill badges/glassmorphism.
- Hates GUI click/type emulation for automation — always use the local API.
- Wants to be challenged; honesty over pride. Russian speaker.
- Parallel delegation preferred for big chunks.
