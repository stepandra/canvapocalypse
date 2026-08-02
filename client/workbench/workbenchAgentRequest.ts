import type { BoxModel } from 'tldraw'
import type { AgentRequest } from '../../shared/types/AgentRequest'
import type { ContextItem } from '../../shared/types/ContextItem'
import type { WorkbenchDomain } from './domainPacks'

export type WorkbenchAgentContextMode = 'selection' | 'visible-area'

export type WorkbenchAgentInput = Pick<
	AgentRequest,
	'agentMessages' | 'userMessages' | 'source' | 'contextItems' | 'routing'
> &
	Partial<Pick<AgentRequest, 'bounds'>>

export type WorkbenchAgentRequestErrorCode =
	| 'empty-message'
	| 'selection-required'
	| 'invalid-visible-area'

export class WorkbenchAgentRequestError extends Error {
	constructor(
		public readonly code: WorkbenchAgentRequestErrorCode,
		message: string
	) {
		super(message)
		this.name = 'WorkbenchAgentRequestError'
	}
}

export interface BuildWorkbenchAgentInputOptions {
	message: string
	domainPack: WorkbenchDomain
	contextMode: WorkbenchAgentContextMode
	selectedShapeCount: number
	viewportBounds?: BoxModel
	contextItems: readonly ContextItem[]
}

const MUTATION_INTENT =
	/(?:\b(?:create|draw|build|generate|compose|visualize|add|edit|update|change|move|delete|remove|rename|label|resize|rotate|align|distribute|stack|arrange|patch|connect|disconnect|wireframe|mockup)\w*|(?:созда|нарис|постро|сгенер|скомпон|визуализ|добав|измен|перемест|удал|переимен|подпис|выровн|распредел|соедин|макет|вайрфрейм)[\p{L}\p{M}]*)/iu

const INQUIRY_PREFIX =
	/^\s*(?:(?:how|why|what|which|where|when|explain|describe|review|inspect|analy[sz]e|summari[sz]e|compare)\b|(?:как|зачем|почему|что|какой|где|когда|объясни|опиши|проанализируй|сравни|проверь)(?:\s|$))/iu

const MAX_CONTEXT_ITEMS = 12
const MAX_HISTORY_ITEMS = 6

/**
 * A conservative mutation classifier for the compact dock. Question-shaped
 * prompts remain inquiries even when they mention an editing verb.
 */
export function isWorkbenchCanvasMutationRequest(message: string) {
	const normalized = message.trim()
	if (normalized === '' || INQUIRY_PREFIX.test(normalized)) return false
	return MUTATION_INTENT.test(normalized)
}

/**
 * Builds the bounded request contract shared by every workbench domain pack.
 *
 * Selection mode never opts into viewport context. Visible-area mode is an
 * explicit user choice and therefore includes one finite viewport rectangle.
 */
export function buildWorkbenchAgentInput({
	message,
	domainPack,
	contextMode,
	selectedShapeCount,
	viewportBounds,
	contextItems,
}: BuildWorkbenchAgentInputOptions): WorkbenchAgentInput {
	const normalizedMessage = message.trim()
	if (normalizedMessage === '') {
		throw new WorkbenchAgentRequestError('empty-message', 'Enter a request first.')
	}

	if (
		contextMode === 'selection' &&
		selectedShapeCount < 1 &&
		isWorkbenchCanvasMutationRequest(normalizedMessage)
	) {
		throw new WorkbenchAgentRequestError(
			'selection-required',
			'Select at least one shape, or explicitly use the visible bounded area.'
		)
	}

	const boundedArea =
		contextMode === 'visible-area' ? normalizeVisibleArea(viewportBounds) : undefined

	return {
		agentMessages: [normalizedMessage],
		userMessages: [normalizedMessage],
		source: 'user',
		contextItems: contextItems.slice(0, MAX_CONTEXT_ITEMS),
		...(boundedArea ? { bounds: boundedArea } : {}),
		routing: {
			enabled: true,
			route: 'auto',
			domainPack,
			maxHistoryItems: MAX_HISTORY_ITEMS,
			...(boundedArea ? { includeBounds: true } : {}),
		},
	}
}

function normalizeVisibleArea(bounds: BoxModel | undefined): BoxModel {
	if (
		!bounds ||
		![bounds.x, bounds.y, bounds.w, bounds.h].every(Number.isFinite) ||
		bounds.w <= 0 ||
		bounds.h <= 0
	) {
		throw new WorkbenchAgentRequestError(
			'invalid-visible-area',
			'The visible canvas area is unavailable. Reframe the canvas and try again.'
		)
	}

	return {
		x: bounds.x,
		y: bounds.y,
		w: bounds.w,
		h: bounds.h,
	}
}
