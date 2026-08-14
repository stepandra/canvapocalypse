# Domain-bound pages and the default freeform page

> Superseded by `canvas-workbench-methodology-v1.md`.

Date: 2026-08-02

Status: superseded

## Context

Each project folder contains one tldraw Offline document (`.tldraw`). The
document always has four domain-bound pages named after their domains:

- `Architecture`
- `UI / UX`
- `Product / PM`
- `ML / LLM`

The active domain mode must follow the page the user is on. Focusing the
`UI / UX` page switches the workbench into the UI/UX mode (its provider dock,
templates, and agent context); focusing `Product / PM` switches to the Product
mode; and so on for `Architecture` and `ML / LLM`. Page selection is the
primary mode switch — the user should never have to pick a mode separately
from navigating to its page.

A fixed set of domain pages is not enough, though: exploratory work, mixed
domains, and ad-hoc sketching do not fit a single domain's templates and
provider dock, and forcing one there corrupts both the canvas and the agent
context.

## Decision

1. The four domain pages are created by default in every project document and
   are bound to their modes: entering a page activates the matching domain
   mode automatically.
2. Every document also gets a default freeform page (`Freeform`, aka
   free-for-all) that is intentionally unbound: any domain mode can be
   activated on it manually, in any order, with no fixed binding. Mixed-mode
   work belongs there.
3. Mode authority is therefore: page binding wins on the four domain pages;
   manual/auto-route choice wins on the Freeform page.

## Consequences

- Users cannot create additional domain-bound pages ad hoc; the four bindings
  stay canonical, which keeps agent context, templates, and provider docks
  predictable per page.
- The Freeform page is always present, so unbounded work never needs to
  hijack a domain page.
- Agent tooling must read the active page to resolve the active mode, and
  must treat Freeform as mode-agnostic until the user picks one.
