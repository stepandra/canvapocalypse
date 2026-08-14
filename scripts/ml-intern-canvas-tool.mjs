import { createHash, randomUUID } from 'node:crypto'

const MAX_INSTRUCTION_CHARS = 8_000
const MAX_ACTIONS = 24
const MAX_BOUNDED_AREA_DIMENSION = 8_192
const MAX_BOUNDED_AREA = 16_777_216
const MAX_ABSOLUTE_COORDINATE = 10_000_000
const MAX_ACTION_PLAN_BYTES = 24_000
const MAX_RESULT_BYTES = 24_000
const MAX_RECEIPTS = 50
// Protect the newest 500 evicted terminal operations within this bridge
// process. A bridge restart deliberately starts a fresh idempotency window.
const MAX_IDEMPOTENCY_TOMBSTONES = 500
const MAX_MANIFESTS = 32
const LEASE_MS = 30_000
const MANIFEST_TTL_MS = 5 * 60_000
const WEB_PREVIEW_CLIENT_TTL_MS = 10_000
// Electron may suspend timers while tldraw Offline is behind Amp or another
// desktop window. Five minutes matches the bounded manifest lifetime without
// turning a closed desktop client into an unbounded persistent target.
const OFFLINE_DESKTOP_CLIENT_TTL_MS = 5 * 60_000
const CANVAS_CLIENT_KINDS = new Set(['offline-desktop', 'web-preview'])

export const COMPANION_TLDRAW_TOOL_NAMES = Object.freeze([
	'tldraw_capabilities',
	'tldraw_describe_capability',
	'tldraw_execute',
])

export const ML_INTERN_TLDRAW_CAPABILITY_IDS = Object.freeze([
	'canvas.inspect',
	'canvas.shape.basic',
	'canvas.layout',
	'canvas.native-assets',
	'canvas.workflow',
	'canvas.result.read',
])

const BASIC_ACTION_TYPES = Object.freeze([
	'create',
	'update',
	'delete',
	'label',
	'move',
	'resize',
	'rotate',
	'bringToFront',
	'sendToBack',
])
const LAYOUT_ACTION_TYPES = Object.freeze([
	'align',
	'distribute',
	'stack',
	'place',
	'move',
	'resize',
	'rotate',
])
const WORKFLOW_ACTION_TYPES = Object.freeze([
	'create',
	'update',
	'delete',
	'label',
	'move',
	'align',
	'distribute',
	'stack',
])

const CAPABILITIES = Object.freeze({
	'canvas.inspect': {
		mode: 'read',
		summary: 'Inspect only an explicit native-tldraw selection or bounded area.',
		actionTypes: [],
	},
	'canvas.shape.basic': {
		mode: 'mutate',
		summary: 'Create, update, label, move, connect, or delete basic native tldraw shapes.',
		actionTypes: BASIC_ACTION_TYPES,
	},
	'canvas.layout': {
		mode: 'mutate',
		summary: 'Arrange an explicit native-tldraw selection with validated layout actions.',
		actionTypes: LAYOUT_ACTION_TYPES,
	},
	'canvas.native-assets': {
		mode: 'mutate',
		summary: 'Use native tldraw shapes and project-owned assets inside the explicit context.',
		actionTypes: BASIC_ACTION_TYPES,
	},
	'canvas.workflow': {
		mode: 'mutate',
		summary: 'Create or update native tldraw workflow nodes and their bounded connections.',
		actionTypes: WORKFLOW_ACTION_TYPES,
	},
	'canvas.result.read': {
		mode: 'read',
		summary: 'Read a compact canvas result or receipt without mutating the canvas.',
		actionTypes: [],
	},
})

const requests = new Map()
const order = []
const completedRequestTombstones = new Map()
const manifests = new Map()
const browserClients = new Map()

export function resetMlInternCanvasToolState() {
	requests.clear()
	order.splice(0)
	completedRequestTombstones.clear()
	manifests.clear()
	browserClients.clear()
}

export function registerMlInternCanvasClient(
	binding,
	now = Date.now(),
	clientKind = undefined
) {
	if (typeof binding !== 'string' || !/^[a-zA-Z0-9._:-]{1,128}$/.test(binding)) {
		throw httpError(400, 'canvas client binding is invalid')
	}
	pruneBrowserClients(now)
	const existing = browserClients.get(binding)
	const kind =
		clientKind === undefined
			? existing?.kind ?? 'web-preview'
			: requireCanvasClientKind(clientKind)
	if (existing && clientKind !== undefined && existing.kind !== kind) {
		throw httpError(409, 'canvas client kind cannot change while its lease is active')
	}
	browserClients.set(binding, { kind, lastSeen: now })
	return binding
}

export function issueMlInternCanvasCapabilityManifest(
	now = Date.now(),
	canvasBinding = undefined
) {
	return issueCanvasCapabilityManifest(now, canvasBinding, true)
}

export function issueCompanionCanvasCapabilityManifest(
	now = Date.now(),
	canvasBinding = undefined
) {
	return issueCanvasCapabilityManifest(now, canvasBinding, false)
}

function issueCanvasCapabilityManifest(now, canvasBinding, includeCanvasBinding) {
	pruneManifests(now)
	const manifest = {
		manifestId: randomUUID(),
		binding: randomUUID(),
		canvasBinding,
		surface: 'tldraw',
		issuedAt: new Date(now).toISOString(),
		expiresAt: new Date(now + MANIFEST_TTL_MS).toISOString(),
		expiresAtMs: now + MANIFEST_TTL_MS,
	}
	manifests.set(manifest.manifestId, manifest)
	return compactManifest(manifest, includeCanvasBinding)
}

export function describeMlInternCanvasCapability(payload, now = Date.now()) {
	return describeCanvasCapability(payload, now, true)
}

export function describeCompanionCanvasCapability(payload, now = Date.now()) {
	return describeCanvasCapability(payload, now, false)
}

