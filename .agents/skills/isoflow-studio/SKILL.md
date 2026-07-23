---
name: isoflow-studio
description: Operate and extend the repo-local Isoflow Studio, its Bridge v2 API, and the Canvapocalypse tldraw embed adapter. Use for Isoflow project sessions, native nodes and icons, views, connectors, contours and legends, infrastructure records, repo-backed documents, semantic flows, bridge transactions, or tldraw-to-Isoflow agent integration.
---

# Isoflow Studio

Treat `isoflow-studio/` as the canonical local Isoflow application and
`client/isoflow/` as the tldraw adapter. Keep generic tldraw architecture tools
outside Isoflow: Decision Graph and Change Radar are separate capabilities.

## Start with repository context

1. Resolve the repository root with `git rev-parse --show-toplevel` and work from
   there.
2. Read the applicable `AGENTS.md`, then `isoflow-studio/README.md`.
3. Inspect `git status --short` before editing and preserve unrelated changes.
4. Read only the files needed for the requested seam. Do not ingest every Pro
   export, full model, or vendored source tree up front.

For a ready-to-paste Amp task, read
`references/kickoff-prompt.md`. For Bridge v2 routes and mutation discipline,
read `references/bridge-v2.md`.

## Ownership map

- `isoflow-studio/src/`: local editor and project modules.
- `isoflow-studio/scripts/lib/`: Bridge v2, history, render, workspace, and Pro
  export adapters.
- `isoflow-studio/workspaces/`: infrastructure, canonical document links, and
  ordered flows.
- `isoflow-studio/vendor/isoflow/`: patched Isoflow CE source and distribution.
- `client/isoflow/`: tldraw provider, compact inspection, agent actions, and
  overlay UI.
- `scripts/workflow-llm-bridge.mjs`: loopback model bridge. Isoflow Amp requests
  resolve the selected workspace's allowlisted `projectRoot` and run from that
  owning source repository; ordinary workflow LLM nodes remain isolated.

## Run the stack

Use three explicit processes when testing the full integration:

```sh
npm run isoflow:dev
npm run workflow:bridge
npm run dev -- --port 5175
```

Isoflow Studio is fixed at `127.0.0.1:4174`, the model bridge at
`127.0.0.1:5176`, and Canvapocalypse at port `5175`.

Use current Amp modes only: `low`, `medium`, `high`, or `ultra`. Never introduce
the removed `rush`, `deep`, `smart`, or `large` mode names.

## Work loop

1. Inspect the narrow project/view state through Bridge v2.
2. Search native item or icon IDs before inventing them.
3. For mutations, use the current revision, dry-run first when the operation is
   broad, and submit one bounded transaction with a stable idempotency key.
4. Verify the returned revision and re-inspect only the changed view or records.
5. For code changes, run the narrow test first, then:

```sh
npm run isoflow:test
npm run isoflow:build
npm test
npm run build
```

Record non-obvious product decisions under `isoflow-studio/docs/decisions/`.
Commit or push only when the user asks.

## Context discipline

- Prefer `POST /inspect` with a specific `kind`, `viewId`, `ids`, and small
  `limit`; fetch full state only for full-model replacement or history work.
- Keep stable Isoflow item IDs as the join key across views, infrastructure,
  documents, and flows.
- Documents must remain real Markdown or MDX files under the configured project
  root. Do not build an internal document CMS.
- Keep one shared model with multiple views; do not clone semantic components
  per audience.
- Use native Isoflow icons when possible and preserve the legend/color contract.
- Do not mix architecture semantics into Isoflow merely because both are visual.
