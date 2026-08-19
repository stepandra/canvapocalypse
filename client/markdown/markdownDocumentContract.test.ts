import { describe, expect, it } from 'vitest'
import {
	createMarkdownDocumentInput,
	extractMarkdownLinkRefs,
	markdownDocumentRevision,
	sliceUtf8Chunk,
} from './markdownDocumentContract'

describe('Markdown document contract', () => {
	it('normalizes content into a deterministic revision without retaining its Vault path', () => {
		const document = createMarkdownDocumentInput(
			'---\r\ntitle: Architecture context\r\n---\r\n\r\n# Ignored fallback\r\n',
			'/Users/example/Obsidian Vault/architecture.md',
			{ documentRef: 'markdown-architecture-contract' }
		)

		expect(document).toMatchObject({
			documentRef: 'markdown-architecture-contract',
			title: 'Architecture context',
			sourceName: 'architecture.md',
			sourceKind: 'file',
		})
		expect(document.markdown).not.toContain('\r')
		expect(JSON.stringify(document)).not.toContain('/Users/example')
		expect(document.revision).toBe(markdownDocumentRevision(document.markdown))
	})

	it('computes the standard SHA-256 digest', () => {
		expect(markdownDocumentRevision('abc')).toBe(
			'sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
		)
	})

	it('rejects documents beyond the bounded contract size', () => {
		expect(() =>
			createMarkdownDocumentInput('x'.repeat(128 * 1024 + 1), 'oversized.md')
		).toThrow('128 KB or smaller')
	})

	it('extracts bounded local references but not paths or external URLs', () => {
		expect(
			extractMarkdownLinkRefs(
				'[[Architecture/Event Bus#Trade-offs|Bus]] [ADR](decisions/001.md) [web](https://example.com) [absolute](/etc/passwd)'
			)
		).toEqual(['Architecture/Event Bus', 'decisions/001.md'])
	})

	it('chunks on UTF-8 boundaries so multibyte content can be reassembled losslessly', () => {
		const markdown = 'A🙂Б🙂Z'
		const first = sliceUtf8Chunk(markdown, 0, 6)
		const second = sliceUtf8Chunk(markdown, first.end, 32)

		expect(first.text + second.text).toBe(markdown)
		expect(first.eof).toBe(false)
		expect(second.eof).toBe(true)
		expect(second.end).toBe(new TextEncoder().encode(markdown).byteLength)
	})
})