function describeCanvasCapability(payload, now, includeCanvasBinding) {
	const manifest = includeCanvasBinding
		? requireManifest(payload, now)
		: requireCompanionManifest(payload, now)
	const capabilityId = requireCapabilityId(payload?.capabilityId)
	const capability = CAPABILITIES[capabilityId]
	return {
		...compactManifest(manifest, includeCanvasBinding),
		capability: {
			id: capabilityId,
			mode: capability.mode,
			summary: capability.summary,
			input: includeCanvasBinding
				? {
						instruction: 'string (1..8000 chars)',
						context: ['selection', 'selection-or-area'],
						bounds:
							'optional explicit page bounds {x,y,w,h}; only with selection-or-area',
						idempotencyKey: 'optional stable string (1..96 chars)',
					}
				: {
						context: ['selection', 'selection-or-area'],
						idempotencyKey: 'optional stable string (1..96 chars)',
						...(capability.mode === 'mutate'
							? {
									contextRef:
										'required reference from a succeeded canvas.inspect receipt on this manifest',
									actions:
										'1..24 complete AgentAction payloads using absolute page coordinates',
								}
							: {
									actions: 'must be omitted',
								}),
					},
			...(!includeCanvasBinding
				? {
						actionPlan: {
							coordinateSystem: 'absolute-page',
							maxActions: MAX_ACTIONS,
							actionTypes: capability.actionTypes,
							schema: buildActionPlanSchema(capability.actionTypes),
						},
					}
				: {}),
			receipt: ['requestId', 'status', 'capabilityId', 'summary'],
		},
	}
}

export function executeMlInternCanvasCapability(payload, now = Date.now()) {
	return enqueueMlInternCanvasTool(payload, now, { requireManifest: true })
}

export function executeCompanionCanvasCapability(payload, now = Date.now()) {
	return enqueueCompanionCanvasPlan(payload, now, { requireManifest: true })
}

export function enqueueMlInternCanvasTool(payload, now = Date.now(), options = {}) {
	const allowedFields = new Set([
		'manifestId',
		'binding',
		'capabilityId',
		'instruction',
		'context',
		'bounds',
		'idempotencyKey',
		'requestId',
		'surface',
		'canvasBinding',
	])
	for (const key of Object.keys(payload ?? {})) {
		if (!allowedFields.has(key)) {
			throw httpError(400, `unsupported ML-Intern canvas request field: ${key}`)
		}
	}
	const instruction =
		typeof payload?.instruction === 'string' ? payload.instruction.trim() : ''
	if (!instruction) throw httpError(400, 'instruction is required')
	if (instruction.length > MAX_INSTRUCTION_CHARS) {
		throw httpError(400, `instruction must be at most ${MAX_INSTRUCTION_CHARS} characters`)
	}
	if (payload?.surface && payload.surface !== 'tldraw') {
		throw httpError(400, 'ML-Intern canvas tool only accepts the native tldraw surface')
	}

	const context = normalizeContext(payload?.context)
	const bounds = normalizeRequestedBounds(payload?.bounds, context)
	const capabilityId = options.requireManifest
		? requireCapabilityId(payload?.capabilityId)
		: payload?.capabilityId
			? requireCapabilityId(payload.capabilityId)
			: 'canvas.shape.basic'
	const idCandidate = payload?.idempotencyKey ?? payload?.requestId
	const id =
		typeof idCandidate === 'string' && /^[a-zA-Z0-9._:-]{1,96}$/.test(idCandidate)
			? idCandidate
			: randomUUID()
	const fingerprint = fingerprintOperation({
		execution: 'instruction',
		instruction,
		context,
		bounds,
		capabilityId,
		...(options.requireManifest
			? {
					manifestId:
						typeof payload?.manifestId === 'string' ? payload.manifestId : '',
					manifestBinding:
						typeof payload?.binding === 'string' ? payload.binding : '',
				}
			: { canvasBinding: payload?.canvasBinding }),
	})

	if (requests.has(id)) {
		const existing = requests.get(id)
		if (existing.operationFingerprint !== fingerprint) {
			throw httpError(409, 'idempotency key is already bound to a different canvas operation')
		}
		return compactRequest(existing)
	}
	const completedReplay = replayCompletedRequest(id, fingerprint)
	if (completedReplay) return completedReplay

	const manifest = options.requireManifest ? requireManifest(payload, now) : undefined
	const request = {
		id,
		instruction,
		execution: 'instruction',
		surface: 'tldraw',
		context,
		bounds,
		capabilityId,
		manifestId: manifest?.manifestId ?? payload?.manifestId,
		canvasBinding: manifest?.canvasBinding ?? payload?.canvasBinding,
		operationFingerprint: fingerprint,
		status: 'queued',
		createdAt: new Date(now).toISOString(),
		updatedAt: new Date(now).toISOString(),
		leaseUntil: 0,
	}
	requests.set(id, request)
	order.push(id)
	return compactRequest(request)
}

