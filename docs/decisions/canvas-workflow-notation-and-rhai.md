# Canvas workflow notation and Rhai mapping

Date: 2026-08-02

Status: accepted

Extends: `canvas-workbench-methodology-v1.md`,
`workflow-provider-output-runs.md`

## Context

The **Agents / Models** domain needs a canonical visual language for Grok Build
workflows. Without one shared notation, canvas sketches, companion proposals, and
saved scripts drift apart: one agent draws freeform boxes, another invents stage
names, and the runnable truth (`.rhai` under `~/.grok/workflows`) stays opaque.

Base notation is taken from the pi-workflow README
(`github.com/AgwaB/pi-workflow`) but corrected for Grok Build's actual
configuration model: control stages live separately from first-class Agent and
Persona nodes. Shape and stroke semantics still cover fixed vs
variable/signaling work, fan-out, fan-in, loops, and dynamic control.

Grok Build's execution truth is not the drawing:

- Workflows are `.rhai` scripts in `~/.grok/workflows/*.rhai`.
- Launch is `/workflow` (new run).
- Default `agent_budget` is 128 (max 1024).
- Runs are **immutable**: edit a copy and start a new run; never mutate a
  running process in place.
- No cross-process resume; resume is not exactly-once.
- Budget-limited runs cannot bare-resume when slots are exhausted.

The canvas notation must compile to that model and project run status back onto
nodes without pretending the graph is a live process mutator.

## Decision

### 1. Canonical canvas notation

Workflow graphs use exactly two horizontal lanes:

| Lane | Role | Node shape |
| --- | --- | --- |
| **STAGE** | Orchestration, terminals, control | Rounded rectangles |
| **AGENT / PERSONA** | Executing agents and reusable behavior overlays | Native cards |

STAGE nodes carry a **monospace semantics subtitle** (stage type or control
label). Agent nodes select an optional Grok agent definition and model override.
Persona nodes select a reusable persona independently; Persona is never a Stage
dropdown. Legacy `subagent` records are accepted as Agent nodes during
migration.

#### Shape semantics

| Shape / stroke | Meaning |
| --- | --- |
| Agent card | Work (agent body / budget spender) |
| Persona card | Compile-time behavior overlay |
| Rounded rectangle | Orchestration or terminal (stage control, planner, reduce, end) |
| Solid stroke | Fixed structure (known count, fixed topology) |
| Dashed stroke | Variable or signaling (dynamic count, `+N more`, review-signal, control probes) |

Dashed nodes include variable worker packs (`+N more`) and review/signal
markers that are not fixed roster members.

#### Edge semantics

| Edge | Meaning |
| --- | --- |
| Fan-out arcs | STAGE → many Agent workers (parallel / foreach) |
| Fan-in arcs | Many workers → STAGE reduce / synthesis |
| Loop back-edge | Bounded iteration return to a STAGE control node |
| Dashed control edges | Dynamic control path; labels **`adjust`** and **`enough`** |

Dynamic patterns use controller → planner → work with dashed `adjust` /
`enough` edges rather than rewriting a live run graph.

#### Native workflow-card styling (exact rules)

The earlier dark operational mockup was only a schematic reference and is
superseded. Stage, Agent, and Persona use the same light tldraw-native workflow
card anatomy as Text Input, Prompt Template, LLM, and Rich Output:

- one restrained semantic accent rule (violet Stage, teal Agent, amber Persona);
- white/off-white surfaces, native divider and text tokens, and the same compact
  shadow/radius rhythm as the existing workflow nodes;
- one header with semantic icon, title, type, and compact state;
- one short description, editable body, and `N IN · N OUT` footer;
- small edge ports derived from real tldraw arrow bindings;
- no full-canvas dark panels, fake lanes-as-editors, neon, or decorative chrome.

Selecting a workflow node opens one compact inspector in front of the canvas.
It repeats only editable fields and exposes valid next-node continuations.
Choosing a continuation creates the new native node and its bound arrow in one
undoable operation. `Parallel agent` attaches another Agent to the same Stage;
it is an affordance over the documented `parallel(...)` mapping, not a new
Grok node type.

#### Responsive geometry and graph placement

Workflow cards are resizable native shapes. Their field layout is calculated
from the card's current dimensions: Agent and Persona controls use two columns
when space permits and collapse to one column when narrow; compact-height cards
remove the explanatory paragraph before removing controls. The catalog has its
own larger minimum size and scrolls internally.

Workflow roots are page children, not children of the visual lane frames.
Preset placement and migration use the bound-arrow graph plus each card's real
width and height:

- Stage→Stage control edges remain horizontal;
- Stage→Agent assignments stay in the Stage's column;
- a connected Persona is placed below its Agent;
- fan-out sets use up to three columns and grow the Agent/Persona lane;
- Stage and Agent/Persona frames grow to contain the computed graph.

This avoids mixed parent-coordinate arrows while keeping the lanes as visual
grouping furniture.

#### Live Agent/Persona catalog

The canvas exposes one visible, resizable **Agents & personas** catalog node.
It stores only bounded catalog references and offers filtering. Dragging a row
outside the catalog creates and selects the corresponding native Agent or
Persona node at the page-space drop point. The drag is translated into the
same inspected action request as toolbox/inspector creation, so the resulting
mutation is undoable and leaves a compact receipt. Models remain available to
node select controls but are not drag-materialized as agents.

### 2. Stage palette and Rhai mapping

The STAGE palette is fixed at six types. Each maps to a Rhai construction used
when compiling the graph:

