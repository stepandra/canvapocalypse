import { JsonValue } from 'tldraw'
import { assertAllowedIsoflowBaseUrl } from './isoflowProvider'

export interface IsoflowIcon {
	id: string
	name?: string
	url?: string
	collection?: string
	isIsometric?: boolean
}

export interface IsoflowModelItem {
	id: string
	name: string
	icon?: string
}

export interface IsoflowPlacement {
	id: string
	tile: { x: number; y: number }
	labelHeight?: number
}

export interface IsoflowConnector {
	id: string
	anchors: Array<{ id: string; ref: { item: string } }>
	color?: string
	width?: number
	style?: 'SOLID' | 'DASHED' | 'DOTTED'
	direction?: 'FORWARD' | 'REVERSE' | 'BOTH' | 'NONE'
}

export interface IsoflowView {
	id: string
	name: string
	items: IsoflowPlacement[]
	connectors: IsoflowConnector[]
	rectangles?: JsonValue[]
	textBoxes?: JsonValue[]
}

export interface IsoflowModel {
	title: string
	view?: string
	fitToView?: boolean
	colors?: Array<{ id: string; value: string }>
	legend?: Array<{ id: string; label: string; colorId: string }>
	items: IsoflowModelItem[]
	icons: IsoflowIcon[]
	views: IsoflowView[]
}

export interface IsoflowState {
	projectId: string
	revision: number
	model: IsoflowModel
	updatedAt: string
	updatedBy: string
	origin: string
	summary: string
}

export interface IsoflowCompactView {
	projectId: string
	revision: number
	title: string
	activeViewId?: string
	views: Array<{ id: string; name: string }>
	legend: Array<{ id: string; label: string; colorId: string }>
	colors: Array<{ id: string; value: string }>
	view: {
		id: string
		name: string
		connectors: IsoflowConnector[]
		rectangles: JsonValue[]
		textBoxes: JsonValue[]
	}
	items: Array<IsoflowModelItem & IsoflowPlacement>
}

export type IsoflowPatchOperation =
	| { op: 'set_view'; viewId: string }
	| {
			op: 'create_view'
			view: {
				id: string
				name: string
				items?: JsonValue[]
				connectors?: JsonValue[]
				rectangles?: JsonValue[]
				textBoxes?: JsonValue[]
			}
			activate?: boolean
	  }
	| { op: 'update_view'; viewId: string; patch: { name?: string } }
	| {
			op: 'duplicate_view'
			viewId: string
			newViewId: string
			name?: string
			activate?: boolean
	  }
	| { op: 'remove_view'; viewId: string }
	| { op: 'move_item'; viewId: string; itemId: string; tile: { x: number; y: number } }
	| { op: 'rename_item'; itemId: string; name: string }
	| {
			op: 'update_item'
			itemId: string
			patch: { name?: string; description?: string | null; icon?: string | null }
	  }
	| {
			op: 'add_item'
			viewId: string
			item: {
				id: string
				name: string
				icon?: string
				tile: { x: number; y: number }
				labelHeight?: number
			}
	  }
	| { op: 'remove_item'; itemId: string }
	| {
			op: 'connect'
			viewId: string
			connectorId: string
			from: string
			to: string
			connector?: {
				color?: string
				width?: number
				style?: 'SOLID' | 'DASHED' | 'DOTTED'
				direction?: 'FORWARD' | 'REVERSE' | 'BOTH' | 'NONE'
			}
	  }
	| {
			op: 'update_connector'
			viewId: string
			connectorId: string
			patch: {
				color?: string
				width?: number
				style?: 'SOLID' | 'DASHED' | 'DOTTED'
				direction?: 'FORWARD' | 'REVERSE' | 'BOTH' | 'NONE'
			}
	  }
	| { op: 'disconnect'; viewId: string; connectorId: string }
	| { op: 'add_rectangle'; viewId: string; rectangle: JsonValue }
	| { op: 'update_rectangle'; viewId: string; rectangleId: string; patch: JsonValue }
	| { op: 'remove_rectangle'; viewId: string; rectangleId: string }
	| { op: 'add_text_box'; viewId: string; textBox: JsonValue }
	| { op: 'update_text_box'; viewId: string; textBoxId: string; patch: JsonValue }
	| { op: 'remove_text_box'; viewId: string; textBoxId: string }
	| { op: 'update_color'; colorId: string; value: string }
	| {
			op: 'replace_legend'
			legend: Array<{ id: string; label: string; colorId: string }>
	  }

