# Local HTML Mockup provider

Date: 2026-07-27

Status: accepted MVP

## Context

The UI/UX workbench must display and revise local HTML mockups without putting
their source into the canvas or an agent prompt. A representative mockup is a
single 20,000-line file. The useful agent context is the selected component and
a small amount of semantic structure around it, not the full DOM or source.

This surface is native tldraw. It is not Isoflow, a generic network embed, or an
executable workflow node. The external Architect/Amp thread remains the planner
and conversation owner; tldraw supplies explicit selection, bounded inspection,
validated actions, and compact receipts.

## Decision

Add a dedicated `local-html-mockup` tldraw shape backed by the loopback
workbench bridge.

The MVP supports:

- discovery of HTML documents under operator-configured roots;
- transient import into a host-managed directory;
- an inert, cross-origin preview in a sandboxed iframe;
- resident element picking;
- a bounded accessibility-like semantic snapshot;
- lazy agent capabilities `html.inspect-component` and
  `html.create-variant`; and
- revision-guarded, idempotent variant creation that never overwrites the
  source.

Regions, native annotations, structural patch operations, and confirmed direct
overwrite are sequenced future slices. They are not part of this contract.

## Ownership and source of truth

| Concern | Owner |
| --- | --- |
| HTML source and managed variants | Local registry file plus current SHA-256 revision |
| Canvas placement, size, selection, and undo | Native tldraw record |
| Preview | Sanitized derived document |
| Selected component | Exact selected shape plus picker result at one revision |
| Agent context | Bounded semantic projection |
| Variant result | Compact immutable receipt |

The original registry file is authoritative. Canvas metadata, the render DOM,
the agent prompt, and the model response are never source authority.

## Local registry and opaque references

The registry starts at `realpath(process.cwd())`. An operator may add roots only
with the `TLDRAW_HTML_MOCKUP_ROOTS` environment variable. HTTP bodies, canvas
shapes, prompts, and model responses cannot add roots or nominate paths.

Registry discovery:

1. canonicalizes every configured root;
2. resolves and rechecks candidates beneath a root;
3. rejects final or intermediate symlink escapes;
4. accepts only regular `.html` and `.htm` files;
5. ignores dependency, build, VCS, and managed-variant noise;
6. caps the registry at 200 documents; and
7. caps each source or import at 4 MiB.

Every document receives an opaque `documentRef`. Prompts and canvas state never
contain its path. An import copies browser-supplied bytes into
`.tldraw-html-mockups/imports/` using a host-chosen name; the browser file path
is not stored.

The shape stores only:

```ts
interface LocalHtmlMockupShapeProps {
  w: number
  h: number
  documentRef: string
  revision: `sha256:${string}`
  title: string
  selectedTargetRef?: string
  selectedTargetLabel?: string
}
```

It stores no HTML source, filesystem path, arbitrary URL, selector, source
offset, credential, capability token, or provider secret.

## Provider API

The current loopback surface is:

```text
POST /html-mockups/session
GET  /html-mockups
POST /html-mockups/import
GET  /html-mockups/:documentRef/snapshot
POST /html-mockups/:documentRef/preview-ticket
GET  /html-mockups/:documentRef/preview
GET  /html-mockups/:documentRef/assets/:previewTicket/*
POST /html-mockups/:documentRef/patch
```

The bridge binds to `127.0.0.1`. Browser access is restricted to exact
allowlisted workbench origins. Every registry, import, inspection, ticket, and
mutation request requires one high-entropy resident capability in
`x-tldraw-html-capability`. An exact trusted HTTP workbench origin may bootstrap
it from `/session`; `Origin: null`, `file://`, an absent origin, and arbitrary
web origins cannot bootstrap it.

The bridge creates or loads that capability from the gitignored
`.tldraw-html-mockups/resident-capability` file with mode `0600`. Ordinary
bridge restarts therefore retain the same capability. The Offline config build
helper reads that same file, injects the value into the resident module closure,
writes `config.js` atomically without touching `main.js`, and verifies the
document's `script-status`. Canvas records, prompts, receipts, and URLs never
contain the resident capability. A missing Offline injection fails while
loading the config instead of silently reducing authority checks.
Before the client reads or attaches that capability, it clones and resolves
the requested URL, requires the exact unauthenticated
`http://127.0.0.1:5176` origin, and rejects foreign or credential-bearing
destinations before network I/O.

For the model path, exactly one valid Local HTML Mockup must be the complete
tldraw selection. Mixed selection fails closed. The client rechecks shape ID,
document reference, revision, and selected target after every awaited
inspection before scheduling any context result.

## Inert preview and picker

The iframe has exactly:

```html
<iframe sandbox="allow-scripts">
```

It does not receive `allow-same-origin`, forms, popups, downloads, navigation,
pointer lock, or storage access.

The provider parses the source as data and builds a derived preview:

- original scripts, event handlers, active embeds, refreshes, unsafe URLs, and
  network-capable elements are removed;
- original scripts are never executed;
- same-root inert assets are served through an extension allowlist after
  canonical containment checks;
- CSP denies connect, frame, object, base, and form actions; and
- the only script is the provider's nonce-bound picker.

The picker reports `html-mockup:selection` with opaque document, revision, and
target references plus a server-projected short visible label. The authenticated
request's actual Origin determines the parent surface; clients cannot nominate
it in a query or body. Exact allowlisted HTTP origins bind to themselves, while
an already provisioned `Origin: null` or absent origin binds to `file://`.

