import {
	defaultBindingUtils,
	defaultShapeUtils,
	type TLAnyBindingUtilConstructor,
	type TLAnyShapeUtilConstructor,
	type TLStateNodeConstructor,
} from 'tldraw'
import type { CanvasKitComposition } from './types'

const HOST_SHAPE_TYPES_BY_PAGE: Readonly<Record<string, readonly string[]>> = {
	architecture: ['embed'],
	ml: ['c1-experiment-card', 'workflow-node', 'workflow-rich-output'],
	uiux: ['design-system', 'local-html-mockup', 'embed'],
	product: ['workflow-node', 'workflow-rich-output'],
	'agents-models': ['agents-models-node', 'workflow-node', 'workflow-rich-output'],
}

const SHARED_DOMAIN_TOOL_IDS = ['target-shape', 'target-area', 'emoji-stamp'] as const

function registrationId(
	registration:
		| TLAnyShapeUtilConstructor
		| TLAnyBindingUtilConstructor
		| TLStateNodeConstructor,
	key: 'type' | 'id'
) {
	return String(Reflect.get(registration, key))
}

function mergeRegistrations<
	Registration extends
		| TLAnyShapeUtilConstructor
		| TLAnyBindingUtilConstructor
		| TLStateNodeConstructor,
>(
	defaults: readonly Registration[],
	registered: readonly Registration[],
	key: 'type' | 'id'
) {
	const customIds = new Set(registered.map((value) => registrationId(value, key)))
	return [
		...defaults.filter((value) => !customIds.has(registrationId(value, key))),
		...registered,
	]
}

/**
 * Project the registrations that are meaningful to an agent on one page.
 * The editor may mount the superset for record compatibility, but discovery
 * never publishes another page's custom surface. Freeform remains stock-only.
 */
export function resolveAgentPageRegistrations({
	pageMode,
	composition,
	shapeUtils,
	bindingUtils,
	tools,
}: {
	pageMode: string
	composition: CanvasKitComposition
	shapeUtils: readonly TLAnyShapeUtilConstructor[]
	bindingUtils: readonly TLAnyBindingUtilConstructor[]
	tools: readonly TLStateNodeConstructor[]
}) {
	if (pageMode === 'freeform') {
		return {
			shapeUtils: [...defaultShapeUtils],
			bindingUtils: [...defaultBindingUtils],
			tools: [] as TLStateNodeConstructor[],
		}
	}

	const contributionShapeTypes = new Set(
		composition.shapeUtils.map((value) => registrationId(value, 'type'))
	)
	const contributionBindingTypes = new Set(
		composition.bindingUtils.map((value) => registrationId(value, 'type'))
	)
	const contributionToolIds = new Set(
		composition.tools.map((value) => registrationId(value, 'id'))
	)
	const defaultShapeTypes = new Set(
		defaultShapeUtils.map((value) => registrationId(value, 'type'))
	)
	const defaultBindingTypes = new Set(
		defaultBindingUtils.map((value) => registrationId(value, 'type'))
	)
	const allowedHostShapeTypes = new Set(HOST_SHAPE_TYPES_BY_PAGE[pageMode] ?? [])
	const allowedToolIds = new Set([
		...SHARED_DOMAIN_TOOL_IDS,
		...(pageMode === 'ml' || pageMode === 'product' || pageMode === 'agents-models'
			? tools
				.map((value) => registrationId(value, 'id'))
				.filter((id) => id.startsWith('workflow-'))
			: []),
	])

	return {
		shapeUtils: mergeRegistrations(defaultShapeUtils, shapeUtils, 'type').filter(
			(value) => {
				const id = registrationId(value, 'type')
				return (
					defaultShapeTypes.has(id) ||
					contributionShapeTypes.has(id) ||
					allowedHostShapeTypes.has(id)
				)
			}
		),
		bindingUtils: mergeRegistrations(defaultBindingUtils, bindingUtils, 'type').filter(
			(value) => {
				const id = registrationId(value, 'type')
				return defaultBindingTypes.has(id) || contributionBindingTypes.has(id)
			}
		),
		tools: mergeRegistrations([], tools, 'id').filter((value) => {
			const id = registrationId(value, 'id')
			return contributionToolIds.has(id) || allowedToolIds.has(id)
		}),
	}
}
