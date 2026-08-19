import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import test from 'node:test'
import {
	WORKBENCH_SERVICE_REGISTRY,
	WORKBENCH_SERVICE_STATES,
	WORKBENCH_SUPERVISOR_CAPABILITY_HEADER,
	WORKBENCH_SUPERVISOR_CLIENT,
	WORKBENCH_SUPERVISOR_PROXY_HEADER,
	createWorkbenchBridgeSupervisor,
	createWorkbenchServiceManager,
	redactLogMessage,
} from './workbench-bridge-supervisor.mjs'

const TEST_CAPABILITY = `hr_${'S'.repeat(43)}`

test('fixed registry separates three managed bridges from two observe-only external services', () => {
	assert.deepEqual(
		WORKBENCH_SERVICE_REGISTRY.map(({ id, port, management }) => ({
			id,
			port,
			management,
		})),
		[
			{ id: 'workbench', port: 5176, management: 'managed' },
			{ id: 'isoflow', port: 4174, management: 'managed' },
			{ id: 'grok', port: 5187, management: 'managed' },
			{ id: 'kanban', port: 3484, management: 'external' },
			{ id: 'legacy-ml', port: 7860, management: 'external' },
		],
	)
	assert.deepEqual(WORKBENCH_SERVICE_STATES, [
		'stopped',
		'starting',
		'healthy',
		'degraded',
		'external',
		'port-conflict',
		'stopping',
	])
	for (const service of WORKBENCH_SERVICE_REGISTRY) {
		assert.equal(Object.isFrozen(service), true)
		assert.equal(Object.isFrozen(service.capabilities), true)
	}
	for (const service of WORKBENCH_SERVICE_REGISTRY.filter(
		({ management }) => management === 'managed',
	)) {
		assert.deepEqual(service.command.slice(0, 2), ['/usr/bin/env', 'node'])
	}
})

test('exact health identities distinguish external services, stopped services, and port conflicts', async () => {
	const responses = new Map([
		[
			5176,
			jsonResponse({
				status: 'ok',
				bridge: 'workflow-llm',
				mlIntern: 'terminal-first',
				surface: 'native-tldraw',
			}),
		],
		[
			4174,
			jsonResponse({
				ok: true,
				service: 'isoflow-model-bridge',
				schemaVersion: 1,
			}),
		],
		[3484, new Response('<title>Kanban</title>', { status: 200 })],
	])
	const manager = createWorkbenchServiceManager({
		fetchImpl: async (url) => {
			const port = Number(new URL(url).port)
			const response = responses.get(port)
			if (!response) throw new Error('connection refused')
			return response.clone()
		},
		portProbe: async () => false,
	})

	const services = await manager.listServices()
	assert.deepEqual(
		Object.fromEntries(
			services.map((service) => [
				service.id,
				{
					state: service.state,
					controllable: service.controllable,
					managedSafe: service.managedSafe,
				},
			]),
		),
		{
			workbench: {
				state: 'external',
				controllable: false,
				managedSafe: false,
			},
			isoflow: {
				state: 'port-conflict',
				controllable: false,
				managedSafe: false,
			},
			grok: {
				state: 'stopped',
				controllable: true,
				managedSafe: true,
			},
			kanban: {
				state: 'external',
				controllable: false,
				managedSafe: false,
			},
			'legacy-ml': {
				state: 'stopped',
				controllable: false,
				managedSafe: false,
			},
		},
	)
	await assert.rejects(
		() => manager.performAction('kanban', 'stop'),
		(error) =>
			error.statusCode === 403 &&
			error.code === 'external_service_observe_only',
	)
	await assert.rejects(
		() => manager.performAction('workbench', 'stop'),
		(error) =>
			error.statusCode === 409 && error.code === 'external_process_not_owned',
	)
})

