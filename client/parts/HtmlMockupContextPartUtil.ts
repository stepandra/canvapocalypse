import type { Editor, TLShape } from 'tldraw'
import type {
	HtmlMockupContextPart,
	HtmlMockupNodeSummary,
} from '../../shared/schema/PromptPartDefinitions'
import type { AgentRequest } from '../../shared/types/AgentRequest'
import { fetchHtmlMockupBridge } from '../html-mockup/htmlMockupBridge'
import { PromptPartUtil, registerPromptPartUtil } from './PromptPartUtil'

export const HTML_MOCKUP_BRIDGE_ORIGIN = 'http://127.0.0.1:5176'
export const MAX_HTML_MOCKUP_NODES = 80
export const MAX_HTML_MOCKUP_CHARS = 16 * 1024
const MAX_RESPONSE_CHARS = 64 * 1024
const MAX_NODE_DEPTH = 12
const MAX_NAME_CHARS = 160
const MAX_TEXT_CHARS = 240
const MAX_TITLE_CHARS = 240
const MAX_REF_CHARS = 256
const REVISION_PATTERN = /^sha256:[a-f0-9]{64}$/i
const OPAQUE_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/
const TAG_PATTERN = /^[A-Za-z][A-Za-z0-9-]*$/

type UnknownRecord = Record<string, unknown>

export interface SelectedHtmlMockup {
	shape: TLShape
	shapeId: string
	documentRef: string
	revision: string
	title: string
	selectedTargetRef?: string
	selectedTargetLabel?: string
}

export interface CompactHtmlMockupSnapshot {
	documentRef: string
	revision: string
	title: string
	bytes: number
	nodes: HtmlMockupNodeSummary[]
	target?: HtmlMockupNodeSummary
	contextRef?: string
	truncated: boolean
}

export const HtmlMockupContextPartUtil = registerPromptPartUtil(
	class HtmlMockupContextPartUtil extends PromptPartUtil<HtmlMockupContextPart> {
		static override type = 'htmlMockupContext' as const

		override async getPart(
			request: AgentRequest,
		): Promise<HtmlMockupContextPart> {
			if (
				!request.routing?.enabled ||
				request.routing.route === 'isoflow-edit'
			) {
				return { type: 'htmlMockupContext', mockups: [] }
			}

			const selected = getSelectedHtmlMockup(this.editor)
			const compact = await fetchHtmlMockupSnapshot(
				selected.documentRef,
				selected.revision,
				selected.selectedTargetRef
			)
			const current = getSelectedHtmlMockup(this.editor, selected.documentRef)
			if (
				current.shapeId !== selected.shapeId ||
				current.revision !== selected.revision ||
				current.selectedTargetRef !== selected.selectedTargetRef
			) {
				throw new Error(
					'Local HTML Mockup selection changed while context was being inspected',
				)
			}

			const mockup = {
				shapeId: selected.shapeId,
				documentRef: compact.documentRef,
				revision: compact.revision,
				title: compact.title,
				bytes: compact.bytes,
				...(selected.selectedTargetRef
					? {
							selectedTarget: {
								ref: selected.selectedTargetRef,
								contextRef: compact.contextRef!,
								...(selected.selectedTargetLabel
									? { label: selected.selectedTargetLabel }
									: {}),
							},
						}
					: {}),
				snapshot: {
					nodes: [...compact.nodes],
					...(compact.target ? { target: compact.target } : {}),
					truncated: compact.truncated,
				},
			}
			const part: HtmlMockupContextPart = {
				type: 'htmlMockupContext',
				mockups: [mockup],
			}
			while (
				JSON.stringify(part).length > MAX_HTML_MOCKUP_CHARS &&
				mockup.snapshot.nodes.length > 0
			) {
				mockup.snapshot.nodes.pop()
				mockup.snapshot.truncated = true
			}
			return part
		}
	}
)

export function isHtmlMockupShape(shape: TLShape | null | undefined): boolean {
	return Boolean(readHtmlMockupShape(shape))
}

export function readHtmlMockupShape(
	shape: TLShape | null | undefined,
): SelectedHtmlMockup | null {
	if (!shape || shape.type !== 'local-html-mockup') return null

	const props = asRecord(shape.props)
	const meta = asRecord(shape.meta)
	const nestedMeta =
		asRecord(meta?.htmlMockup) ?? asRecord(meta?.localHtmlMockup)
	const sources = [props, nestedMeta, meta]
	const documentRef = readOpaqueRef(sources, 'documentRef')
	const revision = readRevision(sources, 'revision')
	if (!documentRef || !revision) return null

	const selectedTargetRef = readOpaqueRef(sources, 'selectedTargetRef')
	const selectedTargetLabel = selectedTargetRef
		? readCompactString(sources, 'selectedTargetLabel', MAX_NAME_CHARS)
		: undefined

	return {
		shape,
		shapeId: shape.id,
		documentRef,
		revision,
		title:
			readCompactString(sources, 'title', MAX_TITLE_CHARS) ??
			'Local HTML Mockup',
		...(selectedTargetRef ? { selectedTargetRef } : {}),
		...(selectedTargetLabel ? { selectedTargetLabel } : {}),
	}
}

