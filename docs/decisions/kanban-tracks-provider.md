# Read-only Kanban Tracks provider

Status: accepted for Phase 1
Date: 2026-07-31

## Decision

The Product / PM workbench pack includes a real `Kanban Tracks` provider backed
by the existing loopback bridge. It discovers opaque Kanban project refs and
reads `kanban-tracks-projection/v1`; it exposes no mutation request.

The provider materializes:

- one native frame per Kanban track;
- one native milestone card per milestone;
- a compact active-milestone progress and pipeline summary;
- an `Unassigned` lane when tasks have no planning context;
- real bound arrows for cross-track blockers.

Task cards stay in Kanban and are not copied to the zoomed-out canvas.

Every provider-owned shape has stable IDs and a compact
`kanban-track-ref/v1` metadata binding containing an opaque project ref,
track/milestone identity, snapshot revision, sync timestamp, and
current/orphaned state. Refresh updates labels and metadata without moving
existing shapes. New references are added; removed references are marked
orphaned, never deleted.

## Authority boundary

Kanban owns track, milestone, task, dependency, progress, and acceptance truth.
Canvas layout and annotation remain tldraw truth. A visual edit does not write
back to Kanban. A user may give selected canvas context to Amp Architect, which
can propose and, after confirmation, perform a typed Kanban mutation. The
updated read projection is the only return path.

Canvas metadata never stores Amp thread IDs, repository paths, task prompts,
credentials, runtime tokens, or the full board. The bridge accepts only
loopback HTTP Kanban origins and proxies only project discovery and projection
reads. Browser and Offline callers must also present the resident capability
defined in D-036; `Origin: null` is never treated as authority by itself.

The matching Kanban decision is
`docs/decisions/2026-07-31-tldraw-tracks-projection.md`.
