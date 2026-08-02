import assert from 'node:assert/strict'
import test from 'node:test'

import {
	createAmpTldrawCompanionClient,
	resolveLoopbackBridgeUrl,
} from './amp-tldraw-companion-runtime.mjs'

test('bridge URL accepts only unauthenticated loopback HTTP endpoints', () => {
	assert.equal(resolveLoopbackBridgeUrl('http://127.0.0.1:5176/'), 'http://127.0.0.1:5176')
	assert.equal(
		resolveLoopbackBridgeUrl('http://localhost:5176/bridge///'),
		'http://localhost:5176/bridge'
	)
	assert.equal(resolveLoopbackBridgeUrl('http://[::1]:5176'), 'http://[::1]:5176')

	for (const value of [
		'https://127.0.0.1:5176',
		'http://example.com:5176',
		'http://user:password@localhost:5176',
		'http://localhost:5176?token=secret',
		'http://localhost:5176/#secret',
	]) {
		assert.throws(() => resolveLoopbackBridgeUrl(value), /unauthenticated loopback HTTP URL/)
	}
})

test('capability discovery and hydration use the provider-neutral companion endpoints', async () => {
	const calls = []
	const client = createAmpTldrawCompanionClient({
		baseUrl: 'http://127.0.0.1:5176',
		fetchFn: async (url, init = {}) => {
			calls.push({ url, init })
			return mockJsonResponse(200, { ok: true })
		},
	})

	assert.deepEqual(await client.capabilities(), { ok: true })
	assert.deepEqual(
		await client.describe({ manifestId: 'manifest-1', capabilityId: 'canvas.inspect' }),
		{ ok: true }
	)

	assert.equal(
		calls[0].url,
		'http://127.0.0.1:5176/companion/canvas-tool/capabilities'
	)
	assert.equal(calls[0].init.method, undefined)
	assert.equal(
		calls[1].url,
		'http://127.0.0.1:5176/companion/canvas-tool/capabilities/describe'
	)
	assert.equal(calls[1].init.method, 'POST')
	assert.equal(calls[1].init.headers['Content-Type'], 'application/json')
	assert.deepEqual(JSON.parse(calls[1].init.body), {
		manifestId: 'manifest-1',
		capabilityId: 'canvas.inspect',
	})
})

test('execute adds Amp provenance and polls until the compact terminal receipt', async () => {
	const calls = []
	let statusReads = 0
	const client = createAmpTldrawCompanionClient({
		baseUrl: 'http://localhost:5176',
		pollIntervalMs: 0,
		delay: async () => {},
		fetchFn: async (url, init = {}) => {
			calls.push({ url, init })
			if (url.endsWith('/execute')) {
				const payload = JSON.parse(init.body)
				assert.equal(payload.actor, 'amp')
				assert.equal(payload.source, 'amp-plugin')
				assert.deepEqual(payload.actions, [
					{ _type: 'label', shapeId: 'shape:1', intent: 'rename', text: 'Gateway' },
				])
				return mockJsonResponse(202, { id: 'request / 1', status: 'queued' })
			}

			statusReads += 1
			return mockJsonResponse(200, {
				request:
					statusReads === 1
						? { id: 'request / 1', status: 'leased' }
						: {
								id: 'request / 1',
								status: 'succeeded',
								summary: 'Applied one validated action.',
							},
			})
		},
	})

	const receipt = await client.execute({
		manifestId: 'manifest-1',
		capabilityId: 'canvas.shape.basic',
		context: 'selection',
		contextRef: 'ctx-v1-0123abcd',
		actions: [{ _type: 'label', shapeId: 'shape:1', intent: 'rename', text: 'Gateway' }],
	})

	assert.equal(receipt.status, 'succeeded')
	assert.equal(calls.length, 3)
	assert.equal(
		calls[1].url,
		'http://localhost:5176/companion/canvas-tool/status?requestId=request%20%2F%201'
	)
	assert.equal(calls[2].url, calls[1].url)
})

test('bridge HTTP failures and missing receipts fail closed', async () => {
	const unavailable = createAmpTldrawCompanionClient({
		baseUrl: 'http://127.0.0.1:5176',
		fetchFn: async () => mockTextResponse(503, 'bridge unavailable'),
	})
	await assert.rejects(unavailable.capabilities(), /bridge unavailable/)

	let calls = 0
	const neverReceipted = createAmpTldrawCompanionClient({
		baseUrl: 'http://127.0.0.1:5176',
		timeoutMs: -1,
		fetchFn: async () => {
			calls += 1
			return mockJsonResponse(202, { id: 'request-timeout', status: 'queued' })
		},
	})
	await assert.rejects(
		neverReceipted.execute({
			manifestId: 'manifest-1',
			capabilityId: 'canvas.inspect',
			context: 'selection-or-area',
		}),
		/request-timeout timed out waiting for the local canvas receipt/
	)
	assert.equal(calls, 1)
})

function mockJsonResponse(status, payload) {
	return mockTextResponse(status, JSON.stringify(payload))
}

function mockTextResponse(status, payload) {
	return {
		ok: status >= 200 && status < 300,
		status,
		text: async () => payload,
	}
}
