# Canvapocalypse decisions log

This file records implementation decisions made without interrupting the user.
Entries describe the current decision, why it was chosen, and the boundary it
must preserve.

## 2026-07-27 — Universal AI Architecture Workbench v1

### D-001 — One canvas, four domain packs

**Decision:** Keep one native tldraw canvas and add switchable domain packs:
`architecture`, `ml`, `uiux`, and `product`.

**Why:** Separate applications would fragment selection, agent history,
artifacts, and decision provenance. Packs can change templates, prompts, and
capability manifests without copying the canvas.

**Boundary:** Packs are lenses and capability policies, not independent stores.
Changing a pack never deletes or hides user shapes.

### D-002 — Native tldraw is the default artifact surface

**Decision:** Architecture diagrams, ML/LLM workflows, UI/UX artifacts, and PM
artifacts are native tldraw shapes with stable workbench metadata.

**Why:** Native shapes remain composable, selectable, editable, undoable, and
available to the existing validated agent action system.

**Boundary:** Isoflow Bridge v2 is used only for explicitly selected native
Isoflow infrastructure/deployment/security-contour work. ML, generic system
design, UI/UX, and PM work never fall back to Isoflow automatically.

### D-003 — Templates create editable starter systems, not screenshots

**Decision:** Each pack exposes a small catalog of generators that create real
shapes and bound connectors:

- Architecture: system context, decision graph, change radar.
- ML/LLM: experiment loop, evaluation pipeline, model delivery map.
- UI/UX: user flow, wireframe screen set, component anatomy.
- Product: roadmap, timeline, opportunity/decision map.

**Why:** A useful starter must be immediately editable by both a human and an
agent. Raster examples and decorative mockups would not satisfy that.

### D-004 — Capability discovery precedes schema hydration

**Decision:** Agents and terminal ML-Intern receive a compact, domain-filtered
capability manifest first. Concrete action schemas are hydrated only for the
selected operation.

**Why:** Sending every tldraw and Isoflow action schema on every request wastes
context and makes model behavior less reliable.

**Boundary:** Capability discovery grants no mutation authority. Mutations
still pass through validated native tldraw actions or revision-guarded Isoflow
transactions and return compact receipts.

### D-005 — ML-Intern remains terminal-owned

**Decision:** The terminal ML-Intern session remains the planner and owner of
its history. The browser widget is a queue/status/receipt surface and native
canvas executor.

**Why:** Starting another browser-owned ML-Intern session would split memory,
tools, approvals, and run state.

**Boundary:** The terminal receives explicit tools for capability discovery,
bounded inspection, preview/apply, workflow execution, and receipt lookup. It
does not receive unrestricted canvas state or filesystem authority.

### D-006 — Open Design is not embedded in v1

**Decision:** Do not integrate or clone Open Design in this slice. Provide a
native wireframe/mockup pack and a provider-neutral artifact boundary first.

**Why:** An Open Design embed would introduce a second document model and a
large integration surface before the native workflow is proven.

**Boundary:** A future provider may import/export UI artifacts, but the canvas
must retain stable artifact references and human-editable native shapes.

### D-007 — Decision memory and PM state are canvas artifacts

**Decision:** ADRs, decisions, assumptions, milestones, risks, and changes use
stable metadata on native canvas shapes and explicit relationships.

**Why:** This keeps architecture decisions, roadmap state, and diagrams in one
inspectable/undoable workspace and lets agents return compact artifact refs.

**Boundary:** v1 is local-first. External issue trackers and document systems
are optional future providers, never silent sources of truth.

### D-008 — Preserve the existing dirty repository state

**Decision:** Additive edits only in the requested project/tldraw scope. Do not
delete or rewrite unrelated existing changes, generated canvases, Isoflow
sessions, or Offline document scripts.

**Why:** The worktree already contains user-owned, uncommitted implementation.

**Boundary:** Generated build output may be refreshed by validation commands,
but no cleanup outside the project or tldraw folders is authorized.

### D-009 — Domain packs are advisory UI and capability policy

**Decision:** Persist only the selected domain pack in a dedicated query
parameter/local-storage key. Keep all shape utils and tools registered so old
documents remain editable, while inactive provider overlays are unmounted.

**Why:** A pack switch should reduce visual and polling noise without changing
the canvas document or silently granting a different mutation surface.

**Boundary:** Selecting Architecture does not select Isoflow. Isoflow still
requires an explicit infrastructure intent and a selected Isoflow embed.

### D-010 — UI/UX v1 uses native compositions

**Decision:** Build wireframes and mockups from native frames, geos, text,
notes, and bound arrows with compact semantic metadata. Defer custom UI
document engines and high-fidelity interactive component shapes.

**Why:** Native compositions are immediately editable, composable, persistable,
and usable by the existing bounded agent action path.

**Boundary:** Generated UI/UX templates contain no screenshots, opaque embeds,
or vendor-specific document state.

### D-011 — Explicit selection and area are fail-closed context boundaries

**Decision:** A request for selection-only context fails when nothing is
selected. Viewport context is never substituted silently. A bounded area must
be explicitly requested and remains subject to item caps.

**Why:** Treating the viewport as an implicit selection leaks unrelated canvas
state and defeats context-efficient routing.

**Boundary:** Screenshot and broad visual context are hydrated only for an
explicit review/area operation; ordinary edits receive semantic selected-shape
context.

### D-012 — ML-Intern gets three small host tools

**Decision:** Expose `tldraw_capabilities`,
`tldraw_describe_capability`, and `tldraw_execute` to terminal ML-Intern.
Keep the old single-tool request form only as a compatibility wrapper.

**Why:** ML-Intern's router serializes registered tool specs on every model
iteration. Three small tools provide real discovery and lazy schema hydration
without advertising every canvas action schema.

