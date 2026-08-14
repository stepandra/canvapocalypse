# Verification Matrix — autorecruit.tldraw test/build/live path

Repository: `/Users/jerryjohnson/dev/canvapocalypse`
Document: `/Users/jerryjohnson/dev/kimi_autorecruit_gpui/.canvas/autorecruit.tldraw`
Script workspace: `/Users/jerryjohnson/Library/Application Support/tldraw/working/wd-44668-1/script`
tldraw API: `127.0.0.1:7236`  (pid 39070)

| Stage | Exact command | Expected pass signal | Status | Notes |
|-------|---------------|----------------------|--------|-------|
| 1. Typecheck | `npx tsc --noEmit` | exits 0, no output | ✅ PASS | (executed) |
| 2. Unit tests (targeted scripts) | `node --test scripts/tldraw-offline-config-target.test.mjs scripts/build-tldraw-document-template.test.mjs` | 11/11 pass | ✅ PASS | |
| 3. Offline config build | `node scripts/build-tldraw-desktop-eval-lab.mjs --outfile <repo>/.tldraw-html-mockups/offline-build/config.js --skip-status` | "Built resident tldraw Offline config..." | ✅ PASS | Generated 1.8 MB bundle (matches live `config.js` size) |
| 4. Offline config live apply | `node scripts/build-tldraw-desktop-eval-lab.mjs --outfile ~/Library/Application\ Support/tldraw/working/wd-44668-1/script/config.js` | script-status → `state: "applied"` | ✅ PASS | Already applied; watcher active; digests match `1ec3f8357b14eda9e2035f96f5a500e704349e0a32e5919ae5de8f496d02606f` |
| 5. Document-template build | `node scripts/build-tldraw-document-template.mjs` | stderr: `domains=6 registryVersion=1` | ✅ PASS | |
| 6. Browser build | `node ./node_modules/vite/bin/vite.js build` | `✓ built` for agent_template + client | ✅ PASS | dist/agent_template/index.js 5 MB, dist/client/assets/*.js 2.5 MB |
| 7. Worker dry-run deploy | `npx wrangler deploy --dry-run` | "Total Upload: ..." + `--dry-run: exiting now.` | ✅ PASS | AGENT_DURABLE_OBJECT binding present |
| 8. Live DOM/API verification | `curl 127.0.0.1:7236/api/doc/YWJkB_DPfR-rKl7cjOTit/exec` + `/api/search` | 7 pages, 925 shapes, script-status applied | ✅ PASS | Current page: `ML/LLM`; Decided/In progress frames exist on multiple pages |
| 9. Screenshot check | `curl .../api/search` `return await api.getScreenshot("YWJkB_DPfR-rKl7cjOTit")` | returns JPG file path | ✅ PASS | Saved to `/Users/jerryjohnson/dev/canvapocalypse/autorecruit-live-screenshot.jpg`; visually verified Decided/In progress frames, no stray workbench chrome |

## Dirty-worktree hazards
- **75 uncommitted items** (46 modified, 29 untracked) in repo.
- `pnpm-workspace.yaml` changed from placeholder `set this to true or false` to `esbuild: true / workerd: true` (likely needed for install but uncommitted).
- Full test suite currently **fails** on `scripts/integration-ui-css-source.test.ts` (CSS selector duplication / stale expectations). Do NOT treat `pnpm test` as green until fixed.
- Source/generated coupling:
  - `scripts/tldraw-desktop-eval-lab-config.tsx` is the **source** for the live `config.js`;
  - `scripts/tldraw-desktop-config-parity.test.ts` locks the imports/registration contract;
  - `scripts/build-tldraw-desktop-eval-lab.mjs` bundles it with `esbuild` and installs to the tldraw working `script/config.js`.
  - Changing client imports without updating the parity test or rebuilding config.js will break the offline document.

## Commands to copy/paste
```bash
cd /Users/jerryjohnson/dev/canvapocalypse
npx tsc --noEmit
node --test scripts/tldraw-offline-config-target.test.mjs scripts/build-tldraw-document-template.test.mjs
node scripts/build-tldraw-document-template.mjs
node scripts/build-tldraw-desktop-eval-lab.mjs --outfile "$HOME/Library/Application Support/tldraw/working/wd-44668-1/script/config.js"
node ./node_modules/vite/bin/vite.js build
npx wrangler deploy --dry-run
```

## Live API verification snippet
```bash
TOKEN=$(jq -r .token < "$HOME/Library/Application Support/tldraw/server.json")
PORT=$(jq -r .port < "$HOME/Library/Application Support/tldraw/server.json")
DID=YWJkB_DPfR-rKl7cjOTit
# script-status
curl -s "http://127.0.0.1:$PORT/api/doc/$DID/script-status" -H "authorization: Bearer $TOKEN"
# shape count
curl -s "http://127.0.0.1:$PORT/api/doc/$DID/exec" -X POST -H "authorization: Bearer $TOKEN" -H "content-type: application/json" -d '{"code":"return [...editor.store.allRecords()].filter(r => r.typeName === "shape").length"}'
# screenshot
curl -s "http://127.0.0.1:$PORT/api/search" -X POST -H "authorization: Bearer $TOKEN" -H "content-type: application/json" -d '{"code":"return await api.getScreenshot("$DID")"}'
```