export function getSelectedHtmlMockup(
	editor: Editor,
	expectedDocumentRef?: string,
): SelectedHtmlMockup {
	const selectedShapes = editor.getSelectedShapes()
	if (
		selectedShapes.length !== 1 ||
		selectedShapes[0].type !== 'local-html-mockup'
	) {
		throw new Error(
			'Select exactly one Local HTML Mockup before using HTML capabilities',
		)
	}

	const selected = readHtmlMockupShape(selectedShapes[0])
	if (!selected) {
		throw new Error(
			'Selected Local HTML Mockup is missing a valid opaque documentRef or sha256 revision',
		)
	}
	if (expectedDocumentRef && selected.documentRef !== expectedDocumentRef) {
		throw new Error(
			'Requested Local HTML Mockup does not match the selected documentRef',
		)
	}
	return selected
}

export async function fetchHtmlMockupSnapshot(
	documentRef: string,
	expectedRevision: string,
	targetRef?: string,
): Promise<CompactHtmlMockupSnapshot> {
	assertOpaqueRef(documentRef, 'documentRef')
	assertRevision(expectedRevision)
	if (targetRef) assertOpaqueRef(targetRef, 'targetRef')

	const url = new URL(
		`/html-mockups/${encodeURIComponent(documentRef)}/snapshot`,
		HTML_MOCKUP_BRIDGE_ORIGIN,
	)
	url.searchParams.set('maxNodes', String(MAX_HTML_MOCKUP_NODES))
	url.searchParams.set('maxChars', String(MAX_HTML_MOCKUP_CHARS))
	if (targetRef) {
		url.searchParams.set('targetRef', targetRef)
	}

	const response = await fetchHtmlMockupBridge(url, {
		method: 'GET',
		headers: { Accept: 'application/json' },
	})
	if (!response.ok) {
		throw new Error(
			`Local HTML Mockup bridge returned status ${response.status}`,
		)
	}
	const body = await readBoundedHtmlMockupJsonResponse(response)
	return compactHtmlMockupSnapshot(body, {
		documentRef,
		expectedRevision,
		targetRef,
	})
}

export function compactHtmlMockupSnapshot(
	value: unknown,
	expected: {
		documentRef: string
		expectedRevision: string
		targetRef?: string
	},
): CompactHtmlMockupSnapshot {
	const root = asRecord(value)
	if (!root) throw new Error('Local HTML Mockup snapshot must be an object')
	const snapshot = asRecord(root.snapshot) ?? root

	const documentRef = compactOpaqueRef(root.documentRef)
	const revision = compactRevision(root.revision)
	if (!documentRef || documentRef !== expected.documentRef) {
		throw new Error('Local HTML Mockup snapshot documentRef mismatch')
	}
	if (!revision || revision !== expected.expectedRevision) {
		throw new Error('Local HTML Mockup snapshot revision mismatch')
	}

	const title =
		compactString(root.title, MAX_TITLE_CHARS) ?? 'Local HTML Mockup'
	const bytes = compactNonNegativeInteger(root.bytes)
	if (bytes === null)
		throw new Error('Local HTML Mockup snapshot bytes must be non-negative')

	const rawNodes = snapshot.nodes
	if (!Array.isArray(rawNodes)) {
		throw new Error('Local HTML Mockup snapshot nodes must be an array')
	}

	const target = expected.targetRef ? compactNode(snapshot.target) : undefined
	if (expected.targetRef && (!target || target.ref !== expected.targetRef)) {
		throw new Error('Local HTML Mockup snapshot targetRef mismatch')
	}
	const contextRef = expected.targetRef
		? compactOpaqueRef(root.contextRef)
		: undefined
	if (expected.targetRef && !contextRef) {
		throw new Error('Local HTML Mockup snapshot contextRef is missing')
	}

	const base: Omit<CompactHtmlMockupSnapshot, 'nodes' | 'truncated'> = {
		documentRef,
		revision,
		title,
		bytes,
		...(target ? { target } : {}),
		...(contextRef ? { contextRef } : {}),
	}
	const nodes: HtmlMockupNodeSummary[] = []
	let clientTruncated = rawNodes.length > MAX_HTML_MOCKUP_NODES

	for (const rawNode of rawNodes) {
		if (nodes.length >= MAX_HTML_MOCKUP_NODES) {
			clientTruncated = true
			break
		}
		const node = compactNode(rawNode)
		if (!node || node.depth > MAX_NODE_DEPTH) {
			clientTruncated = true
			continue
		}
		const next = [...nodes, node]
		if (
			JSON.stringify({
				...base,
				nodes: next,
				truncated: true,
			}).length > MAX_HTML_MOCKUP_CHARS
		) {
			clientTruncated = true
			break
		}
		nodes.push(node)
	}

	return {
		...base,
		nodes,
		truncated: snapshot.truncated === true || clientTruncated,
	}
}

