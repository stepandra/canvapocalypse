const DIRECT_SUPERVISOR_ORIGIN = 'http://127.0.0.1:5187'
const DIRECT_CONFIG_ORIGIN = 'http://127.0.0.1:5188'
const PROXIED_SUPERVISOR_PATH = '/__canvas-grok-supervisor'
const PROXIED_CONFIG_PATH = '/__canvas-grok-config'

const CAPABILITY_PATTERN = /^gk_[A-Za-z0-9_-]{24,128}$/

type GrokBridgeGlobals = typeof globalThis & {
	__AM_GROK_CONFIG_TOKEN__?: string
	__AM_GROK_CONFIG_BASE__?: string
	__AM_GROK_SUPERVISOR_BASE__?: string
}

export function resolveGrokBridgeEndpoints(
	locationValue: Pick<Location, 'protocol' | 'hostname' | 'origin'> | undefined =
		typeof location === 'undefined' ? undefined : location
) {
	const isWeb =
		locationValue?.protocol === 'http:' || locationValue?.protocol === 'https:'
	const isLoopback =
		locationValue?.hostname === '127.0.0.1' ||
		locationValue?.hostname === 'localhost'
	if (isWeb && !isLoopback && locationValue?.origin) {
		return {
			supervisor: `${locationValue.origin}${PROXIED_SUPERVISOR_PATH}`,
			config: `${locationValue.origin}${PROXIED_CONFIG_PATH}`,
		}
	}
	return {
		supervisor: DIRECT_SUPERVISOR_ORIGIN,
		config: DIRECT_CONFIG_ORIGIN,
	}
}

let activation: Promise<void> | null = null

export function installGrokCanvasBridge(): Promise<void> {
	const scope = globalThis as GrokBridgeGlobals
	const endpoints = resolveGrokBridgeEndpoints()
	const existing = scope.__AM_GROK_CONFIG_TOKEN__?.trim()
	if (
		existing &&
		CAPABILITY_PATTERN.test(existing) &&
		scope.__AM_GROK_CONFIG_BASE__ === endpoints.config
	) {
		return Promise.resolve()
	}

	activation ??= activateGrokCanvasBridge(scope, endpoints).catch((error) => {
		activation = null
		throw error
	})
	return activation
}

async function activateGrokCanvasBridge(
	scope: GrokBridgeGlobals,
	endpoints: ReturnType<typeof resolveGrokBridgeEndpoints>
) {
	const sessionResponse = await fetch(`${endpoints.supervisor}/api/session`, {
		method: 'GET',
		headers: { accept: 'application/json' },
		credentials: 'omit',
		cache: 'no-store',
		referrerPolicy: 'no-referrer',
	})
	const session = (await sessionResponse.json().catch(() => null)) as {
		capability?: unknown
		message?: unknown
	} | null
	if (!sessionResponse.ok) {
		throw new Error(
			typeof session?.message === 'string'
				? session.message
				: `Grok bridge returned HTTP ${sessionResponse.status}`
		)
	}
	const capability =
		typeof session?.capability === 'string' ? session.capability.trim() : ''
	if (!CAPABILITY_PATTERN.test(capability)) {
		throw new Error('Grok bridge returned an invalid resident capability')
	}

	const healthResponse = await fetch(`${endpoints.config}/api/grok/health`, {
		headers: {
			accept: 'application/json',
			Authorization: `Bearer ${capability}`,
		},
		credentials: 'omit',
		cache: 'no-store',
		referrerPolicy: 'no-referrer',
	})
	if (!healthResponse.ok) {
		throw new Error(`Grok config bridge returned HTTP ${healthResponse.status}`)
	}

	scope.__AM_GROK_CONFIG_TOKEN__ = capability
	scope.__AM_GROK_CONFIG_BASE__ = endpoints.config
	scope.__AM_GROK_SUPERVISOR_BASE__ = endpoints.supervisor
}
