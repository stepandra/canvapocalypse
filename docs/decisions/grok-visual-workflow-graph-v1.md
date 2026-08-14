# Grok visual workflow graph v1

Status: implemented contract  
Scope: Grok Build CLI workflows authored through native tldraw Offline nodes

## Outcome

The visual graph is the editable source for a bounded Grok workflow. A save is
allowed only after deterministic preflight. The compiler translates supported
node semantics to Rhai and returns a compact receipt; it never claims that
metadata-only policy is enforced by Grok.

## Node contract

### Execution

- **Stage** defines an ordered unit of work.
- **Agent** selects a Grok agent type and optional model.
- **Persona** is a compile-time prompt overlay attached to an Agent or Stage.
- **Capability** attaches to exactly one Agent. Its default and persisted value
  is `all`; supported values are `all`, `read-only`, `read-write`, and
  `execute`. The compiler emits Grok's documented `capability_mode`.
- **Skill** attaches to exactly one Agent. It stores only a project-local skill
  id discovered under `.agents/skills/<id>/SKILL.md`. The full skill body is
  neither copied into tldraw metadata nor returned by the compact catalog.

### Control and data boundaries

- **Gate** sits between two Stages. It supports `not-empty`, `contains`, and
  `equals`, plus a false branch of `stop` or `skip`. Retry, timeout, and
  error-route fields are inspectable policy hints until the Grok workflow API
  exposes matching revision-safe runtime options; preflight reports them as
  warnings rather than pretending to enforce them.
- **Input** supplies bounded literal text to one Stage.
- **Artifact** supplies a compact artifact reference, never artifact contents,
  to one Stage.
- **Result** selects one Stage as the workflow output boundary.

### Reuse

- **Module** is a versioned, parameterized subgraph reference. Version and
  params are required and preserved in generated workflow metadata. A module
  without a hydrated project definition fails preflight. The current adapter
  accepts only definitions from `.grok/workflow-modules/*.json`; arbitrary paths
  are not accepted.

## Connections

- Stage → Stage is control flow.
- Stage ↔ Agent is execution assignment.
- Agent/Stage ↔ Persona is a behavior overlay.
- Agent ↔ Capability and Agent ↔ Skill are permission/context attachments.
- Stage → Gate → Stage is a guarded control edge.
- Input/Artifact → Stage is a bounded data edge.
- Stage → Result selects the returned value.
- A Module may replace a Stage-sized subgraph only when its definition is
  present in the project catalog and passes the same preflight.

All edges are derived from native tldraw arrow bindings. Metadata-only edge
claims are ignored.

## Preflight

`Preflight`, `Apply`, `Play`, and `Sync config.toml` inspect the current bound
graph. Errors fail closed; warnings remain visible in the receipt.

Errors include:

- missing Stage;
- Stage dependency cycle outside an explicit bounded loop preset;
- orphan Agent, Persona, Capability, Skill, Gate, Input, Artifact, Result, or
  Module;
- missing catalog references;
- more than one Capability attached to an Agent;
- malformed Gate topology;
- multiple Result boundaries;
- unknown or unhydrated Module definitions.

Warnings include:

- exact tool ids recorded on a Capability when the active Grok adapter cannot
  enforce a per-tool allowlist;
- non-default retry, timeout, or error-route hints;
- a workflow without an explicit Result boundary.

The receipt contains only counts, codes, warnings, generated workflow name,
and revision/path references. It does not echo prompts, skill bodies, secrets,
or raw project state.

## Project skill catalog

The bridge scans only direct children of the configured project
`.agents/skills` directory. A valid entry has a regular `SKILL.md` file.
Catalog output is bounded and contains:

- stable id;
- frontmatter name;
- clipped description;
- project-relative reference.

Symlinks and arbitrary filesystem paths are not followed.

## Standalone extraction

After focused tests and live parity pass, the reusable graph contract, compiler,
preflight, bridge adapter, tldraw node surface, tests, and documentation are
copied into a clean `grok-workflow-canvas` repository. The extraction does not
include AutoRecruit artifacts, local credentials, generated tldraw documents,
or user configuration.

