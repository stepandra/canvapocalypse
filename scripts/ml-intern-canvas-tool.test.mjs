import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import {
	COMPANION_TLDRAW_TOOL_NAMES,
	describeCompanionCanvasCapability,
	describeMlInternCanvasCapability,
	enqueueLegacyMlInternCanvasTool,
	enqueueMlInternCanvasTool,
	executeCompanionCanvasCapability,
	executeMlInternCanvasCapability,
	getCompanionCanvasToolStatus,
	getMlInternCanvasToolStatus,
	handleCompanionCanvasToolRequest,
	handleMlInternCanvasToolRequest,
	issueCompanionCanvasCapabilityManifest,
	issueMlInternCanvasCapabilityManifest,
	leaseNextMlInternCanvasTool,
	ML_INTERN_TLDRAW_CAPABILITY_IDS,
	recordMlInternCanvasToolReceipt,
	registerMlInternCanvasClient,
	resetMlInternCanvasToolState,
} from './ml-intern-canvas-tool.mjs'
import {
	createAmpTldrawCompanionClient,
	resolveLoopbackBridgeUrl,
} from './amp-tldraw-companion-runtime.mjs'

test.beforeEach(() => resetMlInternCanvasToolState())

function leaseAuthorization(request) {
	assert.match(request.leaseToken, /^[0-9a-f-]{36}$/)
	return {
		leaseToken: request.leaseToken,
		...(request.canvasBinding ? { canvasBinding: request.canvasBinding } : {}),
	}
}

test('discovers compact native-tldraw capability ids and hydrates one capability', () => {
	const now = Date.parse('2026-07-27T00:00:00.000Z')
	const manifest = issueMlInternCanvasCapabilityManifest(now)

	assert.equal(manifest.surface, 'tldraw')
	assert.deepEqual(manifest.capabilityIds, ML_INTERN_TLDRAW_CAPABILITY_IDS)
	assert.equal('capabilities' in manifest, false)

	const hydrated = describeMlInternCanvasCapability(
		{
			manifestId: manifest.manifestId,
			binding: manifest.binding,
			capabilityId: 'canvas.layout',
		},
		now + 1
	)
	assert.equal(hydrated.capability.id, 'canvas.layout')
	assert.equal(hydrated.capability.mode, 'mutate')
	assert.equal('canvas.shape.basic' in hydrated.capability, false)
})

test('carries a validated terminal-requested bounded area only to the leased request', () => {
	const now = Date.parse('2026-07-27T00:00:00.000Z')
	const manifest = issueMlInternCanvasCapabilityManifest(now)
	const bounds = { x: -120, y: 80, w: 640, h: 360 }
	const queued = executeMlInternCanvasCapability(
		{
			manifestId: manifest.manifestId,
			binding: manifest.binding,
			capabilityId: 'canvas.inspect',
			idempotencyKey: 'bounded-area-1',
			instruction: 'Inspect this bounded workflow region.',
			context: 'selection-or-area',
			bounds,
		},
		now + 1
	)

	assert.equal('bounds' in queued, false)
	assert.deepEqual(leaseNextMlInternCanvasTool(now + 2).bounds, bounds)
	assert.throws(
		() =>
			executeMlInternCanvasCapability(
				{
					manifestId: manifest.manifestId,
					binding: manifest.binding,
					capabilityId: 'canvas.inspect',
					idempotencyKey: 'bounded-area-1',
					instruction: 'Inspect this bounded workflow region.',
					context: 'selection-or-area',
					bounds: { ...bounds, x: bounds.x + 1 },
				},
				now + 2
			),
		/idempotency key is already bound to a different canvas operation/
	)
	assert.throws(
		() =>
			executeMlInternCanvasCapability(
				{
					manifestId: manifest.manifestId,
					binding: manifest.binding,
					capabilityId: 'canvas.inspect',
					instruction: 'Inspect invalid bounds.',
					context: 'selection',
					bounds,
				},
				now + 3
			),
		/bounds require context=selection-or-area/
	)
	assert.throws(
		() =>
			executeMlInternCanvasCapability(
				{
					manifestId: manifest.manifestId,
					binding: manifest.binding,
					capabilityId: 'canvas.inspect',
					instruction: 'Inspect an unbounded region.',
					context: 'selection-or-area',
					bounds: { x: 0, y: 0, w: 8192, h: 8192 },
				},
				now + 4
			),
		/maximum bounded context area/
	)
})

test('executes, leases, and receipts one manifest-bound native tldraw capability', () => {
	const now = Date.parse('2026-07-27T00:00:00.000Z')
	const manifest = issueMlInternCanvasCapabilityManifest(now)
	const queued = executeMlInternCanvasCapability(
		{
			manifestId: manifest.manifestId,
			binding: manifest.binding,
			capabilityId: 'canvas.shape.basic',
			idempotencyKey: 'ml-run-1',
			instruction: 'Update the selected ML pipeline diagram.',
			context: 'selection',
		},
		now + 1
	)
	assert.deepEqual(
		{
			id: queued.id,
			status: queued.status,
			surface: queued.surface,
			context: queued.context,
			capabilityId: queued.capabilityId,
		},
		{
			id: 'ml-run-1',
			status: 'queued',
			surface: 'tldraw',
			context: 'selection',
			capabilityId: 'canvas.shape.basic',
		}
	)

	const leased = leaseNextMlInternCanvasTool(now + 2)
	assert.equal(leased.id, 'ml-run-1')
	assert.equal(leased.status, 'leased')
	assert.equal(leased.instruction, 'Update the selected ML pipeline diagram.')

	const receipt = recordMlInternCanvasToolReceipt(
		{
			requestId: 'ml-run-1',
			status: 'succeeded',
			summary: 'Updated three native tldraw nodes.',
			...leaseAuthorization(leased),
		},
		now + 3
	)
	assert.equal(receipt.status, 'succeeded')
	assert.equal(receipt.capabilityId, 'canvas.shape.basic')
	assert.equal(receipt.summary, 'Updated three native tldraw nodes.')
	assert.equal(getMlInternCanvasToolStatus().pending, 0)
	assert.deepEqual(
		recordMlInternCanvasToolReceipt(
			{
				requestId: 'ml-run-1',
				status: 'succeeded',
				summary: 'Updated three native tldraw nodes.',
				...leaseAuthorization(leased),
			},
			now + 4
		),
		receipt
	)
	assert.throws(
		() =>
			recordMlInternCanvasToolReceipt(
				{
					requestId: 'ml-run-1',
					status: 'failed',
					summary: 'Conflicting late receipt.',
					...leaseAuthorization(leased),
				},
				now + 5
			),
		/conflicting terminal receipt/
	)
})