test('only a child spawned by the supervisor is stopped and logs stay bounded and redacted', async () => {
	let healthy = false
	let spawnedChild
	const service = testManagedService()
	const manager = createWorkbenchServiceManager({
		services: [service],
		fetchImpl: async () => {
			if (!healthy) throw new Error('connection refused')
			return jsonResponse({ ok: true, service: 'test-managed' })
		},
		portProbe: async () => false,
		spawnImpl: (command, args, options) => {
			assert.equal(command, '/fixed/node')
			assert.deepEqual(args, ['/fixed/service.mjs'])
			assert.equal(options.shell, false)
			spawnedChild = createFakeChild(() => {
				healthy = false
			})
			return spawnedChild
		},
	})

	const starting = await manager.performAction('test-managed', 'start')
	assert.equal(starting.state, 'starting')
	assert.equal(starting.controllable, true)
	healthy = true
	for (let index = 0; index < 45; index += 1) {
		spawnedChild.stdout.write(
			`line ${index} api_key=secret-${index} ${TEST_CAPABILITY}\n`,
		)
	}
	const healthyService = await manager.performAction('test-managed', 'check')
	assert.equal(healthyService.state, 'healthy')
	assert.equal(healthyService.logs.length, 40)
	assert.doesNotMatch(JSON.stringify(healthyService.logs), /secret-|hr_S/)
	assert.match(
		JSON.stringify(healthyService.logs),
		/\[REDACTED\]|\[REDACTED_CAPABILITY\]/,
	)

	const stopped = await manager.performAction('test-managed', 'stop')
	assert.equal(stopped.state, 'stopped')
	assert.deepEqual(spawnedChild.killedWith, ['SIGTERM'])
	assert.equal(spawnedChild.exitCode, 0)
})

test('a live owned child moves from starting to degraded and reports stopping before exit', async () => {
	let clock = 1_000
	let spawnedChild
	const manager = createWorkbenchServiceManager({
		services: [testManagedService()],
		fetchImpl: async () => {
			throw new Error('connection refused')
		},
		portProbe: async () => false,
		spawnImpl: () => {
			spawnedChild = createFakeChild(() => {}, { exitOnKill: false })
			return spawnedChild
		},
		now: () => clock,
		startGraceMs: 100,
		stopGraceMs: 25,
	})

	assert.equal(
		(await manager.performAction('test-managed', 'start')).state,
		'starting',
	)
	clock += 101
	assert.equal(
		(await manager.performAction('test-managed', 'check')).state,
		'degraded',
	)
	const stopPromise = manager.performAction('test-managed', 'stop')
	await new Promise((resolve) => setImmediate(resolve))
	assert.equal((await manager.listServices())[0].state, 'stopping')
	assert.equal((await stopPromise).state, 'stopping')
	assert.deepEqual(spawnedChild.killedWith, ['SIGTERM', 'SIGKILL'])
	spawnedChild.exitCode = 0
	spawnedChild.emit('exit', 0, null)
})

