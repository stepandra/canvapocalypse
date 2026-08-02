# Amp companion-worker architecture

Date: 2026-07-24

Status: accepted for incremental implementation

Scope: ownership, delegation, authority, and mutation protocol for Amp,
ML-Intern, Isoflow, native tldraw, and independent DevSecOps review

## Context

Canvapocalypse already has two useful but different execution paths:

- the native tldraw agent builds a route-specific prompt and applies registered,
  validated tldraw actions;
- Isoflow Studio owns native infrastructure models and exposes bounded semantic
  reads and revision-guarded writes through Bridge v2.

The active routing implementation in `client/agent/companionRouting.ts` already
chooses prompt parts and action schemas before prompt construction. The former
browser-owned headless Amp endpoint is now an unconditional HTTP 410 tombstone,
and the Architecture/Isoflow canvas mounts no composer, provider selector, or
model invocation path. The Architect is the user's existing Ampcode thread and
no canvas request may launch `amp -x` or a replacement Architect. The remaining seams do not by
themselves define who may make architectural decisions, when an independent
security review is needed, or how a powerful external runtime such as ML-Intern
receives bounded authority.

ML-Intern is an existing, mature runtime rather than a prompt fragment. It owns
session persistence, model routing, context compaction, approvals, research
tools, sandboxes, Hugging Face Jobs, repository operations, telemetry, artifact
provenance, and CLI/API transports. Reimplementing that behavior as a new Amp
subagent would duplicate logic and load the primary conversation with details
that it does not need. Conversely, invoking ML-Intern's headless/yolo path with
ambient host credentials would make its effective authority wider than the
dispatch that requested the work.

DevSecOps guidance and independent DevSecOps review are also different jobs. A
primary Amp thread can use the DevSecOps skill as a decision lens. When a risky
decision needs a genuinely independent second opinion, the existing read-only
Oracle is a better review boundary than a permanent DevSecOps child thread.

This ADR extends
`docs/decisions/context-efficient-companion-routing.md` and the Bridge v2 rules
in `.agents/skills/isoflow-studio/references/bridge-v2.md`. It replaces the
earlier idea of globally disabling powerful ML-Intern capabilities: capability
is allowed when explicitly granted and confined to declared filesystem and
remote-resource scopes.

AutoRecruit diagrams and contracts use **arctl** for the resource-control plane,
its sidecars, and ar-hands integration. **Resource Materializer** is a legacy
term and must not be introduced into new labels or interfaces. Hermes Agent is
an external/vendor identity; visual assets use its official mark or the compact
Hermes symbol `☤`, not an invented AutoRecruit product icon.

The selected source sheet for future AutoRecruit-owned architecture icons is
`isoflow-studio/assets/generated/autorecruit-architecture-icons-contact-sheet-v1.png`.
It has the strongest grid and silhouette consistency of the reviewed candidates,
but remains a source sheet: each accepted icon must be simplified and converted
to a legible vector asset before use at normal Isoflow sizes. Vendor identities
such as Hermes Agent, Tailscale, Iroh, and provider logos remain vendor assets
rather than candidates for AutoRecruit-owned redraws.

## Decision

Use four distinct roles with one owner for each responsibility:

1. **Existing primary Ampcode thread** owns the user conversation,
   classification, planning, architecture, approval requests, and final
   synthesis. It is the Architect; it is not spawned by the canvas.
2. **Oracle** provides independent, read-only DevSecOps review when triggered by
   risk or explicitly requested. It is not a durable companion worker.
3. **Terminal ML-Intern** remains the owner of its long-lived CLI conversation,
   agent loop, research tools, and approvals. Canvapocalypse is exposed to that
   runtime through three narrow built-in canvas tools and returns compact
   receipts.
4. **Diagram executors** implement an already-decided visual change. Isoflow is
   a bounded semantic surface executor for native infrastructure views; native
   tldraw remains a resident-client action profile reached from the existing
   Amp thread through three loopback tools.

```text
User
  |
  v
Primary Amp -- optional independent review --> Oracle (read-only advice)
  |
  +-- bounded execution grant -------------> ML-Intern provider
  |                                             |
  |                                             +--> scoped files/repos/jobs/artifacts
  |
  +-- semantic DiagramBrief ----------------> Isoflow executor
  |                                             |
  |                                             +--> preview -> confirm -> apply
  |
  +-- discover -> hydrate one -> execute ----> resident tldraw Offline client
                                                |
                                                +--> validated native actions
                                                     -> compact undoable receipt
```