The provider exchanges the resident capability for a short-lived preview
ticket scoped to document, revision, and derived parent surface. Preview and
asset URLs carry only that ticket, never the resident capability. CSP
`frame-ancestors` and `postMessage` use the bound surface; every asset request
also rejects revision drift. In Offline mode `frame-ancestors file:` requires a
wildcard post target, so the parent accepts a message only from the exact iframe
`WindowProxy`, then rechecks message type, phase, document reference, revision,
and bounded fields.

Target-scoped `contextRef` grants bind document, revision, target, resident
capability identity, and the request-derived surface. A mutation must present
the same resident capability from that same surface. Hidden, `aria-hidden`,
script, style, and template content cannot receive picker refs or become a
selected label.

## Bounded semantic context

The server may parse a source of at least 20,000 lines when it remains under the
4 MiB source cap, but never returns the raw HTML to the model.

The server snapshot is deterministic and capped at:

| Item | Limit |
| --- | ---: |
| Nodes | 200 |
| Projected character count | 12,000 |
| Node depth | 12 |
| Node name | 160 characters |
| Node visible text | 240 characters |

The agent context applies a second boundary:

| Item | Limit |
| --- | ---: |
| Nodes | 80 |
| Serialized prompt part | 16 KiB |
| Node depth | 12 |
| Node name | 160 characters |
| Node visible text | 240 characters |

Prompt-visible nodes contain only:

```ts
interface HtmlMockupNodeSummary {
  ref: string
  parentRef?: string
  tag: string
  role?: string
  name?: string
  text?: string
  depth: number
  childCount: number
}
```

Selectors, classes, raw attributes, markup, URLs, CSS, scripts, comments,
source offsets, paths, and credentials are omitted. Hidden, `aria-hidden`,
script, style, template, and head content is excluded. A selected target is
returned with bounded ancestors and descendants; omitted content is represented
only by counts and `truncated`.

## Capability hydration

HTML capability IDs are advertised only when exactly one Local HTML Mockup is
the complete selection. Isoflow and ordinary canvas routes receive neither HTML
context nor HTML action schemas.

- `html.inspect-component` hydrates `htmlMockupInspect` for selected-component
  inspection. A target-scoped inspection returns a random `contextRef`, bound
  to document, revision, and target for two minutes.
- `html.create-variant` hydrates `htmlMockupCreateVariant` only for explicit
  design/edit intent.

The full HTML mutation schema is not part of the initial prompt. It is hydrated
only on the HTML canvas route. The Architect receives the compact context or
receipt, not source bytes or the provider's internal state.

## MVP variant operation

The current mutation payload is:

```ts
interface HtmlMockupCreateVariant {
  documentRef: string
  targetRef: string
  contextRef: string
  expectedRevision: `sha256:${string}`
  idempotencyKey: string
  replacementHtml: string
}
```

`replacementHtml` is an intentionally narrow MVP seam, not arbitrary document
execution. The server:

- limits it to 32 KiB;
- parses it as an HTML fragment;
- requires one safe replacement root;
- rejects scripts, handlers, active embeds, refresh, unsafe URLs, and unsafe
  attributes;
- resolves `targetRef` only within the exact expected source revision;
- requires an unexpired `contextRef` from a target-scoped inspection and
  verifies its exact document/revision/target binding;
- reparses and validates before writing;
- rejects a stale revision;
- writes a host-named variant atomically; and
- never writes the original file.

The client requires a bounded opaque `idempotencyKey` for each logical model
operation and forwards it unchanged. Replaying the exact key and exact payload
returns the same receipt. Reusing a key for a different payload returns a
conflict. Separate user invocations use separate keys and therefore create
separate variants.

The compact receipt is:

```ts
interface HtmlMockupVariantReceipt {
  receiptId: string
  status: 'succeeded'
  mode: 'variant'
  documentRef: string
  variantDocumentRef: string
  targetRef: string
  beforeRevision: `sha256:${string}`
  afterRevision: `sha256:${string}`
  summary: string
}
```

The client rejects a receipt that changes the source/target binding, aliases
the source as its own variant, reports an unchanged revision, or contains an
invalid opaque field. Receipts contain no HTML, path, selector, or credentials.

## Failure and security behavior

- No selection, mixed selection, invalid metadata, stale revision, changed
  selection during inspection, missing/expired/mismatched context grant,
  unknown target, unsafe replacement, oversized input, symlink escape, or
  mismatched receipt fails closed.
- Context and inspection are read-only and may be retried.
- A variant action is retried only with its original idempotency key. Unknown
  mutation outcome is never retried under a new key.
- Ten intentional no-key provider calls may create ten separate variants; the
  model action schema does not permit that ambiguous path.
- Preview and snapshot responses are `no-store`.
- Credentials remain outside tldraw metadata, prompts, receipts, and provider
  references.

## Validation evidence

Focused deterministic tests cover:

- a 20,000-line source producing a bounded snapshot;
- hidden and script content exclusion;
- CSP, exact HTTP parent-origin binding, explicit `file://` Offline binding,
  and exact iframe sandboxing;
- exact iframe-source message validation;
- traversal and symlink rejection for registry, imports, and assets;
- exact-one selection and post-await authority rechecks;
- cross-route exclusion from Isoflow and mixed canvas selection;
- stale-revision rejection;
- unsafe replacement rejection;
- source preservation;
- concurrent unique variants;
- exact idempotent replay and conflict; and
- compact receipt validation.

## Sequenced next slices

1. Replace raw `replacementHtml` with allowlisted structural operations.
2. Add resident region selection and native tldraw annotations.
3. Bind structural operations to short-lived resident context references.
4. Add a resident-only exact-preview confirmation path for direct overwrite.
   The confirmation token must never enter a model schema or prompt.
