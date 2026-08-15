import { describe, expect, it } from 'vitest'
import { createCanvapocalypseCanvasKitComposition } from '../canvas-studio/host'
import { CommentTool } from './CommentTool'
import { CANVAS_COMMENTS_KIT_CONTRIBUTION } from './contribution'
import { CANVAS_COMMENT_RECORDS } from './core/records'

describe('Canvas comments kit contribution', () => {
	it('registers durable comment records and the comment tool in the default host', () => {
		const composition = createCanvapocalypseCanvasKitComposition()

		expect(composition.getContribution('canvas.comments')).toBe(
			CANVAS_COMMENTS_KIT_CONTRIBUTION
		)
		expect(composition.tools).toContain(CommentTool)
		expect(composition.records).toMatchObject(CANVAS_COMMENT_RECORDS)
	})
})
