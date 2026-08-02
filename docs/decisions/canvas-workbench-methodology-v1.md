# Canvas workbench methodology v1

Date: 2026-08-02

Status: accepted

Supersedes: `domain-bound-pages-and-freeform.md`,
`companion-dispatch-protocol.md`, and the agreed but previously unwritten
frozen/working context-layer methodology.

Extends (does not replace): `universal-ai-workbench.md`,
`amp-companion-worker-architecture.md`,
`context-efficient-companion-routing.md`,
`bridge-control-plane-and-workbench-rail.md`.

## Context

Each project folder owns one tldraw Offline document (`.tldraw`). Earlier ADRs
fixed four hardcoded domain pages, a Freeform page, companion defaults, and a
loopback dispatch path. That model was incomplete:

- Domains must grow (the first proof is **Agents / Models**, the Grok config
  domain). Hardcoding page names and bindings in product code cannot keep up.
- Context for coding agents must distinguish **decided** material from
  **in-progress** material without treating screen geometry as the authority.
- Companions (Amp, Hermes, ML-Intern, Grok Build) need one audited entry point,
  per-domain capability sets, and write isolation so agents do not fight the
  user for coordinates.
- The original tldraw-agent web/worker contour is legacy; the primary contour is
  tldraw Offline desktop and its official local HTTP API.

This ADR consolidates domain pages, Freeform routing, frozen/working context
layers, companion dispatch, document templating, and the primary runtime
contour into one accepted methodology.

## Decision

### 1. Domain pages come from a per-document domain registry

Domain pages are **not** hardcoded in application logic. They come from a
per-document **domain registry** stored inside the `.tldraw` document via its
document script.

Default registry:

| Domain page | Role |
| --- | --- |
| Architecture | System structure, decisions, change radar |
| UI / UX | Flows, wireframes, design-system / Stitch surface |
| Product / PM | Roadmap, delivery, opportunity decisions |
| ML / LLM | Experiments, eval pipelines, model delivery |
| Agents / Models | Grok config domain (agents, personas, model slots) |

Entering a domain page activates its mode automatically. The active mode is
always visible, with a **pin** control: pin keeps the current mode while the
user browses other pages; unpin restores page-bound mode switching.

### 2. Freeform page is always present and unbound

Every document template creates a **Freeform** page by default. Freeform is
intentionally unbound: any mode may be chosen manually, or via auto-route.

Rules:

- The auto-route classifier runs **only** on Freeform.
- Auto-route must show its routing verdict visibly.
- Auto-route must offer one-click undo of the applied route.

Mode authority:

- Domain pages: page binding wins (unless the mode is pinned).
- Freeform: manual choice or visible auto-route wins; Freeform has no default
  companion.

### 3. Frozen / working layers are per-node metadata (not screen geometry)

Context layers are **node status metadata**, not fixed screen regions that
agents invent.

- Every domain page has two auto-managed frames: **Decided** and **In progress**.
- Nodes carry lifecycle status: `proposed` → `accepted` → `superseded`, plus a
  review date when accepted or superseded.
- **Frozen** means `accepted`. Frozen material is what coding agents receive as
  a compact read-only digest.
- The **working** layer is full-fidelity context for active work.
- Frozen nodes cannot be edited without explicit **unfreeze**.
- Freeze and unfreeze are logged actions.

Agents write only into their assigned **working** frame. They do not place
shapes by free coordinate competition with the user ("no coordinate wars").

### 4. Canvas is source of truth; repo ADRs are a projection

`accepted` (frozen) nodes export to `docs/decisions` with one user action.
The canvas remains the source of truth; the repo ADR tree is its projection,
not an independent decision store that can drift silently.

### 5. Companion dispatch protocol

1. **Single entry point.** The loopback workbench bridge is the only dispatch
   surface. Companions are never invoked with ambient raw canvas authority.
