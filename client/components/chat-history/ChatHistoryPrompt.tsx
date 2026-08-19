import { Editor, TldrawUiButton, TldrawUiButtonIcon, useValue } from 'tldraw'
import { ChatHistoryPromptItem } from '../../../shared/types/ChatHistoryItem'
import { useAgent } from '../../agent/TldrawAgentAppProvider'
import { ContextItemTag } from '../ContextItemTag'
import { SelectionTag } from '../SelectionTag'

export function ChatHistoryPrompt({
	item,
	editor,
}: {
	item: ChatHistoryPromptItem
	editor: Editor
}) {
	const agent = useAgent()
	const { contextItems, agentFacingMessage, userFacingMessage, selectedShapes, promptSource } = item
	const isGenerating = useValue(
		'chat history branching disabled',
		() => agent.requests.isGenerating(),
		[agent]
	)

	const showTags = selectedShapes.length > 0 || contextItems.length > 0

	// Display the user-facing message if available, otherwise fall back to the agent-facing message
	const displayMessage = userFacingMessage ?? agentFacingMessage

	// Get the CSS class modifier based on the prompt source
	const sourceClass = `chat-history-prompt-${promptSource}`

	return (
		<div className="chat-history-prompt-container">
			{promptSource !== 'self' && item.turnId && (
				<TldrawUiButton
					type="low"
					className="chat-history-fork-button"
					title="Fork conversation after this turn"
					aria-label="Fork conversation after this turn"
					disabled={isGenerating}
					onClick={() => agent.chat.forkFromTurn(item.turnId!)}
				>
					<TldrawUiButtonIcon icon="duplicate" small />
				</TldrawUiButton>
			)}
			<div className={`chat-history-prompt ${sourceClass}`}>
				{showTags && (
					<div className="prompt-tags">
						{selectedShapes.length > 0 && <SelectionTag />}
						{contextItems.map((contextItem, i) => (
							<ContextItemTag editor={editor} key={'context-item-' + i} item={contextItem} />
						))}
					</div>
				)}
				<span className="chat-history-prompt-content">{displayMessage}</span>
			</div>
		</div>
	)
}
