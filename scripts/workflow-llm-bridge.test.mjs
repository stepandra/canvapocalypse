import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { once } from 'node:events'
import { mkdtemp, stat, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))
const BRIDGE_PATH = fileURLToPath(new URL('./workflow-llm-bridge.mjs', import.meta.url))

function startBridge(t, port, extraEnv = {}) {
	const child = spawn(process.execPath, [BRIDGE_PATH], {
		cwd: REPO_ROOT,
		env: {
			...process.env,
			WORKFLOW_LLM_PORT: String(port),
			AMP_BIN: '/definitely-missing-amp-binary',
			...extraEnv,
		},
		stdio: ['ignore', 'pipe', 'pipe'],
	})
	let output = ''
	child.stdout.on('data', (chunk) => {
		output += String(chunk)
	})
	child.stderr.on('data', (chunk) => {
		output += String(chunk)
	})
	t.after(async () => {
		if (child.exitCode !== null) return
		child.kill('SIGTERM')
		await Promise.race([once(child, 'exit'), delay(1_000)])
	})
	return { child, getOutput: () => output }
}

async function postWorkflowLlm(port, body) {
	return fetch(`http://127.0.0.1:${port}/workflow/llm`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body),
	})
}

test('the retired Isoflow agent route is a no-subprocess 410 tombstone', { timeout: 15_000 }, async (t) => {
	const port = await reserveLoopbackPort()
	const { child, getOutput } = startBridge(t, port)

	await waitForBridge(port, child, getOutput)

	const legacyPayload = JSON.stringify({
		projectId: 'autorecruit-contours',
		mode: 'amp-high',
		instructions: 'Return JSON.',
		input: 'Inspect the selected view.',
	})
	const requests = [
		{ method: 'GET' },
		{ method: 'PUT', body: legacyPayload },
		{ method: 'OPTIONS' },
		{
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: '{not-json',
		},
		{
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: legacyPayload,
		},
		{
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				origin: 'https://example.invalid',
			},
			body: legacyPayload,
		},
	]
	for (const init of requests) {
		const response = await fetch(
			`http://127.0.0.1:${port}/isoflow/agent`,
			init
		)
		assert.equal(response.status, 410, `${init.method} should be retired`)
		assert.equal(response.headers.get('cache-control'), 'no-store')
		assert.deepEqual(await response.json(), {
			error: 'legacy_isoflow_agent_removed',
			message:
				'Use the existing Architect thread with the explicitly selected Isoflow project and view.',
		})
	}

	const unknown = await fetch(`http://127.0.0.1:${port}/not-a-route`)
	assert.equal(unknown.status, 404)
})

test('workflow/llm normalizes and rejects out-of-range inference controls', { timeout: 15_000 }, async (t) => {
	const port = await reserveLoopbackPort()
	const { child, getOutput } = startBridge(t, port)
	await waitForBridge(port, child, getOutput)

	const base = {
		provider: 'openrouter',
		model: 'openai/gpt-4o',
		instructions: 'Return JSON.',
		input: 'hello',
	}

	const badTemperature = await postWorkflowLlm(port, { ...base, temperature: 2.5 })
	assert.equal(badTemperature.status, 400)
	assert.match(await badTemperature.text(), /temperature/)

	const badMaxTokens = await postWorkflowLlm(port, { ...base, maxTokens: 100 })
	assert.equal(badMaxTokens.status, 400)
	assert.match(await badMaxTokens.text(), /maxTokens/)

	const badSeed = await postWorkflowLlm(port, { ...base, seed: 'not-a-number' })
	assert.equal(badSeed.status, 400)
	assert.match(await badSeed.text(), /seed/)

	const valid = await postWorkflowLlm(port, { ...base, temperature: 1.5, maxTokens: 512, seed: 42 })
	assert.equal(valid.status, 401)
})

