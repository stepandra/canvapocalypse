import {
	createShapeId,
	createTLStore,
	defaultAddFontsFromNode,
	defaultBindingUtils,
	defaultShapeTools,
	defaultShapeUtils,
	defaultTools,
	Editor,
	StateNode,
	tipTapDefaultExtensions,
	type TLShapeId,
	type TLStateNodeConstructor,
} from 'tldraw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '../actions/MoveActionUtil'
import { installCanvasExamplesTestDom } from '../canvas-examples/foundations/testEditor'
import { CANVAPOCALYPSE_CANVAS_KIT_COMPOSITION } from '../canvas-studio/host'
import { buildCanvasRuntimeCapabilityCatalog } from '../canvas-studio/runtimeCapabilityCatalog'
import { AgentActionManager } from './managers/AgentActionManager'
import type { TldrawAgent } from './TldrawAgent'
import {
	executeCompanionCanvasToolRequest,
	type CompanionCanvasToolRequest,
} from './companionCanvasTool'

function request(
	overrides: Partial<CompanionCanvasToolRequest> = {}
): CompanionCanvasToolRequest {
	return {
		id: 'amp-undo-integration',
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

/**
 * The package does not publish its internal TestEditor, so keep the harness on
 * the public runtime while preserving TestEditor semantics: a real Editor,
 * real TLStore, and the exact default shape/binding/tool constructors.
 */
class TestEditor extends Editor {
	constructor({
		tools = [],
		initialState = 'select',
		canvasKitRegistrations = false,
	}: {
		tools?: TLStateNodeConstructor[]
		initialState?: string
		canvasKitRegistrations?: boolean
	} = {}) {
		const shapeUtils = [
			...defaultShapeUtils,
			...(canvasKitRegistrations
				? CANVAPOCALYPSE_CANVAS_KIT_COMPOSITION.shapeUtils
				: []),
		]
		const bindingUtils = [
			...defaultBindingUtils,
			...(canvasKitRegistrations
				? CANVAPOCALYPSE_CANVAS_KIT_COMPOSITION.bindingUtils
				: []),
		]
		super({
			shapeUtils,
			bindingUtils,
			tools: [...defaultTools, ...defaultShapeTools, ...tools],
			store: createTLStore({ shapeUtils, bindingUtils }),
			getContainer: () => document.createElement('div'),
			initialState,
			options: {
				text: {
					addFontsFromNode: defaultAddFontsFromNode,
					tipTapConfig: { extensions: tipTapDefaultExtensions },
				},
			},
		})
	}
}

function createAgent(editor: TestEditor) {
	const chatHistory: unknown[] = []
	const agent = {
		editor,
		mode: { getCurrentModeType: () => 'working' },
		chatOrigin: { getOrigin: () => ({ x: 0, y: 0 }) },
		context: { getItems: () => [] },
		chat: {
			getHistory: () => chatHistory,
			update: (updater: (items: unknown[]) => unknown[]) => {
				const next = updater(chatHistory)
				chatHistory.splice(0, chatHistory.length, ...next)
			},
		},
		lints: { trackShapesFromDiff: vi.fn() },
		setIsActingOnEditor: vi.fn(),
		onError: vi.fn(),
	} as unknown as TldrawAgent
	agent.actions = new AgentActionManager(agent)
	return agent
}

describe('companion canvas native undo integration', () => {
	let editor: TestEditor
	let cleanupDom: () => void

	beforeEach(() => {
		cleanupDom = installCanvasExamplesTestDom()
	})

	afterEach(() => {
		editor?.dispose()
		cleanupDom()
	})

	it('squashes a multi-action companion request into one native undo step', async () => {
		editor = new TestEditor()
		const firstId = createShapeId('undo-first')
		const secondId = createShapeId('undo-second')
		editor.run(
			() => {
				editor.createShapes([
					{
						id: firstId,
						type: 'geo',
						x: 0,
						y: 20,
						props: { geo: 'rectangle', w: 80, h: 48 },
					},
					{
						id: secondId,
						type: 'geo',
						x: 200,
						y: 20,
						props: { geo: 'rectangle', w: 80, h: 48 },
					},
				])
			},
			{ history: 'ignore' }
		)

		// Keep a real earlier user edit below the companion transaction. After
		// one undo it must still be present; the next undo must remove it.
		editor.markHistoryStoppingPoint('Before earlier user edit')
		editor.updateShape({ id: firstId, type: 'geo', x: 10 })
		editor.select(firstId, secondId)

		const agent = createAgent(editor)
		const inspection = await executeCompanionCanvasToolRequest(agent, request())
		const contextRef = (inspection.result as { contextRef: string }).contextRef

		const receipt = await executeCompanionCanvasToolRequest(
			agent,
			request({
				capabilityId: 'canvas.shape.basic',
				contextRef,
				actions: [
					{
						_type: 'move',
						intent: 'Move the first selected node',
						anchor: 'top-left',
						shapeId: simpleId(firstId),
						x: 60,
						y: 20,
					},
					{
						_type: 'move',
						intent: 'Move the second selected node',
						anchor: 'top-left',
						shapeId: simpleId(secondId),
						x: 180,
						y: 20,
					},
				],
			})
		)

		expect(receipt).toMatchObject({
			status: 'succeeded',
			result: {
				operationCount: 2,
				actionTypes: ['move', 'move'],
				undoable: true,
			},
		})
		expect(editor.getShape(firstId)?.x).toBe(60)
		expect(editor.getShape(secondId)?.x).toBe(180)

		editor.undo()
		expect(editor.getShape(firstId)?.x).toBe(10)
		expect(editor.getShape(secondId)?.x).toBe(200)

		editor.undo()
		expect(editor.getShape(firstId)?.x).toBe(0)
		expect(editor.getShape(secondId)?.x).toBe(200)
	})

	it('completes an active interaction before marking the companion undo boundary', async () => {
		const earlierEditId = createShapeId('active-completion-edit')
		const companionTargetId = createShapeId('active-companion-target')
		let completionCount = 0

		class ActiveCompletionTool extends StateNode {
			static override id = 'active-completion'

			override onComplete() {
				completionCount += 1
				this.editor.updateShape({
					id: earlierEditId,
					type: 'geo',
					x: 10,
				})
			}
		}

		editor = new TestEditor({
			tools: [ActiveCompletionTool],
			initialState: ActiveCompletionTool.id,
		})
		editor.run(
			() => {
				editor.createShapes([
					{
						id: earlierEditId,
						type: 'geo',
						x: 0,
						y: 20,
						props: { geo: 'rectangle', w: 80, h: 48 },
					},
					{
						id: companionTargetId,
						type: 'geo',
						x: 200,
						y: 20,
						props: { geo: 'rectangle', w: 80, h: 48 },
					},
				])
			},
			{ history: 'ignore' }
		)
		editor.markHistoryStoppingPoint('Before active interaction completion')
		editor.select(companionTargetId)

		const agent = createAgent(editor)
		const inspection = await executeCompanionCanvasToolRequest(agent, request())
		const contextRef = (inspection.result as { contextRef: string }).contextRef
		expect(completionCount).toBe(0)
		await executeCompanionCanvasToolRequest(
			agent,
			request({
				capabilityId: 'canvas.shape.basic',
				contextRef,
				actions: [
					{
						_type: 'move',
						intent: 'Move the selected target',
						anchor: 'top-left',
						shapeId: simpleId(companionTargetId),
						x: 220,
						y: 20,
					},
				],
			})
		)

		expect(completionCount).toBe(1)
		expect(editor.getShape(earlierEditId)?.x).toBe(10)
		expect(editor.getShape(companionTargetId)?.x).toBe(220)

		editor.undo()
		expect(editor.getShape(earlierEditId)?.x).toBe(10)
		expect(editor.getShape(companionTargetId)?.x).toBe(200)

		editor.undo()
		expect(editor.getShape(earlierEditId)?.x).toBe(0)
		expect(editor.getShape(companionTargetId)?.x).toBe(200)
	})

	it('executes the active page preset capability atomically and undoes it once', async () => {
		editor = new TestEditor({ canvasKitRegistrations: true })
		const boundaryId = createShapeId('architecture-insert-boundary')
		editor.run(
			() => {
				editor.createShape({
					id: boundaryId,
					type: 'geo',
					x: 0,
					y: 0,
					props: { geo: 'rectangle', w: 4_000, h: 3_000 },
				})
			},
			{ history: 'ignore' }
		)
		editor.select(boundaryId)
		const runtimeCatalog = buildCanvasRuntimeCapabilityCatalog({
			composition: CANVAPOCALYPSE_CANVAS_KIT_COMPOSITION,
			page: { name: 'Architecture', meta: { lens: 'architecture' } },
			shapeUtils: defaultShapeUtils,
			bindingUtils: defaultBindingUtils,
			tools: [],
		})
		const agent = createAgent(editor)
		const inspection = await executeCompanionCanvasToolRequest(
			agent,
			request({ catalogRevision: runtimeCatalog.catalogRevision }),
			CANVAPOCALYPSE_CANVAS_KIT_COMPOSITION,
			runtimeCatalog
		)
		const contextRef = (inspection.result as { contextRef: string }).contextRef

		const receipt = await executeCompanionCanvasToolRequest(
			agent,
			request({
				capabilityId: 'workbench.architecture.preset.insert',
				catalogRevision: runtimeCatalog.catalogRevision,
				contextRef,
				actions: [
					{
						_type: 'insertPreset',
						presetId: 'workbench.system-context',
					},
				],
			}),
			CANVAPOCALYPSE_CANVAS_KIT_COMPOSITION,
			runtimeCatalog
		)
		const result = receipt.result as {
			shapeIds: TLShapeId[]
			bindingIds: string[]
			undoable: boolean
		}
		expect(result.shapeIds.length).toBeGreaterThan(0)
		expect(result.bindingIds.length).toBeGreaterThan(0)
		expect(result.undoable).toBe(true)
		for (const shapeId of result.shapeIds) expect(editor.getShape(shapeId)).toBeDefined()

		editor.undo()
		expect(editor.getShape(boundaryId)).toBeDefined()
		for (const shapeId of result.shapeIds) expect(editor.getShape(shapeId)).toBeUndefined()
	})
})

function simpleId(id: TLShapeId) {
	return id.slice('shape:'.length)
}
