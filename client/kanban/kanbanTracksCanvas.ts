import {
  createBindingId,
  createShapeId,
  Editor,
  JsonObject,
  TLArrowBinding,
  TLArrowShape,
  TLBindingCreate,
  TLCreateShapePartial,
  TLFrameShape,
  TLGeoShape,
  TLParentId,
  TLShape,
  TLShapeId,
  TLTextShape,
  toRichText,
} from "tldraw";
import {
  KanbanMilestoneProjection,
  KanbanTrackProjection,
  KanbanTracksProjection,
} from "../../shared/types/KanbanTracksProjection";

export const KANBAN_TRACK_BINDING_SCHEMA = "kanban-track-ref/v1" as const;
export const KANBAN_TRACKS_TEMPLATE_ID = "kanban-tracks" as const;

export interface KanbanTrackBinding extends JsonObject {
  schema: typeof KANBAN_TRACK_BINDING_SCHEMA;
  projectRef: string;
  kind: "track" | "milestone" | "unassigned" | "dependency" | "summary";
  trackId?: string;
  milestoneId?: string;
  dependencyRef?: string;
  snapshotRevision: string;
  lastSyncedAt: number;
  state: "current" | "orphaned";
}

export interface KanbanTracksShapeMeta extends JsonObject {
  kanbanTrack: KanbanTrackBinding;
}

export interface KanbanTracksRenderPlan {
  projectRef: string;
  revision: number;
  shapes: TLCreateShapePartial<TLShape>[];
  bindings: TLBindingCreate<TLArrowBinding>[];
  shapeIds: TLShapeId[];
}

const LANE_WIDTH = 1040;
const LANE_HEIGHT = 250;
const LANE_GAP = 40;
const MILESTONE_WIDTH = 250;
const MILESTONE_HEIGHT = 124;
const MILESTONE_GAP = 24;

