import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
	createAmpTldrawCompanionClient,
	isPathContained,
	resolveLoopbackBridgeUrl,
	resolveProjectCanvasBinding,
	startWorkbenchBridge,
} from './amp-tldraw-companion-runtime.mjs'

const TEST_CAPABILITY = `hr_${'A'.repeat(43)}`

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

test('capability discovery can bind internally to one project canvas', async () => {
	const calls = []
	const client = createAmpTldrawCompanionClient({
		baseUrl: 'http://127.0.0.1:5176',
		fetchFn: async (url, init = {}) => {
			calls.push({ url, init })
			return mockJsonResponse(200, { manifestId: 'project-manifest' })
		},
	})

	assert.deepEqual(
		await client.capabilities({ canvasBinding: 'canvas-project-1' }),
		{ manifestId: 'project-manifest' }
	)
	assert.equal(
		calls[0].url,
		'http://127.0.0.1:5176/companion/canvas-tool/capabilities?canvasBinding=canvas-project-1'
	)
	await assert.rejects(
		() => client.capabilities({ canvasBinding: 'canvas/project' }),
		/tldraw canvas binding is invalid/
	)
})

test('project routing resolves documentId for one project canvas and ignores unrelated open docs', async () => {
	const fixture = await createProjectCanvasFixture()
	const unrelatedCanvas = path.join(fixture.root, 'unrelated-unsaved.tldraw')
	await writeFile(unrelatedCanvas, '')
	const calls = []
	try {
		const canvasBinding = await resolveProjectCanvasBinding({
			workspaceRoot: fixture.workspace,
			serverConfigPath: fixture.serverConfig,
			fetchFn: async (url, init) => {
				calls.push({ url, init })
				if (url.endsWith('/api/search')) {
					return mockJsonResponse(200, {
						success: true,
						result: [
							{
								documentId: 'unrelated-doc',
								filePath: unrelatedCanvas,
								unsavedChanges: true,
							},
							{ documentId: 'project-doc', filePath: fixture.projectCanvas },
						],
					})
				}
				if (url.endsWith('/api/doc/project-doc/exec')) {
					return mockJsonResponse(200, {
						success: true,
						result: 'canvas-project-binding',
					})
				}
				return mockJsonResponse(404, { error: 'not found' })
			},
		})

		assert.equal(canvasBinding, 'canvas-project-binding')
		assert.equal(calls.length, 2)
		assert.equal(calls[1].url, 'http://127.0.0.1:7236/api/doc/project-doc/exec')
		assert.equal(calls[0].init.headers.authorization, `Bearer ${fixture.token}`)
		assert.match(JSON.parse(calls[1].init.body).code, /companionCanvasBinding/)
	} finally {
		await rm(fixture.root, { recursive: true, force: true })
	}
})

test('project routing fails closed for missing, ambiguous, symlinked, unopened, and duplicate targets', async (t) => {
	await t.test('filesystem errors do not expose the workspace path', async () => {
		const secretPath = path.join(tmpdir(), 'model-visible-secret', 'missing-workspace')
		await assert.rejects(
			resolveProjectCanvasBinding({ workspaceRoot: secretPath }),
			(error) => {
				assert.match(error.message, /Amp workspace is unavailable/)
				assert.doesNotMatch(error.message, /model-visible-secret|missing-workspace/)
				return true
			}
		)
	})

	await t.test('missing .canvas directory', async () => {
		const root = await mkdtemp(path.join(tmpdir(), 'canvapocalypse-project-missing-'))
		try {
			await assert.rejects(
				resolveProjectCanvasBinding({ workspaceRoot: root }),
				/real project canvas directory/
			)
		} finally {
			await rm(root, { recursive: true, force: true })
		}
	})

	await t.test('symlinked .canvas directory', async () => {
		const root = await mkdtemp(path.join(tmpdir(), 'canvapocalypse-project-dir-link-'))
		const target = path.join(root, 'canvas-target')
		await mkdir(target)
		await writeFile(path.join(target, 'project.tldraw'), '')
		await symlink(target, path.join(root, '.canvas'), 'dir')
		try {
			await assert.rejects(
				resolveProjectCanvasBinding({ workspaceRoot: root }),
				/real project canvas directory/
			)
		} finally {
			await rm(root, { recursive: true, force: true })
		}
	})

	await t.test('symlinked .tldraw file', async () => {
		const root = await mkdtemp(path.join(tmpdir(), 'canvapocalypse-project-file-link-'))
		await mkdir(path.join(root, '.canvas'))
		const target = path.join(root, 'target.tldraw')
		await writeFile(target, '')
		await symlink(target, path.join(root, '.canvas', 'project.tldraw'), 'file')
		try {
			await assert.rejects(
				resolveProjectCanvasBinding({ workspaceRoot: root }),
				/Expected exactly one project canvas.*found 0/
			)
		} finally {
			await rm(root, { recursive: true, force: true })
		}
	})

	await t.test('ambiguous .tldraw files', async () => {
		const fixture = await createProjectCanvasFixture()
		await writeFile(path.join(fixture.workspace, '.canvas', 'second.tldraw'), '')
		try {
			await assert.rejects(
				resolveProjectCanvasBinding({
					workspaceRoot: fixture.workspace,
					serverConfigPath: fixture.serverConfig,
				}),
				/Expected exactly one project canvas.*found 2/
			)
		} finally {
			await rm(fixture.root, { recursive: true, force: true })
		}
	})

	for (const duplicate of [false, true]) {
		await t.test(duplicate ? 'duplicate open project documents' : 'unopened project document', async () => {
			const fixture = await createProjectCanvasFixture()
			try {
				await assert.rejects(
					resolveProjectCanvasBinding({
						workspaceRoot: fixture.workspace,
						serverConfigPath: fixture.serverConfig,
						fetchFn: async () =>
							mockJsonResponse(200, {
								success: true,
								result: duplicate
									? [
											{ documentId: 'project-a', filePath: fixture.projectCanvas },
											{ documentId: 'project-b', filePath: fixture.projectCanvas },
										]
									: [],
							}),
					}),
					duplicate ? /multiple tldraw Offline windows/ : /Open the sole \.canvas/
				)
			} finally {
				await rm(fixture.root, { recursive: true, force: true })
			}
		})
	}
})