2. **Per-domain capability sets.** Companions receive curated tools only, for
   example `tldraw_capabilities` / `tldraw_describe_capability` /
   `tldraw_execute`, and `canvas.workflow` with a real Play action. Raw `/exec`
   is a bridge-internal primitive and is never exposed as a companion tool.
3. **Per-companion scoped tokens with audit.** Tokens are scoped, audited, and
   not shared as a flat localhost authority across companions.
4. **Working-layer lease/lock.** When two companions touch one page, the
   working layer is leased/locked so concurrent writers do not collide.
5. **Page defaults:**

| Page | Default companion |
| --- | --- |
| Architecture | Amp (existing Ampcode thread; no canvas request launches `amp -x`) |
| UI / UX | Hermes (Stitch / DESIGN.md / Local HTML) |
| Product / PM | Hermes |
| ML / LLM | ML-Intern |
| Agents / Models | Hermes |
| Freeform | No default; explicit or auto-routed pick per request |

6. **Grok Build CLI** is invoked **point-wise** (targeted tasks), not as a
   resident page companion.
7. Agents mutate only their assigned working frame.
8. **Token metrics** are logged per dispatch. Bounded/frozen context savings are
   measured, not asserted as slogans.

### 6. Document template generator is the versioned single source

A document template generator script is the versioned single source for page
setup, frames, and registry defaults. The **registry version** is embedded in
the generated document so runtime and tooling can detect drift.

### 7. Primary runtime contour: tldraw Offline desktop

- The web/worker contour of the original tldraw-agent repo is **frozen as
  legacy**.
- **Primary contour:** tldraw Offline desktop via its official local HTTP API
  (`localhost:7236`, bearer from `server.json`, re-read per shell call), using
  `/exec` and document scripts as bridge-internal primitives behind curated
  capabilities.

GUI automation and direct binary `.tldraw` file edits by companions remain
prohibited.

## Consequences

- Adding a domain (for example Agents / Models) is a registry + template change,
  not a product hardcode.
- Mode follows page by default; pin covers intentional cross-page work without
  corrupting domain pages.
- Freeform absorbs mixed and exploratory work; auto-route is transparent and
  reversible.
- Coding agents receive a compact frozen digest plus full working context,
  which bounds token cost and keeps decided material stable.
- Repo ADRs stay projected from canvas decisions, reducing dual-source drift.
- One audited bridge path covers Amp, Hermes, ML-Intern, and point-wise Grok
  Build with per-domain capability sets and working-frame write isolation.
- Template versioning makes document setup reproducible and inspectable.
- New work targets Offline desktop; legacy web/worker is maintenance-only.

## Risks / open questions

| Risk | Notes |
| --- | --- |
| Domain registry growth | Too many domains dilute focus; registry needs review/curation policy. |
| Freeform as dumping ground | Without hygiene, Freeform absorbs work that should graduate to a domain page. |
| Frozen staleness | Accepted nodes can go out of date; review dates and supersede status need operational use. |
| Localhost flat token authority | Mitigated by per-companion scoped tokens and audit in the bridge; still requires careful token handling. |
| Auto-route silent-misfire | Classifier mistakes are dangerous if invisible; visible verdict + one-click undo are mandatory. |

## Relation to prior ADRs

| Prior record | Relation |
| --- | --- |
| `domain-bound-pages-and-freeform.md` | Superseded: fixed four hardcoded domains → per-document registry + Agents/Models + pin + Freeform auto-route rules. |
| `companion-dispatch-protocol.md` | Superseded: defaults, capability sets, bridge entry, working-layer authority, Grok point-wise, metrics folded here. |
| Frozen/working context layers | First written form of the agreed methodology (per-node status, Decided/In progress frames, digest vs full, export). |
| `universal-ai-workbench.md` | Still foundational for packs, providers, and bounded request contract. |
| `amp-companion-worker-architecture.md` | Still foundational for Amp/ML-Intern/Oracle ownership. |
| `context-efficient-companion-routing.md` | Still foundational for route budgets and capability hydration. |
| `bridge-control-plane-and-workbench-rail.md` | Still foundational for supervisor + workbench rail. |
