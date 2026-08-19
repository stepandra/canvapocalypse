import { lstat, readFile, readdir, realpath } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'

const DEFAULT_BRIDGE_URL = 'http://127.0.0.1:5176'
const DEFAULT_SUPERVISOR_URL = 'http://127.0.0.1:5177'
const RESIDENT_CAPABILITY_PATTERN = /^hr_[A-Za-z0-9_-]{43,128}$/
const OPAQUE_LOCAL_ID_PATTERN = /^[a-zA-Z0-9._:-]{1,128}$/
const CANVAS_BINDING_SLOT = 'canvapocalypse.renderer.companionCanvasBinding'
const CANVAS_CAPABILITY_CATALOG_SLOT =
	'canvapocalypse.renderer.companionCanvasCapabilityCatalog'
const MAX_CAPABILITY_CATALOG_BYTES = 64_000
const TERMINAL_STATUSES = new Set(['succeeded', 'failed'])

export function resolveLoopbackBridgeUrl(
	value = process.env.CANVAPOCALYPSE_BRIDGE_URL || DEFAULT_BRIDGE_URL
) {
	const url = new URL(value)
	const loopbackHosts = new Set(['127.0.0.1', 'localhost', '[::1]'])
	if (
		url.protocol !== 'http:' ||
		!loopbackHosts.has(url.hostname) ||
		url.username ||
		url.password ||
		url.search ||
		url.hash
	) {
		throw new Error('Canvapocalypse companion bridge must be an unauthenticated loopback HTTP URL')
	}
	url.pathname = url.pathname.replace(/\/+$/, '')
	return url.toString().replace(/\/$/, '')
}

export async function resolveProjectCanvasTarget({
	workspaceRoot,
	serverConfigPath = resolveTldrawServerConfigPath(),
	fetchFn = fetch,
	fs = { lstat, readFile, readdir, realpath },
	pathApi = path,
	requireCapabilityCatalog = true,
} = {}) {
	if (typeof workspaceRoot !== 'string' || !workspaceRoot) {
		throw new Error('tldraw project routing requires an Amp workspace')
	}
	let canonicalWorkspaceRoot
	try {
		canonicalWorkspaceRoot = await fs.realpath(workspaceRoot)
	} catch {
		throw new Error('The Amp workspace is unavailable for tldraw project routing.')
	}
	const canvasDir = pathApi.join(canonicalWorkspaceRoot, '.canvas')
	const canvasDirStat = await fs.lstat(canvasDir).catch(() => null)
	if (!canvasDirStat?.isDirectory() || canvasDirStat.isSymbolicLink()) {
		throw new Error('Expected a real project canvas directory at .canvas.')
	}

	let entries
	try {
		entries = await fs.readdir(canvasDir, { withFileTypes: true })
	} catch {
		throw new Error('The project canvas directory cannot be read.')
	}
	const candidates = entries.filter(
		(entry) => entry.isFile() && !entry.isSymbolicLink() && entry.name.toLowerCase().endsWith('.tldraw')
	)
	if (candidates.length !== 1) {
		throw new Error(
			`Expected exactly one project canvas at .canvas/*.tldraw; found ${candidates.length}.`
		)
	}

	const candidatePath = pathApi.join(canvasDir, candidates[0].name)
	const candidateStat = await fs.lstat(candidatePath).catch(() => null)
	if (!candidateStat?.isFile() || candidateStat.isSymbolicLink()) {
		throw new Error('The project canvas must be a regular non-symlink .tldraw file.')
	}
	let projectCanvas
	try {
		projectCanvas = await fs.realpath(candidatePath)
	} catch {
		throw new Error('The project canvas cannot be resolved.')
	}
	if (!isPathContained(canonicalWorkspaceRoot, projectCanvas, pathApi)) {
		throw new Error('Resolved project canvas escapes the Amp workspace.')
	}

	const server = await readTldrawServerConfig(serverConfigPath, fs)
	const docsPayload = await tldrawOfflineRequest(
		server,
		'/api/search',
		{ method: 'POST', body: JSON.stringify({ code: 'return await api.getDocs()' }) },
		fetchFn
	)
	const docs = Array.isArray(docsPayload.result) ? docsPayload.result : []
	const matches = []
	for (const doc of docs) {
		if (!isOpenTldrawDoc(doc)) continue
		const openPath = await fs.realpath(doc.filePath).catch(() => '')
		if (openPath === projectCanvas) matches.push(doc)
	}
	if (matches.length !== 1) {
		throw new Error(
			matches.length === 0
				? 'Open the sole .canvas/*.tldraw project canvas in tldraw Offline.'
				: 'The project canvas is open in multiple tldraw Offline windows; close the duplicate.'
		)
	}

	const bindingPayload = await tldrawOfflineRequest(
		server,
		`/api/doc/${encodeURIComponent(matches[0].documentId)}/exec`,
		{
			method: 'POST',
			body: JSON.stringify({
				code: `return {
					canvasBinding: Reflect.get(globalThis, Symbol.for(${JSON.stringify(CANVAS_BINDING_SLOT)})),
					capabilityCatalog: Reflect.get(globalThis, Symbol.for(${JSON.stringify(CANVAS_CAPABILITY_CATALOG_SLOT)})),
				}`,
			}),
		},
		fetchFn
	)
	const target =
		typeof bindingPayload.result === 'string'
			? { canvasBinding: bindingPayload.result, capabilityCatalog: undefined }
			: bindingPayload.result
	if (
		!isRecord(target) ||
		typeof target.canvasBinding !== 'string' ||
		!OPAQUE_LOCAL_ID_PATTERN.test(target.canvasBinding)
	) {
		throw new Error('The project canvas has no active Canvapocalypse companion binding.')
	}
	const capabilityCatalog = target.capabilityCatalog
	let catalogBytes = 0
	try {
		catalogBytes = capabilityCatalog
			? Buffer.byteLength(JSON.stringify(capabilityCatalog))
			: 0
	} catch {
		throw new Error('The project canvas capability catalog is malformed.')
	}
	if (catalogBytes > MAX_CAPABILITY_CATALOG_BYTES) {
		throw new Error('The project canvas capability catalog exceeds its bounded size.')
	}
	if (
		requireCapabilityCatalog &&
		(!isRecord(capabilityCatalog) ||
			capabilityCatalog.schema !== 'canvas-studio-runtime-capabilities/v1' ||
			capabilityCatalog.version !== 1 ||
			capabilityCatalog.surface !== 'tldraw' ||
			typeof capabilityCatalog.catalogRevision !== 'string' ||
			!Array.isArray(capabilityCatalog.kits) ||
			!Array.isArray(capabilityCatalog.capabilities))
	) {
		throw new Error('The project canvas capability catalog is not ready; wait for the mounted workbench.')
	}
	return {
		canvasBinding: target.canvasBinding,
		...(capabilityCatalog ? { capabilityCatalog } : {}),
	}
}

