import { describe, expect, it, vi } from 'vitest'
import type { TldrawAgent } from './TldrawAgent'
import {
	executeCompanionCanvasToolRequest,
	getCompanionCanvasToolStatus,
	leaseCompanionCanvasToolRequest,
	postCompanionCanvasToolReceipt,
	type CompanionCanvasToolRequest,
} from './companionCanvasTool'

function request(
	overrides: Partial<CompanionCanvasToolRequest> = {}
): CompanionCanvasToolRequest {
	return {
		id: 'amp-plan-1',
		status: 'leased',
		surface: 'tldraw',
		context: 'selection',
		capabilityId: 'canvas.inspect',
		execution: 'direct-actions',
		createdAt: '2026-07-27T00:00:00.000Z',
		updatedAt: '2026-07-27T00:00:00.000Z',
		...overrides,
	}
}

function shape(
	index: number,
	overrides: Record<string, unknown> = {}
) {
	return {
		id: `shape:node-${index}`,
		typeName: 'shape',
		type: 'geo',
		parentId: 'page:page',
		index: `a${index}`,
		x: index * 10,
		y: index * 10,
		rotation: 0,
		opacity: 1,
		isLocked: false,
		props: { w: 80, h: 48 },
		meta: {},
		...overrides,
	}
}

function mockAgent({
	selected = [shape(1)],
	pageShapes = selected,
	contextItems = [],
}: {
	selected?: ReturnType<typeof shape>[]
	pageShapes?: ReturnType<typeof shape>[]
	contextItems?: unknown[]
} = {}) {
	const history: unknown[] = []
	const prompt = vi.fn()
	const getBounds = vi.fn((target: { id: string }) => {
		const current = pageShapes.find((candidate) => candidate.id === target.id)
		const index = Number(target.id.split('-').at(-1)) || 1
		const props = current?.props as { w?: number; h?: number } | undefined
		return {
			x: typeof current?.x === 'number' ? current.x : index * 10,
			y: typeof current?.y === 'number' ? current.y : index * 10,
			w: props?.w ?? 80,
			h: props?.h ?? 48,
		}
	})
	const editor = {
		getSelectedShapes: vi.fn(() => selected),
		getShapeMaskedPageBounds: vi.fn(getBounds),
		getShapePageBounds: vi.fn((target: unknown) =>
			getBounds(
				typeof target === 'string'
					? ({ id: target } as { id: string })
					: (target as { id: string })
			)
		),
		getCurrentPageShapesSorted: vi.fn(() => pageShapes),
		getShape: vi.fn((id: string) => pageShapes.find((candidate) => candidate.id === id)),
		getBindingsFromShape: vi.fn(() => []),
		getShapeUtil: vi.fn(() => ({
			getText: (target: { label?: string }) => target.label ?? 'Service node',
			})),
			complete: vi.fn(),
			markHistoryStoppingPoint: vi.fn(() => 'companion-history-mark'),
		squashToMark: vi.fn(),
		bailToMark: vi.fn(),
		run: vi.fn((callback: () => void) => callback()),
	}
	const actions = {
		getAgentActionUtil: vi.fn(() => ({
			sanitizeAction: (action: unknown) => action,
		})),
		act: vi.fn((action: unknown) => {
			const record = action as {
				_type?: string
				shapeId?: string
				x?: number
				y?: number
				text?: string
				update?: { shapeId?: string }
			}
			const simpleId = record.update?.shapeId ?? record.shapeId
			const id = simpleId?.startsWith('shape:') ? simpleId : `shape:${simpleId}`
			const target = pageShapes.find((candidate) => candidate.id === id)
			if (!target) throw new Error(`Mock mutation target ${id} was not found`)
			const before = { ...target }
			if (record._type === 'move') {
				if (typeof record.x === 'number') target.x = record.x
				if (typeof record.y === 'number') target.y = record.y
			}
			if (record._type === 'label' && typeof record.text === 'string') {
				;(target as Record<string, unknown>).label = record.text
			}
			const diff = {
				added: {},
				updated: { [id]: [before, { ...target }] },
				removed: {},
			}
			history.push({
				type: 'action',
				action,
				diff,
				acceptance: 'pending',
			})
			return {
				diff,
				promise: null,
			}
		}),
	}
	const agent = {
		editor,
		context: { getItems: vi.fn(() => contextItems) },
		mode: { getCurrentModeType: vi.fn(() => 'working') },
		chatOrigin: { getOrigin: vi.fn(() => ({ x: 0, y: 0 })) },
		chat: {
			getHistory: vi.fn(() => history),
			update: vi.fn((updater: (items: unknown[]) => unknown[]) => {
				const next = updater(history)
				history.splice(0, history.length, ...next)
			}),
		},
		actions,
		lints: { trackShapesFromDiff: vi.fn() },
		setIsActingOnEditor: vi.fn(),
		prompt,
	} as unknown as TldrawAgent
	return { agent, actions, editor, history, prompt }
}