export interface IsoflowBridgeCapabilities {
	schemaVersion: number
	service: string
	reads: string[]
	transaction: {
		revisionGuarded: boolean
		dryRun: boolean
		idempotencyKeys: boolean
		maxOperations: number
		operations: string[]
	}
	events: { transport: 'sse'; scopes: string[] }
	history: { list: boolean; diff: boolean; revert: boolean }
	render: { formats: string[] }
	workspace: { reads: string[]; operations: string[] }
}

export function getIsoflowHealth(baseUrl: string) {
	return bridgeRequest<{ ok: boolean; service: string; schemaVersion?: number }>(
		baseUrl,
		'/api/isoflow/health'
	)
}

export function getIsoflowCapabilities(baseUrl: string) {
	return bridgeRequest<IsoflowBridgeCapabilities>(baseUrl, '/api/isoflow/capabilities')
}

export function getIsoflowState(baseUrl: string, projectId: string, signal?: AbortSignal) {
	return bridgeRequest<IsoflowState>(
		baseUrl,
		`/api/isoflow/projects/${encodeURIComponent(projectId)}/state`,
		{ signal }
	)
}

export function getIsoflowView(baseUrl: string, projectId: string, viewId?: string) {
	const query = viewId ? `?viewId=${encodeURIComponent(viewId)}` : ''
	return bridgeRequest<IsoflowCompactView>(
		baseUrl,
		`/api/isoflow/projects/${encodeURIComponent(projectId)}/view${query}`
	)
}

export function searchIsoflow(
	baseUrl: string,
	projectId: string,
	{
		query,
		kind = 'all',
		viewId,
		limit = 20,
	}: {
		query: string
		kind?: 'all' | 'items' | 'icons'
		viewId?: string
		limit?: number
	}
) {
	const params = new URLSearchParams({ query, kind, limit: String(limit) })
	if (viewId) params.set('viewId', viewId)
	return bridgeRequest<JsonValue>(
		baseUrl,
		`/api/isoflow/projects/${encodeURIComponent(projectId)}/search?${params}`
	)
}

export function patchIsoflow(
	baseUrl: string,
	projectId: string,
	{
		baseRevision,
		operations,
		actor,
		dryRun = false,
		idempotencyKey,
		signal,
	}: {
		baseRevision: number
		operations: IsoflowPatchOperation[]
		actor: string
		dryRun?: boolean
		idempotencyKey?: string
		signal?: AbortSignal
	}
) {
	return bridgeRequest<IsoflowState>(
		baseUrl,
		`/api/isoflow/projects/${encodeURIComponent(projectId)}/transact`,
		{
			method: 'POST',
			body: JSON.stringify({ baseRevision, operations, actor, dryRun, idempotencyKey }),
			signal,
		}
	)
}

export function inspectIsoflow(
	baseUrl: string,
	projectId: string,
	request: {
		kind:
			| 'capabilities'
			| 'state'
			| 'view'
			| 'items'
			| 'icons'
			| 'colors'
			| 'legend'
			| 'connectors'
			| 'rectangles'
			| 'textBoxes'
			| 'workspace'
			| 'nodes'
			| 'documents'
			| 'flows'
			| 'history'
		viewId?: string
		ids?: string[]
		limit?: number
		full?: boolean
	}
) {
	return bridgeRequest<JsonValue>(
		baseUrl,
		`/api/isoflow/projects/${encodeURIComponent(projectId)}/inspect`,
		{ method: 'POST', body: JSON.stringify(request) }
	)
}

