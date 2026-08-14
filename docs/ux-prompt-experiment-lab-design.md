# Prompt Experiment Lab — Minimal UX Design

> Goal: add a working Prompt Experiment Lab to `focused autorecruit.tldraw` for brainstorming prompt seeds, branching variants, running batches across multiple models, comparing results, and selecting hundreds of generations for labeling.  
> Constraint: **no code edits** in this pass. This document is the design to hand off for implementation.

---

## 1. What already exists (seams to reuse)

| Asset | Relevance |
|-------|-----------|
| `client/workflow/WorkflowOverlay.tsx` | Top-center workflow toolbar, node inspector, run/stop, branch duplication. |
| `client/workflow/workflowCanvas.ts` | Creates workflows on canvas (`installEditableLlmFlow`, `duplicateLlmBranch`, `createStandaloneWorkflowNode`, `WorkflowNodeMeta`). |
| `client/workflow/WorkflowNodeShape.tsx` + `WorkflowRichOutputShape.tsx` | Existing custom node cards + rich output with run selector. |
| `client/workflow/workflowRuntime.ts` | `runWorkflow` executes one graph, one model per `llm` node, parallel branches via `Promise.allSettled`. |
| `shared/workflow.ts` | `WorkflowSpec`, node kinds (`llm`, `prompt-template`, `input`, `rich-output`, etc.), execution layers. |
| `client/workflow/runStore.ts` | IndexedDB run history keyed by `workflowId`; Rich Output already reads it. |
| `client/workbench/domainPacks.ts` | Four domain packs; ML pack has `toolProfile: 'ml-workflow'` and `overlays.mlIntern: true`. |
| `client/workbench/workbenchToolProfiles.ts` | `ml-workflow` tool profile is palette-driven. |
| `scripts/tldraw-desktop-eval-lab.css` | Where most workflow styling currently lives (imported by desktop eval-lab config). |
| `client/components/MlInternEvalLabLauncher.tsx` | Existing terminal-bridge widget; shows how to add an eval-lab launcher. |
| `client/agent/mlInternCanvasTool.ts` | Terminal↔canvas bridge; ML-Intern can already invoke canvas tools. |

---

## 2. MVP scope: what the Prompt Experiment Lab is

A **domain overlay** inside the existing ML workbench that turns a single prompt-template + LLM node into a **batch matrix**:

- **Seed** = one `input` or `prompt-template` node containing the base prompt.
- **Variants** = branched copies of the seed with systematic mutations (paraphrase, add instruction, change format, etc.).
- **Model matrix** = run the same variant against N models simultaneously.
- **Results grid** = side-by-side outputs rendered in existing `rich-output` nodes.
- **Selection** = tag outputs as keep / discard / needs review for downstream labeling.
- **Export** = serialize selected runs as a compact JSON artifact for ML-Intern or the labeling pipeline.

The Lab is **not** a new app. It is a new mode within the current `ml-workflow` tool profile, surfaced as a second floating panel + a few new canvas node types.

---

## 3. Flows

### Flow A — Start an experiment from an existing prompt
1. User selects any `prompt-template` or `input` node.
2. Clicks **Experiment Lab** toggle in the top-center workflow toolbar.
3. Panel opens on the right.
4. User chooses **Seed type**: `selected node`, `clipboard text`, or `template library` (dropdown of saved templates).
5. Clicks **Create experiment**. Canvas creates:
   - a new `experiment-root` node linked to the seed,
   - a `prompt-batch` matrix node,
   - one `llm` branch per default model,
   - one `rich-output` collector per variant/model pair.

### Flow B — Generate variants
1. In the Experiment Lab panel, user sees the seed prompt.
2. Chooses **Variation strategy**:
   - `paraphrase`, `add_role`, `add_constraints`, `change_format`, `few_shot`, `negative`, `language`.
3. Sets **Count** (1-20).
4. Clicks **Branch**. The canvas duplicates the seed node N times, each with a generated variant label and mutated prompt stored in its config.
5. Variants remain editable on canvas and appear as rows in the panel matrix.

