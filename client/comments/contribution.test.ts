import { describe, expect, it } from 'vitest'
import { createCanvapocalypseCanvasKitComposition } from '../canvas-studio/host'
import { readFileSync } from 'node:fs'
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

	it('mounts comment controls in the shared workbench rail', () => {
		const overlaySource = readFileSync(new URL('./CommentOverlay.tsx', import.meta.url), 'utf8')
		const shellSource = readFileSync(
			new URL('../workbench/WorkbenchShell.tsx', import.meta.url),
			'utf8'
		)

		expect(overlaySource).toContain('export const CanvasCommentControls')
		expect(shellSource).toContain('showCommentTools && <CanvasCommentControls />')
	})
})
