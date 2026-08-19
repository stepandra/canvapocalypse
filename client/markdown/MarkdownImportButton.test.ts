import type { Editor } from 'tldraw'
import { describe, expect, it, vi } from 'vitest'
import { importMarkdownFile } from './MarkdownImportButton'
import {
	createMarkdownDocumentInput,
	MARKDOWN_DOCUMENT_SHAPE_TYPE,
	type MarkdownDocumentShape,
} from './MarkdownDocumentShape'

function markdownFile(name: string, markdown: string) {
	return {
		name,
		size: new TextEncoder().encode(markdown).byteLength,
		text: async () => markdown,
	} as File
}

function editorMock(shape?: MarkdownDocumentShape) {
	return {
		getShape: vi.fn(() => shape),
		getViewportPageBounds: vi.fn(() => ({ x: 0, y: 0, w: 1_000, h: 700 })),
		markHistoryStoppingPoint: vi.fn(),
		createShape: vi.fn(),
		updateShape: vi.fn(),
		select: vi.fn(),
	} as unknown as Editor
}

describe('Markdown import and refresh', () => {
	it('imports a new collapsed shape without implicitly replacing the selection', async () => {
		const editor = editorMock()
		const receipt = await importMarkdownFile(
			markdownFile('architecture.md', '# Architecture'),
			editor
		)

		expect(receipt.refreshed).toBe(false)
		expect(editor.createShape).toHaveBeenCalledOnce()
		expect(editor.updateShape).not.toHaveBeenCalled()
	})

	it('refreshes only the explicit target, retaining its documentRef as one undo step', async () => {
		const original = createMarkdownDocumentInput('# Original', 'architecture.md', {
			documentRef: 'markdown-architecture-refresh',
		})
		const shape = {
			id: 'shape:architecture-note',
			type: MARKDOWN_DOCUMENT_SHAPE_TYPE,
			props: {
				...original,
				w: 520,
				h: 68,
				expandedH: 460,
				collapsed: true,
			},
		} as MarkdownDocumentShape
		const editor = editorMock(shape)
		const receipt = await importMarkdownFile(
			markdownFile('renamed.md', '# Refreshed'),
			editor,
			{ type: 'refresh', shapeId: shape.id }
		)

		expect(receipt.refreshed).toBe(true)
		expect(editor.createShape).not.toHaveBeenCalled()
		expect(editor.markHistoryStoppingPoint).toHaveBeenCalledWith(
			'Replace Markdown document'
		)
		expect(editor.updateShape).toHaveBeenCalledWith(
			expect.objectContaining({
				id: shape.id,
				props: expect.objectContaining({
					documentRef: original.documentRef,
					sourceName: 'renamed.md',
					markdown: '# Refreshed',
				}),
			})
		)
		expect(receipt.revision).not.toBe(original.revision)
	})
})
