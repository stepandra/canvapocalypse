# Design System: Canvapocalypse Workbench

**Project ID:** canvapocalypse

## Visual Theme & Atmosphere

- Native tldraw workspace with quiet, utilitarian chrome and the canvas as the
  dominant surface.
- Compact local-first controls that appear only in the domain where they are
  useful.
- Clear distinction between provider actions, canvas tools, status, and
  inspectable receipts.

## Color Palette & Roles

- **Canvas White (#F7F8FA):** Main working surface and generous negative space.
- **Graphite (#20242A):** Primary text, outlines, and durable structure.
- **Quiet Gray (#6B7280):** Secondary labels and bounded metadata.
- **Control Teal (#0F766E):** Native controls, verified local providers, and
  successful receipts.
- **UI Cyan (#1D9BF0):** UI/UX selections and active provider actions.
- **Inference Violet (#7C3AED):** Model and prompt workflow artifacts only.
- **Operator Amber (#D97706):** Explicit human action and review gates.

## Typography Rules

- **Interface:** Use the tldraw interface sans-serif stack with compact,
  sentence-case labels and weight 600 for active controls.
- **Technical metadata:** Use the tldraw monospace stack for revisions,
  capability IDs, and compact receipts.
- **Canvas content:** Prefer readable native tldraw text over decorative type.

## Component Stylings

- **Provider Dock:** One compact labeled group per active domain; never scatter
  anonymous provider buttons around the canvas.
- **Popover:** Use native tldraw popover and button primitives with one clear
  primary action and bounded status text.
- **Design System Node:** Read-only semantic projection with visible revision
  and drift state; never render the Markdown body.
- **Local HTML Mockup:** Sandboxed preview with selected-component inspection;
  never store markup in the canvas.
- **Receipt:** Compact status, operation ID, and affected opaque references;
  keep source payloads out.

## Layout Principles

- Keep the center of the canvas unobstructed.
- Put mode switching in the top workbench bar and domain providers in one
  adjacent, discoverable dock.
- Collapse secondary choices into popovers instead of permanent side panels.
- Preserve at least 12 px between floating surfaces and native tldraw chrome.
- On narrow viewports, retain labels where ambiguity would be costly and allow
  the provider dock to wrap.