test('a receipt requires the exact lease token and bound canvas without leaking either', () => {
	const now = Date.parse('2026-07-27T00:00:00.000Z')
	registerMlInternCanvasClient('bound-canvas', now, 'offline-desktop')
	const manifest = issueMlInternCanvasCapabilityManifest(now, 'bound-canvas')
	const queued = executeMlInternCanvasCapability(
		{
			manifestId: manifest.manifestId,
			binding: manifest.binding,
			capabilityId: 'canvas.inspect',
			instruction: 'Inspect the explicit desktop selection.',
			context: 'selection',
			idempotencyKey: 'lease-auth-op',
		},
		now + 1
	)
	assert.doesNotMatch(JSON.stringify(manifest), /leaseToken|bound-canvas/)
	assert.doesNotMatch(JSON.stringify(queued), /leaseToken|bound-canvas/)

	const firstLease = leaseNextMlInternCanvasTool(now + 2, 'bound-canvas')
	assert.match(firstLease.leaseToken, /^[0-9a-f-]{36}$/)
	assert.equal(firstLease.canvasBinding, 'bound-canvas')
	const terminalPayload = {
		requestId: queued.id,
		status: 'succeeded',
		summary: 'Inspected one bounded shape.',
	}
	assert.throws(
		() => recordMlInternCanvasToolReceipt(terminalPayload, now + 3),
		/receipt lease does not match/
	)
	assert.throws(
		() =>
			recordMlInternCanvasToolReceipt(
				{
					...terminalPayload,
					leaseToken: '00000000-0000-4000-8000-000000000000',
					canvasBinding: 'bound-canvas',
				},
				now + 3
			),
		/receipt lease does not match/
	)
	assert.throws(
		() =>
			recordMlInternCanvasToolReceipt(
				{
					...terminalPayload,
					leaseToken: firstLease.leaseToken,
					canvasBinding: 'forged-canvas',
				},
				now + 3
			),
		(error) => {
			assert.match(error.message, /receipt lease does not match/)
			assert.doesNotMatch(error.message, /bound-canvas|forged-canvas/)
			return true
		}
	)

	const receipt = recordMlInternCanvasToolReceipt(
		{ ...terminalPayload, ...leaseAuthorization(firstLease) },
		now + 4
	)
	assert.doesNotMatch(JSON.stringify(receipt), /leaseToken|bound-canvas/)
	assert.deepEqual(
		recordMlInternCanvasToolReceipt(
			{ ...terminalPayload, ...leaseAuthorization(firstLease) },
			now + 5
		),
		receipt
	)
	assert.throws(
		() =>
			recordMlInternCanvasToolReceipt(
				{
					...terminalPayload,
					leaseToken: '11111111-1111-4111-8111-111111111111',
					canvasBinding: 'bound-canvas',
				},
				now + 6
			),
		/receipt lease does not match/
	)
	const requestStatus = getMlInternCanvasToolStatus(
		queued.id,
		undefined,
		now + 7
	)
	assert.equal(requestStatus.request.status, 'succeeded')
	assert.doesNotMatch(JSON.stringify(requestStatus), /leaseToken|bound-canvas/)
	assert.equal(getMlInternCanvasToolStatus(undefined, undefined, now + 7).latest, null)
	assert.equal(
		getMlInternCanvasToolStatus(undefined, 'bound-canvas', now + 7).latest.status,
		'succeeded'
	)
})

test('an expired lease is reissued with a fresh token and rejects the stale receipt', () => {
	const now = Date.parse('2026-07-27T00:00:00.000Z')
	const queued = enqueueMlInternCanvasTool({
		instruction: 'Inspect the explicit selection.',
		context: 'selection',
		idempotencyKey: 'lease-refresh-op',
	}, now)
	const firstLease = leaseNextMlInternCanvasTool(now)
	const secondLease = leaseNextMlInternCanvasTool(now + 30_001)
	assert.equal(secondLease.id, queued.id)
	assert.notEqual(secondLease.leaseToken, firstLease.leaseToken)
	assert.throws(
		() =>
			recordMlInternCanvasToolReceipt(
				{
					requestId: queued.id,
					status: 'failed',
					summary: 'Stale worker.',
					...leaseAuthorization(firstLease),
				},
				now + 30_002
			),
		/receipt lease does not match/
	)
	assert.equal(
		recordMlInternCanvasToolReceipt(
			{
				requestId: queued.id,
				status: 'failed',
				summary: 'Fresh worker result.',
				...leaseAuthorization(secondLease),
			},
			now + 30_003
		).status,
		'failed'
	)
})

test('idempotency is stable and rejects a conflicting operation', () => {
	const now = Date.parse('2026-07-27T00:00:00.000Z')
	const manifest = issueMlInternCanvasCapabilityManifest(now)
	const payload = {
		manifestId: manifest.manifestId,
		binding: manifest.binding,
		capabilityId: 'canvas.layout',
		idempotencyKey: 'stable-op',
		instruction: 'Align the selected nodes.',
		context: 'selection',
	}
	const first = executeMlInternCanvasCapability(payload, now + 1)
	const replay = executeMlInternCanvasCapability(payload, now + 2)
	assert.deepEqual(replay, first)
	assert.throws(
		() =>
			executeMlInternCanvasCapability(
				{ ...payload, instruction: 'Delete the selected nodes.' },
				now + 3
			),
		/idempotency key is already bound/
	)
})

test('completed instruction idempotency survives receipt eviction without requeueing', () => {
	const now = Date.parse('2026-07-27T00:00:00.000Z')
	const manifest = issueMlInternCanvasCapabilityManifest(now)
	const firstPayload = {
		manifestId: manifest.manifestId,
		binding: manifest.binding,
		capabilityId: 'canvas.inspect',
		idempotencyKey: 'evicted-instruction-op',
		instruction: 'Inspect the first bounded selection.',
		context: 'selection',
	}
	let firstReceipt

	for (let index = 0; index < 51; index += 1) {
		const payload =
			index === 0
				? firstPayload
				: {
						idempotencyKey: `receipt-window-${index}`,
						instruction: `Inspect bounded selection ${index}.`,
						context: 'selection',
					}
		const queued =
			index === 0
				? executeMlInternCanvasCapability(payload, now + index * 3)
				: enqueueMlInternCanvasTool(payload, now + index * 3)
		const leased = leaseNextMlInternCanvasTool(now + index * 3 + 1)
		const receipt = recordMlInternCanvasToolReceipt(
			{
				requestId: queued.id,
				status: 'succeeded',
				summary: `Completed bounded instruction ${index}.`,
				...leaseAuthorization(leased),
			},
			now + index * 3 + 2
		)
		if (index === 0) firstReceipt = receipt
	}

	assert.deepEqual(
		getMlInternCanvasToolStatus(
			firstPayload.idempotencyKey,
			undefined,
			now + 200
		).request,
		firstReceipt
	)
	assert.deepEqual(
		executeMlInternCanvasCapability(firstPayload, now + 5 * 60_000 + 1),
		firstReceipt
	)
	assert.equal(leaseNextMlInternCanvasTool(now + 5 * 60_000 + 2), null)
	assert.throws(
		() =>
			executeMlInternCanvasCapability(
				{ ...firstPayload, instruction: 'Delete the first bounded selection.' },
				now + 5 * 60_000 + 3
			),
		/idempotency key is already bound to a different canvas operation/
	)
})

