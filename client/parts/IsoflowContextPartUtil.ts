import { IsoflowContextPart } from '../../shared/schema/PromptPartDefinitions'
import { AgentRequest } from '../../shared/types/AgentRequest'
import { getIsoflowView } from '../isoflow/isoflowBridge'
import { isIsoflowEmbedShape, readIsoflowEmbedMeta } from '../isoflow/isoflowProvider'
import { PromptPartUtil, registerPromptPartUtil } from './PromptPartUtil'

const MAX_ITEMS = 32
const MAX_CONNECTORS = 48

export const IsoflowContextPartUtil = registerPromptPartUtil(
	class IsoflowContextPartUtil extends PromptPartUtil<IsoflowContextPart> {
		static override type = 'isoflowContext' as const

		override async getPart(_request: AgentRequest): Promise<IsoflowContextPart> {
			const selected = this.editor.getSelectedShapes().filter(isIsoflowEmbedShape).slice(0, 2)
			const embeds = await Promise.all(
				selected.map(async (shape) => {
					const meta = readIsoflowEmbedMeta(shape)!
					try {
						const compact = await getIsoflowView(meta.baseUrl, meta.projectId, meta.viewId)
						const items = compact.items.slice(0, MAX_ITEMS).map((item) => ({
							id: item.id,
							name: item.name,
							...(item.icon ? { icon: item.icon } : {}),
							tile: item.tile,
						}))
						const connectors = compact.view.connectors
							.slice(0, MAX_CONNECTORS)
							.map((connector) => ({
								id: connector.id,
								from: connector.anchors[0]?.ref.item,
								to: connector.anchors.at(-1)?.ref.item,
							}))
						const colors = new Map(compact.colors.map((color) => [color.id, color.value]))
						const legend = compact.legend.map((entry) => ({
							...entry,
							...(colors.get(entry.colorId) ? { value: colors.get(entry.colorId) } : {}),
						}))
						const contours = compact.view.rectangles.slice(0, 24).flatMap((rectangle) => {
							if (!rectangle || typeof rectangle !== 'object' || Array.isArray(rectangle)) return []
							const value = rectangle as Record<string, unknown>
							return [{
								id: String(value.id ?? ''),
								...(isTile(value.from) ? { from: value.from } : {}),
								...(isTile(value.to) ? { to: value.to } : {}),
								...(typeof value.color === 'string' ? { color: value.color } : {}),
							}]
						})
						return {
							shapeId: shape.id,
							projectId: compact.projectId,
							revision: compact.revision,
							title: compact.title,
							activeViewId: compact.activeViewId,
							view: { id: compact.view.id, name: compact.view.name },
							views: compact.views,
							legend,
							contours,
							items,
							connectors,
							truncated:
								compact.items.length > MAX_ITEMS ||
								compact.view.connectors.length > MAX_CONNECTORS,
						}
					} catch (error) {
						return {
							shapeId: shape.id,
							projectId: meta.projectId,
							revision: 0,
							title: 'Isoflow bridge unavailable',
							error:
								error instanceof Error ? error.message : 'Isoflow bridge unavailable',
							view: { id: meta.viewId, name: meta.viewId },
							views: [{ id: meta.viewId, name: meta.viewId }],
							legend: [],
							contours: [],
							items: [],
							connectors: [],
							truncated: false,
						}
					}
				})
			)
			return { type: 'isoflowContext', embeds }
		}
	}
)

function isTile(value: unknown): value is { x: number; y: number } {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false
	const tile = value as Record<string, unknown>
	return typeof tile.x === 'number' && typeof tile.y === 'number'
}
