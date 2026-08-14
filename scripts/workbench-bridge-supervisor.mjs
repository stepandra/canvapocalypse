import { spawn as spawnChild } from 'node:child_process'
import { timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'
import { connect } from 'node:net'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
	htmlMockupResidentCapabilityFile,
	loadOrCreateHtmlMockupResidentCapability,
} from './html-mockup-resident-capability.mjs'

export const WORKBENCH_SUPERVISOR_HOST = '127.0.0.1'
export const WORKBENCH_SUPERVISOR_PORT = 5177
export const WORKBENCH_SUPERVISOR_CLIENT = 'workbench-bridge-supervisor'
export const WORKBENCH_SUPERVISOR_SCHEMA_VERSION = 1
export const WORKBENCH_SUPERVISOR_CAPABILITY_HEADER =
	'x-tldraw-html-capability'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '..')
const DEFAULT_POLL_INTERVAL_MS = 2_000
const DEFAULT_PROBE_TIMEOUT_MS = 800
const DEFAULT_START_GRACE_MS = 8_000
const DEFAULT_STOP_GRACE_MS = 3_000
const MAX_HEALTH_BYTES = 64 * 1024
const MAX_LOG_ENTRIES = 40
const MAX_LOG_MESSAGE_CHARS = 320
const LOCAL_HTTP_ORIGINS = new Set([
	'http://127.0.0.1:5173',
	'http://localhost:5173',
	'http://127.0.0.1:5175',
	'http://localhost:5175',
])

export const WORKBENCH_SERVICE_STATES = Object.freeze([
	'stopped',
	'starting',
	'healthy',
	'degraded',
	'external',
	'port-conflict',
	'stopping',
])

export const WORKBENCH_SERVICE_REGISTRY = Object.freeze([
	Object.freeze({
		id: 'workbench',
		label: 'Workbench Bridge',
		port: 5176,
		management: 'managed',
		healthPath: '/health',
		capabilities: Object.freeze([
			'native-tldraw',
			'workflow-llm',
			'resident-providers',
		]),
		command: Object.freeze([
			'/usr/bin/env',
			'node',
			join(REPO_ROOT, 'scripts', 'workflow-llm-bridge.mjs'),
		]),
		cwd: REPO_ROOT,
		matchesHealth: exactJsonIdentity({
			status: 'ok',
			bridge: 'workflow-llm',
			mlIntern: 'terminal-first',
			surface: 'native-tldraw',
		}),
	}),
	Object.freeze({
		id: 'isoflow',
		label: 'Isoflow Studio+Bridge v2',
		port: 4174,
		management: 'managed',
		healthPath: '/api/isoflow/health',
		capabilities: Object.freeze([
			'isoflow-studio',
			'bridge-v2',
			'revision-guarded',
		]),
		command: Object.freeze([
			'/usr/bin/env',
			'node',
			join(REPO_ROOT, 'isoflow-studio', 'node_modules', 'vite', 'bin', 'vite.js'),
			'--host',
			'127.0.0.1',
			'--port',
			'4174',
			'--strictPort',
		]),
		cwd: join(REPO_ROOT, 'isoflow-studio'),
		matchesHealth: exactJsonIdentity({
			ok: true,
			service: 'isoflow-model-bridge',
			schemaVersion: 2,
		}),
	}),
	Object.freeze({
		id: 'kanban',
		label: 'Kanban runtime',
		port: 3484,
		management: 'external',
		healthPath: '/',
		capabilities: Object.freeze(['kanban-runtime', 'observe-only']),
		matchesHealth: ({ response, text }) =>
			response.ok && text.includes('<title>Kanban</title>'),
	}),
	Object.freeze({
		id: 'legacy-ml',
		label: 'Legacy ML-Intern backend',
		port: 7860,
		management: 'external',
		healthPath: '/api/health',
		capabilities: Object.freeze(['ml-intern', 'observe-only']),
		matchesHealth: ({ response, json }) =>
			response.ok &&
			isPlainObject(json) &&
			json.status === 'ok' &&
			Number.isInteger(json.active_sessions) &&
			Number.isInteger(json.max_sessions),
	}),
])

