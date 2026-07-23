# Bridge v2 quick reference

Base URL: `http://127.0.0.1:4174/api/isoflow`

## Discovery and targeted reads

```sh
curl -s http://127.0.0.1:4174/api/isoflow/health
curl -s http://127.0.0.1:4174/api/isoflow/capabilities
curl -s -X POST \
  http://127.0.0.1:4174/api/isoflow/projects/autorecruit-contours/inspect \
  -H 'content-type: application/json' \
  -d '{"kind":"view","viewId":"vi_contours_reworked","limit":40}'
```

Supported inspect kinds include `state`, `view`, `items`, `icons`, `colors`,
`legend`, `connectors`, `rectangles`, `textBoxes`, `workspace`, `nodes`,
`documents`, `flows`, and `history`.

## Mutation discipline

Read the current revision immediately before mutating. Send bounded operations
to:

```text
POST /api/isoflow/projects/:projectId/transact
```

The payload is:

```json
{
  "baseRevision": 12,
  "actor": "amp:isoflow-studio",
  "idempotencyKey": "task-name:project:view:12",
  "dryRun": true,
  "operations": []
}
```

Use a dry run for broad edits. Resubmit against the same revision with
`dryRun:false` only after inspecting the proposal. On `409`, re-read the
revision; do not blindly replay against newer state.

Workspace records use:

```text
GET  /api/isoflow/projects/:projectId/workspace
POST /api/isoflow/projects/:projectId/workspace/transact
```

Model history is available under `/history`; use `/history/diff` before a
revert. SSE events are available at `/events`.

## Operation families

Model transactions support view lifecycle, item add/update/move/remove,
connector add/update/remove, rectangle add/update/remove, text box
add/update/remove, color updates, and legend replacement. Capability discovery
is authoritative if this list drifts.
