import { MessagesPart } from '../../shared/schema/PromptPartDefinitions'
import { AgentRequest } from '../../shared/types/AgentRequest'
import { PromptPartUtil, registerPromptPartUtil } from './PromptPartUtil'

export const MessagesPartUtil = registerPromptPartUtil(
	class MessagesPartUtil extends PromptPartUtil<MessagesPart> {
		static override type = 'messages' as const

		override getPart(request: AgentRequest): MessagesPart {
			const { source } = request
			const agentMessages = request.routing?.enabled
				? request.agentMessages.slice(-4).map((message) => message.slice(0, 8_000))
				: request.agentMessages
			return {
				type: 'messages',
				agentMessages,
				requestSource: source,
			}
		}
	}
)