test('completed companion plan replays its compact terminal response after receipt eviction', () => {
	const now = Date.parse('2026-07-27T00:00:00.000Z')
	registerMlInternCanvasClient('canvas-a', now, 'offline-desktop')
	const manifest = issueCompanionCanvasCapabilityManifest(now, 'canvas-a')
	const payload = {
		manifestId: manifest.manifestId,
		capabilityId: 'canvas.inspect',
		context: 'selection',
		idempotencyKey: 'evicted-companion-op',
	}
	const queued = executeCompanionCanvasCapability(payload, now + 1)
	const leased = leaseNextMlInternCanvasTool(now + 2, 'canvas-a', 'direct-actions')
	const terminal = recordMlInternCanvasToolReceipt(
		{
			requestId: queued.id,
			status: 'succeeded',
			summary: 'Inspected the first bounded companion selection.',
			result: { contextRef: 'ctx-v1-0123abcd', shapes: [] },
			...leaseAuthorization(leased),
		},
		now + 3
	)

	for (let index = 0; index < 50; index += 1) {
		const filler = enqueueMlInternCanvasTool(
			{
				idempotencyKey: `companion-receipt-window-${index}`,
				instruction: `Inspect bounded filler selection ${index}.`,
				context: 'selection',
			},
			now + 4 + index * 3
		)
		const fillerLease = leaseNextMlInternCanvasTool(now + 5 + index * 3)
		recordMlInternCanvasToolReceipt(
			{
				requestId: filler.id,
				status: 'succeeded',
				summary: `Completed filler ${index}.`,
				...leaseAuthorization(fillerLease),
			},
			now + 6 + index * 3
		)
	}

	assert.deepEqual(
		getCompanionCanvasToolStatus(queued.id, undefined, now + 200).request,
		terminal
	)
	const replay = executeCompanionCanvasCapability(payload, now + 201)
	assert.deepEqual(replay, terminal)
	assert.doesNotMatch(
		JSON.stringify(replay),
		/instruction|actions|canvas-a|leaseToken/
	)
	assert.equal(
		leaseNextMlInternCanvasTool(now + 202, 'canvas-a', 'direct-actions'),
		null
	)
	assert.throws(
		() =>
			executeCompanionCanvasCapability(
				{ ...payload, context: 'selection-or-area' },
				now + 203
			),
		/idempotency key is already bound to a different canvas operation/
	)
})

test('completed companion mutation replays after its inspection evidence and receipt are evicted', () => {
	const now = Date.parse('2026-07-27T00:00:00.000Z')
	registerMlInternCanvasClient('canvas-a', now, 'offline-desktop')
	const manifest = issueCompanionCanvasCapabilityManifest(now, 'canvas-a')
	const inspect = executeCompanionCanvasCapability(
		{
			manifestId: manifest.manifestId,
			capabilityId: 'canvas.inspect',
			context: 'selection',
			idempotencyKey: 'mutation-replay-inspect',
		},
		now + 1
	)
	const inspectLease = leaseNextMlInternCanvasTool(
		now + 2,
		'canvas-a',
		'direct-actions'
	)
	const contextRef = 'ctx-v1-89abcdef'
	recordMlInternCanvasToolReceipt(
		{
			requestId: inspect.id,
			status: 'succeeded',
			summary: 'Inspected the mutation target.',
			result: { contextRef, shapes: [] },
			...leaseAuthorization(inspectLease),
		},
		now + 3
	)

	const mutationPayload = {
		manifestId: manifest.manifestId,
		capabilityId: 'canvas.shape.basic',
		context: 'selection',
		contextRef,
		idempotencyKey: 'evicted-companion-mutation',
		actor: 'amp',
		source: 'amp-plugin',
		actions: [
			{
				_type: 'label',
				intent: 'Update the bounded label.',
				shapeId: 'service-a',
				text: 'Service A v2',
			},
		],
	}
	const mutation = executeCompanionCanvasCapability(mutationPayload, now + 4)
	const mutationLease = leaseNextMlInternCanvasTool(
		now + 5,
		'canvas-a',
		'direct-actions'
	)
	const terminal = recordMlInternCanvasToolReceipt(
		{
			requestId: mutation.id,
			status: 'succeeded',
			summary: 'Updated one bounded label.',
			result: {
				contextRef,
				operationCount: 1,
				actionTypes: ['label'],
				shapeIds: ['service-a'],
				undoable: true,
			},
			...leaseAuthorization(mutationLease),
		},
		now + 6
	)

	for (let index = 0; index < 50; index += 1) {
		const filler = enqueueMlInternCanvasTool(
			{
				idempotencyKey: `mutation-replay-window-${index}`,
				instruction: `Inspect mutation replay filler ${index}.`,
				context: 'selection',
			},
			now + 7 + index * 3
		)
		const fillerLease = leaseNextMlInternCanvasTool(now + 8 + index * 3)
		recordMlInternCanvasToolReceipt(
			{
				requestId: filler.id,
				status: 'succeeded',
				summary: `Completed mutation replay filler ${index}.`,
				...leaseAuthorization(fillerLease),
			},
			now + 9 + index * 3
		)
	}

	const afterManifestExpiry = now + 5 * 60_000 + 1
	assert.deepEqual(
		executeCompanionCanvasCapability(mutationPayload, afterManifestExpiry),
		terminal
	)
	assert.deepEqual(
		getCompanionCanvasToolStatus(
			mutation.id,
			undefined,
			afterManifestExpiry
		).request,
		terminal
	)
	assert.equal(
		leaseNextMlInternCanvasTool(
			afterManifestExpiry + 1,
			'canvas-a',
			'direct-actions'
		),
		null
	)
	assert.throws(
		() =>
			executeCompanionCanvasCapability(
				{
					...mutationPayload,
					actions: [
						{
							...mutationPayload.actions[0],
							text: 'Conflicting replay',
						},
					],
				},
				afterManifestExpiry + 2
			),
		/idempotency key is already bound to a different canvas operation/
	)
})

test('idempotency tombstones retain the newest 500 evicted terminal operations', () => {
	const now = Date.parse('2026-07-27T00:00:00.000Z')
	const firstPayload = {
		idempotencyKey: 'oldest-bounded-tombstone',
		instruction: 'Inspect the oldest protected operation.',
		context: 'selection',
	}
	let firstReceipt

	for (let index = 0; index < 550; index += 1) {
		const payload =
			index === 0
				? firstPayload
				: {
						idempotencyKey: `bounded-tombstone-${index}`,
						instruction: `Inspect bounded tombstone operation ${index}.`,
						context: 'selection',
					}
		const queued = enqueueMlInternCanvasTool(payload, now + index * 3)
		const leased = leaseNextMlInternCanvasTool(now + index * 3 + 1)
		const receipt = recordMlInternCanvasToolReceipt(
			{
				requestId: queued.id,
				status: 'succeeded',
				summary: `Completed bounded tombstone operation ${index}.`,
				...leaseAuthorization(leased),
			},
			now + index * 3 + 2
		)
		if (index === 0) firstReceipt = receipt
	}

	assert.deepEqual(
		enqueueMlInternCanvasTool(firstPayload, now + 1_700),
		firstReceipt
	)

	const rollover = enqueueMlInternCanvasTool(
		{
			idempotencyKey: 'bounded-tombstone-rollover',
			instruction: 'Roll the bounded tombstone window forward once.',
			context: 'selection',
		},
		now + 1_701
	)
	const rolloverLease = leaseNextMlInternCanvasTool(now + 1_702)
	recordMlInternCanvasToolReceipt(
		{
			requestId: rollover.id,
			status: 'succeeded',
			summary: 'Rolled the tombstone window forward.',
			...leaseAuthorization(rolloverLease),
		},
		now + 1_703
	)

	const outsideWindow = enqueueMlInternCanvasTool(firstPayload, now + 1_704)
	assert.equal(outsideWindow.status, 'queued')
	assert.equal(
		leaseNextMlInternCanvasTool(now + 1_705).id,
		firstPayload.idempotencyKey
	)
})