export function createWorkbenchServiceManager(options = {}) {
	const services = options.services ?? WORKBENCH_SERVICE_REGISTRY
	validateRegistry(services)
	return new WorkbenchServiceManager({
		services,
		fetchImpl: options.fetchImpl ?? globalThis.fetch,
		portProbe: options.portProbe ?? probeLoopbackPort,
		spawnImpl: options.spawnImpl ?? spawnChild,
		now: options.now ?? Date.now,
		probeTimeoutMs: options.probeTimeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS,
		startGraceMs: options.startGraceMs ?? DEFAULT_START_GRACE_MS,
		stopGraceMs: options.stopGraceMs ?? DEFAULT_STOP_GRACE_MS,
	})
}

export function createWorkbenchBridgeSupervisor(options = {}) {
	const host = options.host ?? WORKBENCH_SUPERVISOR_HOST
	const port = options.port ?? WORKBENCH_SUPERVISOR_PORT
	if (host !== WORKBENCH_SUPERVISOR_HOST) {
		throw new Error('Workbench bridge supervisor must remain loopback-only.')
	}
	if (!Number.isInteger(port) || port < 0 || port > 65_535) {
		throw new Error('Workbench bridge supervisor port is invalid.')
	}

	const manager =
		options.manager ?? createWorkbenchServiceManager(options.managerOptions)
	const residentCapability =
		options.residentCapability ??
		loadOrCreateHtmlMockupResidentCapability({
			cwd: REPO_ROOT,
			capabilityPath: options.capabilityPath,
			envCapability: options.envCapability,
		})
	const allowedOrigins = new Set(options.allowedOrigins ?? LOCAL_HTTP_ORIGINS)
	const pollIntervalMs =
		options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS

	const server = createServer(async (request, response) => {
		setCommonHeaders(response)
		const requestOrigin = readHeader(request, 'origin')
		if (requestOrigin && requestOrigin !== 'null') {
			if (!allowedOrigins.has(requestOrigin)) {
				return sendJson(response, 403, {
					error: 'origin_not_allowed',
					message: 'The request Origin is not an exact local workbench origin.',
				})
			}
			response.setHeader('Access-Control-Allow-Origin', requestOrigin)
		}

		if (request.method === 'OPTIONS') {
			if (!requestOrigin || !allowedOrigins.has(requestOrigin)) {
				return sendJson(response, 403, {
					error: 'origin_not_allowed',
					message: 'CORS preflight requires an exact local workbench Origin.',
				})
			}
			return sendEmpty(response, 204)
		}

		const url = new URL(request.url ?? '/', `http://${host}:${port}`)
		if (request.method === 'GET' && url.pathname === '/health') {
			return sendJson(response, 200, {
				status: 'ok',
				service: WORKBENCH_SUPERVISOR_CLIENT,
				schemaVersion: WORKBENCH_SUPERVISOR_SCHEMA_VERSION,
			})
		}

		if (request.method === 'POST' && url.pathname === '/api/session') {
			if (!requestOrigin || !allowedOrigins.has(requestOrigin)) {
				return sendJson(response, 403, {
					error: 'resident_bootstrap_forbidden',
					message:
						'Only an exact trusted HTTP workbench Origin may bootstrap the resident capability.',
				})
			}
			return sendJson(response, 200, {
				client: WORKBENCH_SUPERVISOR_CLIENT,
				capabilityHeader: WORKBENCH_SUPERVISOR_CAPABILITY_HEADER,
				capability: residentCapability,
			})
		}

		if (!url.pathname.startsWith('/api/')) {
			return sendJson(response, 404, { error: 'not_found' })
		}
		if (
			!constantTimeTokenEqual(
				readHeader(request, WORKBENCH_SUPERVISOR_CAPABILITY_HEADER),
				residentCapability,
			)
		) {
			return sendJson(response, 401, {
				error: 'resident_capability_required',
				message: 'A valid resident workbench capability is required.',
			})
		}

		try {
			if (request.method === 'GET' && url.pathname === '/api/services') {
				return sendJson(response, 200, {
					client: WORKBENCH_SUPERVISOR_CLIENT,
					capabilityHeader: WORKBENCH_SUPERVISOR_CAPABILITY_HEADER,
					checkedAt: new Date().toISOString(),
					services: await manager.listServices(),
				})
			}

			const actionMatch = url.pathname.match(
				/^\/api\/services\/([^/]+)\/(start|stop|restart|check)$/,
			)
			if (request.method === 'POST' && actionMatch) {
				const serviceId = decodeURIComponent(actionMatch[1])
				const action = actionMatch[2]
				const service = await manager.performAction(serviceId, action)
				return sendJson(response, 200, { service })
			}

			return sendJson(response, 404, { error: 'not_found' })
		} catch (error) {
			const statusCode =
				Number.isInteger(error?.statusCode) &&
				error.statusCode >= 400 &&
				error.statusCode <= 599
					? error.statusCode
					: 500
			return sendJson(response, statusCode, {
				error:
					typeof error?.code === 'string'
						? error.code
						: 'supervisor_request_failed',
				message:
					statusCode === 500
						? 'The supervisor request failed.'
						: redactLogMessage(error?.message ?? 'Request failed.'),
			})
		}
	})

	let pollTimer
	let listening = false

	return {
		server,
		manager,
		async listen() {
			if (listening) return server.address()
			await new Promise((resolveListen, rejectListen) => {
				const onError = (error) => {
					server.off('listening', onListening)
					rejectListen(error)
				}
				const onListening = () => {
					server.off('error', onError)
					resolveListen()
				}
				server.once('error', onError)
				server.once('listening', onListening)
				server.listen(port, host)
			})
			listening = true
			pollTimer = setInterval(() => {
				void manager.listServices().catch(() => {
					// A request will receive a bounded error; polling never crashes the host.
				})
			}, pollIntervalMs)
			pollTimer.unref()
			return server.address()
		},
		async close({ stopManaged = true } = {}) {
			if (pollTimer) clearInterval(pollTimer)
			pollTimer = undefined
			if (stopManaged) await manager.stopAllOwned()
			if (!listening) return
			await new Promise((resolveClose, rejectClose) => {
				server.close((error) => {
					if (error) rejectClose(error)
					else resolveClose()
				})
			})
			listening = false
		},
	}
}

