import type {
	DesignSystemComponentSummary,
	DesignSystemDocumentSummary,
	DesignSystemPaletteRole,
	DesignSystemProjection,
	DesignSystemRevision,
	DesignSystemSnapshot,
	DesignSystemStatus,
	DesignSystemTypographySummary,
} from '../../shared/types/DesignSystem'
import { fetchHtmlMockupBridge } from '../html-mockup/htmlMockupBridge'

export const DESIGN_SYSTEM_DOCUMENT_REF_PATTERN =
	/^ds_[A-Za-z0-9_-]{16,64}$/
export const DESIGN_SYSTEM_REVISION_PATTERN = /^sha256:[a-f0-9]{64}$/i
export const MAX_DESIGN_SYSTEM_DOCUMENTS = 100
export const MAX_DESIGN_SYSTEM_SOURCE_BYTES = 1024 * 1024
export const MAX_DESIGN_SYSTEM_PROJECTION_CHARS = 12 * 1024
export const MAX_DESIGN_SYSTEM_ATMOSPHERE_ITEMS = 8
export const MAX_DESIGN_SYSTEM_PALETTE_ITEMS = 16
export const MAX_DESIGN_SYSTEM_TYPOGRAPHY_ITEMS = 12
export const MAX_DESIGN_SYSTEM_COMPONENT_ITEMS = 20
export const MAX_DESIGN_SYSTEM_LAYOUT_ITEMS = 12

const MAX_TITLE_CHARS = 160
const MAX_PROJECT_ID_CHARS = 120
const MAX_DRIFT_SUMMARY_CHARS = 240
const MAX_ROLE_CHARS = 80
const MAX_NAME_CHARS = 100
const MAX_SHORT_SUMMARY_CHARS = 240
const MAX_PRINCIPLE_CHARS = 180
const HEX_PATTERN = /^#[0-9a-f]{3,8}$/i
const STATUS_VALUES = new Set<DesignSystemStatus>([
	'current',
	'drifted',
	'missing',
	'unavailable',
])

type UnknownRecord = Record<string, unknown>

export async function listDesignSystems(
	signal?: AbortSignal
): Promise<DesignSystemDocumentSummary[]> {
	const response = await fetchHtmlMockupBridge('/design-systems', {
		method: 'GET',
		headers: { accept: 'application/json' },
		signal,
	})
	if (!response.ok) {
		throw new Error(`Design System registry returned HTTP ${response.status}`)
	}
	const payload: unknown = await response.json()
	const root = asRecord(payload)
	const documents = Array.isArray(payload)
		? payload
		: root && Array.isArray(root.documents)
			? root.documents
			: null
	if (!documents) throw new Error('Invalid Design System registry response')
	return documents
		.slice(0, MAX_DESIGN_SYSTEM_DOCUMENTS)
		.map((document) => normalizeDesignSystemDocument(document))
}

export async function getDesignSystemSnapshot(
	documentRef: string,
	expectedRevision?: string,
	signal?: AbortSignal
): Promise<DesignSystemSnapshot> {
	const safeRef = normalizeDocumentRef(documentRef)
	const url = new URL(
		`/design-systems/${encodeURIComponent(safeRef)}/snapshot`,
		'http://127.0.0.1:5176'
	)
	if (expectedRevision) {
		url.searchParams.set(
			'expectedRevision',
			normalizeRevision(expectedRevision)
		)
	}
	const response = await fetchHtmlMockupBridge(url, {
		method: 'GET',
		headers: { accept: 'application/json' },
		signal,
	})
	if (!response.ok) {
		throw new Error(`Design System registry returned HTTP ${response.status}`)
	}
	return normalizeDesignSystemSnapshot(await response.json(), {
		documentRef: safeRef,
		expectedRevision,
	})
}

export function normalizeDesignSystemDocument(
	value: unknown,
	expectedDocumentRef?: string
): DesignSystemDocumentSummary {
	const record = asRecord(value)
	if (!record) throw new Error('Design System document must be an object')
	const documentRef = normalizeDocumentRef(record.documentRef)
	if (expectedDocumentRef && documentRef !== expectedDocumentRef) {
		throw new Error('Design System documentRef mismatch')
	}
	const revision = normalizeRevision(record.revision)
	const title = compactRequiredText(record.title, 'title', MAX_TITLE_CHARS)
	const projectId = compactOptionalText(record.projectId, MAX_PROJECT_ID_CHARS)
	const bytes = normalizeBytes(record.bytes)
	const status = normalizeStatus(record.status)
	const driftSummary = compactOptionalText(
		record.driftSummary,
		MAX_DRIFT_SUMMARY_CHARS
	)
	if (status === 'drifted' && !driftSummary) {
		throw new Error('Drifted Design System document requires a summary')
	}
	return {
		documentRef,
		revision,
		title,
		...(projectId ? { projectId } : {}),
		bytes,
		status,
		...(driftSummary ? { driftSummary } : {}),
		truncated: record.truncated === true,
	}
}

