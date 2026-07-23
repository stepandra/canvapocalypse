import { Editor, TLEmbedShape } from 'tldraw'
import {
	IsoflowCreateViewAction,
	IsoflowPatchAction,
} from '../../shared/schema/AgentActionSchemas'
import {
	IsoflowConnector,
	IsoflowModelItem,
	IsoflowPlacement,
	IsoflowState,
	IsoflowView,
	getIsoflowState,
	getIsoflowView,
	patchIsoflow,
	replaceIsoflowModel,
} from './isoflowBridge'
import { readIsoflowEmbedMeta, updateIsoflowEmbedView } from './isoflowProvider'

export async function applyIsoflowPatchAction(
	shape: TLEmbedShape,
	action: IsoflowPatchAction,
	actor: string
) {
	const meta = readIsoflowEmbedMeta(shape)
	if (!meta) throw new Error('Isoflow embed metadata is missing')
	const current = await getIsoflowView(meta.baseUrl, meta.projectId, meta.viewId)
	return patchIsoflow(meta.baseUrl, meta.projectId, {
		baseRevision: current.revision,
		operations: action.operations,
		actor,
		dryRun: action.dryRun,
	})
}

export async function applyIsoflowCreateViewAction(
	editor: Editor,
	shape: TLEmbedShape,
	action: IsoflowCreateViewAction,
	actor: string
): Promise<IsoflowState> {
	const meta = readIsoflowEmbedMeta(shape)
	if (!meta) throw new Error('Isoflow embed metadata is missing')
	const state = await getIsoflowState(meta.baseUrl, meta.projectId)
	if (state.model.views.some((view) => view.id === action.viewId)) {
		throw new Error(`Isoflow view already exists: ${action.viewId}`)
	}

	const model = structuredClone(state.model)
	const modelItemIds = new Set(model.items.map((item) => item.id))
	const actionNodeIds = new Set<string>()
	const items: IsoflowModelItem[] = []
	const placements: IsoflowPlacement[] = []

	for (const node of action.nodes) {
		if (modelItemIds.has(node.id) || actionNodeIds.has(node.id)) {
			throw new Error(`Isoflow item ID already exists: ${node.id}`)
		}
		actionNodeIds.add(node.id)
		const icon = node.iconQuery ? resolveIcon(model.icons, node.iconQuery) : undefined
		items.push({ id: node.id, name: node.name, ...(icon ? { icon } : {}) })
		placements.push({
			id: node.id,
			tile: { x: node.x, y: node.y },
			labelHeight: 120,
		})
	}

	const connectorIds = new Set<string>()
	const connectors: IsoflowConnector[] = action.connectors.map((connector) => {
		if (connectorIds.has(connector.id)) {
			throw new Error(`Duplicate connector ID: ${connector.id}`)
		}
		connectorIds.add(connector.id)
		if (!actionNodeIds.has(connector.from) || !actionNodeIds.has(connector.to)) {
			throw new Error(`Connector ${connector.id} must reference nodes created in the same view`)
		}
		return {
			id: connector.id,
			anchors: [
				{ id: `${connector.id}:source`, ref: { item: connector.from } },
				{ id: `${connector.id}:destination`, ref: { item: connector.to } },
			],
		}
	})
	const view: IsoflowView = {
		id: action.viewId,
		name: action.name,
		items: placements,
		connectors,
		rectangles: [],
		textBoxes: [],
	}
	model.items.push(...items)
	model.views.push(view)
	model.view = view.id
	model.fitToView = true

	const result = await replaceIsoflowModel(meta.baseUrl, meta.projectId, {
		baseRevision: state.revision,
		model,
		actor,
	})
	updateIsoflowEmbedView(editor, shape, view.id)
	return result
}

function resolveIcon(icons: Array<{ id: string; name?: string }>, query: string) {
	const normalized = query.trim().toLowerCase()
	const exact = icons.find((icon) => icon.name?.toLowerCase() === normalized)
	if (exact) return exact.id
	const matches = icons.filter((icon) => icon.name?.toLowerCase().includes(normalized))
	if (matches.length === 1) return matches[0].id
	if (matches.length === 0) throw new Error(`No native Isoflow icon matches: ${query}`)
	throw new Error(`Native Isoflow icon is ambiguous: ${query}`)
}
