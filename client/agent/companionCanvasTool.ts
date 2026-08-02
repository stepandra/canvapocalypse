import {
	isRecordsDiffEmpty,
	squashRecordDiffs,
	type BoxModel,
	type RecordsDiff,
	type TLRecord,
	type TLShape,
	type TLShapeId,
} from 'tldraw'
import type { AgentAction } from '../../shared/types/AgentAction'
import { getActionSchemaForMode } from '../../shared/types/AgentAction'
import type { ContextItem } from '../../shared/types/ContextItem'
import type { WorkbenchArtifactSummary, WorkbenchRelationSummary } from '../../shared/schema/PromptPartDefinitions'
import type { Streaming } from '../../shared/types/Streaming'
import { AgentHelpers } from '../AgentHelpers'
import { summarizeWorkbenchMeta } from '../parts/WorkbenchArtifactsPartUtil'
import type { TldrawAgent } from './TldrawAgent'
import {
	COMPANION_CANVAS_BINDING,
	COMPANION_CANVAS_CLIENT_KIND,
	type CompanionCanvasClientKind,
} from './companionCanvasBinding'
import { getCompletedNativeTldrawMutationActions } from './nativeMutationEvidence'

export const COMPANION_CANVAS_BRIDGE_BASE_URL =
	'http://127.0.0.1:5176/companion/canvas-tool'

export const COMPANION_TLDRAW_CAPABILITY_IDS = [
	'canvas.inspect',
	'canvas.shape.basic',
	'canvas.layout',
	'canvas.native-assets',
	'canvas.workflow',
	'canvas.result.read',
] as const

export type CompanionTldrawCapabilityId =
	(typeof COMPANION_TLDRAW_CAPABILITY_IDS)[number]
export type CompanionCanvasContextPolicy = 'selection' | 'selection-or-area'

export interface CompanionCanvasToolRequest {
	id: string
	status: 'queued' | 'leased' | 'succeeded' | 'failed'
	surface: 'tldraw'
	context: CompanionCanvasContextPolicy
	capabilityId: CompanionTldrawCapabilityId
	instruction?: string
	execution?: 'direct-actions'
	actions?: unknown[]
	contextRef?: string
	actor?: string
	source?: string
	leaseToken?: string
	canvasBinding?: string
	summary?: string
	createdAt: string
	updatedAt: string
}

export interface CompanionCanvasToolStatus {
	primary?: string
	bridge: 'ready'
	pending: number
	latest: CompanionCanvasToolRequest | null
	tools: ['tldraw_capabilities', 'tldraw_describe_capability', 'tldraw_execute']
	surface: 'tldraw'
	context: 'explicit-selection-or-bounded-area'
	mutations: 'validated-native-actions'
	canvasBinding?: string
}

export interface CompanionCanvasToolReceipt {
	requestId: string
	status: 'succeeded' | 'failed'
	capabilityId?: CompanionTldrawCapabilityId
	summary: string
	result?: unknown
}

export interface CompanionCanvasClientOptions {
	baseUrl?: string
	canvasBinding?: string
	clientKind?: CompanionCanvasClientKind
}

const MAX_INSPECTION_SHAPES = 24
const MAX_RECEIPT_SUMMARY_CHARS = 1_900
const MAX_LABEL_CHARS = 120
const MAX_DIRECT_ACTIONS = 24
const CONTEXT_SNAPSHOT_TTL_MS = 5 * 60_000
const MAX_CONTEXT_SNAPSHOTS = 32
const contextSnapshots = new Map<string, { digest: string; expiresAt: number }>()
const DIRECT_NATIVE_ACTION_TYPES = new Set<AgentAction['_type']>([
	'align',
	'bringToFront',
	'create',
	'delete',
	'distribute',
	'label',
	'move',
	'pen',
	'place',
	'resize',
	'rotate',
	'sendToBack',
	'stack',
	'update',
])

export async function getCompanionCanvasToolStatus(
	signal?: AbortSignal,
	options: CompanionCanvasClientOptions = {}
) {
	const { baseUrl, canvasBinding, clientKind } = resolveClientOptions(options)
	const response = await fetch(
		`${baseUrl}/status?canvasBinding=${encodeURIComponent(canvasBinding)}&clientKind=${encodeURIComponent(clientKind)}`,
		{ cache: 'no-store', signal }
	)
	if (!response.ok) {
		throw new Error((await response.text()) || 'Companion canvas bridge is unavailable')
	}
	return (await response.json()) as CompanionCanvasToolStatus
}

