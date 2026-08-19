import { Box } from 'tldraw'
import { describe, expect, it, vi } from 'vitest'
import type { CanvasRuntimeCapabilityCatalog } from '../canvas-studio/runtimeCapabilityCatalog'
import { createCanvapocalypseCanvasKitComposition } from '../canvas-studio/host'
import { createMarkdownDocumentInput } from '../markdown/MarkdownDocumentShape'
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

function runtimeCatalog(
	catalogRevision: string,
	shapeTypes: readonly string[]
): CanvasRuntimeCapabilityCatalog {
	return {
		schema: 'canvas-studio-runtime-capabilities/v1',
		version: 1,
		catalogRevision,
		surface: 'tldraw',
		pageMode: 'architecture',
		contextPolicies: ['selection', 'selection-or-area'],
		registrations: {
			shapeTypes: shapeTypes.map((id) => ({ id, owner: 'canvapocalypse.host' })),
			bindingTypes: [],
			toolIds: [],
			recordTypes: [],
		},
		kits: [],
		capabilities: [],
	}
}

function markdownRuntimeCatalog(catalogRevision = 'catalog-architecture-markdown') {
	const composition = createCanvapocalypseCanvasKitComposition()
	const capability = composition.getAgentCapability('canvas.markdown.read')
	if (!capability) throw new Error('Markdown capability is not registered')
	return {
		composition,
		catalog: {
			...runtimeCatalog(catalogRevision, ['geo', 'markdown-document']),
			kits: [
				{
					id: 'canvas.markdown',
					title: 'Markdown documents',
					tags: ['markdown'],
					presets: [],
					capabilityIds: ['canvas.markdown.read'],
				},
			],
			capabilities: [structuredClone(capability.descriptor)],
		} satisfies CanvasRuntimeCapabilityCatalog,
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
		return new Box(
			typeof current?.x === 'number' ? current.x : index * 10,
			typeof current?.y === 'number' ? current.y : index * 10,
			props?.w ?? 80,
			props?.h ?? 48
		)
	})
	const editor = {
		store: {
			query: { records: vi.fn(() => ({ get: () => [] })) },
			extractingChanges: vi.fn((callback: () => void) => {
				callback()
				return { added: {}, updated: {}, removed: {} }
			}),
		},
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
		getCurrentPageId: vi.fn(() => 'page:page'),
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

	it('projects only selected records without leaking in-bounds or peripheral page context', async () => {
		const selected = shape(1, {
			x: 0,
			y: 0,
			meta: { note: 'Authorization: Bearer secret-inspection-token' },
			props: {
				w: 200,
				h: 200,
				geo: 'rectangle',
				color: 'black',
				fill: 'none',
				align: 'middle',
				richText: { type: 'doc', content: [{ type: 'private-node' }] },
			},
		})
		const inside = shape(2, {
			x: 20,
			y: 20,
			label: 'Bearer blurry-secret-token',
			props: { w: 40, h: 40, geo: 'ellipse' },
		})
		const far = shape(3, {
			x: 1_000,
			y: 1_000,
			props: { w: 80, h: 48, geo: 'rectangle' },
		})
		const { agent } = mockAgent({
			selected: [selected],
			pageShapes: [selected, inside, far],
		})

		const receipt = await executeCompanionCanvasToolRequest(agent, request())
		const result = receipt.result as {
			version: number
			contextRef: string
			focused: Array<Record<string, unknown>>
			blurry: Array<Record<string, unknown>>
			peripheral: Array<Record<string, unknown>>
			shapes?: unknown
		}

		expect(result.version).toBe(2)
		expect(result.contextRef).toMatch(/^ctx-v1-[0-9a-f]{8}$/)
		expect(result.shapes).toBeUndefined()
		expect(result.focused).toHaveLength(1)
		expect(result.focused[0]).toMatchObject({
			_type: 'rectangle',
			shapeId: 'node-1',
		})
		expect(result.blurry).toEqual([])
		expect(result.peripheral).toEqual([])
		expect(JSON.stringify(result)).not.toContain('secret-inspection-token')
		expect(JSON.stringify(result)).not.toContain('blurry-secret-token')
		expect(JSON.stringify(result)).not.toContain('richText')
	})

	it('returns at most 24 projected shapes without raw metadata, screenshots, or local paths', async () => {
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
			focused: Array<Record<string, unknown>>
			blurry: Array<Record<string, unknown>>
			peripheral: Array<Record<string, unknown>>
			truncated: boolean
		}

		expect(result.focused).toEqual([])
		expect(result.blurry).toHaveLength(24)
		expect(result.peripheral).toEqual([])
		expect(result.truncated).toBe(true)
		expect(result.contextRef).toMatch(/^ctx-v1-/)
		expect(JSON.stringify(result)).not.toContain('must-not-leak')
		expect(JSON.stringify(result)).not.toContain('workbench')
		expect(JSON.stringify(result)).not.toContain('relationId')
		expect(JSON.stringify(result)).not.toContain('/Users/')
		expect(JSON.stringify(result)).not.toContain('screenshot')
	})

	it('hashes every selected shape, including those omitted from the focused projection', async () => {
		const shapes = Array.from({ length: 30 }, (_, index) => shape(index + 1))
		const { agent, actions } = mockAgent({
			selected: shapes,
			pageShapes: shapes,
		})
		const inspection = await executeCompanionCanvasToolRequest(agent, request())
		const result = inspection.result as {
			focused: unknown[]
			truncated: boolean
			contextRef: string
		}

		expect(result.focused).toHaveLength(24)
		expect(result.truncated).toBe(true)

		shapes[29].x += 1

		await expect(
			executeCompanionCanvasToolRequest(
				agent,
				request({
					capabilityId: 'canvas.shape.basic',
					contextRef: result.contextRef,
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

	it('projects an in-bounds custom shape as unknown with its subtype', async () => {
		const custom = shape(4, {
			type: 'workflow-node',
			x: 30,
			y: 30,
			props: { w: 40, h: 40 },
		})
		const { agent } = mockAgent({
			selected: [custom],
			pageShapes: [custom],
		})

		const receipt = await executeCompanionCanvasToolRequest(agent, request())
		const result = receipt.result as {
			focused: Array<Record<string, unknown>>
			blurry: Array<Record<string, unknown>>
		}

		expect(result.focused[0]).toMatchObject({
			_type: 'unknown',
			subType: 'workflow-node',
			shapeId: 'node-4',
		})
		expect(result.blurry).toEqual([])
	})

	it('projects only shape types disclosed by the active page catalog', async () => {
		const architectureShape = shape(1, {
			props: { w: 80, h: 48, geo: 'rectangle' },
		})
		const productShape = shape(2, {
			type: 'workflow-node',
			props: { w: 80, h: 48 },
		})
		const { agent } = mockAgent({
			selected: [architectureShape, productShape],
			pageShapes: [architectureShape, productShape],
		})
		const catalog = runtimeCatalog('catalog-architecture', ['geo'])

		const receipt = await executeCompanionCanvasToolRequest(
			agent,
			request({ catalogRevision: catalog.catalogRevision }),
			undefined,
			catalog
		)
		const result = receipt.result as { focused: Array<{ shapeId: string }> }

		expect(result.focused.map(({ shapeId }) => shapeId)).toEqual(['node-1'])
		expect(JSON.stringify(result)).not.toContain('workflow-node')
	})

	it('rejects an old page manifest after the active catalog revision changes', async () => {
		const { agent } = mockAgent()
		const catalog = runtimeCatalog('catalog-product', ['geo'])

		await expect(
			executeCompanionCanvasToolRequest(
				agent,
				request({ catalogRevision: 'catalog-architecture' }),
				undefined,
				catalog
			)
		).rejects.toThrow('catalog is stale')
	})

	it('invalidates an inspected context when the active page catalog changes', async () => {
		const { agent, actions } = mockAgent()
		const architecture = runtimeCatalog('catalog-architecture', ['geo'])
		const product = runtimeCatalog('catalog-product', ['geo'])
		const inspection = await executeCompanionCanvasToolRequest(
			agent,
			request({ catalogRevision: architecture.catalogRevision }),
			undefined,
			architecture
		)
		const contextRef = (inspection.result as { contextRef: string }).contextRef

		await expect(
			executeCompanionCanvasToolRequest(
				agent,
				request({
					capabilityId: 'canvas.shape.basic',
					catalogRevision: product.catalogRevision,
					contextRef,
					actions: [
						{
							_type: 'label',
							intent: 'Change a visible shape',
							shapeId: 'node-1',
							text: 'Changed',
						},
					],
				}),
				undefined,
				product
			)
		).rejects.toThrow('capability catalog drifted')
		expect(actions.act).not.toHaveBeenCalled()
	})

	it('redacts api keys and passwords from projected text', async () => {
		const selected = shape(1, {
			label: 'api_key=sk-live-super-secret',
			props: { w: 80, h: 48, geo: 'rectangle' },
		})
		const inside = shape(2, {
			label: 'password=hunter2',
			x: 20,
			y: 20,
			props: { w: 40, h: 40, geo: 'ellipse' },
		})
		const { agent } = mockAgent({
			selected: [selected],
			pageShapes: [selected, inside],
		})

		const receipt = await executeCompanionCanvasToolRequest(agent, request())
		const dumped = JSON.stringify(receipt.result)

		expect(dumped).not.toContain('sk-live-super-secret')
		expect(dumped).not.toContain('hunter2')
		expect(dumped).not.toContain('password=')
		expect(dumped).not.toContain('api_key=')
	})

	it('returns selected Markdown as a bounded semantic document projection', async () => {
		const markdown = '# Architecture\n\nUse an event bus.'
		const input = createMarkdownDocumentInput(markdown, 'architecture.md', {
			documentRef: 'markdown-architecture-context',
			title: 'Architecture constraints',
		})
		const selected = shape(1, {
			type: 'markdown-document',
			props: {
				...input,
				w: 520,
				h: 68,
				collapsed: true,
				expandedH: 460,
			},
		})
		const { agent } = mockAgent({ selected: [selected], pageShapes: [selected] })

		const receipt = await executeCompanionCanvasToolRequest(agent, request())
		const result = receipt.result as {
			focused: Array<Record<string, unknown>>
		}

		expect(result.focused).toEqual([
			expect.objectContaining({
				_type: 'markdown-document',
				title: 'Architecture constraints',
				documentRef: 'markdown-architecture-context',
					revision: input.revision,
					bytes: input.bytes,
				sourceName: 'architecture.md',
				readCapability: 'canvas.markdown.read',
			}),
		])
		expect(JSON.stringify(result)).not.toContain(markdown)
	})

	it('rejects a semantic read when Markdown content no longer matches its revision metadata', async () => {
		const input = createMarkdownDocumentInput('# Original', 'architecture.md', {
			documentRef: 'markdown-architecture-integrity',
		})
		const selected = shape(1, {
			type: 'markdown-document',
			props: {
				...input,
				markdown: '# Modified without a revision',
				w: 520,
				h: 68,
				collapsed: true,
				expandedH: 460,
			},
		})
		const { agent } = mockAgent({ selected: [selected], pageShapes: [selected] })
		const { composition, catalog } = markdownRuntimeCatalog()
		const inspection = await executeCompanionCanvasToolRequest(
			agent,
			request({ catalogRevision: catalog.catalogRevision }),
			composition,
			catalog
		)
		const contextRef = (inspection.result as { contextRef: string }).contextRef

		await expect(
			executeCompanionCanvasToolRequest(
				agent,
				request({
					id: 'markdown-read-integrity',
					capabilityId: 'canvas.markdown.read',
					catalogRevision: catalog.catalogRevision,
					contextRef,
					actions: [
						{
							_type: 'readMarkdownChunk',
							shapeId: 'node-1',
							documentRef: input.documentRef,
							revision: input.revision,
						},
					],
				}),
				composition,
				catalog
			)
		).rejects.toThrow('content does not match its revision metadata')
	})

	it('reads selected Markdown in revision-bound chunks and invalidates stale cursors', async () => {
		const markdown = `# Architecture\n\n${'event-driven constraints '.repeat(500)}`
		const input = createMarkdownDocumentInput(markdown, '/Users/example/Vault/architecture.md', {
			documentRef: 'markdown-architecture-chunks',
			title: 'Architecture constraints',
		})
		const selected = shape(1, {
			type: 'markdown-document',
			props: {
				...input,
				w: 520,
				h: 68,
				collapsed: true,
				expandedH: 460,
			},
		})
		const { agent } = mockAgent({ selected: [selected], pageShapes: [selected] })
		const { composition, catalog } = markdownRuntimeCatalog()
		const inspection = await executeCompanionCanvasToolRequest(
			agent,
			request({ catalogRevision: catalog.catalogRevision }),
			composition,
			catalog
		)
		const contextRef = (inspection.result as { contextRef: string }).contextRef
		const first = await executeCompanionCanvasToolRequest(
			agent,
			request({
				id: 'markdown-read-1',
				capabilityId: 'canvas.markdown.read',
				catalogRevision: catalog.catalogRevision,
				contextRef,
				actions: [
					{
						_type: 'readMarkdownChunk',
						shapeId: 'node-1',
						documentRef: input.documentRef,
						revision: input.revision,
						maxBytes: 1024,
					},
				],
			}),
			composition,
			catalog
		)
		const firstResult = first.result as {
			text: string
			nextCursor: string
			byteRange: { start: number; end: number }
			revision: string
		}
		expect(firstResult.byteRange).toEqual({ start: 0, end: 1024 })
		expect(firstResult.revision).toBe(input.revision)
		expect(JSON.stringify(firstResult)).not.toContain('/Users/')

		const second = await executeCompanionCanvasToolRequest(
			agent,
			request({
				id: 'markdown-read-2',
				capabilityId: 'canvas.markdown.read',
				catalogRevision: catalog.catalogRevision,
				contextRef,
				actions: [
					{
						_type: 'readMarkdownChunk',
						shapeId: 'node-1',
						documentRef: input.documentRef,
						revision: input.revision,
						cursor: firstResult.nextCursor,
						maxBytes: 1024,
					},
				],
			}),
			composition,
			catalog
		)
		const secondResult = second.result as {
			text: string
			nextCursor: string
			byteRange: { start: number; end: number }
		}
		expect(secondResult.byteRange.start).toBe(firstResult.byteRange.end)
		expect(firstResult.text + secondResult.text).toBe(
			markdown.slice(0, firstResult.text.length + secondResult.text.length)
		)

		const refreshed = createMarkdownDocumentInput(`${markdown}\nChanged`, 'architecture.md', {
			documentRef: input.documentRef,
		})
		Object.assign(selected.props, refreshed)
		const refreshedInspection = await executeCompanionCanvasToolRequest(
			agent,
			request({ id: 'markdown-inspect-refreshed', catalogRevision: catalog.catalogRevision }),
			composition,
			catalog
		)
		const refreshedContextRef = (refreshedInspection.result as { contextRef: string }).contextRef
		await expect(
			executeCompanionCanvasToolRequest(
				agent,
				request({
					id: 'markdown-read-stale-cursor',
					capabilityId: 'canvas.markdown.read',
					catalogRevision: catalog.catalogRevision,
					contextRef: refreshedContextRef,
					actions: [
						{
							_type: 'readMarkdownChunk',
							shapeId: 'node-1',
							documentRef: refreshed.documentRef,
							revision: refreshed.revision,
							cursor: secondResult.nextCursor,
						},
					],
				}),
				composition,
				catalog
			)
		).rejects.toThrow('cursor is stale')
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

	it('allows deleting the selected shape to clear only that id from instance page state', async () => {
		const target = shape(1)
		const pageShapes = [target]
		const { agent, actions, editor, history } = mockAgent({ selected: [target], pageShapes })
		const inspection = await executeCompanionCanvasToolRequest(agent, request())
		const contextRef = (inspection.result as { contextRef: string }).contextRef
		actions.act.mockImplementationOnce(((action: unknown) => {
			const beforePageState = {
				id: 'instance_page_state:page:page',
				typeName: 'instance_page_state',
				pageId: 'page:page',
				selectedShapeIds: [target.id],
				focusedGroupId: null,
				meta: {},
			}
			const afterPageState = { ...beforePageState, selectedShapeIds: [] }
			pageShapes.splice(0, 1)
			const diff = {
				added: {},
				updated: { [beforePageState.id]: [beforePageState, afterPageState] },
				removed: { [target.id]: target },
			}
			history.push({ type: 'action', action, diff, acceptance: 'pending' })
			return { diff, promise: null }
		}) as unknown as Parameters<typeof actions.act.mockImplementationOnce>[0])

		const receipt = await executeCompanionCanvasToolRequest(
			agent,
			request({
				capabilityId: 'canvas.shape.basic',
				contextRef,
				actions: [
					{
						_type: 'delete',
						intent: 'Delete the explicitly selected shape',
						shapeId: 'node-1',
					},
				],
			})
		)

		expect(editor.bailToMark).not.toHaveBeenCalled()
		expect(editor.squashToMark).toHaveBeenCalledWith('companion-history-mark')
		expect(receipt).toMatchObject({
			status: 'succeeded',
			result: { shapeIds: ['shape:node-1'], undoable: true },
		})
	})

	it('rejects unrelated instance page state changes during a selected-shape deletion', async () => {
		const target = shape(1)
		const pageShapes = [target]
		const { agent, actions, editor, history } = mockAgent({ selected: [target], pageShapes })
		const inspection = await executeCompanionCanvasToolRequest(agent, request())
		const contextRef = (inspection.result as { contextRef: string }).contextRef
		actions.act.mockImplementationOnce(((action: unknown) => {
			const beforePageState = {
				id: 'instance_page_state:page:page',
				typeName: 'instance_page_state',
				pageId: 'page:page',
				selectedShapeIds: [target.id],
				focusedGroupId: null,
				meta: {},
			}
			const afterPageState = {
				...beforePageState,
				selectedShapeIds: [],
				focusedGroupId: 'shape:unauthorized-group',
			}
			pageShapes.splice(0, 1)
			const diff = {
				added: {},
				updated: { [beforePageState.id]: [beforePageState, afterPageState] },
				removed: { [target.id]: target },
			}
			history.push({ type: 'action', action, diff, acceptance: 'pending' })
			return { diff, promise: null }
		}) as unknown as Parameters<typeof actions.act.mockImplementationOnce>[0])

		await expect(
			executeCompanionCanvasToolRequest(
				agent,
				request({
					capabilityId: 'canvas.shape.basic',
					contextRef,
					actions: [
						{
							_type: 'delete',
							intent: 'Delete the explicitly selected shape',
							shapeId: 'node-1',
						},
					],
				})
			)
		).rejects.toThrow('updated unexpected instance_page_state')

		expect(editor.bailToMark).toHaveBeenCalledWith('companion-history-mark')
		expect(editor.squashToMark).not.toHaveBeenCalled()
		expect(history).toEqual([])
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
		const arrow = shape(10, {
			type: 'arrow',
			props: {
				w: 80,
				h: 48,
				start: { x: 0, y: 0 },
				end: { x: 80, y: 48 },
				bend: 0,
				color: 'black',
			},
		})
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