export function normalizeDesignSystemSnapshot(
	value: unknown,
	expected?: {
		documentRef?: string
		expectedRevision?: string
	}
): DesignSystemSnapshot {
	const record = asRecord(value)
	if (!record) throw new Error('Design System snapshot must be an object')
	const document = normalizeDesignSystemDocument(
		record,
		expected?.documentRef
	)
	if (
		expected?.expectedRevision &&
		document.revision !== normalizeRevision(expected.expectedRevision)
	) {
		throw new Error('Design System snapshot revision mismatch')
	}
	const rawProjection =
		asRecord(record.projection) ?? asRecord(record.snapshot)
	if (!rawProjection) {
		throw new Error('Design System snapshot projection is missing')
	}
	const projection = normalizeDesignSystemProjection(rawProjection)
	return {
		...document,
		projectId: projection.projectId ?? document.projectId,
		truncated: document.truncated || projection.truncated,
		projection,
	}
}

export function normalizeDesignSystemProjection(
	value: unknown
): DesignSystemProjection {
	const record = asRecord(value)
	if (!record) throw new Error('Design System projection must be an object')
	const projection: DesignSystemProjection = {
		...(compactOptionalText(record.projectId, MAX_PROJECT_ID_CHARS)
			? {
					projectId: compactOptionalText(
						record.projectId,
						MAX_PROJECT_ID_CHARS
					),
				}
			: {}),
		...(compactOptionalText(record.theme, MAX_SHORT_SUMMARY_CHARS)
			? {
					theme: compactOptionalText(
						record.theme,
						MAX_SHORT_SUMMARY_CHARS
					),
				}
			: {}),
		atmosphere: normalizeTextArray(
			record.atmosphere,
			MAX_DESIGN_SYSTEM_ATMOSPHERE_ITEMS,
			MAX_SHORT_SUMMARY_CHARS
		),
		palette: normalizePalette(record.palette),
		typography: normalizeTypography(record.typography),
		components: normalizeComponents(record.components),
		layoutPrinciples: normalizeTextArray(
			record.layoutPrinciples ?? record.layout,
			MAX_DESIGN_SYSTEM_LAYOUT_ITEMS,
			MAX_PRINCIPLE_CHARS
		),
		truncated:
			record.truncated === true ||
			hasOverflow(record.atmosphere, MAX_DESIGN_SYSTEM_ATMOSPHERE_ITEMS) ||
			hasOverflow(record.palette, MAX_DESIGN_SYSTEM_PALETTE_ITEMS) ||
			hasOverflow(record.typography, MAX_DESIGN_SYSTEM_TYPOGRAPHY_ITEMS) ||
			hasOverflow(record.components, MAX_DESIGN_SYSTEM_COMPONENT_ITEMS) ||
			hasOverflow(
				record.layoutPrinciples ?? record.layout,
				MAX_DESIGN_SYSTEM_LAYOUT_ITEMS
			),
	}

	while (
		JSON.stringify(projection).length > MAX_DESIGN_SYSTEM_PROJECTION_CHARS
	) {
		projection.truncated = true
		if (projection.components.length) {
			projection.components.pop()
		} else if (projection.layoutPrinciples.length) {
			projection.layoutPrinciples.pop()
		} else if (projection.typography.length) {
			projection.typography.pop()
		} else if (projection.atmosphere.length) {
			projection.atmosphere.pop()
		} else if (projection.palette.length) {
			projection.palette.pop()
		} else {
			break
		}
	}
	return projection
}

function normalizePalette(value: unknown): DesignSystemPaletteRole[] {
	if (!Array.isArray(value)) return []
	const result: DesignSystemPaletteRole[] = []
	for (const item of value.slice(0, MAX_DESIGN_SYSTEM_PALETTE_ITEMS)) {
		const record = asRecord(item)
		if (!record) continue
		const role = compactOptionalText(
			record.role ?? record.name,
			MAX_ROLE_CHARS
		)
		const hex =
			typeof record.hex === 'string' && HEX_PATTERN.test(record.hex.trim())
				? record.hex.trim().toUpperCase()
				: undefined
		if (!role || !hex) continue
		const name = compactOptionalText(record.name, MAX_NAME_CHARS)
		result.push({ role, hex, ...(name && name !== role ? { name } : {}) })
	}
	return result
}