export function enqueueCompanionCanvasPlan(payload, now = Date.now(), options = {}) {
	const allowedFields = new Set([
		'manifestId',
		'capabilityId',
		'surface',
		'context',
		'contextRef',
		'idempotencyKey',
		'requestId',
		'actor',
		'source',
		'actions',
		'canvasBinding',
	])
	for (const key of Object.keys(payload ?? {})) {
		if (!allowedFields.has(key)) {
			throw httpError(400, `unsupported companion canvas request field: ${key}`)
		}
	}
	if (payload?.surface && payload.surface !== 'tldraw') {
		throw httpError(400, 'companion canvas tool only accepts the native tldraw surface')
	}
	const capabilityId = requireCapabilityId(payload?.capabilityId)
	const capability = CAPABILITIES[capabilityId]
	const context = normalizeContext(payload?.context)
	const actor = normalizeProvenance(payload?.actor, 'external-agent')
	const source = normalizeProvenance(payload?.source, 'companion-plugin')
	const actions = normalizeActionPlan(payload?.actions, capability)
	const manifestId = typeof payload?.manifestId === 'string' ? payload.manifestId : ''
	const requestedCanvasBinding =
		typeof payload?.canvasBinding === 'string' ? payload.canvasBinding : undefined
	const idCandidate = payload?.idempotencyKey ?? payload?.requestId
	const id =
		typeof idCandidate === 'string' && /^[a-zA-Z0-9._:-]{1,96}$/.test(idCandidate)
			? idCandidate
			: randomUUID()

	let requestedContextRef
	if (capability.mode === 'read') {
		if (actions.length > 0) {
			throw httpError(400, `${capabilityId} is read-only and does not accept actions`)
		}
		requestedContextRef = undefined
	} else {
		requestedContextRef = normalizeContextRef(payload?.contextRef)
	}

	const fingerprint = fingerprintOperation({
		execution: 'direct-actions',
		capabilityId,
		context,
		contextRef: capability.mode === 'read' ? null : requestedContextRef,
		actions,
		...(options.requireManifest
			? { manifestId }
			: { canvasBinding: requestedCanvasBinding }),
		actor,
		source,
	})

	if (requests.has(id)) {
		const existing = requests.get(id)
		if (existing.operationFingerprint !== fingerprint) {
			throw httpError(409, 'idempotency key is already bound to a different canvas operation')
		}
		return compactRequest(existing)
	}
	const completedReplay = replayCompletedRequest(id, fingerprint)
	if (completedReplay) return completedReplay

	const manifest = options.requireManifest
		? requireCompanionManifest(payload, now)
		: undefined
	const canvasBinding = manifest?.canvasBinding ?? requestedCanvasBinding
	const contextRef =
		capability.mode === 'read'
			? undefined
			: requireCompletedContextRef({
					contextRef: requestedContextRef,
					manifestId,
					canvasBinding,
					now,
				})
	const request = {
		id,
		surface: 'tldraw',
		context,
		contextRef,
		capabilityId,
		manifestId,
		canvasBinding,
		actor,
		source,
		actions,
		execution: 'direct-actions',
		operationFingerprint: fingerprint,
		status: 'queued',
		createdAt: new Date(now).toISOString(),
		updatedAt: new Date(now).toISOString(),
		leaseUntil: 0,
	}
	requests.set(id, request)
	order.push(id)
	return compactRequest(request)
}

export function enqueueLegacyMlInternCanvasTool(payload, now = Date.now()) {
	const canvasBinding = resolveActiveCanvasBinding(undefined, now)
	return enqueueMlInternCanvasTool({ ...payload, canvasBinding }, now)
}

export function leaseNextMlInternCanvasTool(
	now = Date.now(),
	canvasBinding = undefined,
	execution = undefined
) {
	for (const id of order) {
		const request = requests.get(id)
		if (!request) continue
		if (execution && request.execution !== execution) continue
		if (request.canvasBinding && request.canvasBinding !== canvasBinding) continue
		if (!request.canvasBinding && canvasBinding) continue
		if (request.status === 'leased' && request.leaseUntil <= now) {
			request.status = 'queued'
			request.leaseToken = undefined
			request.leasedCanvasBinding = undefined
		}
		if (request.status !== 'queued') continue
		request.status = 'leased'
		request.leaseUntil = now + LEASE_MS
		request.leaseToken = randomUUID()
		request.leasedCanvasBinding = canvasBinding
		request.updatedAt = new Date(now).toISOString()
		return compactLeasedRequest(request)
	}
	return null
}

export function recordMlInternCanvasToolReceipt(payload, now = Date.now()) {
	const request = requests.get(payload?.requestId)
	if (!request) throw httpError(404, 'canvas tool request was not found')
	requireReceiptLease(payload, request, now)
	if (!['succeeded', 'failed'].includes(payload?.status)) {
		throw httpError(400, 'receipt status must be succeeded or failed')
	}
	const summary = typeof payload?.summary === 'string' ? payload.summary.trim().slice(0, 2_000) : ''
	const result =
		payload?.result === undefined ? undefined : normalizeCompactResult(payload.result)
	const terminalSummary =
		summary ||
		(payload.status === 'succeeded' ? 'Canvas request completed' : 'Canvas request failed')
	if (['succeeded', 'failed'].includes(request.status)) {
		if (
			request.status === payload.status &&
			request.summary === terminalSummary &&
			JSON.stringify(request.result) === JSON.stringify(result)
		) {
			return compactRequest(request)
		}
		throw httpError(409, 'canvas tool request already has a conflicting terminal receipt')
	}
	if (request.status !== 'leased') {
		throw httpError(409, 'canvas tool request must be leased before recording a receipt')
	}
	let promotedContextRef
	if (
		request.execution === 'direct-actions' &&
		request.capabilityId === 'canvas.inspect' &&
		payload.status === 'succeeded'
	) {
		promotedContextRef = result?.contextRef
		if (
			typeof promotedContextRef !== 'string' ||
			!/^ctx-v1-[a-f0-9]{8}$/.test(promotedContextRef)
		) {
			throw httpError(
				400,
				'succeeded canvas.inspect receipt must include a valid result.contextRef'
			)
		}
	}
	request.status = payload.status
	request.summary = terminalSummary
	if (result !== undefined) request.result = result
	if (promotedContextRef) request.contextRef = promotedContextRef
	request.updatedAt = new Date(now).toISOString()
	request.leaseUntil = 0
	pruneReceipts()
	return compactRequest(request)
}