| Stage type | Canvas role | Rhai mapping |
| --- | --- | --- |
| **single** | One worker invocation | One `agent()` call |
| **foreach** | Parallel fan-out over items | `parallel()` panel spending `agent_budget` slots |
| **reduce** | Fan-in synthesis after workers | Fan-in synthesis `agent()` call |
| **loop** | Bounded re-entry | Bounded iteration with an **explicit round cap** |
| **dag** | Ordered multi-step chain | Sequential `agent()` with resume-style chaining |
| **dynamic** | Planner/controller driven work | Planner/controller + **iterate-by-new-run** (runs are immutable) |

Notes:

- **foreach** must show budget pressure: each parallel slot consumes
  `agent_budget` (default 128, max 1024).
- **loop** never implies unbounded recursion; the round cap is visible on the
  STAGE node and emitted into the script.
- **dynamic** does not mutate a running workflow. "Adjust" means compile a
  revised script (or re-enter via a new run), consistent with immutable runs.
- **dag** chaining may use Grok's resume-style sequential pattern inside one
  script, but still cannot claim cross-process resume semantics.

### 3. One-click presets

Presets are first-class product affordances, not documentation only.

- One click instantiates a **full graph skeleton** on the canvas (both lanes,
  nodes, edges).
- The same action **compiles** a ready-to-save `.rhai` skeleton via the local
  service endpoint:

  `GET|POST /api/grok/workflow-presets`

- Preset ids: `single`, `fanout`, `reduce`, `loop`, `dag`, `dynamic`, `mesh`.

Rules:

- Presets are **starting structures, not black boxes**. Every node remains
  editable after instantiation.
- Saving a preset-derived workflow writes under `~/.grok/workflows` with
  **backup** of any replaced file (same backup policy as other Grok config
  service writes).
- `mesh` is multi-worker dense connectivity; it is budget-expensive and must
  surface expected slot cost in the UI before launch.

### 4. Run model (Play)

Play is defined as:

1. **Compile** the canvas graph to Rhai.
2. **Save** the `.rhai` (with backup if overwriting).
3. Produce the compact launch receipt `/workflow <name>`.

The installed Grok CLI currently exposes `/workflow` only in the interactive
TUI. Therefore Play compiles and saves the graph but does not fake a headless
launch. It returns the exact command to run until Grok exposes a safe resident
launch endpoint.

Never mutate a running run in place. Editing the canvas after Play starts a
*next* run when the user plays again; historical runs remain append-only /
immutable records (aligned with `workflow-provider-output-runs.md`).

#### Status projection

While a run is observed, project back onto nodes:

- **phase** (queued / running / blocked / done / failed),
- **roster** (which Agent slots are active),
- **budget spent / remaining** (relative to `agent_budget`).

Projection uses 6px status dots and monospace readouts; it does not rewrite
graph topology mid-run.

#### Limitations surfaced in UI

The inspector / run panel must state clearly:

- No cross-process resume.
- Resume is not exactly-once.
- Budget-limited runs cannot bare-resume when slots are exhausted.
- Dynamic "adjust" requires a new run (or a saved copy), not live graph surgery.

## Consequences

- Agents / Models domain has one shared language for companions, user sketches,
  and saved Grok workflows.
- Canvas remains design-time source for structure; `.rhai` + `/workflow` remain
  execution truth.
- Presets lower the cost of correct patterns (fan-out, reduce, loop caps) without
  hiding editability.
- Status projection reuses the workbench's existing run-history mindset:
  Play creates a new run id; the graph is not a mutable process handle.

## Graph compiler contract

- The toolbox is a palette and command surface only. It contains Stage, Agent,
  Persona, preset, Apply, and Play controls; it does not contain a monolithic
  Rhai textarea.
- Canvas nodes and real bound tldraw arrows are the workflow source of truth.
  Presets merely place editable graph skeletons.
- Apply and Play compile the current bounded graph, overwrite the named
  user-scoped workflow through the guarded loopback bridge (which preserves a
  backup), and return a compact receipt.
- Grok's Rhai `agent()` API has no direct `persona` option. A connected Persona
  node is therefore hydrated by id only during compilation through
  `GET /api/grok/personas/:id`; its bounded instructions are embedded in that
  Agent's prompt. The instruction body is never stored in tldraw metadata or
  the compact catalog.
- The compiler rejects disconnected Agent/Persona nodes, unresolved Persona
  instructions, and cyclic Stage dependencies. Credentials remain resident in
  the bridge and never enter the graph or generated script.

## `config.toml` synchronization contract

The visual workflow and Grok's global configuration remain separate sources of
truth. Apply and Play only compile/save `.rhai`; they never modify
`~/.grok/config.toml`.

An explicit **Sync config.toml** action may project only Agent nodes that have
both a catalog-backed Agent id and catalog-backed model reference into
`[subagents.models]`. The sequence is:

1. request a sanitized snapshot containing a SHA-256 revision and writable
   assignments only;
2. submit a dry-run against that exact revision;
3. commit the same bounded assignment set only if the revision still matches;
4. preserve unrelated sections, comments, file mode, and create a backup before
   atomic replacement;
5. return a compact diff/receipt stating that changes apply to the next Grok
   session.

Persona definitions, graph topology, prompts, provider credentials, MCP
configuration, and arbitrary TOML are outside this mutation boundary. A stale
revision fails with `409 revision_conflict`.

## Risks

- **Unverified Rhai skeletons.** Generated `.rhai` from notation and presets is
  not considered correct until executed against live Grok Build. Treat compile
  output as a best-effort skeleton until a green run proves the mapping.
- **Notation divergence from pi-workflow.** Any deliberate difference (styling,
  dark operational rules, Grok-specific stage→Rhai mapping, immutable-run
  dynamic control) must stay documented in this ADR rather than silently
  forking the README diagrams.
- **Mesh preset budget cost.** Dense multi-agent mesh graphs can exhaust
  `agent_budget` quickly. UI must show expected spend before Play; companions
  must not instantiate mesh as a default for simple tasks.