export async function resolveProjectCanvasBinding(options = {}) {
	const target = await resolveProjectCanvasTarget({
		...options,
		requireCapabilityCatalog: false,
	})
	return target.canvasBinding
}

export function isPathContained(parent, candidate, pathApi = path) {
	const relativePath = pathApi.relative(parent, candidate)
	return (
		!pathApi.isAbsolute(relativePath) &&
		relativePath !== '..' &&
		!relativePath.startsWith(`..${pathApi.sep}`)
	)
}

function resolveTldrawServerConfigPath({
	platform = process.platform,
	homeDir = homedir(),
	appData = process.env.APPDATA,
	pathApi = path,
} = {}) {
	return platform === 'darwin'
		? pathApi.join(homeDir, 'Library', 'Application Support', 'tldraw', 'server.json')
		: platform === 'win32' && appData
			? pathApi.join(appData, 'tldraw', 'server.json')
			: pathApi.join(homeDir, '.config', 'tldraw', 'server.json')
}

async function readTldrawServerConfig(configPath, fs) {
	let parsed
	try {
		parsed = JSON.parse(await fs.readFile(configPath, 'utf8'))
	} catch {
		throw new Error('tldraw Offline is not running or its local server config is unavailable.')
	}
	if (
		!isRecord(parsed) ||
		!Number.isInteger(parsed.port) ||
		parsed.port < 1 ||
		parsed.port > 65_535 ||
		typeof parsed.token !== 'string' ||
		parsed.token.length < 16
	) {
		throw new Error('tldraw Offline local server config is invalid.')
	}
	return { port: parsed.port, token: parsed.token }
}

async function tldrawOfflineRequest(server, requestPath, init, fetchFn) {
	const response = await fetchFn(`http://127.0.0.1:${server.port}${requestPath}`, {
		method: init.method,
		headers: {
			authorization: `Bearer ${server.token}`,
			'content-type': 'application/json',
		},
		body: init.body,
		signal: AbortSignal.timeout(5_000),
	})
	const text = await response.text()
	let payload
	try {
		payload = JSON.parse(text)
	} catch {
		throw new Error(`tldraw Offline returned non-JSON HTTP ${response.status}.`)
	}
	if (!response.ok || !isRecord(payload) || payload.success !== true) {
		throw new Error(`tldraw Offline project lookup failed with HTTP ${response.status}.`)
	}
	return payload
}

function isOpenTldrawDoc(value) {
	return (
		isRecord(value) &&
		typeof value.documentId === 'string' &&
		OPAQUE_LOCAL_ID_PATTERN.test(value.documentId) &&
		typeof value.filePath === 'string'
	)
}

