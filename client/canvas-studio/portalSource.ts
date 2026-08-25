import { Box, createShapeId, type BoxModel, type TLShapeId } from 'tldraw'
import type { TldrawAgentApp } from '../agent/TldrawAgentApp'
import {
	executeCompanionCanvasToolRequest,
	type CompanionCanvasToolRequest,
	type CompanionCanvasToolReceipt,
} from '../agent/companionCanvasTool'
import { flushCanvasStudioProjectStore } from './projectStore'

const SOURCE_SCHEMA = 'canvas.portal-source/v1'
const PLAN_SCHEMA = 'canvas.portal-source-plan/v1'
const PLAN_REQUEST_SCHEMA = 'canvas.portal-source-plan-request/v1'
const COMMIT_SCHEMA = 'canvas.portal-source-commit/v1'
const RECEIPT_SCHEMA = 'canvas.portal-source-receipt/v1'
const DIAGRAM_SCHEMA = 'canvas.diagram/v1'
const SHA256_PATTERN = /^[a-f0-9]{64}$/
const SOURCE_ID_PATTERN = /^[a-f0-9]{16}$/
const SOURCE_SHAPE_ID_PATTERN = /^canvas-source-[a-f0-9]{16}-(?:node|edge)-[a-z0-9._-]{1,48}$/
const SOURCE_FORMATS = new Set(['markdown', 'mermaid', 'structurizr'])

export interface CanvasPortalSourcePlan {
	readonly version: 1
	readonly schema: typeof DIAGRAM_SCHEMA
	readonly format: string
	readonly sourceId: string
	readonly checksum: string
	readonly shapeIds: readonly string[]
	readonly actions: readonly unknown[]
	readonly summary: {
		readonly create: number
		readonly update: number
		readonly delete: number
		readonly unchanged: number
	}
}

export interface CanvasPortalSourceApplyReceipt {
	readonly plan: CanvasPortalSourcePlan
	readonly canvasReceipt: CompanionCanvasToolReceipt | null
}

interface CanvasPortalSourceDescriptor {
	readonly schema: typeof SOURCE_SCHEMA
	readonly path: string
	readonly sourceId: string
	readonly format: string
	readonly checksum: string
	readonly shapeIds: readonly string[]
	readonly status: 'new' | 'pending' | 'applied'
}

function request(overrides: Partial<CompanionCanvasToolRequest>): CompanionCanvasToolRequest {
	const now = new Date().toISOString()
	return {
		id: `canvas-source-${globalThis.crypto.randomUUID()}`,
		status: 'leased',
		surface: 'tldraw',
		context: 'selection-or-area',
		capabilityId: 'canvas.inspect',
		execution: 'direct-actions',
		actor: 'canvas-portal-source',
		source: 'canvas-portal-source',
		createdAt: now,
		updatedAt: now,
		...overrides,
	}
}

function sourceUrl(endpoint: string, origin: string) {
	const url = new URL(endpoint, origin)
	if (url.origin !== origin || url.search || url.hash) {
		throw new Error('Canvas source endpoint must be a same-origin path')
	}
	return url
}

async function responseJson(response: Response, operation: string) {
	let payload: unknown
	try {
		payload = await response.json()
	} catch {
		throw new Error(`Canvas source ${operation} returned invalid JSON`)
	}
	if (!response.ok) {
		const detail = isRecord(payload) && typeof payload.detail === 'string'
			? payload.detail
			: isRecord(payload) && typeof payload.error === 'string'
				? payload.error
				: `HTTP ${response.status}`
		throw new Error(`Canvas source ${operation} failed: ${detail}`)
	}
	return payload
}

function parseDescriptor(payload: unknown, path: string): CanvasPortalSourceDescriptor {
	if (
		!isRecord(payload) ||
		payload.schema !== SOURCE_SCHEMA ||
		payload.path !== path ||
		!SOURCE_ID_PATTERN.test(String(payload.sourceId)) ||
		!SOURCE_FORMATS.has(String(payload.format)) ||
		!SHA256_PATTERN.test(String(payload.checksum)) ||
		!['new', 'pending', 'applied'].includes(String(payload.status)) ||
		!validShapeIds(payload.shapeIds, String(payload.sourceId))
	) {
		throw new Error('Canvas source descriptor has a mismatched identity or shape')
	}
	return payload as unknown as CanvasPortalSourceDescriptor
}