describe('provider-neutral companion live-canvas executor', () => {
	it('registers the non-secret client kind on status and lease heartbeats', async () => {
		const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
			ok: true,
			text: async () => '',
			json: async () => ({
				bridge: 'ready',
				request: null,
				pending: 0,
				latest: null,
			}),
		} as Response)

		try {
			const options = {
				baseUrl: 'http://127.0.0.1:5176/companion/canvas-tool',
				canvasBinding: 'canvas-test',
				clientKind: 'offline-desktop' as const,
			}
			await getCompanionCanvasToolStatus(undefined, options)
			await leaseCompanionCanvasToolRequest(undefined, options)

			expect(fetchMock).toHaveBeenCalledTimes(2)
			for (const [input] of fetchMock.mock.calls) {
				const url = new URL(String(input))
				expect(url.searchParams.get('canvasBinding')).toBe('canvas-test')
				expect(url.searchParams.get('clientKind')).toBe('offline-desktop')
			}
		} finally {
			fetchMock.mockRestore()
		}
	})

	it('returns lease authorization only to the receipt transport', async () => {
		const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
			ok: true,
			text: async () => '',
			json: async () => ({
				id: 'amp-plan-1',
				status: 'succeeded',
				surface: 'tldraw',
				context: 'selection',
				capabilityId: 'canvas.inspect',
				createdAt: '2026-07-27T00:00:00.000Z',
				updatedAt: '2026-07-27T00:00:01.000Z',
			}),
		} as Response)
		const lease = request({
			leaseToken: '01234567-89ab-4cde-8f01-23456789abcd',
			canvasBinding: 'canvas-private',
		})
		try {
			await postCompanionCanvasToolReceipt(
				{
					requestId: lease.id,
					status: 'succeeded',
					capabilityId: lease.capabilityId,
					summary: 'Inspected one bounded shape.',
				},
				lease,
				{ baseUrl: 'http://127.0.0.1:5176/companion/canvas-tool' }
			)
			const init = fetchMock.mock.calls[0][1] as RequestInit
			expect(JSON.parse(String(init.body))).toMatchObject({
				requestId: lease.id,
				leaseToken: lease.leaseToken,
				canvasBinding: lease.canvasBinding,
			})
			await expect(
				postCompanionCanvasToolReceipt(
					{
						requestId: lease.id,
						status: 'failed',
						summary: 'Missing authorization.',
					},
					{},
					{ baseUrl: 'http://127.0.0.1:5176/companion/canvas-tool' }
				)
			).rejects.toThrow('missing its lease authorization')
		} finally {
			fetchMock.mockRestore()
		}
	})

	it('returns at most 24 semantic shapes without raw metadata, screenshots, or local paths', async () => {
		const shapes = Array.from({ length: 30 }, (_, index) =>
			shape(index + 1, {
				label: index === 0 ? '/Users/example/private/diagram.md' : `Service ${index + 1}`,
				meta:
					index === 1
						? {
								workbench: {
									artifact: {
										schema: 'workbench-artifact/v1',
										artifactId: 'architecture.service.api',
										pack: 'architecture',
										kind: 'service',
										title: 'API',
										status: 'active',
										secret: 'must-not-leak',
									},
								},
								arbitrary: { path: '/Users/example/private' },
							}
						: index === 2
							? {
									workbench: {
										relation: {
											schema: 'workbench-relation/v1',
											relationId: 'architecture.relation.api-db',
											pack: 'architecture',
											type: 'depends-on',
											label: 'reads',
											start: {
												artifactId: 'architecture.service.api',
												shapeId: 'shape:node-2',
											},
											end: {
												artifactId: 'architecture.store.db',
												shapeId: 'shape:node-4',
											},
										},
									},
								}
						: {},
			})
		)
		const { agent } = mockAgent({
			selected: [],
			pageShapes: shapes,
			contextItems: [
				{
					type: 'area',
					bounds: { x: 0, y: 0, w: 1_000, h: 1_000 },
					source: 'user',
				},
			],
		})

		const receipt = await executeCompanionCanvasToolRequest(
			agent,
			request({ context: 'selection-or-area' })
		)
		const result = receipt.result as {
			contextRef: string
			shapes: Array<Record<string, unknown>>
		}

		expect(result.shapes).toHaveLength(24)
		expect(result.contextRef).toMatch(/^ctx-v1-/)
		expect(result.shapes[0]).not.toHaveProperty('label')
		expect(result.shapes.find((candidate) => candidate.id === 'shape:node-2')).toMatchObject({
			id: 'shape:node-2',
			type: 'geo',
			workbench: {
				artifact: {
					artifactId: 'architecture.service.api',
					pack: 'architecture',
					kind: 'service',
					title: 'API',
					status: 'active',
				},
			},
		})
		expect(JSON.stringify(result)).not.toContain('must-not-leak')
		expect(result.shapes.find((candidate) => candidate.id === 'shape:node-3')).toMatchObject({
			relation: {
				relationId: 'architecture.relation.api-db',
				type: 'depends-on',
				start: {
					artifactId: 'architecture.service.api',
					shapeId: 'shape:node-2',
				},
				end: {
					artifactId: 'architecture.store.db',
					shapeId: 'shape:node-4',
				},
			},
		})
		expect(JSON.stringify(result)).not.toContain('/Users/')
		expect(JSON.stringify(result)).not.toContain('screenshot')
	})

	it('hashes every shape authorized by a dense area, including shapes omitted from projection', async () => {
		const shapes = Array.from({ length: 30 }, (_, index) => shape(index + 1))
		const { agent, actions } = mockAgent({
			selected: [],
			pageShapes: shapes,
			contextItems: [
				{
					type: 'area',
					bounds: { x: 0, y: 0, w: 1_000, h: 1_000 },
					source: 'user',
				},
			],
		})
		const inspection = await executeCompanionCanvasToolRequest(
			agent,
			request({ context: 'selection-or-area' })
		)
		const contextRef = (inspection.result as { contextRef: string }).contextRef

		shapes[29].x += 1

		await expect(
			executeCompanionCanvasToolRequest(
				agent,
				request({
					context: 'selection-or-area',
					capabilityId: 'canvas.shape.basic',
					contextRef,
					actions: [
						{
							_type: 'label',
							intent: 'Change a visible shape',
							shapeId: 'node-1',
							text: 'Changed',
						},
					],
				})
			)
		).rejects.toThrow('context drifted')
		expect(actions.act).not.toHaveBeenCalled()
	})

	it('applies an Amp-produced validated action directly and never calls agent.prompt', async () => {
		const { agent, actions, editor, prompt } = mockAgent()
		const inspection = await executeCompanionCanvasToolRequest(
			agent,
			request({ contextRef: 'server-context-direct' })
		)
		const contextRef = (inspection.result as { contextRef: string }).contextRef

		const receipt = await executeCompanionCanvasToolRequest(
			agent,
			request({
				capabilityId: 'canvas.shape.basic',
				contextRef,
				actions: [
					{
						_type: 'label',
						intent: 'Name the selected service',
						shapeId: 'node-1',
						text: 'Candidate API',
					},
				],
			})
		)

		expect(prompt).not.toHaveBeenCalled()
		expect(actions.act).toHaveBeenCalledOnce()
		expect(editor.squashToMark).toHaveBeenCalledWith('companion-history-mark')
		expect(editor.bailToMark).not.toHaveBeenCalled()
		expect(receipt).toMatchObject({
			status: 'succeeded',
			result: {
				contextRef,
				operationCount: 1,
				actionTypes: ['label'],
				shapeIds: ['shape:node-1'],
				undoable: true,
			},
		})
	})

	it('rolls back the whole request when a later native action fails', async () => {
		const { agent, actions, editor, history } = mockAgent()
		const inspection = await executeCompanionCanvasToolRequest(agent, request())
		const contextRef = (inspection.result as { contextRef: string }).contextRef
		actions.act
			.mockImplementationOnce((action: unknown) => {
				history.push({
					type: 'action',
					action,
					diff: { added: {}, updated: {}, removed: {} },
					acceptance: 'pending',
				})
				return {
					diff: { added: {}, updated: {}, removed: {} },
					promise: null,
				}
			})
			.mockImplementationOnce(() => {
				throw new Error('second action failed')
			})

		await expect(
			executeCompanionCanvasToolRequest(
				agent,
				request({
					capabilityId: 'canvas.shape.basic',
					contextRef,
					actions: [
						{
							_type: 'label',
							intent: 'First mutation',
							shapeId: 'node-1',
							text: 'Candidate API',
						},
						{
							_type: 'label',
							intent: 'Second mutation',
							shapeId: 'node-1',
							text: 'Candidate service',
						},
					],
				})
			)
		).rejects.toThrow('second action failed')

		expect(editor.bailToMark).toHaveBeenCalledWith('companion-history-mark')
		expect(editor.squashToMark).not.toHaveBeenCalled()
		expect(history).toEqual([])
	})

	it('rolls back and refuses success when the native action produces an empty diff', async () => {
		const { agent, actions, editor, history } = mockAgent()
		const inspection = await executeCompanionCanvasToolRequest(agent, request())
		const contextRef = (inspection.result as { contextRef: string }).contextRef
		actions.act.mockImplementationOnce((action: unknown) => {
			const diff = { added: {}, updated: {}, removed: {} }
			history.push({ type: 'action', action, diff, acceptance: 'pending' })
			return { diff, promise: null }
		})

		await expect(
			executeCompanionCanvasToolRequest(
				agent,
				request({
					capabilityId: 'canvas.shape.basic',
					contextRef,
					actions: [
						{
							_type: 'label',
							intent: 'No-op',
							shapeId: 'node-1',
							text: 'Service node',
						},
					],
				})
			)
		).rejects.toThrow('empty native tldraw record diff')

		expect(editor.bailToMark).toHaveBeenCalledWith('companion-history-mark')
		expect(editor.squashToMark).not.toHaveBeenCalled()
		expect(history).toEqual([])
	})

	it('validates final native bounds before commit and rolls back an escape', async () => {
		const target = shape(1)
		const { agent, actions, editor, history } = mockAgent({ selected: [target] })
		const inspection = await executeCompanionCanvasToolRequest(agent, request())
		const contextRef = (inspection.result as { contextRef: string }).contextRef
		actions.act.mockImplementationOnce((action: unknown) => {
			const before = { ...target }
			target.x = 500
			const diff = {
				added: {},
				updated: { [target.id]: [before, { ...target }] },
				removed: {},
			}
			history.push({ type: 'action', action, diff, acceptance: 'pending' })
			return { diff, promise: null }
		})

		await expect(
			executeCompanionCanvasToolRequest(
				agent,
				request({
					capabilityId: 'canvas.shape.basic',
					contextRef,
					actions: [
						{
							_type: 'label',
							intent: 'Native util escapes despite a safe plan',
							shapeId: 'node-1',
							text: 'Changed',
						},
					],
				})
			)
		).rejects.toThrow('final bounds')

		expect(editor.bailToMark).toHaveBeenCalledWith('companion-history-mark')
		expect(editor.squashToMark).not.toHaveBeenCalled()
		expect(history).toEqual([])
	})

	it('rolls back an actual binding diff that references an unauthorized shape', async () => {
		const inside = shape(1)
		const outside = shape(2)
		const { agent, actions, editor, history } = mockAgent({
			selected: [inside],
			pageShapes: [inside, outside],
		})
		const inspection = await executeCompanionCanvasToolRequest(agent, request())
		const contextRef = (inspection.result as { contextRef: string }).contextRef
		actions.act.mockImplementationOnce((action: unknown) => {
			const binding = {
				id: 'binding:escaped',
				typeName: 'binding',
				type: 'arrow',
				fromId: inside.id,
				toId: outside.id,
				props: {
					terminal: 'end',
					normalizedAnchor: { x: 0.5, y: 0.5 },
					isExact: false,
					isPrecise: true,
				},
				meta: {},
			}
			const diff = {
				added: { [binding.id]: binding },
				updated: {},
				removed: {},
			}
			history.push({ type: 'action', action, diff, acceptance: 'pending' })
			return { diff, promise: null }
		})

		await expect(
			executeCompanionCanvasToolRequest(
				agent,
				request({
					capabilityId: 'canvas.shape.basic',
					contextRef,
					actions: [
						{
							_type: 'label',
							intent: 'Native util creates an escaped reference',
							shapeId: 'node-1',
							text: 'Changed',
						},
					],
				})
			)
		).rejects.toThrow('outside the explicit selection boundary')

		expect(editor.bailToMark).toHaveBeenCalledWith('companion-history-mark')
		expect(editor.squashToMark).not.toHaveBeenCalled()
		expect(history).toEqual([])
	})

	it('uses the pre-mutation area membership when validating the actual diff', async () => {
		const inside = shape(1, { x: 10, y: 10 })
		const outside = shape(2, { x: 500, y: 500 })
		const { agent, actions, editor, history } = mockAgent({
			selected: [],
			pageShapes: [inside, outside],
			contextItems: [
				{
					type: 'area',
					bounds: { x: 0, y: 0, w: 200, h: 200 },
					source: 'user',
				},
			],
		})
		const inspection = await executeCompanionCanvasToolRequest(
			agent,
			request({ context: 'selection-or-area' })
		)
		const contextRef = (inspection.result as { contextRef: string }).contextRef
		actions.act.mockImplementationOnce((action: unknown) => {
			const before = { ...outside }
			outside.x = 100
			outside.y = 100
			const diff = {
				added: {},
				updated: { [outside.id]: [before, { ...outside }] },
				removed: {},
			}
			history.push({ type: 'action', action, diff, acceptance: 'pending' })
			return { diff, promise: null }
		})

		await expect(
			executeCompanionCanvasToolRequest(
				agent,
				request({
					context: 'selection-or-area',
					capabilityId: 'canvas.shape.basic',
					contextRef,
					actions: [
						{
							_type: 'label',
							intent: 'Native util pulls another shape into the area',
							shapeId: 'node-1',
							text: 'Changed',
						},
					],
				})
			)
		).rejects.toThrow('changed shape:node-2 outside the explicit area boundary')

		expect(editor.bailToMark).toHaveBeenCalledWith('companion-history-mark')
		expect(editor.squashToMark).not.toHaveBeenCalled()
		expect(history).toEqual([])
	})

	it('rejects instruction-only mutation plans and stale context references', async () => {
		const instructionOnly = mockAgent()
		await expect(
			executeCompanionCanvasToolRequest(
				instructionOnly.agent,
				request({
					capabilityId: 'canvas.shape.basic',
					instruction: 'Rename it.',
				})
			)
		).rejects.toThrow('instruction-only execution is disabled')
		expect(instructionOnly.prompt).not.toHaveBeenCalled()

		const stale = mockAgent()
		await expect(
			executeCompanionCanvasToolRequest(
				stale.agent,
				request({
					capabilityId: 'canvas.shape.basic',
					contextRef: 'ctx-v1-stale',
					actions: [
						{
							_type: 'label',
							intent: 'Rename',
							shapeId: 'node-1',
							text: 'Changed',
						},
					],
				})
			)
		).rejects.toThrow('context drifted')
		expect(stale.actions.act).not.toHaveBeenCalled()
	})

	it('rejects direct actions that target shapes outside the explicit selection', async () => {
		const { agent, actions } = mockAgent({
			selected: [shape(1)],
			pageShapes: [shape(1), shape(2)],
		})
		const inspection = await executeCompanionCanvasToolRequest(
			agent,
			request({ contextRef: 'server-context-boundary' })
		)
		const contextRef = (inspection.result as { contextRef: string }).contextRef

		await expect(
			executeCompanionCanvasToolRequest(
				agent,
				request({
					capabilityId: 'canvas.shape.basic',
					contextRef,
					actions: [
						{
							_type: 'label',
							intent: 'Wrong boundary',
							shapeId: 'node-2',
							text: 'No',
						},
					],
				})
			)
		).rejects.toThrow('outside the explicit selection boundary')
		expect(actions.act).not.toHaveBeenCalled()
	})

	it('rejects update-arrow endpoints outside the authorized shape IDs', async () => {
		const arrow = shape(10, { type: 'arrow' })
		const inside = shape(1)
		const outside = shape(2)
		const { agent, actions } = mockAgent({
			selected: [arrow, inside],
			pageShapes: [arrow, inside, outside],
		})
		const inspection = await executeCompanionCanvasToolRequest(agent, request())
		const contextRef = (inspection.result as { contextRef: string }).contextRef

		await expect(
			executeCompanionCanvasToolRequest(
				agent,
				request({
					capabilityId: 'canvas.shape.basic',
					contextRef,
					actions: [
						{
							_type: 'update',
							intent: 'Bind outside the selected IDs',
							update: {
								_type: 'arrow',
								color: 'black',
								fromId: 'node-1',
								note: '',
								shapeId: 'node-10',
								text: '',
								toId: 'node-2',
								x1: 20,
								y1: 20,
								x2: 120,
								y2: 120,
								bend: 0,
							},
						},
					],
				})
			)
		).rejects.toThrow('outside the explicit selection boundary')
		expect(actions.act).not.toHaveBeenCalled()
	})
})