The primary thread may use DevSecOps skills directly. Loading a skill does not
create independence; Oracle does. No permanent `devsecops-review` worker, random
child thread, or additional autonomous reviewer is introduced.

### Primary Amp owns judgment

The primary thread is the already-running user-visible Ampcode conversation. It
is never recreated with `amp`, `amp -x`, a canvas-side model call, or a hidden
thread. It:

- determines the user's intended outcome and explicit target;
- chooses whether the work is advisory, research, code/resource execution,
  native tldraw mutation, or native Isoflow mutation;
- applies the DevSecOps skill when security guidance is relevant;
- decides whether Oracle review is required;
- creates bounded dispatches and grants;
- presents material decisions and mutation previews to the user;
- interprets worker results and remains accountable for the final answer.

Regexes or lightweight classifiers may recommend a route or show an advisory UI
hint. They cannot create a grant, select a remote repository, authorize a
mutation, suppress confirmation, or invoke Oracle by authority of the match
alone.

The primary thread receives compact results, artifact references, findings, and
receipts. It should not absorb complete worker transcripts, full tool schemas,
raw provider state, whole icon catalogs, or ML-Intern's implementation context.
It also never sends or stores its thread ID, full history, credentials, raw
whole-canvas state, document path, or unrestricted filesystem content as part of
a tldraw request.

### Existing Amp thread reaches the live tldraw Offline document

The Amp adapter is a thin loopback plugin, not a provider process. It exposes
exactly three tools:

1. `tldraw_capabilities` returns compact capability IDs and a short-lived
   manifest bound to the resident client;
2. `tldraw_describe_capability` hydrates one selected capability schema;
3. `tldraw_execute` submits one bounded operation and waits for its compact
   receipt.

The tldraw Offline client is resident beside the open editor. It owns the live
editor handle and resolves the currently open document from its client binding;
Amp does not choose a document by path or receive a raw document dump.
Unqualified discovery resolves exactly one active Offline desktop and never a
web preview. A web Origin cannot register itself as an Offline client. The
binding and a fresh per-lease receipt token remain resident-only transport
state, so only the canvas that leased an operation may close it. Browser
Origins are denied producer capability discovery, description, execution, and
request polling; they retain only bound resident polling, leasing, and receipt.
Selection is the default context. An area is allowed only when the user
explicitly identifies or approves a bounded area. Inspection returns semantic
artifact summaries and native binding data under hard budgets.

Mutations continue through validated native tldraw actions and return the
operation count, affected stable IDs, terminal status, and receipt reference.
They remain inspectable and undoable. A missing/expired Offline binding,
multiple active Offline desktops, wrong/expired receipt lease, empty selection
for a selection-only request, invalid area, validation failure, timeout, or
unknown result fails closed; the Architect must inspect before retrying.

The repo-local operating contract is
`.agents/skills/tldraw-offline-workbench/SKILL.md`. The canonical Amp plugin
source lives at `amp/plugins/tldraw-offline-workbench.ts`; the activation
instructions use that three-tool adapter and fail closed if it is unavailable.
Installing the existing
`~/.config/amp/plugins/isoflow-canvas.ts` is not a substitute because it targets
native Isoflow, not the tldraw Offline editor.

### Independent DevSecOps review uses Oracle

Oracle is invoked only when independent judgment materially improves the
decision, for example:

- a trust boundary or credential flow is being introduced or moved;
- a sandbox, network-egress, identity, tenant-isolation, or supply-chain control
  is changing;
- a destructive or externally published operation has unusual blast radius;
- the primary thread has competing plausible security designs;
- the user explicitly requests an independent security review.

The Oracle task includes the proposed decision, relevant files, intended
invariants, known trade-offs, and the exact review question. Oracle returns
findings, dissent, and recommendations to the primary thread. It is advisory and
read-only: it does not receive tldraw or Isoflow mutation authority, modify the
working tree, launch ML jobs, or become the owner of the final decision.

Routine DevSecOps-aware work does not require Oracle. The primary thread uses
the DevSecOps skill and proceeds, avoiding a permanent reviewer tax on every
request.

### ML-Intern is terminal-primary, not a browser-owned Amp agent

The current integration preserves the existing ML-Intern runtime and its active
terminal session. Canvapocalypse does not create a fresh web session for each
canvas turn. ML-Intern first calls `tldraw_capabilities`, hydrates one selected
contract with `tldraw_describe_capability`, and performs the bounded operation
with `tldraw_execute`. The adapter queues one native-canvas request and waits
for a compact receipt. The visible canvas widget is connection/queue/receipt
UI, not a second prompt composer or run button.

