import type { CanvasKitContribution } from '../canvas-studio/types'
import { CommentTool } from './CommentTool'
import { CANVAS_COMMENT_RECORDS } from './core/records'
import { mountCommentLifecycle } from './core/lifecycle'

export const CANVAS_COMMENTS_KIT_CONTRIBUTION: CanvasKitContribution = {
	kitId: 'canvas.comments',
	presetIds: [],
	shapeUtils: [],
	bindingUtils: [],
	tools: [CommentTool],
	records: CANVAS_COMMENT_RECORDS,
	onMount: mountCommentLifecycle,
	insertPreset(_editor, presetId) {
		throw new Error(`Canvas comments kit does not provide preset ${presetId}`)
	},
}
