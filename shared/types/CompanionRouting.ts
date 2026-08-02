import type { AgentAction } from './AgentAction'
import type {
	CompanionCapabilityId,
	CompanionCapabilitySummary,
	CompanionDomainPack,
} from './CompanionCapabilities'
import type { PromptPart } from './PromptPart'

export type CompanionRoute = 'canvas-edit' | 'isoflow-edit' | 'inquiry'

export interface CompanionRoutingRequest {
	enabled: true
	/** Prefer auto routing; explicit routes are useful to thin provider adapters. */
	route?: CompanionRoute | 'auto'
	/** Include only the request's bounded region, never the whole canvas implicitly. */
	includeBounds?: boolean
	/** Hydrate layout schemas only when requested or inferred from the intent. */
	capabilityTier?: 'base' | 'extended'
	/** Canonical domain pack ID. Human-facing aliases are resolved at the UI seam. */
	domainPack?: CompanionDomainPack
	/** Recent history event budget. Clamped by the shared routing policy. */
	maxHistoryItems?: number
}

export interface CompanionContextBudget {
	maxContextItems: number
	maxContinuationData: number
	maxHistoryItems: number
	maxSelectedShapes: number
	maxViewportShapes: number
	maxIsoflowEmbeds: number
	maxIsoflowItems: number
	maxIsoflowConnectors: number
}

export interface CompanionRoutingMetadata {
	route: CompanionRoute
	domainPack?: CompanionDomainPack
	contextBudget: CompanionContextBudget
	capabilityManifestVersion: 1
	/** Compact discovery surface. Concrete schemas are not included here. */
	capabilities: CompanionCapabilitySummary[]
	/** Capability packs whose action schemas are present in ModePart.actionTypes. */
	hydratedCapabilities: CompanionCapabilityId[]
	permissionBoundary: {
		surface: 'canvas' | 'isoflow' | 'none'
		mutations: 'validated-actions' | 'revision-guarded-transactions' | 'none'
		credentials: 'external-only'
	}
	historyRef?: string
}

export interface CompanionRoutePlan {
	active: boolean
	route?: CompanionRoute
	partTypes: PromptPart['type'][]
	actionTypes: AgentAction['_type'][]
	metadata?: CompanionRoutingMetadata
}
