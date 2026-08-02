import { describe, expect, it, vi } from 'vitest'
import type { TldrawAgent } from './TldrawAgent'
import {
	executeMlInternCanvasToolRequest,
	getMlInternCanvasToolStatus,
	leaseMlInternCanvasToolRequest,
	postMlInternCanvasToolReceipt,
	type MlInternCanvasToolRequest,
} from './mlInternCanvasTool'
import { COMPANION_CANVAS_CLIENT_KIND } from './companionCanvasBinding'

function request(
	overrides: Partial<MlInternCanvasToolRequest> = {}
): MlInternCanvasToolRequest {
	return {
		id: 'terminal-op-1',
		status: 'leased',
		surface: 'tldraw',
		context: 'selection',
		capabilityId: 'canvas.inspect',
		instruction: 'Inspect this selection.',
		createdAt: '2026-07-27T00:00:00.000Z',
		updatedAt: '2026-07-27T00:00:00.000Z',
		...overrides,
	}
}

function mockAgent({
	selected = [],
	contextItems = [],
	mutationAction = 'update',
	mutationHasDiff = true,
}: {
	selected?: unknown[]
	contextItems?: unknown[]
	mutationAction?: string | null
	mutationHasDiff?: boolean
} = {}) {
	const history: unknown[] = []
	const prompt = vi.fn().mockImplementation(async () => {
		if (!mutationAction) return
		const before = {
			id: 'shape:mutation-evidence',
			typeName: 'shape',
			type: 'geo',
			x: 10,
		}
		const after = { ...before, x: 20 }
		history.push({
			type: 'action',
			action: { _type: mutationAction, complete: true, time: 1 },
			diff: {
				added: {},
				updated: mutationHasDiff ? { [before.id]: [before, after] } : {},
				removed: {},
			},
			acceptance: 'pending',
		})
	})
	const agent = {
		editor: {
			getSelectedShapes: vi.fn(() => selected),
			getSelectionPageBounds: vi.fn(() =>
				selected.length ? { x: 10, y: 20, w: 300, h: 180 } : null
			),
			getShapePageBounds: vi.fn(() => ({ x: 10, y: 20, w: 300, h: 180 })),
			getCurrentPageShapesSorted: vi.fn(() => selected),
		},
		context: {
			getItems: vi.fn(() => contextItems),
		},
		modelName: {
			getModelName: vi.fn(() => 'claude-sonnet-4-5'),
			setModelName: vi.fn(),
		},
		chat: {
			getHistory: vi.fn(() => history),
		},
		prompt,
	} as unknown as TldrawAgent
	return { agent, prompt }
}

