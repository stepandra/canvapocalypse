# Context-efficient companion routing

Date: 2026-07-24
Status: accepted for incremental implementation

## Problem

The active `working` mode currently builds every registered prompt part before a
request reaches the model. It also places every action schema in the initial
system prompt. A small canvas question therefore pays for screenshots, viewport
geometry, nearby shapes, complete chat and user-action history, lints, todos,
and the heavyweight Isoflow mutation schema even when none of those surfaces is
relevant.

Isoflow Bridge v2 already demonstrates the desired boundary:

- tldraw stores a provider reference rather than a copied project;
- only a selected embed yields compact context;
- detailed reads are explicit bridge inspections or searches;
- writes are validated, revision-guarded transactions;
- results are compact receipts rather than another copy of the model.

## Decision

### Routing is an opt-in request contract

`AgentRequest.routing.enabled` activates companion routing. Requests without
that flag retain the current `working` mode parts and actions unchanged. This
keeps existing callers compatible while Amp, Codex, MCP, or a future companion
UI adopts the new contract deliberately.

Each routed request resolves to one of:

- `canvas-edit`: ordinary tldraw shape work;
- `isoflow-edit`: DevOps, DevSecOps, deployment, or infrastructure-contour
  work on a selected native Isoflow embed;
- `inquiry`: a non-mutating question or explanation.

An explicit route is authoritative only inside its domain gate. Otherwise the
router uses the selected surface and a narrow intent classifier. Selection alone
does not make a request an Isoflow request. ML, MLOps, Hugging
Face/ML-Intern output, widgets, general diagrams, and ordinary canvas work always
use native tldraw bounded context and validated tldraw actions, even if a caller
mistakenly requests `isoflow-edit`. An Isoflow route never grants access to an
unselected project.

### Context is bounded before prompt-part assembly

The route chooses prompt parts before their utilities run:

- all routes receive mode metadata, model/debug metadata, the current messages,
  bounded continuation data, and a compact history projection;
- `canvas-edit` receives selected shape IDs. A screenshot and bounds are added
  only when the request explicitly opts into its bounded region;
- `isoflow-edit` receives only the selected embed's compact Bridge view and is
  available only for the native infrastructure domain above;
- `inquiry` receives selected shape IDs only when a selection exists;
- blurry shapes, peripheral clusters, full viewport state, user-action history,
  todos, lints, and time are not included in routed requests by default.

The initial budget is one Isoflow embed, 32 Isoflow items, 48 connectors,
12 context items, 8 continuation results, and 8 recent history events. Older
history is represented by a compact reference and remains in the local agent
history for inspection. Historical prompt attachments are not resent.

### Capabilities are route-scoped and lazily hydrated

`ModePart.actionTypes` is the capability manifest consumed by the existing
response-schema builder. Routed requests replace the full mode inventory with a
small allowlist:

- inquiry: communication only;
- canvas edit: communication plus basic shape mutations, with layout actions
  added only for layout intent or explicit extended capability hydration;
- Isoflow edit: communication plus Bridge search and exactly the mutation schema
  implied by intent: patch for edits or create-view for new views. A read-only
  inspection receives neither mutation schema.

Consequently an ordinary canvas edit cannot receive Isoflow action schemas.
Capability hydration occurs at the request boundary: a follow-up request can
select a different route or request the extended canvas tier without making the
initial prompt universal.

### Provider adapters remain thin

The routed `ModePart` carries provider-neutral route metadata, bounded-context
budgets, capability IDs, and a permission boundary. Amp, Codex, and MCP consume
the same envelope. Provider credentials, API keys, and repository authority are
never placed in tldraw metadata or model prompts.

### The primary thread orchestrates bounded specialists

The user's existing primary Ampcode thread remains the planner,
user-conversation owner, Architect, and final decision surface. The canvas does
not start a replacement thread or invoke `amp -x`. It classifies work and
dispatches bounded specialist requests; it does not load specialist
instructions, icon catalogs, broad bridge schemas, or raw project/canvas state
into its own context.

The smallest implementation seam in this slice is the provider-neutral
`ModePart.routing` envelope. It contains the resolved route, hard context budget,
capability IDs, permission boundary, and optional local history reference. A
later worker-dispatch slice may transport that envelope without changing prompt
assembly or provider-specific action formats.

A specialist dispatch input is:

```ts
{
  dispatchId: string
  parentThreadRef: string
  specialist: "research" | "diagram"
  intent: string
  route: "canvas-edit" | "isoflow-edit" | "inquiry"
  selection?: { shapeIds?: string[]; embedRef?: string; areaRef?: string }
  artifactRefs: Array<{ id: string; kind: string; version?: string }>
  capabilities: string[]
  permissionBoundary: CompanionRoutingMetadata["permissionBoundary"]
  deadlineMs: number
}
```

A specialist result is compact and source-backed:

```ts
{
  dispatchId: string
  status: "completed" | "failed" | "timed-out" | "conflict"
  summary: string
  artifactRefs: Array<{ id: string; kind: string; version?: string; source?: string }>
  receipt?: {
    surface: "canvas" | "isoflow"
    operationCount: number
    revision?: number
    historyRef?: string
    dryRun?: boolean
  }
  error?: { code: string; retryable: boolean }
}
```

Artifact references are opaque IDs resolved by an allowlisted artifact store or
bridge. They are not arbitrary paths or URLs supplied by the model. The primary
thread receives the compact result and references, never the specialist's full
prompt, tool descriptions, credentials, or unrestricted source state.

