export const HTML_MOCKUP_ORIGIN = 'http://127.0.0.1:5176' as const
export const HTML_MOCKUP_SELECTION_MESSAGE = 'html-mockup:selection' as const
export const HTML_MOCKUP_OFFLINE_PARENT_ORIGIN = 'file://' as const
export const HTML_MOCKUP_RESIDENT_CAPABILITY_HEADER =
	'x-tldraw-html-capability' as const

const HTML_MOCKUP_BROWSER_PARENT_ORIGINS = new Set([
	'http://127.0.0.1:5173',
	'http://localhost:5173',
	'http://127.0.0.1:5175',
	'http://localhost:5175',
])

const MAX_DOCUMENT_REF_CHARS = 180
const MAX_REVISION_CHARS = 96
const MAX_TITLE_CHARS = 160
const MAX_TARGET_REF_CHARS = 240
const MAX_TARGET_LABEL_CHARS = 160
const REVISION_PATTERN = /^sha256:[a-f0-9]{64}$/i
const RESIDENT_CAPABILITY_PATTERN = /^hr_[A-Za-z0-9_-]{43,128}$/
const PREVIEW_TICKET_PATTERN = /^hp_[A-Za-z0-9_-]{24,128}$/

let residentCapability: string | null = null
let residentCapabilityBootstrap: Promise<string> | null = null

export interface HtmlMockupDocumentSummary {
	documentRef: string
	title: string
	revision: string
	truncated: boolean
	targetCount?: number
}

export interface HtmlMockupSnapshotSummary extends HtmlMockupDocumentSummary {
	summary?: string
}

export interface HtmlMockupSelection {
	documentRef: string
	revision: string
	targetRef: string
	label: string
}

interface HtmlMockupPreviewTicket {
	ticket: string
	documentRef: string
	revision: string
	parentOrigin: string
	expiresAt: string
}

type MessageLike = Pick<MessageEvent<unknown>, 'data' | 'origin' | 'source'>

export function assertHtmlMockupOrigin(
	value: string = HTML_MOCKUP_ORIGIN
): typeof HTML_MOCKUP_ORIGIN {
	let parsed: URL
	try {
		parsed = new URL(value)
	} catch {
		throw new Error('Invalid Local HTML Mockup bridge origin')
	}
	if (
		parsed.origin !== HTML_MOCKUP_ORIGIN ||
		parsed.pathname !== '/' ||
		parsed.search ||
		parsed.hash ||
		parsed.username ||
		parsed.password
	) {
		throw new Error('Local HTML Mockup bridge origin is not allowlisted')
	}
	return HTML_MOCKUP_ORIGIN
}

export async function listHtmlMockupDocuments(
	signal?: AbortSignal
): Promise<HtmlMockupDocumentSummary[]> {
	const payload = await requestJson('/html-mockups', signal)
	const documents = Array.isArray(payload)
		? payload
		: isRecord(payload) && Array.isArray(payload.documents)
			? payload.documents
			: isRecord(payload) && Array.isArray(payload.items)
				? payload.items
				: null
	if (!documents) throw new Error('Invalid Local HTML Mockup document list')
	return documents.map((document) => normalizeDocumentSummary(document))
}

export async function getHtmlMockupSnapshot(
	documentRef: string,
	signal?: AbortSignal
): Promise<HtmlMockupSnapshotSummary> {
	const safeRef = normalizeBoundedString(
		documentRef,
		'documentRef',
		MAX_DOCUMENT_REF_CHARS
	)
	const payload = await requestJson(
		`/html-mockups/${encodeURIComponent(safeRef)}/snapshot`,
		signal
	)
	const normalized = normalizeDocumentSummary(payload, safeRef)
	const summary =
		isRecord(payload) && typeof payload.summary === 'string'
			? clampText(payload.summary, 600)
			: undefined
	return summary ? { ...normalized, summary } : normalized
}

export async function importHtmlMockupDocument(
	input: { name: string; content: string },
	signal?: AbortSignal
): Promise<HtmlMockupDocumentSummary> {
	const name = clampText(input.name, MAX_TITLE_CHARS)
	if (!name || typeof input.content !== 'string') {
		throw new Error('Invalid Local HTML Mockup import')
	}
	const payload = await requestJson('/html-mockups/import', signal, {
		method: 'POST',
		body: JSON.stringify({ name, content: input.content }),
		headers: {
			accept: 'application/json',
			'content-type': 'application/json',
		},
	})
	return normalizeDocumentSummary(
		isRecord(payload) && isRecord(payload.document) ? payload.document : payload
	)
}

