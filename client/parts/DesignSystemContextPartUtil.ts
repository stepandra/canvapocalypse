import type { DesignSystemContextPart } from '../../shared/schema/PromptPartDefinitions'
import type { AgentRequest } from '../../shared/types/AgentRequest'
import { getSelectedDesignSystemContext } from '../design-system/designSystemContext'
import { PromptPartUtil, registerPromptPartUtil } from './PromptPartUtil'

export const DesignSystemContextPartUtil = registerPromptPartUtil(
	class DesignSystemContextPartUtil extends PromptPartUtil<DesignSystemContextPart> {
		static override type = 'designSystemContext' as const

		override async getPart(
			request: AgentRequest
		): Promise<DesignSystemContextPart> {
			if (
				!request.routing?.enabled ||
				request.routing.domainPack !== 'uiux' ||
				request.routing.route === 'isoflow-edit'
			) {
				return { type: 'designSystemContext', systems: [] }
			}

			const context = await getSelectedDesignSystemContext(this.editor)
			return {
				type: 'designSystemContext',
				systems: [context],
			}
		}
	}
)