The intended chain is:

1. primary Amp classifies a request and emits a bounded research dispatch;
2. the research specialist uses the existing ML-Intern Hugging Face CLI and
   returns a source-backed report or artifact reference;
3. the primary Amp passes only the relevant report reference plus selected
   surface reference to the diagram specialist;
4. for ML/MLOps output the diagram specialist uses the explicit native tldraw
   selection/area and validated tldraw actions. Only a separate infrastructure
   request targeting a selected native Isoflow embed may inspect Bridge v2 and
   choose Isoflow nodes/icons;
5. the primary thread receives a compact mutation receipt.

The minimal research manifest is `search`, `inspect-source`, and
`publish-artifact`. The minimal diagram manifest is `inspect-selection`,
`search-native-assets`, `preview-mutation`, and `apply-mutation`; its concrete
action schemas are hydrated only after the diagram route is selected. The
`search-native-assets` capability resolves tldraw assets for general diagrams
and Isoflow icons only for an infrastructure-domain `isoflow-edit` route.

Timeouts fail closed and return `timed-out` with any already-published immutable
artifact references. A specialist may not continue mutating after its deadline.
Permission denial and validation failures return `failed` without fallback to a
broader tool set. Isoflow revision conflicts return `conflict`; the primary
thread may request a fresh inspection but must not replay the old transaction.
Partial research can be returned as an artifact, but partial diagram mutations
must use an atomic bridge transaction or a reversible tldraw receipt.

For native tldraw work, the existing Ampcode thread can act directly through a
three-tool loopback plugin rather than dispatching another diagram agent:

1. `tldraw_capabilities` discovers IDs only;
2. `tldraw_describe_capability` hydrates exactly one smallest suitable schema;
3. `tldraw_execute` sends one selection- or explicit-area-bounded request.

The resident tldraw Offline client resolves the currently open document from
its short-lived live binding, applies validated native actions, and returns a
compact inspectable/undoable receipt. Unqualified companion discovery targets
exactly one active Offline desktop and never falls back to a web preview.
Every lease rotates a receipt token; only that exact resident canvas can close
the request. Browser Origins may poll/lease/receipt only as bound residents;
producer discovery, description, execution, request status, and legacy invoke
reject browser Origins. The plugin does not accept a thread ID, document path,
credential, full history, raw whole-canvas state, arbitrary URL, client
binding, lease token, or filesystem root. No provider prompt or canvas metadata
stores those values. A missing or ambiguous Offline binding fails closed.

The worker dispatcher and artifact resolver remain later slices. The first
ML-Intern integration seam is deliberately smaller: the already-running
terminal CLI remains the session owner and uses three built-in tools in order:
`tldraw_capabilities`, `tldraw_describe_capability`, and `tldraw_execute`.
Discovery returns compact IDs, description hydrates one schema, and execution
queues one bounded native-tldraw request. The selected browser canvas applies
validated actions using an explicit selection or bounded area and returns only
a compact success/failure receipt. The widget observes connection, queue, and
receipt state; it does not start a second ML-Intern session or resend the
terminal's history.

This seam is implemented by:

- `scripts/ml_intern_tldraw_tool.py`, a repo-local three-`ToolSpec` adapter that
  must be explicitly installed into ML-Intern's `create_builtin_tools()`;
- `GET /health`, the loopback workflow-bridge readiness contract;
- `/ml-intern/canvas-tool/{capabilities,capabilities/describe,execute,next,status,receipt}`
  on the loopback workflow bridge;
- `client/agent/mlInternCanvasTool.ts`, which consumes one leased request with
  the existing bounded `canvas-edit` route.

The tool is native tldraw only. It does not route ML/MLOps work through Isoflow,
accept arbitrary paths, inherit credentials through canvas metadata, or expand
the selected context.

`POST /ml-intern/canvas-tool/invoke` is retained only as an unadvertised
compatibility endpoint for older local clients. Canvapocalypse does not modify
the external ML-Intern checkout; adapter registration remains an external
installation step.

### Mutations retain validated receipts

Tldraw actions continue through their registered action schema, sanitizer, and
action utility. Completed actions retain their local record diff in chat
history, which is inspectable and reversible through the existing accept/reject
UI; prompt history receives only the compact action projection.

Isoflow writes remain Bridge v2 transactions. The bridge reads the current
revision immediately before a write, validates bounded operations, fails closed
on a conflict, and returns a compact revision/summary receipt. Routing does not
weaken the local-host or project allowlists.

## Bridge availability contract

The embedded widget, compact context loader, and Amp/Isoflow agent path all
depend on the same loopback Bridge v2 origin. Health restoration must verify the
actual process and HTTP route, not merely that port `4174` is occupied:

1. `GET /api/isoflow/health` reports schema version 2.
2. the selected project's embed URL loads and its requested view resolves;
3. the agent path performs an allowlisted inspect followed by a safe dry-run
   transaction using the current revision.

Any repair must keep `isoflow-studio` as source of truth, preserve revision
guards, and avoid arbitrary filesystem paths. Durable wiring changes belong in
this decision record; process-only recovery does not.

## Consequences

- Existing agent calls are unchanged until they opt in.
- The existing Ampcode Architect thread can operate the live tldraw Offline
  canvas without spawning another Amp process or ingesting the whole document.
- Routed prompts are smaller and surface-specific.
- A caller that needs a screenshot, a larger capability tier, or another
  surface must request it explicitly.
- Full history and full Isoflow state remain locally inspectable instead of
  being copied into every prompt.
