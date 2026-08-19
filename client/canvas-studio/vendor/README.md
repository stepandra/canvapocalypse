# Canvas Studio contribution snapshots

These browser ESM bundles are byte-current snapshots of the authoritative local
Canvas Kit contributions. They keep the standalone Canvapocalypse web canvas
self-contained; tldraw Offline may still compose newer absolute modules through
`scripts/build-tldraw-desktop-eval-lab.mjs --contribution`.

| Bundle | Source | SHA-256 |
|---|---|---|
| `grok-canvas-kit.js` | `/Users/jerryjohnson/dev/grok-workflow-canvas/dist/canvas-kit.js` | `ff1782d6a02474cddae875904da7bfb619bb5c8e691f5f6add9b68cabe5d9835` |
| `hermes-flight-deck-kit.js` | `/Users/jerryjohnson/dev/hermes-profile-canvas/dist/flight-deck-kit.js` | `978611468a3bab4bb65df1cc71fb7884bb0e81d92ff6595e27291b24f4737610` |
| `tldraw-botflow.js` | Canvas Studio build of `/Users/jerryjohnson/dev/botflow-tldraw/src/tldraw-botflow.js` | `084bf460c2fdc8e129b7225bd7d40e6fe182ad7ec15994249316d9d49ea5e837` |

Shared `react`, `react/*`, and `tldraw` imports intentionally remain external so
the host supplies one React/tldraw runtime. Never copy runtime config, documents,
credentials, or `node_modules` into this directory.
