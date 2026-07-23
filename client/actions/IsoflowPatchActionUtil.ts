import { IsoflowPatchAction } from '../../shared/schema/AgentActionSchemas'
import { Streaming } from '../../shared/types/Streaming'
import { applyIsoflowPatchAction } from '../isoflow/isoflowAgentActions'
import { findIsoflowEmbed } from '../isoflow/isoflowProvider'
import { AgentActionUtil, registerActionUtil } from './AgentActionUtil'

export const IsoflowPatchActionUtil = registerActionUtil(
	class IsoflowPatchActionUtil extends AgentActionUtil<IsoflowPatchAction> {
		static override type = 'isoflowPatch' as const

		override getInfo(action: Streaming<IsoflowPatchAction>) {
			return {
				icon: action.dryRun ? ('eye' as const) : ('pencil' as const),
				description: action.complete
					? `${action.dryRun ? 'Previewed' : 'Applied'} Isoflow changes: ${action.intent}`
					: `${action.dryRun ? 'Previewing' : 'Applying'} Isoflow changes`,
			}
		}

		override async applyAction(action: Streaming<IsoflowPatchAction>) {
			if (!action.complete) return
			const target = findIsoflowEmbed(this.editor, action.projectId)
			if (!target) throw new Error('Select an Isoflow embed before changing it')
			const result = await applyIsoflowPatchAction(
				target.shape,
				action,
				`canvapocalypse-agent:${this.agent.id}`
			)
			this.agent.schedule({
				data: [
					{
						projectId: target.meta.projectId,
						revision: result.revision,
						dryRun: action.dryRun,
						summary: result.summary,
						message: action.dryRun
							? 'Preview succeeded. Apply the same operations with dryRun false if they match the intent.'
							: 'Isoflow patch applied.',
					},
				],
			})
		}
	}
)
