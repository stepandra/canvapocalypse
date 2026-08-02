import { IsoflowCreateViewAction } from '../../shared/schema/AgentActionSchemas'
import { Streaming } from '../../shared/types/Streaming'
import {
	previewIsoflowAgentActions,
	publishIsoflowMutationProposal,
} from '../isoflow/isoflowAgentActions'
import { findIsoflowEmbed } from '../isoflow/isoflowProvider'
import { AgentActionUtil, registerActionUtil } from './AgentActionUtil'

export const IsoflowCreateViewActionUtil = registerActionUtil(
	class IsoflowCreateViewActionUtil extends AgentActionUtil<IsoflowCreateViewAction> {
		static override type = 'isoflowCreateView' as const

		override getInfo(action: Streaming<IsoflowCreateViewAction>) {
			return {
				icon: 'eye' as const,
				description: action.complete
					? `Previewed Isoflow view ${action.name}`
					: `Previewing Isoflow view ${action.name}`,
			}
		}

		override async applyAction(action: Streaming<IsoflowCreateViewAction>) {
			if (!action.complete) return
			const target = findIsoflowEmbed(this.editor, action.projectId)
			if (!target) throw new Error('Select an Isoflow embed before creating a view')
			const preview = await previewIsoflowAgentActions(
				target.shape,
				[action],
				`canvapocalypse-agent:${this.agent.id}`
			)
			publishIsoflowMutationProposal({
				shapeId: target.shape.id,
				message: action.intent,
				preview,
			})
			this.agent.schedule({
				data: [
					{
						projectId: target.meta.projectId,
						viewId: action.viewId,
						baseRevision: preview.baseRevision,
						expectedRevision: preview.expectedRevision,
						digest: preview.digest,
						nodes: action.nodes.length,
						connectors: action.connectors.length,
						message: 'Preview succeeded. Confirm the exact proposal in the Isoflow inspector.',
					},
				],
			})
		}
	}
)
