# tldraw Companion — Grok plugin

Separate Grok plugin. Same three companion tools as Amp, **own host**,
`actor=grok`. Does not wrap or depend on the Amp plugin process.

```
grok/plugins/tldraw-companion/
  plugin.json
  .claude-plugin/plugin.json
  .mcp.json
  servers/tldraw-companion-mcp.mjs
  skills/tldraw-companion/SKILL.md
```

Shared lease/bridge runtime: `scripts/amp-tldraw-companion-runtime.mjs`.
Amp plugin stays Amp. This plugin stays Grok.

Install (trusted, user-scope):

```bash
grok plugin install /Users/jerryjohnson/dev/canvapocalypse/grok/plugins/tldraw-companion --trust
```

Then enable if Grok leaves new plugins off:

```bash
grok plugin enable tldraw-companion
```
