import type { AgentModeDefinition } from '../modes/AgentModeDefinitions'
import type { AgentRequest } from '../../shared/types/AgentRequest'
import type { TldrawAgent } from './TldrawAgent'
import type { PromptPart } from '../../shared/types/PromptPart'
import { isIsoflowEmbedShape } from '../isoflow/isoflowProvider'
import { isHtmlMockupShape } from '../parts/HtmlMockupContextPartUtil'
import { isDesignSystemShape } from '../design-system/DesignSystemShape'
import { isMarkdownDocumentShape } from '../markdown/MarkdownDocumentShape'
import {
	getAdvertisedCompanionCapabilities,
	getCompanionActionTypes,
} from './companionCapabilities'
import {
	COMPANION_CAPABILITY_MANIFEST_VERSION,
	type CompanionCapabilityId,
} from '../../shared/types/CompanionCapabilities'
import type {
	CompanionContextBudget,
	CompanionRoute,
	CompanionRoutePlan,
} from '../../shared/types/CompanionRouting'

export const COMPANION_CONTEXT_BUDGET: CompanionContextBudget = Object.freeze({
	maxContextItems: 12,
	maxContinuationData: 8,
	maxHistoryItems: 8,
	maxSelectedShapes: 24,
	maxViewportShapes: 64,
	maxIsoflowEmbeds: 1,
	maxIsoflowItems: 32,
	maxIsoflowConnectors: 48,
})

const COMMON_PARTS = ['mode', 'debug', 'modelName', 'messages', 'data', 'chatHistory'] as const
const EDIT_INTENT =
	/(?:\b(?:create|draw|build|generate|compose|visualize|redesign|restyle|revise|rework|add|edit|update|change|move|delete|remove|rename|label|resize|rotate|align|distribute|stack|arrange|patch|connect|disconnect)\w*|(?:созда|нарис|постро|сгенер|скомпон|визуализ|спроект|передел|переработ|добав|измен|перемест|удал|переимен|подпис|выровн|распредел|соедин)[\p{L}\p{M}]*)/iu
const CREATE_VIEW_INTENT =
	/(?:\b(create|new|add)\b.*\b(view|diagram)\b)|(?:\b(view|diagram)\b.*\b(create|new|add)\b)|(?:созда|добав|нов)\w*.*(?:вью|вид|диаграм)\w*/iu
const LAYOUT_INTENT =
	/\b(layout|arrange|align|distribute|stack|resize|rotate|front|back|сло[йя]|выровн|распредел|размер|поверн|расклад)\w*/iu
const ISOFLOW_DOMAIN_INTENT =
	/\b(isoflow|devops|devsecops|infrastructure|infra|deployment|topology|network|server|vps|virtual machine|bare metal|trust contour|security contour|изофлоу|девопс|девсекопс|инфраструктур|депло|топологи|сет[ьи]|сервер|контур)\w*/iu
const NATIVE_TLDRAW_DOMAIN_INTENT =
	/\b(machine learning|mlops|hugging face|ml-intern|ml intern|workflow|widget|general diagram|canvas|tldraw|машинн\w* обучен|млопс|воркфлоу|виджет|канвас|тлдро)\w*/iu
const HTML_VARIANT_INTENT =
	/(?:^\s*(?:please\s+)?(?:design|redesign|restyle|prototype|revise|rework)\b|\b(?:redesign|restyle|revise|rework)\b|^\s*(?:пожалуйста[,\s]+)?(?:спроектируй|переделай|переработай)\b)/iu

export interface CompanionRouteSignals {
	selectedShapeCount: number
	selectedIsoflowEmbedCount: number
	selectedHtmlMockupCount?: number
	selectedDesignSystemCount?: number
	selectedMarkdownDocumentCount?: number
	historyLength?: number
}

