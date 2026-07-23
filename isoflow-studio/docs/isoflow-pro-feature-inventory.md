# Isoflow Pro feature inventory

Observed on 2026-07-23 from the signed-in editor, public product pages, and public demos.

| Surface | Observed behavior | Local distillation | Status |
|---|---|---|---|
| Project plugins | Documents, Network Maps, Racks, Software Architecture, Tags can be enabled independently | Lightweight local module rail over one canvas | Implemented |
| Network views | Multiple views share components; view selector changes projection | Existing imported CE views share one model | Implemented |
| Components | Icon, icon size, name, label height, description, tags, linked view, stable ID | CE component controls plus stable ID joins from sidecars | Partial: linked-view editor remains |
| Flows | Ordered steps select canvas items; each step has name and rich description | Ordered stable item IDs, descriptions, automatic best-view selection, graph focus | Implemented for read/focus; authoring UI remains |
| Selection focus | Unrelated topology fades; connected paths animate | Native anchor-aware neighborhood dimming and `15 5` dash animation at 250 ms | Implemented |
| Documents | Rich-text pages can embed diagrams and item references | Real Markdown/MDX files under declared project root | Implemented; intentionally different |
| Racks | Two/four-post rack, U height, location, front/rear equipment placement | Generalized Infrastructure Nodes inventory | Replaced |
| Infrastructure facts | Not the primary Rack model | type, provider, location, IP, CPU, RAM, storage, network, tags, docs, diagram item | Implemented |
| Tags | Project tag registry with ID, color, and value | Per-node tag values in workspace sidecar | Partial: global color registry remains |
| Software Architecture | Shared C4 model with landscape/system/container/component views and Issues | Same-model/multi-view principle is retained in CE | Partial: C4 tree and issue registry remain |
| Autosave/cloud | Hosted persistence and sync | CE model bridge plus revisioned repo workspace files | Implemented locally |
| Clone/project settings | Title, visibility, folder, clone, delete | Repository/file operations | Not copied |
| Pro MCP | Create project, schema and icons; marketing claims MCP authoring | Existing local bridge supports state, search, model replacement, and semantic patches | Local bridge is broader for existing projects |
| AI icon generator | Hosted Pro feature | Use vendored/native icon packs; add repo assets explicitly | Not copied |
| Audit logs/enterprise | Hosted enterprise feature | Git history and revisioned runtime state | Not copied |

## Editor nuances worth preserving

- Selection is useful as an explanation mode, not only as transform state.
- Stable item IDs are visible and are the best cross-surface join key.
- A flow step is semantic: item reference + name + description, not just an animated edge.
- Views should remain projections of one model; duplicating components per audience creates drift.
- Document references are more useful when they open canonical files than when they embed copied rich text.
- Infrastructure inventory and diagrams have different change rates, so the sidecar must remain independent from CE geometry.

## Next high-value gaps

1. Flow authoring: add/reorder/delete steps directly in the drawer.
2. Linked-view navigation from component details.
3. Global tag registry with color and filtered diagram focus.
4. C4 model tree and issue registry backed by repo specs/ADRs.
5. Optional rack-elevation view generated from `bare-metal` node data.