export function getMlInternCanvasToolStatus(
	requestId,
	canvasBinding = undefined,
	now = Date.now(),
	execution = 'instruction',
	clientKind = undefined
) {
	if (canvasBinding) registerMlInternCanvasClient(canvasBinding, now, clientKind)
	if (requestId) {
		const request = requests.get(requestId)
		const tombstone = completedRequestTombstones.get(requestId)
		if (!request && !tombstone) {
			throw httpError(404, 'canvas tool request was not found')
		}
		if (execution && (request?.execution ?? tombstone?.execution) !== execution) {
			throw httpError(404, 'canvas tool request was not found on this endpoint')
		}
		return {
			primary: 'terminal',
			bridge: 'ready',
			request: request
				? compactRequest(request)
				: structuredClone(tombstone.response),
		}
	}
	const latest = canvasBinding
		? [...order]
				.reverse()
				.map((id) => requests.get(id))
				.find(
					(request) =>
						request &&
						(!execution || request.execution === execution) &&
						request.canvasBinding === canvasBinding
				)
		: undefined
	return {
		primary: 'terminal',
		bridge: 'ready',
		pending: [...requests.values()].filter(
			(request) =>
				(!canvasBinding || request.canvasBinding === canvasBinding) &&
				(!execution || request.execution === execution) &&
				['queued', 'leased'].includes(request.status)
		).length,
		latest: latest ? compactRequest(latest) : null,
		tools: COMPANION_TLDRAW_TOOL_NAMES,
		surface: 'tldraw',
		context: 'explicit-selection-or-bounded-area',
		mutations: 'validated-native-actions',
		...(canvasBinding ? { canvasBinding } : {}),
	}
}

export function getCompanionCanvasToolStatus(
	requestId,
	canvasBinding = undefined,
	now = Date.now(),
	clientKind = undefined
) {
	const status = getMlInternCanvasToolStatus(
		requestId,
		canvasBinding,
		now,
		'direct-actions',
		clientKind
	)
	if ('request' in status) {
		return {
			owner: 'existing-agent-thread',
			bridge: status.bridge,
			request: status.request,
		}
	}
	const { primary: _primary, canvasBinding: _canvasBinding, ...rest } = status
	return {
		owner: 'existing-agent-thread',
		...rest,
	}
}

export async function handleMlInternCanvasToolRequest(url, request, response, readBody, send) {
	if (request.method === 'GET' && url.pathname === '/ml-intern/canvas-tool/capabilities') {
		requireNonBrowserProducer(request)
		const canvasBinding = resolveActiveCanvasBinding(
			url.searchParams.get('canvasBinding') || undefined
		)
		return sendJson(
			response,
			200,
			issueMlInternCanvasCapabilityManifest(Date.now(), canvasBinding),
			send
		)
	}
	if (
		request.method === 'POST' &&
		url.pathname === '/ml-intern/canvas-tool/capabilities/describe'
	) {
		requireNonBrowserProducer(request)
		const payload = JSON.parse(await readBody(request))
		return sendJson(response, 200, describeMlInternCanvasCapability(payload), send)
	}
	if (request.method === 'POST' && url.pathname === '/ml-intern/canvas-tool/execute') {
		requireNonBrowserProducer(request)
		const payload = JSON.parse(await readBody(request))
		return sendJson(response, 202, executeMlInternCanvasCapability(payload), send)
	}
	// Legacy endpoint retained for old local ML-Intern checkouts. It is not
	// advertised and never grants anything beyond native tldraw.
	if (request.method === 'POST' && url.pathname === '/ml-intern/canvas-tool/invoke') {
		requireNonBrowserProducer(request)
		const payload = JSON.parse(await readBody(request))
		return sendJson(response, 202, enqueueLegacyMlInternCanvasTool(payload), send)
	}
	if (request.method === 'GET' && url.pathname === '/ml-intern/canvas-tool/next') {
		const canvasBinding = url.searchParams.get('canvasBinding') || undefined
		const clientKind = readCanvasClientKind(url, request)
		if (canvasBinding) {
			registerMlInternCanvasClient(canvasBinding, Date.now(), clientKind)
		}
		return sendJson(
			response,
			200,
			{
				request: leaseNextMlInternCanvasTool(
					Date.now(),
					canvasBinding,
					'instruction'
				),
			},
			send
		)
	}
	if (request.method === 'POST' && url.pathname === '/ml-intern/canvas-tool/receipt') {
		const payload = JSON.parse(await readBody(request))
		return sendJson(response, 200, recordMlInternCanvasToolReceipt(payload), send)
	}
	if (request.method === 'GET' && url.pathname === '/ml-intern/canvas-tool/status') {
		const canvasBinding = url.searchParams.get('canvasBinding') || undefined
		if (url.searchParams.has('requestId') || !canvasBinding) {
			requireNonBrowserProducer(request)
		}
		const clientKind = readCanvasClientKind(url, request)
		return sendJson(
			response,
			200,
			getMlInternCanvasToolStatus(
				url.searchParams.get('requestId') || undefined,
				canvasBinding,
				Date.now(),
				'instruction',
				clientKind
			),
			send
		)
	}
	return false
}

export async function handleCompanionCanvasToolRequest(url, request, response, readBody, send) {
	if (
		request.method === 'GET' &&
		url.pathname === '/companion/canvas-tool/capabilities'
	) {
		requireNonBrowserProducer(request)
		const canvasBinding = resolveCompanionCanvasBinding(
			url.searchParams.get('canvasBinding') || undefined
		)
		return sendJson(
			response,
			200,
			issueCompanionCanvasCapabilityManifest(Date.now(), canvasBinding),
			send
		)
	}
	if (
		request.method === 'POST' &&
		url.pathname === '/companion/canvas-tool/capabilities/describe'
	) {
		requireNonBrowserProducer(request)
		const payload = JSON.parse(await readBody(request))
		return sendJson(response, 200, describeCompanionCanvasCapability(payload), send)
	}
	if (request.method === 'POST' && url.pathname === '/companion/canvas-tool/execute') {
		requireNonBrowserProducer(request)
		const payload = JSON.parse(await readBody(request))
		return sendJson(response, 202, executeCompanionCanvasCapability(payload), send)
	}
	if (request.method === 'GET' && url.pathname === '/companion/canvas-tool/next') {
		const canvasBinding = url.searchParams.get('canvasBinding') || undefined
		const clientKind = readCanvasClientKind(url, request)
		if (canvasBinding) {
			registerMlInternCanvasClient(canvasBinding, Date.now(), clientKind)
		}
		return sendJson(
			response,
			200,
			{
				request: leaseNextMlInternCanvasTool(
					Date.now(),
					canvasBinding,
					'direct-actions'
				),
			},
			send
		)
	}
	if (request.method === 'POST' && url.pathname === '/companion/canvas-tool/receipt') {
		const payload = JSON.parse(await readBody(request))
		return sendJson(response, 200, recordMlInternCanvasToolReceipt(payload), send)
	}
	if (request.method === 'GET' && url.pathname === '/companion/canvas-tool/status') {
		const canvasBinding = url.searchParams.get('canvasBinding') || undefined
		if (url.searchParams.has('requestId') || !canvasBinding) {
			requireNonBrowserProducer(request)
		}
		const clientKind = readCanvasClientKind(url, request)
		return sendJson(
			response,
			200,
			getCompanionCanvasToolStatus(
				url.searchParams.get('requestId') || undefined,
				canvasBinding,
				Date.now(),
				clientKind
			),
			send
		)
	}
	return false
}

