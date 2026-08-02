import type { BoxModel, TLShape, TLShapeId } from 'tldraw'
import { DEFAULT_MODEL_NAME, ML_INTERN_EVAL_LAB_MODEL_NAME } from '../../shared/models'
import type { ContextItem } from '../../shared/types/ContextItem'
import type { TldrawAgent } from './TldrawAgent'
import {
	COMPANION_CANVAS_BINDING,
	COMPANION_CANVAS_CLIENT_KIND,
} from './companionCanvasBinding'
import { getCompletedNativeTldrawMutationActions } from './nativeMutationEvidence'

const BRIDGE_BASE_URL = 'http://127.0.0.1:5176/ml-intern/canvas-tool'
export const ML_INTERN_TLDRAW_CAPABILITY_IDS = [
	'canvas.inspect',
	'canvas.shape.basic',
	'canvas.layout',
	'canvas.native-assets',
	'canvas.workflow',
	'canvas.result.read',
] as const

export type MlInternTldrawCapabilityId = (typeof ML_INTERN_TLDRAW_CAPABILITY_IDS)[number]
export type MlInternCanvasContextPolicy = 'selection' | 'selection-or-area'

export interface MlInternCanvasToolRequest {
	id: string
	status: 'queued' | 'leased' | 'succeeded' | 'failed'
	surface: 'tldraw'
	context: MlInternCanvasContextPolicy
	bounds?: BoxModel
	capabilityId: MlInternTldrawCapabilityId
	instruction?: string
	leaseToken?: string
	canvasBinding?: string
	summary?: string
	createdAt: string
	updatedAt: string
}

export interface MlInternCanvasToolStatus {
	primary: 'terminal'
	bridge: 'ready'
	pending: number
	latest: MlInternCanvasToolRequest | null
	tools: ['tldraw_capabilities', 'tldraw_describe_capability', 'tldraw_execute']
	surface: 'tldraw'
	context: 'explicit-selection-or-bounded-area'
	mutations: 'validated-native-actions'
	canvasBinding: string
}

export async function getMlInternCanvasToolStatus(signal?: AbortSignal) {
	const response = await fetch(
		`${BRIDGE_BASE_URL}/status?canvasBinding=${encodeURIComponent(COMPANION_CANVAS_BINDING)}&clientKind=${encodeURIComponent(COMPANION_CANVAS_CLIENT_KIND)}`,
		{ cache: 'no-store', signal }
	)
	if (!response.ok) throw new Error((await response.text()) || 'ML-Intern canvas bridge is unavailable')
	return (await response.json()) as MlInternCanvasToolStatus
}

export async function leaseMlInternCanvasToolRequest(signal?: AbortSignal) {
	const response = await fetch(
		`${BRIDGE_BASE_URL}/next?canvasBinding=${encodeURIComponent(COMPANION_CANVAS_BINDING)}&clientKind=${encodeURIComponent(COMPANION_CANVAS_CLIENT_KIND)}`,
		{ cache: 'no-store', signal }
	)
	if (!response.ok) throw new Error((await response.text()) || 'Could not lease ML-Intern canvas request')
	const payload = (await response.json()) as { request: MlInternCanvasToolRequest | null }
	return payload.request
}