test('a queued operation can only be leased by its manifest-bound canvas client', () => {
	const now = Date.parse('2026-07-27T00:00:00.000Z')
	registerMlInternCanvasClient('canvas-a', now)
	registerMlInternCanvasClient('canvas-b', now)
	const manifest = issueMlInternCanvasCapabilityManifest(now, 'canvas-a')
	executeMlInternCanvasCapability(
		{
			manifestId: manifest.manifestId,
			binding: manifest.binding,
			capabilityId: 'canvas.inspect',
			idempotencyKey: 'bound-op',
			instruction: 'Inspect the chosen canvas selection.',
			context: 'selection',
		},
		now + 1
	)

	assert.equal(leaseNextMlInternCanvasTool(now + 2, 'canvas-b'), null)
	assert.equal(leaseNextMlInternCanvasTool(now + 3, 'canvas-a').id, 'bound-op')
	assert.equal(getMlInternCanvasToolStatus(undefined, 'canvas-b', now + 4).pending, 0)
	assert.equal(getMlInternCanvasToolStatus(undefined, 'canvas-a', now + 4).pending, 1)
})

test('legacy invoke binds to the sole active canvas client', () => {
	const now = Date.parse('2026-07-27T00:00:00.000Z')
	registerMlInternCanvasClient('canvas-a', now)

	const queued = enqueueLegacyMlInternCanvasTool(
		{
			idempotencyKey: 'legacy-bound-op',
			instruction: 'Update the selected native tldraw node.',
			context: 'selection',
		},
		now + 1
	)

	assert.equal(queued.id, 'legacy-bound-op')
	assert.equal(leaseNextMlInternCanvasTool(now + 2), null)
	assert.equal(leaseNextMlInternCanvasTool(now + 3, 'canvas-a').id, 'legacy-bound-op')
})

test('legacy invoke fails closed without one unambiguous active canvas client', () => {
	const now = Date.parse('2026-07-27T00:00:00.000Z')
	assert.throws(
		() =>
			enqueueLegacyMlInternCanvasTool(
				{ instruction: 'Inspect the selected native tldraw node.' },
				now
			),
		/no active tldraw canvas client/
	)

	registerMlInternCanvasClient('canvas-a', now)
	registerMlInternCanvasClient('canvas-b', now)
	assert.throws(
		() =>
			enqueueLegacyMlInternCanvasTool(
				{ instruction: 'Inspect the selected native tldraw node.' },
				now + 1
			),
		/multiple active web-preview tldraw canvas clients/
	)
})

test('offline desktop remains discoverable across bounded background throttling', () => {
	const now = Date.parse('2026-07-27T00:00:00.000Z')
	registerMlInternCanvasClient('offline-canvas', now, 'offline-desktop')
	registerMlInternCanvasClient('preview-canvas', now, 'web-preview')

	const queued = enqueueLegacyMlInternCanvasTool(
		{
			idempotencyKey: 'background-desktop-op',
			instruction: 'Inspect the selected desktop canvas node.',
			context: 'selection',
		},
		now + 10_001
	)
	assert.equal(leaseNextMlInternCanvasTool(now + 10_002, 'preview-canvas'), null)
	assert.equal(
		leaseNextMlInternCanvasTool(now + 10_003, 'offline-canvas').id,
		queued.id
	)

	resetMlInternCanvasToolState()
	registerMlInternCanvasClient('expired-offline-canvas', now, 'offline-desktop')
	assert.throws(
		() =>
			enqueueLegacyMlInternCanvasTool(
				{ instruction: 'Do not target an expired desktop lease.' },
				now + 5 * 60_000
			),
		/no active tldraw canvas client/
	)
})

test('offline desktop is preferred over previews without weakening same-kind ambiguity', () => {
	const now = Date.parse('2026-07-27T00:00:00.000Z')
	registerMlInternCanvasClient('preview-a', now, 'web-preview')
	registerMlInternCanvasClient('preview-b', now, 'web-preview')
	registerMlInternCanvasClient('offline-a', now, 'offline-desktop')
	// The ML-Intern compatibility poller omits clientKind; it must refresh the
	// shared binding without downgrading an already-classified desktop client.
	registerMlInternCanvasClient('offline-a', now + 1)

	const queued = enqueueLegacyMlInternCanvasTool(
		{
			idempotencyKey: 'prefer-offline',
			instruction: 'Inspect the selected native desktop canvas.',
			context: 'selection',
		},
		now + 2
	)
	assert.equal(leaseNextMlInternCanvasTool(now + 3, 'preview-a'), null)
	assert.equal(leaseNextMlInternCanvasTool(now + 4, 'preview-b'), null)
	assert.equal(leaseNextMlInternCanvasTool(now + 5, 'offline-a').id, queued.id)

	resetMlInternCanvasToolState()
	registerMlInternCanvasClient('offline-secret-a', now, 'offline-desktop')
	registerMlInternCanvasClient('offline-secret-b', now, 'offline-desktop')
	assert.throws(
		() =>
			enqueueLegacyMlInternCanvasTool(
				{ instruction: 'Fail closed on ambiguous desktop canvases.' },
				now + 1
			),
		(error) => {
			assert.match(error.message, /multiple active offline-desktop tldraw canvas clients/)
			assert.doesNotMatch(error.message, /offline-secret-a|offline-secret-b/)
			return true
		}
	)
})

test('fails closed for expired or incorrectly bound manifests', () => {
	const now = Date.parse('2026-07-27T00:00:00.000Z')
	const manifest = issueMlInternCanvasCapabilityManifest(now)
	assert.throws(
		() =>
			describeMlInternCanvasCapability(
				{
					manifestId: manifest.manifestId,
					binding: 'wrong',
					capabilityId: 'canvas.inspect',
				},
				now + 1
			),
		/binding does not match/
	)
	assert.throws(
		() =>
			describeMlInternCanvasCapability(
				{
					manifestId: manifest.manifestId,
					binding: manifest.binding,
					capabilityId: 'canvas.inspect',
				},
				now + 5 * 60_000
			),
		/missing or expired|expired/
	)
})

test('legacy wrapper stays native-only and is not advertised as a fourth tool', () => {
	assert.throws(
		() =>
			enqueueMlInternCanvasTool({
				instruction: 'Edit infrastructure.',
				surface: 'isoflow',
			}),
		/native tldraw surface/
	)
	enqueueMlInternCanvasTool({ instruction: 'Inspect the selected shapes.' })
	const status = getMlInternCanvasToolStatus()
	assert.equal(status.primary, 'terminal')
	assert.equal(status.surface, 'tldraw')
	assert.deepEqual(status.tools, [
		'tldraw_capabilities',
		'tldraw_describe_capability',
		'tldraw_execute',
	])
	assert.equal(status.latest, null)
	assert.equal(JSON.stringify(status).includes('isoflow'), false)
	assert.equal(JSON.stringify(status).includes('tldraw_canvas'), false)
})

