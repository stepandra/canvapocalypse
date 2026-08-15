import type { TLPage } from 'tldraw'
import type { CanvasKitComposition } from './types'

export interface CanvasStudioCatalogPreset {
	id: string
	title: string
	tags?: readonly string[]
}

export interface CanvasStudioCatalogKit {
	id: string
	title: string
	kind: string
	runtime: string
	defaultPage?: string
	tags?: readonly string[]
	presets: readonly CanvasStudioCatalogPreset[]
}

export interface CanvasStudioCatalog {
	version: number
	host?: unknown
	kits: readonly CanvasStudioCatalogKit[]
	pages?: Readonly<Record<string, readonly string[]>>
}

export type CanvasStudioCatalogKitAvailability =
	| 'available'
	| 'unbound'
	| 'unavailable'

export interface CanvasStudioPalettePreset extends CanvasStudioCatalogPreset {
	kitId: string
	kitTitle: string
	tags: readonly string[]
	availability: CanvasStudioCatalogKitAvailability
}

export interface CanvasStudioPaletteKit extends CanvasStudioCatalogKit {
	availability: CanvasStudioCatalogKitAvailability
	presets: readonly CanvasStudioPalettePreset[]
}

export interface CanvasStudioPaletteModel {
	state: 'missing' | 'ready' | 'empty'
	kits: readonly CanvasStudioPaletteKit[]
}

const catalogIdPattern = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function readStringList(value: unknown): readonly string[] | undefined {
	if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
		return undefined
	}
	return value
}

function parseCatalogPreset(value: unknown): CanvasStudioCatalogPreset | undefined {
	if (!isRecord(value)) return undefined
	if (
		typeof value.id !== 'string' ||
		!catalogIdPattern.test(value.id) ||
		typeof value.title !== 'string' ||
		!value.title.trim()
	) {
		return undefined
	}
	const tags = readStringList(value.tags)
	if (value.tags !== undefined && !tags) return undefined
	return { id: value.id, title: value.title, ...(tags ? { tags } : {}) }
}

function parseCatalogKit(value: unknown): CanvasStudioCatalogKit | undefined {
	if (!isRecord(value)) return undefined
	if (
		typeof value.id !== 'string' ||
		!catalogIdPattern.test(value.id) ||
		typeof value.title !== 'string' ||
		!value.title.trim() ||
		typeof value.kind !== 'string' ||
		typeof value.runtime !== 'string' ||
		!Array.isArray(value.presets)
	) {
		return undefined
	}
	const tags = readStringList(value.tags)
	if (value.tags !== undefined && !tags) return undefined
	const presets = value.presets.map(parseCatalogPreset)
	if (presets.some((preset) => !preset)) return undefined
	return {
		id: value.id,
		title: value.title,
		kind: value.kind,
		runtime: value.runtime,
		...(typeof value.defaultPage === 'string'
			? { defaultPage: value.defaultPage }
			: {}),
		...(tags ? { tags } : {}),
		presets: presets as CanvasStudioCatalogPreset[],
	}
}

export function parseCanvasStudioCatalog(
	value: unknown
): CanvasStudioCatalog | undefined {
	if (!isRecord(value) || !Number.isInteger(value.version) || !Array.isArray(value.kits)) {
		return undefined
	}
	const kits = value.kits.map(parseCatalogKit)
	if (kits.some((kit) => !kit)) return undefined

	let pages: Record<string, readonly string[]> | undefined
	if (value.pages !== undefined) {
		if (!isRecord(value.pages)) return undefined
		pages = {}
		for (const [pageId, kitIds] of Object.entries(value.pages)) {
			const parsed = readStringList(kitIds)
			if (!parsed) return undefined
			pages[pageId] = parsed
		}
	}

	return {
		version: value.version as number,
		host: value.host,
		kits: kits as CanvasStudioCatalogKit[],
		...(pages ? { pages } : {}),
	}
}

export function readEmbeddedCanvasStudioCatalog(
	target: typeof globalThis = globalThis
): CanvasStudioCatalog | undefined {
	return parseCanvasStudioCatalog(
		(target as typeof globalThis & { __CANVAS_STUDIO_CATALOG__?: unknown })
			.__CANVAS_STUDIO_CATALOG__
	)
}

function searchText(...values: Array<string | readonly string[] | undefined>) {
	return values
		.flatMap((value) => (Array.isArray(value) ? value : value ? [value] : []))
		.join(' ')
		.toLowerCase()
}

function availabilityForKit(
	kitId: string,
	pageLens: string | undefined,
	catalog: CanvasStudioCatalog,
	composition: CanvasKitComposition
): CanvasStudioCatalogKitAvailability {
	if (!composition.getContribution(kitId)) return 'unavailable'
	const pageKitIds = pageLens ? catalog.pages?.[pageLens] : undefined
	if (pageKitIds && !pageKitIds.includes(kitId)) return 'unbound'
	return 'available'
}

export function buildCanvasStudioPaletteModel({
	catalog,
	composition,
	page,
	query = '',
}: {
	catalog: CanvasStudioCatalog | undefined
	composition: CanvasKitComposition
	page: Pick<TLPage, 'name' | 'meta'>
	query?: string
}): CanvasStudioPaletteModel {
	if (!catalog) return { state: 'missing', kits: [] }
	const needle = query.trim().toLowerCase()
	const pageLens =
		page.meta && typeof page.meta.lens === 'string' ? page.meta.lens : undefined
	const kits = catalog.kits.flatMap((kit): CanvasStudioPaletteKit[] => {
		const availability = availabilityForKit(
			kit.id,
			pageLens,
			catalog,
			composition
		)
		const kitHit =
			!needle ||
			searchText(
				kit.id,
				kit.title,
				kit.kind,
				kit.runtime,
				kit.defaultPage,
				kit.tags
			).includes(needle)
		const presets = kit.presets.filter(
			(preset) =>
				kitHit ||
				searchText(preset.id, preset.title, preset.tags).includes(needle)
		)
		if (!kitHit && presets.length === 0) return []
		return [
			{
				...kit,
				availability,
				presets: presets.map((preset) => {
					const presetContribution = composition.getPresetContribution(preset.id)
					const presetAvailability =
						availability === 'available' &&
						presetContribution?.kitId === kit.id
							? 'available'
							: availability === 'unbound'
								? 'unbound'
								: 'unavailable'
					return {
						...preset,
						kitId: kit.id,
						kitTitle: kit.title,
						tags: preset.tags ?? [],
						availability: presetAvailability,
					}
				}),
			},
		]
	})
	return { state: kits.length > 0 ? 'ready' : 'empty', kits }
}