export function assertOpaqueRef(value: string, label: string): void {
	if (
		value.length === 0 ||
		value.length > MAX_REF_CHARS ||
		!OPAQUE_REF_PATTERN.test(value)
	) {
		throw new Error(`${label} must be an opaque Local HTML Mockup reference`)
	}
}

export function assertRevision(value: string): void {
	if (!REVISION_PATTERN.test(value)) {
		throw new Error('revision must be a sha256 Local HTML Mockup revision')
	}
}

export async function readBoundedHtmlMockupJsonResponse(
	response: Response,
): Promise<unknown> {
	const text = await response.text()
	if (text.length > MAX_RESPONSE_CHARS) {
		throw new Error(
			'Local HTML Mockup bridge response exceeds the client limit',
		)
	}
	try {
		return JSON.parse(text) as unknown
	} catch {
		throw new Error('Local HTML Mockup bridge returned invalid JSON')
	}
}

function compactNode(value: unknown): HtmlMockupNodeSummary | undefined {
	const source = asRecord(value)
	if (!source) return undefined
	const ref = compactOpaqueRef(source.ref)
	const tag = compactTag(source.tag)
	const depth = compactNonNegativeInteger(source.depth)
	const childCount = compactNonNegativeInteger(source.childCount)
	if (!ref || !tag || depth === null || childCount === null) return undefined

	const parentRef = compactOpaqueRef(source.parentRef)
	const role = compactString(source.role, 64)
	const name = compactString(source.name, MAX_NAME_CHARS)
	const text = compactString(source.text, MAX_TEXT_CHARS)
	return {
		ref,
		...(parentRef ? { parentRef } : {}),
		tag,
		...(role ? { role } : {}),
		...(name ? { name } : {}),
		...(text ? { text } : {}),
		depth,
		childCount: Math.min(childCount, 9999),
	}
}

function readOpaqueRef(
	sources: Array<UnknownRecord | null>,
	key: string,
): string | undefined {
	for (const source of sources) {
		const value = compactOpaqueRef(source?.[key])
		if (value) return value
	}
	return undefined
}

function readRevision(
	sources: Array<UnknownRecord | null>,
	key: string,
): string | undefined {
	for (const source of sources) {
		const value = compactRevision(source?.[key])
		if (value) return value
	}
	return undefined
}

function readCompactString(
	sources: Array<UnknownRecord | null>,
	key: string,
	maxLength: number,
): string | undefined {
	for (const source of sources) {
		const value = compactString(source?.[key], maxLength)
		if (value) return value
	}
	return undefined
}

function compactOpaqueRef(value: unknown): string | undefined {
	if (typeof value !== 'string') return undefined
	const compact = value.trim()
	if (
		compact.length === 0 ||
		compact.length > MAX_REF_CHARS ||
		!OPAQUE_REF_PATTERN.test(compact)
	) {
		return undefined
	}
	return compact
}

function compactRevision(value: unknown): string | undefined {
	if (typeof value !== 'string') return undefined
	const compact = value.trim()
	return REVISION_PATTERN.test(compact) ? compact : undefined
}

function compactTag(value: unknown): string | undefined {
	if (typeof value !== 'string') return undefined
	const compact = value.trim().toLowerCase()
	return compact.length <= 64 && TAG_PATTERN.test(compact) ? compact : undefined
}

function compactString(value: unknown, maxLength: number): string | undefined {
	if (typeof value !== 'string') return undefined
	const compact = value.replace(/\s+/g, ' ').trim()
	return compact ? compact.slice(0, maxLength) : undefined
}

function compactNonNegativeInteger(value: unknown): number | null {
	return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
		? value
		: null
}

function asRecord(value: unknown): UnknownRecord | null {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as UnknownRecord)
		: null
}
