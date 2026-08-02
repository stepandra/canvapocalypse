import type { AgentAction } from '../../shared/types/AgentAction'
import type {
	CompanionCapabilityDefinition,
	CompanionCapabilityId,
	CompanionCapabilitySummary,
} from '../../shared/types/CompanionCapabilities'
import type { CompanionRoute } from '../../shared/types/CompanionRouting'

const CAPABILITY_DEFINITIONS = {
	'core.respond': {
		id: 'core.respond',
		summary: 'Respond, reason briefly, or report an unsupported request.',
		actionTypes: ['message', 'think', 'unknown'],
	},
	'canvas.inspect-selection': {
		id: 'canvas.inspect-selection',
		summary: 'Inspect the bounded native tldraw selection supplied with this request.',
		actionTypes: [],
	},
	'canvas.edit-shapes': {
		id: 'canvas.edit-shapes',
		summary: 'Create and make basic validated changes to native tldraw shapes.',
		actionTypes: ['create', 'delete', 'update', 'label', 'move'],
	},
	'canvas.layout': {
		id: 'canvas.layout',
		summary: 'Arrange, resize, rotate, align, distribute, or stack native tldraw shapes.',
		actionTypes: [
			'place',
			'bringToFront',
			'sendToBack',
			'rotate',
			'resize',
			'align',
			'distribute',
			'stack',
		],
	},
	'design.inspect-selected-system': {
		id: 'design.inspect-selected-system',
		summary:
			'Inspect the bounded revision-scoped DESIGN.md projection linked by the selected native Design System node.',
		actionTypes: [],
	},
	'html.inspect-component': {
		id: 'html.inspect-component',
		summary:
			'Inspect the bounded semantic snapshot for the selected Local HTML Mockup component.',
		actionTypes: ['htmlMockupInspect'],
	},
	'html.create-variant': {
		id: 'html.create-variant',
		summary:
			'Create one idempotent revision-guarded variant for a previously inspected opaque target in the selected Local HTML Mockup.',
		actionTypes: ['htmlMockupCreateVariant'],
	},
	'isoflow.inspect-selected-view': {
		id: 'isoflow.inspect-selected-view',
		summary: 'Inspect the compact selected native Isoflow view and its guarded revision.',
		actionTypes: [],
	},
	'isoflow.search': {
		id: 'isoflow.search',
		summary: 'Search the selected native Isoflow project through Bridge v2.',
		actionTypes: ['isoflowSearch'],
	},
	'isoflow.patch': {
		id: 'isoflow.patch',
		summary: 'Preview a revision-guarded patch for the selected native Isoflow view.',
		actionTypes: ['isoflowPatch'],
	},
	'isoflow.create-view': {
		id: 'isoflow.create-view',
		summary: 'Preview creation of one native Isoflow view through Bridge v2.',
		actionTypes: ['isoflowCreateView'],
	},
} as const satisfies Record<CompanionCapabilityId, CompanionCapabilityDefinition>

const ROUTE_CAPABILITIES = {
	inquiry: ['core.respond'],
	'canvas-edit': [
		'core.respond',
		'canvas.inspect-selection',
		'canvas.edit-shapes',
		'canvas.layout',
		'design.inspect-selected-system',
		'html.inspect-component',
		'html.create-variant',
	],
	'isoflow-edit': [
		'core.respond',
		'isoflow.inspect-selected-view',
		'isoflow.search',
		'isoflow.patch',
		'isoflow.create-view',
	],
} as const satisfies Record<CompanionRoute, readonly CompanionCapabilityId[]>

export function getAdvertisedCompanionCapabilities(
	route: CompanionRoute,
	options: {
		selectedHtmlMockupCount?: number
		selectedDesignSystemCount?: number
		domainPack?: 'architecture' | 'ml' | 'uiux' | 'product'
	} = {}
): CompanionCapabilitySummary[] {
	return ROUTE_CAPABILITIES[route]
		.filter(
			(id) =>
				!id.startsWith('html.') ||
				(route === 'canvas-edit' && (options.selectedHtmlMockupCount ?? 0) > 0)
		)
		.filter(
			(id) =>
				!id.startsWith('design.') ||
				(route === 'canvas-edit' &&
					options.domainPack === 'uiux' &&
					(options.selectedDesignSystemCount ?? 0) === 1)
		)
		.map((id) => {
		const capability = CAPABILITY_DEFINITIONS[id]
		return { id: capability.id, summary: capability.summary }
		})
}

export function getCompanionActionTypes(
	route: CompanionRoute,
	hydratedCapabilityIds: readonly CompanionCapabilityId[]
): AgentAction['_type'][] {
	const allowed = new Set<CompanionCapabilityId>(ROUTE_CAPABILITIES[route])
	const seen = new Set<AgentAction['_type']>()
	const actionTypes: AgentAction['_type'][] = []
	let includesUnknown = false

	for (const capabilityId of hydratedCapabilityIds) {
		if (!allowed.has(capabilityId)) {
			throw new Error(`Capability ${capabilityId} is not available on the ${route} route`)
		}
		for (const actionType of CAPABILITY_DEFINITIONS[capabilityId].actionTypes) {
			if (actionType === 'unknown') {
				includesUnknown = true
				continue
			}
			if (seen.has(actionType)) continue
			seen.add(actionType)
			actionTypes.push(actionType)
		}
	}

	if (includesUnknown) actionTypes.push('unknown')
	return actionTypes
}

export function isCompanionCapabilityAvailable(
	route: CompanionRoute,
	capabilityId: CompanionCapabilityId
) {
	return (ROUTE_CAPABILITIES[route] as readonly CompanionCapabilityId[]).includes(capabilityId)
}