function requireManifest(payload, now) {
	pruneManifests(now)
	const manifestId = typeof payload?.manifestId === 'string' ? payload.manifestId : ''
	const binding = typeof payload?.binding === 'string' ? payload.binding : ''
	const manifest = manifests.get(manifestId)
	if (!manifest) throw httpError(409, 'capability manifest is missing or expired; discover again')
	if (manifest.expiresAtMs <= now) {
		manifests.delete(manifestId)
		throw httpError(409, 'capability manifest expired; discover again')
	}
	if (!binding || binding !== manifest.binding) {
		throw httpError(403, 'capability manifest binding does not match')
	}
	return manifest
}

function requireCompanionManifest(payload, now) {
	pruneManifests(now)
	const manifestId = typeof payload?.manifestId === 'string' ? payload.manifestId : ''
	const manifest = manifests.get(manifestId)
	if (!manifest) throw httpError(409, 'capability manifest is missing or expired; discover again')
	if (manifest.expiresAtMs <= now) {
		manifests.delete(manifestId)
		throw httpError(409, 'capability manifest expired; discover again')
	}
	return manifest
}

function requireCapabilityId(value) {
	if (typeof value !== 'string' || !Object.hasOwn(CAPABILITIES, value)) {
		throw httpError(400, 'unknown native tldraw capability id')
	}
	return value
}

function normalizeContext(value) {
	if (value === 'selection') return 'selection'
	if (value === 'selection-or-area' || value === 'selection-or-viewport') {
		return 'selection-or-area'
	}
	return 'selection-or-area'
}

function normalizeRequestedBounds(value, context) {
	if (value == null) return undefined
	if (context !== 'selection-or-area') {
		throw httpError(400, 'bounds require context=selection-or-area')
	}
	if (
		typeof value !== 'object' ||
		Array.isArray(value) ||
		Object.keys(value).some((key) => !['x', 'y', 'w', 'h'].includes(key))
	) {
		throw httpError(400, 'bounds must contain only numeric x, y, w, and h')
	}
	const bounds = {
		x: value.x,
		y: value.y,
		w: value.w,
		h: value.h,
	}
	if (Object.values(bounds).some((part) => typeof part !== 'number' || !Number.isFinite(part))) {
		throw httpError(400, 'bounds must contain only finite numbers')
	}
	if (bounds.w <= 0 || bounds.h <= 0) {
		throw httpError(400, 'bounds width and height must be positive')
	}
	if (
		Math.abs(bounds.x) > MAX_ABSOLUTE_COORDINATE ||
		Math.abs(bounds.y) > MAX_ABSOLUTE_COORDINATE
	) {
		throw httpError(400, 'bounds coordinates exceed the supported page range')
	}
	if (
		bounds.w > MAX_BOUNDED_AREA_DIMENSION ||
		bounds.h > MAX_BOUNDED_AREA_DIMENSION ||
		bounds.w * bounds.h > MAX_BOUNDED_AREA
	) {
		throw httpError(400, 'bounds exceed the maximum bounded context area')
	}
	return bounds
}

function compactManifest(manifest, includeCanvasBinding = true) {
	return {
		manifestId: manifest.manifestId,
		...(includeCanvasBinding ? { binding: manifest.binding } : {}),
		surface: manifest.surface,
		issuedAt: manifest.issuedAt,
		expiresAt: manifest.expiresAt,
		capabilityIds: ML_INTERN_TLDRAW_CAPABILITY_IDS,
	}
}

function compactRequest(request, includeInstruction = false) {
	return {
		id: request.id,
		status: request.status,
		surface: request.surface,
		context: request.context,
		capabilityId: request.capabilityId,
		createdAt: request.createdAt,
		updatedAt: request.updatedAt,
		...(includeInstruction && request.instruction
			? { instruction: request.instruction }
			: {}),
		...(includeInstruction && request.execution ? { execution: request.execution } : {}),
		...(includeInstruction && request.actions?.length ? { actions: request.actions } : {}),
		...(includeInstruction && request.actor ? { actor: request.actor } : {}),
		...(includeInstruction && request.source ? { source: request.source } : {}),
		...(includeInstruction && request.bounds ? { bounds: request.bounds } : {}),
		...(request.contextRef ? { contextRef: request.contextRef } : {}),
		...(request.summary ? { summary: request.summary } : {}),
		...(request.result !== undefined ? { result: request.result } : {}),
	}
}

function compactLeasedRequest(request) {
	return {
		...compactRequest(request, true),
		leaseToken: request.leaseToken,
		...(request.canvasBinding ? { canvasBinding: request.canvasBinding } : {}),
	}
}

