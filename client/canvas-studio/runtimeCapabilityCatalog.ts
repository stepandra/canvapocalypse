import type {
	TLAnyBindingUtilConstructor,
	TLAnyShapeUtilConstructor,
	TLPage,
	TLStateNodeConstructor,
} from 'tldraw'
import type { CanvasStudioCatalog } from './catalog'
import type {
	CanvasAgentCapabilityDescriptor,
	CanvasKitComposition,
	CanvasKitContribution,
} from './types'

export const CANVAS_RUNTIME_CAPABILITY_CATALOG_SCHEMA =
	'canvas-studio-runtime-capabilities/v1' as const

export interface CanvasRuntimeRegistration {
	id: string
	owner: string
}

export interface CanvasRuntimeCapabilityCatalog {
	schema: typeof CANVAS_RUNTIME_CAPABILITY_CATALOG_SCHEMA
	version: 1
	catalogRevision: string
	surface: 'tldraw'
	pageMode: string
	contextPolicies: readonly ['selection', 'selection-or-area']
	registrations: {
		shapeTypes: readonly CanvasRuntimeRegistration[]
		bindingTypes: readonly CanvasRuntimeRegistration[]
		toolIds: readonly CanvasRuntimeRegistration[]
		recordTypes: readonly CanvasRuntimeRegistration[]
	}
	kits: readonly {
		id: string
		title: string
		kind?: string
		runtime?: string
		tags: readonly string[]
		presets: readonly {
			id: string
			title: string
			tags: readonly string[]
		}[]
		capabilityIds: readonly string[]
	}[]
	capabilities: readonly CanvasAgentCapabilityDescriptor[]
}

function registrationOwner(
	id: string,
	contributions: readonly CanvasKitContribution[],
	field: 'shapeUtils' | 'bindingUtils' | 'tools',
	key: 'type' | 'id'
) {
	return contributions.find((contribution) =>
		contribution[field].some(
			(registration) =>
				(registration as unknown as Record<'type' | 'id', unknown>)[key] === id
		)
	)?.kitId
}

function registrations(
	values: readonly (TLAnyShapeUtilConstructor | TLAnyBindingUtilConstructor | TLStateNodeConstructor)[],
	activeContributions: readonly CanvasKitContribution[],
	allContributions: readonly CanvasKitContribution[],
	field: 'shapeUtils' | 'bindingUtils' | 'tools',
	key: 'type' | 'id'
) {
	const activeKitIds = new Set(activeContributions.map((contribution) => contribution.kitId))
	return [...new Set(values.map((value) => String(Reflect.get(value, key))))]
		.filter(Boolean)
		.sort()
		.flatMap((id) => {
			const contributionOwner = registrationOwner(id, allContributions, field, key)
			if (contributionOwner && !activeKitIds.has(contributionOwner)) return []
			return [{ id, owner: contributionOwner ?? 'canvapocalypse.host' }]
		})
}

function createCatalogRevision() {
	return `catalog-${
		typeof globalThis.crypto?.randomUUID === 'function'
			? globalThis.crypto.randomUUID()
			: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
	}`
}

const PAGE_MODE_ALIASES: Readonly<Record<string, string>> = {
	architecture: 'architecture',
	'ml-llm': 'ml',
	ml: 'ml',
	'ui-ux': 'uiux',
	uiux: 'uiux',
	'product-pm': 'product',
	product: 'product',
	'agents-models': 'agents-models',
	workflow: 'workflow',
	botflow: 'botflow',
	'flight-deck': 'flight-deck',
	freeform: 'freeform',
	'free-form': 'freeform',
}

const PAGE_MODE_KITS: Readonly<Record<string, readonly string[]>> = {
	architecture: ['workbench.architecture'],
	ml: ['workbench.ml'],
	uiux: ['workbench.uiux'],
	product: ['workbench.product'],
	'agents-models': ['grok.workflow'],
	workflow: ['grok.workflow'],
	botflow: ['botflow.telegram-journey'],
	'flight-deck': ['hermes.flight-deck'],
	freeform: [],
}

const SHARED_BOUND_PAGE_KITS = [
	'canvas.comments',
	'canvas.layout',
	'canvas.markdown',
] as const

function normalizedPageKey(value: string) {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
}