**Boundary:** The manifest contains native tldraw capabilities only. Isoflow
capabilities and schemas are never reachable through the ML/LLM tool surface.

### D-013 — A green Vite build is not a green validation gate

**Decision:** The acceptance gate includes TypeScript no-emit checking,
focused unit tests, production build, bridge health, and live pack/template
smoke checks.

**Why:** The existing Vite build transpiles code without catching all
TypeScript contract errors, and the browser UI can load while its local bridge
is unavailable.

**Boundary:** Completion claims must name any remaining unavailable external
process or unverified Offline host explicitly.

### D-014 — Domain identifiers are canonical and old names are migration aliases

**Decision:** Use `architecture`, `ml`, `uiux`, and `product` in routing,
metadata, URLs, and capability manifests. Accept the earlier `ml-llm`, `ui-ux`,
and `product-pm` spellings only when reading persisted state or old links.

**Why:** One vocabulary prevents the palette, agent router, artifact schema,
and terminal bridge from describing the same pack with incompatible IDs.

**Boundary:** Alias resolution is one-way. New writes always use the canonical
identifier and do not rewrite existing canvas shapes.

### D-015 — Terminal canvas authority is bound to one browser client

**Decision:** Capability discovery establishes a short-lived binding to exactly
one active browser canvas. Describe and execute calls must carry that binding,
and executions remain idempotency-guarded.

**Why:** With multiple tldraw tabs open, a global queue could let a terminal
request inspect one tab and mutate another.

**Boundary:** Zero or multiple eligible clients fail closed until discovery
selects an unambiguous client. The bridge grants neither filesystem access nor
ambient credentials.

### D-016 — AI interaction returns as a compact, opt-in dock

**Decision:** Provide a collapsed-by-default workbench companion dock instead
of restoring the removed full-height chat panel. It exposes the active pack,
explicit selection-versus-visible-area context, request status, and a concise
prompt.

**Why:** All four packs need an obvious AI entry point, but the old permanent
sidebar consumed too much viewport and mixed model/provider controls with
canvas context.

**Boundary:** Selection is the default. Visible-area context requires an
explicit user choice, and the dock does not display or resend unbounded chat
history.

### D-017 — Desktop activation must respect the live Offline document boundary

**Decision:** Keep the workbench implementation host-agnostic and verify it in
the repo-hosted tldraw application. Do not patch Offline archives, database
files, or document internals while its local control server is unavailable.

**Why:** Disk edits alone do not prove that an open Offline document loaded a
configuration, and unsafe archive edits could corrupt user documents.

**Boundary:** Desktop parity is reported separately and only becomes verified
after the Offline host is running and the same registered tools, shapes, and
shell are exercised through its supported document/config APIs.

### D-018 — Mutation receipts require completed native-action evidence

**Decision:** A mutating ML-Intern canvas request is successful only when the
request's newly appended chat history contains at least one completed,
allowlisted native tldraw mutation action. A resolved model call, message,
thought, view change, or missing action is not success.

**Why:** The agent request loop reports some internal failures through its own
error channel instead of rejecting the outer prompt promise. Treating promise
resolution alone as proof produced false-success receipts.

**Boundary:** Read-only inspection and result lookup remain deterministic and
do not invoke the model. Failed evidence checks return through the existing
failed-receipt path; they do not weaken validation or enable Isoflow.

### D-019 — Legacy ML-Intern invoke is canvas-bound or fail-closed

**Decision:** Keep the compatibility `/invoke` endpoint, but bind each request
to the sole active browser canvas client before enqueueing it.

**Why:** An unbound legacy queue item cannot be safely leased once multiple
tldraw tabs or workbench documents exist.

**Boundary:** No active client and multiple active clients both fail closed.
The three-tool manifest path remains the primary interface.

### D-020 — ML-Intern bootstrap uses an isolated versioned canvas

**Decision:** Route `?workflow=ml-intern` to the dedicated
`tldraw-agent-workbench-ml-intern-v2` persistence namespace. Keep the generic
canvas and the legacy `canvas=eval-lab` document in their existing namespaces.

**Why:** The ML workbench bootstrap creates and repairs workflow records on
mount. Running it against the generic canvas could mix demo/workbench state
with an unrelated user document.

**Boundary:** When both legacy entry points are present, the explicit Eval Lab
canvas keeps precedence. This change does not migrate or rewrite existing
documents.

### D-037 — Kanban Tracks is a one-way Product projection

**Decision:** The Product / PM pack may discover and materialize Kanban tracks
and milestones through the loopback `kanban-tracks-projection/v1` provider.
Kanban remains authoritative; the canvas receives no workflow mutation route.

**Why:** Tracks need a spatial zoomed-out view, but copying editable task state
into tldraw would create a second control plane.

**Boundary:** Refresh preserves layout, adds new refs, and marks removed refs
orphaned. Canvas metadata retains only opaque project/item refs and projection
revision data—never paths, task prompts, Amp thread IDs, credentials, or
scheduler state. Reads require the D-036 resident capability even from an
opaque Offline origin. See `docs/decisions/kanban-tracks-provider.md`.

### D-021 — Workbench mutation status requires native action evidence

**Decision:** The compact AI dock records the chat-history boundary before a
request and marks a mutation successful only when a completed, allowlisted
native tldraw mutation action appears after that boundary.

**Why:** The underlying agent loop reports some stream failures through its
error channel without rejecting the outer prompt promise. A returned promise
alone is therefore not a reliable mutation receipt.

**Boundary:** Inquiries may finish without a mutation. Isoflow actions never
count as native canvas evidence, and an unverified mutation is surfaced as an
error rather than a false success.

### D-022 — Offline registrations are merged by stable type or tool id

**Decision:** The repo-local Offline configuration preserves host shape utils,
tools, and UI components, then applies Workbench registrations with a
last-wins dedupe keyed by static shape `type` or tool `id`.