describe('ML-Intern native tldraw execution boundary', () => {
	it('registers the same non-secret client kind and returns lease authorization on receipt', async () => {
		const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
			ok: true,
			text: async () => '',
			json: async () => ({
				primary: 'terminal',
				bridge: 'ready',
				pending: 0,
				latest: null,
				request: null,
			}),
		} as Response)
		const lease = request({
			leaseToken: '01234567-89ab-4cde-8f01-23456789abcd',
			canvasBinding: 'canvas-private',
		})
		try {
			await getMlInternCanvasToolStatus()
			await leaseMlInternCanvasToolRequest()
			await postMlInternCanvasToolReceipt(
				{
					requestId: lease.id,
					status: 'succeeded',
					summary: 'Inspected one bounded shape.',
				},
				lease
			)
			for (const [input] of fetchMock.mock.calls.slice(0, 2)) {
				expect(new URL(String(input)).searchParams.get('clientKind')).toBe(
					COMPANION_CANVAS_CLIENT_KIND
				)
			}
			const receiptInit = fetchMock.mock.calls[2][1] as RequestInit
			expect(JSON.parse(String(receiptInit.body))).toMatchObject({
				requestId: lease.id,
				leaseToken: lease.leaseToken,
				canvasBinding: lease.canvasBinding,
			})
		} finally {
			fetchMock.mockRestore()
		}
	})

	it('fails closed rather than inspecting the whole canvas', async () => {
		const { agent, prompt } = mockAgent()

		await expect(executeMlInternCanvasToolRequest(agent, request())).rejects.toThrow(
			'explicit shape selection'
		)
		expect(prompt).not.toHaveBeenCalled()
	})

	it('returns a compact read-only receipt for an explicit selection', async () => {
		const { agent, prompt } = mockAgent({
			selected: [{ id: 'shape:node-a', type: 'geo' }],
		})

		await expect(executeMlInternCanvasToolRequest(agent, request())).resolves.toMatchObject({
			requestId: 'terminal-op-1',
			status: 'succeeded',
			capabilityId: 'canvas.inspect',
			summary: expect.stringContaining('geo:node-a'),
		})
		expect(prompt).not.toHaveBeenCalled()
	})

	it('hydrates only the requested layout tier for a bounded mutation', async () => {
		const { agent, prompt } = mockAgent({
			selected: [{ id: 'shape:node-a', type: 'geo' }],
		})

		const receipt = await executeMlInternCanvasToolRequest(
			agent,
			request({
				capabilityId: 'canvas.layout',
				instruction: 'Align the selected nodes.',
				leaseToken: 'must-not-enter-prompt',
				canvasBinding: 'must-not-enter-prompt',
			})
		)

		expect(prompt).toHaveBeenCalledOnce()
		expect(prompt).toHaveBeenCalledWith(
			expect.objectContaining({
				bounds: { x: 10, y: 20, w: 300, h: 180 },
				source: 'other-agent',
				routing: {
					enabled: true,
					route: 'canvas-edit',
					capabilityTier: 'extended',
					maxHistoryItems: 2,
				},
			})
		)
		expect(receipt).toMatchObject({
			status: 'succeeded',
			capabilityId: 'canvas.layout',
			summary: expect.stringContaining('1 validated native tldraw action (update)'),
		})
		expect(JSON.stringify(prompt.mock.calls[0])).not.toContain('isoflow')
		expect(JSON.stringify(prompt.mock.calls[0])).not.toContain('must-not-enter-prompt')
	})

	it('refuses a success receipt when the prompt produces no validated mutation action', async () => {
		const { agent, prompt } = mockAgent({
			selected: [{ id: 'shape:node-a', type: 'geo' }],
			mutationAction: null,
		})

		await expect(
			executeMlInternCanvasToolRequest(
				agent,
				request({
					capabilityId: 'canvas.shape.basic',
					instruction: 'Update the selected node.',
				})
			)
		).rejects.toThrow('refusing a success receipt')
		expect(prompt).toHaveBeenCalledOnce()
	})

	it('refuses a success receipt when a completed action has an empty record diff', async () => {
		const { agent, prompt } = mockAgent({
			selected: [{ id: 'shape:node-a', type: 'geo' }],
			mutationHasDiff: false,
		})

		await expect(
			executeMlInternCanvasToolRequest(
				agent,
				request({
					capabilityId: 'canvas.shape.basic',
					instruction: 'Update the selected node.',
				})
			)
		).rejects.toThrow('refusing a success receipt')
		expect(prompt).toHaveBeenCalledOnce()
	})

	it('accepts an explicit area but rejects an empty selection-or-area request', async () => {
		const area = {
			type: 'area',
			bounds: { x: 100, y: 200, w: 400, h: 240 },
			source: 'user',
		}
		const bounded = mockAgent({ contextItems: [area] })
		await executeMlInternCanvasToolRequest(
			bounded.agent,
			request({
				context: 'selection-or-area',
				capabilityId: 'canvas.shape.basic',
				instruction: 'Add one native note in this area.',
			})
		)
		expect(bounded.prompt).toHaveBeenCalledWith(
			expect.objectContaining({
				bounds: area.bounds,
				contextItems: [area],
			})
		)

		const empty = mockAgent()
		await expect(
			executeMlInternCanvasToolRequest(
				empty.agent,
				request({ context: 'selection-or-area' })
			)
		).rejects.toThrow('whole-canvas fallback is disabled')
	})

	it('uses terminal-requested bounds without inheriting ambient selection or context', async () => {
		const requestedBounds = { x: -120, y: 80, w: 640, h: 360 }
		const { agent, prompt } = mockAgent({
			selected: [{ id: 'shape:ambient', type: 'geo' }],
			contextItems: [
				{
					type: 'area',
					bounds: { x: 10, y: 20, w: 30, h: 40 },
					source: 'user',
				},
			],
		})

		await executeMlInternCanvasToolRequest(
			agent,
			request({
				context: 'selection-or-area',
				bounds: requestedBounds,
				capabilityId: 'canvas.shape.basic',
				instruction: 'Add one native note inside these requested bounds.',
			})
		)

		expect(prompt).toHaveBeenCalledWith(
			expect.objectContaining({
				bounds: requestedBounds,
				contextItems: [{ type: 'area', bounds: requestedBounds, source: 'agent' }],
			})
		)
	})

	it('rejects malformed terminal-requested bounds before reading or prompting', async () => {
		const { agent, prompt } = mockAgent()
		await expect(
			executeMlInternCanvasToolRequest(
				agent,
				request({
					context: 'selection-or-area',
					bounds: { x: 0, y: 0, w: Number.NaN, h: 100 },
				})
			)
		).rejects.toThrow('finite positive geometry')
		await expect(
			executeMlInternCanvasToolRequest(
				agent,
				request({
					context: 'selection-or-area',
					bounds: { x: 0, y: 0, w: 8_192, h: 8_192 },
				})
			)
		).rejects.toThrow('bounded context limit')
		expect(prompt).not.toHaveBeenCalled()
	})
})
