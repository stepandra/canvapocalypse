import type { AgentAction } from './AgentAction'

export const COMPANION_CAPABILITY_MANIFEST_VERSION = 1 as const

export type CompanionDomainPack = 'architecture' | 'ml' | 'uiux' | 'product'

export type CompanionCapabilityId =
	| 'core.respond'
	| 'canvas.inspect-selection'
	| 'canvas.edit-shapes'
	| 'canvas.layout'
	| 'design.inspect-selected-system'
	| 'html.inspect-component'
	| 'html.create-variant'
	| 'isoflow.inspect-selected-view'
	| 'isoflow.search'
	| 'isoflow.patch'
	| 'isoflow.create-view'

/**
 * The compact capability information that provider adapters may advertise.
 * Concrete action schemas stay host-side until the capability is hydrated.
 */
export interface CompanionCapabilitySummary {
	id: CompanionCapabilityId
	summary: string
}

/**
 * Host-owned definition for one capability pack.
 * This is intentionally separate from the compact provider-facing summary.
 */
export interface CompanionCapabilityDefinition extends CompanionCapabilitySummary {
	actionTypes: readonly AgentAction['_type'][]
}