test('path containment rejects Windows cross-drive, UNC, and parent traversal paths', () => {
	assert.equal(
		isPathContained('C:\\workspace', 'C:\\workspace\\.canvas\\project.tldraw', path.win32),
		true
	)
	assert.equal(
		isPathContained('C:\\workspace', 'D:\\outside\\project.tldraw', path.win32),
		false
	)
	assert.equal(
		isPathContained('C:\\workspace', '\\\\server\\share\\project.tldraw', path.win32),
		false
	)
	assert.equal(isPathContained('/workspace', '/outside/project.tldraw', path.posix), false)
})

test('a connection failure lazily starts the workbench bridge once and retries the original request', async () => {
	const calls = []
	let started = false
	const client = createAmpTldrawCompanionClient({
		baseUrl: 'http://127.0.0.1:5176',
		startBridge: async () => {
			assert.equal(started, false)
			started = true
		},
		fetchFn: async (url) => {
			calls.push(url)
			if (!started) throw new TypeError('connection refused')
			return mockJsonResponse(200, { manifestId: 'manifest-after-start' })
		},
	})

	assert.deepEqual(await client.capabilities(), {
		manifestId: 'manifest-after-start',
	})
	assert.deepEqual(calls, [
		'http://127.0.0.1:5176/companion/canvas-tool/capabilities',
		'http://127.0.0.1:5176/companion/canvas-tool/capabilities',
	])
})

test('the Amp bootstrap requests only the fixed workbench service and waits for exact bridge health', async () => {
	const calls = []
	let healthChecks = 0
	await startWorkbenchBridge({
		residentCapability: TEST_CAPABILITY,
		pollIntervalMs: 0,
		timeoutMs: 100,
		delay: async () => {},
		fetchFn: async (url, init = {}) => {
			calls.push({ url, init })
			if (url === 'http://127.0.0.1:5177/api/services/workbench/start') {
				return mockJsonResponse(200, {
					service: { id: 'workbench', state: 'starting' },
				})
			}
			healthChecks += 1
			if (healthChecks === 1) throw new TypeError('connection refused')
			return mockJsonResponse(200, {
				status: 'ok',
				bridge: 'workflow-llm',
				mlIntern: 'terminal-first',
				surface: 'native-tldraw',
			})
		},
	})

	assert.equal(calls[0].url, 'http://127.0.0.1:5177/api/services/workbench/start')
	assert.equal(calls[0].init.method, 'POST')
	assert.equal(calls[0].init.headers['x-tldraw-html-capability'], TEST_CAPABILITY)
	assert.equal(calls[1].url, 'http://127.0.0.1:5176/health')
	assert.equal(calls[2].url, 'http://127.0.0.1:5176/health')
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

test('execute can stamp Grok provenance without changing Amp defaults', async () => {
	const calls = []
	const client = createAmpTldrawCompanionClient({
		baseUrl: 'http://localhost:5176',
		actor: 'grok',
		source: 'grok-plugin',
		pollIntervalMs: 0,
		delay: async () => {},
		fetchFn: async (url, init = {}) => {
			calls.push({ url, init })
			if (url.endsWith('/execute')) {
				const payload = JSON.parse(init.body)
				assert.equal(payload.actor, 'grok')
				assert.equal(payload.source, 'grok-plugin')
				return mockJsonResponse(200, { id: 'grok-1', status: 'succeeded' })
			}
			return mockJsonResponse(200, { request: { id: 'grok-1', status: 'succeeded' } })
		},
	})

	const receipt = await client.execute({
		manifestId: 'manifest-1',
		capabilityId: 'canvas.inspect',
		context: 'selection',
	})
	assert.equal(receipt.status, 'succeeded')
	assert.equal(JSON.parse(calls[0].init.body).actor, 'grok')
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

async function createProjectCanvasFixture() {
	const root = await mkdtemp(path.join(tmpdir(), 'canvapocalypse-project-'))
	const workspace = path.join(root, 'workspace')
	const canvasDir = path.join(workspace, '.canvas')
	const projectCanvas = path.join(canvasDir, 'project.tldraw')
	const serverConfig = path.join(root, 'server.json')
	const token = 'a'.repeat(64)
	await mkdir(canvasDir, { recursive: true })
	await writeFile(projectCanvas, '')
	await writeFile(serverConfig, JSON.stringify({ port: 7236, token }))
	return { root, workspace, projectCanvas, serverConfig, token }
}
