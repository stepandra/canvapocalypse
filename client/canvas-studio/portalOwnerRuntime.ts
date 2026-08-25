import type { CanvasKitComposition } from './types'

const GROK_SERVICE_ID = 'grok.workflow.supervisor'
const GROK_SUPERVISOR_ROUTE = '/__canvas-grok-supervisor'
const GROK_CONFIG_ROUTE = '/__canvas-grok-config'
const HERMES_FLIGHT_DECK_SERVICE_ID = 'hermes.flight-deck.bridge'
const HERMES_FLIGHT_DECK_ROUTE = '/__canvas-hermes'

export interface CanvasStudioPortalBridgeRoute {
	readonly prefix: string
	readonly stripPrefix?: boolean
}

export interface CanvasStudioPortalBridge {
	readonly serviceId: string
	readonly kitId?: string
	readonly routes: readonly CanvasStudioPortalBridgeRoute[]
}

export interface CanvasStudioPortalRuntime {
	readonly projectApi: string
	readonly sourceApi: string
	readonly inventorySha256: string
	readonly publicUrl?: string
	readonly bridges: readonly CanvasStudioPortalBridge[]
}

type HermesFlightDeckRuntime = {
	readonly apiBase?: string
	readonly fetch?: typeof globalThis.fetch
	readonly actions?: Readonly<Record<string, unknown>>
}

type PortalOwnerRuntimeScope = {
	__AM_GROK_CONFIG_BASE__?: string
	__AM_GROK_SUPERVISOR_BASE__?: string
	__HERMES_FLIGHT_DECK_RUNTIME__?: HermesFlightDeckRuntime
}

/** Installs only Canvas Studio-declared owner routes before editor mount. */
export function installCanvasStudioPortalOwnerRuntime(
	composition: CanvasKitComposition,
	runtime: CanvasStudioPortalRuntime,
	scope: PortalOwnerRuntimeScope = globalThis as PortalOwnerRuntimeScope
) {
	const restores: Array<() => void> = []

	if (composition.getContribution('grok.workflow')) {
		const supervisor = ownerRoute(
			runtime,
			GROK_SERVICE_ID,
			'grok.workflow',
			GROK_SUPERVISOR_ROUTE
		)
		const config = ownerRoute(
			runtime,
			GROK_SERVICE_ID,
			'grok.workflow',
			GROK_CONFIG_ROUTE
		)
		restores.push(
			setTemporaryProperty(
				scope,
				'__AM_GROK_SUPERVISOR_BASE__',
				supervisor.prefix
			),
			setTemporaryProperty(scope, '__AM_GROK_CONFIG_BASE__', config.prefix)
		)
	}

	if (composition.getContribution('hermes.flight-deck')) {
		const hermes = ownerRoute(
			runtime,
			HERMES_FLIGHT_DECK_SERVICE_ID,
			'hermes.flight-deck',
			HERMES_FLIGHT_DECK_ROUTE
		)
		restores.push(
			setTemporaryProperty(scope, '__HERMES_FLIGHT_DECK_RUNTIME__', {
				...scope.__HERMES_FLIGHT_DECK_RUNTIME__,
				apiBase: hermes.prefix,
			})
		)
	}

	let disposed = false
	return () => {
		if (disposed) return
		disposed = true
		for (let index = restores.length - 1; index >= 0; index -= 1) {
			restores[index]()
		}
	}
}

function ownerRoute(
	runtime: CanvasStudioPortalRuntime,
	serviceId: string,
	kitId: string,
	prefix: string
) {
	const bridge = runtime.bridges.find(
		(candidate) =>
			candidate.serviceId === serviceId &&
			(candidate.kitId === undefined || candidate.kitId === kitId)
	)
	if (!bridge) {
		throw new Error(`Locked Canvas Studio ${kitId} requires bridge ${serviceId}`)
	}
	const routes = bridge.routes.filter((route) => route.prefix === prefix)
	if (routes.length !== 1 || routes[0].stripPrefix !== true) {
		throw new Error(
			`Locked Canvas Studio bridge ${serviceId} requires strip-prefix route ${prefix}`
		)
	}
	return routes[0]
}

function setTemporaryProperty<
	Scope extends object,
	Key extends keyof Scope,
>(scope: Scope, key: Key, value: Scope[Key]) {
	const owned = Object.prototype.hasOwnProperty.call(scope, key)
	const previous = scope[key]
	scope[key] = value
	return () => {
		if (owned) scope[key] = previous
		else delete scope[key]
	}
}
