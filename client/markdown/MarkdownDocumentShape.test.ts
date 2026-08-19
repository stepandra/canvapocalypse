import type { Editor, TLShape } from 'tldraw'
import { describe, expect, it, vi } from 'vitest'
import {
	createMarkdownDocumentInput,
	createMarkdownDocumentShape,
	deriveMarkdownTitle,
	MARKDOWN_DOCUMENT_COLLAPSED_HEIGHT,
	MARKDOWN_DOCUMENT_SHAPE_TYPE,
	markdownDocumentBody,
	markdownDocumentRevision,
	projectMarkdownDocumentsForAgent,
} from './MarkdownDocumentShape'

describe('Markdown document shape', () => {
	it('derives a stable title without retaining a Vault path', () => {
		const input = createMarkdownDocumentInput(
				'---\ntitle: "Architecture constraints"\n---\n\n# Ignored heading',
				'/Users/example/Vault/architecture.md'
			)
		expect(input).toMatchObject({
			title: 'Architecture constraints',
			markdown:
				'---\ntitle: "Architecture constraints"\n---\n\n# Ignored heading',
			sourceName: 'architecture.md',
			sourceKind: 'file',
			links: [],
		})
		expect(input.documentRef).toMatch(/^markdown-/)
		expect(input.revision).toMatch(/^sha256:[a-f0-9]{64}$/)
		expect(JSON.stringify(input)).not.toContain('/Users/')
		expect(markdownDocumentRevision('abc')).toBe(
			'sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
		)
		expect(deriveMarkdownTitle('# Decision record', 'fallback.md')).toBe(
			'Decision record'
		)
		expect(deriveMarkdownTitle('No heading', 'fallback.md')).toBe('fallback')
		expect(
			markdownDocumentBody('---\ntitle: Architecture\n---\n\n# Visible title')
		).toBe('# Visible title')
	})

	it('inserts a collapsed document as one selected native shape', () => {
		const createShape = vi.fn()
		const select = vi.fn()
		const editor = {
			getViewportPageBounds: () => ({ x: 100, y: 200, w: 1_000, h: 700 }),
			markHistoryStoppingPoint: vi.fn(),
			createShape,
			select,
		} as unknown as Editor

		const id = createMarkdownDocumentShape(
			editor,
			createMarkdownDocumentInput(
				'# ADR 12\n\nUse event sourcing.',
				'ADR 12.md'
			)
		)

		expect(createShape).toHaveBeenCalledWith(
			expect.objectContaining({
				id,
				type: MARKDOWN_DOCUMENT_SHAPE_TYPE,
				props: expect.objectContaining({
					title: 'ADR 12',
					collapsed: true,
					h: MARKDOWN_DOCUMENT_COLLAPSED_HEIGHT,
				}),
			})
		)
		expect(select).toHaveBeenCalledWith(id)
	})

	it('projects full selected Markdown and reports an explicit aggregate truncation', () => {
		const input = createMarkdownDocumentInput('abcdefghij', 'ADR 12.md')
		const shape = {
			id: 'shape:adr-12',
			type: MARKDOWN_DOCUMENT_SHAPE_TYPE,
			props: { ...input, title: 'ADR 12' },
		} as unknown as TLShape

		expect(projectMarkdownDocumentsForAgent([shape])).toEqual([
			expect.objectContaining({ markdown: 'abcdefghij', truncated: false }),
		])
		expect(projectMarkdownDocumentsForAgent([shape], 5)).toEqual([
			expect.objectContaining({ markdown: 'abcde', truncated: true }),
		])
		const unicodeShape = {
			...shape,
			props: {
				...createMarkdownDocumentInput('🙂🙂', 'ADR 12.md', {
					documentRef: input.documentRef,
				}),
				title: 'ADR 12',
			},
		} as unknown as TLShape
		expect(projectMarkdownDocumentsForAgent([unicodeShape], 5)).toEqual([
			expect.objectContaining({ markdown: '🙂', truncated: true }),
		])
	})
})
