import { IsoflowPatchAction } from '../../shared/schema/AgentActionSchemas'
import { Streaming } from '../../shared/types/Streaming'
import {
	previewIsoflowAgentActions,
	publishIsoflowMutationProposal,
} from '../isoflow/isoflowAgentActions'
import { findIsoflowEmbed } from '../isoflow/isoflowProvider'
import { AgentActionUtil, registerActionUtil } from './AgentActionUtil'

export const IsoflowPatchActionUtil = registerActionUtil(
	class IsoflowPatchActionUtil extends AgentActionUtil<IsoflowPatchAction> {
		static override type = 'isoflowPatch' as const

		override getInfo(action: Streaming<IsoflowPatchAction>) {
			return {
				icon: 'eye' as const,
				description: action.complete
					? `Previewed Isoflow changes: ${action.intent}`
					: 'Previewing Isoflow changes',
			}
		}

		override async applyAction(action: Streaming<IsoflowPatchAction>) {
			if (!action.complete) return
			const target = findIsoflowEmbed(this.editor, action.projectId)
			if (!target) throw new Error('Select an Isoflow embed before changing it')
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
						baseRevision: preview.baseRevision,
						expectedRevision: preview.expectedRevision,
						dryRun: true,
						digest: preview.digest,
						message: 'Preview succeeded. Confirm the exact proposal in the Isoflow inspector.',
					},
				],
			})
		}
	}
)
