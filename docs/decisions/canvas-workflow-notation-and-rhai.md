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
(`github.com/AgwaB/pi-workflow`): two lanes (STAGE control / SUBAGENT workers),
shape and stroke semantics for fixed vs variable/signaling work, and edge
patterns for fan-out, fan-in, loops, and dynamic control.

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

### 1. Canonical canvas notation (two lanes)

Workflow graphs use exactly two horizontal lanes:

| Lane | Role | Node shape |
| --- | --- | --- |
| **STAGE** | Orchestration, terminals, control | Rounded rectangles |
| **SUBAGENT** | Worker agents that spend budget | Circles |

STAGE nodes carry a **monospace semantics subtitle** (stage type or control
label). SUBAGENT nodes are worker roster slots (named or `+N more` overflow).

#### Shape semantics

| Shape / stroke | Meaning |
| --- | --- |
| Circle | Work (subagent / agent body) |
| Rounded rectangle | Orchestration or terminal (stage control, planner, reduce, end) |
| Solid stroke | Fixed structure (known count, fixed topology) |
| Dashed stroke | Variable or signaling (dynamic count, `+N more`, review-signal, control probes) |

Dashed nodes include variable worker packs (`+N more`) and review/signal
markers that are not fixed roster members.

#### Edge semantics

| Edge | Meaning |
| --- | --- |
| Fan-out arcs | STAGE → many SUBAGENT workers (parallel / foreach) |
| Fan-in arcs | Many workers → STAGE reduce / synthesis |
| Loop back-edge | Bounded iteration return to a STAGE control node |
| Dashed control edges | Dynamic control path; labels **`adjust`** and **`enough`** |

Dynamic patterns use controller → planner → work with dashed `adjust` /
`enough` edges rather than rewriting a live run graph.

#### Dark operational styling (exact rules)

Adapt pi-workflow structure to the product's dark operational UI — no decorative
chrome:

- **Flat** fills only (no gradients, no shadows, no pills).
- **1px** borders on all nodes and edges.
- **2px** corner radius on rounded-rect STAGE nodes and tags.
- **Monospace** refs and semantics subtitles (JetBrains Mono / system mono).
- **6px** colored status dots for run phase / health on nodes.
- **10px uppercase** lane labels (`STAGE`, `SUBAGENT`).
- Status and budget readouts use the same restrained status language as other
  workbench instruments (no neon baked into shapes).

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
3. **Launch a new run** via `/workflow`.

Never mutate a running run in place. Editing the canvas after Play starts a
*next* run when the user plays again; historical runs remain append-only /
immutable records (aligned with `workflow-provider-output-runs.md`).

#### Status projection

While a run is observed, project back onto nodes:

- **phase** (queued / running / blocked / done / failed),
- **roster** (which SUBAGENT slots are active),
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