export function getCompanionRouteSignals(agent: TldrawAgent): CompanionRouteSignals {
	const selected = agent.editor.getSelectedShapes()
	return {
		selectedShapeCount: selected.length,
		selectedIsoflowEmbedCount: selected.filter(isIsoflowEmbedShape).length,
		selectedHtmlMockupCount: selected.filter(isHtmlMockupShape).length,
		selectedDesignSystemCount: selected.filter(isDesignSystemShape).length,
		selectedMarkdownDocumentCount: selected.filter(isMarkdownDocumentShape).length,
		historyLength: agent.chat.getHistory().length,
	}
}

export function buildCompanionRoutePlan(
	request: AgentRequest,
	signals: CompanionRouteSignals,
	modeDefinition: AgentModeDefinition
): CompanionRoutePlan {
	if (!modeDefinition.active) {
		throw new Error(`Cannot route an inactive agent mode: ${modeDefinition.type}`)
	}

	if (!request.routing?.enabled) {
		return {
			active: false,
			partTypes: [...modeDefinition.parts],
			actionTypes: [...modeDefinition.actions],
		}
	}

	const route = resolveRoute(request, signals)
	const budget = {
		...COMPANION_CONTEXT_BUDGET,
		maxHistoryItems: clamp(
			request.routing.maxHistoryItems ?? COMPANION_CONTEXT_BUDGET.maxHistoryItems,
			1,
			COMPANION_CONTEXT_BUDGET.maxHistoryItems
		),
	}
	const partTypes: PromptPart['type'][] = [...COMMON_PARTS]

	if (request.contextItems.length > 0) partTypes.push('contextItems')
	if (route === 'isoflow-edit') {
		partTypes.push('isoflowContext')
	} else if (route === 'canvas-edit') {
		partTypes.push('selectedShapes', 'workbenchArtifacts')
		if (request.routing.includeBounds) {
			partTypes.push('blurryShapes', 'screenshot', 'userViewportBounds', 'agentViewportBounds')
		}
	} else if (signals.selectedShapeCount > 0) {
		partTypes.push('selectedShapes', 'workbenchArtifacts')
	}
	if (
		route !== 'isoflow-edit' &&
		(signals.selectedMarkdownDocumentCount ?? 0) > 0
	) {
		partTypes.push('markdownDocuments')
	}
	if (
		route !== 'isoflow-edit' &&
		hasExclusiveHtmlMockupSelection(signals)
	) {
		partTypes.push('htmlMockupContext')
	}
	if (
		route === 'canvas-edit' &&
		request.routing.domainPack === 'uiux' &&
		hasExclusiveDesignSystemSelection(signals)
	) {
		partTypes.push('designSystemContext')
	}

	const hydratedCapabilities = getHydratedCompanionCapabilities(route, request, signals)
	const actionTypes = getCompanionActionTypes(route, hydratedCapabilities)
	const surface =
		route === 'isoflow-edit'
			? ('isoflow' as const)
			: route === 'canvas-edit'
				? ('canvas' as const)
				: ('none' as const)
	const historyLength = signals.historyLength ?? 0
	const omitted = Math.max(0, historyLength - budget.maxHistoryItems)

	return {
		active: true,
		route,
		partTypes,
		actionTypes,
		metadata: {
			route,
			...(request.routing.domainPack ? { domainPack: request.routing.domainPack } : {}),
			contextBudget: budget,
			capabilityManifestVersion: COMPANION_CAPABILITY_MANIFEST_VERSION,
			capabilities: getAdvertisedCompanionCapabilities(route, {
				selectedHtmlMockupCount: hasExclusiveHtmlMockupSelection(signals)
					? 1
					: 0,
				selectedDesignSystemCount: hasExclusiveDesignSystemSelection(signals)
					? 1
					: 0,
				domainPack: request.routing.domainPack,
			}),
			hydratedCapabilities,
			permissionBoundary: {
				surface,
				mutations:
					route === 'isoflow-edit'
						? 'revision-guarded-transactions'
						: route === 'canvas-edit'
							? 'validated-actions'
							: 'none',
				credentials: 'external-only',
			},
			...(omitted > 0
				? {
						historyRef: `agent-history:${historyLength}:${budget.maxHistoryItems}`,
					}
				: {}),
		},
	}
}

