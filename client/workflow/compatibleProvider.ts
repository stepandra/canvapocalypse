export interface CompatibleModel {
	id: string
	name: string
}

const API_KEY_STORAGE_KEY = 'canvapocalypse.compatible-api-keys'
const cachedModelsByBaseUrl = new Map<string, CompatibleModel[]>()

export function normalizeCompatibleBaseUrl(baseUrl: string) {
	const normalized = baseUrl.trim().replace(/\/+$/, '')
	if (!normalized) return ''
	const parsed = new URL(normalized)
	if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
		throw new Error('Base URL must use http or https')
	}
	return parsed.toString().replace(/\/+$/, '')
}

export function getCompatibleApiKey(baseUrl: string) {
	if (typeof window === 'undefined') return ''
	const normalized = safeNormalize(baseUrl)
	if (!normalized) return ''
	try {
		const stored = JSON.parse(window.sessionStorage.getItem(API_KEY_STORAGE_KEY) ?? '{}') as Record<
			string,
			unknown
		>
		return typeof stored[normalized] === 'string' ? stored[normalized] : ''
	} catch {
		return ''
	}
}

export function setCompatibleApiKey(baseUrl: string, apiKey: string) {
	if (typeof window === 'undefined') return
	const normalized = normalizeCompatibleBaseUrl(baseUrl)
	const stored = readStoredKeys()
	const nextKey = apiKey.trim()
	if (nextKey) stored[normalized] = nextKey
	else delete stored[normalized]
	if (Object.keys(stored).length) {
		window.sessionStorage.setItem(API_KEY_STORAGE_KEY, JSON.stringify(stored))
	} else {
		window.sessionStorage.removeItem(API_KEY_STORAGE_KEY)
	}
}

export function getCachedCompatibleModels(baseUrl: string) {
	const normalized = safeNormalize(baseUrl)
	return normalized ? (cachedModelsByBaseUrl.get(normalized) ?? []) : []
}

export async function connectCompatibleProvider(baseUrl: string, apiKey: string) {
	const normalized = normalizeCompatibleBaseUrl(baseUrl)
	if (!normalized) throw new Error('Enter an OpenAI-compatible Base URL first')

	const response = await fetch('http://127.0.0.1:5176/compatible/models', {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			...(apiKey.trim() ? { Authorization: `Bearer ${apiKey.trim()}` } : {}),
		},
		body: JSON.stringify({ baseUrl: normalized }),
		cache: 'no-store',
	})
	if (!response.ok) {
		throw new Error((await response.text()) || `Model request failed (${response.status})`)
	}
	const payload = (await response.json()) as { data?: unknown }
	if (!Array.isArray(payload.data)) throw new Error('The endpoint returned an invalid model list')
	const models = payload.data
		.flatMap((value): CompatibleModel[] => {
			if (!value || typeof value !== 'object') return []
			const candidate = value as Record<string, unknown>
			if (typeof candidate.id !== 'string') return []
			return [{ id: candidate.id, name: typeof candidate.name === 'string' ? candidate.name : candidate.id }]
		})
		.sort((a, b) => a.name.localeCompare(b.name))
	if (!models.length) throw new Error('The endpoint returned no models; enter a model id manually')
	cachedModelsByBaseUrl.set(normalized, models)
	setCompatibleApiKey(normalized, apiKey)
	return models
}

export function clearCompatibleConnection(baseUrl: string) {
	const normalized = safeNormalize(baseUrl)
	if (!normalized) return
	setCompatibleApiKey(normalized, '')
	cachedModelsByBaseUrl.delete(normalized)
}

function readStoredKeys() {
	try {
		return JSON.parse(window.sessionStorage.getItem(API_KEY_STORAGE_KEY) ?? '{}') as Record<
			string,
			string
		>
	} catch {
		return {}
	}
}

function safeNormalize(baseUrl: string) {
	try {
		return normalizeCompatibleBaseUrl(baseUrl)
	} catch {
		return ''
	}
}