export async function leaseCompanionCanvasToolRequest(
	signal?: AbortSignal,
	options: CompanionCanvasClientOptions = {}
) {
	const { baseUrl, canvasBinding, clientKind } = resolveClientOptions(options)
	const response = await fetch(
		`${baseUrl}/next?canvasBinding=${encodeURIComponent(canvasBinding)}&clientKind=${encodeURIComponent(clientKind)}`,
		{ cache: 'no-store', signal }
	)
	if (!response.ok) {
		throw new Error((await response.text()) || 'Could not lease companion canvas request')
	}
	const payload = (await response.json()) as {
		request: CompanionCanvasToolRequest | null
	}
	return payload.request
}

export async function executeCompanionCanvasToolRequest(
	agent: TldrawAgent,
	request: CompanionCanvasToolRequest
): Promise<CompanionCanvasToolReceipt> {
	if (!COMPANION_TLDRAW_CAPABILITY_IDS.includes(request.capabilityId)) {
		throw new Error('Companion requested an unknown native tldraw capability')
	}

	const isReadOnly =
		request.capabilityId === 'canvas.inspect' ||
		request.capabilityId === 'canvas.result.read'
	// Finish any active text edit / pointer interaction before validating a
	// mutation against its bounded snapshot. If completion changes geometry,
	// the context digest will drift and the caller must inspect again.
	if (!isReadOnly) agent.editor.complete()
	const bounded = resolveExplicitCanvasContext(agent, request.context)
	if (
		request.capabilityId === 'canvas.inspect' ||
		request.capabilityId === 'canvas.result.read'
	) {
		const projection = buildBoundedSemanticInspectionResult(
			agent,
			request.capabilityId,
			bounded
		)
		const contextRef = projection.contextDigest
		rememberContextSnapshot(contextRef, projection.contextDigest)
		const { contextDigest: _contextDigest, ...visibleProjection } = projection
		const result = { ...visibleProjection, contextRef }
		return {
			requestId: request.id,
			status: 'succeeded',
			capabilityId: request.capabilityId,
			summary: `${request.capabilityId === 'canvas.result.read' ? 'Read' : 'Inspected'} ${result.shapes.length} bounded native tldraw shape${result.shapes.length === 1 ? '' : 's'} (${result.boundary}).`,
			result,
		}
	}

	const actions = validateDirectCompanionActions(agent, request, bounded)
	const mutation = await applyDirectCompanionActions(agent, actions, bounded)
	const completedActions = mutation.completedActions
	if (request.contextRef) contextSnapshots.delete(request.contextRef)

	return {
		requestId: request.id,
		status: 'succeeded',
		capabilityId: request.capabilityId,
		summary: compactReceiptText(
			`Completed ${request.capabilityId}: ${completedActions.length} validated native tldraw action${completedActions.length === 1 ? '' : 's'} (${[...new Set(completedActions)].join(', ')}); boundary ${bounded.boundary}; ${bounded.explicitShapes.length} explicit shape${bounded.explicitShapes.length === 1 ? '' : 's'}.`
		),
		result: {
			contextRef: request.contextRef,
			operationCount: completedActions.length,
			actionTypes: completedActions,
			shapeIds: mutation.shapeIds,
			undoable: true,
		},
	}
}

export async function postCompanionCanvasToolReceipt(
	receipt: CompanionCanvasToolReceipt,
	lease: Pick<CompanionCanvasToolRequest, 'leaseToken' | 'canvasBinding'>,
	options: CompanionCanvasClientOptions = {}
) {
	const { baseUrl } = resolveClientOptions(options)
	if (!lease.leaseToken) {
		throw new Error('Companion canvas receipt is missing its lease authorization')
	}
	const response = await fetch(`${baseUrl}/receipt`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		cache: 'no-store',
		body: JSON.stringify({
			...receipt,
			summary: compactReceiptText(receipt.summary),
			leaseToken: lease.leaseToken,
			...(lease.canvasBinding ? { canvasBinding: lease.canvasBinding } : {}),
		}),
	})
	if (!response.ok) {
		throw new Error((await response.text()) || 'Could not record companion canvas receipt')
	}
	return (await response.json()) as CompanionCanvasToolRequest
}