The broader grant adapter below remains the target contract for future
filesystem, repository, job, sandbox, publication, and delegation authority.
The current canvas tool grants none of those capabilities.

Powerful operations are not globally prohibited. A dispatch may authorize:

- shell execution and file reads, writes, edits, or deletes;
- sandbox creation and use;
- Hugging Face Jobs or other allowlisted compute providers;
- repository create, update, upload, publish, or delete operations;
- notifications to declared destinations;
- trace publication to declared destinations;
- bounded subdelegation to declared providers.

Every such operation must be inside the dispatch's explicit grant. A grant is
default-deny outside its declared roots, repositories, namespaces, providers,
destinations, budgets, and deadline; it is not a blanket reduction of what
ML-Intern can do.

```ts
type MlInternGrant = {
  grantId: string
  version: "1"
  dispatchId: string
  expiresAt: string
  filesystem: {
    readRoots: string[]
    writeRoots: string[]
    deleteRoots: string[]
    workingDirectoryRoots: string[]
  }
  shell: {
    allowed: boolean
    executableAllowlist?: string[]
    environmentRefs: string[]
    maxProcesses: number
  }
  network: {
    egress: "deny" | "allowlisted"
    destinationAllowlist: string[]
  }
  repositories: Array<{
    provider: "github" | "huggingface" | "local-git"
    namespace: string
    repository?: string
    permissions: Array<
      "read" | "create" | "update" | "upload" | "publish" | "delete"
    >
  }>
  sandboxes: {
    allowed: boolean
    providerAllowlist: string[]
    maxConcurrent: number
    ttlSeconds: number
  }
  jobs: {
    allowed: boolean
    providerAllowlist: string[]
    namespaceAllowlist: string[]
    hardwareAllowlist: string[]
    maxConcurrent: number
    maxCostUsd?: number
    maxRuntimeSeconds: number
  }
  notifications: {
    channelAllowlist: string[]
    destinationAllowlist: string[]
  }
  traces: {
    sharing: "private" | "workspace" | "explicit-destination"
    destinationAllowlist: string[]
  }
  delegation: {
    allowed: boolean
    providerAllowlist: string[]
    maxDepth: number
    maxConcurrent: number
    grantMode: "exact-or-narrower"
  }
  approvals: {
    requiredFor: Array<
      | "filesystem-delete"
      | "repository-create"
      | "repository-delete"
      | "external-publish"
      | "paid-job"
      | "notification"
      | "trace-share"
      | "subdelegate"
    >
  }
}
```

The concrete policy may omit optional capabilities rather than encoding empty
global bans. Path checks resolve canonical paths and perform the operation on
the resolved handle using no-follow/openat-style resolution, so a symlink swap
cannot separate the check from access. Traversal escapes are rejected and each
operation is compared against its operation-specific root: read permission does
not imply write permission, and write permission does not imply delete
permission. A working directory is execution context, not additional authority,
and must itself resolve inside an authorized root. Repository and job scopes are
checked against resolved provider identity and namespace, not model-supplied
URL prefixes.

The adapter injects only grant-scoped credential references. It does not inherit
the parent process's complete environment, filesystem reach, SSH agent, cloud
profile, GitHub token, or Hugging Face token. Credential values remain outside
prompts, artifacts, traces, canvas metadata, diagram models, and receipts.
A resolved credential's own provider authority must be no broader than the
grant scope it serves: use repository- or namespace-scoped tokens rather than
account-wide tokens. Shell and sandbox processes receive only credentials named
in `environmentRefs`, and their egress is constrained by `network`. If the
adapter cannot constrain egress, provider credentials are not exposed to shell
or sandbox processes; the grant-scoped provider tool performs the operation.

Subdelegation is permitted when explicitly granted. A child receives the same
or a strictly narrower, shorter-lived grant; neither ML-Intern nor a child can
self-expand roots, permissions, budgets, destinations, provider identity, or
delegation depth. The child's remaining delegation depth is strictly less than
the parent's, and child cost, runtime, process, and concurrency budgets draw
down the parent's budgets instead of duplicating them.

Each dispatch also has iteration, process, concurrency, runtime, and optional
cost budgets. Approval is an explicit state transition, not a prompt sentence.
An approval binds the operation preview, target resource, grant version, and
expiry. A changed operation requires a new approval. `expiresAt` must not be
later than the parent dispatch deadline.