export function resolveCanvasRuntimePageMode(
	page: Pick<TLPage, 'name' | 'meta'>
) {
	const explicitLens =
		page.meta && typeof page.meta.lens === 'string'
			? normalizedPageKey(page.meta.lens)
			: ''
	return PAGE_MODE_ALIASES[explicitLens || normalizedPageKey(page.name)] ?? 'freeform'
}

export function resolveCanvasRuntimeKitIds({
	page,
	studioCatalog,
}: {
	page: Pick<TLPage, 'name' | 'meta'>
	studioCatalog?: CanvasStudioCatalog
}) {
	const pageMode = resolveCanvasRuntimePageMode(page)
	if (pageMode === 'freeform') return { pageMode, kitIds: [] as string[] }
	const explicitCatalogKitIds = studioCatalog?.pages?.[pageMode]
	const defaultPageKitIds = studioCatalog?.kits
		.filter(
			(kit) =>
				kit.defaultPage &&
				normalizedPageKey(kit.defaultPage) === normalizedPageKey(page.name)
		)
		.map((kit) => kit.id)
	const domainKitIds =
		explicitCatalogKitIds ??
		(defaultPageKitIds?.length ? defaultPageKitIds : PAGE_MODE_KITS[pageMode] ?? [])
	return {
		pageMode,
		kitIds: [...new Set([...domainKitIds, ...SHARED_BOUND_PAGE_KITS])],
	}
}

/** Build an exact, serializable snapshot of the mounted trusted composition. */
export function buildCanvasRuntimeCapabilityCatalog({
	composition,
	studioCatalog,
	page,
	shapeUtils,
	bindingUtils,
	tools,
}: {
	composition: CanvasKitComposition
	studioCatalog?: CanvasStudioCatalog
	page: Pick<TLPage, 'name' | 'meta'>
	shapeUtils: readonly TLAnyShapeUtilConstructor[]
	bindingUtils: readonly TLAnyBindingUtilConstructor[]
	tools: readonly TLStateNodeConstructor[]
}): CanvasRuntimeCapabilityCatalog {
	const { pageMode, kitIds } = resolveCanvasRuntimeKitIds({ page, studioCatalog })
	const allowedKitIds = new Set(kitIds)
	const contributions = composition.contributions.filter((contribution) =>
		allowedKitIds.has(contribution.kitId)
	)
	const recordOwners = new Map<string, string>()
	for (const contribution of contributions) {
		for (const recordType of Object.keys(contribution.records ?? {})) {
			recordOwners.set(recordType, contribution.kitId)
		}
	}

	return {
		schema: CANVAS_RUNTIME_CAPABILITY_CATALOG_SCHEMA,
		version: 1,
		catalogRevision: createCatalogRevision(),
		surface: 'tldraw',
		pageMode,
		contextPolicies: ['selection', 'selection-or-area'],
		registrations: {
			shapeTypes: registrations(
				shapeUtils,
				contributions,
				composition.contributions,
				'shapeUtils',
				'type'
			),
			bindingTypes: registrations(
				bindingUtils,
				contributions,
				composition.contributions,
				'bindingUtils',
				'type'
			),
			toolIds: registrations(
				tools,
				contributions,
				composition.contributions,
				'tools',
				'id'
			),
			recordTypes: [...recordOwners]
				.sort(([left], [right]) => left.localeCompare(right))
				.map(([id, owner]) => ({ id, owner })),
		},
		kits: contributions.map((contribution) => {
			const catalogKit = studioCatalog?.kits.find((kit) => kit.id === contribution.kitId)
			return {
				id: contribution.kitId,
				title: catalogKit?.title ?? contribution.kitId,
				...(catalogKit?.kind ? { kind: catalogKit.kind } : {}),
				...(catalogKit?.runtime ? { runtime: catalogKit.runtime } : {}),
				tags: catalogKit?.tags ?? [],
				presets: contribution.presetIds.map((presetId) => {
					const catalogPreset = catalogKit?.presets.find((preset) => preset.id === presetId)
					return {
						id: presetId,
						title: catalogPreset?.title ?? presetId,
						tags: catalogPreset?.tags ?? [],
					}
				}),
				capabilityIds: (contribution.agentCapabilities ?? []).map(
					(capability) => capability.descriptor.id
				),
			}
		}),
		capabilities: contributions.flatMap((contribution) =>
			(contribution.agentCapabilities ?? []).map((capability) =>
				structuredClone(capability.descriptor)
			)
		),
	}
}