### Flow C — Configure model batch
1. Panel shows a **Model set** multi-select, defaulting to the last connected models from OpenRouter / Compatible / Built-in.
2. Each checked model spawns one LLM node per variant in the next run.
3. User can override temperature/top-p per model in the panel; overrides are written to the corresponding `llm` node `config`.

### Flow D — Run batch
1. User clicks **Run batch**.
2. Runtime executes every `(variant, model)` pair concurrently using the existing `runWorkflow` loop, but with a new `runExperiment` orchestrator.
3. Each pair writes its result to a dedicated `rich-output` node and a run record tagged with `experimentId`.
4. Panel shows progress: `14/72 running · 48 done · 2 failed`.

### Flow E — Compare & select
1. Canvas lays out outputs in a grid grouped by variant (rows) and model (columns).
2. Each `rich-output` node gets a quick-action footer: ✅ keep, ❌ discard, 🏷 label later, 📝 note.
3. Panel shows a compact table: variant × model, status, length, cost, selection state.
4. User can filter by status, model, or selection tag.

### Flow F — Export for labeling
1. User clicks **Export selected**.
2. Panel produces a JSON artifact (and optionally a `data` node on canvas) with items:
   ```json
   {
     "experimentId": "exp-...",
     "seedId": "...",
     "exportedAt": "...",
     "items": [
       {
         "variantId": "...",
         "modelId": "...",
         "prompt": "...",
         "output": "...",
         "selection": "keep",
         "runId": "..."
       }
     ]
   }
   ```
3. Artifact is stored in a new `data` node on the canvas so ML-Intern can see it.

---

## 4. Minimal new node / object types

### New workflow node kinds (add to `WORKFLOW_NODE_KINDS` in `shared/workflow.ts`)

| Kind | Purpose | Ports | Config keys |
|------|---------|-------|-------------|
| `experiment-root` | Marks the experiment and holds metadata. | `input` (seed), `output` (artifact) | `experimentId`, `seedNodeId`, `status` |
| `prompt-variant` | A branched prompt from one seed. | `input` (seed ref), `output` | `variantOf`, `strategy`, `mutation`, `prompt` |
| `llm-batch` | Optional aggregator node representing one model in a batch. | `input` (variant stream), `output` (result stream) | `model`, `provider`, `temperature`, `topP` |

> Note: The existing `llm` node is reused for actual inference. The new kinds are mostly metadata/organization layers so the canvas can display lineage and the panel can read structure without parsing free-form text.

### New shape rendering
- `experiment-root` → native `geo` rectangle with a colored header (violet) or a new lightweight custom shape.
- `prompt-variant` → native `geo` rectangle, smaller (240×120), dashed border, label = strategy name + index.
- `llm-batch` → native `geo` hexagon or reuses `llm` styling with a badge.

### New meta schema
```ts
// stored in shape.meta.workflow like existing nodes
interface PromptExperimentMeta {
  schema: 'ml-intern-workflow-node/v1'
  workflowId: string
  nodeId: string
  kind: 'experiment-root' | 'prompt-variant' | 'llm-batch' | 'llm' | 'rich-output'
  experimentId: string
  config: Record<string, string>
  status: 'idle' | 'queued' | 'running' | 'succeeded' | 'failed'
}
```

---

## 5. UI placement

### 5.1 Toggle in the existing top-center workflow toolbar
- File: `client/workflow/WorkflowOverlay.tsx`
- Add a `WorkflowToolButton` with icon `experiment` (new SVG in `WorkflowIcons.tsx`) between **MLflow** tools and the divider before **Run**.
- Label: `Prompt Experiment Lab`.
- Click opens the side panel and (if not present) inserts an `experiment-root` node connected to the selected `prompt-template` / `input`.

### 5.2 Right-side Experiment Lab panel
- New component: `client/workflow/PromptExperimentPanel.tsx`
- Mounted in `WorkbenchShell.tsx` conditionally when the active domain is `ml` and the experiment panel is open.
- Position: absolute top-right, `top: var(--tl-space-10); right: var(--tl-space-4); width: min(380px, calc(100vw - 24px));`.
- Uses existing `TldrawUiButton`, `TldrawUiSelect`, `TldrawUiInput`, `TldrawUiPopover` primitives.
- Sections:
  1. Header with experiment ID + status + close.
  2. Seed source + preview.
  3. Variation strategy + count + Branch button.
  4. Model set checklist.
  5. Run controls (Run batch / Stop / progress).
  6. Matrix table (variant × model, status, selection).
  7. Export selected.

