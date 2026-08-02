import type { Editor, TLShape } from 'tldraw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HtmlMockupContextPartDefinition } from '../../shared/schema/PromptPartDefinitions'
import type { AgentRequest } from '../../shared/types/AgentRequest'
import type { TldrawAgent } from '../agent/TldrawAgent'
import { installHtmlMockupResidentCapability } from '../html-mockup/htmlMockupBridge'
import {
	compactHtmlMockupSnapshot,
	HtmlMockupContextPartUtil,
	MAX_HTML_MOCKUP_CHARS,
	MAX_HTML_MOCKUP_NODES,
} from './HtmlMockupContextPartUtil'

const REVISION = `sha256:${'a'.repeat(64)}`
const CONTEXT_REF = 'hc_checkout_submit'
const RESIDENT_CAPABILITY = `hr_${'A'.repeat(43)}`

beforeEach(() => {
	installHtmlMockupResidentCapability(RESIDENT_CAPABILITY)
})

function request(
	route: 'canvas-edit' | 'isoflow-edit' | 'inquiry' = 'canvas-edit',
): AgentRequest {
	return {
		agentMessages: ['Inspect the selected mockup'],
		userMessages: ['Inspect the selected mockup'],
		bounds: { x: 0, y: 0, w: 100, h: 100 },
		data: [],
		source: 'user',
		contextItems: [],
		routing: { enabled: true, route },
	}
}

function shape(props: Record<string, unknown>): TLShape {
	return {
		id: 'shape:mockup',
		type: 'local-html-mockup',
		props,
		meta: {
			secret: 'must-not-cross',
			sourcePath: '/private/mockup.html',
		},
	} as unknown as TLShape
}

function utilFor(selected: TLShape[]) {
	const editor = {
		getSelectedShapes: vi.fn(() => selected),
	} as unknown as Editor
	const agent = { editor } as unknown as TldrawAgent
	return new HtmlMockupContextPartUtil(agent)
}

afterEach(() => {
	vi.unstubAllGlobals()
})