export async function executeMlInternCanvasToolRequest(
	agent: TldrawAgent,
	request: MlInternCanvasToolRequest
) {
	if (!request.instruction?.trim()) throw new Error('ML-Intern canvas request has no instruction')
	if (!ML_INTERN_TLDRAW_CAPABILITY_IDS.includes(request.capabilityId)) {
		throw new Error('ML-Intern requested an unknown native tldraw capability')
	}

	const bounded = resolveExplicitCanvasContext(agent, request.context, request.bounds)
	if (
		request.capabilityId === 'canvas.inspect' ||
		request.capabilityId === 'canvas.result.read'
	) {
		return {
			requestId: request.id,
			status: 'succeeded' as const,
			capabilityId: request.capabilityId,
			summary: buildInspectionSummary(
				agent,
				request.capabilityId,
				bounded.selectedShapes,
				bounded.contextItems,
				bounded.bounds
			),
		}
	}

	if (agent.modelName.getModelName() === ML_INTERN_EVAL_LAB_MODEL_NAME) {
		agent.modelName.setModelName(DEFAULT_MODEL_NAME)
	}

	const capabilityInstruction = [
		`ML-Intern native-tldraw capability: ${request.capabilityId}.`,
		'Work only inside the supplied explicit selection or bounded area.',
		'Use validated native tldraw actions and do not route through Isoflow.',
		request.instruction,
	].join('\n')
	const historyStartIndex = agent.chat.getHistory().length
	await agent.prompt({
		agentMessages: [capabilityInstruction],
		userMessages: [request.instruction],
		bounds: bounded.bounds,
		source: 'other-agent',
		contextItems: bounded.contextItems,
		routing: {
			enabled: true,
			route: 'canvas-edit',
			capabilityTier:
				request.capabilityId === 'canvas.layout' || request.capabilityId === 'canvas.workflow'
					? 'extended'
					: 'base',
			maxHistoryItems: 2,
		},
	})
	const completedActions = getCompletedNativeTldrawMutationActions(
		agent.chat.getHistory(),
		historyStartIndex
	)
	if (completedActions.length === 0) {
		throw new Error(
			`ML-Intern ${request.capabilityId} returned no completed validated native tldraw mutation action; refusing a success receipt`
		)
	}

	return {
		requestId: request.id,
		status: 'succeeded' as const,
		capabilityId: request.capabilityId,
		summary: `Completed ${request.capabilityId} with ${completedActions.length} validated native tldraw action${completedActions.length === 1 ? '' : 's'} (${[...new Set(completedActions)].join(', ')}) for ${bounded.selectedShapes.length} selected shape${bounded.selectedShapes.length === 1 ? '' : 's'} and ${bounded.contextItems.length} explicit context item${bounded.contextItems.length === 1 ? '' : 's'}.`,
	}
}

export async function postMlInternCanvasToolReceipt(
	receipt: {
		requestId: string
		status: 'succeeded' | 'failed'
		capabilityId?: MlInternTldrawCapabilityId
		summary: string
	},
	lease: Pick<MlInternCanvasToolRequest, 'leaseToken' | 'canvasBinding'>
) {
	if (!lease.leaseToken) {
		throw new Error('ML-Intern canvas receipt is missing its lease authorization')
	}
	const response = await fetch(`${BRIDGE_BASE_URL}/receipt`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		cache: 'no-store',
		body: JSON.stringify({
			...receipt,
			leaseToken: lease.leaseToken,
			...(lease.canvasBinding ? { canvasBinding: lease.canvasBinding } : {}),
		}),
	})
	if (!response.ok) throw new Error((await response.text()) || 'Could not record canvas tool receipt')
	return (await response.json()) as MlInternCanvasToolRequest
}

interface ExplicitCanvasContext {
	bounds: BoxModel
	contextItems: ContextItem[]
	selectedShapes: TLShape[]
}