class WorkbenchServiceManager {
	constructor({
		services,
		fetchImpl,
		portProbe,
		spawnImpl,
		now,
		probeTimeoutMs,
		startGraceMs,
		stopGraceMs,
	}) {
		this.services = services
		this.serviceById = new Map(services.map((service) => [service.id, service]))
		this.fetchImpl = fetchImpl
		this.portProbe = portProbe
		this.spawnImpl = spawnImpl
		this.now = now
		this.probeTimeoutMs = probeTimeoutMs
		this.startGraceMs = startGraceMs
		this.stopGraceMs = stopGraceMs
		this.runtime = new Map(
			services.map((service) => [
				service.id,
				{
					child: null,
					transition: null,
					transitionAt: 0,
					logs: [],
					logBuffers: { stdout: '', stderr: '' },
					lock: Promise.resolve(),
				},
			]),
		)
	}

	async listServices() {
		return Promise.all(this.services.map((service) => this.inspect(service)))
	}

	async performAction(serviceId, action) {
		const service = this.serviceById.get(serviceId)
		if (!service) {
			throw supervisorError(
				404,
				'unknown_service',
				'The service is not in the fixed supervisor registry.',
			)
		}
		if (!['start', 'stop', 'restart', 'check'].includes(action)) {
			throw supervisorError(404, 'unknown_action', 'Unknown service action.')
		}
		const state = this.runtime.get(service.id)
		return this.withServiceLock(state, async () => {
			if (action === 'check') return this.inspect(service)
			if (service.management !== 'managed') {
				throw supervisorError(
					403,
					'external_service_observe_only',
					'External services are observed only and cannot be lifecycle-controlled.',
				)
			}
			if (action === 'start') return this.startService(service, state)
			if (action === 'stop') return this.stopService(service, state)
			await this.stopService(service, state)
			if (state.child) return this.inspect(service)
			return this.startService(service, state)
		})
	}

	async startService(service, state) {
		const current = await this.inspect(service)
		if (state.child) return current
		if (current.state === 'external') {
			throw supervisorError(
				409,
				'external_process_not_owned',
				'The exact service is already running outside this supervisor.',
			)
		}
		if (current.state === 'port-conflict') {
			throw supervisorError(
				409,
				'service_port_conflict',
				'The fixed service port is occupied by a different process.',
			)
		}

		state.transition = 'starting'
		state.transitionAt = this.now()
		let child
		try {
			child = this.spawnImpl(service.command[0], service.command.slice(1), {
				cwd: service.cwd,
				env: process.env,
				stdio: ['ignore', 'pipe', 'pipe'],
				shell: false,
				windowsHide: true,
			})
		} catch (error) {
			state.transition = null
			this.appendLog(state, 'stderr', `Start failed: ${error?.message ?? error}`)
			throw supervisorError(
				500,
				'managed_service_start_failed',
				'The managed service could not be started.',
			)
		}
		state.child = child
		this.captureChildLogs(service, state, child)
		child.once('error', (error) => {
			if (state.child !== child) return
			this.appendLog(
				state,
				'stderr',
				`Managed process error: ${error?.message ?? error}`,
			)
		})
		child.once('exit', (code, signal) => {
			if (state.child !== child) return
			this.flushLogBuffers(state)
			state.child = null
			state.transition = null
			this.appendLog(
				state,
				code === 0 ? 'stdout' : 'stderr',
				`Managed process exited (${signal ? `signal ${signal}` : `code ${code ?? 'unknown'}`}).`,
			)
		})
		return this.inspect(service)
	}