### 5.3 Canvas layout conventions
- New experiment graph is placed below the existing workflow to avoid overlap, using `editor.getViewportPageBounds()` + offset like `installEditableLlmFlow`.
- Rows = variants, columns = models, gutter = 80 px.
- `experiment-root` at top-left of the grid.
- `prompt-variant` nodes in the first column.
- `llm` nodes in intermediate columns.
- `rich-output` collector nodes in the rightmost column.
- Use existing arrow bindings for edges so the graph is traversable by the runtime.

### 5.4 Rich-output quick actions
- File: `client/workflow/RichOutputShape.tsx`
- Add a footer with selection state buttons when the output belongs to an experiment (`meta.config.experimentId`).
- Selection state stored in the node `config` (`selection: 'keep' | 'discard' | 'review'`).

---

## 6. Exact source files and seams

| File | Change type | What to do |
|------|-------------|------------|
| `shared/workflow.ts` | extend | Add `experiment-root`, `prompt-variant`, `llm-batch` to `WORKFLOW_NODE_KINDS`; add helper `buildPromptExperimentSpec(seedNodeId, variants, models)`. |
| `client/workflow/workflowCanvas.ts` | extend | Add `installPromptExperiment(editor, seedNodeId, options)`, `branchPromptVariant(editor, seedShape)`, `layoutExperimentGrid(editor, experimentId)`. |
| `client/workflow/WorkflowNodeShape.tsx` | extend | Add rendering controls for `experiment-root`, `prompt-variant`, `llm-batch` in `NodeControls`. |
| `client/workflow/WorkflowIcons.tsx` | extend | Add `experiment` icon. |
| `client/workflow/WorkflowOverlay.tsx` | extend | Add `WorkflowToolButton` for Experiment Lab; add state `experimentPanelOpen`; pass panel open/close. |
| `client/workflow/PromptExperimentPanel.tsx` | new | Main panel component. |
| `client/workflow/promptExperimentRuntime.ts` | new | `runExperiment(editor, experimentId)` orchestrates parallel runs; reuses `runWorkflow` per (variant, model) sub-graph or calls `streamLlmNode` directly. |
| `client/workflow/promptExperimentStore.ts` | new | IndexedDB store for experiment metadata + selection states (or extend `runStore.ts` with `experimentId` index). |
| `client/workflow/RichOutputShape.tsx` | extend | Selection footer when `config.experimentId` is present. |
| `client/workbench/WorkbenchShell.tsx` | extend | Mount `<PromptExperimentPanel />` when `activeDomain === 'ml'` and panel open. |
| `client/workbench/workbenchToolProfiles.ts` | extend | Add `workflow-experiment` tool to `ML_WORKFLOW_TOOLS` so it appears in the palette even when not opened via side panel. |
| `scripts/tldraw-desktop-eval-lab.css` | extend | Add `.prompt-experiment-panel`, `.prompt-experiment-matrix`, `.experiment-node`, `.prompt-variant-node` styles. |
| `client/workflow/WorkflowTools.ts` | extend | Add `WorkflowExperimentTool` placement tool that inserts an `experiment-root` node. |

---

## 7. Runtime orchestration (high-level)

