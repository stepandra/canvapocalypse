export interface WorkflowLlmRequest {
	input: string
	instructions: string
	model?: string
	provider?: 'amp' | 'builtin' | 'openrouter' | 'compatible'
	baseUrl?: string
	runId?: string
}

const MAX_INPUT_LENGTH = 20_000
const MAX_INSTRUCTIONS_LENGTH = 8_000
const MAX_BASE_URL_LENGTH = 2_000

export function parseWorkflowLlmRequest(value: unknown): WorkflowLlmRequest {
	if (!value || typeof value !== 'object') throw new Error('Workflow LLM request must be an object')
	const candidate = value as Record<string, unknown>
	const input = typeof candidate.input === 'string' ? candidate.input.trim() : ''
	const instructions =
		typeof candidate.instructions === 'string' ? candidate.instructions.trim() : ''
	const model = typeof candidate.model === 'string' ? candidate.model.trim() : undefined
	const provider =
		candidate.provider === 'amp' ||
		candidate.provider === 'builtin' ||
		candidate.provider === 'openrouter' ||
		candidate.provider === 'compatible'
			? candidate.provider
			: undefined
	const baseUrl = typeof candidate.baseUrl === 'string' ? candidate.baseUrl.trim() : undefined
	const runId = typeof candidate.runId === 'string' ? candidate.runId.trim() : undefined

	if (!input) throw new Error('Workflow LLM input is required')
	if (!instructions) throw new Error('Workflow LLM instructions are required')
	if (input.length > MAX_INPUT_LENGTH) throw new Error('Workflow LLM input is too long')
	if (instructions.length > MAX_INSTRUCTIONS_LENGTH) {
		throw new Error('Workflow LLM instructions are too long')
	}

	if (provider === 'openrouter' && !model) throw new Error('OpenRouter model is required')
	if (provider === 'compatible') {
		if (!model) throw new Error('OpenAI-compatible model is required')
		if (!baseUrl) throw new Error('OpenAI-compatible Base URL is required')
		if (baseUrl.length > MAX_BASE_URL_LENGTH) throw new Error('Base URL is too long')
		const parsedBaseUrl = new URL(baseUrl)
		if (parsedBaseUrl.protocol !== 'http:' && parsedBaseUrl.protocol !== 'https:') {
			throw new Error('Base URL must use http or https')
		}
	}

	return {
		input,
		instructions,
		...(model ? { model } : {}),
		...(provider ? { provider } : {}),
		...(baseUrl ? { baseUrl } : {}),
		...(runId ? { runId } : {}),
	}
}