test('workflow/llm for compatible provider normalizes controls and returns 400 for missing baseUrl', { timeout: 15_000 }, async (t) => {
	const port = await reserveLoopbackPort()
	const { child, getOutput } = startBridge(t, port)
	await waitForBridge(port, child, getOutput)

	const response = await postWorkflowLlm(port, {
		provider: 'compatible',
		model: 'local-model',
		instructions: 'Return JSON.',
		input: 'hello',
		temperature: 0.7,
		maxTokens: 1024,
		seed: 7,
	})
	assert.equal(response.status, 400)
	assert.match(await response.text(), /Base URL/)
})

test('tldraw Offline may access only the companion resident renderer routes', { timeout: 15_000 }, async (t) => {
	const port = await reserveLoopbackPort()
	const { child, getOutput } = startBridge(t, port)
	await waitForBridge(port, child, getOutput)

	const origin = 'tldraw-app://app'
	const bridgeUrl = `http://127.0.0.1:${port}`
	const binding = 'offline-cors-test'
	const residentRoutes = [
		{ path: `/companion/canvas-tool/status?canvasBinding=${binding}&clientKind=offline-desktop`, method: 'GET' },
		{ path: `/companion/canvas-tool/next?canvasBinding=${binding}&clientKind=offline-desktop`, method: 'GET' },
		{ path: '/companion/canvas-tool/receipt', method: 'POST' },
	]
	for (const route of residentRoutes) {
		const preflight = await fetch(`${bridgeUrl}${route.path}`, {
			method: 'OPTIONS',
			headers: {
				origin,
				'access-control-request-method': route.method,
				...(route.method === 'POST'
					? { 'access-control-request-headers': 'content-type' }
					: {}),
			},
		})
		assert.equal(preflight.status, 204, route.path)
		assert.equal(preflight.headers.get('access-control-allow-origin'), origin)
	}

	const status = await fetch(`${bridgeUrl}${residentRoutes[0].path}`, {
		headers: { origin },
	})
	assert.equal(status.status, 200)
	assert.equal(status.headers.get('access-control-allow-origin'), origin)

	const next = await fetch(`${bridgeUrl}${residentRoutes[1].path}`, {
		headers: { origin },
	})
	assert.equal(next.status, 200)
	assert.equal(next.headers.get('access-control-allow-origin'), origin)

	const receipt = await fetch(`${bridgeUrl}/companion/canvas-tool/receipt`, {
		method: 'POST',
		headers: { origin, 'content-type': 'application/json' },
		body: '{}',
	})
	assert.equal(receipt.status, 404)
	assert.equal(receipt.headers.get('access-control-allow-origin'), origin)

	const deniedRoutes = [
		{ path: '/companion/canvas-tool/capabilities', method: 'GET' },
		{ path: '/companion/canvas-tool/capabilities/describe', method: 'POST' },
		{ path: '/companion/canvas-tool/execute', method: 'POST' },
		{ path: '/health', method: 'GET' },
	]
	for (const route of deniedRoutes) {
		const preflight = await fetch(`${bridgeUrl}${route.path}`, {
			method: 'OPTIONS',
			headers: {
				origin,
				'access-control-request-method': route.method,
			},
		})
		assert.equal(preflight.status, 403, `${route.path} preflight`)

		const response = await fetch(`${bridgeUrl}${route.path}`, {
			method: route.method,
			headers: {
				origin,
				...(route.method === 'POST' ? { 'content-type': 'application/json' } : {}),
			},
			...(route.method === 'POST' ? { body: '{}' } : {}),
		})
		assert.equal(response.status, 403, route.path)
		assert.equal(response.headers.get('access-control-allow-origin'), null)
	}
})