**Why:** Loading both an older document registration and the current Workbench
implementation can otherwise create duplicate utilities or ambiguous tools.

**Boundary:** Only matching registrations are replaced. The configuration does
not modify `.tldraw` archives, SQLite state, document internals, or unrelated
host extensions.

### D-023 — Architecture is owned by the existing Ampcode thread

**Decision:** Treat the user's existing Ampcode architecture thread as the
planner, conversation owner, and architecture decision-maker. The Architecture
pack must not start a replacement `amp -x` process or use the embedded canvas
LLM as its architect. Canvapocalypse exposes a thin loopback adapter so that
the existing thread can inspect and mutate the live tldraw Offline document.

**Why:** A second architect would split repository context, discussion history,
and decision ownership. Giving the established thread three small canvas tools
keeps judgment in Amp while tldraw remains the visual workspace and validated
mutation runtime.

**Boundary:** The adapter uses discovery, one-capability hydration, and bounded
execution against an explicit selection or area. It does not put an Amp thread
ID, credentials, full chat history, control-server token, filesystem path, or
raw whole-canvas state into prompts, canvas metadata, manifests, or receipts.
Mutations still require completed native tldraw action evidence and return a
compact receipt. Isoflow remains a separate explicit infrastructure provider.

### D-024 — Amp resolves the project Offline canvas before issuing a resident lease

**Decision:** Mount one provider-neutral executor beside every Workbench canvas.
It registers an opaque browser-session binding and coarse client kind with the
loopback bridge. The Amp plugin selects its target from
`amp.system.workspaceRoot`: the workspace must contain exactly one regular,
non-symlink `.canvas/*.tldraw` file, and exactly one open tldraw Offline
document must resolve to that canonical path. The plugin reads that document's
opaque resident binding through the local Offline API and uses it only as an
internal capability-discovery selector; the binding and document path are not
LLM-facing tool arguments or results. Other open Offline documents are ignored
and never closed. Missing, ambiguous, escaped, symlinked, or unopened project
targets fail closed. Callers without the internal selector retain the stricter
exactly-one-active-Offline-client discovery rule and never fall back to a web
preview.

The Offline lease tolerates bounded background timer suspension; previews
retain a short lease. An inspection returns a short-lived `contextRef` derived
from the bounded semantic projection plus the selected records' current
revisions. Mutations must present the same reference and a validated
`AgentAction[]` plan. Each leased request also receives a fresh random receipt
token known only to the resident client; a terminal receipt requires that token
and the exact leased canvas binding.

**Why:** The existing Ampcode thread needs to operate its repository's canvas,
not whichever Offline window happens to be the only one open. Project-scoped
routing allows unrelated and unsaved documents to remain open without making
the architecture tool unusable, while keeping the selection deterministic and
without persisting a machine path, control-server token, Amp thread ID, or raw
document snapshot in the canvas or prompt. Binding the plan to current records
also prevents a stale architectural edit from landing after the user changes
the selection.

**Boundary:** Workspace/path resolution and resident-binding lookup occur only
inside the trusted local Amp plugin and Offline API boundary. The tool contract
exposes no path, workspace-root parameter, canvas-binding parameter, client
enumeration, or arbitrary URL. The resident binding, client kind, and receipt
token are private adapter/bridge transport state. They are not canvas metadata,
provider status, model-facing manifests/results, or public receipts; an
internal manifest may retain the binding solely to enforce lease affinity. A
web Origin cannot register as `offline-desktop`; no-Origin callers remain
inside the existing same-user loopback trust boundary. Browser Origins may call
only resident `next`, bound aggregate status, and receipt routes; agent-facing
discovery, description, execution, legacy invoke, request status, and unbound
status reject browser Origins. Unbound status does not expose the
latest request/result. Instruction-only external mutations are rejected. The
executor accepts only the hydrated native action allowlist, checks every
existing shape reference against the explicit selection or bounded area,
applies through the existing action validators, and returns a compact undoable
receipt. An expired client may leave work bound to that same canvas until it
returns, but work is never rerouted. ML-Intern keeps its terminal-planned
compatibility route; it cannot lease Amp direct-action work.

### D-025 — Terminal sessions are an external observer surface, not a canvas executor

**Decision:** Add only a passive Zellij session monitor to the Architecture and
ML packs. Version one shows bounded health and an opaque exact-session
reference. It does not embed or open Zellij Web, start the server, create
tokens, stream a transcript, or control a terminal. A separately gated external
open flow is deferred until the bridge can verify the web server and an exact
existing-session deep link without handling its token.

**Why:** Zellij 0.44.3 deliberately sends `X-Frame-Options: DENY` and a
restrictive CSP for its web client. Stripping those protections would turn a
canvas iframe into a clickjacking surface with same-user shell authority.
Read-only terminal output is still sensitive context, so it must not be
silently copied into an agent prompt.

**Boundary:** The broker uses fixed `shell: false` status/list arguments and a
server-side allowlist. Each role must map to an exact server-side session name;
an unmapped role reports `unconfigured` and never adopts an arbitrary sole
session. The opaque reference is derived from both the role and that exact
session mapping, so an Architecture reference cannot make an unconfigured ML
role appear connected. It exposes no command, cwd, pane title, path, PID,
clipboard, environment, token, scrollback, stdin, key injection, session
lifecycle, or arbitrary URL. Zellij Web remains off by default and
authentication is manual. Any future transcript excerpt or writable PTY needs
a separate explicit permission design, bounded preview, redaction, and audit
receipt.

### D-026 — Finalize active editor interaction before validating a companion mutation

**Decision:** A mutating tldraw companion request first completes any active
text edit, draw, resize, or pointer interaction. It then resolves the explicit
selection or bounded area, verifies the short-lived context digest, opens one
history mark, and applies the validated native actions. Read-only inspection
does not end the current interaction.

