# Isoflow Studio repository integration

Date: 2026-07-24

## Decisions

1. The standalone prototype is imported as `isoflow-studio/`. OpenWiki vendor
   code, generated output, runtime state, screenshots, and installed
   dependencies were deliberately not copied.
2. Isoflow Studio owns the native Isoflow runtime and Bridge v2. Canvapocalypse
   owns tldraw, agents, and the embed/provider adapter. Decision Graph and Change
   Radar remain outside Isoflow.
3. The original Pro exports are retained under `fixtures/pro-exports/`; the
   deterministic contour compiler regenerates the committed session from those
   fixtures.
4. Workspace project roots are repository-relative and can be overridden with
   `ISOFLOW_PROJECT_ROOT`. Personal absolute paths are not committed.
5. The Isoflow Amp console uses the current `low/medium/high/ultra` dial, starts
   Amp from the Canvapocalypse repository root, and explicitly loads the
   repo-local Isoflow skill. Generic workflow LLM nodes stay isolated in a
   temporary directory.
6. Browser-triggered Amp calls may inspect repository context but return
   validated Isoflow actions instead of editing source files. Full coding work
   is launched in a normal Amp thread with the repo-local skill and kickoff
   prompt.

## Observed dependency debt

Installing the imported application reports 13 audit findings (6 moderate,
7 high) in the old Isoflow CE dependency tree. No automatic `npm audit fix` was
applied because the force path includes breaking upgrades and could invalidate
the patched renderer. Dependency modernization is a separate bounded task; the
current integration is validated against the exact imported runtime first.
