import { useState } from 'react'
import {
	TldrawUiButton,
	TldrawUiButtonIcon,
	TldrawUiButtonLabel,
	useEditor,
	useValue,
} from 'tldraw'
import { useAgent } from '../agent/TldrawAgentAppProvider'
import {
	buildProductCreativeIdeationPrompt,
	PRODUCT_CREATIVE_IDEATION_USER_MESSAGE,
} from './productCreativeIdeation'
import { buildWorkbenchAgentInput } from './workbenchAgentRequest'

type CreativeIdeationStatus = 'idle' | 'running' | 'complete' | 'error'

export function ProductCreativeIdeationButton() {
	const editor = useEditor()
	const agent = useAgent()
	const [status, setStatus] = useState<CreativeIdeationStatus>('idle')
	const selectedShapeCount = useValue(
		'product creative ideation selection',
		() => editor.getSelectedShapeIds().length,
		[editor]
	)
	const isGenerating = useValue(
		'product creative ideation agent generation',
		() => agent.requests.isGenerating(),
		[agent]
	)

	const invoke = async () => {
		if (isGenerating || status === 'running') return
		setStatus('running')

		const input = buildWorkbenchAgentInput({
			editor,
			message: buildProductCreativeIdeationPrompt({ selectedShapeCount }),
			domain: 'product',
			contextMode: selectedShapeCount > 0 ? 'selection' : 'visible-area',
		})
		input.userMessages = [PRODUCT_CREATIVE_IDEATION_USER_MESSAGE]

		try {
			await agent.prompt(input)
			setStatus('complete')
		} catch {
			setStatus('error')
		}
	}

	const statusLabel =
		status === 'running'
			? 'Exploring directions…'
			: status === 'complete'
				? 'Ideas added to thread'
				: status === 'error'
					? 'Try creative ideation again'
					: 'Creative ideation'

	return (
		<TldrawUiButton
			type="menu"
			className="workbench-creative-ideation-trigger"
			title="Explore distinct product directions in the current Product agent thread before drawing"
			disabled={isGenerating || status === 'running'}
			data-skill="creative-ideation"
			data-status={status}
			onClick={invoke}
		>
			<TldrawUiButtonIcon
				icon={status === 'complete' ? 'check-circle' : 'geo-star'}
				small
			/>
			<TldrawUiButtonLabel>{statusLabel}</TldrawUiButtonLabel>
			<span className="workbench-creative-ideation-context">
				{selectedShapeCount > 0
					? `${selectedShapeCount} selected`
					: 'Visible area'}
			</span>
		</TldrawUiButton>
	)
}