function resolveExplicitCanvasContext(
	agent: TldrawAgent,
	policy: MlInternCanvasContextPolicy,
	requestedBounds?: BoxModel
): ExplicitCanvasContext {
	const requestedAreaBounds = validateRequestedBounds(requestedBounds, policy)
	const selectedShapes = requestedAreaBounds ? [] : agent.editor.getSelectedShapes()
	const explicitItems: ContextItem[] = requestedAreaBounds
		? [{ type: 'area', bounds: requestedAreaBounds, source: 'agent' }]
		: agent.context
				.getItems()
				.filter(
					(item): item is ContextItem =>
						item.type === 'shape' || item.type === 'shapes' || item.type === 'area'
				)
	const shapeItems = explicitItems.filter(
		(item) => item.type === 'shape' || item.type === 'shapes'
	)
	const areaItem = explicitItems.find((item) => item.type === 'area')

	if (policy === 'selection' && selectedShapes.length === 0 && shapeItems.length === 0) {
		throw new Error(
			'ML-Intern canvas request requires an explicit shape selection; nothing is selected'
		)
	}
	if (selectedShapes.length === 0 && explicitItems.length === 0) {
		throw new Error(
			'ML-Intern canvas request requires an explicit selection or bounded area; whole-canvas fallback is disabled'
		)
	}

	const selectionBounds =
		selectedShapes.length > 0 ? boxModel(agent.editor.getSelectionPageBounds()) : null
	const areaBounds =
		requestedAreaBounds ?? (areaItem?.type === 'area' ? boxModel(areaItem.bounds) : null)
	const contextShapeBounds =
		selectionBounds || areaBounds ? null : boundsForContextShapes(agent, shapeItems)
	const bounds = selectionBounds ?? areaBounds ?? contextShapeBounds
	if (!bounds || bounds.w <= 0 || bounds.h <= 0) {
		throw new Error('ML-Intern explicit canvas context has no usable bounded geometry')
	}

	return {
		bounds,
		contextItems: explicitItems.slice(0, 12),
		selectedShapes,
	}
}

function validateRequestedBounds(
	value: BoxModel | undefined,
	policy: MlInternCanvasContextPolicy
): BoxModel | null {
	if (!value) return null
	if (policy !== 'selection-or-area') {
		throw new Error('ML-Intern requested bounds require selection-or-area context')
	}
	const bounds = boxModel(value)
	if (
		!bounds ||
		![bounds.x, bounds.y, bounds.w, bounds.h].every(Number.isFinite) ||
		bounds.w <= 0 ||
		bounds.h <= 0
	) {
		throw new Error('ML-Intern requested bounds must contain finite positive geometry')
	}
	if (
		Math.abs(bounds.x) > 10_000_000 ||
		Math.abs(bounds.y) > 10_000_000 ||
		bounds.w > 8_192 ||
		bounds.h > 8_192 ||
		bounds.w * bounds.h > 16_777_216
	) {
		throw new Error('ML-Intern requested bounds exceed the bounded context limit')
	}
	return bounds
}

function boundsForContextShapes(agent: TldrawAgent, items: ContextItem[]) {
	const shapeIds = items.flatMap((item) => {
		if (item.type === 'shape') return [item.shape.shapeId]
		if (item.type === 'shapes') return item.shapes.map((shape) => shape.shapeId)
		return []
	})
	const boxes = shapeIds.flatMap((shapeId) => {
		const id = (shapeId.startsWith('shape:') ? shapeId : `shape:${shapeId}`) as TLShapeId
		const bounds = agent.editor.getShapePageBounds(id)
		const normalized = boxModel(bounds)
		return normalized ? [normalized] : []
	})
	return unionBoxes(boxes)
}

function buildInspectionSummary(
	agent: TldrawAgent,
	capabilityId: 'canvas.inspect' | 'canvas.result.read',
	selectedShapes: TLShape[],
	contextItems: ContextItem[],
	bounds: BoxModel
) {
	const shapes =
		selectedShapes.length > 0 ? selectedShapes : getShapesInsideBounds(agent, bounds).slice(0, 12)
	const shapeRefs = shapes.map((shape) => `${shape.type}:${shape.id.slice('shape:'.length)}`)
	const prefix =
		capabilityId === 'canvas.result.read'
			? 'Read bounded native canvas result context'
			: 'Inspected bounded native canvas context'
	return `${prefix}: ${shapes.length} shape${shapes.length === 1 ? '' : 's'}, ${contextItems.length} explicit context item${contextItems.length === 1 ? '' : 's'}${shapeRefs.length ? ` [${shapeRefs.join(', ')}]` : ''}.`
}

function getShapesInsideBounds(agent: TldrawAgent, bounds: BoxModel) {
	return agent.editor.getCurrentPageShapesSorted().filter((shape) => {
		const shapeBounds = agent.editor.getShapePageBounds(shape.id)
		return shapeBounds ? boxesIntersect(bounds, shapeBounds) : false
	})
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
