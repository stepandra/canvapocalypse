export interface OpenRouterModel {
	id: string
	name: string
	contextLength: number | null
	promptPrice: string | null
	completionPrice: string | null
}

const API_KEY_STORAGE_KEY = 'canvapocalypse.openrouter-api-key'
let cachedModels: OpenRouterModel[] = []

export function getOpenRouterApiKey() {
	if (typeof window === 'undefined') return ''
	return window.sessionStorage.getItem(API_KEY_STORAGE_KEY) ?? ''
}

export function setOpenRouterApiKey(apiKey: string) {
	if (typeof window === 'undefined') return
	const normalized = apiKey.trim()
	if (normalized) window.sessionStorage.setItem(API_KEY_STORAGE_KEY, normalized)
	else window.sessionStorage.removeItem(API_KEY_STORAGE_KEY)
}

export function getCachedOpenRouterModels() {
	return cachedModels
}

export async function connectOpenRouter(apiKey: string): Promise<OpenRouterModel[]> {
	const normalized = apiKey.trim()
	if (!normalized) throw new Error('Paste an OpenRouter API key first')

	const request = () => ({
		method: 'GET',
		headers: { Authorization: `Bearer ${normalized}` },
	} satisfies RequestInit)

	let response: Response
	try {
		response = await fetch('http://127.0.0.1:5176/openrouter/models', request())
	} catch {
		response = await fetch('/workflow/openrouter/models', request())
	}

	if (!response.ok) {
		throw new Error(
			(await readOpenRouterError(response)) || `OpenRouter model request failed (${response.status})`
		)
	}

	const payload = (await response.json()) as { data?: unknown }
	if (!Array.isArray(payload.data)) throw new Error('OpenRouter returned an invalid model list')

	cachedModels = payload.data
		.flatMap((value): OpenRouterModel[] => {
			if (!value || typeof value !== 'object') return []
			const model = value as Record<string, unknown>
			if (typeof model.id !== 'string' || typeof model.name !== 'string') return []
			return [
				{
					id: model.id,
					name: model.name,
					contextLength:
						typeof model.context_length === 'number' ? model.context_length : null,
					promptPrice:
						model.pricing &&
						typeof model.pricing === 'object' &&
						typeof (model.pricing as Record<string, unknown>).prompt === 'string'
							? ((model.pricing as Record<string, unknown>).prompt as string)
							: null,
					completionPrice:
						model.pricing &&
						typeof model.pricing === 'object' &&
						typeof (model.pricing as Record<string, unknown>).completion === 'string'
							? ((model.pricing as Record<string, unknown>).completion as string)
							: null,
				},
			]
		})
		.sort((a, b) => a.name.localeCompare(b.name))

	if (!cachedModels.length) throw new Error('OpenRouter returned no text models')
	setOpenRouterApiKey(normalized)
	return cachedModels
}

export function clearOpenRouterConnection() {
	setOpenRouterApiKey('')
	cachedModels = []
}

export function formatOpenRouterModelLabel(model: OpenRouterModel) {
	const inputPerMillion = model.promptPrice ? Number(model.promptPrice) * 1_000_000 : Number.NaN
	const price =
		Number.isFinite(inputPerMillion) && inputPerMillion >= 0
			? ` · $${inputPerMillion.toFixed(2)}/M in`
			: ''
	const context = model.contextLength
		? ` · ${Math.round(model.contextLength / 1000).toLocaleString()}k ctx`
		: ''
	return `${model.name}${context}${price}`
}

async function readOpenRouterError(response: Response) {
	const text = await response.text()
	try {
		const payload = JSON.parse(text) as { error?: { message?: unknown } }
		if (typeof payload.error?.message === 'string') return payload.error.message
	} catch {
		// Plain-text proxy errors are already suitable for display.
	}
	return text
}