function requireReceiptLease(payload, request, now) {
	const leaseToken =
		typeof payload?.leaseToken === 'string' ? payload.leaseToken : ''
	const canvasBinding =
		typeof payload?.canvasBinding === 'string' ? payload.canvasBinding : undefined
	if (!leaseToken || leaseToken !== request.leaseToken) {
		throw httpError(409, 'canvas tool receipt lease does not match')
	}
	if (
		request.canvasBinding &&
		(canvasBinding !== request.canvasBinding ||
			request.leasedCanvasBinding !== request.canvasBinding)
	) {
		throw httpError(409, 'canvas tool receipt lease does not match')
	}
	if (request.status === 'leased' && request.leaseUntil <= now) {
		request.status = 'queued'
		request.leaseToken = undefined
		request.leasedCanvasBinding = undefined
		throw httpError(409, 'canvas tool lease expired; lease again')
	}
	if (!['leased', 'succeeded', 'failed'].includes(request.status)) {
		throw httpError(409, 'canvas tool request must be leased before recording a receipt')
	}
}

function normalizeContextRef(contextRef) {
	if (typeof contextRef !== 'string' || !/^[a-zA-Z0-9-]{1,96}$/.test(contextRef)) {
		throw httpError(
			409,
			'a mutating companion plan requires contextRef from a succeeded canvas.inspect receipt'
		)
	}
	return contextRef
}

function requireCompletedContextRef({ contextRef, manifestId, canvasBinding, now }) {
	const normalizedContextRef = normalizeContextRef(contextRef)
	const inspected = [...requests.values()].find(
		(request) =>
			request.contextRef === normalizedContextRef &&
			request.manifestId === manifestId &&
			request.canvasBinding === canvasBinding &&
			request.capabilityId === 'canvas.inspect' &&
			request.execution === 'direct-actions'
	)
	if (
		!inspected ||
		inspected.status !== 'succeeded'
	) {
		throw httpError(
			409,
			'contextRef is missing, incomplete, or belongs to another manifest or canvas'
		)
	}
	const manifest = manifests.get(manifestId)
	if (!manifest || manifest.expiresAtMs <= now) {
		throw httpError(409, 'contextRef expired; inspect the bounded canvas context again')
	}
	return normalizedContextRef
}

function normalizeActionPlan(value, capability) {
	if (value === undefined || value === null) return []
	if (!Array.isArray(value)) throw httpError(400, 'actions must be an array')
	if (value.length > MAX_ACTIONS) {
		throw httpError(400, `actions must contain at most ${MAX_ACTIONS} validated operations`)
	}
	const serialized = JSON.stringify(value)
	if (Buffer.byteLength(serialized) > MAX_ACTION_PLAN_BYTES) {
		throw httpError(413, `action plan must be at most ${MAX_ACTION_PLAN_BYTES} bytes`)
	}
	for (const [index, action] of value.entries()) {
		if (!isPlainObject(action)) throw httpError(400, `actions[${index}] must be an object`)
		if (
			typeof action._type !== 'string' ||
			!capability.actionTypes.includes(action._type)
		) {
			throw httpError(
				400,
				`actions[${index}] type is not allowed for this native tldraw capability`
			)
		}
		assertNoForbiddenFields(action, `actions[${index}]`)
	}
	if (capability.mode === 'mutate' && value.length === 0) {
		throw httpError(400, 'mutating companion capability requires at least one action')
	}
	return structuredClone(value)
}

function normalizeCompactResult(value) {
	assertNoForbiddenFields(value, 'result')
	const serialized = JSON.stringify(value)
	if (Buffer.byteLength(serialized) > MAX_RESULT_BYTES) {
		throw httpError(413, `receipt result must be at most ${MAX_RESULT_BYTES} bytes`)
	}
	return JSON.parse(serialized)
}

function assertNoForbiddenFields(value, path) {
	if (Array.isArray(value)) {
		for (const [index, item] of value.entries()) {
			assertNoForbiddenFields(item, `${path}[${index}]`)
		}
		return
	}
	if (!isPlainObject(value)) return
	for (const [key, item] of Object.entries(value)) {
		if (
			key.toLowerCase() === 'path' ||
			/(?:thread.?id|file.?path|project.?path|credential|api.?key|secret|token|authorization)/i.test(
				key
			)
		) {
			throw httpError(400, `${path}.${key} is not allowed in the companion canvas contract`)
		}
		assertNoForbiddenFields(item, `${path}.${key}`)
	}
}

function isPlainObject(value) {
	return (
		value !== null &&
		typeof value === 'object' &&
		!Array.isArray(value) &&
		(Object.getPrototypeOf(value) === Object.prototype ||
			Object.getPrototypeOf(value) === null)
	)
}

function normalizeProvenance(value, fallback) {
	if (value === undefined || value === null || value === '') return fallback
	if (typeof value !== 'string' || !/^[a-zA-Z0-9._:-]{1,64}$/.test(value)) {
		throw httpError(400, 'actor/source provenance must be a compact identifier')
	}
	return value
}