The adapter must not use today's headless/yolo mode as a security boundary.
Yolo may remain an internal interaction mode only after the adapter has removed
ambient authority and installed the scoped grant enforcement layer.

ML-Intern returns a compact receipt containing:

- grant ID and version;
- canonical filesystem roots and actual paths touched;
- repositories and provider resources read or mutated;
- sandboxes and jobs created, including terminal state and cost when available;
- artifacts, notifications, and traces published;
- child dispatches and the narrowed grants they received;
- approvals consumed;
- redacted errors and unresolved/unknown outcomes.

Research artifacts are data, not instructions. Referencing an artifact cannot
expand filesystem, network, repository, diagram, or onward delegation authority.

### Isoflow is a bounded surface executor

Isoflow work may run in a narrow companion process so the primary thread does
not carry the native model, bridge schemas, or icon catalog. That process is an
executor, not an architectural or DevSecOps authority. It follows a semantic
brief produced by the primary thread and may report ambiguity instead of
inventing product/security facts.

The primary-to-Isoflow contract is a `DiagramBrief`:

```ts
type DiagramBrief = {
  objective: string
  targetAudience?: string
  facts: Array<{
    statement: string
    evidenceRef?: string
  }>
  nodes: Array<{
    stableKey: string
    label: string
    role: string
    zone?: string
  }>
  relations: Array<{
    from: string
    to: string
    meaning: string
    direction: "one-way" | "two-way"
  }>
  trustBoundaries: Array<{
    name: string
    members: string[]
    rationale: string
  }>
  constraints: string[]
  unknowns: string[]
  artifactRefs: string[]
}
```

The executor receives exactly one allowlisted Isoflow project and view, a
`baseRevision`, operation and context budgets, and only the Bridge capabilities
required for the intent. It can inspect the selected view and search the native
icon catalog lazily. It cannot treat an artifact or an icon search result as a
new fact or as authority over another project/view.

All Isoflow mutations use this sequence:

1. inspect the selected project/view and record its revision;
2. validate the `DiagramBrief` and proposed semantic operations;
3. call Bridge v2 in dry-run mode at that `baseRevision`;
4. return a compact preview: operations, affected items/connectors, validation
   warnings, and expected revision transition;
5. wait for explicit confirmation of that exact preview; the host produces a
   token bound to the operation-set digest, target project/view,
   `baseRevision`, and expiry;
6. transact the confirmed operations at the same `baseRevision`, presenting the
   confirmation token; the host or Bridge rejects a mismatched digest, target,
   revision, or expired token before the executor receives apply capability;
7. return a compact receipt with operation count and resulting revision.

Confirmation is never inferred from the original edit request. If the revision
changes after preview, the executor returns `revision-conflict`; it does not
retry, replay, silently rebase, or apply a newly generated patch. The primary
thread must inspect again and issue a new preview.

The current UI path applies returned actions immediately and the existing agent
prompt demonstrates `dryRun: false`. Those behaviors must be replaced by the
preview/confirm/apply protocol before the Isoflow companion is treated as a safe
mutation executor.

### Native tldraw execution remains in the resident client for v1

Native tldraw already has registered action schemas, sanitization, action
utilities, record diffs, and accept/reject history. Keep execution as a routed
resident-client action profile for v1. The existing Ampcode Architect thread
reaches that profile through discovery, one-schema hydration, and execution; it
does not create another tldraw worker or another Amp process merely for
symmetry.

ML/MLOps output, widgets, generic visual explanations, and ordinary canvas work
use native tldraw. Native Isoflow is reserved for explicit infrastructure
projects/views. Infrastructure subject matter drawn on a native tldraw target
still uses tldraw. There is no automatic cross-surface fallback.

### Dispatch types make invalid combinations unrepresentable

Do not use one envelope with independent `specialist`, `domain`, and `target`
strings that permits nonsensical combinations. Use a discriminated union whose
variant owns its target and grant type:

```ts
type ArtifactRef = {
  id: string
  version: string
  digest: string
  mediaType: string
}

type CompanionDispatch =
  | {
      kind: "ml-intern"
      dispatchId: string
      idempotencyKey: string
      intent: string
      contextRefs: ArtifactRef[]
      grant: MlInternGrant
      deadlineAt: string
    }
  | {
      kind: "isoflow"
      dispatchId: string
      idempotencyKey: string
      target: { projectRef: string; viewRef: string; baseRevision: number }
      brief: DiagramBrief
      maxOperations: number
      deadlineAt: string
    }
  | {
      kind: "tldraw"
      dispatchId: string
      idempotencyKey: string
      target: { documentRef: string; selectionRef?: string; areaRef?: string }
      actionTypes: string[]
      deadlineAt: string
    }
```

