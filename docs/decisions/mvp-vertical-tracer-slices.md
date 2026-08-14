# MVP Tracer slices: prompt/seed brainstorming → model selection → concurrent runs → label-ready generations

Date: 2026-08-09
Status: draft — architectural integration brief
Branch: `codex/stitch-uiux-provider` (massive dirty worktree)
Authority: read-only. No implementation edits in this file.

## Intent (what "within hours" must prove)

A user can move from a vague generation goal to **hundreds of label-ready outputs** in one continuous workbench session:

1. Brainstorm prompts / seeds / variations on the canvas.
2. Select multiple models (OpenRouter, local compatible endpoint, Amp, built-in) per variation.
3. Run them concurrently.
4. Collect and stage outputs for human labeling.

This is a **vertical tracer**, not a general workflow rewrite. We cut everything that does not directly accelerate the above loop.

## What already exists and can be reused

| Asset | How it helps | Gaps for MVP |
| --- | --- | --- |
| `client/workflow/workflowRuntime.ts` | Runs DAG layers in parallel, per-node status, run store | Only single model per `llm` node; no prompt-seed fan-out; no label staging |
| `client/workflow/WorkflowOverlay.tsx` | Model/provider picker, OpenRouter / compatible API integration | UI tied to one node at a time; no batch model assignment |
| `client/workflow/runStore.ts` | IndexedDB persistence of runs per workflowId | No export / staging view for labeling |
| `client/workflow/workflowCanvas.ts` + `shared/workflow.ts` | Native workflow nodes (`input`, `prompt-template`, `llm`, `output`, `rich-output`, `mlflow-*`) | Missing `seed-set`, `model-pool`, `label-staging` node kinds |
| `scripts/workflow-llm-bridge.mjs` | `/workflow/llm` server-side inference endpoint | No batching; no cost/slot budget pressure |
| `client/agents-models/AgentsModelsShape.tsx` + `scripts/agrok-config-service.mjs` | Native Grok configurator, catalog, presets, compile-to-Rhai | Out of scope for this MVP; must not be touched |
| `client/stitch/*`, `scripts/stitch-service.mjs` | UI/UX generation provider | Out of scope unless user explicitly routes UI/UX artifacts |
| `client/mlInternEvalLab.ts` + `scripts/ml-intern-eval-lab.mjs` | Canvas-bound ML-Intern eval lab | Restricted action grant; useful reference for bounded context |

## Non-goals (ruthless cuts)

- No new custom shape family unless a native workflow node kind cannot express the concept.
- No changes to Agents/Models Grok domain, Rhai compilation, or `scripts/grok-config-service.mjs`.
- No Stitch/DESIGN.md/HTML-mockup changes unless strictly needed for label staging.
- No new persistent backend beyond existing IndexedDB run store and local bridge.
- No general-purpose distributed executor, queue, or worker pool.
- No cross-process resume, budget renegotiation, or marketplace model pricing.
- No canvas-authored prompt templates as a new DSL; keep Mustache-style `{input}` only.

## Vertical tracer slices (dependency order)

### Slice 1 — Seed node: prompt + seed fan-out on the canvas

**Goal:** User writes one prompt and N seeds/variations; canvas materializes a runnable fan-out.

**Scope:**
- Add a native workflow node kind `seed-set`.
- `seed-set` stores `promptTemplate`, `seeds[]`, and `variables[]`.
- On "Expand", the node emits one `prompt-template` child per seed (native tldraw mutation, undoable).
- Each child replaces `{seed}` and any `{var}` from the seed-set config.
- Keep the expanded graph native and editable.

**Files to own:**
- `shared/workflow.ts` — add `seed-set` to `WORKFLOW_NODE_KINDS`, export `buildSeedSetSpec`, `expandSeedSet`.
- `client/workflow/workflowCanvas.ts` — `isWorkflowNode`, `installSeedSet`, `expandSeedSetToPrompts`.
- `client/workflow/WorkflowOverlay.tsx` — palette button + inspector fields for seed-set.

**Non-goals:**
- No CSV import, no external dataset binding, no RAG.
- No auto-generated seeds from an LLM in this slice.

**Acceptance:**
- `shared/workflow.test.ts` (or new `shared/seedSet.test.ts`) proves expansion yields one node per seed, correct `{seed}` substitution, and valid edges.
- Vitest UI test: creating a seed-set, entering 3 seeds, clicking expand produces 3 prompt-template nodes connected to the same downstream LLM.

**Dependency gate:** None. Can start immediately.

---

### Slice 2 — Model pool node: select multiple models for one prompt

**Goal:** One node declares a pool of models; runtime fans out inference across the pool.

