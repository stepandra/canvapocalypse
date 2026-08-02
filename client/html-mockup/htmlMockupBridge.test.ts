import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
	HTML_MOCKUP_ORIGIN,
	HTML_MOCKUP_SELECTION_MESSAGE,
	fetchHtmlMockupBridge,
	importHtmlMockupDocument,
	installHtmlMockupResidentCapability,
	issueHtmlMockupPreviewUrl,
	listHtmlMockupDocuments,
	parseHtmlMockupSelectionMessage,
} from './htmlMockupBridge'
import { createLocalHtmlMockupMeta } from './LocalHtmlMockupShape'

const REVISION = `sha256:${'a'.repeat(64)}`
const NEXT_REVISION = `sha256:${'b'.repeat(64)}`
const RESIDENT_CAPABILITY = `hr_${'A'.repeat(43)}`

beforeEach(() => {
	installHtmlMockupResidentCapability(RESIDENT_CAPABILITY)
})

afterEach(() => {
	vi.unstubAllGlobals()
})

describe('Local HTML Mockup bridge', () => {
	it('normalizes the registry into compact opaque references', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(
				new Response(
					JSON.stringify({
						documents: [
							{
								documentRef: 'mockup-1',
								name: 'Candidate screen',
								relativePath: 'private/huge-screen.html',
								rootLabel: '/Users/example/project',
								byteSize: 900_000,
								body: '<main>must not escape</main>',
							},
						],
					}),
					{ status: 200, headers: { 'content-type': 'application/json' } }
				)
			)
		)

		await expect(listHtmlMockupDocuments()).resolves.toEqual([
			{
				documentRef: 'mockup-1',
				title: 'Candidate screen',
				revision: 'unresolved',
				truncated: false,
			},
		])
	})

	it('keeps upload content transient and returns body/path-free metadata', async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					document: {
						documentRef: 'import-42',
						name: 'screen.html',
						revision: REVISION,
						relativePath: 'imports/screen.html',
						content: '<main>server echo</main>',
					},
				}),
				{ status: 200, headers: { 'content-type': 'application/json' } }
			)
		)
		vi.stubGlobal('fetch', fetchMock)

		const document = await importHtmlMockupDocument({
			name: 'screen.html',
			content: '<main data-agent-ref="hero">Hello</main>',
		})
		const request = fetchMock.mock.calls[0]!
		const init = request[1] as RequestInit
		expect(JSON.parse(String(init.body))).toEqual({
			name: 'screen.html',
			content: '<main data-agent-ref="hero">Hello</main>',
		})
		expect(document).toEqual({
			documentRef: 'import-42',
			title: 'screen.html',
			revision: REVISION,
			truncated: false,
		})

		const persisted = createLocalHtmlMockupMeta(document)
		expect(Object.keys(persisted).sort()).toEqual([
			'documentRef',
			'previewMode',
			'revision',
			'schema',
			'title',
			'truncated',
		])
		for (const forbidden of [
			'content',
			'body',
			'html',
			'path',
			'relativePath',
			'credential',
			'token',
		]) {
			expect(persisted).not.toHaveProperty(forbidden)
		}
	})

	it('keeps relative and exact-origin URL requests on the local bridge', async () => {
		const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
		vi.stubGlobal('fetch', fetchMock)

		await fetchHtmlMockupBridge('/html-mockups')
		await fetchHtmlMockupBridge(
			new URL('/html-mockups/mockup-1/snapshot', HTML_MOCKUP_ORIGIN)
		)

		expect(fetchMock).toHaveBeenCalledTimes(2)
		expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual([
			`${HTML_MOCKUP_ORIGIN}/html-mockups`,
			`${HTML_MOCKUP_ORIGIN}/html-mockups/mockup-1/snapshot`,
		])
		for (const [, init] of fetchMock.mock.calls) {
			expect(
				new Headers(init?.headers).get(
					'x-tldraw-html-capability'
				)
			).toBe(RESIDENT_CAPABILITY)
		}
	})

	it('rejects a foreign absolute string before attaching resident authority', async () => {
		const fetchMock = vi.fn()
		vi.stubGlobal('fetch', fetchMock)

		await expect(
			fetchHtmlMockupBridge('https://attacker.invalid/collect')
		).rejects.toThrow('bridge request is not allowlisted')
		expect(fetchMock).not.toHaveBeenCalled()
	})

	it('rejects a foreign URL object before attaching resident authority', async () => {
		const fetchMock = vi.fn()
		vi.stubGlobal('fetch', fetchMock)

		await expect(
			fetchHtmlMockupBridge(
				new URL('https://attacker.invalid/collect')
			)
		).rejects.toThrow('bridge request is not allowlisted')
		expect(fetchMock).not.toHaveBeenCalled()
	})

	it('rejects credentials even when the URL origin matches the bridge', async () => {
		const fetchMock = vi.fn()
		vi.stubGlobal('fetch', fetchMock)

		await expect(
			fetchHtmlMockupBridge(
				new URL(
					'http://resident:secret@127.0.0.1:5176/html-mockups'
				)
			)
		).rejects.toThrow('bridge request is not allowlisted')
		expect(fetchMock).not.toHaveBeenCalled()
	})

	it('exchanges the resident capability for a scoped preview ticket URL', async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					ticket: `hp_${'P'.repeat(32)}`,
					documentRef: 'mockup-1',
					revision: REVISION,
					parentOrigin: 'http://127.0.0.1:5173',
					expiresAt: new Date(Date.now() + 60_000).toISOString(),
				}),
				{ status: 201, headers: { 'content-type': 'application/json' } }
			)
		)
		vi.stubGlobal('fetch', fetchMock)
		const preview = new URL(
			await issueHtmlMockupPreviewUrl('mockup-1', REVISION)
		)
		expect(preview.origin).toBe(HTML_MOCKUP_ORIGIN)
		expect(preview.pathname).toBe('/html-mockups/mockup-1/preview')
		expect(preview.searchParams.get('revision')).toBe(REVISION)
		expect(preview.searchParams.get('ticket')).toBe(
			`hp_${'P'.repeat(32)}`
		)
		expect(preview.searchParams.has('parentOrigin')).toBe(false)
		const [ticketUrl, ticketInit] = fetchMock.mock.calls[0]
		expect(String(ticketUrl)).toBe(
			'http://127.0.0.1:5176/html-mockups/mockup-1/preview-ticket'
		)
		expect(
			new Headers(ticketInit?.headers).get(
				'x-tldraw-html-capability'
			)
		).toBe(RESIDENT_CAPABILITY)
			expect(JSON.parse(String(ticketInit?.body))).toEqual({
				revision: REVISION,
			})
		await expect(
			issueHtmlMockupPreviewUrl('mockup-1', 'rev-2')
		).rejects.toThrow('Invalid revision')
		})

	it('accepts only a click from the exact preview source, document, and revision', () => {
		const iframeWindow = {} as MessageEventSource
		const base = {
			origin: HTML_MOCKUP_ORIGIN,
			source: iframeWindow,
			data: {
				type: HTML_MOCKUP_SELECTION_MESSAGE,
				phase: 'click',
				documentRef: 'mockup-1',
				revision: REVISION,
				targetRef: 'a11y:button:save',
				summary: 'Save changes',
			},
		}
		const expected = {
			documentRef: 'mockup-1',
			revision: REVISION,
			source: iframeWindow,
		}

		expect(parseHtmlMockupSelectionMessage(base, expected)).toEqual({
			documentRef: 'mockup-1',
			revision: REVISION,
			targetRef: 'a11y:button:save',
			label: 'Save changes',
		})
		expect(
			parseHtmlMockupSelectionMessage(
				{ ...base, origin: 'null' },
				expected
			)
		).toEqual({
			documentRef: 'mockup-1',
			revision: REVISION,
			targetRef: 'a11y:button:save',
			label: 'Save changes',
		})
		expect(
			parseHtmlMockupSelectionMessage(
				{ ...base, origin: 'null' },
				{
					documentRef: 'mockup-1',
					revision: REVISION,
					source: {} as MessageEventSource,
				}
			)
		).toBeNull()
		expect(
			parseHtmlMockupSelectionMessage(
				{
					...base,
					origin: 'null',
					source: {} as MessageEventSource,
				},
				expected
			)
		).toBeNull()
		expect(
			parseHtmlMockupSelectionMessage(
				{ ...base, origin: 'http://localhost:5176' },
				expected
			)
		).toBeNull()
		expect(
			parseHtmlMockupSelectionMessage(
				{ ...base, source: {} as MessageEventSource },
				expected
			)
		).toBeNull()
		expect(
			parseHtmlMockupSelectionMessage(
				{ ...base, data: { ...base.data, phase: 'hover' } },
				expected
			)
		).toBeNull()
		expect(
			parseHtmlMockupSelectionMessage(
				{ ...base, data: { ...base.data, revision: NEXT_REVISION } },
				expected
			)
		).toBeNull()
	})
})
