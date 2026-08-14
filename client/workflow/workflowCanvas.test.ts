import {
	createShapeId,
	createTLStore,
	defaultBindingUtils,
	defaultShapeTools,
	defaultShapeUtils,
	defaultTools,
	Editor,
	type TLShapeId,
	type TLStateNodeConstructor,
} from 'tldraw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
	WorkflowNodeShapeUtil,
	WORKFLOW_NODE_SHAPE_TYPE,
} from './WorkflowNodeShape'
import {
	WorkflowRichOutputShapeUtil,
	WORKFLOW_RICH_OUTPUT_SHAPE_TYPE,
} from './RichOutputShape'
import {
	configureLlmModelSet,
	getWorkflowNodeMeta,
	installPromptExperimentWorkflow,
	isWorkflowEdge,
	isWorkflowNode,
	layoutWorkflowOnCanvas,
	readWorkflowSpec,
} from './workflowCanvas'
import { buildPromptExperimentWorkflowSpec } from '../../shared/workflow'

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

class TestEditor extends Editor {
	constructor({
		tools = [],
		initialState = 'select',
	}: {
		tools?: TLStateNodeConstructor[]
		initialState?: string
	} = {}) {
		const shapeUtils = [
			...defaultShapeUtils,
			WorkflowNodeShapeUtil,
			WorkflowRichOutputShapeUtil,
		]
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

function findShapeByNodeId(editor: TestEditor, workflowId: string, nodeId: string) {
	return editor
		.getCurrentPageShapes()
		.filter(isWorkflowNode)
		.find((shape) => {
			const meta = getWorkflowNodeMeta(shape)
			return meta.workflowId === workflowId && meta.nodeId === nodeId
		})
}

function findIncomingEdge(
	editor: TestEditor,
	workflowId: string,
	toNodeId: string,
	fromNodeId: string
) {
	return editor
		.getCurrentPageShapes()
		.filter(isWorkflowEdge)
		.find((shape) => {
			const meta = shape.meta.workflowEdge as unknown as {
				workflowId: string
				fromNodeId: string
				toNodeId: string
			}
			return (
				meta.workflowId === workflowId &&
				meta.fromNodeId === fromNodeId &&
				meta.toNodeId === toNodeId
			)
		})
}

describe('installPromptExperimentWorkflow', () => {
	let editor: TestEditor

	beforeEach(() => {
		installMinimalEditorDom()
		editor = new TestEditor()
	})

	afterEach(() => {
		editor.dispose()
		vi.unstubAllGlobals()
	})

	it('creates a prompt experiment workflow on the canvas', () => {
		const { workflowId, created } = installPromptExperimentWorkflow(editor)
		expect(created).toBe(true)
		expect(workflowId).toMatch(/^prompt-experiment-\d+$/)

		const spec = readWorkflowSpec(editor, workflowId)
		expect(spec.nodes.map((node) => node.kind)).toEqual([
			'input',
			'prompt-template',
			'llm',
			'rich-output',
		])
		expect(spec.nodes[0].id).toBe('seed-input')
	})
})

describe('configureLlmModelSet', () => {
	let editor: TestEditor

	beforeEach(() => {
		installMinimalEditorDom()
		editor = new TestEditor()
	})

	afterEach(() => {
		editor.dispose()
		vi.unstubAllGlobals()
	})

	it('rejects non-LLM and readonly shapes', () => {
		installPromptExperimentWorkflow(editor)
		const workflowId = editor
			.getCurrentPageShapes()
			.filter(isWorkflowNode)
			.find((shape) => getWorkflowNodeMeta(shape).nodeId === 'seed-input')!
		const seedShape = findShapeByNodeId(
			editor,
			getWorkflowNodeMeta(workflowId).workflowId,
			'seed-input'
		)!
		expect(() =>
			configureLlmModelSet(editor, seedShape, [
				{ provider: 'builtin', model: 'claude-sonnet-4-5' },
			])
		).toThrow(/editable LLM node/)
	})

	it('configures the source node as the first target and branches the rest', () => {
		const { workflowId } = installPromptExperimentWorkflow(editor)
		const sourceShape = findShapeByNodeId(editor, workflowId, 'llm')!

		const result = configureLlmModelSet(editor, sourceShape, [
			{ provider: 'openrouter', model: 'openai/gpt-4.1-mini', baseUrl: 'https://openrouter.ai/api/v1' },
			{ provider: 'openrouter', model: 'anthropic/claude-3.5-sonnet' },
			{ provider: 'compatible', model: 'llama3.2', baseUrl: 'http://127.0.0.1:11434/v1' },
		])

		expect(result.branchIds).toHaveLength(3)
		expect(result.branchCount).toBe(3)

		const spec = readWorkflowSpec(editor, workflowId)
		const llmNodes = spec.nodes.filter((node) => node.kind === 'llm')
		expect(llmNodes).toHaveLength(3)

		expect(llmNodes[0].config).toMatchObject({
			provider: 'openrouter',
			model: 'openai/gpt-4.1-mini',
			baseUrl: 'https://openrouter.ai/api/v1',
		})
		expect(llmNodes[1].config).toMatchObject({
			provider: 'openrouter',
			model: 'anthropic/claude-3.5-sonnet',
		})
		expect(llmNodes[2].config).toMatchObject({
			provider: 'compatible',
			model: 'llama3.2',
			baseUrl: 'http://127.0.0.1:11434/v1',
		})

		const promptShape = findShapeByNodeId(editor, workflowId, 'prompt-template')!
		for (const llm of llmNodes) {
			const edge = findIncomingEdge(editor, workflowId, llm.id, 'prompt-template')
			expect(edge).toBeTruthy()
		}
	})

	it('auto-layouts parallel model branches deterministically in DAG columns', () => {
		const { workflowId } = installPromptExperimentWorkflow(editor)
		const sourceShape = findShapeByNodeId(editor, workflowId, 'llm')!
		configureLlmModelSet(editor, sourceShape, [
			{ provider: 'compatible', model: 'mock-alpha', baseUrl: 'http://127.0.0.1:11434/v1' },
			{ provider: 'compatible', model: 'mock-beta', baseUrl: 'http://127.0.0.1:11434/v1' },
		])

		const getWorkflowShapes = () =>
			editor
				.getCurrentPageShapes()
				.filter(isWorkflowNode)
				.filter((shape) => getWorkflowNodeMeta(shape).workflowId === workflowId)
		const workflowShapes = getWorkflowShapes()
		const byKind = (kind: string) => workflowShapes.filter((shape) => getWorkflowNodeMeta(shape).kind === kind)
		const llms = byKind('llm').sort((a, b) => a.y - b.y)
		const outputs = byKind('rich-output').sort((a, b) => a.y - b.y)
		const prompt = byKind('prompt-template')[0]

		expect(llms).toHaveLength(2)
		expect(outputs).toHaveLength(2)
		expect(llms[0].x).toBe(llms[1].x)
		expect(outputs[0].x).toBe(outputs[1].x)
		expect(llms[0].y).toBeLessThan(llms[1].y)
		expect(outputs[0].y).toBeLessThan(outputs[1].y)
		expect(prompt.x).toBeLessThan(llms[0].x)
		expect(llms[0].x).toBeLessThan(outputs[0].x)
		expect(workflowShapes.every((shape) => shape.parentId === editor.getCurrentPageId())).toBe(true)

		const before = new Map(workflowShapes.map((shape) => [shape.id, { x: shape.x, y: shape.y }]))
		layoutWorkflowOnCanvas(editor, workflowId)
		for (const shape of getWorkflowShapes()) {
			expect({ x: shape.x, y: shape.y }).toEqual(before.get(shape.id))
		}
	})

	it('deduplicates identical provider/model/base-url targets', () => {
		const { workflowId } = installPromptExperimentWorkflow(editor)
		const sourceShape = findShapeByNodeId(editor, workflowId, 'llm')!
		const result = configureLlmModelSet(editor, sourceShape, [
			{ provider: 'compatible', model: 'same-model', baseUrl: 'http://127.0.0.1:11434/v1' },
			{ provider: 'compatible', model: 'same-model', baseUrl: 'http://127.0.0.1:11434/v1/' },
			{ provider: 'compatible', model: 'other-model', baseUrl: 'http://127.0.0.1:11434/v1' },
		])
		expect(result.branchCount).toBe(2)
		const spec = readWorkflowSpec(editor, workflowId)
		expect(spec.nodes.filter((node) => node.kind === 'llm')).toHaveLength(2)
	})

	it('returns empty results when only one target is supplied', () => {
		const { workflowId } = installPromptExperimentWorkflow(editor)
		const sourceShape = findShapeByNodeId(editor, workflowId, 'llm')!

		const result = configureLlmModelSet(editor, sourceShape, [
			{ provider: 'builtin', model: 'claude-opus-4-5' },
		])

		expect(result.branchIds).toHaveLength(1)
		expect(result.branchCount).toBe(1)

		const spec = readWorkflowSpec(editor, workflowId)
		expect(spec.nodes.filter((node) => node.kind === 'llm')).toHaveLength(1)
		expect(spec.nodes.find((node) => node.kind === 'llm')?.config.model).toBe('claude-opus-4-5')
	})
})
