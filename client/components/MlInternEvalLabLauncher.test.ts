import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import type { TldrawAgent } from '../agent/TldrawAgent'
import type { MlInternCanvasToolRequest } from '../agent/mlInternCanvasTool'
import {
	createMlInternReceiptDeliveryQueue,
	executeMlInternRequestLocally,
	resolveMlInternLauncherTone,
} from './MlInternEvalLabLauncher'

const launcherSource = readFileSync(
	new URL('./MlInternEvalLabLauncher.tsx', import.meta.url),
	'utf8'
)

describe('ML-Intern terminal bridge native tldraw chrome', () => {
	it('retries an unconfirmed success receipt without re-executing the canvas mutation', async () => {
		const request: MlInternCanvasToolRequest = {
			id: 'ml-request-1',
			status: 'leased',
			surface: 'tldraw',
			context: 'selection',
			capabilityId: 'canvas.shape.basic',
			instruction: 'Move the selected node.',
			leaseToken: '01234567-89ab-4cde-8f01-23456789abcd',
			canvasBinding: 'canvas-test',
			createdAt: '2026-07-27T00:00:00.000Z',
			updatedAt: '2026-07-27T00:00:01.000Z',
		}
		const succeededReceipt = {
			requestId: request.id,
			status: 'succeeded' as const,
			capabilityId: request.capabilityId,
			summary: 'Completed one validated native tldraw action.',
		}
		const execute = vi.fn().mockResolvedValue(succeededReceipt)
		const deliver = vi
			.fn()
			.mockRejectedValueOnce(new Error('receipt response lost'))
			.mockResolvedValueOnce(undefined)
		const queue = createMlInternReceiptDeliveryQueue(deliver)

		const outcome = await executeMlInternRequestLocally(
			{} as TldrawAgent,
			request,
			execute
		)
		queue.stage(outcome)

		expect(await queue.attempt()).toMatchObject({
			status: 'unknown',
			error: 'receipt response lost',
			outcome: { receipt: { status: 'succeeded' } },
		})
		expect(queue.getPending()).toBe(outcome)
		expect(await queue.attempt()).toMatchObject({
			status: 'delivered',
			outcome: { receipt: { status: 'succeeded' } },
		})
		expect(queue.getPending()).toBeNull()
		expect(execute).toHaveBeenCalledTimes(1)
		expect(deliver).toHaveBeenCalledTimes(2)
		expect(deliver.mock.calls.map(([receipt]) => receipt.status)).toEqual([
			'succeeded',
			'succeeded',
		])
	})

	it('keeps the collapsed indicator failed while an idle poll reports the failed latest receipt', () => {
		expect(
			resolveMlInternLauncherTone({
				hasError: false,
				isProcessing: false,
				hasBridge: true,
				latestStatus: 'failed',
			})
		).toBe('error')
		expect(
			resolveMlInternLauncherTone({
				hasError: false,
				isProcessing: false,
				hasBridge: true,
				latestStatus: 'succeeded',
			})
		).toBe('ready')
	})

	it('starts compact and opens through a native tool-button popover', () => {
		expect(launcherSource).toContain('useState(false)')
		expect(launcherSource).toContain('TldrawUiPopover')
		expect(launcherSource).toContain('TldrawUiPopoverTrigger')
		expect(launcherSource).toContain('TldrawUiPopoverContent')
		expect(launcherSource).toContain('TldrawUiButton')
		expect(launcherSource).toContain('TldrawUiButtonIcon icon="code"')
		expect(launcherSource).toContain('TldrawUiTooltip')
		expect(launcherSource).not.toContain('function MlInternBridgeIcon')
		expect(launcherSource).not.toContain('<button')
	})

	it('preserves terminal-primary capability discovery and compact receipts', () => {
		expect(launcherSource).toContain('tldraw_capabilities')
		expect(launcherSource).toContain('tldraw_describe_capability')
		expect(launcherSource).toContain('tldraw_execute')
		expect(launcherSource).toContain(
			'The terminal owns planning, tools, history, and approvals.'
		)
		expect(launcherSource).toContain(
			'Observes and executes; it never starts ML-Intern.'
		)
		expect(launcherSource).toContain('LAST RECEIPT')
	})
})