	async stopService(service, state) {
		const child = state.child
		if (!child) {
			const current = await this.inspect(service)
			if (current.state === 'external') {
				throw supervisorError(
					409,
					'external_process_not_owned',
					'The exact service is running outside this supervisor and will not be stopped.',
				)
			}
			return current
		}

		state.transition = 'stopping'
		state.transitionAt = this.now()
		child.kill('SIGTERM')
		await waitForChildExit(child, this.stopGraceMs)
		if (state.child === child && child.exitCode == null && child.signalCode == null) {
			child.kill('SIGKILL')
			await waitForChildExit(child, Math.min(1_000, this.stopGraceMs))
		}
		return this.inspect(service)
	}

	async stopAllOwned() {
		for (const service of this.services) {
			if (service.management !== 'managed') continue
			const state = this.runtime.get(service.id)
			if (!state.child) continue
			await this.withServiceLock(state, () => this.stopService(service, state))
		}
	}

	async inspect(service) {
		const state = this.runtime.get(service.id)
		const probe = await this.probe(service)
		const childOwned = Boolean(state.child)
		let serviceState
		let detail

		if (state.transition === 'stopping' && childOwned) {
			serviceState = 'stopping'
			detail = 'Stopping the supervisor-owned process.'
		} else if (probe.kind === 'healthy') {
			serviceState = childOwned ? 'healthy' : 'external'
			detail = childOwned
				? 'Exact health identity verified for the supervisor-owned process.'
				: service.management === 'managed'
					? 'Exact service is healthy but was not started by this supervisor.'
					: 'External service health is verified; lifecycle remains external.'
			if (childOwned) state.transition = null
		} else if (probe.kind === 'port-conflict') {
			serviceState = 'port-conflict'
			detail = 'The fixed port is occupied without the exact service identity.'
		} else if (childOwned) {
			const childExited =
				state.child.exitCode != null || state.child.signalCode != null
			if (childExited) {
				state.child = null
				state.transition = null
				serviceState = 'stopped'
				detail = 'The supervisor-owned process has exited.'
			} else if (
				state.transition === 'starting' &&
				this.now() - state.transitionAt <= this.startGraceMs
			) {
				serviceState = 'starting'
				detail = 'Starting the supervisor-owned process.'
			} else {
				serviceState = 'degraded'
				detail = 'The supervisor-owned process is running without exact health.'
			}
		} else {
			serviceState = 'stopped'
			detail =
				service.management === 'managed'
					? 'Managed service is not running.'
					: 'External service is not responding.'
			state.transition = null
		}

		const managedSafe =
			service.management === 'managed' &&
			serviceState !== 'external' &&
			serviceState !== 'port-conflict'
		return {
			id: service.id,
			label: service.label,
			state: serviceState,
			management: service.management,
			controllable: managedSafe,
			managedSafe,
			detail,
			capabilities: [...service.capabilities],
			...(state.logs.length ? { logs: state.logs.map((entry) => ({ ...entry })) } : {}),
		}
	}

	async probe(service) {
		const controller = new AbortController()
		const timeout = setTimeout(() => controller.abort(), this.probeTimeoutMs)
		timeout.unref()
		try {
			const response = await this.fetchImpl(
				`http://127.0.0.1:${service.port}${service.healthPath}`,
				{
					method: 'GET',
					headers: { accept: 'application/json, text/html;q=0.8' },
					signal: controller.signal,
				},
			)
			const text = await readBoundedResponseText(response, MAX_HEALTH_BYTES)
			let json = null
			try {
				json = JSON.parse(text)
			} catch {
				// Text identities, such as Kanban's fixed title, are valid.
			}
			return service.matchesHealth({ response, text, json })
				? { kind: 'healthy' }
				: { kind: 'port-conflict' }
		} catch {
			try {
				return (await this.portProbe(service.port, this.probeTimeoutMs))
					? { kind: 'port-conflict' }
					: { kind: 'absent' }
			} catch {
				return { kind: 'absent' }
			}
		} finally {
			clearTimeout(timeout)
		}
	}

