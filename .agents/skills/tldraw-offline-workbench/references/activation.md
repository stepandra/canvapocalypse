# Ampcode activation

## Plugin source boundary

The canonical repo-local plugin source is:

```text
/Users/jerryjohnson/dev/canvapocalypse/amp/plugins/tldraw-offline-workbench.ts
```

It is the implementation and install source of truth. Do not silently
substitute the existing
`/Users/jerryjohnson/.config/amp/plugins/isoflow-canvas.ts`, because that plugin
only controls native Isoflow and does not provide general tldraw Offline access.

After its focused contract tests pass, install it as a symlink so the
repository remains the source of truth:

```sh
ln -sfn \
  /Users/jerryjohnson/dev/canvapocalypse/amp/plugins/tldraw-offline-workbench.ts \
  /Users/jerryjohnson/.config/amp/plugins/tldraw-offline-workbench.ts
```

Reload Ampcode's plugin registry while preserving/reopening the same
architecture thread. Do not start a headless `amp -x` request.

The plugin must register exactly:

- `tldraw_capabilities`
- `tldraw_describe_capability`
- `tldraw_execute`

It must connect only to the loopback workbench bridge, let the resident tldraw
Offline client resolve the current live document, and expose no document path,
thread identifier, credential, arbitrary URL, or arbitrary filesystem input.

## Ready-to-paste instruction

```text
Use $tldraw-offline-workbench in this existing Architect thread: target the currently open tldraw Offline document, discover capabilities, hydrate exactly one smallest capability, inspect only the explicit selection or user-approved bounded area, execute validated native tldraw actions, and return only the compact undoable receipt; use Isoflow only for an explicitly selected native infrastructure/DevOps/security-contour view.
```
