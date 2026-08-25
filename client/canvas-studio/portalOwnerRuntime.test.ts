import { describe, expect, it, vi } from 'vitest'
import type { CanvasKitComposition } from './types'
import {
	installCanvasStudioPortalOwnerRuntime,
	type CanvasStudioPortalRuntime,
} from './portalOwnerRuntime'

function composition(...kitIds: string[]) {
	return {
		getContribution: (kitId: string) =>
			kitIds.includes(kitId) ? ({ kitId } as never) : undefined,
	} as CanvasKitComposition
}

function runtime(
	bridges: CanvasStudioPortalRuntime['bridges'] = []
): CanvasStudioPortalRuntime {
	return {
		projectApi: '/__canvas/project',
		sourceApi: '/__canvas/source',
		inventorySha256: 'a'.repeat(64),
		bridges,
	}
}

describe('locked Canvas Studio owner routing', () => {
	it('does not install stale owner defaults when no canonical owner is composed', () => {
		const scope = {}
		const dispose = installCanvasStudioPortalOwnerRuntime(
			composition(),
			runtime(),
			scope
		)

		expect(scope).toEqual({})
		dispose()
	})

	it('injects both Canvas Studio-declared Grok routes from one private service', () => {
		const scope: {
			__AM_GROK_SUPERVISOR_BASE__?: string
			__AM_GROK_CONFIG_BASE__?: string
		} = { __AM_GROK_CONFIG_BASE__: '/existing-config' }
		const dispose = installCanvasStudioPortalOwnerRuntime(
			composition('grok.workflow'),
			runtime([
				{
					serviceId: 'grok.workflow.supervisor',
					kitId: 'grok.workflow',
					routes: [
						{ prefix: '/__canvas-grok-supervisor', stripPrefix: true },
						{ prefix: '/__canvas-grok-config', stripPrefix: true },
					],
				},
			]),
			scope
		)

		expect(scope.__AM_GROK_SUPERVISOR_BASE__).toBe('/__canvas-grok-supervisor')
		expect(scope.__AM_GROK_CONFIG_BASE__).toBe('/__canvas-grok-config')
		dispose()
		expect(scope).toEqual({ __AM_GROK_CONFIG_BASE__: '/existing-config' })
	})

	it('injects the canonical Hermes route while preserving host fetch and actions', () => {
		const previous = {
			fetch: vi.fn(),
			actions: { onSelectLayer: vi.fn() },
		}
		const scope: { __HERMES_FLIGHT_DECK_RUNTIME__?: typeof previous & { apiBase?: string } } = {
			__HERMES_FLIGHT_DECK_RUNTIME__: previous,
		}
		const dispose = installCanvasStudioPortalOwnerRuntime(
			composition('hermes.flight-deck'),
			runtime([
				{
					serviceId: 'hermes.flight-deck.bridge',
					kitId: 'hermes.flight-deck',
					routes: [{ prefix: '/__canvas-hermes', stripPrefix: true }],
				},
			]),
			scope
		)

		expect(scope.__HERMES_FLIGHT_DECK_RUNTIME__).toEqual({
			...previous,
			apiBase: '/__canvas-hermes',
		})
		dispose()
		expect(scope.__HERMES_FLIGHT_DECK_RUNTIME__).toBe(previous)
	})

	it('fails closed before mount when a canonical owner route is missing or not stripped', () => {
		expect(() =>
			installCanvasStudioPortalOwnerRuntime(
				composition('grok.workflow'),
				runtime(),
				{}
			)
		).toThrow('requires bridge grok.workflow.supervisor')
		const scope = {}
		expect(() =>
			installCanvasStudioPortalOwnerRuntime(
				composition('grok.workflow'),
				runtime([
					{
						serviceId: 'grok.workflow.supervisor',
						routes: [
							{ prefix: '/__canvas-grok-supervisor', stripPrefix: true },
						],
					},
				]),
				scope
			)
		).toThrow('requires strip-prefix route /__canvas-grok-config')
		expect(scope).toEqual({})
		expect(() =>
			installCanvasStudioPortalOwnerRuntime(
				composition('hermes.flight-deck'),
				runtime([
					{
						serviceId: 'hermes.flight-deck.bridge',
						routes: [{ prefix: '/__canvas-hermes' }],
					},
				]),
				{}
			)
		).toThrow('requires strip-prefix route /__canvas-hermes')
	})
})
