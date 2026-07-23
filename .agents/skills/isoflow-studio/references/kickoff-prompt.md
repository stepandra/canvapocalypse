# Amp kickoff prompt

Paste this into an Amp thread started from the Canvapocalypse repository root:

This prompt is for implementation work on the integration itself. Amp requests
sent from the Isoflow canvas use a different boundary: the bridge resolves the
selected workspace's `projectRoot` and starts Amp inside that owning source
repository so diagram work can be grounded in its files.

```text
Use the $isoflow-studio skill.

Work from the current repository and keep full repository context. Read the
applicable AGENTS.md, isoflow-studio/README.md, and the narrow bridge/provider
files needed for this task. Inspect git status first and preserve unrelated
changes.

Task:
<replace this line with the concrete Isoflow or tldraw↔Isoflow task>

Keep the boundary strict:
- Isoflow Studio owns native Isoflow models, views, nodes, connectors,
  rectangles, text boxes, contours/legend, infrastructure records, documents,
  flows, and Bridge v2.
- Canvapocalypse owns the tldraw canvas, agents, and the Isoflow embed adapter.
- Decision Graph and Change Radar are not Isoflow features.

Use targeted Bridge v2 inspection rather than dumping the whole model. Use
native icon IDs, stable item IDs, revision guards, dry runs for broad changes,
and idempotency keys. Documents must link to real Markdown/MDX in the owning
project. Do not create a second document store.

Do not stop at a plan. Implement the task, run the narrow tests plus the
relevant Isoflow Studio and Canvapocalypse builds, and report exact validation
results and remaining blockers. Do not commit or push unless I ask.
```

Recommended invocation for a hard cross-boundary task:

```sh
amp --mode high
```

For a bounded non-interactive task, save the prompt to a file and run:

```sh
amp --mode high -x "$(sed 's/<replace this line with the concrete Isoflow or tldraw↔Isoflow task>/Implement the requested task here./' prompt.md)"
```