Oracle review is intentionally not a `CompanionDispatch` variant. It uses the
existing Oracle review interface and remains read-only.

All adapters return a small shared lifecycle result:

```ts
type CompanionResult = {
  dispatchId: string
  status: "completed" | "failed" | "timed-out" | "cancelled" | "conflict"
  mutationOutcome: "none" | "confirmed" | "unknown"
  summary: string
  artifactRefs: ArtifactRef[]
  receiptRef?: string
  error?: { code: string; retryable: boolean }
}
```

An idempotency key prevents duplicate dispatch creation but does not authorize
blind replay after an unknown mutation outcome. Reconcile the actual target
first. Any terminal status with `mutationOutcome: "unknown"` blocks redispatch
until reconciliation records the actual state of the target.

## Implementation sequence

Implement the smallest vertical slices rather than starting with a universal
dispatcher, plugin registry, artifact platform, and reconciliation service.

### Slice 0: existing Ampcode Architect to resident tldraw Offline

- Keep the existing Ampcode thread as the Architect and conversation owner.
- Add the repo-owned Amp plugin at
  `amp/plugins/tldraw-offline-workbench.ts`; install it by symlink rather than
  copying it into user configuration.
- Register only `tldraw_capabilities`, `tldraw_describe_capability`, and
  `tldraw_execute`.
- Reuse the resident client lease/binding core so the currently open Offline
  document is resolved client-side.
- Prove selection-only and explicit-area inspection, one validated native
  mutation, compact receipt, undo, expired binding, forged receipt rejection,
  web-preview non-downgrade, and multiple-Offline fail-closed behavior.
- Remove `amp -x` from the architecture workbench path. The selected Isoflow
  overlay is a passive handoff/review surface for external revision-guarded
  proposals; stale callers to the legacy backend receive the HTTP 410 tombstone.

### Slice 1: safe existing-thread Isoflow execution loop

- Retire the browser-owned `/isoflow/agent` subprocess boundary and keep an
  explicit HTTP 410 tombstone for stale callers.
- Bind every proposal to exactly one selected embed project and view; reject
  unselected fallbacks, cross-view operations, and project-global mutations.
- Make agent output proposal-only.
- Change `client/isoflow/IsoflowOverlay.tsx` from immediate application to a
  bounded normalized preview with exact parameters and explicit confirmation.
- Force Bridge dry-run before confirmation and apply the exact operations at
  the same revision after confirmation.
- Add tests for validation failure, cancellation, confirmation mismatch,
  revision conflict, and no apply before confirmation.

This slice lets the existing Architect thread propose bounded Isoflow changes
without granting a browser-spawned model architectural or security-decision
authority.

### Slice 2: bounded ML-Intern adapter

- Integrate through ML-Intern's API/session layer rather than duplicating its
  agent loop.
- Introduce the versioned `MlInternGrant` and enforce it before exposing tools.
- Start with one explicit read/write root and one repository namespace, then
  add sandbox, HF Job, publication, notification, trace, and delegation scopes
  as contract tests cover them.
- Remove ambient credentials/environment from the worker process and resolve
  only grant-scoped credential references.
- Normalize artifacts, approvals, lifecycle events, cost/runtime telemetry, and
  touched-resource receipts.
- Test canonical path/symlink escapes, read/write/delete separation, namespace
  escapes, approval binding, deadline/cancellation, budget exhaustion,
  exact-or-narrower child grants, secret redaction, and unknown outcomes.

Capabilities are sequenced for verification, not prohibited by architecture.
The target design permits the full declared capability set.

#### Slice 2a: terminal-first native-canvas vertical slice

The first implemented slice is intentionally narrower than the complete grant
contract:

- `ml-intern` runs in the terminal and owns the conversation;
- the repo-local adapter exposes exactly `tldraw_capabilities`,
  `tldraw_describe_capability`, and `tldraw_execute`;
- discovery returns compact IDs, description hydrates one contract, and
  execution accepts one concise instruction plus `selection` or
  `selection-or-area`;
- the loopback bridge queues, leases, and receipts the request without accepting
  credentials, paths, Isoflow targets, or raw project state;
- the browser applies the request through the existing bounded `canvas-edit`
  route and validated native tldraw actions;
- the terminal receives only request ID, status, surface, and compact summary;
- the widget shows bridge/queue/receipt state and never creates an ML-Intern
  session.