**Why:** `Editor.undo()` completes an active interaction before traversing
history. If the companion transaction starts first, that completion can become
the next undo diff and make the receipt appear one-step undoable while the
first user undo only exits editing. Completing before context validation also
prevents geometry finalized by an interaction from changing after the snapshot
was accepted.

**Boundary:** If completion changes the selected records, the old context
digest fails closed and the Architect must inspect again. All actions in one
accepted request are still squashed into one native undo step; a failed request
bails to its mark and restores its action-history evidence.

### D-027 — Isoflow canvas is a passive handoff to the existing Ampcode Architect

**Decision:** Remove the embedded AMP/Grok composer, provider/model selectors,
and canvas-side invocation from the Isoflow overlay. The overlay may receive a
dry-run proposal created externally, show its revision, digest, operation
summary, and affected IDs, and apply only the exact explicitly confirmed
proposal. It never starts a model.

**Why:** The existing Ampcode architecture thread already owns repository
context, conversation history, planning, and decisions. Starting a fresh
`amp -x` process from the canvas split that ownership and produced a second
architect without the primary thread's context.

**Boundary:** Native infrastructure, DevOps, DevSecOps, deployment, and contour
views use the separate revision-guarded Isoflow Bridge v2 tools. Ordinary
tldraw architecture, ML, UI/UX, product, widgets, and general diagrams use the
tldraw Offline tool surface. The former browser-owned compatibility endpoint is
an HTTP 410 tombstone; the Architecture workbench does not expose or invoke it.

### D-028 — A bounded context digest authorizes the whole target, not only its projection

**Decision:** Keep the prompt projection small, but compute the authorization
digest from every shape inside the explicit selection or approved area. Capture
the authorized records before mutation, then validate the real net record diff,
final bounds, arrow endpoints, and bindings before committing the native tldraw
history mark.

**Why:** A 24-shape prompt budget must not silently turn the 25th in-area shape
into unauthenticated state, and a syntactically valid action is insufficient if
its final geometry or binding escapes the approved region.

**Boundary:** Empty/no-op diffs, nested endpoint escapes, out-of-area final
records, or incomplete native action evidence bail to the history mark and
return failure. One accepted operation remains one undo step. Zero is a valid
resize/rotate value and is not treated as missing input.

### D-029 — Idempotency survives the short receipt window, but not a process restart

**Decision:** Retain the newest 500 evicted terminal operation fingerprints and
compact responses in a process-local FIFO tombstone map, in addition to the 50
full receipts. An exact replay returns the prior terminal response; a different
payload under the same key returns 409 and never queues new work.

**Why:** Repeated Play clicks and client retries must not reapply a completed
canvas mutation merely because its full receipt or inspection evidence was
pruned.

**Boundary:** Tombstones contain no lease, auth data, raw context, instructions,
actions, or canvas binding. The guarantee is explicitly bounded to the newest
500 evicted terminal operations in the current bridge process; restart or FIFO
rollover ends it. Producer clients consume a terminal `/execute` response
directly, while status remains tombstone-aware for older clients.

### D-030 — Receipt transport uncertainty cannot rewrite local mutation truth

**Decision:** Settle a canvas execution exactly once into an immutable local
outcome. Deliver that exact receipt through a separate retry queue before
leasing more work.

**Why:** A network failure after a successful native mutation is an unknown
delivery state, not a failed mutation. Emitting a synthetic failure invites the
planner to replay work that already landed.

**Boundary:** Delivery retries never re-execute the operation or change
`succeeded` into `failed`. Only a genuine local execution/validation exception
creates a failed receipt. The UI exposes unconfirmed delivery as offline/
unknown until the exact receipt is acknowledged.

### D-031 — Native Isoflow accepts one selected view and no browser-owned model

**Decision:** Retire `/isoflow/agent` as an unconditional HTTP 410 tombstone.
The workbench accepts externally prepared proposals only for exactly one
currently selected Isoflow embed and view.

**Why:** The user's existing Ampcode Architect owns repository context and
judgment. A browser-spawned `amp -x` was a second architect, while page fallback
could mutate a project/view the user did not select.

**Boundary:** Cross-view, lifecycle, project-global item/color/legend, and
create operations fail before Bridge I/O. Confirmation shows normalized exact
JSON, snapshots the proposal immutably, rechecks selection and scope, dry-runs
at the current revision, and preserves the Bridge v2 revision guard.

### D-032 — Workflow labels stay icon-first; emoji insertion is bounded and native

**Decision:** Keep the narrow workflow rail icon-first with accessible tooltips
and no persistent micro-labels inside 48px buttons. Add one separate tool-sized
collapsed emoji control that expands to exactly nine choices in a 3×3 grid. The
angry-poop choice is an original generated manga-style transparent PNG rather
than the platform 💩 glyph or a hand-authored approximation.

**Why:** Full-size labels made the rail overlap and consume the canvas. A small
bounded palette provides quick architecture annotations without becoming
another permanent sidebar.

**Boundary:** Every choice creates one selected native tldraw shape at the
viewport center. The custom PNG asset is registered in tldraw's history-ignored
asset batch before the user-visible shape transaction, so the shape itself is a
single real undo step. The palette stores no provider or agent state.

### D-033 — Integration chrome consumes tldraw's UI system

**Decision:** Treat tldraw's public `TldrawUi*` components and `--tl-*` theme
tokens as the application UI contract for Workbench, workflow, Amp, ML-Intern,
terminal, Isoflow, and emoji surfaces. Use native 40px controls, 48px tools,
18px icons, radius/shadow/focus/state tokens, and 11–12px primary labels.

**Why:** The previous hard-coded white, dark-cyber, and glass panels looked like
several unrelated products and failed dark-mode, spacing, and readability
expectations. tldraw already provides the interaction and visual primitives
needed by these integrations.

