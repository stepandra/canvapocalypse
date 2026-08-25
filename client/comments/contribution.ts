import type { CanvasKitContribution } from '../canvas-studio/types'
import { CommentTool } from './CommentTool'
import {
	CANVAS_COMMENT_MIGRATION_IDS,
	CANVAS_COMMENT_RECORDS,
	CANVAS_COMMENT_SCHEMA_IDS,
} from './core/records'
import {
	CANVAS_COMMENT_LIFECYCLE_ID,
	mountCommentLifecycle,
} from './core/lifecycle'

export const CANVAS_COMMENTS_KIT_CONTRIBUTION: CanvasKitContribution = {
	kitId: 'canvas.comments',
	runtimeContract: {
		schema: 'canvas.kit-runtime/v1',
		owner: 'canvas.comments',
		tldrawVersion: '5.2.5',
		toolPaths: ['comment', 'comment.idle', 'comment.region-dragging'],
		migrationIds: CANVAS_COMMENT_MIGRATION_IDS,
		schemaIds: CANVAS_COMMENT_SCHEMA_IDS,
		lifecycleIds: [CANVAS_COMMENT_LIFECYCLE_ID],
		bridgeIds: [],
	},
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
