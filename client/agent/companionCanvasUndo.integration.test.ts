import {
	createShapeId,
	createTLStore,
	defaultBindingUtils,
	defaultShapeTools,
	defaultShapeUtils,
	defaultTools,
	Editor,
	StateNode,
	type TLShapeId,
	type TLStateNodeConstructor,
} from 'tldraw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '../actions/MoveActionUtil'
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

function installMinimalEditorDom() {
	class FakeElement {
		constructor(public ownerDocument: typeof document) {}

		tabIndex = 0
		classList = { add() {}, remove() {} }
		style = {
			setProperty() {},
			removeProperty() {},
			getPropertyValue() {
				return ''
			},
		}

		addEventListener() {}
		removeEventListener() {}
		setAttribute() {}
		removeAttribute() {}
		appendChild() {
			return this
		}
		removeChild() {
			return this
		}
		remove() {}
		focus() {}
		blur() {}
		contains() {
			return true
		}
		getBoundingClientRect() {
			return {
				x: 0,
				y: 0,
				top: 0,
				left: 0,
				width: 1080,
				height: 720,
				bottom: 720,
				right: 1080,
				toJSON: () => ({}),
			}
		}
	}

	const fakeDocument = {
		activeElement: null,
		body: null as unknown as FakeElement,
		documentElement: null as unknown as FakeElement,
		createElement: () => new FakeElement(fakeDocument as unknown as typeof document),
	}
	const body = new FakeElement(fakeDocument as unknown as typeof document)
	fakeDocument.body = body
	fakeDocument.documentElement = body
	vi.stubGlobal('document', fakeDocument)
	const requestAnimationFrame = () => 1
	const cancelAnimationFrame = () => undefined
	vi.stubGlobal('window', {
		devicePixelRatio: 1,
		addEventListener() {},
		removeEventListener() {},
		requestAnimationFrame,
		cancelAnimationFrame,
	})
	vi.stubGlobal('navigator', { userAgent: 'vitest' })
	vi.stubGlobal('requestAnimationFrame', requestAnimationFrame)
	vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrame)
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
	}: {
		tools?: TLStateNodeConstructor[]
		initialState?: string
	} = {}) {
		const shapeUtils = [...defaultShapeUtils]
		const bindingUtils = [...defaultBindingUtils]
		super({
			shapeUtils,
			bindingUtils,
			tools: [...defaultTools, ...defaultShapeTools, ...tools],
			store: createTLStore({ shapeUtils, bindingUtils }),
			getContainer: () => document.createElement('div'),
			initialState,
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

	beforeEach(() => {
		installMinimalEditorDom()
	})

	afterEach(() => {
		editor?.dispose()
		vi.unstubAllGlobals()
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
})

function simpleId(id: TLShapeId) {
	return id.slice('shape:'.length)
}