test('provider-neutral companion inspect gates a direct Amp action plan on its contextRef', () => {
	const now = Date.parse('2026-07-27T00:00:00.000Z')
	registerMlInternCanvasClient('canvas-a', now)
	const manifest = issueCompanionCanvasCapabilityManifest(now, 'canvas-a')

	assert.equal('binding' in manifest, false)
	assert.equal('canvasBinding' in manifest, false)
	assert.deepEqual(manifest.capabilityIds, ML_INTERN_TLDRAW_CAPABILITY_IDS)

	const hydrated = describeCompanionCanvasCapability(
		{ manifestId: manifest.manifestId, capabilityId: 'canvas.shape.basic' },
		now + 1
	)
	assert.equal(hydrated.capability.actionPlan.coordinateSystem, 'absolute-page')
	assert.ok(hydrated.capability.actionPlan.actionTypes.includes('create'))
	const createSchema = hydrated.capability.actionPlan.schema.items.oneOf.find(
		(candidate) => candidate.properties?._type?.const === 'create'
	)
	assert.ok(createSchema.properties.shape.oneOf.length >= 5)
	assert.ok(
		createSchema.properties.shape.oneOf.some((candidate) =>
			candidate.properties?._type?.enum?.includes('rectangle')
		)
	)
	assert.ok(
		createSchema.properties.shape.oneOf.some(
			(candidate) => candidate.properties?._type?.const === 'arrow'
		)
	)
	assert.equal(
		createSchema.properties.shape.oneOf.some(
			(candidate) => candidate.properties?._type?.const === 'unknown'
		),
		false
	)
	assert.equal(JSON.stringify(hydrated).includes('threadId'), false)

	const inspect = executeCompanionCanvasCapability(
		{
			manifestId: manifest.manifestId,
			capabilityId: 'canvas.inspect',
			context: 'selection',
			idempotencyKey: 'amp-inspect-1',
			actor: 'amp',
			source: 'amp-plugin',
		},
		now + 2
	)
	assert.equal('contextRef' in inspect, false)
	assert.deepEqual(
		executeCompanionCanvasCapability(
			{
				manifestId: manifest.manifestId,
				capabilityId: 'canvas.inspect',
				context: 'selection',
				idempotencyKey: 'amp-inspect-1',
				actor: 'amp',
				source: 'amp-plugin',
			},
			now + 2
		),
		inspect
	)
	const leasedInspect = leaseNextMlInternCanvasTool(now + 3, 'canvas-a')
	assert.equal(leasedInspect.execution, 'direct-actions')
	assert.deepEqual(leasedInspect.actions ?? [], [])
	const inspected = recordMlInternCanvasToolReceipt(
		{
			requestId: inspect.id,
			status: 'succeeded',
			summary: 'Inspected one selected architecture node.',
			...leaseAuthorization(leasedInspect),
			result: {
				contextRef: 'ctx-v1-0123abcd',
				shapes: [
					{
						id: 'service-a',
						type: 'geo',
						bounds: { x: 10, y: 20, w: 120, h: 80 },
						text: 'Service A',
					},
				],
			},
		},
		now + 4
	)
	assert.equal(inspected.contextRef, 'ctx-v1-0123abcd')

	const mutation = executeCompanionCanvasCapability(
		{
			manifestId: manifest.manifestId,
			capabilityId: 'canvas.shape.basic',
			context: 'selection',
			contextRef: inspected.contextRef,
			idempotencyKey: 'amp-mutate-1',
			actor: 'amp',
			source: 'amp-plugin',
			actions: [
				{
					_type: 'label',
					intent: 'Bring the architecture label up to date.',
					shapeId: 'service-a',
					text: 'Service A v2',
				},
			],
		},
		now + 5
	)
	assert.equal(mutation.status, 'queued')
	const leasedMutation = leaseNextMlInternCanvasTool(now + 6, 'canvas-a')
	assert.equal(leasedMutation.actor, 'amp')
	assert.equal(leasedMutation.source, 'amp-plugin')
	assert.equal(leasedMutation.actions[0]._type, 'label')
	assert.equal('instruction' in leasedMutation, false)
})

test('repeated context refs stay scoped to their manifest and canvas binding', () => {
	const now = Date.parse('2026-07-27T00:00:00.000Z')
	registerMlInternCanvasClient('canvas-a', now, 'offline-desktop')
	const contextRef = 'ctx-v1-0123abcd'
	const oldManifest = issueCompanionCanvasCapabilityManifest(now, 'canvas-a')
	const oldInspect = executeCompanionCanvasCapability(
		{
			manifestId: oldManifest.manifestId,
			capabilityId: 'canvas.inspect',
			context: 'selection',
			idempotencyKey: 'old-inspect',
		},
		now + 1
	)
	const leasedOldInspect = leaseNextMlInternCanvasTool(
		now + 2,
		'canvas-a',
		'direct-actions'
	)
	recordMlInternCanvasToolReceipt(
		{
			requestId: oldInspect.id,
			status: 'succeeded',
			summary: 'Inspected unchanged selection under the old manifest.',
			...leaseAuthorization(leasedOldInspect),
			result: { contextRef, shapes: [] },
		},
		now + 3
	)

	const newManifest = issueCompanionCanvasCapabilityManifest(now + 4, 'canvas-a')
	const mutation = {
		capabilityId: 'canvas.shape.basic',
		context: 'selection',
		contextRef,
		actions: [
			{
				_type: 'label',
				intent: 'Update the selected label.',
				shapeId: 'service-a',
				text: 'Service A v2',
			},
		],
	}
	assert.throws(
		() =>
			executeCompanionCanvasCapability(
				{
					...mutation,
					manifestId: newManifest.manifestId,
					idempotencyKey: 'cross-manifest-mutation',
				},
				now + 5
			),
		/belongs to another manifest or canvas/
	)

	const newInspect = executeCompanionCanvasCapability(
		{
			manifestId: newManifest.manifestId,
			capabilityId: 'canvas.inspect',
			context: 'selection',
			idempotencyKey: 'new-inspect',
		},
		now + 6
	)
	const leasedNewInspect = leaseNextMlInternCanvasTool(
		now + 7,
		'canvas-a',
		'direct-actions'
	)
	recordMlInternCanvasToolReceipt(
		{
			requestId: newInspect.id,
			status: 'succeeded',
			summary: 'Inspected the same unchanged selection under the new manifest.',
			...leaseAuthorization(leasedNewInspect),
			result: { contextRef, shapes: [] },
		},
		now + 8
	)

	const queued = executeCompanionCanvasCapability(
		{
			...mutation,
			manifestId: newManifest.manifestId,
			idempotencyKey: 'current-manifest-mutation',
		},
		now + 9
	)
	assert.equal(queued.status, 'queued')
	assert.equal(queued.contextRef, contextRef)
})