**Scope:**
- Add a native workflow node kind `model-pool`.
- `model-pool` stores `models[]`, each with `{provider, model, baseUrl?, alias?}`.
- A `model-pool` has one input port and N output ports (one per model).
- When connected downstream from a `prompt-template`, each model output carries the rendered prompt + model config.
- Reuse existing provider keys/credentials from `WorkflowOverlay`/`openRouter`/`compatibleProvider`.

**Files to own:**
- `shared/workflow.ts` — add `model-pool` kind, validation, execution-layer fan-out.
- `client/workflow/workflowCanvas.ts` — create/render `model-pool`, map model refs to shapes.
- `client/workflow/WorkflowOverlay.tsx` — model-pool inspector: add/remove models, pick from cached OpenRouter / compatible / built-in lists.
- `client/workflow/workflowRuntime.ts` — when executing a `model-pool` layer, fan out `streamLlmNode` calls per model and aggregate outputs.

**Non-goals:**
- No dynamic model discovery beyond what the existing pickers already do.
- No cost estimation or quota enforcement.
- No fallback/retry between models.

**Acceptance:**
- Unit test: `getExecutionLayers` treats a `model-pool` as a single layer whose outputs spawn parallel children.
- Runtime test: a workflow with 1 prompt-template → 1 model-pool (2 models) → 1 output produces 2 output nodes populated concurrently.
- Bridge test: `workflow-llm-bridge.test.mjs` receives two concurrent `/workflow/llm` calls with distinct `model` values.

**Dependency gate:** Slice 1 is optional but recommended; model-pool can also attach to a static `prompt-template`.

---

### Slice 3 — Concurrent runner with budget and abort

**Goal:** Run hundreds of generations without melting the bridge or the UI.

**Scope:**
- Cap concurrent in-flight LLM calls per workflow run (default 8, configurable via `model-pool`/`workflow` meta).
- Add a run-level `AbortController` and per-node cancellation.
- Stream outputs to `rich-output` / `output` nodes and to `runStore` incrementally.
- Surface a compact status overlay: queued/running/done/failed counts.

**Files to own:**
- `client/workflow/workflowRuntime.ts` — concurrency semaphore, status updates, incremental persistence.
- `client/workflow/runStore.ts` — optional `appendWorkflowRunNodeResult` for streaming partial results.
- `client/workflow/WorkflowOverlay.tsx` — run status badge, cancel button.

**Non-goals:**
- No persistent queue across reloads; if the tab closes, the run is lost.
- No rate-limit negotiation with providers.
- No automatic retries.

**Acceptance:**
- Unit test: semaphore allows at most N concurrent calls and queues the rest.
- Stress test: 50 generations complete (or fail gracefully) with no UI lockup and run store contains 50 records.
- Cancel test: abort mid-run marks unfinished nodes `cancelled` and closes SSE readers.

**Dependency gate:** Slice 2.

---

### Slice 4 — Label staging shelf: collect outputs into a reviewable grid

**Goal:** After a run, user sees all outputs in one compact shelf and can mark labels / send to an external labeler.

**Scope:**
- Add a native workflow node kind `label-staging`.
- `label-staging` has one input port per model/seed dimension.
- On run completion it collects incoming `output`/`rich-output` values into a compact grid stored in node meta.
- Render the grid inside the native shape with: generation text, provider/model badge, status, copy/export actions.
- Export to JSONL/CSV for external labeling tools.

**Files to own:**
- `shared/workflow.ts` — add `label-staging` kind, `collectLabelStaging`.
- `client/workflow/workflowCanvas.ts` — create/render `label-staging`, collect upstream results by tracing edges.
- `client/workflow/WorkflowOverlay.tsx` — export button.
- `client/workflow/runStore.ts` — helper to materialize a staging snapshot from run history.

**Non-goals:**
- No inline human labeling UX beyond simple status/mark tags.
- No persistence of labels back to canvas metadata (out of MVP).
- No integration with a specific labeling SaaS.

**Acceptance:**
- Unit test: `collectLabelStaging` produces one row per (seed × model) combination.
- UI test: after a 3-seed × 2-model run, the staging node displays 6 rows.
- Export test: JSONL output contains `seed`, `model`, `provider`, `output`, `runId` for every row.

**Dependency gate:** Slices 2 and 3.

---

### Slice 5 — One-click "Eval Lab" recipe: seed-set → model-pool → label-staging

**Goal:** User opens ML pack and, with one click, gets the full MVP tracer graph.

**Scope:**
- Add a workflow template function `buildEvalLabMvpSpec()` returning:
  `input` → `seed-set` → `prompt-template` → `model-pool` → `llm` → `rich-output` → `label-staging`.