export interface ExplicitCompanionCanvasContext {
	bounds: BoxModel
	boundary: 'selection' | 'area'
	contextItems: ContextItem[]
	explicitShapes: TLShape[]
}

export function resolveExplicitCanvasContext(
	agent: TldrawAgent,
	policy: CompanionCanvasContextPolicy
): ExplicitCompanionCanvasContext {
	const selectedShapes = agent.editor.getSelectedShapes()
	const explicitItems = agent.context
		.getItems()
		.filter(
			(item): item is ContextItem =>
				item.type === 'shape' || item.type === 'shapes' || item.type === 'area'
		)
	const shapeItems = explicitItems.filter(
		(item) => item.type === 'shape' || item.type === 'shapes'
	)
	const areaItem = explicitItems.find((item) => item.type === 'area')
	const contextShapes = getContextShapes(agent, shapeItems)
	const explicitShapes = uniqueShapes([...selectedShapes, ...contextShapes]).slice(
		0,
		MAX_INSPECTION_SHAPES
	)

	if (policy === 'selection' && explicitShapes.length === 0) {
		throw new Error(
			'Companion canvas request requires an explicit shape selection; nothing is selected'
		)
	}
	if (explicitShapes.length === 0 && !areaItem) {
		throw new Error(
			'Companion canvas request requires an explicit selection or bounded area; whole-canvas fallback is disabled'
		)
	}

	const selectionBounds =
		explicitShapes.length > 0 ? boundsForShapes(agent, explicitShapes) : null
	const areaBounds = areaItem?.type === 'area' ? boxModel(areaItem.bounds) : null
	const bounds = selectionBounds ?? areaBounds
	if (!bounds || bounds.w <= 0 || bounds.h <= 0) {
		throw new Error('Companion explicit canvas context has no usable bounded geometry')
	}

	return {
		bounds,
		boundary: selectionBounds ? 'selection' : 'area',
		contextItems: explicitItems.slice(0, 12),
		explicitShapes,
	}
}

/**
 * The inspection receipt is a compact semantic projection, never a screenshot
 * or raw shape/meta dump. Its JSON shape is intentionally stable for external
 * Amp/Codex/MCP companions.
 */
export function buildBoundedSemanticInspection(
	agent: TldrawAgent,
	capabilityId: 'canvas.inspect' | 'canvas.result.read',
	context: ExplicitCompanionCanvasContext
) {
	return JSON.stringify(buildBoundedSemanticInspectionResult(agent, capabilityId, context))
}

export function buildBoundedSemanticInspectionResult(
	agent: TldrawAgent,
	capabilityId: 'canvas.inspect' | 'canvas.result.read',
	context: ExplicitCompanionCanvasContext
) {
	const candidates =
		context.explicitShapes.length > 0
			? context.explicitShapes
			: getShapesInsideBounds(agent, context.bounds)
	const authorized = uniqueShapes(candidates).sort((a, b) => a.id.localeCompare(b.id))
	const ordered = authorized.slice(0, MAX_INSPECTION_SHAPES)
	const projected = ordered.map((shape) => projectShape(agent, shape))
	const projection = {
		version: 1,
		kind: capabilityId === 'canvas.result.read' ? 'canvas-result' : 'canvas-inspection',
		boundary: context.boundary,
		bounds: roundBox(context.bounds),
		truncated: authorized.length > ordered.length,
		shapes: projected,
	}

	return {
		...projection,
		contextDigest: createContextRef({
			projection,
			// Store-record fields strengthen drift detection but are hashed only;
			// they never cross the bridge as raw canvas state.
			// Hash every authorized record, including records omitted from the
			// compact 24-shape projection. A dense area must never authorize
			// unseen records against only a truncated context snapshot.
			records: authorized.map((shape) => ({
				id: shape.id,
				type: shape.type,
				parentId: shape.parentId,
				index: shape.index,
				x: shape.x,
				y: shape.y,
				rotation: shape.rotation,
				opacity: shape.opacity,
				isLocked: shape.isLocked,
				props: shape.props,
			})),
		}),
	}
}

