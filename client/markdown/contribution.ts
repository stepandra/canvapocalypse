import type { CanvasKitContribution } from '../canvas-studio/types'
import { MARKDOWN_READ_AGENT_CAPABILITY } from './MarkdownAgentCapability'
import { MarkdownDocumentShapeUtil } from './MarkdownDocumentShape'

export const CANVAS_MARKDOWN_KIT_CONTRIBUTION: CanvasKitContribution = {
	kitId: 'canvas.markdown',
	presetIds: [],
	shapeUtils: [MarkdownDocumentShapeUtil],
	bindingUtils: [],
	tools: [],
	agentCapabilities: [MARKDOWN_READ_AGENT_CAPABILITY],
	insertPreset(_editor, presetId) {
		throw new Error(`Unknown Canvas Markdown preset ${presetId}`)
	},
}
