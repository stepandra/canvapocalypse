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

After its focused contract tests pass, install a regular root-level entrypoint
that re-exports the repository implementation:

```sh
cat > /Users/jerryjohnson/.config/amp/plugins/tldraw-offline-workbench.ts <<'EOF'
export { default } from '../../../dev/canvapocalypse/amp/plugins/tldraw-offline-workbench.ts'
EOF
```

The entrypoint must not be a symlink: Amp's plugin loader rejects symlinked
root plugin files. The regular entrypoint keeps the repository implementation
authoritative while remaining reloadable through Amp's plugin registry.

Reload Ampcode's plugin registry while preserving/reopening the same
architecture thread. Do not start a headless `amp -x` request.

The plugin must register exactly:

- `tldraw_capabilities`
- `tldraw_describe_capability`
- `tldraw_execute`

It must connect only to the loopback workbench bridge, let the resident tldraw
Offline client execute against the project target resolved by the plugin, and
expose no document path, workspace-root parameter, canvas binding, client
enumeration, thread identifier, credential, arbitrary URL, or arbitrary
filesystem input.

The Amp workspace must contain exactly one regular, non-symlink
`.canvas/*.tldraw` file. Open that exact file in one tldraw Offline window.
Other Offline documents may remain open and are ignored; the plugin must not
close them. Missing, ambiguous, duplicate, symlinked, escaped, or unopened
project targets fail closed.

## Ready-to-paste instruction

```text
Use $tldraw-offline-workbench in this existing Architect thread: target this Amp workspace's sole .canvas/*.tldraw document already open in tldraw Offline, discover capabilities, hydrate exactly one smallest capability, inspect only the explicit selection or user-approved bounded area, execute validated native tldraw actions, and return only the compact undoable receipt; use Isoflow only for an explicitly selected native infrastructure/DevOps/security-contour view.
```
