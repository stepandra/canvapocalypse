import type { DesignSystemProjection } from '../../shared/types/DesignSystem'
import type {
	StitchCreateProjectRequest,
	StitchDeviceType,
	StitchEditRequest,
	StitchGenerateRequest,
	StitchOperationReceipt,
	StitchProjectSummary,
	StitchScreenSummary,
	StitchStatus,
} from '../../shared/types/Stitch'
import {
	fetchHtmlMockupBridge,
	HtmlMockupDocumentSummary,
} from '../html-mockup/htmlMockupBridge'

const PROJECT_REF_PATTERN = /^stp_[A-Za-z0-9_-]{22,64}$/
const SCREEN_REF_PATTERN = /^sts_[A-Za-z0-9_-]{22,64}$/
const DOCUMENT_REF_PATTERN = /^hd_[A-Za-z0-9_-]{20}$/
const REVISION_PATTERN = /^sha256:[a-f0-9]{64}$/i
const RECEIPT_REF_PATTERN = /^str_[A-Za-z0-9_-]{22}$/
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/
const DEVICE_TYPES = new Set<StitchDeviceType>([
	'MOBILE',
	'DESKTOP',
	'TABLET',
	'AGNOSTIC',
])
const FORBIDDEN_RESPONSE_KEYS = new Set([
	'apiKey',
	'accessToken',
	'providerId',
	'downloadUrl',
	'html',
	'rawHtml',
	'url',
])

export interface StitchArtifactResult {
	receipt: StitchOperationReceipt
	project: StitchProjectSummary
	screen: StitchScreenSummary
	document: HtmlMockupDocumentSummary
}

export async function getStitchStatus(
	signal?: AbortSignal
): Promise<StitchStatus> {
	const payload = await requestJson('/stitch/status', { signal })
	const record = asRecord(payload)
	if (
		!record ||
		typeof record.configured !== 'boolean' ||
		!['api-key', 'oauth', 'missing'].includes(String(record.authMode)) ||
		record.provider !== 'google-stitch' ||
		record.surface !== 'native-tldraw'
	) {
		throw new Error('Invalid Stitch status response')
	}
	return {
		configured: record.configured,
		authMode: record.authMode as StitchStatus['authMode'],
		provider: 'google-stitch',
		surface: 'native-tldraw',
	}
}

export async function listStitchProjects(
	signal?: AbortSignal
): Promise<StitchProjectSummary[]> {
	const payload = await requestJson('/stitch/projects', { signal })
	const record = asRecord(payload)
	if (!record || !Array.isArray(record.projects)) {
		throw new Error('Invalid Stitch project list')
	}
	return record.projects.slice(0, 100).map(normalizeProject)
}

export async function createStitchProject(
	input: StitchCreateProjectRequest,
	signal?: AbortSignal
): Promise<{
	receipt: StitchOperationReceipt
	project: StitchProjectSummary
}> {
	const payload = await requestJson('/stitch/projects', {
		method: 'POST',
		body: JSON.stringify({
			title: boundedText(input.title, 'title', 160),
			idempotencyKey: normalizeIdempotencyKey(input.idempotencyKey),
		}),
		signal,
	})
	rejectProviderPayload(payload)
	const record = asRecord(payload)
	if (!record) throw new Error('Invalid Stitch project response')
	return {
		receipt: normalizeReceipt(record.receipt, 'create-project'),
		project: normalizeProject(record.project),
	}
}

export async function listStitchScreens(
	projectRef: string,
	signal?: AbortSignal
): Promise<StitchScreenSummary[]> {
	const safeRef = normalizeProjectRef(projectRef)
	const payload = await requestJson(
		`/stitch/projects/${encodeURIComponent(safeRef)}/screens`,
		{ signal }
	)
	const record = asRecord(payload)
	if (!record || !Array.isArray(record.screens)) {
		throw new Error('Invalid Stitch screen list')
	}
	return record.screens
		.slice(0, 100)
		.map((screen) => normalizeScreen(screen, safeRef))
}

