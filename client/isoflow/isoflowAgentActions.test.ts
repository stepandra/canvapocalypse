import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Editor, TLEmbedShape } from 'tldraw'
import type {
	IsoflowCreateViewAction,
	IsoflowPatchAction,
} from '../../shared/schema/AgentActionSchemas'
import type { IsoflowState } from './isoflowBridge'
import {
	applyIsoflowMutationPreview,
	formatIsoflowOperation,
	previewIsoflowAgentActions,
} from './isoflowAgentActions'

const state: IsoflowState = {
	projectId: 'autorecruit',
	revision: 7,
	model: {
		title: 'AutoRecruit',
		fitToView: true,
		view: 'main',
		views: [
			{
				id: 'main',
				name: 'Main',
				items: [{ id: 'worker', tile: { x: 0, y: 0 } }],
				connectors: [],
				rectangles: [],
				textBoxes: [],
			},
		],
		items: [{ id: 'worker', name: 'Worker' }],
		icons: [],
	},
	updatedAt: '2026-07-24T00:00:00.000Z',
	updatedBy: 'test',
	origin: 'seed',
	summary: 'seed',
}

const shape = {
	id: 'shape:isoflow',
	type: 'embed',
	meta: {
		embedProvider: {
			schema: 'canvapocalypse-embed/v1',
			provider: 'autorecruit_isoflow',
			projectId: 'autorecruit',
			viewId: 'main',
			baseUrl: 'http://127.0.0.1:4174',
		},
	},
} as unknown as TLEmbedShape

const action: IsoflowPatchAction = {
	_type: 'isoflowPatch',
	intent: 'Move the worker',
	dryRun: true,
	operations: [{ op: 'move_item', viewId: 'main', itemId: 'worker', tile: { x: 4, y: 2 } }],
}

function makeEditor(selectedShapes: TLEmbedShape[] = [shape]) {
	return {
		getSelectedShapes: () => selectedShapes,
		getCurrentPageShapes: () => selectedShapes,
		updateShape: vi.fn(),
	} as unknown as Editor
}

afterEach(() => {
	vi.unstubAllGlobals()
})