```ts
// client/workflow/promptExperimentRuntime.ts
export async function runExperiment(editor: Editor, experimentId: string) {
  const root = findExperimentRoot(editor, experimentId)
  const variants = findPromptVariants(editor, experimentId)
  const models = findLlmBatchNodes(editor, experimentId) // or read from root config
  const controller = new AbortController()
  setExperimentController(editor, experimentId, controller)

  const total = variants.length * models.length
  let done = 0
  updateRootStatus(editor, root, { status: 'running', progress: `0/${total}` })

  await Promise.allSettled(
    variants.flatMap((variant) =>
      models.map(async (model) => {
        const outputNode = findOrCreateOutputNode(editor, variant, model)
        updateNodeStatus(editor, outputNode, { status: 'queued' })
        try {
          const prompt = renderPromptForVariant(editor, variant)
          const output = await streamLlmNode(
            editor,
            buildOneOffWorkflow(variant, model, outputNode),
            outputNode,
            prompt,
            model.config.instructions,
            model.config.model,
            model.config.provider,
            model.config.baseUrl,
            crypto.randomUUID(),
            controller.signal
          )
          markSelection(outputNode, 'review') // default
          done++
          updateRootStatus(editor, root, { progress: `${done}/${total}` })
        } catch (err) {
          updateNodeStatus(editor, outputNode, {
            status: 'failed',
            error: err instanceof Error ? err.message : String(err),
          })
        }
      })
    )
  )

  updateRootStatus(editor, root, { status: 'succeeded', progress: `${done}/${total}` })
}
```

> To avoid duplicating auth/session logic, factor `streamLlmNode` out of `workflowRuntime.ts` into a shared helper (`client/workflow/llmStream.ts`) that both `runWorkflow` and `runExperiment` import. This is the cleanest seam.

---

## 8. Data model additions

### IndexedDB: `experiments` store
```ts
interface PromptExperimentRecord {
  id: string
  workflowId: string
  seedNodeId: string
  createdAt: string
  status: 'idle' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  progress: string // "14/72"
  variants: Array<{ nodeId: string; strategy: string; prompt: string }>
  models: Array<{ nodeId: string; model: string; provider: string }>
  selections: Record<string, 'keep' | 'discard' | 'review'>
}
```

### Run records
- Extend `WorkflowRunRecord` with optional `experimentId: string` so the Rich Output run selector can show experiment runs.

---

## 9. MVP cut (what to ship first)

**Must have (Week 1):**
1. New `experiment-root`, `prompt-variant`, `llm-batch` node kinds.
2. Experiment Lab toggle in workflow toolbar.
3. Right panel: seed source, model multi-select, Run batch, progress.
4. Canvas grid layout for one seed + 1..N models (variants = manual copy first).
5. Parallel execution using existing `streamLlmNode`.
6. Rich-output selection footer with keep/discard/review.
7. Export selected to JSON `data` node.

**Should have (Week 2):**
1. Automatic variant generation strategies.
2. IndexedDB experiment store + reopen experiments.
3. Cost/length column in matrix.
4. Filter by selection state in panel.

**Won’t have (MVP):**
1. Distributed backend queue — keep it local browser concurrency.
2. Real-time collaborative experiment editing.
3. Fine-grained per-token cost accounting.
4. Integration with external labeling SaaS (only JSON export).

---

## 10. Risks and constraints

- **Concurrency limits**: browsers cap parallel fetches; chunk the batch into groups of ~6 to avoid socket exhaustion.
- **Rate limits / cost**: surface a confirmation when >50 runs are requested.
- **Canvas clutter**: auto-collapse variant prompts after 3 lines; allow user to collapse whole rows/columns.
- **Undo**: wrap batch creation and batch run in `editor.markHistoryStoppingPoint` so users can undo the whole experiment.
- **Auth**: reuse sessionStorage for API keys; do not write keys into node configs or run records.
- **ML-Intern bridge**: existing terminal bridge only executes explicit canvas tools. For MVP, export the JSON artifact to a `data` node and let ML-Intern read bounded context. Later, add a `tldraw_experiment` capability.

---

## 11. Verification checklist for implementation

- [ ] Selecting an `input` or `prompt-template` node and opening the Lab creates a new experiment graph.
- [ ] Checking 3 models and clicking Run batch creates 3 LLM nodes + 3 rich outputs per variant.
- [ ] Outputs render in rich-output nodes and can be tagged keep/discard/review.
- [ ] Panel progress updates without blocking canvas interaction.
- [ ] Export selected produces a `data` node with valid JSON and no API keys.
- [ ] Stopping the batch aborts in-flight fetches.
- [ ] Undo removes the whole experiment graph in one step.
- [ ] Existing ML workflow still works when Experiment Lab is closed.

---

*Design owner: focused autorecruit.tldraw UX subagent*  
*Created: 2026-08-09*  
*Status: design complete, ready for implementation.*