function buildActionPlanSchema(actionTypes) {
	if (actionTypes.length === 0) return null
	const definitions = {
		create: actionSchema('create', ['intent', 'shape'], {
			shape: focusedShapeProperty('Complete shape to create', false),
		}),
		update: actionSchema('update', ['intent', 'update'], {
			update: focusedShapeProperty(
				'Complete updated shape, including its existing shapeId',
				true
			),
		}),
		delete: actionSchema('delete', ['intent', 'shapeId'], shapeIdProperties()),
		label: actionSchema('label', ['intent', 'shapeId', 'text'], {
			...shapeIdProperties(),
			text: { type: 'string' },
		}),
		move: actionSchema('move', ['intent', 'shapeId', 'anchor', 'x', 'y'], {
			...shapeIdProperties(),
			anchor: {
				enum: [
					'bottom-center',
					'bottom-left',
					'bottom-right',
					'center-left',
					'center-right',
					'center',
					'top-center',
					'top-left',
					'top-right',
				],
			},
			x: { type: 'number' },
			y: { type: 'number' },
		}),
		resize: actionSchema(
			'resize',
			['intent', 'shapeIds', 'originX', 'originY', 'scaleX', 'scaleY'],
			{
				...shapeIdsProperties(),
				originX: { type: 'number' },
				originY: { type: 'number' },
				scaleX: { type: 'number' },
				scaleY: { type: 'number' },
			}
		),
		rotate: actionSchema(
			'rotate',
			['intent', 'shapeIds', 'originX', 'originY', 'centerY', 'degrees'],
			{
				...shapeIdsProperties(),
				originX: { type: 'number' },
				originY: { type: 'number' },
				centerY: { type: 'number' },
				degrees: { type: 'number' },
			}
		),
		bringToFront: actionSchema('bringToFront', ['intent', 'shapeIds'], shapeIdsProperties()),
		sendToBack: actionSchema('sendToBack', ['intent', 'shapeIds'], shapeIdsProperties()),
		align: actionSchema('align', ['intent', 'shapeIds', 'alignment', 'gap'], {
			...shapeIdsProperties(),
			alignment: {
				enum: ['top', 'bottom', 'left', 'right', 'center-horizontal', 'center-vertical'],
			},
			gap: { type: 'number' },
		}),
		distribute: actionSchema('distribute', ['intent', 'shapeIds', 'direction'], {
			...shapeIdsProperties(),
			direction: { enum: ['horizontal', 'vertical'] },
		}),
		stack: actionSchema('stack', ['intent', 'shapeIds', 'direction', 'gap'], {
			...shapeIdsProperties(),
			direction: { enum: ['horizontal', 'vertical'] },
			gap: { type: 'number' },
		}),
		place: actionSchema(
			'place',
			[
				'intent',
				'shapeId',
				'referenceShapeId',
				'side',
				'sideOffset',
				'align',
				'alignOffset',
			],
			{
				...shapeIdProperties(),
				referenceShapeId: { type: 'string' },
				side: { enum: ['top', 'bottom', 'left', 'right'] },
				sideOffset: { type: 'number' },
				align: { enum: ['start', 'center', 'end'] },
				alignOffset: { type: 'number' },
			}
		),
	}
	return {
		type: 'array',
		minItems: 1,
		maxItems: MAX_ACTIONS,
		items: {
			oneOf: actionTypes.map((type) => definitions[type]).filter(Boolean),
		},
	}
}

function actionSchema(type, required, properties = {}) {
	return {
		type: 'object',
		additionalProperties: false,
		properties: {
			_type: { const: type },
			intent: { type: 'string' },
			...properties,
		},
		required: ['_type', ...required],
	}
}

function shapeIdProperties() {
	return { shapeId: { type: 'string', description: 'Simple shape id without shape: prefix' } }
}

function shapeIdsProperties() {
	return {
		shapeIds: {
			type: 'array',
			items: { type: 'string', description: 'Simple shape id without shape: prefix' },
			minItems: 1,
			maxItems: 64,
		},
	}
}

function focusedShapeProperty(description, includeExistingOnlyShapes) {
	const colors = [
		'red',
		'light-red',
		'green',
		'light-green',
		'blue',
		'light-blue',
		'orange',
		'yellow',
		'black',
		'violet',
		'light-violet',
		'grey',
		'white',
	]
	const baseProperties = {
		color: { enum: colors },
		note: { type: 'string' },
		shapeId: {
			type: 'string',
			description: 'Simple shape id without shape: prefix',
		},
	}
	const coordinateProperties = {
		x: { type: 'number' },
		y: { type: 'number' },
	}
	const variants = [
		focusedShapeSchema(
			[
				'rectangle',
				'ellipse',
				'triangle',
				'diamond',
				'hexagon',
				'pill',
				'cloud',
				'x-box',
				'check-box',
				'heart',
				'pentagon',
				'octagon',
				'star',
				'parallelogram-right',
				'parallelogram-left',
				'trapezoid',
				'fat-arrow-right',
				'fat-arrow-left',
				'fat-arrow-up',
				'fat-arrow-down',
			],
			['color', 'fill', 'h', 'note', 'shapeId', 'w', 'x', 'y'],
			{
				...baseProperties,
				...coordinateProperties,
				fill: { enum: ['none', 'tint', 'background', 'solid', 'pattern'] },
				h: { type: 'number' },
				text: { type: 'string' },
				textAlign: { enum: ['start', 'middle', 'end'] },
				w: { type: 'number' },
			}
		),
		focusedShapeSchema('line', [
			'color',
			'note',
			'shapeId',
			'x1',
			'x2',
			'y1',
			'y2',
		], {
			...baseProperties,
			x1: { type: 'number' },
			x2: { type: 'number' },
			y1: { type: 'number' },
			y2: { type: 'number' },
		}),
		focusedShapeSchema(
			'text',
			['anchor', 'color', 'maxWidth', 'note', 'shapeId', 'text', 'x', 'y'],
			{
				...baseProperties,
				...coordinateProperties,
				anchor: {
					enum: [
						'bottom-center',
						'bottom-left',
						'bottom-right',
						'center-left',
						'center-right',
						'center',
						'top-center',
						'top-left',
						'top-right',
					],
				},
				fontSize: { type: 'number' },
				maxWidth: { type: ['number', 'null'] },
				text: { type: 'string' },
			}
		),
		focusedShapeSchema(
			'arrow',
			['color', 'fromId', 'note', 'shapeId', 'toId', 'x1', 'x2', 'y1', 'y2'],
			{
				...baseProperties,
				bend: { type: 'number' },
				fromId: { type: ['string', 'null'] },
				text: { type: 'string' },
				toId: { type: ['string', 'null'] },
				x1: { type: 'number' },
				x2: { type: 'number' },
				y1: { type: 'number' },
				y2: { type: 'number' },
			}
		),
		focusedShapeSchema('note', ['color', 'note', 'shapeId', 'x', 'y'], {
			...baseProperties,
			...coordinateProperties,
			text: { type: 'string' },
		}),
	]
	if (includeExistingOnlyShapes) {
		variants.push(
			focusedShapeSchema('draw', ['color', 'note', 'shapeId'], {
				...baseProperties,
				fill: { enum: ['none', 'tint', 'background', 'solid', 'pattern'] },
			}),
			focusedShapeSchema('unknown', ['note', 'shapeId', 'subType', 'x', 'y'], {
				note: { type: 'string' },
				shapeId: baseProperties.shapeId,
				subType: { type: 'string' },
				...coordinateProperties,
			})
		)
	}
	return {
		description: `${description}. Coordinates are absolute page coordinates.`,
		oneOf: variants,
	}
}

