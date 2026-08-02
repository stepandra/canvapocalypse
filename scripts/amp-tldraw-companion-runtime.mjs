const DEFAULT_BRIDGE_URL = 'http://127.0.0.1:5176'
const TERMINAL_STATUSES = new Set(['succeeded', 'failed'])

export function resolveLoopbackBridgeUrl(
	value = process.env.CANVAPOCALYPSE_BRIDGE_URL || DEFAULT_BRIDGE_URL
) {
	const url = new URL(value)
	const loopbackHosts = new Set(['127.0.0.1', 'localhost', '[::1]'])
	if (
		url.protocol !== 'http:' ||
		!loopbackHosts.has(url.hostname) ||
		url.username ||
		url.password ||
		url.search ||
		url.hash
	) {
		throw new Error('Canvapocalypse companion bridge must be an unauthenticated loopback HTTP URL')
	}
	url.pathname = url.pathname.replace(/\/+$/, '')
	return url.toString().replace(/\/$/, '')
}

export function createAmpTldrawCompanionClient({
	baseUrl = resolveLoopbackBridgeUrl(),
	fetchFn = fetch,
	pollIntervalMs = 250,
	timeoutMs = 120_000,
	delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
	const endpoint = `${baseUrl}/companion/canvas-tool`

	async function requestJson(path, init) {
		const response = await fetchFn(`${endpoint}${path}`, {
			cache: 'no-store',
			...init,
			headers: {
				...(init?.body ? { 'Content-Type': 'application/json' } : {}),
				...init?.headers,
			},
		})
		const text = await response.text()
		if (!response.ok) {
			throw new Error(text || `tldraw companion bridge returned HTTP ${response.status}`)
		}
		return text ? JSON.parse(text) : null
	}

	return {
		async capabilities() {
			return requestJson('/capabilities')
		},

		async describe(input) {
			return requestJson('/capabilities/describe', {
				method: 'POST',
				body: JSON.stringify(input),
			})
		},

		async execute(input) {
			const queued = await requestJson('/execute', {
				method: 'POST',
				body: JSON.stringify({
					...input,
					actor: 'amp',
					source: 'amp-plugin',
				}),
			})
			if (queued && TERMINAL_STATUSES.has(queued.status)) {
				return queued
			}
			const deadline = Date.now() + timeoutMs
			while (Date.now() <= deadline) {
				const status = await requestJson(
					`/status?requestId=${encodeURIComponent(queued.id)}`
				)
				if (status?.request && TERMINAL_STATUSES.has(status.request.status)) {
					return status.request
				}
				await delay(pollIntervalMs)
			}
			throw new Error(
				`tldraw companion request ${queued.id} timed out waiting for the local canvas receipt`
			)
		},
	}
}