	captureChildLogs(service, state, child) {
		for (const stream of ['stdout', 'stderr']) {
			const readable = child[stream]
			if (!readable || typeof readable.on !== 'function') continue
			readable.on('data', (chunk) => {
				const combined =
					state.logBuffers[stream] + String(chunk).slice(0, MAX_LOG_MESSAGE_CHARS * 4)
				const lines = combined.split(/\r?\n/)
				state.logBuffers[stream] = lines.pop()?.slice(-MAX_LOG_MESSAGE_CHARS) ?? ''
				for (const line of lines) this.appendLog(state, stream, line)
			})
		}
		this.appendLog(state, 'stdout', `Starting ${service.label}.`)
	}

	flushLogBuffers(state) {
		for (const stream of ['stdout', 'stderr']) {
			if (state.logBuffers[stream]) {
				this.appendLog(state, stream, state.logBuffers[stream])
				state.logBuffers[stream] = ''
			}
		}
	}

	appendLog(state, stream, message) {
		const redacted = redactLogMessage(message)
		if (!redacted) return
		state.logs.push({
			stream,
			message: redacted.slice(0, MAX_LOG_MESSAGE_CHARS),
		})
		if (state.logs.length > MAX_LOG_ENTRIES) {
			state.logs.splice(0, state.logs.length - MAX_LOG_ENTRIES)
		}
	}

	async withServiceLock(state, operation) {
		const previous = state.lock
		let release
		state.lock = new Promise((resolveLock) => {
			release = resolveLock
		})
		await previous
		try {
			return await operation()
		} finally {
			release()
		}
	}
}

export function redactLogMessage(value) {
	return String(value ?? '')
		.replace(/\bhr_[A-Za-z0-9_-]{20,128}\b/g, '[REDACTED_CAPABILITY]')
		.replace(
			/\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{16,}|github_pat_[A-Za-z0-9_]{16,}|hf_[A-Za-z0-9]{16,}|xox[baprs]-[A-Za-z0-9-]{16,}|AIza[A-Za-z0-9_-]{20,}|AKIA[A-Z0-9]{16})\b/g,
			'[REDACTED_CREDENTIAL]',
		)
		.replace(
			/\b(Bearer\s+)[A-Za-z0-9._~+/-]{8,}=*/gi,
			'$1[REDACTED]',
		)
		.replace(
			/\b(api[_-]?key|access[_-]?token|authorization|password|secret)\s*[:=]\s*([^\s,;]+)/gi,
			'$1=[REDACTED]',
		)
		.replace(/(https?:\/\/)[^/\s:@]+:[^/\s@]+@/gi, '$1[REDACTED]@')
		.replace(
			/([?&](?:api[_-]?key|access[_-]?token|token|secret|password)=)[^&#\s]+/gi,
			'$1[REDACTED]',
		)
		.replace(/[\r\n\t]+/g, ' ')
		.trim()
}

export function workbenchSupervisorCapabilityFile(options = {}) {
	return htmlMockupResidentCapabilityFile({
		cwd: REPO_ROOT,
		capabilityPath: options.capabilityPath,
	})
}

function exactJsonIdentity(expected) {
	const expectedKeys = Object.keys(expected).sort()
	return ({ response, json }) => {
		if (!response.ok || !isPlainObject(json)) return false
		const actualKeys = Object.keys(json).sort()
		if (
			actualKeys.length !== expectedKeys.length ||
			actualKeys.some((key, index) => key !== expectedKeys[index])
		) {
			return false
		}
		return expectedKeys.every((key) => Object.is(json[key], expected[key]))
	}
}

function validateRegistry(services) {
	if (!Array.isArray(services) || services.length === 0) {
		throw new Error('Workbench service registry must not be empty.')
	}
	const ids = new Set()
	const ports = new Set()
	for (const service of services) {
		if (
			!service ||
			typeof service.id !== 'string' ||
			!service.id ||
			ids.has(service.id)
		) {
			throw new Error('Workbench service registry IDs must be unique.')
		}
		if (!Number.isInteger(service.port) || ports.has(service.port)) {
			throw new Error('Workbench service registry ports must be unique integers.')
		}
		if (!['managed', 'external'].includes(service.management)) {
			throw new Error('Workbench service management must be fixed.')
		}
		if (
			service.management === 'managed' &&
			(!Array.isArray(service.command) || service.command.length < 2)
		) {
			throw new Error('Managed workbench services require a fixed command.')
		}
		if (typeof service.matchesHealth !== 'function') {
			throw new Error('Workbench services require an exact health matcher.')
		}
		ids.add(service.id)
		ports.add(service.port)
	}
}

