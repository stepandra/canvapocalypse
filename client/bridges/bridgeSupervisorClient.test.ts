import { afterEach, describe, expect, it, vi } from 'vitest'
import {
	BridgeService,
	canRunBridgeServiceAction,
	normalizeBridgeService,
	summarizeBridgeServices,
} from './bridgeSupervisorClient'

const CAPABILITY = `hr_${'S'.repeat(43)}`

afterEach(() => {
	vi.unstubAllGlobals()
	vi.resetModules()
})

describe('bridge supervisor client', () => {
	it('bootstraps only from an exact local browser and keeps authority in request headers', async () => {
		vi.stubGlobal('location', {
			protocol: 'http:',
			origin: 'http://127.0.0.1:5175',
		})
		const fetchMock = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ capability: CAPABILITY }), {
					status: 200,
					headers: { 'content-type': 'application/json' },
				})
			)
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						services: [
							{
								id: 'workbench',
								label: 'Workbench Bridge',
								state: 'stopped',
								controllable: true,
								managedSafe: false,
							},
							{
								id: 'kanban',
								label: 'Kanban',
								state: 'external',
								controllable: false,
								managedSafe: false,
							},
						],
					}),
					{
						status: 200,
						headers: { 'content-type': 'application/json' },
					}
				)
			)
		vi.stubGlobal('fetch', fetchMock)
		const client = await import('./bridgeSupervisorClient')

		const listing = await client.listBridgeServices()

		expect(listing.services).toHaveLength(2)
		expect(String(fetchMock.mock.calls[0][0])).toBe(
			'http://127.0.0.1:5177/api/session'
		)
		expect(fetchMock.mock.calls[0][1]?.method).toBe('POST')
		expect(String(fetchMock.mock.calls[1][0])).toBe(
			'http://127.0.0.1:5177/api/services'
		)
		expect(
			new Headers(fetchMock.mock.calls[1][1]?.headers).get(
				'x-tldraw-html-capability'
			)
		).toBe(CAPABILITY)
		expect(JSON.stringify(listing)).not.toContain(CAPABILITY)
	})

	it('fails closed for foreign browser origins instead of attempting bootstrap', async () => {
		vi.stubGlobal('location', {
			protocol: 'https:',
			origin: 'https://example.com',
		})
		const fetchMock = vi.fn<typeof fetch>()
		vi.stubGlobal('fetch', fetchMock)
		const client = await import('./bridgeSupervisorClient')

		await expect(client.listBridgeServices()).rejects.toThrow(
			'browser origin is not allowlisted'
		)
		expect(fetchMock).not.toHaveBeenCalled()
	})

	it('uses the same-origin proxy from an Amp portal renderer', async () => {
		vi.stubGlobal('location', {
			protocol: 'https:',
			origin: 'https://canvas.onamp.dev',
		})
		const fetchMock = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ capability: CAPABILITY }), {
					status: 200,
				})
			)
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ services: [] }), { status: 200 })
			)
		vi.stubGlobal('fetch', fetchMock)
		const client = await import('./bridgeSupervisorClient')

		await client.listBridgeServices()

		expect(String(fetchMock.mock.calls[0][0])).toBe(
			'https://canvas.onamp.dev/__canvas-bridge-supervisor/api/session'
		)
		expect(String(fetchMock.mock.calls[1][0])).toBe(
			'https://canvas.onamp.dev/__canvas-bridge-supervisor/api/services'
		)
	})

	it('accepts Offline authority only through the module-level installer', async () => {
		vi.stubGlobal('location', { protocol: 'file:', origin: 'null' })
		const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
			new Response(
				JSON.stringify({
					services: [
						{
							id: 'isoflow',
							label: 'Isoflow Bridge v2',
							state: 'healthy',
							controllable: true,
							managedSafe: true,
							capabilities: ['inspect', 'lifecycle'],
						},
					],
				}),
				{
					status: 200,
					headers: { 'content-type': 'application/json' },
				}
			)
		)
		vi.stubGlobal('fetch', fetchMock)
		const client = await import('./bridgeSupervisorClient')
		client.installBridgeSupervisorResidentCapability(CAPABILITY)

		const listing = await client.listBridgeServices()

		expect(listing.services[0]).toMatchObject({
			id: 'isoflow',
			state: 'healthy',
			managedSafe: true,
		})
		expect(fetchMock).toHaveBeenCalledTimes(1)
		expect(
			new Headers(fetchMock.mock.calls[0][1]?.headers).get(
				client.BRIDGE_SUPERVISOR_CAPABILITY_HEADER
			)
		).toBe(CAPABILITY)
	})
})

describe('bridge service authority projection', () => {
	const service = (
		overrides: Partial<BridgeService>
	): BridgeService => ({
		id: 'workbench',
		label: 'Workbench Bridge',
		state: 'stopped',
		controllable: true,
		managedSafe: false,
		capabilities: [],
		...overrides,
	})

	it('allows Start for controllable stopped services and gates destructive lifecycle on managedSafe', () => {
		const stopped = service({})
		expect(canRunBridgeServiceAction(stopped, 'check')).toBe(true)
		expect(canRunBridgeServiceAction(stopped, 'start')).toBe(true)
		expect(canRunBridgeServiceAction(stopped, 'stop')).toBe(false)
		expect(canRunBridgeServiceAction(stopped, 'restart')).toBe(false)

		const external = service({
			state: 'external',
			controllable: true,
			managedSafe: false,
		})
		expect(canRunBridgeServiceAction(external, 'check')).toBe(true)
		expect(canRunBridgeServiceAction(external, 'start')).toBe(false)
		expect(canRunBridgeServiceAction(external, 'stop')).toBe(false)
		expect(canRunBridgeServiceAction(external, 'restart')).toBe(false)

		const owned = service({ state: 'healthy', managedSafe: true })
		expect(canRunBridgeServiceAction(owned, 'stop')).toBe(true)
		expect(canRunBridgeServiceAction(owned, 'restart')).toBe(true)
	})

	it('keeps every valid returned service and derives one aggregate dot state', () => {
		const services = [
			normalizeBridgeService({
				id: 'workbench',
				label: 'Workbench',
				state: 'healthy',
				controllable: true,
				managedSafe: true,
			}),
			normalizeBridgeService({
				id: 'kanban',
				label: 'Kanban',
				state: 'external',
				controllable: false,
				managedSafe: false,
			}),
			normalizeBridgeService({
				id: 'legacy-ml',
				label: 'Legacy ML',
				state: 'degraded',
				controllable: false,
				managedSafe: false,
			}),
		]

		expect(services.map((item) => item.id)).toEqual([
			'workbench',
			'kanban',
			'legacy-ml',
		])
		expect(summarizeBridgeServices(services)).toBe('attention')
	})
})
