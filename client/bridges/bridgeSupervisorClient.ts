export const BRIDGE_SUPERVISOR_ORIGIN = 'http://127.0.0.1:5177' as const
export const BRIDGE_SUPERVISOR_CAPABILITY_HEADER =
	'x-tldraw-html-capability' as const

const BRIDGE_SUPERVISOR_BROWSER_ORIGINS = new Set([
	'http://127.0.0.1:5173',
	'http://localhost:5173',
	'http://127.0.0.1:5175',
	'http://localhost:5175',
])
const RESIDENT_CAPABILITY_PATTERN = /^hr_[A-Za-z0-9_-]{43,128}$/
const SERVICE_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/i
const MAX_LABEL_CHARS = 80
const MAX_DETAIL_CHARS = 240
const MAX_CAPABILITY_CHARS = 48

export const BRIDGE_SERVICE_STATES = [
	'stopped',
	'starting',
	'healthy',
	'degraded',
	'external',
	'port-conflict',
	'stopping',
] as const

export type BridgeServiceState = (typeof BRIDGE_SERVICE_STATES)[number]
export type BridgeServiceAction = 'check' | 'start' | 'stop' | 'restart'
export type BridgeAggregateState =
	| 'unknown'
	| 'idle'
	| 'transition'
	| 'healthy'
	| 'attention'

export interface BridgeService {
	id: string
	label: string
	state: BridgeServiceState
	controllable: boolean
	managedSafe: boolean
	detail?: string
	capabilities: readonly string[]
}

export interface BridgeServiceListing {
	services: readonly BridgeService[]
	checkedAt?: string
}

let residentCapability: string | null = null
let residentCapabilityBootstrap: Promise<string> | null = null

/**
 * Installs host authority into module closure. The Offline build injects this
 * value beside the existing Local HTML capability; it is never stored on
 * window, canvas metadata, or a model-visible record.
 */
export function installBridgeSupervisorResidentCapability(value: string): void {
	residentCapability = normalizeResidentCapability(value)
	residentCapabilityBootstrap = null
}

export async function listBridgeServices(
	signal?: AbortSignal
): Promise<BridgeServiceListing> {
	const payload = await requestJson('/api/services', signal)
	if (!isRecord(payload) || !Array.isArray(payload.services)) {
		throw new Error('Invalid bridge supervisor service list')
	}
	return {
		services: payload.services.map(normalizeBridgeService),
		...(normalizeCheckedAt(payload.checkedAt)
			? { checkedAt: normalizeCheckedAt(payload.checkedAt) }
			: {}),
	}
}

export async function runBridgeServiceAction(
	service: BridgeService,
	action: BridgeServiceAction,
	signal?: AbortSignal
): Promise<BridgeService> {
	if (!canRunBridgeServiceAction(service, action)) {
		throw new Error(`${action} is not allowed for ${service.label}`)
	}
	const payload = await requestJson(
		`/api/services/${encodeURIComponent(service.id)}/${action}`,
		signal,
		{ method: 'POST' }
	)
	if (!isRecord(payload)) {
		throw new Error('Invalid bridge supervisor action response')
	}
	return normalizeBridgeService(
		isRecord(payload.service) ? payload.service : payload
	)
}

export function canRunBridgeServiceAction(
	service: Pick<
		BridgeService,
		'state' | 'controllable' | 'managedSafe'
	>,
	action: BridgeServiceAction
): boolean {
	if (action === 'check') return true
	if (action === 'start') {
		return service.controllable && service.state === 'stopped'
	}
	if (!service.controllable || !service.managedSafe) return false
	if (action === 'stop') {
		return (
			service.state === 'starting' ||
			service.state === 'healthy' ||
			service.state === 'degraded'
		)
	}
	return service.state === 'healthy' || service.state === 'degraded'
}

export function summarizeBridgeServices(
	services: readonly Pick<BridgeService, 'state'>[]
): BridgeAggregateState {
	if (services.length === 0) return 'unknown'
	if (
		services.some(
			(service) =>
				service.state === 'degraded' ||
				service.state === 'port-conflict'
		)
	) {
		return 'attention'
	}
	if (
		services.some(
			(service) =>
				service.state === 'starting' || service.state === 'stopping'
		)
	) {
		return 'transition'
	}
	if (
		services.some(
			(service) =>
				service.state === 'healthy' || service.state === 'external'
		)
	) {
		return 'healthy'
	}
	return 'idle'
}

export function normalizeBridgeService(value: unknown): BridgeService {
	if (!isRecord(value)) throw new Error('Invalid bridge supervisor service')
	const id =
		typeof value.id === 'string' && SERVICE_ID_PATTERN.test(value.id)
			? value.id
			: ''
	const label = normalizeText(value.label, MAX_LABEL_CHARS)
	const state = isBridgeServiceState(value.state) ? value.state : null
	if (!id || !label || !state) {
		throw new Error('Invalid bridge supervisor service')
	}
	const detail = normalizeText(value.detail, MAX_DETAIL_CHARS)
	const capabilities = Array.isArray(value.capabilities)
		? value.capabilities
				.map((capability) =>
					normalizeText(capability, MAX_CAPABILITY_CHARS)
				)
				.filter((capability): capability is string => Boolean(capability))
		: []
	return {
		id,
		label,
		state,
		controllable: value.controllable === true,
		managedSafe: value.managedSafe === true,
		...(detail ? { detail } : {}),
		capabilities: [...new Set(capabilities)].slice(0, 12),
	}
}

