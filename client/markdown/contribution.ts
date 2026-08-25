import type { CanvasKitContribution } from '../canvas-studio/types'
import { MARKDOWN_READ_AGENT_CAPABILITY } from './MarkdownAgentCapability'
import {
	MARKDOWN_DOCUMENT_MIGRATION_ID,
	MarkdownDocumentShapeUtil,
} from './MarkdownDocumentShape'
import { MARKDOWN_DOCUMENT_CONTRACT_SCHEMA } from './markdownDocumentContract'

export const CANVAS_MARKDOWN_KIT_CONTRIBUTION: CanvasKitContribution = {
	kitId: 'canvas.markdown',
	runtimeContract: {
		schema: 'canvas.kit-runtime/v1',
		owner: 'canvas.markdown',
		tldrawVersion: '5.2.5',
		toolPaths: [],
		migrationIds: [MARKDOWN_DOCUMENT_MIGRATION_ID],
		schemaIds: [MARKDOWN_DOCUMENT_CONTRACT_SCHEMA],
		lifecycleIds: [],
		bridgeIds: [],
	},
	presetIds: [],
	shapeUtils: [MarkdownDocumentShapeUtil],
	bindingUtils: [],
	tools: [],
	agentCapabilities: [MARKDOWN_READ_AGENT_CAPABILITY],
	insertPreset(_editor, presetId) {
		throw new Error(`Unknown Canvas Markdown preset ${presetId}`)
	},
}