Installing `scripts/ml_intern_tldraw_tool.py` into the ML-Intern checkout and
registering `create_tldraw_canvas_tools(ToolSpec)` in `create_builtin_tools()`
remain explicit external steps. This repository does not claim to have changed
that checkout. `POST /ml-intern/canvas-tool/invoke` is an unadvertised
compatibility endpoint only.

The prior browser-owned Eval Lab API/session launcher remains legacy
compatibility code only and is no longer exposed as a selectable model or UI
run path. A later cleanup may remove that transport after active consumers have
migrated.

### Slice 3: route integration

- Reuse the existing opt-in route planning in
  `client/agent/companionRouting.ts`.
- Make route suggestions advisory and require the typed dispatch constructor to
  bind an explicit target and grant.
- Return compact result/receipt references to the primary thread.
- Keep provider adapters thin; Amp, Codex, or MCP transport must not widen a
  grant or reinterpret a dispatch.

Create additional persistent workers only after measurements show a repeated
isolation, latency, or context need that the existing tldraw action profile,
Isoflow executor, ML-Intern provider, and Oracle do not satisfy.

## Rejected alternatives

### Permanent DevSecOps companion worker

Rejected. It duplicates the primary thread's DevSecOps skill for routine work
and provides weaker independence than Oracle for high-impact review. Oracle is
invoked when independence matters; otherwise the primary owns the decision.

### DevSecOps worker that also edits Isoflow

Rejected. It combines policy judgment and mutation authority, making review
less independent and receipts harder to interpret. The primary/Oracle decide;
the Isoflow executor implements a confirmed semantic brief.

### Reimplement ML-Intern as an Amp prompt/subagent

Rejected. It duplicates a mature runtime and moves session, tool, job,
approval, provenance, and compaction logic into the wrong context. A bounded
adapter preserves the existing implementation while removing ambient authority.

### Globally disable ML-Intern's powerful tools

Rejected. Shell, writes, sandboxes, jobs, repository mutations, notifications,
trace sharing, and subdelegation are legitimate capabilities. Security comes
from explicit, canonical, expiring scopes; separate permissions; budgets;
approval binding; and receipts, not from making the worker artificially
read-only.

### Create a separate tldraw worker immediately

Rejected for v1. Native actions already provide a bounded execution seam.
Another process would add orchestration and synchronization without yet solving
a measured problem.

### Let automatic routing grant authority

Rejected. Classification can be wrong. A route may suggest the next UI/action,
but only a typed dispatch with an explicit target and grant authorizes work.

## Consequences

- The primary Amp context stays focused on conversation and decisions.
- The Architect remains the existing Ampcode thread and can use the currently
  open tldraw Offline document through a bounded resident-client bridge.
- Independent security review is available without maintaining a permanent
  reviewer worker.
- Isoflow can be operated by a specialized process without letting that process
  invent architecture or bypass confirmation.
- ML-Intern retains its full practical power where explicitly authorized while
  host, repository, provider, and publication blast radius remain bounded.
- Grants and receipts become security-critical contracts and require versioning,
  canonicalization, redaction, and adversarial tests.
- Approval UX is required for exact Isoflow patches and configured high-impact
  ML-Intern operations.
- The design adds only two new execution boundaries in v1: the existing
  Isoflow process made transactional, and an adapter around the existing
  ML-Intern runtime.

## Acceptance criteria

The architecture is implemented when:

- the existing Ampcode Architect thread, without `amp -x` or a replacement
  thread, can discover capability IDs, hydrate exactly one capability, inspect
  an explicit selection/area, execute a validated native tldraw mutation, and
  receive an inspectable/undoable compact receipt from the live Offline client;
- Amp prompts and canvas metadata contain no Amp thread ID, credential, full
  history, document path, raw whole-canvas dump, or arbitrary filesystem
  authority;
- routine DevSecOps guidance stays in the primary thread and independent review
  uses Oracle only;
- no durable DevSecOps companion worker exists;
- an Isoflow proposal cannot mutate before a successful dry run and explicit
  confirmation of the exact revision-bound operations;
- a stale Isoflow revision requires a fresh preview;
- native tldraw routes continue using validated in-process actions;
- ML-Intern can exercise every capability declared in its grant and cannot
  access a path, repository, namespace, provider, destination, budget, or child
  grant outside it;
- ML-Intern receives no undeclared ambient credentials or host authority;
- each execution returns a compact, redacted, inspectable receipt;
- automated route classification alone cannot create mutation authority.