export function assertBridgeSupervisorOrigin(
	value: string = BRIDGE_SUPERVISOR_ORIGIN
): typeof BRIDGE_SUPERVISOR_ORIGIN {
	let parsed: URL
	try {
		parsed = new URL(value)
	} catch {
		throw new Error('Invalid bridge supervisor origin')
	}
	if (
		parsed.origin !== BRIDGE_SUPERVISOR_ORIGIN ||
		parsed.pathname !== '/' ||
		parsed.search ||
		parsed.hash ||
		parsed.username ||
		parsed.password
	) {
		throw new Error('Bridge supervisor origin is not allowlisted')
	}
	return BRIDGE_SUPERVISOR_ORIGIN
}

async function requestJson(
	pathname: string,
	signal?: AbortSignal,
	init: Pick<RequestInit, 'method'> = {}
): Promise<unknown> {
	const response = await fetchBridgeSupervisor(pathname, {
		method: init.method ?? 'GET',
		headers: { accept: 'application/json' },
		signal,
	})
	if (!response.ok) {
		throw new Error(`Bridge supervisor returned HTTP ${response.status}`)
	}
	return response.json()
}

export async function fetchBridgeSupervisor(
	input: string | URL,
	init: RequestInit = {}
): Promise<Response> {
	const supervisorOrigin = assertBridgeSupervisorOrigin()
	const destination = new URL(String(input), supervisorOrigin)
	if (
		destination.origin !== supervisorOrigin ||
		destination.username ||
		destination.password
	) {
		throw new Error('Bridge supervisor request is not allowlisted')
	}
	const capability = await getBridgeSupervisorResidentCapability(init.signal)
	const headers = new Headers(init.headers)
	headers.set(BRIDGE_SUPERVISOR_CAPABILITY_HEADER, capability)
	return fetch(destination, {
		...init,
		headers,
		credentials: 'omit',
		cache: 'no-store',
		referrerPolicy: 'no-referrer',
	})
}

async function getBridgeSupervisorResidentCapability(
	signal?: AbortSignal | null
): Promise<string> {
	if (residentCapability) return residentCapability
	if (typeof location === 'undefined' || location.protocol === 'file:') {
		throw new Error(
			'Bridge supervisor resident capability was not provisioned by the Offline host'
		)
	}
	if (!BRIDGE_SUPERVISOR_BROWSER_ORIGINS.has(location.origin)) {
		throw new Error('Bridge supervisor browser origin is not allowlisted')
	}
	residentCapabilityBootstrap ??= bootstrapBridgeSupervisorCapability()
	try {
		const capability = await abortable(
			residentCapabilityBootstrap,
			signal ?? undefined
		)
		residentCapability = capability
		return capability
	} catch (error) {
		residentCapabilityBootstrap = null
		throw error
	}
}

async function bootstrapBridgeSupervisorCapability(): Promise<string> {
	const response = await fetch(
		new URL('/api/session', assertBridgeSupervisorOrigin()),
		{
			method: 'POST',
			headers: { accept: 'application/json' },
			credentials: 'omit',
			cache: 'no-store',
			referrerPolicy: 'no-referrer',
		}
	)
	if (!response.ok) {
		throw new Error(
			`Bridge supervisor capability bootstrap returned HTTP ${response.status}`
		)
	}
	const payload: unknown = await response.json()
	if (!isRecord(payload)) {
		throw new Error('Invalid bridge supervisor capability bootstrap')
	}
	return normalizeResidentCapability(payload.capability)
}

function normalizeResidentCapability(value: unknown): string {
	if (
		typeof value !== 'string' ||
		!RESIDENT_CAPABILITY_PATTERN.test(value)
	) {
		throw new Error('Invalid bridge supervisor resident capability')
	}
	return value
}

function isBridgeServiceState(value: unknown): value is BridgeServiceState {
	return (
		typeof value === 'string' &&
		BRIDGE_SERVICE_STATES.includes(value as BridgeServiceState)
	)
}

function normalizeCheckedAt(value: unknown): string | undefined {
	return typeof value === 'string' && Number.isFinite(Date.parse(value))
		? value
		: undefined
}

function normalizeText(value: unknown, maxChars: number): string | undefined {
	if (typeof value !== 'string') return undefined
	const text = value.replace(/\s+/g, ' ').trim()
	if (!text || /[\u0000-\u001f\u007f]/.test(text)) return undefined
	return text.length <= maxChars
		? text
		: `${text.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`
}

function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
	if (!signal) return promise
	if (signal.aborted) {
		return Promise.reject(
			signal.reason ?? new DOMException('Aborted', 'AbortError')
		)
	}
	return new Promise<T>((resolve, reject) => {
		const onAbort = () =>
			reject(signal.reason ?? new DOMException('Aborted', 'AbortError'))
		signal.addEventListener('abort', onAbort, { once: true })
		promise.then(
			(value) => {
				signal.removeEventListener('abort', onAbort)
				resolve(value)
			},
			(error) => {
				signal.removeEventListener('abort', onAbort)
				reject(error)
			}
		)
	})
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value)
}
