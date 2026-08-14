# Bridge control plane and Workbench rail

Date: 2026-08-02
Status: accepted for incremental implementation

## Context

Canvapocalypse has two repo-owned local bridge processes:

1. the Workbench Bridge on `127.0.0.1:5176`, which multiplexes Local HTML,
   `DESIGN.md`, Stitch, native ML-Intern and Amp canvas tools, workflow LLM
   providers, terminal observation, and the Kanban proxy;
2. Isoflow Studio plus Bridge v2 on `127.0.0.1:4174`.

Starting either from a terminal makes the canvas depend on hidden operational
state. A page cannot safely solve that bootstrap problem by asking the
Workbench Bridge to start itself. The existing mode selector also occupies the
top-center native chrome while provider, workflow, terminal, and companion
controls independently claim other fixed coordinates.

## Decision

### A small host-owned supervisor

Run a separate loopback-only supervisor on `127.0.0.1:5177`. It has a compiled
service registry with exact executable, arguments, working directory, port,
and health identity. It may start, stop, and restart only the two repo-owned
processes:

- `workbench` — Workbench Bridge on `5176`;
- `isoflow` — Isoflow Studio plus Bridge v2 on `4174`.

The supervisor observes, but does not lifecycle-control, the optional Kanban
runtime on `3484` and the legacy ML-Intern backend on `7860`. Terminal-first
ML-Intern canvas tools do not depend on the legacy backend.

The supervisor is installed as a user LaunchAgent. It is intentionally small
and does not start either bridge until requested. This keeps the control plane
available when the Workbench Bridge is down without granting the canvas
general shell authority.

This LaunchAgent is the current host boundary because this workspace does not
contain the tldraw Offline Electron source. If that source is adopted later,
the fixed registry and lifecycle RPC should move into the Electron main
process. The installed application bundle must not be patched in place.

Every lifecycle request requires the same high-entropy resident capability
used by the local workbench. An exact allowlisted HTTP workbench origin may
bootstrap it during browser development. The tldraw Offline bundle receives it
at build time and keeps it in module closure. The token, environment, commands,
paths, process IDs, and raw logs never enter canvas metadata or model prompts.

The supervisor distinguishes a process it launched from an already-running
external process. It never stops or restarts an external PID. Port occupancy is
not health: each service must return its expected identity. Logs are bounded
and redacted.

### One auxiliary Workbench rail

Replace the permanent top-center mode strip with a tldraw-native auxiliary rail
at the left edge, below the native menu zone. On desktop it has two stacked
48px triggers:

- active domain and domain tools;
- aggregate bridge health.

The collapsed bridge trigger exposes only an aggregate status dot. Domain
selection, templates, provider entry points, bridge details, and lifecycle
actions live in collision-aware popovers that open to the right. At narrow
widths the rail compacts rather than spreading across the top bar.

## Placement alternatives

### A. Left auxiliary rail — chosen

This is predictable, compact, and adjacent to the existing creation tools. It
preserves the native top-left menu, top page chrome, right style panel,
bottom toolbar/navigation/minimap, and bottom-right help control.

### B. Compact top command strip

A single active-domain dropdown plus bridge button would be discoverable, but
it would continue competing with native page and application chrome. The old
four-mode bar already demonstrated this failure mode.

### C. Right-edge drawer

A drawer has room for diagnostics, but it conflicts with the native style
panel, selection inspectors, companion controls, and help corner. Global mode
and runtime state also do not belong to the selected-shape inspector.

## Boundary

- No route accepts a command, executable, path, port, URL, or environment key
  from the browser or canvas.
- Existing Amp and ML-Intern terminal sessions remain user-owned and are only
  observed.
- Provider credentials stay server-side.
- Isoflow remains restricted to explicit infrastructure, deployment,
  DevOps/DevSecOps, and contour diagrams.
- Kanban and legacy ML-Intern remain external dependencies until they define
  their own durable lifecycle ownership.
- Bridge lifecycle controls do not bypass Isoflow revision guards, Local HTML
  revision checks, canvas action validation, receipts, or undo.

## Acceptance

- With the Workbench Bridge stopped, the Bridge Center can start it without a
  terminal.
- Isoflow can be started and its exact Bridge v2 health identity is shown.
- An already-running bridge is reported as external and cannot be stopped by
  this supervisor.
- Kanban and legacy ML-Intern show observed status without fake Start/Stop
  controls.
- Modes and bridge state occupy one compact left rail and do not cover native
  top or bottom controls.
- Browser and Offline paths both require resident authority; foreign origins
  and arbitrary process requests fail closed.