test('control plane bootstraps only exact local HTTP origins and requires the resident capability', async (t) => {
	const calls = []
	const manager = {
		async listServices() {
			return [
				{
					id: 'workbench',
					label: 'Workbench Bridge',
					state: 'stopped',
					management: 'managed',
					controllable: true,
					managedSafe: true,
					capabilities: ['native-tldraw'],
				},
			]
		},
		async performAction(id, action) {
			calls.push({ id, action })
			return {
				id,
				label: 'Workbench Bridge',
				state: 'starting',
				management: 'managed',
				controllable: true,
				managedSafe: true,
				capabilities: ['native-tldraw'],
			}
		},
		async stopAllOwned() {},
	}
	const supervisor = createWorkbenchBridgeSupervisor({
		port: 0,
		manager,
		residentCapability: TEST_CAPABILITY,
		pollIntervalMs: 60_000,
	})
	t.after(() => supervisor.close({ stopManaged: false }))
	const address = await supervisor.listen()
	assert(address && typeof address === 'object')
	const baseUrl = `http://127.0.0.1:${address.port}`

	const healthResponse = await fetch(`${baseUrl}/health`)
	assert.equal(healthResponse.status, 200)
	assert.deepEqual(await healthResponse.json(), {
		status: 'ok',
		service: WORKBENCH_SUPERVISOR_CLIENT,
		schemaVersion: 1,
	})

	const absentOriginBootstrap = await fetch(`${baseUrl}/api/session`, {
		method: 'POST',
	})
	assert.equal(absentOriginBootstrap.status, 403)
	const foreignBootstrap = await fetch(`${baseUrl}/api/session`, {
		method: 'POST',
		headers: { origin: 'https://example.invalid' },
	})
	assert.equal(foreignBootstrap.status, 403)
	const bootstrapResponse = await fetch(`${baseUrl}/api/session`, {
		method: 'POST',
		headers: { origin: 'http://127.0.0.1:5173' },
	})
	assert.equal(bootstrapResponse.status, 200)
	assert.equal(
		bootstrapResponse.headers.get('access-control-allow-origin'),
		'http://127.0.0.1:5173',
	)
	assert.deepEqual(await bootstrapResponse.json(), {
		client: WORKBENCH_SUPERVISOR_CLIENT,
		capabilityHeader: WORKBENCH_SUPERVISOR_CAPABILITY_HEADER,
		capability: TEST_CAPABILITY,
	})
	const proxiedBootstrap = await fetch(`${baseUrl}/api/session`, {
		method: 'POST',
		headers: { [WORKBENCH_SUPERVISOR_PROXY_HEADER]: 'vite' },
	})
	assert.equal(proxiedBootstrap.status, 200)

	const unauthorized = await fetch(`${baseUrl}/api/services`)
	assert.equal(unauthorized.status, 401)
	const offlineResponse = await fetch(`${baseUrl}/api/services`, {
		headers: {
			origin: 'null',
			[WORKBENCH_SUPERVISOR_CAPABILITY_HEADER]: TEST_CAPABILITY,
		},
	})
	assert.equal(offlineResponse.status, 200)
	const listing = await offlineResponse.json()
	assert.equal(listing.client, WORKBENCH_SUPERVISOR_CLIENT)
	assert.equal(
		listing.capabilityHeader,
		WORKBENCH_SUPERVISOR_CAPABILITY_HEADER,
	)
	assert.equal(Number.isFinite(Date.parse(listing.checkedAt)), true)
	assert.equal(listing.services[0].managedSafe, true)
	assert.equal('capability' in listing, false)

	const actionResponse = await fetch(
		`${baseUrl}/api/services/workbench/start`,
		{
			method: 'POST',
			headers: {
				origin: 'http://localhost:5175',
				[WORKBENCH_SUPERVISOR_CAPABILITY_HEADER]: TEST_CAPABILITY,
			},
		},
	)
	assert.equal(actionResponse.status, 200)
	assert.equal((await actionResponse.json()).service.state, 'starting')
	assert.deepEqual(calls, [{ id: 'workbench', action: 'start' }])
})

test('log redaction removes common resident and provider credentials', () => {
	const redacted = redactLogMessage(
		`Bearer top.secret-token api-key=my-secret password=hunter2 ${TEST_CAPABILITY} https://user:pass@example.test/path`,
	)
	assert.doesNotMatch(
		redacted,
		/top\.secret-token|my-secret|hunter2|hr_S|user:pass/,
	)
	assert.match(redacted, /\[REDACTED_CAPABILITY\]/)
})

function testManagedService() {
	return {
		id: 'test-managed',
		label: 'Test managed service',
		port: 61234,
		management: 'managed',
		healthPath: '/health',
		capabilities: ['test'],
		command: ['/fixed/node', '/fixed/service.mjs'],
		cwd: '/fixed',
		matchesHealth: ({ response, json }) =>
			response.ok && json?.ok === true && json?.service === 'test-managed',
	}
}

function createFakeChild(onKill, options = {}) {
	const child = new EventEmitter()
	child.stdout = new PassThrough()
	child.stderr = new PassThrough()
	child.exitCode = null
	child.signalCode = null
	child.killedWith = []
	child.kill = (signal) => {
		child.killedWith.push(signal)
		onKill(signal)
		if (options.exitOnKill === false) return true
		queueMicrotask(() => {
			if (child.exitCode != null || child.signalCode != null) return
			child.exitCode = 0
			child.emit('exit', 0, null)
		})
		return true
	}
	return child
}

function jsonResponse(payload) {
	return new Response(JSON.stringify(payload), {
		status: 200,
		headers: { 'content-type': 'application/json' },
	})
}
