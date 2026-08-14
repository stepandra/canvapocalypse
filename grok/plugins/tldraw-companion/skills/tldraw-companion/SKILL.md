---
name: tldraw-companion
description: >
  Use when Grok must inspect or mutate a live tldraw Offline workbench.
  This plugin owns the three companion tools. Not Amp, not Play/Rhai,
  not raw Offline /exec.
model: grok-composer-2.5-fast
metadata:
  short-description: "Grok plugin: tldraw companion tools"
---

# tldraw Companion (Grok plugin)

This is a **Grok plugin**, not a Hermes skill and not the Amp plugin.
It registers three MCP tools on the Grok session:

1. `tldraw_capabilities`
2. `tldraw_describe_capability`
3. `tldraw_execute` — always stamped `actor: grok` / `source: grok-plugin`

Call them in that order. After inspect, mutate only with that receipt's
`contextRef`. Max 24 actions.

Routing stays as-is: workspace → sole `.canvas/*.tldraw` → one open
window → opaque `canvasBinding`. Do not pick the frontmost window.

## Do not

- Call Amp tools or edit `amp/plugins/tldraw-offline-workbench.ts`
- Use `~/skills/tldraw-offline` or Offline `/exec`
- Dump `api.getShapes()`, screenshots, or SKILL.md onto the canvas
- Use Grok Play / Rhai (`:5187`) for Offline mutate
- Put credentials or skill bodies in shape props
- Attach `WorkflowLayoutBinding` to user nodes
