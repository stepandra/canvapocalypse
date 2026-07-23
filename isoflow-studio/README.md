# Isoflow Studio

Repo-local Isoflow editor and Bridge v2 runtime for editable infrastructure and
software-system diagrams. Markdown documents remain canonical files in their
owning repositories, while Isoflow owns diagram geometry, topology, contours,
and views.

## Run

From the Canvapocalypse repository root:

```sh
npm run isoflow:install
npm run isoflow:dev
```

Isoflow Studio listens on `http://127.0.0.1:4174`. The available projects are:

- `/?project=autorecruit-contours`
- `/?project=autorecruit-ideal`
- `/?project=eval-lab`

The Canvapocalypse tldraw app embeds these projects through its Isoflow provider.
Run it separately with `npm run dev -- --port 5175`.

## What is local and durable

- `public/sessions/*.pro.json` contains the source diagram sessions.
- `workspaces/*.json` contains repo-backed infrastructure, document, and flow
  metadata with optimistic revisions.
- `.runtime/isoflow-bridge/` contains generated runtime revisions and history and
  is intentionally ignored.
- `fixtures/pro-exports/` contains the original Pro exports used to regenerate
  deterministic sessions.
- `vendor/isoflow/` contains the patched Isoflow CE source and built package used
  by this module.

Documents link to real Markdown or MDX files under the configured project root;
the Studio does not maintain a second document database. Set
`ISOFLOW_PROJECT_ROOT` to override the project root for all local workspaces.

## Commands

```sh
npm test
npm run compile
npm run build
npm run dev
```

`npm run compile` regenerates the contour project from the committed Pro export.

## Bridge v2

The Vite server exposes the local bridge under `/api/isoflow`:

- capability discovery and health;
- compact, targeted inspection;
- revision-guarded model and workspace transactions;
- search across items and native icons;
- SSE change events;
- revision history, diff, and revert;
- render descriptors and repo-backed document reads.

Use the repo-local Amp skill at
`.agents/skills/isoflow-studio/SKILL.md` for context-efficient inspection and
changes. The ready-to-paste kickoff prompt is in that skill's
`references/kickoff-prompt.md`.

## Ownership boundary

Isoflow Studio owns the Isoflow model, the project workspaces, and its Bridge v2
API. Canvapocalypse owns the tldraw embed/provider and translates agent actions
into bridge transactions. Decision Graph and Change Radar are separate tldraw
capabilities and are not part of Isoflow Studio.