function normalizeTypography(value: unknown): DesignSystemTypographySummary[] {
	if (!Array.isArray(value)) return []
	const result: DesignSystemTypographySummary[] = []
	for (const item of value.slice(0, MAX_DESIGN_SYSTEM_TYPOGRAPHY_ITEMS)) {
		if (typeof item === 'string') {
			const summary = compactOptionalText(item, MAX_SHORT_SUMMARY_CHARS)
			if (summary) result.push({ role: 'Typography', summary })
			continue
		}
		const record = asRecord(item)
		if (!record) continue
		const role = compactOptionalText(
			record.role ?? record.name,
			MAX_ROLE_CHARS
		)
		if (!role) continue
		const family = compactOptionalText(record.family, MAX_NAME_CHARS)
		const weight = compactOptionalText(record.weight, MAX_ROLE_CHARS)
		const summary = compactOptionalText(
			record.summary,
			MAX_SHORT_SUMMARY_CHARS
		)
		result.push({
			role,
			...(family ? { family } : {}),
			...(weight ? { weight } : {}),
			...(summary ? { summary } : {}),
		})
	}
	return result
}

function normalizeComponents(value: unknown): DesignSystemComponentSummary[] {
	if (!Array.isArray(value)) return []
	const result: DesignSystemComponentSummary[] = []
	for (const item of value.slice(0, MAX_DESIGN_SYSTEM_COMPONENT_ITEMS)) {
		const record = asRecord(item)
		if (!record) continue
		const name = compactOptionalText(record.name, MAX_NAME_CHARS)
		const summary = compactOptionalText(
			record.summary,
			MAX_SHORT_SUMMARY_CHARS
		)
		if (name && summary) result.push({ name, summary })
	}
	return result
}

function normalizeTextArray(
	value: unknown,
	maxItems: number,
	maxChars: number
): string[] {
	if (!Array.isArray(value)) return []
	return value
		.slice(0, maxItems)
		.map((item) => compactOptionalText(item, maxChars))
		.filter((item): item is string => Boolean(item))
}

function normalizeDocumentRef(value: unknown): string {
	if (
		typeof value !== 'string' ||
		!DESIGN_SYSTEM_DOCUMENT_REF_PATTERN.test(value)
	) {
		throw new Error('Invalid opaque Design System documentRef')
	}
	return value
}

function normalizeRevision(value: unknown): DesignSystemRevision {
	if (
		typeof value !== 'string' ||
		!DESIGN_SYSTEM_REVISION_PATTERN.test(value)
	) {
		throw new Error('Invalid Design System sha256 revision')
	}
	return value as DesignSystemRevision
}

function normalizeBytes(value: unknown): number {
	if (
		typeof value !== 'number' ||
		!Number.isSafeInteger(value) ||
		value < 0 ||
		value > MAX_DESIGN_SYSTEM_SOURCE_BYTES
	) {
		throw new Error('Invalid or oversized Design System source')
	}
	return value
}

function normalizeStatus(value: unknown): DesignSystemStatus {
	const status = value === undefined ? 'current' : value
	if (typeof status !== 'string' || !STATUS_VALUES.has(status as DesignSystemStatus)) {
		throw new Error('Invalid Design System status')
	}
	return status as DesignSystemStatus
}

function compactRequiredText(
	value: unknown,
	name: string,
	maxChars: number
): string {
	const result = compactOptionalText(value, maxChars)
	if (!result) throw new Error(`Invalid Design System ${name}`)
	return result
}

function compactOptionalText(
	value: unknown,
	maxChars: number
): string | undefined {
	if (typeof value !== 'string') return undefined
	const compact = value.replace(/\s+/g, ' ').trim()
	if (!compact) return undefined
	return compact.slice(0, maxChars)
}

function hasOverflow(value: unknown, maxItems: number): boolean {
	return Array.isArray(value) && value.length > maxItems
}

function asRecord(value: unknown): UnknownRecord | null {
	return value !== null && typeof value === 'object' && !Array.isArray(value)
		? (value as UnknownRecord)
		: null
}