test('the workflow bridge exposes only registered local HTML mockups', { timeout: 15_000 }, async (t) => {
	const root = await mkdtemp(join(tmpdir(), 'canvapocalypse-bridge-html-'))
	await writeFile(join(root, 'screen.html'), '<main><h1>Bridge screen</h1></main>')
	const port = await reserveLoopbackPort()
	const capabilityFile = join(root, '.resident', 'html-mockup-capability')
	const child = spawn(process.execPath, [BRIDGE_PATH], {
		cwd: root,
		env: {
			...process.env,
			WORKFLOW_LLM_PORT: String(port),
			TLDRAW_HTML_MOCKUP_ROOTS: root,
			TLDRAW_HTML_MOCKUP_RESIDENT_CAPABILITY_FILE: capabilityFile,
			STITCH_API_KEY: '',
			STITCH_ACCESS_TOKEN: '',
			GOOGLE_CLOUD_PROJECT: '',
			AMP_BIN: '/definitely-missing-amp-binary',
		},
		stdio: ['ignore', 'pipe', 'pipe'],
	})
	let restartChild
	let output = ''
	child.stdout.on('data', (chunk) => {
		output += String(chunk)
	})
	child.stderr.on('data', (chunk) => {
		output += String(chunk)
	})
	t.after(async () => {
		if (child.exitCode !== null) return
		child.kill('SIGTERM')
		await Promise.race([once(child, 'exit'), delay(1_000)])
	})
	t.after(async () => {
		if (!restartChild || restartChild.exitCode !== null) return
		restartChild.kill('SIGTERM')
		await Promise.race([once(restartChild, 'exit'), delay(1_000)])
	})

	await waitForBridge(port, child, () => output)
	const origin = 'http://127.0.0.1:5173'
	const bootstrapResponse = await fetch(
		`http://127.0.0.1:${port}/html-mockups/session`,
		{
			method: 'POST',
			headers: { origin },
		}
	)
	assert.equal(bootstrapResponse.status, 200)
	const bootstrap = await bootstrapResponse.json()
	assert.equal(
		/^hr_[A-Za-z0-9_-]{43,128}$/.test(bootstrap.capability),
		true
	)
	assert.equal((await stat(capabilityFile)).mode & 0o777, 0o600)
	const residentHeaders = {
		origin,
		'x-tldraw-html-capability': bootstrap.capability,
	}
	const stitchStatusResponse = await fetch(
		`http://127.0.0.1:${port}/stitch/status`,
		{ headers: residentHeaders }
	)
	assert.equal(stitchStatusResponse.status, 200)
	assert.deepEqual(await stitchStatusResponse.json(), {
		configured: false,
		authMode: 'missing',
		provider: 'google-stitch',
		surface: 'native-tldraw',
	})
	const unauthorizedStitchStatus = await fetch(
		`http://127.0.0.1:${port}/stitch/status`,
		{ headers: { origin } }
	)
	assert.equal(unauthorizedStitchStatus.status, 401)
	const listResponse = await fetch(`http://127.0.0.1:${port}/html-mockups`, {
		headers: residentHeaders,
	})
	assert.equal(listResponse.status, 200)
	assert.equal(listResponse.headers.get('access-control-allow-origin'), origin)
	const listing = await listResponse.json()
	assert.equal(listing.documents.length, 1)
	assert.equal(listing.documents[0].name, 'screen.html')

	const snapshotResponse = await fetch(
		`http://127.0.0.1:${port}/html-mockups/${listing.documents[0].documentRef}/snapshot`,
		{ headers: residentHeaders }
	)
	assert.equal(snapshotResponse.status, 200)
	const snapshot = await snapshotResponse.json()
	assert.match(snapshot.revision, /^sha256:[a-f0-9]{64}$/)
	assert.equal(snapshot.title, 'screen.html')
	assert.equal(snapshot.bytes, Buffer.byteLength('<main><h1>Bridge screen</h1></main>'))
	assert(snapshot.nodes.some((node) => node.role === 'heading'))

	const offlineListResponse = await fetch(
		`http://127.0.0.1:${port}/html-mockups`,
		{ headers: { origin: 'null' } }
	)
	assert.equal(offlineListResponse.status, 401)
	assert.equal(
		offlineListResponse.headers.get('access-control-allow-origin'),
		'null'
	)
	assert.equal(
		(await offlineListResponse.json()).error,
		'resident_capability_required'
	)

	const offlineBootstrapResponse = await fetch(
		`http://127.0.0.1:${port}/html-mockups/session`,
		{ method: 'POST', headers: { origin: 'null' } }
	)
	assert.equal(offlineBootstrapResponse.status, 403)

	const provisionedOfflineList = await fetch(
		`http://127.0.0.1:${port}/html-mockups`,
		{
			headers: {
				origin: 'null',
				'x-tldraw-html-capability': bootstrap.capability,
			},
		}
	)
	assert.equal(provisionedOfflineList.status, 200)

	const denied = await fetch(`http://127.0.0.1:${port}/html-mockups`, {
		headers: {
			origin: 'https://example.invalid',
			'x-tldraw-html-capability': bootstrap.capability,
		},
	})
	assert.equal(denied.status, 403)

	const preflight = await fetch(`http://127.0.0.1:${port}/html-mockups`, {
		method: 'OPTIONS',
		headers: {
			origin,
			'access-control-request-method': 'GET',
			'access-control-request-headers': 'x-tldraw-html-capability',
		},
	})
	assert.equal(preflight.status, 204)
	assert.match(
		preflight.headers.get('access-control-allow-headers') ?? '',
		/x-tldraw-html-capability/
	)

	child.kill('SIGTERM')
	await once(child, 'exit')
	const restartPort = await reserveLoopbackPort()
	let restartOutput = ''
	restartChild = spawn(process.execPath, [BRIDGE_PATH], {
		cwd: root,
		env: {
			...process.env,
			WORKFLOW_LLM_PORT: String(restartPort),
			TLDRAW_HTML_MOCKUP_ROOTS: root,
			TLDRAW_HTML_MOCKUP_RESIDENT_CAPABILITY_FILE: capabilityFile,
			STITCH_API_KEY: '',
			STITCH_ACCESS_TOKEN: '',
			GOOGLE_CLOUD_PROJECT: '',
			AMP_BIN: '/definitely-missing-amp-binary',
		},
		stdio: ['ignore', 'pipe', 'pipe'],
	})
	restartChild.stdout.on('data', (chunk) => {
		restartOutput += String(chunk)
	})
	restartChild.stderr.on('data', (chunk) => {
		restartOutput += String(chunk)
	})
	await waitForBridge(restartPort, restartChild, () => restartOutput)
	const restartBootstrapResponse = await fetch(
		`http://127.0.0.1:${restartPort}/html-mockups/session`,
		{ method: 'POST', headers: { origin } }
	)
	assert.equal(restartBootstrapResponse.status, 200)
	const restartBootstrap = await restartBootstrapResponse.json()
	assert.equal(
		createHash('sha256').update(restartBootstrap.capability).digest('hex') ===
			createHash('sha256').update(bootstrap.capability).digest('hex'),
		true
	)
})

async function reserveLoopbackPort() {
	const probe = createServer()
	probe.listen(0, '127.0.0.1')
	await once(probe, 'listening')
	const address = probe.address()
	assert(address && typeof address === 'object')
	const port = address.port
	probe.close()
	await once(probe, 'close')
	return port
}

async function waitForBridge(port, child, getOutput) {
	const deadline = Date.now() + 8_000
	while (Date.now() < deadline) {
		if (child.exitCode !== null) {
			throw new Error(`workflow bridge exited before startup:\n${getOutput()}`)
		}
		try {
			const response = await fetch(`http://127.0.0.1:${port}/health`)
			if (response.ok) return
		} catch {
			// The loopback listener is still starting.
		}
		await delay(50)
	}
	throw new Error(`workflow bridge did not start:\n${getOutput()}`)
}

function delay(milliseconds) {
	return new Promise((resolve) => {
		const timer = setTimeout(resolve, milliseconds)
		timer.unref()
	})
}