function rememberContextSnapshot(contextRef: string, digest: string) {
	const now = Date.now()
	for (const [key, snapshot] of contextSnapshots) {
		if (snapshot.expiresAt <= now) contextSnapshots.delete(key)
	}
	while (contextSnapshots.size >= MAX_CONTEXT_SNAPSHOTS) {
		const oldest = contextSnapshots.keys().next().value
		if (typeof oldest !== 'string') break
		contextSnapshots.delete(oldest)
	}
	contextSnapshots.set(contextRef, {
		digest,
		expiresAt: now + CONTEXT_SNAPSHOT_TTL_MS,
	})
}

function getContextSnapshot(contextRef: string) {
	const snapshot = contextSnapshots.get(contextRef)
	if (!snapshot) return null
	if (snapshot.expiresAt <= Date.now()) {
		contextSnapshots.delete(contextRef)
		return null
	}
	return snapshot
}

function projectShape(agent: TldrawAgent, shape: TLShape) {
	const pageBounds = boxModel(
		agent.editor.getShapeMaskedPageBounds(shape) ??
			agent.editor.getShapePageBounds(shape.id)
	)
	const label = safePlainLabel(agent.editor.getShapeUtil(shape).getText(shape))
	const semantic = summarizeWorkbenchMeta(shape.meta)
	return {
		id: shape.id,
		type: shape.type,
		...(label ? { label } : {}),
		...(pageBounds ? { bounds: roundBox(pageBounds) } : {}),
		...compactSemantic(semantic),
	}
}

function compactSemantic(
	semantic: {
		artifact?: WorkbenchArtifactSummary
		relation?: WorkbenchRelationSummary
	} | null
) {
	if (!semantic) return {}
	const artifact = semantic.artifact
	const relation = semantic.relation
	return {
		...(artifact
			? {
					workbench: {
						artifact: compactDefined({
							artifactId: artifact.artifactId,
							pack: artifact.pack,
							kind: artifact.kind,
							title: artifact.title,
							status: artifact.status,
						}),
					},
				}
			: {}),
		...(relation
			? {
					relation: compactDefined({
						relationId: relation.relationId,
						pack: relation.pack,
						type: relation.type,
						label: relation.label,
						start: relation.start
							? compactDefined({
									artifactId: relation.start.artifactId,
									shapeId: relation.start.shapeId,
								})
							: undefined,
						end: relation.end
							? compactDefined({
									artifactId: relation.end.artifactId,
									shapeId: relation.end.shapeId,
								})
							: undefined,
					}),
				}
			: {}),
	}
}

function validateDirectCompanionActions(
	agent: TldrawAgent,
	request: CompanionCanvasToolRequest,
	context: ExplicitCompanionCanvasContext
): AgentAction[] {
	if (request.execution !== 'direct-actions') {
		throw new Error(
			'External companion mutations require execution=direct-actions; planner delegation is disabled'
		)
	}
	if (!Array.isArray(request.actions) || request.actions.length === 0) {
		throw new Error(
			'External companion mutations require a bounded validated AgentAction plan; instruction-only execution is disabled'
		)
	}
	if (request.actions.length > MAX_DIRECT_ACTIONS) {
		throw new Error(`External companion plan exceeds ${MAX_DIRECT_ACTIONS} actions`)
	}

	const currentProjection = buildBoundedSemanticInspectionResult(
		agent,
		'canvas.inspect',
		context
	)
	const snapshot = request.contextRef ? getContextSnapshot(request.contextRef) : null
	if (!snapshot || snapshot.digest !== currentProjection.contextDigest) {
		throw new Error(
			'Companion canvas context drifted or has no matching live snapshot; inspect the explicit boundary again'
		)
	}

	const mode = agent.mode.getCurrentModeType()
	const parsed = request.actions.map((candidate, index) => {
		if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
			throw new Error(`Companion action ${index + 1} is not an object`)
		}
		const actionType = (candidate as { _type?: unknown })._type
		if (typeof actionType !== 'string' || !DIRECT_NATIVE_ACTION_TYPES.has(actionType as AgentAction['_type'])) {
			throw new Error(`Companion action ${index + 1} is outside the native mutation allowlist`)
		}
		const schema = getActionSchemaForMode(actionType, mode)
		const result = schema?.safeParse(candidate)
		if (!result?.success) {
			throw new Error(`Companion action ${index + 1} is not a valid ${actionType} action`)
		}
		return result.data as AgentAction
	})

	assertActionsStayInsideBoundary(agent, parsed, context)
	return parsed
}

