import { IsoflowCreateViewAction } from '../../shared/schema/AgentActionSchemas'
import { Streaming } from '../../shared/types/Streaming'
import { applyIsoflowCreateViewAction } from '../isoflow/isoflowAgentActions'
import { findIsoflowEmbed } from '../isoflow/isoflowProvider'
import { AgentActionUtil, registerActionUtil } from './AgentActionUtil'

export const IsoflowCreateViewActionUtil = registerActionUtil(
	class IsoflowCreateViewActionUtil extends AgentActionUtil<IsoflowCreateViewAction> {
		static override type = 'isoflowCreateView' as const

		override getInfo(action: Streaming<IsoflowCreateViewAction>) {
			return {
				icon: 'pencil' as const,
				description: action.complete
					? `Created Isoflow view ${action.name}`
					: `Creating Isoflow view ${action.name}`,
			}
		}

		override async applyAction(action: Streaming<IsoflowCreateViewAction>) {
			if (!action.complete) return
			const target = findIsoflowEmbed(this.editor, action.projectId)
			if (!target) throw new Error('Select an Isoflow embed before creating a view')
			const result = await applyIsoflowCreateViewAction(
				this.editor,
				target.shape,
				action,
				`canvapocalypse-agent:${this.agent.id}`
			)
			this.agent.schedule({
				data: [
					{
						projectId: target.meta.projectId,
						viewId: action.viewId,
						revision: result.revision,
						nodes: action.nodes.length,
						connectors: action.connectors.length,
						message: 'Native Isoflow view created and selected.',
					},
				],
			})
		}
	}
)