describe('Isoflow mutation confirmation', () => {
	it('cancels preview work without sending a transaction', async () => {
		const fetchMock = vi.fn(async (_url: string, init: RequestInit = {}) => {
			if (init.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
			return Response.json(state)
		})
		vi.stubGlobal('fetch', fetchMock)
		const controller = new AbortController()
		controller.abort()

		await expect(
			previewIsoflowAgentActions(shape, [action], 'previewer', controller.signal)
		).rejects.toMatchObject({ name: 'AbortError' })
		expect(fetchMock).toHaveBeenCalledTimes(1)
	})

	it('rejects a proposed new view before making a bridge request', async () => {
		const fetchMock = vi.fn()
		vi.stubGlobal('fetch', fetchMock)
		const createView: IsoflowCreateViewAction = {
			_type: 'isoflowCreateView',
			intent: 'Add the arctl path',
			viewId: 'arctl-path',
			name: 'arctl path',
			nodes: [
				{ id: 'arctl', name: 'arctl', x: 1, y: 1 },
				{ id: 'ar-hands', name: 'ar-hands', x: 3, y: 1 },
			],
			connectors: [{ id: 'arctl-to-hands', from: 'arctl', to: 'ar-hands' }],
		}

		await expect(previewIsoflowAgentActions(shape, [createView], 'previewer')).rejects.toThrow(
			'outside the explicitly selected-view contract'
		)
		expect(fetchMock).not.toHaveBeenCalled()
	})

	it('rejects cross-view and project-global operations before making a bridge request', async () => {
		const fetchMock = vi.fn()
		vi.stubGlobal('fetch', fetchMock)
		const crossView: IsoflowPatchAction = {
			...action,
			operations: [
				{
					op: 'move_item',
					viewId: 'other-view',
					itemId: 'worker',
					tile: { x: 1, y: 1 },
				},
			],
		}
		const globalItemMutation: IsoflowPatchAction = {
			...action,
			operations: [{ op: 'rename_item', itemId: 'worker', name: 'Renamed everywhere' }],
		}
		const addGlobalItem: IsoflowPatchAction = {
			...action,
			operations: [
				{
					op: 'add_item',
					viewId: 'main',
					item: {
						id: 'new-global-item',
						name: 'New global item',
						tile: { x: 1, y: 1 },
					},
				},
			],
		}

		await expect(previewIsoflowAgentActions(shape, [crossView], 'previewer')).rejects.toThrow(
			'Cross-view Isoflow operation move_item'
		)
		await expect(
			previewIsoflowAgentActions(shape, [globalItemMutation], 'previewer')
		).rejects.toThrow('outside the explicitly selected-view contract')
		await expect(previewIsoflowAgentActions(shape, [addGlobalItem], 'previewer')).rejects.toThrow(
			'Isoflow operation add_item is outside'
		)
		expect(fetchMock).not.toHaveBeenCalled()
	})

	it('normalizes exact operation parameters', () => {
		expect(formatIsoflowOperation(action.operations[0])).toBe(
			'{"itemId":"worker","op":"move_item","tile":{"x":4,"y":2},"viewId":"main"}'
		)
	})

	it('rejects an oversized normalized operation before making a bridge request', async () => {
		const fetchMock = vi.fn()
		vi.stubGlobal('fetch', fetchMock)
		const oversized: IsoflowPatchAction = {
			...action,
			operations: [
				{
					op: 'add_text_box',
					viewId: 'main',
					textBox: { id: 'oversized', text: 'x'.repeat(2_100) },
				},
			],
		}

		await expect(previewIsoflowAgentActions(shape, [oversized], 'previewer')).rejects.toThrow(
			'exceeds 2000 normalized characters'
		)
		expect(fetchMock).not.toHaveBeenCalled()
	})

	it('bounds single and aggregate intent text before making a bridge request', async () => {
		const fetchMock = vi.fn()
		vi.stubGlobal('fetch', fetchMock)
		const oversizedIntent: IsoflowPatchAction = {
			...action,
			intent: 'x'.repeat(501),
		}
		await expect(previewIsoflowAgentActions(shape, [oversizedIntent], 'previewer')).rejects.toThrow(
			'intent exceeds 500 characters'
		)

		const aggregateIntents = Array.from({ length: 45 }, (_, index) => ({
			...action,
			intent: `${index}:${'x'.repeat(448)}`,
		}))
		await expect(previewIsoflowAgentActions(shape, aggregateIntents, 'previewer')).rejects.toThrow(
			'proposal exceeds 20000 normalized characters'
		)
		expect(fetchMock).not.toHaveBeenCalled()
	})

	it('dry-runs first, then applies the exact operations at the captured revision without refetching', async () => {
		const requests: Array<{ method: string; body?: Record<string, unknown> }> = []
		vi.stubGlobal(
			'fetch',
			vi.fn(async (_url: string, init: RequestInit = {}) => {
				const method = init.method ?? 'GET'
				const body = init.body ? JSON.parse(String(init.body)) : undefined
				requests.push({ method, body })
				return Response.json(method === 'GET' ? state : { ...state, revision: 8 })
			})
		)

		const preview = await previewIsoflowAgentActions(shape, [action], 'previewer')
		expect(preview.baseRevision).toBe(7)
		expect(preview.expectedRevision).toBe(8)
		expect(preview.digest).toMatch(/^[a-f0-9]{64}$/)
		expect(requests[1]).toMatchObject({
			method: 'POST',
			body: { baseRevision: 7, dryRun: true, operations: action.operations },
		})

		const editor = makeEditor()
		await applyIsoflowMutationPreview(editor, shape, preview, preview.digest, 'operator')

		expect(requests).toHaveLength(3)
		expect(requests[2]).toMatchObject({
			method: 'POST',
			body: {
				baseRevision: 7,
				dryRun: false,
				operations: action.operations,
				idempotencyKey: `canvapocalypse:${preview.digest}`,
			},
		})
	})

	it('rejects a changed proposal before sending an apply request', async () => {
		const fetchMock = vi.fn(async (_url: string, init: RequestInit = {}) =>
			Response.json(init.method ? { ...state, revision: 8 } : state)
		)
		vi.stubGlobal('fetch', fetchMock)

		const preview = await previewIsoflowAgentActions(shape, [action], 'previewer')
		const changed = structuredClone(preview)
		changed.operations[0] = {
			op: 'move_item',
			viewId: 'main',
			itemId: 'worker',
			tile: { x: 99, y: 99 },
		}

		await expect(
			applyIsoflowMutationPreview(makeEditor(), shape, changed, preview.digest, 'operator')
		).rejects.toThrow('preview changed')
		expect(fetchMock).toHaveBeenCalledTimes(2)
	})

	it('requires the same unique selection and rechecks view scope at confirmation', async () => {
		const fetchMock = vi.fn(async (_url: string, init: RequestInit = {}) =>
			Response.json(init.method ? { ...state, revision: 8 } : state)
		)
		vi.stubGlobal('fetch', fetchMock)

		const preview = await previewIsoflowAgentActions(shape, [action], 'previewer')
		await expect(
			applyIsoflowMutationPreview(makeEditor([]), shape, preview, preview.digest, 'operator')
		).rejects.toThrow('Select exactly one matching Isoflow embed')

		const crossView = structuredClone(preview)
		crossView.operations[0] = {
			op: 'move_item',
			viewId: 'other-view',
			itemId: 'worker',
			tile: { x: 4, y: 2 },
		}
		await expect(
			applyIsoflowMutationPreview(makeEditor(), shape, crossView, preview.digest, 'operator')
		).rejects.toThrow('Cross-view Isoflow operation move_item')
		expect(fetchMock).toHaveBeenCalledTimes(2)
	})

	it('rechecks selected-target authority after digesting and before apply IO', async () => {
		const fetchMock = vi.fn(async (_url: string, init: RequestInit = {}) =>
			Response.json(init.method ? { ...state, revision: 8 } : state)
		)
		vi.stubGlobal('fetch', fetchMock)
		const preview = await previewIsoflowAgentActions(shape, [action], 'previewer')
		const selectedShapes = [shape]
		const digest = installDeferredDigest()

		const applying = applyIsoflowMutationPreview(
			makeEditor(selectedShapes),
			shape,
			preview,
			preview.digest,
			'operator'
		)
		await digest.started
		selectedShapes.splice(0)
		digest.release()

		await expect(applying).rejects.toThrow('Select exactly one matching Isoflow embed')
		expect(fetchMock).toHaveBeenCalledTimes(2)
	})

	it('rechecks the selected project and view after digesting and before apply IO', async () => {
		const fetchMock = vi.fn(async (_url: string, init: RequestInit = {}) =>
			Response.json(init.method ? { ...state, revision: 8 } : state)
		)
		vi.stubGlobal('fetch', fetchMock)
		const preview = await previewIsoflowAgentActions(shape, [action], 'previewer')
		const changedView = structuredClone(shape)
		;(changedView.meta as any).embedProvider.viewId = 'other-view'
		const selectedShapes = [shape]
		const digest = installDeferredDigest()

		const applying = applyIsoflowMutationPreview(
			makeEditor(selectedShapes),
			shape,
			preview,
			preview.digest,
			'operator'
		)
		await digest.started
		selectedShapes[0] = changedView
		digest.release()

		await expect(applying).rejects.toThrow('target changed after preview')
		expect(fetchMock).toHaveBeenCalledTimes(2)
	})

	it('applies an immutable operation and revision snapshot when the supplied preview changes during digesting', async () => {
		const requests: Array<{ method: string; body?: Record<string, unknown> }> = []
		vi.stubGlobal(
			'fetch',
			vi.fn(async (_url: string, init: RequestInit = {}) => {
				const method = init.method ?? 'GET'
				const body = init.body ? JSON.parse(String(init.body)) : undefined
				requests.push({ method, body })
				return Response.json(method === 'GET' ? state : { ...state, revision: 8 })
			})
		)
		const preview = structuredClone(await previewIsoflowAgentActions(shape, [action], 'previewer'))
		const digest = installDeferredDigest()

		const applying = applyIsoflowMutationPreview(
			makeEditor(),
			shape,
			preview,
			preview.digest,
			'operator'
		)
		await digest.started
		preview.operations[0] = {
			op: 'move_item',
			viewId: 'main',
			itemId: 'worker',
			tile: { x: 99, y: 99 },
		}
		preview.baseRevision = 99
		digest.release()
		await applying

		expect(requests[2]).toMatchObject({
			method: 'POST',
			body: { baseRevision: 7, operations: action.operations },
		})
	})

	it('surfaces a revision conflict without refetching or retrying', async () => {
		const fetchMock = vi.fn(async (_url: string, init: RequestInit = {}) => {
			if (!init.method) return Response.json(state)
			const body = JSON.parse(String(init.body)) as { dryRun: boolean }
			if (body.dryRun) return Response.json({ ...state, revision: 8 })
			return Response.json({ error: 'revision_conflict' }, { status: 409 })
		})
		vi.stubGlobal('fetch', fetchMock)

		const preview = await previewIsoflowAgentActions(shape, [action], 'previewer')
		await expect(
			applyIsoflowMutationPreview(makeEditor(), shape, preview, preview.digest, 'operator')
		).rejects.toThrow('revision_conflict')
		expect(fetchMock).toHaveBeenCalledTimes(3)
	})
})

function installDeferredDigest() {
	const originalSubtle = globalThis.crypto.subtle
	const originalDigest = originalSubtle.digest.bind(originalSubtle)
	let release!: () => void
	let markStarted!: () => void
	const gate = new Promise<void>((resolve) => {
		release = resolve
	})
	const started = new Promise<void>((resolve) => {
		markStarted = resolve
	})
	vi.stubGlobal('crypto', {
		subtle: {
			digest: async (algorithm: AlgorithmIdentifier, data: BufferSource) => {
				markStarted()
				await gate
				return originalDigest(algorithm, data)
			},
		},
	})
	return { release, started }
}