export async function issueHtmlMockupPreviewUrl(
	documentRef: string,
	revision: string,
	signal?: AbortSignal
): Promise<string> {
	const safeRef = normalizeBoundedString(
		documentRef,
		'documentRef',
		MAX_DOCUMENT_REF_CHARS
	)
	const safeRevision = normalizeRevision(revision)
	const expectedParentOrigin = getHtmlMockupParentOrigin()
	const payload = await requestJson(
		`/html-mockups/${encodeURIComponent(safeRef)}/preview-ticket`,
		signal,
		{
			method: 'POST',
			body: JSON.stringify({
				revision: safeRevision,
			}),
			headers: {
				accept: 'application/json',
				'content-type': 'application/json',
			},
		}
	)
	const ticket = normalizePreviewTicket(payload, {
		documentRef: safeRef,
		revision: safeRevision,
		parentOrigin: expectedParentOrigin,
	})
	const url = new URL(
		`/html-mockups/${encodeURIComponent(safeRef)}/preview`,
		assertHtmlMockupOrigin()
	)
	url.searchParams.set('revision', safeRevision)
	url.searchParams.set('ticket', ticket.ticket)
	return url.toString()
}

export function installHtmlMockupResidentCapability(value: string): void {
	residentCapability = normalizeResidentCapability(value)
	residentCapabilityBootstrap = null
}

export function getHtmlMockupParentOrigin(): string {
	if (typeof location === 'undefined') return 'http://127.0.0.1:5173'
	if (location.protocol === 'file:') return HTML_MOCKUP_OFFLINE_PARENT_ORIGIN
	return normalizeHtmlMockupParentOrigin(location.origin)
}

export function normalizeHtmlMockupParentOrigin(value: string): string {
	if (value === HTML_MOCKUP_OFFLINE_PARENT_ORIGIN) return value
	if (!HTML_MOCKUP_BROWSER_PARENT_ORIGINS.has(value)) {
		throw new Error('Local HTML Mockup parent origin is not allowlisted')
	}
	return value
}

export function parseHtmlMockupSelectionMessage(
	event: MessageLike,
	expected: {
		documentRef: string
		revision: string
		source: MessageEventSource
	}
): HtmlMockupSelection | null {
	// `sandbox="allow-scripts"` intentionally omits `allow-same-origin`, so a
	// preview's postMessage origin is opaque (`null`). In that case the exact
	// iframe WindowProxy is the authority boundary. Never accept an opaque
	// sender when the caller did not provide that source.
	if (event.source !== expected.source) return null
	const isOpaqueSandboxOrigin = event.origin === 'null'
	if (!isOpaqueSandboxOrigin && event.origin !== HTML_MOCKUP_ORIGIN) return null
	if (
		!isRecord(event.data) ||
		event.data.type !== HTML_MOCKUP_SELECTION_MESSAGE ||
		event.data.phase !== 'click'
	) {
		return null
	}

	try {
		const documentRef = normalizeBoundedString(
			event.data.documentRef,
			'documentRef',
			MAX_DOCUMENT_REF_CHARS
		)
		const revision = normalizeRevision(event.data.revision)
		if (
			documentRef !== expected.documentRef ||
			revision !== String(expected.revision)
		) {
			return null
		}
		const targetRef = normalizeBoundedString(
			event.data.targetRef,
			'targetRef',
			MAX_TARGET_REF_CHARS
		)
		const label =
			typeof event.data.summary === 'string'
				? clampText(event.data.summary, MAX_TARGET_LABEL_CHARS)
				: targetRef
		return { documentRef, revision, targetRef, label: label || targetRef }
	} catch {
		return null
	}
}

export async function fetchHtmlMockupBridge(
	input: string | URL,
	init: RequestInit = {}
): Promise<Response> {
	const bridgeOrigin = assertHtmlMockupOrigin()
	const destination = new URL(String(input), bridgeOrigin)
	if (
		destination.origin !== bridgeOrigin ||
		destination.username ||
		destination.password
	) {
		throw new Error('Local HTML Mockup bridge request is not allowlisted')
	}
	const capability = await getHtmlMockupResidentCapability(init.signal)
	const headers = new Headers(init.headers)
	headers.set(HTML_MOCKUP_RESIDENT_CAPABILITY_HEADER, capability)
	return fetch(destination, {
		...init,
		headers,
		credentials: 'omit',
		cache: 'no-store',
		referrerPolicy: 'no-referrer',
	})
}

async function requestJson(
	pathname: string,
	signal?: AbortSignal,
	init: Pick<RequestInit, 'method' | 'body' | 'headers'> = {}
): Promise<unknown> {
	const response = await fetchHtmlMockupBridge(pathname, {
		method: init.method ?? 'GET',
		headers: init.headers ?? { accept: 'application/json' },
		body: init.body,
		signal,
	})
	if (!response.ok) {
		throw new Error(`Local HTML Mockup bridge returned HTTP ${response.status}`)
	}
	return response.json()
}

async function getHtmlMockupResidentCapability(
	signal?: AbortSignal | null
): Promise<string> {
	if (residentCapability) return residentCapability
	if (getHtmlMockupParentOrigin() === HTML_MOCKUP_OFFLINE_PARENT_ORIGIN) {
		throw new Error(
			'Local HTML Mockup resident capability was not provisioned by the Offline host'
		)
	}
	residentCapabilityBootstrap ??= bootstrapHtmlMockupResidentCapability()
	try {
		const capability = await abortable(
			residentCapabilityBootstrap,
			signal ?? undefined
		)
		residentCapability = capability
		return capability
	} catch (error) {
		residentCapabilityBootstrap = null
		throw error
	}
}

