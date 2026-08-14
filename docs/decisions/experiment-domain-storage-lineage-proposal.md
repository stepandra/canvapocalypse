# Experiment-domain storage/lineage integration proposal

Date: 2026-08-09
Status: proposal
Scope: canvas workflow node model, `client/workflow`, `client/agents-models`, `scripts/agents-models-canvas-script.mjs`

## Goal

Add a lightweight, canvas-native **experiment domain** for:

1. `prompt seed` → `variants` → `batch run` → `eval/compare` → `promote`
2. immutable-ish run records
3. a crisp external/full-output boundary

This proposal is bounded to the existing tldraw-native node model and reuse as much existing runtime/storage as possible.

## 1. Existing reusable primitives

| Primitive | Location | How to reuse |
|-----------|----------|--------------|
| Workflow node shape + custom meta | `client/workflow/WorkflowNodeShape.tsx`, `workflowCanvas.ts` | Add new `WorkflowNodeKind` values and meta fields; shape renderer auto-picks controls by kind. |
| Workflow spec / execution / validation | `shared/workflow.ts` | Add experiment-node kinds to `WORKFLOW_NODE_KINDS`; `getExecutionLayers` already supports parallel layers and cycles. |
| Run append-only store | `client/workflow/runStore.ts` (IndexedDB) | Extend `WorkflowRunRecord` with `experimentId`, `variantId`, `batchId`; add index. |
| Rich output shape | `client/workflow/RichOutputShape.tsx` | Reuse for per-variant and per-run rendered output; already supports run selection. |
| LLM streaming runtime | `client/workflow/workflowRuntime.ts` | Batch runner can call `streamLlmNode` with different configs per variant. |
| Agents/Models graph compiler | `scripts/agents-models-canvas-script.mjs` (`compileWorkflow`, `preflightWorkflow`, `expandWorkflowModules`, `instantiatePreset`) | Compile an experiment graph to a serializable batch/eval plan; preflight checks cycles/orphans. |
| Agents/Models catalog shape | `client/agents-models/AgentsModelsShape.tsx` | Can host an **Experiments** catalog section; drag rows onto canvas as module/eval refs. |
| Workbench artifact / relation schema | `shared/types/WorkbenchArtifact.ts` | Use for promoted `experiment`, `evaluation`, `model` artifacts and `validates`/`decided-by` relations. |

## 2. Proposed new shape/meta types

### 2.1 New `WorkflowNodeKind` values (in `shared/workflow.ts`)

```ts
export const WORKFLOW_NODE_KINDS = [
  // ...existing...
  'experiment',         // experiment root: seed + config + status
  'variant-set',        // container/launcher for N variants
  'variant',            // one parameterized LLM/agent node
  'evaluator',          // scoring node: judge / metric / human
  'comparison',         // side-by-side result selector
  'promotion-gate',     // human/approved promote decision
] as const
```

### 2.2 New meta fields on `WorkflowNodeMeta`

```ts
export interface WorkflowNodeMeta {
  // ...existing fields...

  /** experiment lineage */
  experimentId?: string          // stable experiment id (seed scope)
  variantId?: string             // variant id within experiment
  batchId?: string               // batch run id (one per Play)
  parentRunIds?: string[]        // upstream run ids this node depends on
  promotedRunId?: string         // for promotion-gate / comparison default

  /** eval fields */
  metric?: string                // e.g. 'latency', 'cost', 'judge-score', 'human'
  judgeModel?: string            // evaluator LLM model
  judgeInstructions?: string     // evaluator rubric
  groundTruthRef?: string        // artifact ref to expected output

  /** promotion fields */
  promotionTarget?: 'mlflow-model' | 'workbench-artifact' | 'grok-workflow'
  targetRef?: string             // e.g. model name, artifact id, workflow path
  approvedBy?: string            // 'agent' | 'human' | 'auto'
}
```

### 2.3 New run-record types

Extend `client/workflow/runStore.ts`:

