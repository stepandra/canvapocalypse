import { IsoflowSearchAction } from '../../shared/schema/AgentActionSchemas'
import { Streaming } from '../../shared/types/Streaming'
import { findIsoflowEmbed } from '../isoflow/isoflowProvider'
import { searchIsoflow } from '../isoflow/isoflowBridge'
import { AgentActionUtil, registerActionUtil } from './AgentActionUtil'

export const IsoflowSearchActionUtil = registerActionUtil(
	class IsoflowSearchActionUtil extends AgentActionUtil<IsoflowSearchAction> {
		static override type = 'isoflowSearch' as const

		override getInfo(action: Streaming<IsoflowSearchAction>) {
			return {
				icon: 'search' as const,
				description: action.complete
					? `Searched Isoflow for ${action.query}`
					: `Searching Isoflow for ${action.query}`,
			}
		}

		override async applyAction(action: Streaming<IsoflowSearchAction>) {
			if (!action.complete) return
			const target = findIsoflowEmbed(this.editor, action.projectId)
			if (!target) throw new Error('Select an Isoflow embed before searching it')
			const result = await searchIsoflow(target.meta.baseUrl, target.meta.projectId, {
				query: action.query,
				kind: action.kind,
				viewId: action.viewId,
				limit: 24,
			})
			this.agent.schedule({ data: [result] })
		}
	}
)
