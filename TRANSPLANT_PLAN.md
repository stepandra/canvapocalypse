# Transplant plan: upstream tldraw branching-chat UX → canvapocalypse

## 0. Scope
Implement a minimal “branch-from-seed + streaming result” slice inside canvapocalypse, borrowing the upstream `branching-chat` template where possible. The slice is:
- A single workflow node whose body contains a text input + send button.
- The node streams an LLM response into its own body as text grows.
- The node has one output port; dragging from the port creates a duplicate child node (branch) pre-wired to the parent, carrying forward the conversation history.
- This is a new `message` kind added to the ML workflow profile only; it does not replace existing workflow nodes.

## 1. What can be reused literally from upstream
| Upstream file | What is reusable |
|---|---|
| `client/ports/Port.tsx` | `ShapePort` validator and the visual port component (after renaming CSS classes to canvapocalypse naming). |
| `client/ports/portState.ts` | `EditorAtom` pattern for transient port highlight state. |
| `client/ports/getPortAtPoint.tsx` | Port hit-testing logic; works against any shape exposing `getNodePorts`. |
| `client/connection/ConnectionShapeUtil.tsx` | Cubic-bezier connection geometry, handle-drag wiring, and `onHandleDragEnd` auto-create-node logic. |
| `client/connection/ConnectionBindingUtil.tsx` | `ConnectionBindingUtil` and helpers (`createOrUpdateConnectionBinding`, `getConnectionBindings`, etc.). |
| `client/connection/ConnectionCenterHandleOverlayUtil.tsx` | Midpoint “+” handle overlay for inserting nodes into connections. |
| `client/connection/keepConnectionsAtBottom.tsx` | z-index side-effect for keeping connections behind nodes. |
| `client/connection/insertNodeWithinConnection.tsx` | Layout math for inserting a node in the middle of a connection. |
| `client/ports/PointingPort.tsx` | State-node that turns a port pointer-down into either dragging an existing connection or creating a new one. |
| `client/nodes/types/shared.tsx` | `NodeDefinition` abstract class / `updateNode` helper for typed node props. |
| `client/nodes/NodeShapeUtil.tsx` | `ShapeUtil` that composes body + ports; geometry including port hit circles. |
| `client/nodes/nodePorts.tsx` | `getAllConnectedNodes` graph traversal for gathering chat history. |
| `client/nodes/types/MessageNode.tsx` | The streaming gather-history / fetch / update UI pattern (not the exact component, because canvapocalypse already has LLM streaming). |

## 2. What cannot be reused literally
| Upstream concept | Why it does not fit |
|---|---|
| `node` custom shape type | Canvapocalypse already has `workflow-node`, `workflow-rich-output`, `geo`, etc. Adding a parallel `node` shape would fracture persistence and tooling. |
| `connection` custom shape type | Canvapocalypse uses native `arrow` shapes with `workflowEdge` metadata for workflow edges. Replacing them with a custom connection breaks existing workflow runtime, runStore, and bridge. |
| `MessageNode` as the only node kind | Canvapocalypse workflow has many node kinds; we only need a new `message` kind. |
| Upstream `WorkflowToolbar` | Canvapocalypse tool profiles are declarative; the overlay is `WorkflowOverlay.tsx`. |
| Upstream worker `/stream` | Canvapocalypse already has `/workflow/llm` (non-streaming for OpenRouter, streaming for builtin via `streamLlmNode`) and `/stream` for the agent. Reuse the existing workflow LLM bridge, not the upstream Google-generative worker. |
| Upstream `App.tsx` mount wiring | Canvapocalypse `App.tsx` already mounts `TldrawAgentAppProvider`, `WorkbenchShell`, etc. Custom tools/overlays are registered through existing arrays. |

## 3. Data model for the new node kind
Add `message` to `WorkflowNodeKind` in `shared/workflow.ts`:
```ts
export const WORKFLOW_NODE_KINDS = [
  ...existing,
  'message',
] as const
```
Default spec in `shared/workflow.ts`:
```ts
{
  id: 'message',
  kind: 'message',
  title: 'Message',
  description: 'User/assistant message in a branching conversation.',
  readonly: false,
  ports: [
    { id: 'input', direction: 'input', valueType: 'text' },
    { id: 'output', direction: 'output', valueType: 'text' },
  ],
  config: {
    userMessage: '',
    assistantMessage: '',
  },
}
```

