# Workflow providers, rich output, and run history

Date: 2026-07-23

## Visual thesis

A calm canvas instrument panel: OpenRouter uses a compact routing mark, custom
endpoints use a terminal/connector mark, and rich output reads like a resizable
technical document rather than another generic workflow card.

## Content plan

1. Toolbar: distinct OpenRouter, Base URL, and Rich Output tools.
2. Inspector: only the connection and model fields relevant to the selected
   provider.
3. Canvas output: latest or selected historical result with JSON/Markdown mode.
4. Run history: timestamped immutable runs with provider/model provenance.

## Interaction thesis

- Provider status changes use the existing restrained status pulse.
- JSON branches expand recursively through native disclosure controls.
- Switching historical runs replaces the document body without mutating the
  stored run or the current workflow graph.

## Decisions

### Separate provider tools, shared execution kind

OpenRouter and Base URL nodes are both `llm` workflow nodes, but they have
different placement tools and provider presets. This preserves graph execution
and duplication semantics while making the toolbar intent explicit.

The OpenRouter toolbar mark uses the supplied 2026 loop-and-tail silhouette,
vectorized as a single-color SVG with `currentColor`. The source neon color is
not baked into the toolbar; theme and selected-state colors remain authoritative
at the 23px tool size.

### OpenAI-compatible Base URL contract

The Base URL node targets the common OpenAI-compatible surface:

- `GET {baseUrl}/models` for optional model discovery.
- `POST {baseUrl}/chat/completions` for inference.
- Manual model entry remains available when `/models` is unsupported.

The local bridge accepts explicit `http` and `https` endpoints, including
localhost, because local/self-hosted inference is a primary use case. The bridge
is bound to loopback and restricts browser origins. Arbitrary Base URL proxying
is intentionally not added to the public Cloudflare worker.

### Secrets never enter canvas metadata

OpenRouter and Base URL API keys live in `sessionStorage` only. Base URL and
model names may be persisted in node configuration; bearer tokens may not.

### Rich Output is a custom resizable tldraw shape

`rich-output` is a dedicated workflow node and tldraw shape. It renders parsed
JSON as a recursive disclosure tree and otherwise renders Markdown with raw
HTML disabled. Existing plain `output` nodes remain readable for compatibility;
new workflows and duplicated model branches use Rich Output.

### Append-only run storage

Each Play action gets a fresh UUID. A completed, failed, or cancelled run is
added to IndexedDB as a new immutable record. Shape metadata stores only the
latest value and latest run id for immediate canvas feedback; historical
payloads stay outside the tldraw document.

Requests use `cache: "no-store"` and a unique run header. No previous model
response is used to satisfy a later run.

### Persistence failure is visible

If a model run completes but its history record cannot be appended, the canvas
still retains the latest visible output, while the Play action reports the
history persistence error. Silent loss would violate the run-history contract.