async function applyDirectCompanionActions(
	agent: TldrawAgent,
	actions: AgentAction[],
	context: ExplicitCompanionCanvasContext
) {
	const helpers = new AgentHelpers(agent)
	// External companions plan against the absolute page-space projection
	// returned by canvas.inspect, not the embedded model's chat-relative offset.
	helpers.offset = { x: 0, y: 0 }
	const promises: Promise<void>[] = []
	const diffs: RecordsDiff<TLRecord>[] = []
	const historyBefore = [...agent.chat.getHistory()]
	// Capture authorization before any action util can mutate canvas membership
	// or sanitize a nested create payload in place.
	const authorizedExistingIds = authorizedShapeIds(agent, context)
	const plannedCreatedIds = new Set(
		actions.flatMap((action) => {
			const id = createdShapeIdForAction(action)
			return id ? [id] : []
		})
	)
	const historyMark = agent.editor.markHistoryStoppingPoint(
		'Before companion canvas operation'
	)

	try {
		for (const [index, parsed] of actions.entries()) {
			const streamed = {
				...parsed,
				complete: true,
				time: index,
			} as Streaming<AgentAction>
			agent.setIsActingOnEditor(true)
			try {
				agent.editor.run(
					() => {
						const util = agent.actions.getAgentActionUtil(streamed._type)
						const transformed = util.sanitizeAction(streamed, helpers)
						if (!transformed || !transformed.complete) {
							throw new Error(
								`Companion ${streamed._type} action was rejected during sanitization`
							)
						}
						const { diff, promise } = agent.actions.act(transformed, helpers)
						diffs.push(diff)
						agent.lints.trackShapesFromDiff(diff)
						if (promise) promises.push(promise)
					},
					{ ignoreShapeLock: true }
				)
			} finally {
				agent.setIsActingOnEditor(false)
			}
		}

		await Promise.all(promises)
		const diff = squashRecordDiffs(diffs)
		assertMutationStayedInsideBoundary(
			agent,
			context,
			diff,
			authorizedExistingIds,
			plannedCreatedIds
		)
		const completedActions = getCompletedNativeTldrawMutationActions(
			agent.chat.getHistory(),
			historyBefore.length
		)
		if (completedActions.length === 0) {
			throw new Error(
				'Companion request produced no completed native tldraw mutation with a non-empty record diff'
			)
		}
		// One validated companion request becomes one native undo step.
		agent.editor.squashToMark(historyMark)
		return {
			completedActions,
			shapeIds: changedShapeIdsFromDiff(diff),
		}
	} catch (error) {
		// A compact failure receipt must never conceal a partially applied plan.
		// Roll the editor and the agent's action evidence back to their common mark.
		agent.editor.bailToMark(historyMark)
		agent.chat.update(() => historyBefore)
		throw error
	}
}

