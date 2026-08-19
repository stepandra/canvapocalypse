import { FormEventHandler, useCallback, useRef } from 'react'
import { ML_INTERN_EVAL_LAB_MODEL_NAME } from '../../shared/models'
import { useAgent } from '../agent/TldrawAgentAppProvider'
import { ChatBranchNavigator } from './ChatBranchNavigator'
import { ChatHistory } from './chat-history/ChatHistory'
import { ChatInput } from './ChatInput'
import { TodoList } from './TodoList'

export function ChatPanel() {
	const agent = useAgent()
	const inputRef = useRef<HTMLTextAreaElement>(null)

	const handleSubmit = useCallback<FormEventHandler<HTMLFormElement>>(
		async (e) => {
			e.preventDefault()
			if (!inputRef.current) return
			const formData = new FormData(e.currentTarget)
			const value = formData.get('input') as string

			// If the user's message is empty, just cancel the current request (if there is one)
			if (value === '') {
				agent.cancel()
				return
			}

			// Clear the chat input (context is cleared after it's captured in requestAgentActions)
			inputRef.current.value = ''

			// Sending a new message to the agent should interrupt the current request
			const isMlInternEvalLab =
				agent.modelName.getModelName() === ML_INTERN_EVAL_LAB_MODEL_NAME
			agent.interrupt({
				input: {
					agentMessages: [value],
					bounds: agent.editor.getViewportPageBounds(),
					source: 'user',
					contextItems: agent.context.getItems(),
					...(isMlInternEvalLab
						? {
								routing: {
									enabled: true as const,
									route: 'canvas-edit' as const,
									capabilityTier: 'extended' as const,
									maxHistoryItems: 4,
								},
							}
						: {}),
				},
			})
		},
		[agent]
	)

	return (
		<div className="chat-panel tl-theme__dark">
			<div className="chat-header">
				<ChatBranchNavigator agent={agent} />
			</div>
			<ChatHistory agent={agent} />
			<div className="chat-input-container">
				<TodoList agent={agent} />
				<ChatInput handleSubmit={handleSubmit} inputRef={inputRef} />
			</div>
		</div>
	)
}