```ts
export interface WorkflowRunRecord {
  id: string
  workflowId: string
  experimentId?: string
  batchId?: string
  variantId?: string
  parentRunIds?: string[]
  promotedFromRunId?: string
  // ...existing...
}

export interface ExperimentRecord {
  id: string
  seedWorkflowId: string
  experimentName: string
  createdAt: string
  status: 'draft' | 'running' | 'evaluating' | 'promoted' | 'failed'
  variantIds: string[]
  batchIds: string[]
  promotedVariantId?: string
  promotedRunId?: string
}

export interface VariantRecord {
  id: string
  experimentId: string
  label: string
  nodeConfig: Record<string, string>  // snapshot of model/provider/instructions
  createdAt: string
}
```

Add IndexedDB object stores `experiments`, `variants`, keyed by `id`, with index `experimentId` on variants/runs.

## 3. Exact integration seams

### 3.1 Canvas side (`client/workflow`)

1. **Add node kinds + icons**
   - `WorkflowTools.ts`: add `WorkflowExperimentTool`, `WorkflowVariantSetTool`, `WorkflowVariantTool`, `WorkflowEvaluatorTool`, `WorkflowComparisonTool`, `WorkflowPromotionGateTool`.
   - `WorkflowIcons.tsx`: add icons for the 6 new kinds.
   - `WorkflowNodeShape.tsx`: add `NodeControls` branches for each new kind (seed editor, variant grid, evaluator rubric, comparison run pick, promotion target select).

2. **Render and upgrade helpers**
   - `workflowCanvas.ts` `KIND_STYLE`: map new kinds to colors.
   - `buildNodeShape` already handles arbitrary `WorkflowNodeSpec`.
   - `readWorkflowSpec` / `updateWorkflowNode` are kind-agnostic.

3. **Rich output integration**
   - For `comparison` nodes, override the body to render a multi-run diff using `RichOutputShape` rendering primitives.
   - For `evaluator` nodes, render a score table in the same JSON/Markdown renderer.

### 3.2 Runtime side (`client/workflow/workflowRuntime.ts`)

Extract a reusable runner from `runWorkflow`:

```ts
export async function runWorkflowNode(
  editor: Editor,
  workflowId: string,
  nodeId: string,
  input: string,
  signal: AbortSignal,
  runId: string
): Promise<string>
```

Batch runner (new `experimentRuntime.ts`):

```ts
export async function runExperimentBatch(
  editor: Editor,
  experimentId: string,
  options?: { stopOnError?: boolean }
): Promise<{ batchId: string; runIds: string[] }>
```

- Finds `experiment` node + all `variant` children via `readWorkflowSpec` / `isWorkflowNode`.
- Generates one shared `batchId`.
- Executes variants in parallel where graph layer allows.
- Each variant run writes an immutable `WorkflowRunRecord` with `experimentId`, `batchId`, `variantId`.
- Emits one `CustomEvent('canvapocalypse:experiment-batch-saved')`.

### 3.3 Eval/compare side (new `experimentEval.ts`)

```ts
export async function evaluateBatch(
  editor: Editor,
  batchId: string,
  evaluatorNodeId: string
): Promise<EvalRunRecord[]>
```

- Loads all runs for `batchId` from `runStore`.
- For `judge` metric: calls existing LLM bridge with a scoring rubric.
- For `human` metric: creates placeholder eval records; UI lets user enter scores.
- Writes `EvalRunRecord` to IndexedDB `evals` store keyed by `(batchId, variantId, evaluatorId)`.

Comparison node:

```ts
export function buildComparisonOutput(
  runs: WorkflowRunRecord[],
  evals: EvalRunRecord[]
): OutputPresentation
```

- Returns Markdown table or JSON object for `RichOutputShape`.

### 3.4 Promotion side (new `experimentPromotion.ts`)

```ts
export interface PromotionRequest {
  experimentId: string
  runId: string
  target: 'mlflow-model' | 'workbench-artifact' | 'grok-workflow'
  targetRef: string
}

export async function promoteExperimentRun(
  editor: Editor,
  request: PromotionRequest
): Promise<{ promotionId: string; targetRef: string }>
```

- Writes an immutable `PromotionRecord`.
- For `mlflow-model`: delegates to existing `renderMlflowReference` + optional bridge call.
- For `workbench-artifact`: creates a `WorkbenchArtifact` of kind `experiment`/`evaluation`/`model` and a `validates` or `decided-by` relation.
- For `grok-workflow`: calls `compileWorkflow` from `agents-models-canvas-script.mjs` and saves `.rhai` via the local bridge.