function assertMutationStayedInsideBoundary(
	agent: TldrawAgent,
	context: ExplicitCompanionCanvasContext,
	diff: RecordsDiff<TLRecord>,
	authorizedExistingIds: ReadonlySet<TLShapeId>,
	plannedCreatedIds: ReadonlySet<TLShapeId>
) {
	if (isRecordsDiffEmpty(diff)) {
		throw new Error(
			'Companion request produced an empty native tldraw record diff; refusing an undoable success receipt'
		)
	}

	const authorizedIds = new Set([...authorizedExistingIds, ...plannedCreatedIds])

	const assertAuthorized = (id: TLShapeId, description: string) => {
		if (!authorizedIds.has(id)) {
			throw new Error(
				`Companion native mutation ${description} ${id} outside the explicit ${context.boundary} boundary`
			)
		}
	}
	const assertBindingReferences = (
		binding: Extract<TLRecord, { typeName: 'binding' }>,
		description: string
	) => {
		assertAuthorized(binding.fromId, `${description} references`)
		assertAuthorized(binding.toId, `${description} references`)
	}
	const assertFinalShape = (shape: TLShape, previous?: TLShape) => {
		assertAuthorized(shape.id, 'changed')
		const parentChanged = !previous || previous.parentId !== shape.parentId
		if (
			parentChanged &&
			typeof shape.parentId === 'string' &&
			shape.parentId.startsWith('shape:')
		) {
			assertAuthorized(shape.parentId as TLShapeId, 'parents under')
		}

		const liveShape = agent.editor.getShape(shape.id)
		if (!liveShape) {
			throw new Error(`Companion native mutation lost final shape ${shape.id}`)
		}
		const finalBounds = boxModel(
			agent.editor.getShapeMaskedPageBounds(liveShape) ??
				agent.editor.getShapePageBounds(liveShape.id)
		)
		const finalBoundsStayAuthorized =
			finalBounds &&
			(context.boundary === 'area' || !previous
				? boxInsideBox(finalBounds, context.bounds)
				: boxesIntersect(finalBounds, context.bounds))
		if (!finalBoundsStayAuthorized) {
			throw new Error(
				`Companion native mutation placed final bounds for ${shape.id} outside the explicit ${context.boundary} boundary`
			)
		}

		if (liveShape.type === 'arrow') {
			for (const binding of agent.editor.getBindingsFromShape(liveShape.id, 'arrow')) {
				assertBindingReferences(binding, 'left a final arrow binding that')
			}
		}
	}

	for (const record of Object.values(diff.added)) {
		if (record.typeName === 'shape') {
			assertFinalShape(record)
		} else if (record.typeName === 'binding') {
			assertBindingReferences(record, 'added a binding that')
		} else {
			throw new Error(
				`Companion native mutation added unexpected ${record.typeName} record ${record.id}`
			)
		}
	}
	for (const [before, after] of Object.values(diff.updated)) {
		if (before.typeName === 'shape' && after.typeName === 'shape') {
			assertFinalShape(after, before)
		} else if (before.typeName === 'binding' && after.typeName === 'binding') {
			assertBindingReferences(after, 'updated a binding that')
		} else {
			throw new Error(
				`Companion native mutation updated unexpected ${after.typeName} record ${after.id}`
			)
		}
	}
	for (const record of Object.values(diff.removed)) {
		if (record.typeName === 'shape') {
			assertAuthorized(record.id, 'removed')
		} else if (record.typeName === 'binding') {
			assertBindingReferences(record, 'removed a binding that')
		} else {
			throw new Error(
				`Companion native mutation removed unexpected ${record.typeName} record ${record.id}`
			)
		}
	}
}

function authorizedShapeIds(
	agent: TldrawAgent,
	context: ExplicitCompanionCanvasContext
) {
	return new Set(
		(context.boundary === 'selection'
			? context.explicitShapes
			: getShapesInsideBounds(agent, context.bounds)
		).map((shape) => shape.id)
	)
}

function assertActionsStayInsideBoundary(
	agent: TldrawAgent,
	actions: AgentAction[],
	context: ExplicitCompanionCanvasContext
) {
	const allowedExistingIds = authorizedShapeIds(agent, context)
	const plannedIds = new Set<TLShapeId>()

	for (const [index, action] of actions.entries()) {
		const referenced = existingShapeIdsForAction(action)
		for (const id of referenced) {
			if (!allowedExistingIds.has(id) && !plannedIds.has(id)) {
				throw new Error(
					`Companion action ${index + 1} references ${id} outside the explicit ${context.boundary} boundary`
				)
			}
		}

		for (const point of actionPoints(action)) {
			if (!pointInsideBox(point, context.bounds)) {
				throw new Error(
					`Companion action ${index + 1} places geometry outside the explicit ${context.boundary} boundary`
				)
			}
		}

		const createdId = createdShapeIdForAction(action)
		if (createdId) {
			if (agent.editor.getShape(createdId) || plannedIds.has(createdId)) {
				throw new Error(`Companion action ${index + 1} reuses existing shape id ${createdId}`)
			}
			plannedIds.add(createdId)
		}
	}
}