function focusedShapeSchema(types, required, properties) {
	return {
		type: 'object',
		additionalProperties: false,
		properties: {
			_type: Array.isArray(types) ? { enum: types } : { const: types },
			...properties,
		},
		required: ['_type', ...required],
	}
}

function pruneManifests(now) {
	for (const [id, manifest] of manifests) {
		if (manifest.expiresAtMs <= now) manifests.delete(id)
	}
	while (manifests.size >= MAX_MANIFESTS) {
		manifests.delete(manifests.keys().next().value)
	}
}

function resolveActiveCanvasBinding(requested, now = Date.now()) {
	pruneBrowserClients(now)
	if (requested) {
		if (!browserClients.has(requested)) {
			throw httpError(409, 'requested canvas binding is not active')
		}
		return requested
	}
	const offlineDesktop = [...browserClients]
		.filter(([, client]) => client.kind === 'offline-desktop')
		.map(([binding]) => binding)
	if (offlineDesktop.length > 1) {
		throw httpError(
			409,
			'multiple active offline-desktop tldraw canvas clients; close the extra desktop document or window'
		)
	}
	if (offlineDesktop.length === 1) return offlineDesktop[0]

	const webPreview = [...browserClients]
		.filter(([, client]) => client.kind === 'web-preview')
		.map(([binding]) => binding)
	if (webPreview.length === 0) {
		throw httpError(409, 'no active tldraw canvas client; open the ML-Intern canvas widget')
	}
	if (webPreview.length > 1) {
		throw httpError(
			409,
			'multiple active web-preview tldraw canvas clients; close the extra preview'
		)
	}
	return webPreview[0]
}

function resolveCompanionCanvasBinding(requested, now = Date.now()) {
	pruneBrowserClients(now)
	if (requested) {
		const client = browserClients.get(requested)
		if (!client || client.kind !== 'offline-desktop') {
			throw httpError(409, 'requested canvas binding is not an active offline-desktop client')
		}
		return requested
	}
	const offlineDesktop = [...browserClients]
		.filter(([, client]) => client.kind === 'offline-desktop')
		.map(([binding]) => binding)
	if (offlineDesktop.length === 0) {
		throw httpError(
			409,
			'no active offline-desktop tldraw canvas client; open tldraw Offline'
		)
	}
	if (offlineDesktop.length > 1) {
		throw httpError(
			409,
			'multiple active offline-desktop tldraw canvas clients; close the extra desktop document or window'
		)
	}
	return offlineDesktop[0]
}

function pruneBrowserClients(now) {
	for (const [binding, client] of browserClients) {
		const ttl =
			client.kind === 'offline-desktop'
				? OFFLINE_DESKTOP_CLIENT_TTL_MS
				: WEB_PREVIEW_CLIENT_TTL_MS
		if (client.lastSeen + ttl <= now) browserClients.delete(binding)
	}
}

function readCanvasClientKind(url, request) {
	const value = url.searchParams.get('clientKind')
	const requested = value === null ? undefined : requireCanvasClientKind(value)
	if (!requestHasWebOrigin(request)) return requested
	if (requested === 'offline-desktop') {
		throw httpError(403, 'web-origin canvas clients cannot register as offline-desktop')
	}
	return 'web-preview'
}

function requireNonBrowserProducer(request) {
	if (requestHasWebOrigin(request)) {
		throw httpError(403, 'canvas producer endpoints do not accept browser origins')
	}
}

function requestHasWebOrigin(request) {
	const origin =
		typeof request?.headers?.origin === 'string' ? request.headers.origin : ''
	return /^https?:\/\//i.test(origin)
}

function requireCanvasClientKind(value) {
	if (!CANVAS_CLIENT_KINDS.has(value)) {
		throw httpError(400, 'canvas client kind must be offline-desktop or web-preview')
	}
	return value
}

function pruneReceipts() {
	const completed = order.filter((id) => {
		const request = requests.get(id)
		return request && ['succeeded', 'failed'].includes(request.status)
	})
	for (const id of completed.slice(0, Math.max(0, completed.length - MAX_RECEIPTS))) {
		rememberCompletedRequestTombstone(requests.get(id))
		requests.delete(id)
		const index = order.indexOf(id)
		if (index >= 0) order.splice(index, 1)
	}
}

function fingerprintOperation(operation) {
	return createHash('sha256').update(JSON.stringify(operation)).digest('hex')
}

function replayCompletedRequest(id, operationFingerprint) {
	const tombstone = completedRequestTombstones.get(id)
	if (!tombstone) return undefined
	if (tombstone.operationFingerprint !== operationFingerprint) {
		throw httpError(409, 'idempotency key is already bound to a different canvas operation')
	}
	return structuredClone(tombstone.response)
}

function rememberCompletedRequestTombstone(request) {
	if (!request?.operationFingerprint) return
	completedRequestTombstones.set(request.id, {
		operationFingerprint: request.operationFingerprint,
		execution: request.execution,
		// compactRequest deliberately excludes instructions, direct actions,
		// canvas bindings, and lease authorization.
		response: structuredClone(compactRequest(request)),
	})
	while (completedRequestTombstones.size > MAX_IDEMPOTENCY_TOMBSTONES) {
		completedRequestTombstones.delete(completedRequestTombstones.keys().next().value)
	}
}

function sendJson(response, statusCode, payload, send) {
	response.setHeader('Content-Type', 'application/json; charset=utf-8')
	response.setHeader('Cache-Control', 'no-store')
	send(response, statusCode, JSON.stringify(payload))
	return true
}

function httpError(statusCode, message) {
	const error = new Error(message)
	error.statusCode = statusCode
	return error
}
