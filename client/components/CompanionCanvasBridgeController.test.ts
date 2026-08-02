import { describe, expect, it, vi } from 'vitest'
import type { TldrawAgent } from '../agent/TldrawAgent'
import type {
	CompanionCanvasToolStatus,
	CompanionCanvasToolReceipt,
	CompanionCanvasToolRequest,
} from '../agent/companionCanvasTool'
import {
	createCompanionCanvasReceiptDeliveryQueue,
	executeCompanionCanvasRequestLocally,
	resolveCompanionCanvasBridgeIdlePresentation,
} from './CompanionCanvasBridgeController'

const REQUEST: CompanionCanvasToolRequest = {
	id: 'companion-plan-1',
	status: 'leased',
	surface: 'tldraw',
	context: 'selection',
	capabilityId: 'canvas.shape.basic',
	execution: 'direct-actions',
	actions: [{ _type: 'create', shape: { _type: 'rectangle' } }],
	leaseToken: '01234567-89ab-4cde-8f01-23456789abcd',
	canvasBinding: 'canvas-test',
	createdAt: '2026-07-27T00:00:00.000Z',
	updatedAt: '2026-07-27T00:00:01.000Z',
}

const SUCCEEDED_RECEIPT: CompanionCanvasToolReceipt = {
	requestId: REQUEST.id,
	status: 'succeeded',
	capabilityId: REQUEST.capabilityId,
	summary: 'Completed one validated native tldraw action.',
	result: {
		operationCount: 1,
		actionTypes: ['create'],
	},
}

const STATUS: CompanionCanvasToolStatus = {
	bridge: 'ready',
	pending: 0,
	latest: null,
	tools: [
		'tldraw_capabilities',
		'tldraw_describe_capability',
		'tldraw_execute',
	],
	surface: 'tldraw',
	context: 'explicit-selection-or-bounded-area',
	mutations: 'validated-native-actions',
}

describe('CompanionCanvasBridgeController receipt delivery', () => {
	it('keeps the latest failed receipt visible across idle status polls', () => {
		expect(
			resolveCompanionCanvasBridgeIdlePresentation(null, {
				...STATUS,
				latest: {
					...REQUEST,
					status: 'failed',
					summary: 'validated action rejected',
				},
			})
		).toEqual({
			state: 'failed',
			error: 'validated action rejected',
		})

		expect(
			resolveCompanionCanvasBridgeIdlePresentation(SUCCEEDED_RECEIPT, {
				...STATUS,
				latest: {
					...REQUEST,
					status: 'failed',
					summary: 'older failure',
				},
			})
		).toEqual({ state: 'ready', error: '' })
	})

	it('retries the exact immutable success outcome without re-executing or emitting failed', async () => {
		const execute = vi.fn().mockResolvedValue(SUCCEEDED_RECEIPT)
		const deliver = vi
			.fn()
			.mockRejectedValueOnce(new Error('connection closed after request write'))
			.mockResolvedValueOnce(undefined)
		const queue = createCompanionCanvasReceiptDeliveryQueue(deliver)

		const outcome = await executeCompanionCanvasRequestLocally(
			{} as TldrawAgent,
			REQUEST,
			execute
		)
		queue.stage(outcome)

		const firstAttempt = await queue.attempt()
		expect(firstAttempt).toMatchObject({
			status: 'unknown',
			error: 'connection closed after request write',
		})
		expect(queue.getPending()).toBe(outcome)
		expect(outcome.receipt.status).toBe('succeeded')
		expect(Object.isFrozen(outcome)).toBe(true)
		expect(Object.isFrozen(outcome.receipt)).toBe(true)
		expect(Object.isFrozen(outcome.lease)).toBe(true)

		const retry = await queue.attempt()
		expect(retry).toMatchObject({ status: 'delivered', outcome })
		expect(queue.getPending()).toBeNull()
		expect(execute).toHaveBeenCalledTimes(1)
		expect(deliver).toHaveBeenCalledTimes(2)
		expect(deliver.mock.calls[0][0]).toBe(outcome.receipt)
		expect(deliver.mock.calls[1][0]).toBe(outcome.receipt)
		expect(deliver.mock.calls.map(([receipt]) => receipt.status)).toEqual([
			'succeeded',
			'succeeded',
		])
	})

	it('creates a failed receipt only when local execution itself throws', async () => {
		const execute = vi.fn().mockRejectedValue(new Error('action validation failed'))
		const deliver = vi.fn().mockResolvedValue(undefined)
		const queue = createCompanionCanvasReceiptDeliveryQueue(deliver)

		const outcome = await executeCompanionCanvasRequestLocally(
			{} as TldrawAgent,
			REQUEST,
			execute
		)
		queue.stage(outcome)
		const attempt = await queue.attempt()

		expect(attempt).toMatchObject({ status: 'delivered' })
		expect(outcome).toMatchObject({
			executionError: 'action validation failed',
			receipt: {
				requestId: REQUEST.id,
				status: 'failed',
				capabilityId: REQUEST.capabilityId,
				summary: 'action validation failed',
			},
		})
		expect(execute).toHaveBeenCalledTimes(1)
		expect(deliver).toHaveBeenCalledOnce()
		expect(deliver.mock.calls[0][0].status).toBe('failed')
	})
})