**Boundary:** Domain colors identify providers, semantic status, or selected
items only; they never replace neutral tldraw chrome. Monospace is limited to
IDs, revisions, receipts, and capability names. Canvas diagram artifacts may
retain their own semantic visual language, but overlay controls and inspectors
must inherit tldraw. Restyling does not alter routing, credentials, selection
guards, revision guards, mutation validation, receipt truth, or undo behavior.

### D-034 — Browser and Offline share one authoritative integration stylesheet

**Decision:** Load `scripts/tldraw-desktop-eval-lab.css` after the legacy browser
stylesheet and embed that exact same source in the tldraw Offline config bundle.
A deterministic source-contract test guards both entry points and their load
order.

**Why:** Workflow, ML-Intern, and Isoflow chrome had been copied into
`client/index.css` and then independently evolved in the desktop stylesheet.
That fork produced different dimensions, stale ML selectors, and fixes that
worked in only one host.

**Boundary:** The stale workflow, ML-Intern, and Isoflow browser duplicates are
removed from `client/index.css`; unrelated legacy application rules remain
untouched. New integration chrome is added only to the shared stylesheet, and a
source-contract test fails if either entry point stops loading it or if the
removed duplicate selectors return.

### D-035 — Local HTML mockups use opaque refs and variant-only agent writes

**Decision:** Add local HTML mockups as a dedicated native tldraw custom shape
and provider surface, not an Isoflow embed or executable workflow node. The
local artifact registry starts with the bridge repository cwd and may expand
only through operator-configured `TLDRAW_HTML_MOCKUP_ROOTS`. It issues opaque,
revision-scoped refs; renders a cross-origin sanitized document with all
original scripts stripped and only a trusted picker bridge injected; and
hydrates only bounded `html.inspect-component` and safe `html.create-variant`
capabilities. The MVP agent path can create a host-managed variant but cannot
overwrite the selected source.

**Why:** A local mockup may contain 20,000 lines, unsafe script behavior, and
unrelated content. A bounded accessibility-like projection of the explicitly
selected shape or element gives the Architect useful context without
putting HTML bodies, paths, URLs, or arbitrary filesystem authority into
prompts or canvas metadata. Variant-only mutation produces an inspectable
result without risking the source file.

**Boundary:** The registry file and digest are authoritative; the shape,
rendered DOM, picker label, and prompt snapshot are references or derived views
only. Document, node, context, and preview refs are bound to one revision. A
target inspection issues a two-minute context ref bound to the exact
document/revision/target. The MVP accepts one server-sanitized replacement
fragment only with that context ref and a stable idempotency key, creates an
atomic host-named variant, and returns a compact immutable receipt. Regions,
annotations, structural
operations, and direct overwrite are future slices. Direct overwrite, if
added, remains a resident-UI-only exact-preview flow with digest and explicit
confirmation; its confirmation token never enters a public model tool or
prompt.

The target-scoped context ref is also bound to the resident parent surface.
Browser requests must use one exact allowlisted HTTP origin. The explicit
tldraw Offline `file://` mode may present the platform's opaque `Origin: null`
or absent local header only after receiving the out-of-band resident capability
defined in D-036; the surface label alone grants no authority. The parent still
requires exact iframe `WindowProxy` validation.

### D-036 — Local HTML authority is resident, persistent, and surface-bound

**Decision:** Protect every Local HTML registry, inspection, ticket, and
mutation request with one high-entropy resident capability that lives in a
gitignored mode-`0600` file. Exact trusted HTTP workbench origins may bootstrap
it. Offline receives the same value only through the dedicated config build
helper. The server derives the resident surface from the actual request Origin;
clients cannot nominate it. Preview URLs receive only a short-lived
document/revision/surface-scoped ticket.

**Why:** `Origin: null` and `file://` are forgeable labels, not authority. A
persistent out-of-band capability lets browser and Offline hosts share one
resident process identity across ordinary restarts without putting credentials
in canvas records, prompts, receipts, or preview URLs.

**Boundary:** The Offline helper writes only `config.js`, leaves `main.js`
untouched, and checks `script-status`; missing injection fails clearly. Context
grants bind the capability identity and request-derived surface. Preview assets
recheck the ticket's document revision. SVG is excluded from the inert asset
allowlist, and replacement fragments are capped at exactly 32 KiB UTF-8. The
client resolves and validates the exact loopback destination before reading or
attaching resident authority; foreign, credential-bearing, and mutable URL
inputs fail before network I/O.

### D-037 — DESIGN.md is a native, read-only Design System provider

**Decision:** Represent a project `DESIGN.md` as a dedicated native tldraw
Design System node in the UI/UX pack. The local registry discovers only the
exact filename inside the repository and explicitly configured roots, stores
only an opaque document reference plus SHA-256 revision in canvas metadata,
and renders a bounded semantic projection of theme, atmosphere, palette,
typography, components, and layout principles.

**Why:** UI/UX agents need a stable design-system constraint without receiving
a large Markdown document, filesystem path, unrelated project prose, or broad
filesystem authority on every turn. A native node also makes the selected
design system visible, inspectable, revision-aware, and composable with
ordinary tldraw wireframes.

**Boundary:** The registry is read-only in this slice. The shape persists no
source Markdown, path, URL, credential, or projection. Agent context is
available only in the `uiux` pack when exactly one Design System node is
selected, is fetched with its expected revision, and rechecks selection and
revision after the asynchronous read. Source patches remain deferred until a
separate diff-preview, revision-guard, explicit-confirmation, and compact
receipt contract exists.

### D-038 — Product/PM has a planning profile, not the ML workflow rail