function parsePlan(payload: unknown, descriptor: CanvasPortalSourceDescriptor) {
	if (
		!isRecord(payload) ||
		payload.schema !== PLAN_SCHEMA ||
		!SHA256_PATTERN.test(String(payload.token)) ||
		!isRecord(payload.plan)
	) {
		throw new Error('Canvas source plan response is invalid')
	}
	const plan = payload.plan
	if (
		plan.version !== 1 ||
		plan.schema !== DIAGRAM_SCHEMA ||
		plan.format !== descriptor.format ||
		plan.sourceId !== descriptor.sourceId ||
		plan.checksum !== descriptor.checksum ||
		!validShapeIds(plan.shapeIds, descriptor.sourceId) ||
		!Array.isArray(plan.actions) ||
		plan.actions.length > 24 ||
		!validSummary(plan.summary, plan.shapeIds.length, plan.actions.length) ||
		!plan.actions.every((action) => validSourceAction(action, descriptor, plan.shapeIds))
	) {
		throw new Error('Canvas source compiler returned a mismatched or unbounded plan')
	}
	return {
		token: payload.token as string,
		plan: plan as unknown as CanvasPortalSourcePlan,
	}
}

function validShapeIds(value: unknown, sourceId: string) {
	return Array.isArray(value) && value.length <= 24 && new Set(value).size === value.length &&
		value.every((id) => typeof id === 'string' && SOURCE_SHAPE_ID_PATTERN.test(id) &&
			id.startsWith(`canvas-source-${sourceId}-`))
}

function validSummary(value: unknown, shapeCount: number, actionCount: number) {
	if (!isRecord(value)) return false
	const counts = ['create', 'update', 'delete', 'unchanged'].map((key) => value[key])
	return counts.every((count) => Number.isInteger(count) && Number(count) >= 0) &&
		Number(value.create) + Number(value.update) + Number(value.delete) === actionCount &&
		Number(value.create) + Number(value.update) + Number(value.unchanged) === shapeCount
}

function validSourceAction(
	action: unknown,
	descriptor: CanvasPortalSourceDescriptor,
	shapeIds: unknown
) {
	if (!isRecord(action) || !Array.isArray(shapeIds)) return false
	const marker = `canvas-source:${descriptor.sourceId}:`
	if (action._type === 'create') {
		return isRecord(action.shape) && shapeIds.includes(action.shape.shapeId) &&
			typeof action.shape.note === 'string' && action.shape.note.startsWith(marker)
	}
	if (action._type === 'update') {
		return isRecord(action.update) && shapeIds.includes(action.update.shapeId) &&
			typeof action.update.note === 'string' && action.update.note.startsWith(marker)
	}
	if (action._type === 'delete') {
		return typeof action.shapeId === 'string' && descriptor.shapeIds.includes(action.shapeId) &&
			action.shapeId.startsWith(`canvas-source-${descriptor.sourceId}-`)
	}
	return false
}

function boundedSourceArea(viewport: BoxModel): BoxModel {
	const width = Math.max(1_500, Math.min(4_000, viewport.w))
	const height = Math.max(900, Math.min(3_000, viewport.h))
	const center = Box.From(viewport).center
	return { x: center.x - width / 2, y: center.y - height / 2, w: width, h: height }
}

/**
 * Reconciles one project-local source through Canvas Studio's compiler and the
 * host's existing canvas.shape.basic executor. Planning, native mutation, and
 * source-state commit fail as one browser-visible undo boundary.
 */
