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
5. Agent actions: search native icons/nodes, revision-guarded patching, and
   creating a new view from a compact template.

## Interaction thesis

- Creating an embed places it in the visible canvas center and opens the
  provider inspector.
- Switching a view updates both the iframe URL and the compact context supplied
  to the agent.
- Agent mutations run only after an action has fully streamed. Every write uses
  the bridge revision; conflicts fail visibly instead of overwriting newer work.
- Isoflow stays limited to Isoflow projects, views, nodes, contours, and flows.
  Companion memory such as Decision Graph and Change Radar belongs to a separate
  provider and does not get bootstrapped into an Isoflow project.

## Decisions

### Isoflow Studio is the source of truth

The tldraw document stores only `provider`, `baseUrl`, `projectId`, and `viewId`
in embed metadata. Full Isoflow models and icon catalogs stay in the repo-local
`isoflow-studio/` module, avoiding duplicated state and large canvas documents.

### Context is selected and bounded

Only selected Isoflow embeds are sent to the agent. The prompt part includes a
maximum of 32 nodes and 48 connectors plus view names and the current revision.
The full model and icon catalog are fetched only for an explicit search or
mutation action.

### Bridge transactions remain the mutation primitive

View lifecycle, item, connector, rectangle, text box, color, and legend changes
use revision-guarded Bridge v2 transactions. Full-model replacement remains
available for imports and recovery, not as the default for ordinary agent edits.

### New Isoflow views use native icons

Agents creating an Isoflow view reuse icon IDs already present in the target
project and search the native icon catalog before adding unfamiliar node kinds.

### Provider endpoints are local and allowlisted

The first provider targets `127.0.0.1:4174` or `localhost:4174`. Arbitrary remote
embed origins are not accepted. This keeps iframe and mutation authority narrow
while still supporting the local lab.

### Provider-independent agent contract

Isoflow context and actions are part of the canvas agent mode, not coupled to a
specific model vendor. The selected embed inspector exposes a narrow Amp/Grok
control surface. Amp uses the current Low/Medium/High/Ultra dial and runs from
the selected workspace's allowlisted `projectRoot`, reads that source
repository's applicable `AGENTS.md`, code, specs, ADRs, and linked documents,
and explicitly loads the Canvapocalypse Isoflow skill. Grok reuses the
session-only OpenRouter connection and model catalog. Both receive the same
bounded view contract and return the same validated revision-guarded action
types; no provider-specific Isoflow mutation format is maintained. Ordinary
workflow LLM nodes remain isolated and do not gain repository authority.

The browser sends only `projectId`. It cannot supply an arbitrary filesystem
path: the loopback bridge validates the ID and resolves `projectRoot` from the
repo-owned workspace JSON before starting Amp in that directory.

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