function existingShapeIdsForAction(action: AgentAction): TLShapeId[] {
	const value = action as unknown as Record<string, unknown>
	const ids: string[] = []
	if (typeof value.shapeId === 'string' && action._type !== 'pen') ids.push(value.shapeId)
	if (typeof value.referenceShapeId === 'string') ids.push(value.referenceShapeId)
	if (Array.isArray(value.shapeIds)) {
		ids.push(...value.shapeIds.filter((id): id is string => typeof id === 'string'))
	}
	const update = asRecord(value.update)
	if (typeof update?.shapeId === 'string') ids.push(update.shapeId)
	const arrow =
		action._type === 'create'
			? asRecord(value.shape)
			: action._type === 'update'
				? update
				: null
	if (arrow?._type === 'arrow') {
		if (typeof arrow.fromId === 'string') ids.push(arrow.fromId)
		if (typeof arrow.toId === 'string') ids.push(arrow.toId)
	}
	return [...new Set(ids.map(normalizeShapeId))]
}

function createdShapeIdForAction(action: AgentAction): TLShapeId | null {
	const value = action as unknown as Record<string, unknown>
	if (action._type === 'create') {
		const shape = asRecord(value.shape)
		return typeof shape?.shapeId === 'string' ? normalizeShapeId(shape.shapeId) : null
	}
	if (action._type === 'pen') {
		return typeof value.shapeId === 'string' ? normalizeShapeId(value.shapeId) : null
	}
	return null
}

function actionPoints(action: AgentAction) {
	const value = action as unknown as Record<string, unknown>
	const points: { x: number; y: number }[] = []
	const addPoint = (x: unknown, y: unknown) => {
		if (typeof x === 'number' && typeof y === 'number') points.push({ x, y })
	}

	addPoint(value.x, value.y)
	addPoint(value.originX, value.originY)
	const shape =
		action._type === 'create'
			? asRecord(value.shape)
			: action._type === 'update'
				? asRecord(value.update)
				: null
	if (shape) {
		addPoint(shape.x, shape.y)
		addPoint(shape.x1, shape.y1)
		addPoint(shape.x2, shape.y2)
	}
	if (Array.isArray(value.points)) {
		for (const point of value.points) {
			const record = asRecord(point)
			addPoint(record?.x, record?.y)
		}
	}
	return points
}

function changedShapeIdsFromDiff(diff: RecordsDiff<TLRecord>) {
	const ids = new Set<TLShapeId>()
	const addRecord = (record: TLRecord) => {
		if (record.typeName === 'shape') {
			ids.add(record.id)
		} else if (record.typeName === 'binding') {
			ids.add(record.fromId)
			ids.add(record.toId)
		}
	}
	for (const record of Object.values(diff.added)) addRecord(record)
	for (const [, record] of Object.values(diff.updated)) addRecord(record)
	for (const record of Object.values(diff.removed)) addRecord(record)
	return [...ids].sort().slice(0, 48)
}

function createContextRef(value: unknown) {
	const input = JSON.stringify(value)
	let hash = 0x811c9dc5
	for (let index = 0; index < input.length; index += 1) {
		hash ^= input.charCodeAt(index)
		hash = Math.imul(hash, 0x01000193)
	}
	return `ctx-v1-${(hash >>> 0).toString(16).padStart(8, '0')}`
}

function pointInsideBox(point: { x: number; y: number }, bounds: BoxModel) {
	const minX = Math.min(bounds.x, bounds.x + bounds.w)
	const maxX = Math.max(bounds.x, bounds.x + bounds.w)
	const minY = Math.min(bounds.y, bounds.y + bounds.h)
	const maxY = Math.max(bounds.y, bounds.y + bounds.h)
	return point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY
}

function boxInsideBox(inner: BoxModel, outer: BoxModel) {
	const epsilon = 0.01
	const innerMinX = Math.min(inner.x, inner.x + inner.w)
	const innerMaxX = Math.max(inner.x, inner.x + inner.w)
	const innerMinY = Math.min(inner.y, inner.y + inner.h)
	const innerMaxY = Math.max(inner.y, inner.y + inner.h)
	const outerMinX = Math.min(outer.x, outer.x + outer.w)
	const outerMaxX = Math.max(outer.x, outer.x + outer.w)
	const outerMinY = Math.min(outer.y, outer.y + outer.h)
	const outerMaxY = Math.max(outer.y, outer.y + outer.h)
	return (
		innerMinX >= outerMinX - epsilon &&
		innerMaxX <= outerMaxX + epsilon &&
		innerMinY >= outerMinY - epsilon &&
		innerMaxY <= outerMaxY + epsilon
	)
}

