import type { HtmlMockupCreateVariantAction } from '../../shared/schema/AgentActionSchemas'
import type { Streaming } from '../../shared/types/Streaming'
import { fetchHtmlMockupBridge } from '../html-mockup/htmlMockupBridge'
import {
	assertOpaqueRef,
	assertRevision,
	getSelectedHtmlMockup,
	HTML_MOCKUP_BRIDGE_ORIGIN,
	readBoundedHtmlMockupJsonResponse,
} from '../parts/HtmlMockupContextPartUtil'
import { AgentActionUtil, registerActionUtil } from './AgentActionUtil'

interface HtmlMockupVariantReceipt {
	receiptId: string
	status: 'succeeded'
	mode: 'variant'
	documentRef: string
	variantDocumentRef: string
	targetRef: string
	beforeRevision: string
	afterRevision: string
	summary: string
}

type UnknownRecord = Record<string, unknown>

export const HtmlMockupVariantActionUtil = registerActionUtil(
	class HtmlMockupVariantActionUtil extends AgentActionUtil<HtmlMockupCreateVariantAction> {
		static override type = 'htmlMockupCreateVariant' as const

		override getInfo(action: Streaming<HtmlMockupCreateVariantAction>) {
			return {
				icon: 'pencil' as const,
				description: action.complete
					? `Created Local HTML Mockup variant: ${action.intent}`
					: 'Creating Local HTML Mockup variant',
			}
		}

		override async applyAction(
			action: Streaming<HtmlMockupCreateVariantAction>,
		) {
			if (!action.complete) return
			const selected = getSelectedHtmlMockup(this.editor, action.documentRef)
			if (selected.revision !== action.expectedRevision) {
				throw new Error(
					'Local HTML Mockup revision changed; inspect again before creating a variant',
				)
			}
			if (
				!selected.selectedTargetRef ||
				selected.selectedTargetRef !== action.targetRef
			) {
				throw new Error(
					'Local HTML Mockup variant target does not match the resident picker selection',
				)
			}
			assertOpaqueRef(action.targetRef, 'targetRef')
			assertRevision(action.expectedRevision)

			const response = await fetchHtmlMockupBridge(
				new URL(
					`/html-mockups/${encodeURIComponent(selected.documentRef)}/patch`,
					HTML_MOCKUP_BRIDGE_ORIGIN,
				),
				{
					method: 'POST',
					headers: {
						Accept: 'application/json',
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({
						expectedRevision: action.expectedRevision,
						targetRef: action.targetRef,
						contextRef: action.contextRef,
						replacementHtml: action.replacementHtml,
						mode: 'variant',
						idempotencyKey: action.idempotencyKey,
					}),
				},
			)
			if (!response.ok) {
				throw new Error(
					`Local HTML Mockup bridge returned status ${response.status}`,
				)
			}
			const receipt = compactVariantReceipt(
				await readBoundedHtmlMockupJsonResponse(response),
				{
					documentRef: selected.documentRef,
					targetRef: action.targetRef,
					expectedRevision: action.expectedRevision,
				},
			)
			this.agent.schedule({
				data: [{ kind: 'local-html-mockup-variant-receipt', ...receipt }],
			})
		}
	},
)

export function compactVariantReceipt(
	value: unknown,
	expected: {
		documentRef: string
		targetRef: string
		expectedRevision: string
	},
): HtmlMockupVariantReceipt {
	const source = asRecord(value)
	if (!source)
		throw new Error('Local HTML Mockup variant receipt must be an object')
	const receiptId = compactOpaqueRef(source.receiptId, 'receiptId')
	const documentRef = compactOpaqueRef(source.documentRef, 'documentRef')
	const variantDocumentRef = compactOpaqueRef(
		source.variantDocumentRef,
		'variantDocumentRef',
	)
	const targetRef = compactOpaqueRef(source.targetRef, 'targetRef')
	const beforeRevision = compactRevision(
		source.beforeRevision,
		'beforeRevision',
	)
	const afterRevision = compactRevision(source.afterRevision, 'afterRevision')
	if (source.status !== 'succeeded' || source.mode !== 'variant') {
		throw new Error(
			'Local HTML Mockup variant receipt is not a succeeded variant',
		)
	}
	if (
		documentRef !== expected.documentRef ||
		targetRef !== expected.targetRef ||
		beforeRevision !== expected.expectedRevision ||
		variantDocumentRef === documentRef ||
		afterRevision === beforeRevision
	) {
		throw new Error(
			'Local HTML Mockup variant receipt does not match the request',
		)
	}
	const summary =
		typeof source.summary === 'string'
			? source.summary.replace(/\s+/g, ' ').trim().slice(0, 512)
			: ''
	if (!summary)
		throw new Error('Local HTML Mockup variant receipt summary is missing')

	return {
		receiptId,
		status: 'succeeded',
		mode: 'variant',
		documentRef,
		variantDocumentRef,
		targetRef,
		beforeRevision,
		afterRevision,
		summary,
	}
}

function compactOpaqueRef(value: unknown, label: string): string {
	if (typeof value !== 'string') {
		throw new Error(`Local HTML Mockup variant receipt ${label} is invalid`)
	}
	const compact = value.trim()
	assertOpaqueRef(compact, label)
	return compact
}

function compactRevision(value: unknown, label: string): string {
	if (typeof value !== 'string') {
		throw new Error(`Local HTML Mockup variant receipt ${label} is invalid`)
	}
	const compact = value.trim()
	try {
		assertRevision(compact)
	} catch {
		throw new Error(`Local HTML Mockup variant receipt ${label} is invalid`)
	}
	return compact
}

function asRecord(value: unknown): UnknownRecord | null {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as UnknownRecord)
		: null
}
