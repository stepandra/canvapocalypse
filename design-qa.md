# Design QA — functional workflow node cards + terminal ML-Intern bridge

## Target and evidence

- Source reference: `/var/folders/95/rqgd3kld6l3dgdq8p61cvbfw0000gn/T/codex-clipboard-8b6cea11-4a36-43e1-af92-364379951999.png`
- Browser implementation: `http://localhost:5173/?workflow=ml-intern`
- Browser viewport: `1262 × 1196`
- Verified state: the terminal-first ML-Intern bridge is online and the canvas contains both the read-only terminal route and editable native workflow nodes.
- Full-view capture: `artifacts/design-qa/workflow-node-cards.png`
- Focused source/implementation comparison: `artifacts/design-qa/workflow-node-card-comparison.png`
- Final terminal-route capture: `artifacts/design-qa/workflow-terminal-bridge-final.png`
- Final canvas overview: `artifacts/design-qa/workflow-overview-final.png`
- Final reference/prototype comparison: `artifacts/design-qa/workflow-terminal-comparison.png`

## Visual and interaction checks

- Node silhouette now matches the reference pattern: white vertical cards, compact header, descriptive copy, grouped controls, visible edge ports, and curved workflow connectors.
- `Text Input` has an editable canvas-local value field.
- `Prompt Template` uses the card body as the editable prompt surface without a redundant in-card `TEMPLATE` label; it stretches with the node, parses `{variables}`, displays upstream bindings as `Receiving input`, and exposes editable values for non-input variables.
- `Context selector` is interactive and exposes explicit `PICK SHAPES`, `PICK AREA`, and `CLEAR` controls.
- `Amp` is represented as a dedicated Agent node. `LLM` provider choices are limited to `Built-in`, `OpenRouter`, and `Base URL`.
- The toolbar exposes named `Text Input`, `Context`, `Prompt Template`, and `Amp Agent` tools instead of relying on unlabeled generic figures.
- The ML-Intern widget presents the terminal CLI as the primary session and the browser as an observer/executor for the bounded `tldraw_canvas` built-in tool.
- Read-only current-flow nodes use the same component system and preserve their locked state.
- Existing persisted geo workflow nodes migrate in place without resetting the canvas or breaking bound arrows.
- No visible clipping, broken padding, overlapping node controls, or illegible status/port treatment was found in the focused comparison.

## Validation

- DOM inspection confirmed editable `Text Input`, the full-height `Prompt Template`, all three context controls, the dedicated Amp Agent card, and the absence of Amp from every LLM provider selector.
- Browser interaction confirmed `Text Input` accepts and clears text without crashing and `PICK SHAPES` enters the bounded context-selection path.
- Live bridge inspection returned `primary: terminal`, `bridge: ready`, zero queued requests, and the native tldraw capability boundary.
- `npm test`: 7 Vitest files passed, 27 tests passed; the Node test harness passed 11/11.
- `npm run build`: passed.
- Python built-in-tool adapter parsed successfully and instantiated against the
  real `ToolSpec` from `/Users/jerryjohnson/dev/active/ml-intern`.

final result: passed