export function getIsoflowHistory(baseUrl: string, projectId: string, limit = 30) {
	return bridgeRequest<JsonValue>(
		baseUrl,
		`/api/isoflow/projects/${encodeURIComponent(projectId)}/history?limit=${limit}`
	)
}

export function getIsoflowRevisionDiff(
	baseUrl: string,
	projectId: string,
	fromRevision: number,
	toRevision: number
) {
	return bridgeRequest<JsonValue>(
		baseUrl,
		`/api/isoflow/projects/${encodeURIComponent(projectId)}/history/diff?from=${fromRevision}&to=${toRevision}`
	)
}

export function revertIsoflowRevision(
	baseUrl: string,
	projectId: string,
	request: {
		baseRevision: number
		targetRevision: number
		actor: string
		idempotencyKey?: string
	}
) {
	return bridgeRequest<IsoflowState>(
		baseUrl,
		`/api/isoflow/projects/${encodeURIComponent(projectId)}/history/revert`,
		{ method: 'POST', body: JSON.stringify(request) }
	)
}

export function transactIsoflowWorkspace(
	baseUrl: string,
	projectId: string,
	request: {
		baseRevision: number
		operations: JsonValue[]
		actor: string
		dryRun?: boolean
		idempotencyKey?: string
	}
) {
	return bridgeRequest<JsonValue>(
		baseUrl,
		`/api/isoflow/projects/${encodeURIComponent(projectId)}/workspace/transact`,
		{ method: 'POST', body: JSON.stringify(request) }
	)
}

export function getIsoflowRenderDescriptor(baseUrl: string, projectId: string, viewId?: string) {
	const params = new URLSearchParams({ format: 'descriptor' })
	if (viewId) params.set('viewId', viewId)
	return bridgeRequest<JsonValue>(
		baseUrl,
		`/api/isoflow/projects/${encodeURIComponent(projectId)}/render?${params}`
	)
}

export function subscribeToIsoflow(
	baseUrl: string,
	projectId: string,
	onEvent: (scope: 'ready' | 'model' | 'workspace', payload: JsonValue) => void
) {
	const normalized = assertAllowedIsoflowBaseUrl(baseUrl)
	const source = new EventSource(
		`${normalized}/api/isoflow/projects/${encodeURIComponent(projectId)}/events`
	)
	for (const scope of ['ready', 'model', 'workspace'] as const) {
		source.addEventListener(scope, (event) => {
			onEvent(scope, JSON.parse((event as MessageEvent<string>).data) as JsonValue)
		})
	}
	return () => source.close()
}

export function replaceIsoflowModel(
	baseUrl: string,
	projectId: string,
	{
		baseRevision,
		model,
		actor,
	}: {
		baseRevision: number
		model: IsoflowModel
		actor: string
	}
) {
	return bridgeRequest<IsoflowState>(
		baseUrl,
		`/api/isoflow/projects/${encodeURIComponent(projectId)}/model`,
		{
			method: 'POST',
			body: JSON.stringify({ baseRevision, model, actor }),
		}
	)
}

async function bridgeRequest<T>(baseUrl: string, path: string, init?: RequestInit): Promise<T> {
	const normalized = assertAllowedIsoflowBaseUrl(baseUrl)
	const response = await fetch(`${normalized}${path}`, {
		...init,
		headers: { 'content-type': 'application/json', ...init?.headers },
		cache: 'no-store',
	})
	if (!response.ok) {
		const payload = (await response.json().catch(() => null)) as {
			error?: string
			currentRevision?: number
		} | null
		const error = new Error(payload?.error || `Isoflow bridge returned ${response.status}`)
		;(error as any).status = response.status
		;(error as any).currentRevision = payload?.currentRevision
		throw error
	}
	return response.json() as Promise<T>
}