test('provider-neutral plan fails closed without inspection, on cross-capability action, or forbidden fields', () => {
	const now = Date.parse('2026-07-27T00:00:00.000Z')
	const manifest = issueCompanionCanvasCapabilityManifest(now, 'canvas-a')
	assert.throws(
		() =>
			executeCompanionCanvasCapability(
				{
					manifestId: manifest.manifestId,
					capabilityId: 'canvas.inspect',
					context: 'selection',
					instruction: 'Ask another model to draw this.',
				},
				now + 1
			),
		/unsupported companion canvas request field: instruction/
	)
	assert.throws(
		() =>
			executeCompanionCanvasCapability(
				{
					manifestId: manifest.manifestId,
					capabilityId: 'canvas.layout',
					context: 'selection',
					actions: [
						{
							_type: 'align',
							intent: 'Align',
							shapeIds: ['a', 'b'],
							alignment: 'left',
							gap: 16,
						},
					],
				},
				now + 1
			),
		/requires contextRef/
	)

	const inspect = executeCompanionCanvasCapability(
		{
			manifestId: manifest.manifestId,
			capabilityId: 'canvas.inspect',
			context: 'selection',
		},
		now + 2
	)
	const leasedInspect = leaseNextMlInternCanvasTool(now + 3, 'canvas-a')
	const inspected = recordMlInternCanvasToolReceipt(
		{
			requestId: inspect.id,
			status: 'succeeded',
			summary: 'Inspected.',
			...leaseAuthorization(leasedInspect),
			result: { contextRef: 'ctx-v1-deadbeef', shapes: [] },
		},
		now + 4
	)
	assert.throws(
		() =>
			executeCompanionCanvasCapability(
				{
					manifestId: manifest.manifestId,
					capabilityId: 'canvas.layout',
					context: 'selection',
					contextRef: inspected.contextRef,
					actions: [{ _type: 'create', intent: 'Not a layout action', shape: {} }],
				},
				now + 5
			),
		/type is not allowed/
	)
	assert.throws(
		() =>
			recordMlInternCanvasToolReceipt({
				requestId: inspect.id,
				status: 'succeeded',
				summary: 'Leaky.',
				...leaseAuthorization(leasedInspect),
				result: { threadId: 'T-secret' },
			}),
		/not allowed/
	)
})

test('generic and ML-Intern endpoint families advertise the same exact three public tools', () => {
	const generic = getCompanionCanvasToolStatus()
	const compatibility = getMlInternCanvasToolStatus()
	assert.deepEqual(generic.tools, COMPANION_TLDRAW_TOOL_NAMES)
	assert.deepEqual(compatibility.tools, COMPANION_TLDRAW_TOOL_NAMES)
	assert.equal(generic.owner, 'existing-agent-thread')
	assert.equal(compatibility.primary, 'terminal')
})

test('generic and ML-Intern pollers cannot cross-lease each other on the same canvas', () => {
	const now = Date.parse('2026-07-27T00:00:00.000Z')
	registerMlInternCanvasClient('shared-canvas', now)
	const mlManifest = issueMlInternCanvasCapabilityManifest(now, 'shared-canvas')
	executeMlInternCanvasCapability(
		{
			manifestId: mlManifest.manifestId,
			binding: mlManifest.binding,
			capabilityId: 'canvas.inspect',
			instruction: 'Inspect through the ML-Intern compatibility path.',
			context: 'selection',
			idempotencyKey: 'ml-path',
		},
		now + 1
	)
	const companionManifest = issueCompanionCanvasCapabilityManifest(now, 'shared-canvas')
	executeCompanionCanvasCapability(
		{
			manifestId: companionManifest.manifestId,
			capabilityId: 'canvas.inspect',
			context: 'selection',
			idempotencyKey: 'companion-path',
		},
		now + 2
	)

	assert.equal(
		leaseNextMlInternCanvasTool(now + 3, 'shared-canvas', 'direct-actions').id,
		'companion-path'
	)
	assert.equal(
		leaseNextMlInternCanvasTool(now + 4, 'shared-canvas', 'instruction').id,
		'ml-path'
	)
})

test('provider-neutral discovery fails closed without exactly one offline desktop', async () => {
	const response = { setHeader() {} }
	const send = (_response, status, body) => ({ status, body })
	const invoke = () =>
		handleCompanionCanvasToolRequest(
			new URL('http://127.0.0.1:5176/companion/canvas-tool/capabilities'),
			{ method: 'GET' },
			response,
			async () => '',
			send
		)

	await assert.rejects(invoke, /no active offline-desktop tldraw canvas client/)
	registerMlInternCanvasClient('preview-secret-a', Date.now(), 'web-preview')
	registerMlInternCanvasClient('preview-secret-b', Date.now(), 'web-preview')
	await assert.rejects(invoke, (error) => {
		assert.match(error.message, /no active offline-desktop tldraw canvas client/)
		assert.doesNotMatch(error.message, /preview-secret-a|preview-secret-b/)
		return true
	})

	registerMlInternCanvasClient('offline-secret-a', Date.now(), 'offline-desktop')
	registerMlInternCanvasClient('offline-secret-b', Date.now(), 'offline-desktop')
	await assert.rejects(invoke, (error) => {
		assert.match(error.message, /multiple active offline-desktop tldraw canvas clients/)
		assert.doesNotMatch(error.message, /offline-secret-a|offline-secret-b/)
		return true
	})
})

test('provider-neutral discovery targets the sole offline desktop over active previews', async () => {
	registerMlInternCanvasClient('preview-a', Date.now(), 'web-preview')
	registerMlInternCanvasClient('preview-b', Date.now(), 'web-preview')
	registerMlInternCanvasClient('offline-target', Date.now(), 'offline-desktop')
	const response = { setHeader() {} }
	let sent
	await handleCompanionCanvasToolRequest(
		new URL('http://127.0.0.1:5176/companion/canvas-tool/capabilities'),
		{ method: 'GET' },
		response,
		async () => '',
		(_response, status, body) => {
			sent = { status, body }
		}
	)
	assert.equal(sent.status, 200)
	const manifest = JSON.parse(sent.body)
	const queued = executeCompanionCanvasCapability({
		manifestId: manifest.manifestId,
		capabilityId: 'canvas.inspect',
		context: 'selection',
		idempotencyKey: 'provider-neutral-offline',
	})
	assert.equal(
		leaseNextMlInternCanvasTool(Date.now(), 'preview-a', 'direct-actions'),
		null
	)
	assert.equal(
		leaseNextMlInternCanvasTool(Date.now(), 'preview-b', 'direct-actions'),
		null
	)
	assert.equal(
		leaseNextMlInternCanvasTool(Date.now(), 'offline-target', 'direct-actions').id,
		queued.id
	)
})