function isPlainObject(value) {
	return (
		value !== null &&
		typeof value === 'object' &&
		!Array.isArray(value) &&
		Object.getPrototypeOf(value) === Object.prototype
	)
}

function readHeader(request, headerName) {
	const value = request.headers?.[headerName]
	return Array.isArray(value) ? value[0] : value
}

function constantTimeTokenEqual(supplied, expected) {
	if (typeof supplied !== 'string' || typeof expected !== 'string') return false
	const suppliedBuffer = Buffer.from(supplied)
	const expectedBuffer = Buffer.from(expected)
	return (
		suppliedBuffer.length === expectedBuffer.length &&
		timingSafeEqual(suppliedBuffer, expectedBuffer)
	)
}

function setCommonHeaders(response) {
	response.setHeader('Cache-Control', 'no-store')
	response.setHeader('Content-Security-Policy', "default-src 'none'")
	response.setHeader('X-Content-Type-Options', 'nosniff')
	response.setHeader('Vary', 'Origin')
	response.setHeader(
		'Access-Control-Allow-Headers',
		`content-type, ${WORKBENCH_SUPERVISOR_CAPABILITY_HEADER}`,
	)
	response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
}

function sendJson(response, statusCode, payload) {
	response.statusCode = statusCode
	response.setHeader('Content-Type', 'application/json; charset=utf-8')
	response.end(JSON.stringify(payload))
}

function sendEmpty(response, statusCode) {
	response.statusCode = statusCode
	response.end()
}

async function readBoundedResponseText(response, maxBytes) {
	const declaredLength = Number(response.headers?.get?.('content-length'))
	if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
		throw new Error('Health response exceeded the bounded size.')
	}
	if (!response.body?.getReader) {
		const text = await response.text()
		if (Buffer.byteLength(text) > maxBytes) {
			throw new Error('Health response exceeded the bounded size.')
		}
		return text
	}
	const reader = response.body.getReader()
	const chunks = []
	let totalBytes = 0
	while (true) {
		const { done, value } = await reader.read()
		if (done) break
		totalBytes += value.byteLength
		if (totalBytes > maxBytes) {
			await reader.cancel()
			throw new Error('Health response exceeded the bounded size.')
		}
		chunks.push(value)
	}
	return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf8')
}

function probeLoopbackPort(port, timeoutMs) {
	return new Promise((resolveProbe) => {
		const socket = connect({ host: WORKBENCH_SUPERVISOR_HOST, port })
		const finish = (occupied) => {
			socket.removeAllListeners()
			socket.destroy()
			resolveProbe(occupied)
		}
		socket.setTimeout(timeoutMs)
		socket.once('connect', () => finish(true))
		socket.once('timeout', () => finish(false))
		socket.once('error', () => finish(false))
	})
}

function waitForChildExit(child, timeoutMs) {
	if (child.exitCode != null || child.signalCode != null) return Promise.resolve(true)
	return new Promise((resolveExit) => {
		let settled = false
		const finish = (exited) => {
			if (settled) return
			settled = true
			clearTimeout(timer)
			child.off('exit', onExit)
			resolveExit(exited)
		}
		const onExit = () => finish(true)
		const timer = setTimeout(() => finish(false), timeoutMs)
		child.once('exit', onExit)
	})
}

function supervisorError(statusCode, code, message) {
	const error = new Error(message)
	error.statusCode = statusCode
	error.code = code
	return error
}

async function runMain() {
	const supervisor = createWorkbenchBridgeSupervisor()
	const close = async () => {
		process.off('SIGINT', close)
		process.off('SIGTERM', close)
		await supervisor.close()
	}
	process.on('SIGINT', close)
	process.on('SIGTERM', close)
	const address = await supervisor.listen()
	const capabilityPath = workbenchSupervisorCapabilityFile()
	console.log(
		`${WORKBENCH_SUPERVISOR_CLIENT} listening on http://${address.address}:${address.port}; resident authority loaded from ${capabilityPath}`,
	)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	runMain().catch((error) => {
		console.error(
			`${WORKBENCH_SUPERVISOR_CLIENT} failed: ${redactLogMessage(error?.message ?? error)}`,
		)
		process.exitCode = 1
	})
}
