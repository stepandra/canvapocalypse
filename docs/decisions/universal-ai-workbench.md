# Universal AI Workbench

Status: implemented for the first local-first slice; review required
Date: 2026-07-27

## Context

Canvapocalypse already combines a native tldraw editor, validated agent actions,
editable LLM workflow nodes, a terminal-first ML-Intern bridge, and selected
Isoflow embeds. The missing layer is a coherent workbench contract: people and
agents need the same bounded canvas surface for architecture, ML/LLM, UI/UX,
and product planning without loading every specialist prompt, tool schema, or
external document into every request.

## Decision

Use one persistent native tldraw canvas with four switchable canonical domain
packs: `architecture`, `ml`, `uiux`, and `product`.

| Pack | Native starter artifacts | Default agent surface |
| --- | --- | --- |
| Architecture | System Context, Decision Graph, Change Radar | tldraw |
| ML / LLM | Experiment Loop, Evaluation Pipeline, Model Delivery Map | tldraw |
| UI / UX | User Flow, Wireframe Screen Set, Component Anatomy | tldraw |
| Product / PM | Product Roadmap, Delivery Timeline, Opportunity Decision | tldraw |

Pack selection changes the compact palette and capability policy. It does not
hide shapes, move data to another store, or choose an external provider.

The ML pack exposes the editable workflow-node profile. Product/PM instead
exposes a native planning profile: Initiative, Milestone, Timeline lane,
Dependency, Risk, Decision, Outcome, and Status/Receipt. ML provider controls,
prompt nodes, agents, and workflow runners are not part of the Product palette.
Global tool registration remains only so existing documents continue to load.

Isoflow is a separate native provider for explicitly selected infrastructure,
deployment, networking, DevOps/DevSecOps, and security-contour work. General
architecture, ML/MLOps, UI/UX, workflow, and product requests never route
through Isoflow.

## Artifact contract

Templates create editable native shapes and real arrow bindings. A small
`shape.meta.workbench` record provides stable artifact identity, pack, kind,
status, references, and schema version. Semantic relations store stable
artifact endpoints while native tldraw arrow bindings remain authoritative for
geometry.

Full ADR prose, specifications, and source documents remain visible canvas
content or real project-relative document references. Metadata is a bounded
index, not a second document model.

### UI/UX Design System provider

UI/UX may add one native Design System node backed by a local `DESIGN.md`.
The canvas stores an opaque document reference, SHA-256 revision, title, and
compact drift state. The source path and Markdown body remain host-side. The
node renders only a bounded semantic projection: theme and atmosphere,
palette, typography, component summaries, and layout principles.

Agent inspection requires exactly one selected Design System node in the UI/UX
pack. The host fetches the expected revision, rechecks selection and revision
after the asynchronous read, and sends only the bounded projection. This slice
is read-only; source mutation is deferred until a separately reviewed,
revision-guarded diff and receipt contract exists.

### UI/UX Stitch provider

Google Stitch is a server-only generation/editing provider, not a second
canvas or an agent-wide tool surface. The loopback bridge owns the SDK and
credentials. Generated HTML is downloaded and imported into the existing Local
HTML Mockup registry; tldraw stores only opaque provider references and the
managed document revision. An explicitly selected Design System node may add
its bounded semantic projection to a Stitch operation. The underlying
`DESIGN.md`, raw HTML, signed URLs, provider IDs, and Stitch tool inventory
never enter the canvas or an ordinary agent prompt.

The UI/UX pack presents `Stitch`, `DESIGN.md`, and `Local HTML` in one visible
provider dock. Full operation and security details are recorded in
`docs/decisions/stitch-uiux-provider.md`.

## Agent request contract

Every routed request has:

1. a route: inquiry, native canvas edit, or selected Isoflow edit;
2. an explicit selection or bounded area;
3. a compact capability manifest;
4. only the schemas that the host has hydrated for this request;
5. a permission boundary and a compact result receipt.

Selection-only requests fail when nothing is selected. The viewport is not a
silent fallback. Ordinary native edits do not receive screenshots, full canvas
state, Isoflow context, or Isoflow schemas. Earlier chat events are compacted
behind a local history reference.

Provider adapters such as Amp, Codex, MCP, and ML-Intern receive the same route,
bounded context, capability manifest, and permission boundary. Credentials
remain outside canvas metadata and prompts.

### The Architect is the existing Ampcode thread

The architecture pack does not create a browser-owned architect, a hidden
subagent, or a new `amp -x` process. The Architect is the user's existing
Ampcode thread: it owns the architecture conversation, judgment, and decision
cycle and reaches the currently open tldraw Offline document through a thin
loopback plugin.

The trusted local Amp plugin resolves the workspace's sole regular,
non-symlink `.canvas/*.tldraw` file to exactly one open tldraw Offline document.
It uses the resident's short-lived canvas binding internally; other open
documents are ignored and never closed. Missing, ambiguous, symlinked,
escaped, unopened, or duplicate project targets fail closed, and discovery
never downgrades to a web preview. The Amp plugin exposes exactly
`tldraw_capabilities`, `tldraw_describe_capability`, and `tldraw_execute`.
Discovery returns compact IDs, the thread hydrates exactly one capability, and
execution carries only an explicit selection or user-approved bounded area.
Validated native actions return a compact inspectable/undoable receipt.
Terminal receipts require a fresh per-lease token and the exact canvas binding,
neither of which is exposed to the model. Browser Origins are resident
executors only; capability discovery, hydration, execution, and request
polling are reserved for the local Amp/terminal producer.

Amp thread IDs, credentials, full chat history, document paths, raw whole-canvas
state, and unrestricted filesystem content never cross that boundary or enter
canvas metadata. The repo-local skill contract is
`.agents/skills/tldraw-offline-workbench/SKILL.md`; plugin activation is
documented in its `references/activation.md`.

## ML-Intern

The terminal ML-Intern process remains the planner and owner of its history,
tools, and approvals. Canvapocalypse is its selected-canvas executor and
receipt surface.

The adapter exposes exactly three small public tools:

- `tldraw_capabilities`
- `tldraw_describe_capability`
- `tldraw_execute`

Discovery returns IDs only. Description hydrates one capability contract.
Execution is bound to one active canvas client, one explicit selection/area,
and an idempotency key. `POST /ml-intern/canvas-tool/invoke` remains an
unadvertised compatibility endpoint for older local clients.

The adapter in `scripts/ml_intern_tldraw_tool.py` is repo-local. Registration
inside the terminal ML-Intern checkout remains an explicit external install
step; this repository does not claim to have modified that checkout.

## Mutation and history

Canvas mutations continue through existing validated tldraw actions and local
store diffs. Isoflow mutations remain revision-guarded Bridge v2 transactions.
Workflow runs and operation receipts are append-only records; repeated runs do
not overwrite earlier output.

## Deferred

- A second UI document engine beyond native tldraw plus managed Local HTML.
- Direct or agent-authored `DESIGN.md` source mutation.
- High-fidelity interactive UI component shapes.
- Autonomous multi-agent orchestration inside the browser.
- External issue tracker or document system as an implicit source of truth.
- Broad filesystem authority from a canvas plugin.

These may be added as provider adapters only after the native artifact and
bounded capability contracts prove stable.