**Decision:** Select visible integration tools through declarative workbench
profiles. The ML pack keeps its workflow-node palette and runner. Product/PM
shows only Initiative, Milestone, Timeline lane, Dependency, Risk, Decision,
Outcome, and Status/Receipt. Product tools create native tldraw artifacts with
compact Product metadata; Dependency selects the native arrow tool.

**Why:** Reusing the ML rail made Product look and behave like an inference
workflow editor. Product planning instead needs roadmap objects, temporal
structure, explicit dependencies, risks, decisions, outcomes, and delivery
receipts.

**Boundary:** Product does not expose ML-only Prompt Template, LLM, Agent,
provider, run, stop, or workflow inspector controls. Existing workflow tool and
shape registrations remain global only for backward-compatible rendering of
old documents; pack selection controls what can be created from the visible
palette and does not delete or hide existing canvas records.

### D-039 — Generated AutoRecruit icons are a native, shared Isoflow collection

**Decision:** Crop the approved 4×3 master sheet into twelve transparent
512×512 PNG assets and register them with stable `autorecruit:*` IDs in one
`AutoRecruit` Isoflow collection. Merge that collection into every converted
repo-local Isoflow project while preserving all existing source icons.

**Why:** Isoflow already treats local PNG and SVG assets as native isometric
icons. One shared collection makes the new symbols searchable and selectable
in the normal node icon picker and through Bridge v2 without duplicating image
data inside project sessions.

**Boundary:** The master sheet remains the visual source. This slice does not
silently remap existing diagram nodes: choosing between, for example,
`Browser Hands` and `Browser Viewer` is a semantic model change and must be
done explicitly. The local URLs contain no credentials or external vendor
dependency. Legacy Pro exports that omitted rectangle color are normalized to
the first declared project color during conversion; the source exports remain
unchanged, and this only makes their previously implicit renderer default
explicit enough for Bridge v2 validation.

### D-040 — ML/LLM chrome is one collapsed palette plus one bridge control

**Decision:** Collapse the ML workflow palette to one 48px tldraw-native
popover trigger. Keep node creation, quick flows, link, run, and stop inside
the on-demand popover. In the ML/LLM pack, do not also render the generic
Zellij session monitor: the compact ML-Intern terminal bridge control is the
single operator-facing ML status and request surface.

**Why:** The permanent two-column rail and two independent terminal indicators
duplicated status, covered the canvas, and made native tldraw controls look
secondary. The terminal still owns the ML-Intern conversation; tldraw only
shows its compact bridge state and applies bounded canvas operations.

**Boundary:** This removes no workflow capability and does not turn the browser
into an ML-Intern launcher. Architecture may still show its read-only Architect
session monitor. The workflow palette remains a creation/runtime control, while
the ML-Intern button remains a terminal-to-canvas capability bridge.

### D-041 — MLflow is native tldraw workflow metadata, not Isoflow

**Decision:** Add four native workflow-card kinds: MLflow Experiment, Run,
Evaluation, and Model. They expose artifact-typed ports, editable compact
references, a ready-made evaluation flow, and deterministic compact
`mlflow-workflow-reference/v1` outputs. The cards explicitly state that the
terminal ML-Intern process performs MLflow work; the canvas stores references
and receipts only.

**Why:** MLflow concepts must be visible and composable like the existing
Langflow-style workflow cards, without routing ML/MLOps through the
infrastructure-only Isoflow Bridge or embedding MLflow credentials and raw
tracking state in the document.

**Boundary:** These nodes do not directly contact MLflow, promote a model, or
claim MLflow as a source of truth. Tracking endpoints and credentials remain
outside canvas metadata. A future direct MLflow adapter must hydrate only the
selected node's capability, validate its operation, and return a compact
receipt; promotion remains an explicit external authority.

### D-042 — Terminal ML-Intern discovers three bounded tldraw tools

**Decision:** Register exactly three tldraw built-ins in the editable
ML-Intern checkout: capability discovery, one-capability schema hydration, and
bounded execution. The resident loopback bridge on `127.0.0.1:5176` remains
the authority for client selection, leases, validation, and compact receipts.

**Why:** Terminal ML-Intern is the primary agent surface, but sending the full
canvas action inventory and document state into every ML turn would waste
context and blur the authority boundary. Discovery now returns only compact
capability IDs. A schema is fetched only after ML-Intern chooses a capability,
and execution carries an explicit selection-or-area context contract.

**Boundary:** The tools accept only a loopback bridge URL, never credentials or
arbitrary filesystem paths. The browser client still validates selected
capabilities and native tldraw actions before applying them. A terminal request
may carry finite, size-limited absolute page bounds only with
`selection-or-area`; those bounds are authoritative, do not inherit ambient UI
selection/context, participate in the idempotency fingerprint, and appear only
in the leased request. ML/MLOps and MLflow requests stay on the native tldraw
surface; Isoflow Bridge v2 remains reserved for explicit infrastructure and
deployment diagrams. An already running interactive ML-Intern process must be
restarted before Python can load newly registered built-ins.

### D-043 — Stitch is a server-only UI/UX provider over Local HTML

**Decision:** Integrate `@google/stitch-sdk` only in the loopback workbench
bridge. Stitch generation and editing download HTML server-side and import it
into the existing Local HTML Mockup registry. The UI/UX pack exposes Stitch,
`DESIGN.md`, and Local HTML together in one labeled provider dock. The
repository root `DESIGN.md` is the initial discoverable Canvapocalypse design
system.

**Why:** Stitch is useful for generating and revising screens, while the
existing Local HTML shape already owns safe rendering, bounded component
inspection, agent context, and undoable canvas placement. Reusing it avoids a
second renderer and makes the previously anonymous, empty `DESIGN.md` control
discoverable.