function resolveRoute(request: AgentRequest, signals: CompanionRouteSignals): CompanionRoute {
	const text = request.agentMessages.join('\n')
	if (hasExclusiveHtmlMockupSelection(signals) && HTML_VARIANT_INTENT.test(text)) {
		return 'canvas-edit'
	}
	if (NATIVE_TLDRAW_DOMAIN_INTENT.test(text)) {
		return EDIT_INTENT.test(text) ? 'canvas-edit' : 'inquiry'
	}
	if (
		request.routing?.domainPack &&
		(request.routing.domainPack !== 'architecture' || !ISOFLOW_DOMAIN_INTENT.test(text))
	) {
		return EDIT_INTENT.test(text) ? 'canvas-edit' : 'inquiry'
	}

	const explicit = request.routing?.route
	if (explicit && explicit !== 'auto') {
		if (explicit === 'isoflow-edit' && signals.selectedIsoflowEmbedCount === 0) return 'inquiry'
		return explicit
	}

	if (signals.selectedIsoflowEmbedCount > 0 && ISOFLOW_DOMAIN_INTENT.test(text)) {
		return 'isoflow-edit'
	}
	if (EDIT_INTENT.test(text)) return 'canvas-edit'
	return 'inquiry'
}

function needsLayoutCapabilities(request: AgentRequest) {
	return (
		request.routing?.capabilityTier === 'extended' ||
		LAYOUT_INTENT.test(request.agentMessages.join('\n'))
	)
}

function getHydratedCompanionCapabilities(
	route: CompanionRoute,
	request: AgentRequest,
	signals: CompanionRouteSignals
): CompanionCapabilityId[] {
	if (route === 'inquiry') return ['core.respond']
	if (route === 'canvas-edit') {
		const hasSelectedHtmlMockup = hasExclusiveHtmlMockupSelection(signals)
		const hasSelectedDesignSystem =
			request.routing?.domainPack === 'uiux' &&
			hasExclusiveDesignSystemSelection(signals)
		const text = request.agentMessages.join('\n')
		return [
			'core.respond',
			'canvas.inspect-selection',
			'canvas.edit-shapes',
			...(needsLayoutCapabilities(request)
				? (['canvas.layout'] satisfies CompanionCapabilityId[])
				: []),
			...(hasSelectedDesignSystem
				? ([
						'design.inspect-selected-system',
					] satisfies CompanionCapabilityId[])
				: []),
			...(hasSelectedHtmlMockup
				? (['html.inspect-component'] satisfies CompanionCapabilityId[])
				: []),
			...(hasSelectedHtmlMockup &&
			(EDIT_INTENT.test(text) || HTML_VARIANT_INTENT.test(text))
				? (['html.create-variant'] satisfies CompanionCapabilityId[])
				: []),
		]
	}

	const text = request.agentMessages.join('\n')
	const mutationCapability = CREATE_VIEW_INTENT.test(text)
		? ('isoflow.create-view' as const)
		: EDIT_INTENT.test(text)
			? ('isoflow.patch' as const)
			: null

	return [
		'core.respond',
		'isoflow.inspect-selected-view',
		'isoflow.search',
		...(mutationCapability ? [mutationCapability] : []),
	]
}

function hasExclusiveHtmlMockupSelection(signals: CompanionRouteSignals) {
	return (
		signals.selectedShapeCount === 1 &&
		(signals.selectedHtmlMockupCount ?? 0) === 1
	)
}

function hasExclusiveDesignSystemSelection(signals: CompanionRouteSignals) {
	return (
		signals.selectedShapeCount === 1 &&
		(signals.selectedDesignSystemCount ?? 0) === 1
	)
}

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, Math.floor(value)))
}