### 3.5 Agents/Models script side (`scripts/agents-models-canvas-script.mjs`)

- Add `experiment` to `WORKFLOW_NODE_ROLES` (or keep it only in the workflow domain; decision below).
- Add pure helpers:
  - `collectExperimentGraph(editor, experimentId)` → `{ experiment, variants, evaluator, comparison, promotionGate }`
  - `compileExperimentToBatchPlan(graph)` → JSON plan consumable by the batch runner
  - `preflightExperiment(graph)` → errors/warnings analogous to `preflightWorkflow`
- Reuse `instantiatePreset` to add an **Experiment** preset that drops the full seed→variants→eval→promote skeleton.

### 3.6 Storage/indexes side (`client/workflow/runStore.ts`)

Upgrade IndexedDB to version 2:

- Add stores: `experiments`, `variants`, `evals`, `promotions`.
- Add indexes on `runs`:
  - `experimentId`
  - `batchId`
  - `variantId`
- Add indexes on `evals`:
  - `batchId`
  - `experimentId`
- Keep existing `workflowId` index.

## 4. External/full-output boundary

| Boundary | Rule |
|----------|------|
| Canvas metadata | Stores only compact refs: `experimentId`, `variantId`, `batchId`, `runId`, `targetRef`, artifact ids. No full prompt outputs, no secrets, no skill bodies. |
| `WorkflowRunRecord` | Stores full per-node `output` strings (already the contract in `runStore.ts`). This is the "full output" store. |
| `EvalRunRecord` | Stores scores and judge output; references run ids, does not duplicate LLM outputs. |
| `PromotionRecord` | Stores which run was promoted to which target; target system owns the promoted artifact. |
| Rich output shape | Renders selected run output on demand by loading from `runStore`; shape meta only holds `latestRunId`. |
| Agents/Models compiler | Emits a compact plan, not full outputs; full outputs stay in the run store. |

## 5. Likely tests

### Unit / DOM-free

1. `shared/workflow.test.ts`: new kinds validate, cycles rejected, execution layers place variants in parallel.
2. `client/workflow/runStore.test.ts` (new): IndexedDB upgrade creates new stores/indexes; run records can be queried by `experimentId`/`batchId`.
3. `experimentRuntime.test.ts` (new): batch runner executes variants, assigns shared `batchId`, writes immutable records, emits event.
4. `experimentEval.test.ts` (new): `evaluateBatch` computes judge scores; human eval creates placeholder records.
5. `experimentPromotion.test.ts` (new): promotion writes `PromotionRecord` and creates `WorkbenchArtifact`/`relation` for workbench target.

### Native surface

6. `client/workflow/WorkflowOverlay.test.ts`: toolbar exposes new experiment tools; inspector renders variant/eval/promotion controls.
7. `client/agents-models/AgentsModelsShape.test.ts`: experiment preset instantiates seed + variant set + evaluator + comparison + promotion gate.
8. `scripts/agents-models-canvas-script.test.mjs`: `collectExperimentGraph` and `compileExperimentToBatchPlan` produce valid plans; preflight catches orphan variants or missing evaluator.

### Integration

9. End-to-end: create experiment → add variants → batch run → evaluate → compare → promote → verify promoted artifact exists and run records are immutable (re-run creates new batch id).

## 6. Open decisions

1. Should `experiment` live in the workflow domain only, or also become an Agents/Models role? Recommendation: keep it in `shared/workflow.ts`/`client/workflow` first; the Agents/Models script can compile an experiment graph to a Grok batch plan without adding a new role.
2. Judge model credentials: reuse existing OpenRouter/Base URL `sessionStorage` keys; do not add new secret stores.
3. Human eval scoring: simplest first version is a `comparison` node with editable score fields that writes `EvalRunRecord` on "Submit scores".
4. Promotion to `mlflow-model`: reuse existing `renderMlflowReference` JSON and optionally call the local ML-Intern bridge; actual MLflow registration stays external.
