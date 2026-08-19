import { afterEach, describe, expect, it, vi } from 'vitest'
import {
	installGrokCanvasBridge,
	resolveGrokBridgeEndpoints,
} from './grokBridgeClient'

afterEach(() => {
	vi.unstubAllGlobals()
	delete (
		globalThis as typeof globalThis & {
			__AM_GROK_CONFIG_TOKEN__?: string
			__AM_GROK_CONFIG_BASE__?: string
		}
	).__AM_GROK_CONFIG_TOKEN__
	delete (
		globalThis as typeof globalThis & {
			__AM_GROK_CONFIG_BASE__?: string
		}
	).__AM_GROK_CONFIG_BASE__
})

describe('Grok resident bridge activation', () => {
	it('uses same-origin Vite proxy paths for a portal renderer', () => {
		expect(
			resolveGrokBridgeEndpoints({
				protocol: 'https:',
				hostname: 'portal.onamp.dev',
				origin: 'https://portal.onamp.dev',
			})
		).toEqual({
			supervisor:
				'https://portal.onamp.dev/__canvas-grok-supervisor',
			config: 'https://portal.onamp.dev/__canvas-grok-config',
		})
	})

	it('installs authority only after the coupled config health check', async () => {
		vi.stubGlobal('location', {
			protocol: 'http:',
			hostname: '127.0.0.1',
			origin: 'http://127.0.0.1:5173',
		})
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						capability: `gk_${'a'.repeat(32)}`,
					}),
					{ status: 200 }
				)
			)
			.mockResolvedValueOnce(new Response('{}', { status: 200 }))
		vi.stubGlobal('fetch', fetchMock)

		await installGrokCanvasBridge()

		expect(fetchMock).toHaveBeenNthCalledWith(
			1,
			'http://127.0.0.1:5187/api/session',
			expect.objectContaining({ method: 'GET' })
		)
		expect(fetchMock).toHaveBeenNthCalledWith(
			2,
			'http://127.0.0.1:5188/api/grok/health',
			expect.objectContaining({
				headers: expect.objectContaining({
					Authorization: `Bearer gk_${'a'.repeat(32)}`,
				}),
			})
		)
		expect(
			(
				globalThis as typeof globalThis & {
					__AM_GROK_CONFIG_BASE__?: string
				}
			).__AM_GROK_CONFIG_BASE__
		).toBe('http://127.0.0.1:5188')
	})
})
