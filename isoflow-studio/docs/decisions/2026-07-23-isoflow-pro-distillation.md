# Isoflow Pro distillation

## Context

Isoflow Studio needs the useful interaction and information contracts from Isoflow Pro without copying its hosted product model. The authoritative project facts remain in repositories: documents in Markdown/MDX, workspace metadata in revisioned JSON, and Isoflow views as editable projections.

## Decisions

1. **Racks become Infrastructure Nodes.** A node records runtime type (`bare-metal`, `vps`, `vm`, `container`, `managed`, or `other`), provider, location, IP, CPU, RAM, storage, and network. Rack elevation is not the primary abstraction because most of the target estate spans owned hardware and rented/cloud compute.
2. **Documents are file-backed.** The workspace stores a project root and relative Markdown/MDX paths. The UI reads the real file and exposes its absolute path; it does not create a second rich-text database.
3. **Stable Isoflow item IDs are the join key.** Infrastructure records, flow steps, tags, and documents reference model items by ID. This keeps the sidecar schema compatible with agent/MCP operations and multiple views.
4. **Flows are ordered semantic steps.** Each step references an item ID and may include a short description. Selecting a node or flow highlights the real connector neighborhood.
5. **Selection is a reading mode, not just an editor affordance.** Unrelated nodes and connectors are dimmed. Connected edges receive a `15 5` moving dash with a `250ms linear` cycle, matching the useful behavior observed in Isoflow Pro. Reduced-motion users get a static highlight.
6. **Sidecar metadata stays outside the CE model.** Isoflow CE owns diagram geometry and connector topology. The repo-owned workspace file owns infrastructure facts, document links, tags, and flows.
7. **One model, many views stays the organizing principle.** We keep the imported physical topology and can add C4-style views later without duplicating components or facts.

## Deliberate omissions

- Isoflow Pro's internal document editor is not reproduced.
- Cloud collaboration, billing, audit logs, and hosted AI icon generation are out of scope.
- Rack front/rear elevation can return later as a specialized view of bare-metal nodes if it becomes operationally useful.

## Evidence from dogfooding

- Project functionality is organized as optional plugins: Documents, Network Maps, Racks, Software Architecture, and Tags.
- Network Maps separate Views, Components, and Flows.
- Flow steps bind to canvas item IDs and carry a name plus rich description.
- Component inspectors expose icon, label, description, tags, linked view, and stable item ID.
- Software Architecture uses one shared C4 model across audience-specific views.
- Selecting a node fades unrelated context and animates connected flow paths.