function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null
}

function resolveClientOptions(options: CompanionCanvasClientOptions) {
	return {
		baseUrl: options.baseUrl ?? COMPANION_CANVAS_BRIDGE_BASE_URL,
		canvasBinding: options.canvasBinding ?? COMPANION_CANVAS_BINDING,
		clientKind: options.clientKind ?? COMPANION_CANVAS_CLIENT_KIND,
	}
}

function getContextShapes(agent: TldrawAgent, items: ContextItem[]) {
	const ids = items.flatMap((item) => {
		if (item.type === 'shape') return [item.shape.shapeId]
		if (item.type === 'shapes') return item.shapes.map((shape) => shape.shapeId)
		return []
	})
	return ids.flatMap((shapeId) => {
		const id = normalizeShapeId(shapeId)
		const shape = agent.editor.getShape(id)
		return shape ? [shape] : []
	})
}

function normalizeShapeId(shapeId: string) {
	return (shapeId.startsWith('shape:') ? shapeId : `shape:${shapeId}`) as TLShapeId
}

function boundsForShapes(agent: TldrawAgent, shapes: TLShape[]) {
	return unionBoxes(
		shapes.flatMap((shape) => {
			const bounds = boxModel(
				agent.editor.getShapeMaskedPageBounds(shape) ??
					agent.editor.getShapePageBounds(shape.id)
			)
			return bounds ? [bounds] : []
		})
	)
}

function getShapesInsideBounds(agent: TldrawAgent, bounds: BoxModel) {
	return agent.editor.getCurrentPageShapesSorted().filter((shape) => {
		const shapeBounds =
			agent.editor.getShapeMaskedPageBounds(shape) ??
			agent.editor.getShapePageBounds(shape.id)
		return shapeBounds ? boxesIntersect(bounds, shapeBounds) : false
	})
}

function uniqueShapes(shapes: TLShape[]) {
	return [...new Map(shapes.map((shape) => [shape.id, shape])).values()]
}

function safePlainLabel(value: string | undefined | null) {
	if (!value) return undefined
	const plain = value.replace(/\s+/g, ' ').trim()
	if (!plain || containsLocalFilesystemPath(plain)) return undefined
	return plain.slice(0, MAX_LABEL_CHARS)
}

function containsLocalFilesystemPath(value: string) {
	return (
		/(?:^|\s)(?:file:\/\/|\/Users\/|\/home\/|\/var\/folders\/|[A-Za-z]:\\)/.test(value) ||
		value.includes('Library/Application Support/')
	)
}

function compactDefined(value: Record<string, unknown>) {
	return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined))
}

function compactReceiptText(value: string) {
	return value.trim().slice(0, MAX_RECEIPT_SUMMARY_CHARS)
}

function roundBox(bounds: BoxModel): BoxModel {
	return {
		x: Math.round(bounds.x),
		y: Math.round(bounds.y),
		w: Math.round(bounds.w),
		h: Math.round(bounds.h),
	}
}

function unionBoxes(boxes: BoxModel[]): BoxModel | null {
	if (boxes.length === 0) return null
	let x1 = boxes[0].x
	let y1 = boxes[0].y
	let x2 = boxes[0].x + boxes[0].w
	let y2 = boxes[0].y + boxes[0].h
	for (const box of boxes.slice(1)) {
		x1 = Math.min(x1, box.x)
		y1 = Math.min(y1, box.y)
		x2 = Math.max(x2, box.x + box.w)
		y2 = Math.max(y2, box.y + box.h)
	}
	return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }
}

function boxesIntersect(a: BoxModel, b: BoxModel) {
	return a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y
}

function boxModel(value: BoxModel | null | undefined): BoxModel | null {
	if (!value) return null
	return { x: value.x, y: value.y, w: value.w, h: value.h }
}