test('targeted provider-neutral discovery accepts only an active offline desktop binding', async () => {
	registerMlInternCanvasClient('preview-target', Date.now(), 'web-preview')
	registerMlInternCanvasClient('offline-other', Date.now(), 'offline-desktop')
	registerMlInternCanvasClient('offline-target', Date.now(), 'offline-desktop')
	const response = { setHeader() {} }
	const send = (_response, status, body) => ({ status, body })

	await assert.rejects(
		() =>
			handleCompanionCanvasToolRequest(
				new URL(
					'http://127.0.0.1:5176/companion/canvas-tool/capabilities?canvasBinding=preview-target'
				),
				{ method: 'GET' },
				response,
				async () => '',
				send
			),
		(error) => {
			assert.match(error.message, /not an active offline-desktop client/)
			assert.doesNotMatch(error.message, /preview-target/)
			return true
		}
	)

	let sent
	await handleCompanionCanvasToolRequest(
		new URL(
			'http://127.0.0.1:5176/companion/canvas-tool/capabilities?canvasBinding=offline-target'
		),
		{ method: 'GET' },
		response,
		async () => '',
		(_response, status, body) => {
			sent = { status, body }
		}
	)
	assert.equal(sent.status, 200)
	const manifest = JSON.parse(sent.body)
	const queued = executeCompanionCanvasCapability({
		manifestId: manifest.manifestId,
		capabilityId: 'canvas.inspect',
		context: 'selection',
		idempotencyKey: 'targeted-offline-binding',
	})
	assert.equal(
		leaseNextMlInternCanvasTool(Date.now(), 'offline-other', 'direct-actions'),
		null
	)
	assert.equal(
		leaseNextMlInternCanvasTool(Date.now(), 'preview-target', 'direct-actions'),
		null
	)
	assert.equal(
		leaseNextMlInternCanvasTool(Date.now(), 'offline-target', 'direct-actions').id,
		queued.id
	)
})

test('a web-origin client cannot claim or lease an offline desktop binding', async () => {
	const response = { setHeader() {} }
	const send = (_response, status, body) => ({ status, body })
	const noBody = async () => ''
	const offlineBinding = 'offline-private-binding'
	await handleCompanionCanvasToolRequest(
		new URL(
			`http://127.0.0.1:5176/companion/canvas-tool/status?canvasBinding=${offlineBinding}&clientKind=offline-desktop`
		),
		{ method: 'GET', headers: {} },
		response,
		noBody,
		send
	)
	let manifestResponse
	await handleCompanionCanvasToolRequest(
		new URL('http://127.0.0.1:5176/companion/canvas-tool/capabilities'),
		{ method: 'GET', headers: {} },
		response,
		noBody,
		(_response, status, body) => {
			manifestResponse = { status, body }
		}
	)
	const manifest = JSON.parse(manifestResponse.body)
	const queued = executeCompanionCanvasCapability({
		manifestId: manifest.manifestId,
		capabilityId: 'canvas.inspect',
		context: 'selection',
		idempotencyKey: 'origin-spoof-op',
	})

	const spoof = (clientKind = '') =>
		handleCompanionCanvasToolRequest(
			new URL(
				`http://127.0.0.1:5176/companion/canvas-tool/next?canvasBinding=${offlineBinding}${clientKind ? `&clientKind=${clientKind}` : ''}`
			),
			{ method: 'GET', headers: { origin: 'http://localhost:5173' } },
			response,
			noBody,
			send
		)
	await assert.rejects(() => spoof('offline-desktop'), (error) => {
		assert.match(error.message, /web-origin canvas clients cannot register as offline-desktop/)
		assert.doesNotMatch(error.message, new RegExp(offlineBinding))
		return true
	})
	await assert.rejects(() => spoof(), (error) => {
		assert.match(error.message, /canvas client kind cannot change/)
		assert.doesNotMatch(error.message, new RegExp(offlineBinding))
		return true
	})

	let leasedResponse
	await handleCompanionCanvasToolRequest(
		new URL(
			`http://127.0.0.1:5176/companion/canvas-tool/next?canvasBinding=${offlineBinding}&clientKind=offline-desktop`
		),
		{ method: 'GET', headers: {} },
		response,
		noBody,
		(_response, status, body) => {
			leasedResponse = { status, body }
		}
	)
	assert.equal(leasedResponse.status, 200)
	assert.equal(JSON.parse(leasedResponse.body).request.id, queued.id)
})