function safeSegment(value: string) {
  return (
    value
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "item"
  );
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function projectPrefix(projectRef: string) {
  return `kanban-${safeSegment(projectRef)}-${stableHash(projectRef)}`;
}

function shapeId(projectRef: string, kind: string, itemId: string) {
  return createShapeId(
    `${projectPrefix(projectRef)}-${kind}-${safeSegment(itemId)}-${stableHash(itemId)}`,
  );
}

function bindingMeta(
  projection: KanbanTracksProjection,
  binding: {
    kind: KanbanTrackBinding["kind"];
    trackId?: string;
    milestoneId?: string;
    dependencyRef?: string;
  },
): KanbanTracksShapeMeta {
  return {
    kanbanTrack: {
      schema: KANBAN_TRACK_BINDING_SCHEMA,
      projectRef: projection.projectRef,
      ...binding,
      snapshotRevision: String(projection.revision),
      lastSyncedAt: projection.generatedAt,
      state: "current",
    },
  };
}

function progressLabel(track: KanbanTrackProjection) {
  if (track.progress.percent === null) return "Scope not set";
  const basis =
    track.progress.basis === "weighted" ? "weighted" : "count-based";
  return `${track.progress.percent}% accepted · ${basis}`;
}

function pipelineLabel(track: KanbanTrackProjection) {
  return [
    `${track.counts.backlog} queued`,
    `${track.counts.inProgress} running`,
    `${track.counts.review} review`,
    `${track.counts.accepted} accepted`,
  ].join(" · ");
}

function milestoneLabel(milestone: KanbanMilestoneProjection) {
  const progress =
    milestone.progress.percent === null
      ? "Scope not set"
      : `${milestone.progress.percent}% accepted`;
  return [
    `${milestone.state.toUpperCase()} · ${milestone.title}`,
    progress,
    `${milestone.counts.backlog} queued · ${milestone.counts.inProgress} running · ${milestone.counts.review} review`,
    `scope r${milestone.scopeRevision}`,
  ].join("\n");
}

function laneShapes(
  projection: KanbanTracksProjection,
  track: KanbanTrackProjection,
  index: number,
  origin: { x: number; y: number },
): TLCreateShapePartial<TLShape>[] {
  const laneId = shapeId(projection.projectRef, "track", track.trackId);
  const x = origin.x;
  const y = origin.y + index * (LANE_HEIGHT + LANE_GAP);
  const laneMeta = bindingMeta(projection, {
    kind: "track",
    trackId: track.trackId,
  });
  const shapes: TLCreateShapePartial<TLShape>[] = [
    {
      id: laneId,
      type: "frame",
      x,
      y,
      props: {
        w: LANE_WIDTH,
        h: LANE_HEIGHT,
        name: `${track.name} · ${progressLabel(track)}`,
      },
      meta: laneMeta,
    } satisfies TLCreateShapePartial<TLFrameShape>,
    {
      id: shapeId(projection.projectRef, "summary", track.trackId),
      type: "text",
      parentId: laneId,
      x: 28,
      y: 22,
      props: {
        color: "grey",
        size: "s",
        font: "sans",
        textAlign: "start",
        w: LANE_WIDTH - 56,
        autoSize: false,
        richText: toRichText(pipelineLabel(track)),
      },
      meta: bindingMeta(projection, {
        kind: "summary",
        trackId: track.trackId,
      }),
    } satisfies TLCreateShapePartial<TLTextShape>,
  ];
  track.milestones.forEach((milestone, milestoneIndex) => {
    const color =
      milestone.state === "accepted"
        ? "green"
        : milestone.state === "active"
          ? "orange"
          : "grey";
    shapes.push({
      id: shapeId(projection.projectRef, "milestone", milestone.milestoneId),
      type: "geo",
      parentId: laneId,
      x: 28 + milestoneIndex * (MILESTONE_WIDTH + MILESTONE_GAP),
      y: 76,
      props: {
        geo: "rectangle",
        w: MILESTONE_WIDTH,
        h: MILESTONE_HEIGHT,
        color,
        labelColor: "black",
        fill: milestone.state === "active" ? "semi" : "none",
        dash: milestone.state === "archived" ? "dashed" : "solid",
        size: "s",
        font: "sans",
        align: "start",
        verticalAlign: "middle",
        richText: toRichText(milestoneLabel(milestone)),
      },
      meta: bindingMeta(projection, {
        kind: "milestone",
        trackId: track.trackId,
        milestoneId: milestone.milestoneId,
      }),
    } satisfies TLCreateShapePartial<TLGeoShape>);
  });
  return shapes;
}

function unassignedShapes(
  projection: KanbanTracksProjection,
  index: number,
  origin: { x: number; y: number },
): TLCreateShapePartial<TLShape>[] {
  if (projection.unassigned.tasks.length === 0) return [];
  const laneId = shapeId(projection.projectRef, "unassigned", "lane");
  return [
    {
      id: laneId,
      type: "frame",
      x: origin.x,
      y: origin.y + index * (LANE_HEIGHT + LANE_GAP),
      props: {
        w: LANE_WIDTH,
        h: 150,
        name: `Unassigned · ${projection.unassigned.tasks.length} tasks`,
      },
      meta: bindingMeta(projection, { kind: "unassigned" }),
    } satisfies TLCreateShapePartial<TLFrameShape>,
    {
      id: shapeId(projection.projectRef, "summary", "unassigned"),
      type: "text",
      parentId: laneId,
      x: 28,
      y: 42,
      props: {
        color: "red",
        size: "s",
        font: "sans",
        textAlign: "start",
        w: LANE_WIDTH - 56,
        autoSize: false,
        richText: toRichText(
          `${projection.unassigned.counts.backlog} queued · ${projection.unassigned.counts.inProgress} running · ${projection.unassigned.counts.review} review · assign in Kanban`,
        ),
      },
      meta: bindingMeta(projection, { kind: "summary" }),
    } satisfies TLCreateShapePartial<TLTextShape>,
  ];
}

function dependencyShapes(
  projection: KanbanTracksProjection,
  origin: { x: number; y: number },
): {
  shapes: TLCreateShapePartial<TLArrowShape>[];
  bindings: TLBindingCreate<TLArrowBinding>[];
} {
  const shapes: TLCreateShapePartial<TLArrowShape>[] = [];
  const bindings: TLBindingCreate<TLArrowBinding>[] = [];
  const trackIndex = new Map(
    projection.tracks.map((track, index) => [track.trackId, index]),
  );
  const seenPairs = new Set<string>();
  for (const dependency of projection.crossTrackDependencies) {
    const dependencyRef = `${dependency.prerequisiteTrackId}->${dependency.dependentTrackId}`;
    if (seenPairs.has(dependencyRef)) continue;
    seenPairs.add(dependencyRef);
    const prerequisiteIndex = trackIndex.get(dependency.prerequisiteTrackId);
    const dependentIndex = trackIndex.get(dependency.dependentTrackId);
    if (prerequisiteIndex === undefined || dependentIndex === undefined)
      continue;
    const fromId = shapeId(
      projection.projectRef,
      "track",
      dependency.prerequisiteTrackId,
    );
    const toId = shapeId(
      projection.projectRef,
      "track",
      dependency.dependentTrackId,
    );
    const arrowId = shapeId(projection.projectRef, "dependency", dependencyRef);
    const start = {
      x: origin.x + LANE_WIDTH / 2,
      y:
        origin.y +
        prerequisiteIndex * (LANE_HEIGHT + LANE_GAP) +
        LANE_HEIGHT / 2,
    };
    const end = {
      x: origin.x + LANE_WIDTH / 2,
      y: origin.y + dependentIndex * (LANE_HEIGHT + LANE_GAP) + LANE_HEIGHT / 2,
    };
    shapes.push({
      id: arrowId,
      type: "arrow",
      x: start.x,
      y: start.y,
      props: {
        kind: "arc",
        color: "red",
        dash: "dashed",
        size: "s",
        arrowheadStart: "none",
        arrowheadEnd: "arrow",
        start: { x: 0, y: 0 },
        end: { x: end.x - start.x, y: end.y - start.y },
        bend: 80,
        richText: toRichText("blocks"),
      },
      meta: bindingMeta(projection, {
        kind: "dependency",
        dependencyRef,
      }),
    });
    for (const [terminal, endpointId] of [
      ["start", fromId],
      ["end", toId],
    ] as const) {
      bindings.push({
        id: createBindingId(
          `${projectPrefix(projection.projectRef)}-${stableHash(dependencyRef)}-${terminal}`,
        ),
        type: "arrow",
        fromId: arrowId,
        toId: endpointId,
        props: {
          terminal,
          normalizedAnchor: { x: 0.5, y: 0.5 },
          isExact: false,
          isPrecise: false,
          snap: "none",
        },
      });
    }
  }
  return { shapes, bindings };
}

export function buildKanbanTracksRenderPlan(
  projection: KanbanTracksProjection,
  center: { x: number; y: number },
  parentId: TLParentId,
): KanbanTracksRenderPlan {
  const laneCount =
    projection.tracks.length + (projection.unassigned.tasks.length > 0 ? 1 : 0);
  const height = Math.max(
    LANE_HEIGHT,
    laneCount * LANE_HEIGHT + Math.max(0, laneCount - 1) * LANE_GAP,
  );
  const origin = {
    x: center.x - LANE_WIDTH / 2,
    y: center.y - height / 2,
  };
  const laneItems = projection.tracks.flatMap((track, index) =>
    laneShapes(projection, track, index, origin),
  );
  const unassigned = unassignedShapes(
    projection,
    projection.tracks.length,
    origin,
  );
  const dependencies = dependencyShapes(projection, origin);
  const shapes = [...laneItems, ...unassigned, ...dependencies.shapes].map(
    (shape) => ({ ...shape, parentId: shape.parentId ?? parentId }),
  );
  return {
    projectRef: projection.projectRef,
    revision: projection.revision,
    shapes,
    bindings: dependencies.bindings,
    shapeIds: shapes
      .map((shape) => shape.id)
      .filter((id): id is TLShapeId => Boolean(id)),
  };
}

export function readKanbanTrackBinding(
  shape: TLShape,
): KanbanTrackBinding | null {
  const value = (shape.meta as { kanbanTrack?: unknown }).kanbanTrack;
  if (
    !value ||
    typeof value !== "object" ||
    (value as { schema?: unknown }).schema !== KANBAN_TRACK_BINDING_SCHEMA
  ) {
    return null;
  }
  return value as KanbanTrackBinding;
}

function orphanShape(
  editor: Editor,
  shape: TLShape,
  binding: KanbanTrackBinding,
) {
  const meta: KanbanTracksShapeMeta = {
    kanbanTrack: { ...binding, state: "orphaned" },
  };
  if (shape.type === "frame") {
    editor.updateShape<TLFrameShape>({
      id: shape.id,
      type: "frame",
      props: {
        name: shape.props.name.startsWith("Orphaned · ")
          ? shape.props.name
          : `Orphaned · ${shape.props.name}`,
      },
      meta: { ...shape.meta, ...meta },
    });
    return;
  }
  if (shape.type === "arrow") {
    editor.updateShape<TLArrowShape>({
      id: shape.id,
      type: "arrow",
      props: { dash: "dashed", color: "grey" },
      meta: { ...shape.meta, ...meta },
    });
    return;
  }
  editor.updateShape({
    id: shape.id,
    type: shape.type,
    meta: { ...shape.meta, ...meta },
  });
}

export function syncKanbanTracksProjection(
  editor: Editor,
  projection: KanbanTracksProjection,
) {
  const existing = editor
    .getCurrentPageShapes()
    .filter(
      (shape) =>
        readKanbanTrackBinding(shape)?.projectRef === projection.projectRef,
    );
  const viewportCenter = editor.getViewportPageBounds().center;
  const anchor = existing.find((shape) => {
    const binding = readKanbanTrackBinding(shape);
    return (
      shape.type === "frame" &&
      binding?.kind === "track" &&
      projection.tracks.some((track) => track.trackId === binding.trackId)
    );
  });
  const anchorBinding = anchor ? readKanbanTrackBinding(anchor) : null;
  const anchorTrackIndex = projection.tracks.findIndex(
    (track) => track.trackId === anchorBinding?.trackId,
  );
  const anchorBounds = anchor ? editor.getShapePageBounds(anchor) : null;
  const laneCount =
    projection.tracks.length + (projection.unassigned.tasks.length > 0 ? 1 : 0);
  const layoutHeight = Math.max(
    LANE_HEIGHT,
    laneCount * LANE_HEIGHT + Math.max(0, laneCount - 1) * LANE_GAP,
  );
  const planCenter =
    anchorBounds && anchorTrackIndex >= 0
      ? {
          x: anchorBounds.x + LANE_WIDTH / 2,
          y:
            anchorBounds.y -
            anchorTrackIndex * (LANE_HEIGHT + LANE_GAP) +
            layoutHeight / 2,
        }
      : viewportCenter;
  const plan = buildKanbanTracksRenderPlan(
    projection,
    planCenter,
    editor.getCurrentPageId(),
  );
  const existingById = new Map(existing.map((shape) => [shape.id, shape]));
  const desiredIds = new Set(plan.shapeIds);
  const createdIds: TLShapeId[] = [];
  const updatedIds: TLShapeId[] = [];
  const orphanedIds: TLShapeId[] = [];

  editor.markHistoryStoppingPoint(
    existing.length > 0 ? "Refresh Kanban Tracks" : "Import Kanban Tracks",
  );
  editor.run(() => {
    for (const desired of plan.shapes) {
      if (!desired.id) continue;
      const current = existingById.get(desired.id);
      if (!current) {
        editor.createShape(desired);
        createdIds.push(desired.id);
        continue;
      }
      if (desired.type === "frame" && current.type === "frame") {
        const frame = desired as TLCreateShapePartial<TLFrameShape>;
        editor.updateShape<TLFrameShape>({
          id: current.id,
          type: "frame",
          props: { name: frame.props?.name ?? current.props.name },
          meta: { ...current.meta, ...desired.meta },
        });
      } else if (desired.type === "geo" && current.type === "geo") {
        const geo = desired as TLCreateShapePartial<TLGeoShape>;
        editor.updateShape<TLGeoShape>({
          id: current.id,
          type: "geo",
          props: {
            richText: geo.props?.richText ?? current.props.richText,
            color: geo.props?.color ?? current.props.color,
            fill: geo.props?.fill ?? current.props.fill,
            dash: geo.props?.dash ?? current.props.dash,
          },
          meta: { ...current.meta, ...desired.meta },
        });
      } else if (desired.type === "text" && current.type === "text") {
        const text = desired as TLCreateShapePartial<TLTextShape>;
        editor.updateShape<TLTextShape>({
          id: current.id,
          type: "text",
          props: {
            richText: text.props?.richText ?? current.props.richText,
          },
          meta: { ...current.meta, ...desired.meta },
        });
      } else if (desired.type === "arrow" && current.type === "arrow") {
        const arrow = desired as TLCreateShapePartial<TLArrowShape>;
        editor.updateShape<TLArrowShape>({
          id: current.id,
          type: "arrow",
          props: {
            richText: arrow.props?.richText ?? current.props.richText,
          },
          meta: { ...current.meta, ...desired.meta },
        });
      }
      updatedIds.push(current.id);
    }

    for (const shape of existing) {
      if (desiredIds.has(shape.id)) continue;
      const binding = readKanbanTrackBinding(shape);
      if (!binding) continue;
      orphanShape(editor, shape, binding);
      orphanedIds.push(shape.id);
    }

    for (const binding of plan.bindings) {
      if (binding.id && editor.getBinding(binding.id)) continue;
      editor.createBinding(binding);
    }
  });

  if (createdIds.length > 0) {
    editor.setSelectedShapes(createdIds);
    const createdBounds = editor.getSelectionPageBounds();
    if (createdBounds) {
      editor.zoomToBounds(createdBounds, {
        targetZoom: 1,
        inset: 160,
        animation: { duration: 220 },
      });
    }
  }
  return {
    projectRef: projection.projectRef,
    revision: projection.revision,
    createdIds,
    updatedIds,
    orphanedIds,
  };
}