function isRecord(value) {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export async function startWorkbenchBridge({
	residentCapability,
	supervisorUrl = DEFAULT_SUPERVISOR_URL,
	bridgeUrl = DEFAULT_BRIDGE_URL,
	fetchFn = fetch,
	pollIntervalMs = 100,
	timeoutMs = 8_000,
	delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
	if (!RESIDENT_CAPABILITY_PATTERN.test(residentCapability ?? '')) {
		throw new Error('A valid local resident capability is required to start the tldraw workbench bridge')
	}
	const supervisor = resolveLoopbackBridgeUrl(supervisorUrl)
	const bridge = resolveLoopbackBridgeUrl(bridgeUrl)
	let response
	try {
		response = await fetchFn(`${supervisor}/api/services/workbench/start`, {
			method: 'POST',
			headers: { 'x-tldraw-html-capability': residentCapability },
		})
	} catch {
		throw new Error('The local tldraw workbench supervisor is unavailable')
	}
	const payload = await readJsonResponse(response)
	if (!response.ok) {
		throw new Error(
			`The local tldraw workbench supervisor rejected bridge startup (${payload?.error ?? `HTTP ${response.status}`})`
		)
	}
	if (payload?.service?.id !== 'workbench') {
		throw new Error('The local tldraw workbench supervisor returned an invalid service receipt')
	}
	if (['stopped', 'port-conflict'].includes(payload.service.state)) {
		throw new Error(
			`The local tldraw workbench bridge did not start (${payload.service.state})`
		)
	}

	const deadline = Date.now() + timeoutMs
	while (Date.now() <= deadline) {
		try {
			const healthResponse = await fetchFn(`${bridge}/health`, { cache: 'no-store' })
			const health = await readJsonResponse(healthResponse)
			if (healthResponse.ok && isExactWorkbenchHealth(health)) return
		} catch {
			// The managed process may not have bound its port yet.
		}
		await delay(pollIntervalMs)
	}
	throw new Error('The local tldraw workbench bridge did not become healthy after startup')
}

export function createAmpTldrawCompanionClient({
	baseUrl = resolveLoopbackBridgeUrl(),
	fetchFn = fetch,
	startBridge,
	pollIntervalMs = 250,
	timeoutMs = 120_000,
	delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
	actor = 'amp',
	source = 'amp-plugin',
} = {}) {
	const endpoint = `${baseUrl}/companion/canvas-tool`
	let startPromise

	async function requestJson(path, init) {
		const request = () => fetchFn(`${endpoint}${path}`, {
				cache: 'no-store',
				...init,
				headers: {
					...(init?.body ? { 'Content-Type': 'application/json' } : {}),
					...init?.headers,
				},
			})
		let response
		try {
			response = await request()
		} catch (error) {
			if (!startBridge) throw error
			startPromise ??= Promise.resolve().then(startBridge)
			try {
				await startPromise
			} finally {
				startPromise = undefined
			}
			response = await request()
		}
		const text = await response.text()
		if (!response.ok) {
			throw new Error(text || `tldraw companion bridge returned HTTP ${response.status}`)
		}
		return text ? JSON.parse(text) : null
	}

	return {
		async capabilities({ canvasBinding, capabilityCatalog } = {}) {
			if (capabilityCatalog !== undefined) {
				return requestJson('/capabilities', {
					method: 'POST',
					body: JSON.stringify({
						canvasBinding: requireCanvasBinding(canvasBinding),
						capabilityCatalog,
					}),
				})
			}
			const query = canvasBinding
				? `?canvasBinding=${encodeURIComponent(requireCanvasBinding(canvasBinding))}`
				: ''
			return requestJson(`/capabilities${query}`)
		},

		async describe(input) {
			return requestJson('/capabilities/describe', {
				method: 'POST',
				body: JSON.stringify(input),
			})
		},

		async execute(input) {
			const queued = await requestJson('/execute', {
				method: 'POST',
				body: JSON.stringify({
					...input,
					actor,
					source,
				}),
			})
			if (queued && TERMINAL_STATUSES.has(queued.status)) {
				return queued
			}
			const deadline = Date.now() + timeoutMs
			while (Date.now() <= deadline) {
				const status = await requestJson(
					`/status?requestId=${encodeURIComponent(queued.id)}`
				)
				if (status?.request && TERMINAL_STATUSES.has(status.request.status)) {
					return status.request
				}
				await delay(pollIntervalMs)
			}
			throw new Error(
				`tldraw companion request ${queued.id} timed out waiting for the local canvas receipt`
			)
		},
	}
}

function requireCanvasBinding(value) {
	if (typeof value !== 'string' || !OPAQUE_LOCAL_ID_PATTERN.test(value)) {
		throw new Error('tldraw canvas binding is invalid')
	}
	return value
}

async function readJsonResponse(response) {
	const text = await response.text()
	if (!text) return null
	try {
		return JSON.parse(text)
	} catch {
		return null
	}
}

function isExactWorkbenchHealth(value) {
	return (
		value !== null &&
		typeof value === 'object' &&
		!Array.isArray(value) &&
		Object.keys(value).length === 4 &&
		value.status === 'ok' &&
		value.bridge === 'workflow-llm' &&
		value.mlIntern === 'terminal-first' &&
		value.surface === 'native-tldraw'
	)
}
