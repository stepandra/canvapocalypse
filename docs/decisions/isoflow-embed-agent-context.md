# Isoflow embed provider and agent context

Date: 2026-07-23

## Visual thesis

Isoflow is a full-canvas diagram instrument embedded inside tldraw, not a
small workflow card. Provider chrome stays quiet: one recognizable toolbar
entry, a narrow inspector, and a large resizable diagram surface. Native Isoflow
icons and geometry remain authoritative inside the embed.

## Content plan

1. Embed provider picker: AutoRecruit contours, AutoRecruit ideal, and eval lab.
2. Canvas embed: project and view reference only; the Isoflow bridge owns the
   model.
3. Inspector: bridge health, project, view, revision, and compact node count.
4. Agent context: selected Isoflow view, bounded node summaries, connectors,
   and available views.
5. Agent actions: selected-view inspection plus revision-guarded, explicitly
   confirmed patch proposals.

## Interaction thesis

- Creating an embed places it in the visible canvas center and opens the
  provider inspector.
- Switching a view updates both the iframe URL and the compact context supplied
  to the agent.
- Mutation proposals are dry-run only after an action has fully streamed.
  Applying the normalized exact operations requires explicit confirmation at the
  captured bridge revision; conflicts fail visibly instead of overwriting newer
  work.
- Isoflow stays limited to Isoflow projects, views, nodes, contours, and flows.
  Companion memory such as Decision Graph and Change Radar belongs to a separate
  provider and does not get bootstrapped into an Isoflow project.

## Decisions

### Isoflow Studio is the source of truth

The tldraw document stores only `provider`, `baseUrl`, `projectId`, and `viewId`
in embed metadata. Full Isoflow models and icon catalogs stay in the repo-local
`isoflow-studio/` module, avoiding duplicated state and large canvas documents.

### Context is selected and bounded

Only selected Isoflow embeds are eligible for agent context, and only for an
explicit DevOps, DevSecOps, deployment, or infrastructure-contour request. The
prompt part includes a maximum of 32 nodes and 48 connectors plus view names and
the current revision. The full model and icon catalog are fetched only for an
explicit search or mutation action. General architecture, ML/MLOps, UI/UX,
product work, widgets, and ordinary diagrams remain native tldraw work even
when an Isoflow embed exists elsewhere on the canvas.

### Bridge transactions remain the mutation primitive

View lifecycle, item, connector, rectangle, text box, color, and legend changes
use revision-guarded Bridge v2 transactions. Full-model replacement remains
available for imports and recovery, not as the default for ordinary agent edits.
The embedded agent handoff is narrower than the full Bridge: it accepts only
operations whose `viewId` equals the uniquely selected embed view. View
lifecycle and project-global item, color, or legend operations fail closed
because they cannot be guaranteed to affect only that view.

### Cross-view writes are never inferred

An embed elsewhere on the current page is not mutation authority. No selected
embed means no target, multiple selected Isoflow embeds are ambiguous, and a
project or view mismatch is rejected before any bridge request. Creating,
duplicating, activating, or removing views requires a separate explicit
cross-view workflow.

### Provider endpoints are local and allowlisted

The first provider targets `127.0.0.1:4174` or `localhost:4174`. Arbitrary remote
embed origins are not accepted. This keeps iframe and mutation authority narrow
while still supporting the local lab.

### Provider-independent agent contract

Isoflow context and actions are part of the canvas agent mode, not coupled to a
specific model vendor. The selected embed inspector is a passive handoff to the
existing Architect thread; it never launches a model or creates a new thread.
The selected embed's `projectId`, `viewId`, and revision define the complete
mutation target. Proposals are normalized, size-bounded, dry-run, digest-bound,
and shown with their exact operation parameters before confirmation.

The retired loopback `POST /isoflow/agent` endpoint returns HTTP 410. It does
not parse a browser prompt, resolve a workspace, or spawn `amp -x`. Ordinary
workflow LLM nodes remain a separate execution surface and do not gain Isoflow
repository or mutation authority.

### Offline bridge failure is context, not a chat failure

If a selected embed points at an unavailable bridge, prompt assembly emits a
small `Isoflow bridge unavailable` context record instead of rejecting the whole
agent request. No mutation is attempted until the bridge is healthy again.

### Secrets stay out of diagrams

Isoflow embeds and actions carry no LLM credentials. Existing OpenRouter and
compatible-provider keys remain session-only and never enter tldraw metadata,
Isoflow models, logs, or committed files.

### Action and prompt registries are Fast Refresh safe

During live verification, Vite re-evaluated the new action modules and exposed
that the registries treated the same type from a refreshed module instance as a
programming collision. Registration now replaces the previous constructor for
that type. The resolved registry still contains one implementation per type,
while local development no longer requires a full reload after every change.
