import { spawn as spawnChild } from 'node:child_process'
import { createHash } from 'node:crypto'

export const TERMINAL_SESSION_MONITOR_PATH = '/terminal/session/status'
export const TERMINAL_SESSION_ROLES = Object.freeze(['architecture', 'ml'])
export const ZELLIJ_LIST_SESSIONS_ARGV = Object.freeze([
	'list-sessions',
	'--short',
	'--no-formatting',
])

const ZELLIJ_BIN = 'zellij'
const SESSION_REF_PREFIX = 'zj_'
const SESSION_REF_PATTERN = /^zj_[a-f0-9]{24}$/
const MAX_STATUS_BYTES = 16_384
const STATUS_TIMEOUT_MS = 2_000

function opaqueSessionRef(role, sessionName) {
	return `${SESSION_REF_PREFIX}${createHash('sha256')
		.update('canvapocalypse-terminal-session-v1\0')
		.update(role)
		.update('\0')
		.update(sessionName)
		.digest('hex')
		.slice(0, 24)}`
}

export function parseZellijSessionList(stdout) {
	if (typeof stdout !== 'string') return []
	return stdout
		.split(/\r?\n/u)
		.map((line) => line.trim())
		.filter(Boolean)
}

export function resolveExactZellijSession({
	sessions,
	sessionRef,
	configuredSessionName,
	role,
}) {
	const candidates = Array.isArray(sessions) ? sessions.filter(Boolean) : []
	const requestedRef =
		typeof sessionRef === 'string' && SESSION_REF_PATTERN.test(sessionRef)
			? sessionRef
			: null
	const configuredName =
		typeof configuredSessionName === 'string' && configuredSessionName.trim()
			? configuredSessionName.trim()
			: null

	// A role is an authority boundary, not a display hint. Every poll requires
	// an exact server-side role mapping, and opaque refs are role-bound. A ref
	// issued for the Architect session can therefore never make an unconfigured
	// ML role look available.
	if (!configuredName) return { state: 'unconfigured' }

	const matches = candidates.filter((name) => name === configuredName)

	if (matches.length === 0) return { state: 'missing' }
	if (matches.length > 1) return { state: 'ambiguous' }

	const exactRef = opaqueSessionRef(role, matches[0])
	if (requestedRef && requestedRef !== exactRef) return { state: 'missing' }
	return { state: 'available', sessionRef: exactRef }
}

function configuredSessionNameForRole(role, env) {
	if (role === 'architecture') return env.TLDRAW_ZELLIJ_ARCHITECT_SESSION
	if (role === 'ml') return env.TLDRAW_ZELLIJ_ML_SESSION
	return undefined
}

function safeResult(role, state, now, sessionRef) {
	const result = {
		provider: 'zellij',
		role,
		state,
		readOnly: true,
		checkedAt: new Date(now).toISOString(),
	}
	if (state === 'available' && sessionRef) result.sessionRef = sessionRef
	return result
}

function runFixedZellijList(spawnImpl = spawnChild) {
	return new Promise((resolve, reject) => {
		const child = spawnImpl(ZELLIJ_BIN, [...ZELLIJ_LIST_SESSIONS_ARGV], {
			shell: false,
			stdio: ['ignore', 'pipe', 'pipe'],
		})
		let stdout = ''
		let outputTooLarge = false
		const timeout = setTimeout(() => {
			child.kill('SIGTERM')
			reject(new Error('Zellij status check timed out'))
		}, STATUS_TIMEOUT_MS)

		child.stdout.on('data', (chunk) => {
			if (outputTooLarge) return
			stdout += String(chunk)
			if (Buffer.byteLength(stdout) > MAX_STATUS_BYTES) {
				outputTooLarge = true
				child.kill('SIGTERM')
			}
		})
		// Stderr is intentionally discarded. It can contain local filesystem or
		// runtime details that are outside the monitor's public contract.
		child.stderr.on('data', () => {})
		child.once('error', (error) => {
			clearTimeout(timeout)
			reject(error)
		})
		child.once('close', (code) => {
			clearTimeout(timeout)
			if (outputTooLarge) return reject(new Error('Zellij status response was too large'))
			if (code !== 0) return reject(new Error('Zellij status check failed'))
			resolve(stdout)
		})
	})
}

export async function inspectTerminalSession({
	role,
	sessionRef,
	env = process.env,
	spawnImpl = spawnChild,
	now = Date.now(),
} = {}) {
	if (!TERMINAL_SESSION_ROLES.includes(role)) {
		const error = new Error('Terminal session role must be architecture or ml')
		error.statusCode = 400
		throw error
	}
	if (
		sessionRef !== undefined &&
		sessionRef !== '' &&
		(typeof sessionRef !== 'string' || !SESSION_REF_PATTERN.test(sessionRef))
	) {
		const error = new Error('Terminal session ref is invalid')
		error.statusCode = 400
		throw error
	}

	try {
		const stdout = await runFixedZellijList(spawnImpl)
		const resolved = resolveExactZellijSession({
			sessions: parseZellijSessionList(stdout),
			sessionRef,
			configuredSessionName: configuredSessionNameForRole(role, env),
			role,
		})
		return safeResult(role, resolved.state, now, resolved.sessionRef)
	} catch {
		return safeResult(role, 'offline', now)
	}
}

export async function handleTerminalSessionMonitorRequest(
	url,
	request,
	response,
	send
) {
	if (url.pathname !== TERMINAL_SESSION_MONITOR_PATH) return false
	if (request.method !== 'GET') {
		response.setHeader('Allow', 'GET')
		send(response, 405, 'Method not allowed')
		return true
	}

	try {
		const result = await inspectTerminalSession({
			role: url.searchParams.get('role'),
			sessionRef: url.searchParams.get('sessionRef') ?? undefined,
		})
		response.setHeader('Content-Type', 'application/json; charset=utf-8')
		response.setHeader('Cache-Control', 'no-store')
		send(response, 200, JSON.stringify(result))
	} catch (error) {
		send(
			response,
			typeof error?.statusCode === 'number' ? error.statusCode : 500,
			error instanceof Error ? error.message : String(error)
		)
	}
	return true
}