- Add a palette button in the ML workflow profile.
- Pre-fill the model-pool with 2–3 sensible defaults (e.g., one built-in, one OpenRouter if key present).

**Files to own:**
- `shared/workflow.ts` — `buildEvalLabMvpSpec`.
- `client/workflow/workflowCanvas.ts` — `installEvalLabMvp`.
- `client/workflow/WorkflowOverlay.tsx` — palette button.

**Non-goals:**
- No auto-run on creation; user must click Play.
- No wizard UI; the graph is the template.

**Acceptance:**
- Unit test: installed graph has expected node kinds and edges.
- UI test: button creates the graph and selects the seed-set.
- End-to-end smoke: fill seeds, choose two compatible models, run, staging node shows results.

**Dependency gate:** Slices 1–4.

## File ownership boundaries for parallel implementers

| Implementer | Primary files | Must not touch |
| --- | --- | --- |
| **A — Shared model / DAG** | `shared/workflow.ts`, `shared/workflow.test.ts` | `client/agents-models/*`, `scripts/grok-config-service.mjs`, `scripts/stitch-service.mjs` |
| **B — Canvas node runtime** | `client/workflow/workflowCanvas.ts`, `client/workflow/workflowRuntime.ts` | `client/agents-models/*`, `worker/*`, `client/agent/*` |
| **C — Overlay / inspector** | `client/workflow/WorkflowOverlay.tsx`, `client/workflow/openRouter.ts`, `client/workflow/compatibleProvider.ts` | `client/workbench/*` chrome, `client/stitch/*` |
| **D — Run persistence + staging** | `client/workflow/runStore.ts`, label-staging rendering in `workflowCanvas.ts`, export helpers | `client/agents-models/*`, bridge supervisor |
| **E — End-to-end smoke / integration** | `scripts/workflow-llm-bridge.test.mjs`, vitest workflow tests, README update | No source edits except test fixtures |

## Acceptance test matrix

| ID | Test | Gate |
| --- | --- | --- |
| T1 | `seed-set` expansion yields N editable prompt-template nodes | Slice 1 |
| T2 | Model-pool with 2 models fans out 2 parallel LLM calls | Slice 2 |
| T3 | Concurrency cap respected; 50-gen run completes or cancels cleanly | Slice 3 |
| T4 | Label-staging node shows seed × model matrix and exports JSONL | Slice 4 |
| T5 | One-click ML recipe installs runnable end-to-end graph | Slice 5 |
| T6 | Existing `node --test` + `vitest run` still pass (baseline) | All slices |
| T7 | `git diff --stat` shows no changes under `client/agents-models/`, `scripts/grok-config-service.*`, `scripts/stitch-service.*` | All slices |

## Preservation rules for the dirty worktree

1. Do not modify `client/agents-models/AgentsModelsShape.tsx`, `scripts/agents-models-canvas-script.mjs`, or `scripts/grok-config-service.mjs`.
2. Do not modify `client/stitch/*`, `scripts/stitch-service.mjs`, or design-system HTML mockup files.
3. Do not modify `amp/plugins/tldraw-offline-workbench.ts` or `.agents/skills/*`.
4. Prefer additive changes in `shared/workflow.ts` and `client/workflow/*`.
5. Any new node kind must be opt-in through the workflow template/palette; do not change default behavior of existing `llm`/`output` nodes.
6. Keep credentials/sessionStorage handling identical to existing `WorkflowOverlay` patterns.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Native workflow nodes already carry heavy meta; new kinds may break existing documents | Add kinds to `WORKFLOW_NODE_KINDS` only; old documents ignore unknown kinds |
| Concurrent SSE calls exhaust browser connection pool | Cap at 6–8 in-flight; queue rest |
| OpenRouter / compatible provider errors in one branch kill whole run | Wrap each branch in `Promise.allSettled`; fail the branch, not the run |
| Run store grows unbounded | IndexedDB is per-workflow; add a `limit` helper but do not auto-prune in MVP |
| Dirty worktree conflicts | Each implementer owns disjoint files; shared `shared/workflow.ts` changes are additive |

## Next actions for parent agent

1. Assign Slice 1 to implementer A (shared model) in parallel with implementer C (overlay prep).
2. Assign Slice 2 after A delivers `model-pool` spec.
3. Assign Slice 3 after Slice 2 merges.
4. Assign Slice 4 after Slice 3 merges.
5. Assign Slice 5 (recipe) last; it depends only on the prior node kinds existing.
6. Fixer/Integrator runs T1–T7 before any commit recommendation.
