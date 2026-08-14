# Google Stitch provider for the UI/UX workbench

Date: 2026-08-02

Status: accepted implementation slice

## Context

The UI/UX pack already has two bounded native providers:

- `DESIGN.md` is projected into a native Design System node without putting the
  Markdown body or filesystem path into the canvas; and
- Local HTML Mockup renders a host-managed HTML artifact in a sandbox and gives
  agents only a selected component's compact semantic projection.

Google Stitch adds generation and editing, but it must not become a second
canvas engine or expose its SDK inventory, credentials, raw provider responses,
signed download URLs, or complete HTML to tldraw agents.

## Decision

Run `@google/stitch-sdk` only inside the loopback workbench bridge. The UI/UX
pack exposes one labeled provider dock with three entries:

1. `Stitch` generates or edits a remote Stitch screen;
2. `DESIGN.md` places a bounded native Design System node; and
3. `Local HTML` imports or places a sandboxed HTML mockup.

The Stitch service downloads generated HTML server-side, imports it into the
existing host-managed Local HTML registry, and returns a compact receipt plus a
Local HTML document summary. tldraw reuses the existing
`local-html-mockup` shape. It stores only opaque workbench provider references
needed to request a later edit; the service owns the mapping to Google IDs.

## Credentials and authority

The service reads either:

- `STITCH_API_KEY`; or
- `STITCH_ACCESS_TOKEN` plus `GOOGLE_CLOUD_PROJECT`.

These values never enter the browser bundle, Offline config, canvas metadata,
prompts, receipts, logs, or API responses. `/stitch/*` requires the same
resident capability as Local HTML and is available only through the exact
loopback workbench bridge.

Remote HTML download URLs must be HTTPS and match the fixed Google-host
allowlist. Redirects are revalidated. HTML is capped at 4 MiB before it is
written to the managed registry. Provider errors are reduced to stable
workbench error codes and do not return raw SDK payloads.

## Bounded design context

When a Design System node is explicitly selected, Stitch may receive its
already bounded semantic projection. The bridge converts that projection to a
short design-constraint appendix. It never receives the underlying
`DESIGN.md`, a path, or unrelated canvas state.

Ordinary tldraw requests do not receive Stitch tools or schemas. The UI calls
only the small provider routes required by the current operator action.

## Operations and receipts

Generate accepts an opaque project reference, a bounded prompt, a device type,
and an idempotency key. Edit additionally accepts an opaque screen reference
and the expected local HTML revision. A stale edit fails closed.

Successful operations return:

- a stable operation receipt;
- opaque project and screen references;
- the managed Local HTML document summary; and
- no raw HTML, provider ID, signed URL, credential, or SDK response.

The resulting tldraw mutation remains inspectable and undoable because it is a
normal Local HTML shape creation/replacement.

## Explicit non-goals

- no Stitch SDK or broad tool inventory in a model prompt;
- no browser-side Stitch authentication;
- no raw Stitch HTML in canvas records;
- no automatic rewrite of `DESIGN.md`;
- no general-purpose URL fetcher; and
- no routing UI/UX work through Isoflow.
