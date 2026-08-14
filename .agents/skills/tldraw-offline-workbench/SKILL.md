---
name: tldraw-offline-workbench
description: Gives the existing Ampcode architecture thread bounded live access to its workspace-scoped tldraw Offline workbench. Use when the Architect must inspect selected canvas artifacts, create or revise native tldraw diagrams, or return an undoable canvas mutation receipt.
---

# tldraw Offline workbench

## Ownership

You are the Architect in the existing Ampcode thread. Keep the user's
architecture conversation, judgment, and decision cycle in this thread.

- Never launch `amp`, `amp -x`, or a second Architect thread.
- Never put an Amp thread ID, credential, full transcript, raw canvas dump, or
  unrestricted filesystem content into a tool call, prompt, or canvas metadata.
- Treat the Amp workspace's sole regular, non-symlink `.canvas/*.tldraw` file as
  the only canvas target. That canonical document must be open in exactly one
  tldraw Offline window. Other open documents are ignored and never closed.
  The trusted local plugin resolves its resident binding; the model never
  supplies or receives a document path or binding. Discovery never downgrades
  to a web preview.

## Three-tool loop

Use exactly these loopback tools, in this order:

1. `tldraw_capabilities` discovers compact capability IDs; it does not return
   schemas or canvas state.
2. `tldraw_describe_capability` hydrates exactly one smallest suitable
   capability.
3. `tldraw_execute` applies that one bounded request and returns a compact
   receipt.

Discover again after an expired binding. Do not cache or combine hydrated
schemas. If the project canvas is missing, ambiguous, symlinked, outside the
workspace, unopened, or open in duplicate windows; if there is no selection
for a selection-only operation; or if an area or receipt lease is invalid,
stop fail-closed and report the compact error.
Use the tools from the local Amp process, never from a browser page; browser
Origins are resident executors and cannot act as capability producers.

## Context and mutation boundary

- Default to the explicit selection. Use an area only when the user explicitly
  identifies or approves a bounded area.
- Inspect semantic artifact summaries, stable IDs, relations, and native
  bindings; do not request a screenshot or whole-document serialization by
  default.
- Mutate only through validated native tldraw actions.
- Keep each execution inspectable and undoable. Return operation count, affected
  stable IDs, status, and receipt reference; do not echo the full source state.
- After a failed or unknown mutation result, inspect before retrying. An
  idempotency key prevents duplication but does not authorize blind replay.

## Surface routing

Architecture, system design, ML/MLOps, UI/UX, wireframes, workflows, and product
planning use native tldraw. Use Isoflow Bridge v2 only when the request
explicitly targets a selected native Isoflow view for infrastructure,
deployment, networking, DevOps/DevSecOps, or security-contour work. Never use
Isoflow merely because the subject is architecture.

## Activation

Read [references/activation.md](references/activation.md) before installing or
debugging the Amp plugin. It contains the repo-local source boundary and a
ready-to-paste instruction for the existing Architect thread.
