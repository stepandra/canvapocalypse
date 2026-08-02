import type { Editor, TLShape } from 'tldraw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TldrawAgent } from '../agent/TldrawAgent'
import { installHtmlMockupResidentCapability } from '../html-mockup/htmlMockupBridge'
import { HtmlMockupInspectActionUtil } from './HtmlMockupInspectActionUtil'
import {
	compactVariantReceipt,
	HtmlMockupVariantActionUtil,
} from './HtmlMockupVariantActionUtil'

const REVISION = `sha256:${'a'.repeat(64)}`
const AFTER_REVISION = `sha256:${'b'.repeat(64)}`
const CONTEXT_REF = 'hc_checkout_submit'
const RESIDENT_CAPABILITY = `hr_${'A'.repeat(43)}`

beforeEach(() => {
	installHtmlMockupResidentCapability(RESIDENT_CAPABILITY)
})

function shape(revision = REVISION): TLShape {
	return {
		id: 'shape:mockup',
		type: 'local-html-mockup',
		props: {
			documentRef: 'mockup.checkout',
			revision,
			title: 'Checkout',
			selectedTargetRef: 'node.submit',
		},
		meta: {},
	} as unknown as TLShape
}

function harness(selected: TLShape[] = [shape()]) {
	const editor = {
		getSelectedShapes: vi.fn(() => selected),
	} as unknown as Editor
	const schedule = vi.fn()
	const agent = { editor, schedule } as unknown as TldrawAgent
	return {
		schedule,
		inspect: new HtmlMockupInspectActionUtil(agent),
		variant: new HtmlMockupVariantActionUtil(agent),
	}
}

afterEach(() => {
	vi.unstubAllGlobals()
})