**Boundary:** Stitch credentials, Google IDs, SDK schemas, raw responses,
signed URLs, and HTML never enter the browser bundle, canvas, prompts, or
receipts. Canvas metadata may store only opaque workbench project/screen
references. `/stitch/*` requires the resident capability; remote HTML downloads
are HTTPS allowlisted and capped. Edits require the expected managed HTML
revision and return a compact receipt. Selected `DESIGN.md` context is the
existing bounded semantic projection, never source Markdown. UI/UX remains a
native tldraw surface and never routes through Isoflow.

### D-044 — Local HTML separates prototype interaction from component picking

**Decision:** Give every Local HTML Mockup an explicit, undoable Interact /
Select-target mode. Interact leaves the iframe mounted and suspends picker
interception so the operator can traverse a local prototype; returning to
Select-target inspects the currently visible state. Classic inline prototype
scripts execute only with a per-response nonce inside the existing opaque-origin
sandbox. Components created by those scripts may be highlighted and named from
their bounded visible runtime label, while the opaque target reference remains
the nearest revision-bound source element.

**Why:** Treating every click as a selection made multi-screen mockups
impossible to traverse: Login could be selected, but never activated to reach
Home. Reloading between modes would also discard the exact state the operator
wanted to inspect.

**Boundary:** Entering Interact clears the old selected target. External/module
scripts, handler attributes, network connections, forms, embeds, popups,
downloads, storage, same-origin authority, and top navigation stay unavailable.
The child accepts a mode message only from its exact parent window and only for
the matching opaque document reference plus revision. HTML and scripts remain
outside canvas metadata and model context; agents still receive only the
bounded semantic projection of an explicitly selected component. A runtime-only
child is not promoted to source authority: mutations remain guarded by the
nearest static source target and its revision.

### D-045 — Bridge lifecycle is host-owned and modes live in one auxiliary rail

**Decision:** Add a small loopback supervisor on `127.0.0.1:5177`, installed as
a user LaunchAgent, with a fixed registry for the two repo-owned processes:
the Workbench Bridge on `5176` and Isoflow Studio plus Bridge v2 on `4174`.
Expose their health and safe Start/Stop/Restart actions through a compact
tldraw-native Bridge Center. Replace the permanent top-center mode strip with
an auxiliary left Workbench rail containing one domain trigger and one
aggregate bridge-status trigger.

**Why:** A bridge cannot start itself after it is down, and asking the operator
to recover hidden local infrastructure in a terminal defeats the canvas as a
workbench. The former top strip also competed with native page chrome while
other integrations independently claimed fixed canvas coordinates. A tiny
host-owned control plane solves bootstrap without giving the browser general
shell authority, and a single rail gives the custom chrome one predictable
layout owner.

**Boundary:** The supervisor accepts no browser-supplied commands, paths, URLs,
ports, environment keys, or process IDs. Every mutation requires the resident
capability and an exact local origin; the Offline bundle receives the
capability at build time. Only processes launched by this supervisor may be
stopped or restarted. An already-running instance is reported as external.
Kanban `:3484` and the legacy ML-Intern backend `:7860` are observed external
dependencies and receive no fake lifecycle controls; terminal-first ML-Intern
does not require `:7860`. Credentials, environment, and unbounded logs never
enter the UI, canvas metadata, or prompts. Existing revision guards, validated
canvas actions, receipts, and undo remain authoritative.

## 2026-08-02 — Agents / Models domain canvas document script

### D-046 — Agents/Models document script auth, click, and Play policy

**Decision:**

1. **Token handling.** The Agents/Models tldraw offline document script
   (`scripts/agents-models-canvas-script.mjs`) uses a script-level constant
   `GROK_CONFIG_TOKEN` placeholder (`REPLACE_WITH_GROK_CONFIG_TOKEN`) for the
   loopback `grok-config-service` bearer on `127.0.0.1:5188`. Runtime override
   is `globalThis.__AM_GROK_CONFIG_TOKEN__` when set. Document scripts cannot
   read the filesystem, so operators paste/sync the token printed by the
   service stderr / `GROK_CONFIG_TOKEN` env (optional well-known file such as
   `~/.grok/config-service.token` is a documented human-side source only).

2. **Native interaction and visual grammar.** Toolbar, catalog, stage, and
   subagent surfaces use the registered `agents-models-node` custom shape, not
   stacked stock geos. The shape renders flat tldraw-native cards with real
   HTML controls; preset / APPLY / PLAY buttons write one bounded
   `meta.am.actionRequest` record to the toolbar shape. The document script
   consumes each request id once and writes the compact receipt back to that
   same shape. Stage and subagent selects update only their own bounded
   `meta.am` configuration and mark the graph modified. This supersedes the
   selection-change click heuristic.

3. **PLAY disabled in v1.** APPLY compiles the lane graph to Rhai, POSTs
   `/api/grok/workflows/save`, and renders a receipt node. PLAY does not launch
   a run; after a successful save (or an explicit PLAY click) the script only
   places a note: `play: launch via /workflow <name> in Grok`. Real in-canvas
   launch needs a Grok headless invocation path that is not yet wired through
   the loopback service.

**Why:** Matches the existing loopback bridge pattern, keeps pure layout /
catalog / preset / compile logic testable without a tldraw runtime, and avoids
pretending the canvas can start Grok runs before a headless launch API exists.

**Boundary:** The script creates or reuses a dedicated `Agents/Models` page
before reading or writing shapes. Furniture and native nodes use namespaced ids
(`am-…`); workflow nodes carry `meta.am.presetId` + stage type for compile.
Catalog rows are compacted into a bounded, scrollable native catalog payload;
fetch failures render one error section and never throw. Mesh remains
budget-expensive and is not a default. Unmodified preset graphs reuse the
service preset script with `meta.name` filled; modified graphs recompile a
best-effort skeleton. Credentials remain outside shape metadata and receipts.

### D-047 — Visual graph is authoritative; Agent and Persona are first-class nodes

