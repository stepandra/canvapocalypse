# Native tldraw UI contract for integrations

Date: 2026-07-27
Status: accepted for incremental implementation

## Context

Canvapocalypse adds workflow tools, domain packs, an Amp Architect bridge,
ML-Intern status, selected Isoflow embeds, receipts, and compact canvas helpers
around tldraw Offline. Several of those surfaces introduced their own glass
panels, hard-coded light colors, radii, shadows, tiny labels, and bespoke
buttons. The result behaved like a collection of embedded products instead of
one tldraw application.

tldraw already exports the required UI primitives and theme contract. Its
public `TldrawUi*` components inherit editor direction, menu state, focus
behavior, portal container, light/dark colors, and interaction sizing.

## Decision

All integration chrome mounted inside tldraw Offline uses public tldraw UI
primitives where a matching primitive exists:

- `TldrawUiToolbar` and `TldrawUiToolbarButton` for tool rails;
- `TldrawUiButton` for actions;
- `TldrawUiPopover` for compact inspectors and secondary controls;
- `TldrawUiDropdownMenu` for pack and template choices;
- `TldrawUiInput` and `TldrawUiSelect` for compatible form fields;
- `TldrawUiIcon` and native tooltips for icon actions.

Custom CSS consumes `--tl-color-*`, `--tl-space-*`, `--tl-radius-*`,
`--tl-shadow-*`, and `--tl-font-*`. It does not create a second light-only
theme. The baseline geometry is:

- ordinary controls: 40px;
- tool controls: 48px;
- normal icons: 18px;
- panels: `--tl-radius-3` plus `--tl-shadow-2`;
- menus and popovers: `--tl-radius-3` plus `--tl-shadow-3`;
- hover: `--tl-color-muted-2`;
- active: `--tl-color-hint`;
- selected: `--tl-color-selected` and `--tl-color-selected-contrast`;
- focus: a 2px `--tl-color-focus` ring;
- disabled: `--tl-color-text-disabled`.

Primary labels are at least 11–12px. Monospace is reserved for IDs, revisions,
receipts, capability names, and other machine-readable values. Domain colors
may identify an icon, status, or selected item; they do not recolor the whole
panel.

## Surface rules

### Workflow rail

The rail is icon-first. Every action is a native 48px tool button with an
accessible name and tooltip. Persistent micro-labels are not used. Status and
run controls remain compact and do not widen the rail.

### Domain and template selection

The active pack is visible in a compact native panel. Pack and template choices
use toolbar/menu semantics. Template creation still returns a compact receipt
and remains one native canvas transaction.

### Companion, terminal, and ML-Intern

The companion collapses to one native tool-sized trigger. Conversation,
bounded-context choices, bridge state, and receipts live in a native popover.
The Architecture pack continues to show the existing external Ampcode thread;
it does not start another planner.

Terminal/Zellij remains a passive presence indicator. No transcript, path,
token, command, iframe, terminal control, or implicit prompt attachment is
added while restyling it.

The ML-Intern widget remains an observer/executor for the already-running
terminal session and exposes only the three bounded tldraw tool names. It never
becomes the primary ML-Intern session.

### Isoflow

Isoflow remains a separate native provider for a selected infrastructure,
DevOps, DevSecOps, deployment, or contour view. Its teal is a provider/status
accent only. Picker, inspector, exact proposal preview, confirm, and discard
use the same tldraw panel, field, button, focus, and dark-mode chrome as the rest
of the editor. Restyling does not change revision guards or selection checks.

### Emoji

The collapsed emoji control is one native tool-sized trigger. Its popover
contains exactly nine choices in a 3×3 grid. Insertion remains a real selected
tldraw shape and one user-visible undo step.

## Boundary

Canvas artifacts may retain domain-specific visual language because they are
editable diagram content, not application chrome. Workflow cards may preserve
their information architecture, ports, and semantic type accents, but their
controls, fields, focus states, and neutral surfaces must inherit tldraw theme
tokens.

This contract does not fork or edit generated `node_modules/tldraw/tldraw.css`.
It consumes the public package surface so future tldraw theme changes remain
authoritative.

## Acceptance

- Architecture, ML/LLM, UI/UX, and Product packs use the same neutral chrome.
- Light and dark themes remain readable without integration-specific overrides.
- No integration label overlaps its 48px tool control.
- Keyboard focus is visible and menus/popovers close with Escape.
- Native toolbar, layers, zoom, style panel, watermark, and custom overlays do
  not overlap at the tested desktop and narrow viewports.
- Existing routing, selection, revision, receipt, and undo tests remain green.
