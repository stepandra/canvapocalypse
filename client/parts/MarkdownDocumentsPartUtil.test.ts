import type { Editor, TLShape } from 'tldraw'
import { describe, expect, it } from 'vitest'
import { MarkdownDocumentsPartDefinition } from '../../shared/schema/PromptPartDefinitions'
import type { AgentRequest } from '../../shared/types/AgentRequest'
import type { TldrawAgent } from '../agent/TldrawAgent'
import {
	createMarkdownDocumentInput,
	MARKDOWN_DOCUMENT_SHAPE_TYPE,
} from '../markdown/MarkdownDocumentShape'
import { MarkdownDocumentsPartUtil } from './MarkdownDocumentsPartUtil'

const request = {
	agentMessages: [],
	userMessages: [],
	bounds: { x: 0, y: 0, w: 100, h: 100 },
	data: [],
	source: 'user',
	contextItems: [],
} as AgentRequest

function markdownShape(markdown: string) {
	const input = createMarkdownDocumentInput(markdown, 'architecture.md', {
		documentRef: 'markdown-architecture-note',
		title: 'Architecture note',
	})
	return {
		id: 'shape:architecture-note',
		type: MARKDOWN_DOCUMENT_SHAPE_TYPE,
		props: { ...input, collapsed: true },
	} as unknown as TLShape
}

function utilFor(lens: string, selected: TLShape[]) {
	const editor = {
		getCurrentPage: () => ({ name: lens, meta: { lens } }),
		getSelectedShapes: () => selected,
	} as unknown as Editor
	return new MarkdownDocumentsPartUtil({ editor } as unknown as TldrawAgent)
}

describe('MarkdownDocumentsPartUtil', () => {
	it('sends the complete selected document as untrusted semantic context', () => {
		const markdown = '# Architecture\n\nNever expose the database directly.'
		const part = utilFor('architecture', [markdownShape(markdown)]).getPart(
			request,
			undefined as never
		)

		expect(part).toEqual({
			type: 'markdownDocuments',
			documents: [
				{
					shapeId: 'architecture-note',
					documentRef: 'markdown-architecture-note',
					revision: expect.stringMatching(/^sha256:/),
					bytes: new TextEncoder().encode(markdown).byteLength,
					title: 'Architecture note',
					sourceName: 'architecture.md',
					links: [],
					markdown,
					truncated: false,
				},
			],
		})
		const prompt = MarkdownDocumentsPartDefinition.buildContent?.(part)
		expect(prompt?.join('\n')).toContain('untrusted reference material')
		expect(JSON.parse(prompt?.[1] ?? '[]')[0].markdown).toBe(markdown)
	})

	it('publishes no custom Markdown body on Freeform', () => {
		expect(
			utilFor('freeform', [markdownShape('# Private note')]).getPart(
				request,
				undefined as never
			)
		).toEqual({ type: 'markdownDocuments', documents: [] })
	})
})