export async function generateStitchScreen(
	input: StitchGenerateRequest,
	signal?: AbortSignal
): Promise<StitchArtifactResult> {
	const projectRef = normalizeProjectRef(input.projectRef)
	const payload = await requestJson(
		`/stitch/projects/${encodeURIComponent(projectRef)}/screens`,
		{
			method: 'POST',
			body: JSON.stringify(normalizeScreenOperation(input)),
			signal,
		}
	)
	return normalizeArtifactResult(payload, 'generate', projectRef)
}

export async function editStitchScreen(
	input: StitchEditRequest,
	signal?: AbortSignal
): Promise<StitchArtifactResult> {
	const screenRef = normalizeScreenRef(input.screenRef)
	const payload = await requestJson(
		`/stitch/screens/${encodeURIComponent(screenRef)}/edits`,
		{
			method: 'POST',
			body: JSON.stringify({
				...normalizeScreenOperation(input),
				expectedRevision: normalizeRevision(input.expectedRevision),
			}),
			signal,
		}
	)
	return normalizeArtifactResult(payload, 'edit')
}

function normalizeScreenOperation(input: {
	prompt: string
	deviceType: StitchDeviceType
	idempotencyKey: string
	designSystem?: DesignSystemProjection
}) {
	if (!DEVICE_TYPES.has(input.deviceType)) {
		throw new Error('Invalid Stitch device type')
	}
	const designSystem = input.designSystem
		? normalizeDesignSystemProjection(input.designSystem)
		: undefined
	return {
		prompt: boundedText(input.prompt, 'prompt', 12_000),
		deviceType: input.deviceType,
		idempotencyKey: normalizeIdempotencyKey(input.idempotencyKey),
		...(designSystem ? { designSystem } : {}),
	}
}

function normalizeArtifactResult(
	value: unknown,
	operation: 'generate' | 'edit',
	expectedProjectRef?: string
): StitchArtifactResult {
	rejectProviderPayload(value)
	const record = asRecord(value)
	if (!record) throw new Error('Invalid Stitch artifact response')
	const project = normalizeProject(record.project)
	if (expectedProjectRef && project.projectRef !== expectedProjectRef) {
		throw new Error('Stitch project reference mismatch')
	}
	const screen = normalizeScreen(record.screen, project.projectRef)
	return {
		receipt: normalizeReceipt(record.receipt, operation),
		project,
		screen,
		document: normalizeDocument(record.document),
	}
}

function normalizeProject(value: unknown): StitchProjectSummary {
	const record = asRecord(value)
	if (!record) throw new Error('Invalid Stitch project')
	return {
		projectRef: normalizeProjectRef(record.projectRef),
		title: boundedText(record.title, 'title', 160),
	}
}

function normalizeScreen(
	value: unknown,
	expectedProjectRef?: string
): StitchScreenSummary {
	const record = asRecord(value)
	if (!record) throw new Error('Invalid Stitch screen')
	const projectRef = normalizeProjectRef(record.projectRef)
	if (expectedProjectRef && projectRef !== expectedProjectRef) {
		throw new Error('Stitch screen project mismatch')
	}
	const documentRef =
		typeof record.documentRef === 'string'
			? normalizeDocumentRef(record.documentRef)
			: undefined
	const localRevision =
		typeof record.localRevision === 'string'
			? normalizeRevision(record.localRevision)
			: undefined
	return {
		screenRef: normalizeScreenRef(record.screenRef),
		projectRef,
		title: boundedText(record.title, 'title', 160),
		...(documentRef ? { documentRef } : {}),
		...(localRevision ? { localRevision } : {}),
	}
}

