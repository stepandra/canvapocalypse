import { ML_INTERN_EVAL_LAB_MODEL_NAME } from '../../shared/models'
import { buildResponseSchema } from '../../shared/schema/buildResponseSchema'
import { getActionSchemaForMode } from '../../shared/types/AgentAction'
import type { AgentAction } from '../../shared/types/AgentAction'
import type { AgentPrompt, BaseAgentPrompt } from '../../shared/types/AgentPrompt'
import type { Streaming } from '../../shared/types/Streaming'

export const ML_INTERN_EVAL_LAB_ENDPOINT = 'http://127.0.0.1:5176/ml-intern/eval-lab'
export const ML_INTERN_CONTEXT_FILE_DATA_TYPE = 'ml-intern-context-file'
export const EVAL_LAB_WAVE1_CONTEXT_REF =
	'FINAL_BOSS/runbooks/eval-lab-generator-model-selection-wave1.md'

const ALLOWED_CONTEXT_PARTS = [
	'mode',
	'messages',
	'data',
	'contextItems',
	'blurryShapes',
	'selectedShapes',
	'userViewportBounds',
	'agentViewportBounds',
	'chatHistory',
] as const

export function isMlInternEvalLabPrompt(prompt: BaseAgentPrompt): prompt is AgentPrompt {
	return (
		(prompt.modelName as AgentPrompt['modelName'] | undefined)?.modelName ===
		ML_INTERN_EVAL_LAB_MODEL_NAME
	)
}

export function buildMlInternEvalLabRequest(prompt: AgentPrompt) {
	const mode = prompt.mode
	if (!mode || mode.routing?.route !== 'canvas-edit') {
		throw new Error('ML-Intern Eval Lab requires the bounded canvas-edit route')
	}
	const contextFileRefs = (prompt.data?.data ?? []).flatMap((item) => {
		if (
			!item ||
			typeof item !== 'object' ||
			Array.isArray(item) ||
			item.type !== ML_INTERN_CONTEXT_FILE_DATA_TYPE ||
			typeof item.ref !== 'string'
		) {
			return []
		}
		return [item.ref]
	})

	const context = Object.fromEntries(
		ALLOWED_CONTEXT_PARTS.flatMap((partType) => {
			const part = prompt[partType]
			return part ? [[partType, part]] : []
		})
	)

	return {
		profile: 'eval_lab' as const,
		context,
		contextFileRefs,
		responseSchema: buildResponseSchema(mode.actionTypes, mode.modeType),
	}
}

export function parseMlInternEvalLabAction(
	value: unknown,
	prompt: AgentPrompt
): Streaming<AgentAction> {
	if (!value || typeof value !== 'object') {
		throw new Error('ML-Intern returned a non-object canvas action')
	}

	const { complete, time, ...candidate } = value as Record<string, unknown>
	if (complete !== true || typeof time !== 'number') {
		throw new Error('ML-Intern returned an incomplete canvas action')
	}

	const actionType = candidate._type
	if (typeof actionType !== 'string' || !prompt.mode.actionTypes.includes(actionType as AgentAction['_type'])) {
		throw new Error(`ML-Intern returned an action outside the Eval Lab grant: ${String(actionType)}`)
	}

	const schema = getActionSchemaForMode(actionType, prompt.mode.modeType)
	const parsed = schema?.safeParse(candidate)
	if (!parsed?.success) {
		throw new Error(`ML-Intern returned an invalid ${actionType} action`)
	}

	return {
		...(parsed.data as AgentAction),
		complete: true,
		time,
	}
}