describe('Local HTML Mockup agent actions', () => {
	it('inspects one selected opaque component and schedules only compact semantics', async () => {
		const fetchMock = vi.fn(
			async (_input: URL | RequestInfo, _init?: RequestInit) =>
				new Response(
					JSON.stringify({
						documentRef: 'mockup.checkout',
						revision: REVISION,
						title: 'Checkout',
						bytes: 1200,
						contextRef: CONTEXT_REF,
						snapshot: {
							nodes: [
								{
									ref: 'node.submit',
									tag: 'button',
									role: 'button',
									name: 'Submit order',
									text: 'Submit order',
									depth: 1,
									childCount: 0,
									selector: '#submit',
									html: '<button>Submit order</button>',
								},
							],
							target: {
								ref: 'node.submit',
								tag: 'button',
								role: 'button',
								name: 'Submit order',
								depth: 1,
								childCount: 0,
							},
							truncated: false,
						},
						sourcePath: '/private/mockup.html',
					}),
					{ status: 200 },
				),
		)
		vi.stubGlobal('fetch', fetchMock)
		const { inspect, schedule } = harness()

		await inspect.applyAction({
			_type: 'htmlMockupInspect',
			documentRef: 'mockup.checkout',
			targetRef: 'node.submit',
			complete: true,
			time: 0,
		})

		expect(fetchMock).toHaveBeenCalledTimes(1)
		expect(schedule).toHaveBeenCalledTimes(1)
		const result = schedule.mock.calls[0][0]
		expect(result.data[0]).toMatchObject({
			kind: 'local-html-mockup-snapshot',
			documentRef: 'mockup.checkout',
			revision: REVISION,
			target: { ref: 'node.submit', tag: 'button' },
			contextRef: CONTEXT_REF,
			truncated: false,
		})
		const serialized = JSON.stringify(result)
		expect(serialized).not.toContain('#submit')
		expect(serialized).not.toContain('<button')
		expect(serialized).not.toContain('/private/')
	})

	it('does not schedule an inspection result after selection authority changes', async () => {
		let currentSelection = [shape()]
		const editor = {
			getSelectedShapes: vi.fn(() => currentSelection),
		} as unknown as Editor
		const schedule = vi.fn()
		const agent = { editor, schedule } as unknown as TldrawAgent
		const inspect = new HtmlMockupInspectActionUtil(agent)
		let resolveFetch!: (response: Response) => void
		const fetchMock = vi.fn(
			() =>
				new Promise<Response>((resolve) => {
					resolveFetch = resolve
				}),
		)
		vi.stubGlobal('fetch', fetchMock)

		const pending = inspect.applyAction({
			_type: 'htmlMockupInspect',
			documentRef: 'mockup.checkout',
			targetRef: 'node.submit',
			complete: true,
			time: 0,
		})
		await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
		currentSelection = [shape(AFTER_REVISION)]
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
			'selection changed while it was being inspected',
		)
		expect(schedule).not.toHaveBeenCalled()
	})

	it('does not inspect or mutate a target outside the resident picker selection', async () => {
		const fetchMock = vi.fn()
		vi.stubGlobal('fetch', fetchMock)
		const { inspect, variant, schedule } = harness()

		await expect(
			inspect.applyAction({
				_type: 'htmlMockupInspect',
				documentRef: 'mockup.checkout',
				targetRef: 'node.other',
				complete: true,
				time: 0,
			}),
		).rejects.toThrow('does not match the resident picker selection')
		await expect(
			variant.applyAction({
				_type: 'htmlMockupCreateVariant',
				documentRef: 'mockup.checkout',
				targetRef: 'node.other',
				contextRef: 'hc_other',
				expectedRevision: REVISION,
				idempotencyKey: 'variant.checkout.other.1',
				replacementHtml: '<button>Other</button>',
				intent: 'Change an unselected component',
				complete: true,
				time: 0,
			}),
		).rejects.toThrow('does not match the resident picker selection')
		expect(fetchMock).not.toHaveBeenCalled()
		expect(schedule).not.toHaveBeenCalled()
	})

	it('posts one exact revision-guarded variant operation and schedules a compact receipt', async () => {
		const fetchMock = vi.fn(
			async (_input: URL | RequestInfo, _init?: RequestInit) =>
				new Response(
					JSON.stringify({
						receiptId: 'receipt.variant.1',
						status: 'succeeded',
						mode: 'variant',
						documentRef: 'mockup.checkout',
						variantDocumentRef: 'mockup.checkout.variant-1',
						targetRef: 'node.submit',
						beforeRevision: REVISION,
						afterRevision: AFTER_REVISION,
						summary: 'Created a guarded checkout variant.',
						replacementHtml: '<button>must not echo</button>',
						sourcePath: '/private/mockup.html',
					}),
					{ status: 200 },
				),
		)
		vi.stubGlobal('fetch', fetchMock)
		const { variant, schedule } = harness()

		await variant.applyAction({
			_type: 'htmlMockupCreateVariant',
			documentRef: 'mockup.checkout',
			targetRef: 'node.submit',
			contextRef: CONTEXT_REF,
			expectedRevision: REVISION,
			idempotencyKey: 'variant.checkout.submit.1',
			replacementHtml: '<button type="button">Submit safely</button>',
			intent: 'Create an accessible variant',
			complete: true,
			time: 0,
		})

		expect(fetchMock).toHaveBeenCalledTimes(1)
		const [requestUrl, requestInit] = fetchMock.mock.calls[0]
		expect(String(requestUrl)).toBe(
			'http://127.0.0.1:5176/html-mockups/mockup.checkout/patch',
		)
		expect(requestInit?.method).toBe('POST')
		expect(
			new Headers(requestInit?.headers).get(
				'x-tldraw-html-capability',
			),
		).toBe(RESIDENT_CAPABILITY)
		expect(JSON.parse(String(requestInit?.body))).toEqual({
			expectedRevision: REVISION,
			targetRef: 'node.submit',
			contextRef: CONTEXT_REF,
			replacementHtml: '<button type="button">Submit safely</button>',
			mode: 'variant',
			idempotencyKey: 'variant.checkout.submit.1',
		})
		expect(schedule).toHaveBeenCalledWith({
			data: [
				{
					kind: 'local-html-mockup-variant-receipt',
					receiptId: 'receipt.variant.1',
					status: 'succeeded',
					mode: 'variant',
					documentRef: 'mockup.checkout',
					variantDocumentRef: 'mockup.checkout.variant-1',
					targetRef: 'node.submit',
					beforeRevision: REVISION,
					afterRevision: AFTER_REVISION,
					summary: 'Created a guarded checkout variant.',
				},
			],
		})
		expect(JSON.stringify(schedule.mock.calls[0][0])).not.toContain(
			'replacementHtml',
		)
		expect(JSON.stringify(schedule.mock.calls[0][0])).not.toContain('/private/')
	})

	it('fails closed on a stale selected revision without retrying or fetching', async () => {
		const fetchMock = vi.fn()
		vi.stubGlobal('fetch', fetchMock)
		const { variant, schedule } = harness([shape(AFTER_REVISION)])

		await expect(
			variant.applyAction({
				_type: 'htmlMockupCreateVariant',
				documentRef: 'mockup.checkout',
				targetRef: 'node.submit',
				contextRef: CONTEXT_REF,
				expectedRevision: REVISION,
				idempotencyKey: 'variant.checkout.submit.stale',
				replacementHtml: '<button>Variant</button>',
				intent: 'Create a variant',
				complete: true,
				time: 0,
			}),
		).rejects.toThrow('revision changed')
		expect(fetchMock).not.toHaveBeenCalled()
		expect(schedule).not.toHaveBeenCalled()
	})
})

describe('Local HTML Mockup variant receipt validation', () => {
	it('rejects receipts that do not match the exact revision and target', () => {
		expect(() =>
			compactVariantReceipt(
				{
					receiptId: 'receipt.variant.1',
					status: 'succeeded',
					mode: 'variant',
					documentRef: 'mockup.checkout',
					variantDocumentRef: 'mockup.checkout.variant-1',
					targetRef: 'node.other',
					beforeRevision: REVISION,
					afterRevision: AFTER_REVISION,
					summary: 'Created.',
				},
				{
					documentRef: 'mockup.checkout',
					targetRef: 'node.submit',
					expectedRevision: REVISION,
				},
			),
		).toThrow('does not match')
	})

	it.each([
		{
			name: 'the variant ref aliases the source document',
			variantDocumentRef: 'mockup.checkout',
			afterRevision: AFTER_REVISION,
		},
		{
			name: 'the provider reports an unchanged revision',
			variantDocumentRef: 'mockup.checkout.variant-1',
			afterRevision: REVISION,
		},
	])('rejects a succeeded receipt when $name', ({ variantDocumentRef, afterRevision }) => {
		expect(() =>
			compactVariantReceipt(
				{
					receiptId: 'receipt.variant.1',
					status: 'succeeded',
					mode: 'variant',
					documentRef: 'mockup.checkout',
					variantDocumentRef,
					targetRef: 'node.submit',
					beforeRevision: REVISION,
					afterRevision,
					summary: 'Created.',
				},
				{
					documentRef: 'mockup.checkout',
					targetRef: 'node.submit',
					expectedRevision: REVISION,
				},
			),
		).toThrow('does not match')
	})
})