function normalizeDocument(value: unknown): HtmlMockupDocumentSummary {
	const record = asRecord(value)
	if (!record) throw new Error('Invalid Stitch HTML document')
	return {
		documentRef: normalizeDocumentRef(record.documentRef),
		title: boundedText(record.title, 'title', 160),
		revision: normalizeRevision(record.revision),
		truncated: record.truncated === true,
		...(Number.isSafeInteger(record.targetCount) &&
		Number(record.targetCount) >= 0
			? { targetCount: Number(record.targetCount) }
			: {}),
	}
}

function normalizeReceipt(
	value: unknown,
	expectedOperation: StitchOperationReceipt['operation']
): StitchOperationReceipt {
	const record = asRecord(value)
	if (
		!record ||
		typeof record.receiptId !== 'string' ||
		!RECEIPT_REF_PATTERN.test(record.receiptId) ||
		record.status !== 'succeeded' ||
		record.operation !== expectedOperation
	) {
		throw new Error('Invalid Stitch operation receipt')
	}
	return {
		receiptId: record.receiptId,
		status: 'succeeded',
		operation: expectedOperation,
	}
}

function normalizeDesignSystemProjection(
	value: DesignSystemProjection
): DesignSystemProjection {
	const serialized = JSON.stringify(value)
	if (serialized.length > 12_000) {
		throw new Error('Selected Design System context exceeds 12 KiB')
	}
	return value
}

function normalizeProjectRef(value: unknown): string {
	if (typeof value !== 'string' || !PROJECT_REF_PATTERN.test(value)) {
		throw new Error('Invalid Stitch project reference')
	}
	return value
}

function normalizeScreenRef(value: unknown): string {
	if (typeof value !== 'string' || !SCREEN_REF_PATTERN.test(value)) {
		throw new Error('Invalid Stitch screen reference')
	}
	return value
}

function normalizeDocumentRef(value: unknown): string {
	if (typeof value !== 'string' || !DOCUMENT_REF_PATTERN.test(value)) {
		throw new Error('Invalid Local HTML document reference')
	}
	return value
}

function normalizeRevision(value: unknown): string {
	if (typeof value !== 'string' || !REVISION_PATTERN.test(value)) {
		throw new Error('Invalid Local HTML revision')
	}
	return value
}

function normalizeIdempotencyKey(value: unknown): string {
	if (typeof value !== 'string' || !IDEMPOTENCY_KEY_PATTERN.test(value)) {
		throw new Error('Invalid Stitch idempotency key')
	}
	return value
}

function boundedText(value: unknown, label: string, maxChars: number): string {
	if (typeof value !== 'string') throw new Error(`Invalid Stitch ${label}`)
	const result = value.replace(/\s+/g, ' ').trim()
	if (!result || result.length > maxChars) {
		throw new Error(`Invalid Stitch ${label}`)
	}
	return result
}

function rejectProviderPayload(value: unknown): void {
	if (Array.isArray(value)) {
		value.forEach(rejectProviderPayload)
		return
	}
	const record = asRecord(value)
	if (!record) return
	for (const [key, nested] of Object.entries(record)) {
		if (FORBIDDEN_RESPONSE_KEYS.has(key)) {
			throw new Error('Stitch response exposed provider-only data')
		}
		rejectProviderPayload(nested)
	}
}

async function requestJson(
	pathname: string,
	init: Pick<RequestInit, 'method' | 'body' | 'signal'> = {}
): Promise<unknown> {
	const response = await fetchHtmlMockupBridge(pathname, {
		method: init.method ?? 'GET',
		headers: {
			accept: 'application/json',
			...(init.body ? { 'content-type': 'application/json' } : {}),
		},
		body: init.body,
		signal: init.signal,
	})
	const payload: unknown = await response.json().catch(() => null)
	if (!response.ok) {
		const record = asRecord(payload)
		throw new Error(
			typeof record?.message === 'string'
				? boundedText(record.message, 'error', 240)
				: `Stitch bridge returned HTTP ${response.status}`
		)
	}
	return payload
}

function asRecord(value: unknown): Record<string, any> | null {
	return value !== null && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, any>)
		: null
}
