import { structuredClone } from 'tldraw'
import { ChatHistoryPart } from '../../shared/schema/PromptPartDefinitions'
import { AgentRequest } from '../../shared/types/AgentRequest'
import { AgentHelpers } from '../AgentHelpers'
import { PromptPartUtil, registerPromptPartUtil } from './PromptPartUtil'

export const ChatHistoryPartUtil = registerPromptPartUtil(
	class ChatHistoryPartUtil extends PromptPartUtil<ChatHistoryPart> {
		static override type = 'chatHistory' as const

		override async getPart(_request: AgentRequest, helpers: AgentHelpers) {
			const fullHistory = structuredClone(this.agent.chat.getHistory())
			const maxHistoryItems = _request.routing?.enabled
				? Math.min(8, Math.max(1, Math.floor(_request.routing.maxHistoryItems ?? 8)))
				: fullHistory.length
			const omittedCount = Math.max(0, fullHistory.length - maxHistoryItems)
			const history = fullHistory.slice(-maxHistoryItems)

			for (const historyItem of history) {
				if (historyItem.type !== 'prompt') continue
				// Turn IDs belong to the local branching UI, not model context.
				delete historyItem.turnId
				if (_request.routing?.enabled) {
					// Older attachments remain locally inspectable but are not resent.
					historyItem.contextItems = []
					historyItem.selectedShapes = []
					continue
				}

				// Offset and round the context items of each history item
				const contextItems = historyItem.contextItems.map((contextItem) => {
					const offsetContextItem = helpers.applyOffsetToContextItem(contextItem)
					return helpers.roundContextItem(offsetContextItem)
				})

				historyItem.contextItems = contextItems
			}

			return {
				type: 'chatHistory' as const,
				history,
				...(omittedCount > 0
					? {
							omittedCount,
							historyRef: `agent-history:${fullHistory.length}:${maxHistoryItems}`,
						}
					: {}),
			}
		}
	}
)