**Decision:** Supersede the D-046 Stage-field / generic subagent interaction
model. The Grok toolbox is now a palette with separate Stage, Agent, and
Persona node commands plus presets, Apply, and Play. Presets place editable
native nodes and bound tldraw arrows; the current graph topology is the only
input to modified-workflow compilation. Legacy `subagent` records are accepted
as Agent nodes while old documents migrate.

Apply and Play both validate the graph and materialize it through
`/api/grok/workflows/save` with revision-safe overwrite/backup behavior. Play
returns `/workflow <name>` because Grok 0.2.118 exposes workflow launch only
inside its TUI; the canvas must not fake a headless execution endpoint.

**Persona mapping:** Rhai `agent()` has no `persona` option. A connected
Persona node stores only a persona id and optional model override. At compile
time the loopback bridge serves a bounded detail record from the allowlisted
`~/.grok/personas/<id>.toml`; the compiler embeds its instruction text into the
connected Agent prompt. The compact catalog and canvas metadata never receive
that instruction body. Disconnected Agent/Persona nodes, unresolved persona
details, and cyclic Stage dependencies fail closed with a compact receipt.

**Why:** Agents and personas are composable workflow resources, not attributes
of a monolithic editor or a Stage. This makes presets genuinely editable and
keeps the canvas graph inspectable while producing runnable Rhai without
inventing unsupported Grok syntax.

### D-048 — Native Grok workflow cards, contextual continuation, and explicit config sync

**Decision:** Replace the schematic dark Stage/Agent/Persona presentation with
the existing light workflow-card visual language. Selecting a workflow node
opens one compact top inspector; continuation buttons materialize a compatible
next node plus a real bound arrow. `Parallel agent` is the only added
convenience: it creates another Agent attached to the same Stage and therefore
maps to documented Rhai `parallel(...)` rather than inventing a new node type.

Add an explicit **Sync config.toml** command. It synchronizes only explicit
catalog-backed Agent→Model assignments into `[subagents.models]`, after a
sanitized snapshot and dry-run, with SHA-256 compare-and-swap, validation,
backup, atomic write, mode preservation, and a compact next-session receipt.
Apply and Play never invoke this command implicitly.

**Why:** The canvas should feel like the rest of tldraw Offline and make the
next legal graph operation discoverable without becoming a monolithic
configuration form. Grok configuration is broader and longer-lived than one
workflow graph, so only the documented Agent model-assignment seam is safe to
project from the canvas.

**Boundary:** No credential, raw config, persona body, MCP definition, or
arbitrary filesystem path enters tldraw metadata. Node connectivity is derived
only from arrow binding records. A stale config revision fails closed, and
config changes affect the next Grok session.

**Migration:** The first `native-light-v2` run reflows only existing
Agents/Models workflow nodes into their two lanes and removes only generated
arrows lacking two endpoint bindings. The version is recorded on the hidden
control record, so later opens preserve the user's manual layout.

### D-049 — Graph-aware placement and drag-out Agent/Persona catalog

**Decision:** Workflow nodes live in page coordinates even when visually
contained by Stage and Agent/Persona frames. Preset placement and the one-time
`native-graph-v5` migration derive positions from real bound-arrow topology
and each node's current dimensions: Stage→Stage control flow is horizontal,
Stage→Agent assignment is vertical, Persona follows its connected Agent, and
large fan-out sets use a bounded grid. Lane frames grow to contain the
resulting graph.

The canvas now contains one visible, resizeable **Agents & personas** catalog
node. Its rows are compact references only. Dragging an Agent or Persona row
outside the catalog emits the same inspected toolbar action used by the
toolbox, with a page-space drop point; the document script materializes and
selects a native node carrying only the selected catalog id and model
reference. Dropping inside the catalog is a no-op.

Stage, Agent, and Persona cards use role-specific resize minimums and CSS
container queries. Agent/Persona fields switch from two columns to one when
the card is narrow, descriptions disappear only at compact heights, and the
catalog hides secondary reference text when narrow.

**Why:** Bound arrows cannot be reliable when endpoints mix frame-local and
page coordinates, and fixed field layouts break as soon as a user resizes a
node. A visible drag source makes the live Grok inventory composable without
turning the toolbox into another monolithic form.

**Boundary:** Drag-out never carries prompt bodies, credentials, raw TOML, or
arbitrary paths. The action is undoable, inspectable, and processed by the
existing allowlisted node-materialization seam.

### D-050 — Policy, data, gate, skill, and reusable-module nodes

**Decision:** Extend the Grok visual graph with Capability, Skill, Gate, Input,
Artifact, Result, and Module nodes. Capability defaults to Grok
`capability_mode = "all"` rather than an empty permission state. A Skill stores
only a compact id discovered from the current project's direct
`.agents/skills/<id>/SKILL.md` children; the skill body never enters canvas
metadata. Input is bounded literal text, Artifact is a reference, and Result
selects one explicit output Stage.

Every Apply, Play, and config sync runs deterministic graph preflight first.
Broken bindings, orphan policy/data nodes, missing refs, malformed gates,
multiple results, cycles, and missing module definitions fail closed. Retry,
timeout, error-route, and exact tool ids remain inspectable adapter policy and
produce warnings until the Grok workflow API exposes enforceable matching
options; the UI must not present prompt text as a security boundary.

Modules are versioned project-local subgraph references under
`.grok/workflow-modules`. The visual node carries only name, version, and
parameters. Unknown definitions fail preflight instead of falling through to an
implicit prompt.

**Why:** The graph must state not only who runs, but with what authority, which
project instructions, under what condition, across which data boundary, and
with which reusable unit. Fail-closed preflight keeps this expressive surface
honest.

**Extraction:** After focused and live parity checks, the reusable contract is
copied to a clean local `grok-workflow-canvas` repository without AutoRecruit
artifacts, user configuration, credentials, or generated documents.
