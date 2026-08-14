# Companion dispatch protocol for tldraw Offline

> Superseded by `canvas-workbench-methodology-v1.md`.

Date: 2026-08-02

Status: superseded

Extends: `amp-companion-worker-architecture.md`,
`context-efficient-companion-routing.md`,
`domain-bound-pages-and-freeform.md`

## Context

tldraw Offline ships an official local control API (default `localhost:7236`,
bearer token from `server.json`, re-read per shell call) with two contours:

- `/api/doc/:id/exec` — one-off live canvas edits with `editor` in scope;
- document scripts (`script/main.js`) — durable behavior applied by the app
  watcher and confirmed via `script-status`.

Companions (Amp, Grok, Hermes, ML-Intern) must use this API. GUI automation
and direct `.tldraw` file edits are prohibited. A companion that receives raw
`exec` freedom draws disconnected rectangles; a companion that receives a
curated capability surface produces runnable work. The existing
`ml-intern-canvas-tool` bridge already demonstrates the curated shape:
`tldraw_capabilities`, `tldraw_describe_capability`, `tldraw_execute` over
capability ids (`canvas.inspect`, `canvas.layout`, `canvas.workflow`,
`canvas.result.read`, ...) with bounded areas, idempotency, leases, and
receipts.

## Decision

### 1. Domain pages own default companions

| Page | Default companion |
|---|---|
| Architecture | Amp (the user's existing Ampcode thread; no canvas request launches `amp -x`) |
| UI / UX | Hermes (Stitch / DESIGN.md / Local HTML providers) |
| Product / PM | Hermes |
| ML / LLM | ML-Intern via the canvas-tool bridge |
| Freeform | No default; explicit or auto-routed pick per request |

Grok is invoked point-wise (image generation, independent review) and is never
a resident page companion.

### 2. Companions receive shared tools, not raw canvas access

Each companion is granted a per-domain **capability set** — the named,
validated tools (workflow nodes with a real Play action, layout, native
assets, result readback) plus the user's registered workflow tools. Raw
`/exec` is a bridge-internal primitive, never exposed as a companion tool.
Everything a companion does is an idempotent, revision-guarded
`tldraw_execute` that returns a compact receipt.

### 3. Dispatch flows through the loopback workbench bridge

No companion is invoked directly from the canvas. The canvas stores opaque
provider references; the bridge owns sessions, credentials, mapping, and the
lease/idempotency machinery. Requests resolve to `canvas-edit`, `domain-edit`,
or `inquiry` with bounded context (frozen layer as digest, working layer full)
before prompt assembly.

### 4. Mutation authority is tiered

- Companions mutate the **working** layer only.
- Freezing is a user action; unfreeze requires the user.
- Document-script (durable) changes require an explicit user-approved slice;
  companions propose, the user applies.

## Consequences

- One protocol covers web preview and offline desktop clients; adding a
  companion means registering a capability set and a route, not a new bridge.
- Context stays laser-focused: bounded areas, frozen digests, receipts.
- The bridge remains the single audit point for every canvas mutation.