describe('HtmlMockupContextPartUtil', () => {
	it('fetches and re-caps only the selected revision-scoped semantic target', async () => {
		const selected = shape({
			documentRef: 'mockup.checkout',
			revision: REVISION,
			title: 'Checkout',
			selectedTargetRef: 'node.submit',
			selectedTargetLabel: 'Submit order',
			w: 800,
			h: 600,
		})
		const nodes = Array.from(
			{ length: MAX_HTML_MOCKUP_NODES + 12 },
			(_, index) => ({
				ref: index === 0 ? 'node.submit' : `node.${index}`,
				parentRef: index === 0 ? undefined : 'node.submit',
				tag: index === 0 ? 'button' : 'div',
				role: index === 0 ? 'button' : undefined,
				name: `Node ${index} ${'n'.repeat(100)}`,
				text: `Visible text ${index} ${'x'.repeat(180)}`,
				depth: index === 1 ? 20 : Math.min(12, index % 13),
				childCount: index,
				selector: '#secret-selector',
				className: 'secret-class',
				url: 'https://secret.invalid',
				sourceOffset: 999,
				html: '<script>secret</script>',
			}),
		)
		const fetchMock = vi.fn(
			async (_input: URL | RequestInfo, _init?: RequestInit) =>
				new Response(
					JSON.stringify({
						documentRef: 'mockup.checkout',
						revision: REVISION,
						title: 'Checkout',
						bytes: 24_000,
						contextRef: CONTEXT_REF,
						sourcePath: '/private/mockup.html',
						credentials: { token: 'secret-token' },
						snapshot: {
							nodes,
							target: nodes[0],
							truncated: false,
							html: '<main>secret-source</main>',
						},
					}),
					{ status: 200, headers: { 'Content-Type': 'application/json' } },
				),
		)
		vi.stubGlobal('fetch', fetchMock)

		const part = await utilFor([selected]).getPart(request())

		expect(fetchMock).toHaveBeenCalledTimes(1)
		const url = new URL(String(fetchMock.mock.calls[0][0]))
		expect(url.origin).toBe('http://127.0.0.1:5176')
			expect(url.pathname).toBe('/html-mockups/mockup.checkout/snapshot')
			expect(url.searchParams.get('targetRef')).toBe('node.submit')
			expect(url.searchParams.has('parentOrigin')).toBe(false)
		expect(url.searchParams.get('maxNodes')).toBe(String(MAX_HTML_MOCKUP_NODES))
		expect(url.searchParams.get('maxChars')).toBe(String(MAX_HTML_MOCKUP_CHARS))
		expect(
			new Headers(fetchMock.mock.calls[0][1]?.headers).get(
				'x-tldraw-html-capability',
			),
		).toBe(RESIDENT_CAPABILITY)

		expect(part.mockups).toHaveLength(1)
		expect(part.mockups[0]).toMatchObject({
			shapeId: 'shape:mockup',
			documentRef: 'mockup.checkout',
			revision: REVISION,
			title: 'Checkout',
			selectedTarget: {
				ref: 'node.submit',
				label: 'Submit order',
				contextRef: CONTEXT_REF,
			},
			snapshot: {
				target: {
					ref: 'node.submit',
					tag: 'button',
					role: 'button',
				},
				truncated: true,
			},
		})
		expect(part.mockups[0].snapshot.nodes.length).toBeLessThanOrEqual(
			MAX_HTML_MOCKUP_NODES,
		)
		expect(part.mockups[0].snapshot.nodes.some(({ depth }) => depth > 12)).toBe(
			false,
		)
		expect(
			Math.max(
				...part.mockups[0].snapshot.nodes.map(({ text }) => text?.length ?? 0),
			),
		).toBeLessThanOrEqual(240)
		expect(JSON.stringify(part).length).toBeLessThanOrEqual(MAX_HTML_MOCKUP_CHARS)

		const serialized = JSON.stringify(part)
		for (const omitted of [
			'secret-selector',
			'secret-class',
			'secret.invalid',
			'sourceOffset',
			'secret-source',
			'secret-token',
			'/private/',
		]) {
			expect(serialized).not.toContain(omitted)
		}
	})

	it('requires the Local HTML Mockup to be the only selected shape', async () => {
		const fetchMock = vi.fn()
		vi.stubGlobal('fetch', fetchMock)
		const unrelated = {
			id: 'shape:note',
			type: 'note',
			props: {},
			meta: {},
		} as unknown as TLShape

		await expect(
			utilFor([
				shape({ documentRef: 'mockup.checkout', revision: REVISION }),
				unrelated,
			]).getPart(request()),
		).rejects.toThrow('Select exactly one Local HTML Mockup')
		expect(fetchMock).not.toHaveBeenCalled()
	})

	it('fails closed if selection authority changes while context is loading', async () => {
		const selected = shape({
			documentRef: 'mockup.checkout',
			revision: REVISION,
			selectedTargetRef: 'node.submit',
		})
		let currentSelection = [selected]
		const editor = {
			getSelectedShapes: vi.fn(() => currentSelection),
		} as unknown as Editor
		const agent = { editor } as unknown as TldrawAgent
		const util = new HtmlMockupContextPartUtil(agent)
		let resolveFetch!: (response: Response) => void
		const fetchMock = vi.fn(
			() =>
				new Promise<Response>((resolve) => {
					resolveFetch = resolve
				}),
		)
		vi.stubGlobal('fetch', fetchMock)

		const pending = util.getPart(request())
		await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
		currentSelection = [
			shape({
				documentRef: 'mockup.checkout',
				revision: `sha256:${'b'.repeat(64)}`,
				selectedTargetRef: 'node.submit',
			}),
		]
		resolveFetch(
			new Response(
				JSON.stringify({
					documentRef: 'mockup.checkout',
					revision: REVISION,
					title: 'Checkout',
					bytes: 1200,
					contextRef: CONTEXT_REF,
					nodes: [
						{
							ref: 'node.submit',
							tag: 'button',
							depth: 1,
							childCount: 0,
						},
					],
					target: {
						ref: 'node.submit',
						tag: 'button',
						depth: 1,
						childCount: 0,
					},
					truncated: false,
				}),
				{ status: 200 },
			),
		)

		await expect(pending).rejects.toThrow(
			'selection changed while context was being inspected',
		)
	})

	it('fails closed when the selected shape lacks an opaque revision', async () => {
		const fetchMock = vi.fn()
		vi.stubGlobal('fetch', fetchMock)

		await expect(
			utilFor([
				shape({ documentRef: 'mockup.checkout', title: 'Checkout' }),
			]).getPart(request()),
		).rejects.toThrow('missing a valid opaque documentRef or sha256 revision')
		expect(fetchMock).not.toHaveBeenCalled()
	})

	it('never emits HTML context for an explicit Isoflow route', async () => {
		const fetchMock = vi.fn()
		vi.stubGlobal('fetch', fetchMock)
		const part = await utilFor([
			shape({ documentRef: 'mockup.checkout', revision: REVISION }),
		]).getPart(request('isoflow-edit'))

		expect(part).toEqual({ type: 'htmlMockupContext', mockups: [] })
		expect(fetchMock).not.toHaveBeenCalled()
	})

	it('requires the requested target ref to match the bounded provider response', () => {
		expect(() =>
			compactHtmlMockupSnapshot(
				{
					documentRef: 'mockup.checkout',
					revision: REVISION,
					title: 'Checkout',
					bytes: 1200,
					contextRef: CONTEXT_REF,
					nodes: [],
					target: {
						ref: 'node.other',
						tag: 'button',
						depth: 1,
						childCount: 0,
					},
					truncated: false,
				},
				{
					documentRef: 'mockup.checkout',
					expectedRevision: REVISION,
					targetRef: 'node.submit',
				},
			),
		).toThrow('targetRef mismatch')
	})
})

describe('Local HTML Mockup prompt contract', () => {
	it('describes only opaque refs and revision-scoped semantic context', () => {
		const content = HtmlMockupContextPartDefinition.buildContent?.({
			type: 'htmlMockupContext',
			mockups: [
				{
					shapeId: 'shape:mockup',
					documentRef: 'mockup.checkout',
					revision: REVISION,
					title: 'Checkout',
					bytes: 1200,
					selectedTarget: {
						ref: 'node.submit',
						label: 'Submit order',
						contextRef: CONTEXT_REF,
					},
					snapshot: {
						nodes: [
							{
								ref: 'node.submit',
								tag: 'button',
								role: 'button',
								name: 'Submit order',
								depth: 1,
								childCount: 0,
							},
						],
						truncated: false,
					},
				},
			],
		})

		expect(content?.[0]).toContain('opaque provider references')
		expect(content?.[0]).toContain('selectedTarget')
		expect(content?.[0]).toContain('revision-guarded variant')
		expect(content?.[1]).not.toContain('<button')
		expect(content?.[1]).not.toContain('/Users/')
	})
})