## 4. Exact files to change
1. `shared/workflow.ts` — add `message` to kinds, add default config, include in `KIND_STYLE` (color `light-blue`, geo `rectangle`), extend `validateWorkflowSpec` if needed.
2. `client/workflow/WorkflowNodeShape.tsx` — add `message` branch in `NodeControls` that renders an inline input + send button + streamed assistant output. Use `extractTemplateVariables`/`renderPromptTemplate` helpers if template present upstream; otherwise just show raw text.
3. `client/workflow/workflowRuntime.ts` — add `message` branch in the per-node execution switch. Gather ancestors with `message` kind, build `{role, content}` history, call `streamLlmNode` (already streams and updates the shape). Output is the assistant message.
4. `client/workflow/workflowCanvas.ts` — add `message` to `KIND_STYLE`, `nodeTitle`, `fallbackTitle`, `fallbackDescription`, `statusColor`, `standaloneNodeConfig`, `standaloneNodePorts`. Add `branchFromSeed` helper that duplicates a `message` node and rebinds its output to the new node’s input (mirrors upstream `PointingPort.onClick` / `onHandleDragEnd`).
5. `client/workflow/WorkflowTools.ts` — add `WorkflowMessageTool` with id `workflow-message` and kind `message`.
6. `client/workbench/workbenchToolProfiles.ts` — add `{ id: 'workflow-message', action: 'select-workflow-tool', toolId: 'workflow-message', label: 'Message', icon: 'comment' }` to `ML_WORKFLOW_TOOLS`.
7. `client/workflow/WorkflowOverlay.tsx` — add a “Branch” button in the inspector when a `message` node is selected; call `branchFromSeed(editor, shape)`.
8. `client/workflow/WorkflowNodeShape.tsx` / `workflowCanvas.ts` — render the output port as a draggable handle. The existing port markers are visual only; for the branch gesture we can either reuse native arrow tool + edge metadata, or add a tiny state-node overlay. Recommended: keep using native arrows (user selects arrow tool and draws from output to input), but also support a one-click “Branch” button in the inspector for the seed UX.
9. `client/App.tsx` — no change required if the node kind is registered via existing `WORKFLOW_TOOLS` + `WorkflowNodeShapeUtil`. If we add a custom `ConnectionShapeUtil`, it must be added to `shapeUtils`; but we are reusing native arrows, so no change.
10. `client/index.css` / `client/workbench/workbench.css` — add `.workflow-node-message` styles matching other node kinds, plus inline message body CSS.

## 5. Streaming implementation
Use the existing `streamLlmNode` in `client/workflow/workflowRuntime.ts`:
- Build `input` from ancestor `message` nodes: walk upstream `message` nodes in reverse depth order, appending `assistantMessage` then `userMessage` for each ancestor, ending with the current node’s `userMessage`.
- Set `instructions` to a fixed system-ish prompt, e.g. “Continue the conversation.” or from `meta.config.instructions`.
- Call `streamLlmNode(editor, workflow, shape, input, instructions, model, provider, baseUrl, runId, signal)`.
- The function already writes chunks to `config.lastOutput` and downstream output nodes; for `message` nodes we additionally write the final/full assistant text to `config.assistantMessage` so the body grows live.

## 6. Branch-from-seed UX
Two equivalent paths:
- **Inspector button**: selected `message` node shows `BRANCH FROM SEED`. Click creates a sibling `message` node below, copies config, and draws a native `arrow` edge from parent output port to child input port using existing `createWorkflowArrow`.
- **Port drag** (stretch goal): render the output port as a tldraw handle or use the native arrow tool. Because existing port markers are HTML overlays, easiest first pass is the inspector button.

## 7. Minimal verification
- Unit test in `client/workflow/WorkflowOverlay.test.ts` asserts `workflow-message` is in `ML_WORKFLOW_TOOLS` and the overlay source contains `workflow-message`.
- Unit test in `client/workflow/workflowCanvas.test.ts` (or extend existing canvas tests) asserts `createStandaloneWorkflowNode(editor, 'message')` produces a shape whose `meta.workflow.kind === 'message'` and ports match.
- Manual / agent-driven verification: place a message node, type text, press send, see streamed text appear in the node body and a downstream branch can be created via the inspector button.

## 8. What to avoid
- Do not introduce a second custom connection system; reuse native arrows + `workflowEdge` metadata.
- Do not introduce a second `node` shape type; reuse `workflow-node` shape util.
- Do not replace the existing `/workflow/llm` worker route; reuse it.
- Do not break existing workflow node kinds or the product-planning profile.