export async function applyCanvasPortalSource({
	app,
	endpoint,
	path,
	format = 'auto',
	fetch: fetchSource = globalThis.fetch,
	origin = globalThis.location?.origin,
	flush = () => flushCanvasStudioProjectStore(app.editor.store),
}: {
	app: TldrawAgentApp
	endpoint: string
	path: string
	format?: 'auto' | 'markdown' | 'mermaid' | 'structurizr'
	fetch?: typeof globalThis.fetch
	origin?: string
	flush?: () => Promise<void>
}): Promise<CanvasPortalSourceApplyReceipt> {
	if (!fetchSource || !origin) throw new Error('Canvas source import requires a browser origin and fetch')
	if (!path || path.startsWith('/') || path.includes('\\') || path.split('/').includes('..')) {
		throw new Error('Canvas source path must be project-relative')
	}
	const url = sourceUrl(endpoint, origin)
	url.searchParams.set('path', path)
	url.searchParams.set('format', format)
	const descriptor = parseDescriptor(
		await responseJson(await fetchSource(url, {
			method: 'GET', headers: { accept: 'application/json' }, credentials: 'same-origin',
		}), 'descriptor'),
		path
	)

	const editor = app.editor
	const agent = app.agents.getAgent()
	if (!agent) throw new Error('Canvas source import requires the mounted Canvas agent')
	const priorSelected = [...editor.getSelectedShapeIds()]
	const priorContext = [...agent.context.getItems()]
	const priorShapeIds = descriptor.shapeIds.map((id) => createShapeId(id))
	for (const shapeId of priorShapeIds) {
		if (!editor.getShape(shapeId)) {
			throw new Error(`Canvas source state references missing shape ${shapeId}`)
		}
	}

	let historyMark: string | undefined
	const chatHistory = [...agent.chat.getHistory()]
	try {
		agent.context.clear()
		if (priorShapeIds.length > 0) {
			editor.select(...priorShapeIds)
		} else {
			editor.selectNone()
			agent.context.add({
				type: 'area',
				bounds: boundedSourceArea(editor.getViewportPageBounds()),
				source: 'user',
			})
		}
		const context = priorShapeIds.length > 0 ? 'selection' : 'selection-or-area'
		const inspection = await executeCompanionCanvasToolRequest(agent, request({ context }))
		if (!isRecord(inspection.result) || typeof inspection.result.contextRef !== 'string') {
			throw new Error('Canvas source inspection returned no authorized contextRef')
		}
		const planUrl = sourceUrl(endpoint, origin)
		const planned = parsePlan(
			await responseJson(await fetchSource(planUrl, {
				method: 'POST',
				headers: { accept: 'application/json', 'content-type': 'application/json' },
				credentials: 'same-origin',
				body: JSON.stringify({
					schema: PLAN_REQUEST_SCHEMA, path, format: descriptor.format,
					inspection: inspection.result,
				}),
			}), 'plan'),
			descriptor
		)

		let canvasReceipt: CompanionCanvasToolReceipt | null = null
		if (planned.plan.actions.length > 0) {
			historyMark = editor.markHistoryStoppingPoint(`Before Canvas source ${descriptor.sourceId}`)
			canvasReceipt = await executeCompanionCanvasToolRequest(agent, request({
				context,
				capabilityId: 'canvas.shape.basic',
				contextRef: inspection.result.contextRef,
				actions: [...planned.plan.actions],
			}))
			await flush()
		}

		const commit = await responseJson(await fetchSource(sourceUrl(endpoint, origin), {
			method: 'PUT',
			headers: { accept: 'application/json', 'content-type': 'application/json' },
			credentials: 'same-origin',
			body: JSON.stringify({
				schema: COMMIT_SCHEMA, token: planned.token,
				sourceId: planned.plan.sourceId, checksum: planned.plan.checksum,
			}),
		}), 'commit')
		if (!isRecord(commit) || commit.schema !== RECEIPT_SCHEMA || commit.applied !== true ||
			commit.sourceId !== planned.plan.sourceId || commit.checksum !== planned.plan.checksum ||
			!sameStrings(commit.shapeIds, planned.plan.shapeIds)) {
			throw new Error('Canvas source commit returned a mismatched receipt')
		}
		if (historyMark) editor.squashToMark(historyMark)
		return { plan: planned.plan, canvasReceipt }
	} catch (error) {
		if (historyMark) {
			editor.bailToMark(historyMark)
			agent.chat.update(() => chatHistory)
			try {
				await flush()
			} catch (rollbackError) {
				const original = error instanceof Error ? error.message : String(error)
				const rollback = rollbackError instanceof Error ? rollbackError.message : String(rollbackError)
				throw new Error(`${original}; source rollback persistence failed: ${rollback}`)
			}
		}
		throw error
	} finally {
		agent.context.setItems(priorContext)
		const existingSelection = priorSelected.filter((id): id is TLShapeId => Boolean(editor.getShape(id)))
		editor.select(...existingSelection)
	}
}

function sameStrings(value: unknown, expected: readonly string[]) {
	return Array.isArray(value) && value.length === expected.length &&
		value.every((item, index) => item === expected[index])
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