test('web origins are resident-only and cannot call companion or ML producer endpoints', async () => {
	const now = Date.parse('2026-07-27T00:00:00.000Z')
	const response = { setHeader() {} }
	const send = (_response, status, body) => ({ status, body })
	const webRequest = (method) => ({
		method,
		headers: { origin: 'http://localhost:5173' },
	})
	const offlineBinding = 'producer-offline'
	const previewBinding = 'resident-preview'
	registerMlInternCanvasClient(offlineBinding, now, 'offline-desktop')
	registerMlInternCanvasClient(previewBinding, now, 'web-preview')

	const companionManifest = issueCompanionCanvasCapabilityManifest(
		now,
		offlineBinding
	)
	const companionQueued = executeCompanionCanvasCapability(
		{
			manifestId: companionManifest.manifestId,
			capabilityId: 'canvas.inspect',
			context: 'selection',
			idempotencyKey: 'producer-companion-op',
		},
		now + 1
	)
	const mlManifest = issueMlInternCanvasCapabilityManifest(now, offlineBinding)
	const mlQueued = executeMlInternCanvasCapability(
		{
			manifestId: mlManifest.manifestId,
			binding: mlManifest.binding,
			capabilityId: 'canvas.inspect',
			instruction: 'Inspect the explicit selection.',
			context: 'selection',
			idempotencyKey: 'producer-ml-op',
		},
		now + 1
	)
	const producerCases = [
		{
			handler: handleCompanionCanvasToolRequest,
			url: '/companion/canvas-tool/capabilities',
			method: 'GET',
			body: '',
		},
		{
			handler: handleCompanionCanvasToolRequest,
			url: '/companion/canvas-tool/capabilities/describe',
			method: 'POST',
			body: JSON.stringify({
				manifestId: companionManifest.manifestId,
				capabilityId: 'canvas.inspect',
			}),
		},
		{
			handler: handleCompanionCanvasToolRequest,
			url: '/companion/canvas-tool/execute',
			method: 'POST',
			body: JSON.stringify({
				manifestId: companionManifest.manifestId,
				capabilityId: 'canvas.inspect',
				context: 'selection',
			}),
		},
		{
			handler: handleCompanionCanvasToolRequest,
			url: `/companion/canvas-tool/status?requestId=${companionQueued.id}`,
			method: 'GET',
			body: '',
		},
		{
			handler: handleCompanionCanvasToolRequest,
			url: '/companion/canvas-tool/status',
			method: 'GET',
			body: '',
		},
		{
			handler: handleMlInternCanvasToolRequest,
			url: '/ml-intern/canvas-tool/capabilities',
			method: 'GET',
			body: '',
		},
		{
			handler: handleMlInternCanvasToolRequest,
			url: '/ml-intern/canvas-tool/capabilities/describe',
			method: 'POST',
			body: JSON.stringify({
				manifestId: mlManifest.manifestId,
				binding: mlManifest.binding,
				capabilityId: 'canvas.inspect',
			}),
		},
		{
			handler: handleMlInternCanvasToolRequest,
			url: '/ml-intern/canvas-tool/execute',
			method: 'POST',
			body: JSON.stringify({
				manifestId: mlManifest.manifestId,
				binding: mlManifest.binding,
				capabilityId: 'canvas.inspect',
				instruction: 'Inspect.',
			}),
		},
		{
			handler: handleMlInternCanvasToolRequest,
			url: '/ml-intern/canvas-tool/invoke',
			method: 'POST',
			body: JSON.stringify({ instruction: 'Inspect.' }),
		},
		{
			handler: handleMlInternCanvasToolRequest,
			url: `/ml-intern/canvas-tool/status?requestId=${mlQueued.id}`,
			method: 'GET',
			body: '',
		},
		{
			handler: handleMlInternCanvasToolRequest,
			url: '/ml-intern/canvas-tool/status',
			method: 'GET',
			body: '',
		},
	]
	for (const producer of producerCases) {
		await assert.rejects(
			() =>
				producer.handler(
					new URL(`http://127.0.0.1:5176${producer.url}`),
					webRequest(producer.method),
					response,
					async () => producer.body,
					send
				),
			/canvas producer endpoints do not accept browser origins/
		)
	}

	let residentStatus
	await handleCompanionCanvasToolRequest(
		new URL(
			`http://127.0.0.1:5176/companion/canvas-tool/status?canvasBinding=${previewBinding}&clientKind=web-preview`
		),
		webRequest('GET'),
		response,
		async () => '',
		(_response, status, body) => {
			residentStatus = { status, body }
		}
	)
	assert.equal(residentStatus.status, 200)

	const residentManifest = issueCompanionCanvasCapabilityManifest(
		now,
		previewBinding
	)
	const residentQueued = executeCompanionCanvasCapability(
		{
			manifestId: residentManifest.manifestId,
			capabilityId: 'canvas.inspect',
			context: 'selection',
			idempotencyKey: 'resident-op',
		},
		now + 2
	)
	let residentLease
	await handleCompanionCanvasToolRequest(
		new URL(
			`http://127.0.0.1:5176/companion/canvas-tool/next?canvasBinding=${previewBinding}&clientKind=web-preview`
		),
		webRequest('GET'),
		response,
		async () => '',
		(_response, status, body) => {
			residentLease = { status, body }
		}
	)
	assert.equal(residentLease.status, 200)
	const leased = JSON.parse(residentLease.body).request
	assert.equal(leased.id, residentQueued.id)

	let residentReceipt
	await handleCompanionCanvasToolRequest(
		new URL('http://127.0.0.1:5176/companion/canvas-tool/receipt'),
		webRequest('POST'),
		response,
		async () =>
			JSON.stringify({
				requestId: leased.id,
				status: 'succeeded',
				summary: 'Inspected one bounded preview shape.',
				result: { contextRef: 'ctx-v1-1234abcd', shapes: [] },
				leaseToken: leased.leaseToken,
				canvasBinding: leased.canvasBinding,
			}),
		(_response, status, body) => {
			residentReceipt = { status, body }
		}
	)
	assert.equal(residentReceipt.status, 200)
	assert.doesNotMatch(residentReceipt.body, /leaseToken|resident-preview/)

	await assert.rejects(
		() =>
			handleCompanionCanvasToolRequest(
				new URL(
					'http://127.0.0.1:5176/companion/canvas-tool/status?canvasBinding=browser-spoof&clientKind=offline-desktop'
				),
				webRequest('GET'),
				response,
				async () => '',
				send
			),
		/web-origin canvas clients cannot register as offline-desktop/
	)
})

test('Amp plugin exposes only three bounded tools and keeps local routing out of their schemas', async () => {
	const source = await readFile(
		new URL('../amp/plugins/tldraw-offline-workbench.ts', import.meta.url),
		'utf8'
	)
	const registeredNames = [...source.matchAll(/name:\s*'([^']+)'/g)].map((match) => match[1])
	const inputSchemas = [...source.matchAll(/inputSchema:\s*\{([\s\S]*?)\n\t\t\},\n\t\tasync execute/g)].map(
		(match) => match[1]
	)
	assert.deepEqual(registeredNames, COMPANION_TLDRAW_TOOL_NAMES)
	assert.equal((source.match(/amp\.registerTool\(/g) ?? []).length, 3)
	assert.equal(inputSchemas.length, 3)
	assert.doesNotMatch(inputSchemas.join('\n'), /workspaceRoot|filePath|canvasBinding|apiKey|token|url/i)
	assert.doesNotMatch(source, /\bspawn\b|amp\.threads|thread\.id|threadId/i)
	assert.equal(resolveLoopbackBridgeUrl(), 'http://127.0.0.1:5176')
	assert.throws(() => resolveLoopbackBridgeUrl('https://example.com'), /loopback/)
})

test('Amp plugin runtime submits the current thread plan and waits for a compact receipt', async () => {
	const calls = []
	let statusReads = 0
	const fetchFn = async (url, init = {}) => {
		calls.push({ url, init })
		if (url.endsWith('/execute')) {
			const body = JSON.parse(init.body)
			assert.equal(body.actor, 'amp')
			assert.equal(body.source, 'amp-plugin')
			assert.deepEqual(body.actions, [{ _type: 'label', shapeId: 'a', intent: 'x', text: 'A' }])
			return mockJsonResponse(202, { id: 'amp-op-1', status: 'queued' })
		}
		statusReads += 1
		return mockJsonResponse(200, {
			request:
				statusReads === 1
					? { id: 'amp-op-1', status: 'leased' }
					: {
							id: 'amp-op-1',
							status: 'succeeded',
							summary: 'Applied one validated action.',
						},
		})
	}
	const client = createAmpTldrawCompanionClient({
		fetchFn,
		pollIntervalMs: 0,
		delay: async () => {},
	})
	const receipt = await client.execute({
		manifestId: 'manifest',
		capabilityId: 'canvas.shape.basic',
		context: 'selection',
		contextRef: 'context',
		actions: [{ _type: 'label', shapeId: 'a', intent: 'x', text: 'A' }],
	})
	assert.equal(receipt.status, 'succeeded')
	assert.equal(calls.length, 3)
})

test('Amp plugin runtime returns a terminal execute replay without polling status', async () => {
	const calls = []
	const terminal = {
		id: 'evicted-amp-op',
		status: 'succeeded',
		surface: 'tldraw',
		context: 'selection',
		capabilityId: 'canvas.inspect',
		createdAt: '2026-07-27T00:00:00.000Z',
		updatedAt: '2026-07-27T00:00:01.000Z',
		summary: 'Replayed a compact terminal receipt.',
	}
	const client = createAmpTldrawCompanionClient({
		fetchFn: async (url) => {
			calls.push(url)
			assert.match(url, /\/execute$/)
			return mockJsonResponse(202, terminal)
		},
		pollIntervalMs: 0,
		delay: async () => {},
	})

	assert.deepEqual(
		await client.execute({
			manifestId: 'manifest',
			capabilityId: 'canvas.inspect',
			context: 'selection',
		}),
		terminal
	)
	assert.equal(calls.length, 1)
})

function mockJsonResponse(status, payload) {
	return {
		ok: status >= 200 && status < 300,
		status,
		text: async () => JSON.stringify(payload),
	}
}