async function bootstrapHtmlMockupResidentCapability(): Promise<string> {
	const response = await fetch(
		new URL('/html-mockups/session', assertHtmlMockupOrigin()),
		{
			method: 'POST',
			headers: { accept: 'application/json' },
			credentials: 'omit',
			cache: 'no-store',
			referrerPolicy: 'no-referrer',
		}
	)
	if (!response.ok) {
		throw new Error(
			`Local HTML Mockup capability bootstrap returned HTTP ${response.status}`
		)
	}
	const payload: unknown = await response.json()
	if (!isRecord(payload)) {
		throw new Error('Invalid Local HTML Mockup capability bootstrap')
	}
	return normalizeResidentCapability(payload.capability)
}

function normalizeResidentCapability(value: unknown): string {
	if (
		typeof value !== 'string' ||
		!RESIDENT_CAPABILITY_PATTERN.test(value)
	) {
		throw new Error('Invalid Local HTML Mockup resident capability')
	}
	return value
}

function normalizePreviewTicket(
	value: unknown,
	expected: {
		documentRef: string
		revision: string
		parentOrigin: string
	}
): HtmlMockupPreviewTicket {
	if (!isRecord(value)) {
		throw new Error('Invalid Local HTML Mockup preview ticket')
	}
	const ticket =
		typeof value.ticket === 'string' && PREVIEW_TICKET_PATTERN.test(value.ticket)
			? value.ticket
			: ''
	const documentRef = normalizeBoundedString(
		value.documentRef,
		'documentRef',
		MAX_DOCUMENT_REF_CHARS
	)
	const revision = normalizeRevision(value.revision)
	const parentOrigin = normalizeHtmlMockupParentOrigin(
		String(value.parentOrigin ?? '')
	)
	const expiresAt =
		typeof value.expiresAt === 'string' &&
		Number.isFinite(Date.parse(value.expiresAt))
			? value.expiresAt
			: ''
	if (
		!ticket ||
		!expiresAt ||
		documentRef !== expected.documentRef ||
		revision !== expected.revision ||
		parentOrigin !== expected.parentOrigin
	) {
		throw new Error('Invalid Local HTML Mockup preview ticket')
	}
	return { ticket, documentRef, revision, parentOrigin, expiresAt }
}

function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
	if (!signal) return promise
	if (signal.aborted) {
		return Promise.reject(signal.reason ?? new DOMException('Aborted', 'AbortError'))
	}
	return new Promise<T>((resolve, reject) => {
		const onAbort = () =>
			reject(signal.reason ?? new DOMException('Aborted', 'AbortError'))
		signal.addEventListener('abort', onAbort, { once: true })
		promise.then(
			(value) => {
				signal.removeEventListener('abort', onAbort)
				resolve(value)
			},
			(error) => {
				signal.removeEventListener('abort', onAbort)
				reject(error)
			}
		)
	})
}

function normalizeDocumentSummary(
	value: unknown,
	fallbackDocumentRef?: string
): HtmlMockupDocumentSummary {
	if (!isRecord(value)) throw new Error('Invalid Local HTML Mockup document')
	const documentRef = normalizeBoundedString(
		value.documentRef ?? value.ref ?? fallbackDocumentRef,
		'documentRef',
		MAX_DOCUMENT_REF_CHARS
	)
	const title = clampText(
		typeof value.title === 'string'
			? value.title
			: typeof value.name === 'string'
				? value.name
				: documentRef,
		MAX_TITLE_CHARS
	)
	const revision =
		value.revision === undefined
			? 'unresolved'
			: normalizeRevision(value.revision)
	const targetCount =
		typeof value.targetCount === 'number' &&
		Number.isSafeInteger(value.targetCount) &&
		value.targetCount >= 0
			? value.targetCount
			: Array.isArray(value.nodes)
				? value.nodes.length
			: undefined
	return {
		documentRef,
		title: title || documentRef,
		revision,
		truncated: value.truncated === true,
		...(targetCount === undefined ? {} : { targetCount }),
	}
}

function normalizeBoundedString(
	value: unknown,
	field: string,
	maxChars: number
): string {
	if (typeof value !== 'string') throw new Error(`Invalid ${field}`)
	const normalized = value.trim()
	if (!normalized || normalized.length > maxChars || /[\u0000-\u001f\u007f]/.test(normalized)) {
		throw new Error(`Invalid ${field}`)
	}
	return normalized
}

function normalizeRevision(value: unknown) {
	const revision = normalizeBoundedString(value, 'revision', MAX_REVISION_CHARS)
	if (!REVISION_PATTERN.test(revision)) throw new Error('Invalid revision')
	return revision.toLowerCase()
}

function clampText(value: string, maxChars: number) {
	const normalized = value.replace(/\s+/g, ' ').trim()
	return normalized.length <= maxChars
		? normalized
		: `${normalized.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value)
}
