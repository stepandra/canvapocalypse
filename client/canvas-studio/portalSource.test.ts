import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { installCanvasExamplesTestDom, CanvasExamplesTestEditor } from '../canvas-examples/foundations/testEditor'
import { TldrawAgentApp } from '../agent/TldrawAgentApp'
import { applyCanvasPortalSource } from './portalSource'

const sourceId = '0123456789abcdef'
const nodeA = `canvas-source-${sourceId}-node-mermaid`
const nodeB = `canvas-source-${sourceId}-node-native`
const edge = `canvas-source-${sourceId}-edge-1-mermaid-native`
const checksum = 'a'.repeat(64)

function node(shapeId: string, text: string, x: number) {
	return {
		_type: 'create', intent: 'Create source node.',
		shape: {
			_type: 'rectangle', color: 'blue', fill: 'tint', h: 100,
			note: `canvas-source:${sourceId}:node:${text.toLowerCase()}`,
			shapeId, text, textAlign: 'middle', w: 220, x, y: 40,
		},
	}
}

describe('Canvas portal source adapter', () => {
	let editor: CanvasExamplesTestEditor
	let app: TldrawAgentApp
	let cleanupDom: () => void

	beforeEach(() => {
		cleanupDom = installCanvasExamplesTestDom()
		editor = new CanvasExamplesTestEditor()
		app = new TldrawAgentApp(editor, { onError() {} })
		app.agents.ensureAtLeastOneAgent()
	})

	afterEach(() => {
		app.dispose()
		editor.dispose()
		cleanupDom()
	})

	it('applies a bounded compiler plan in one native undo/redo transaction', async () => {
		const actions = [
			node(nodeA, 'Mermaid', 40),
			node(nodeB, 'Native', 396),
			{
				_type: 'create', intent: 'Create source edge.',
				shape: {
					_type: 'arrow', bend: 0, color: 'grey', fromId: nodeA,
					note: `canvas-source:${sourceId}:edge:1-mermaid-native`, shapeId: edge,
					text: '', toId: nodeB, x1: 150, y1: 90, x2: 506, y2: 90,
				},
			},
		]
		const fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
			switch (init?.method ?? 'GET') {
				case 'GET':
					return Response.json({
						schema: 'canvas.portal-source/v1', path: 'demo.mmd', sourceId,
						format: 'mermaid', checksum, shapeIds: [], status: 'new',
					})
				case 'POST':
					return Response.json({
						schema: 'canvas.portal-source-plan/v1', token: 'b'.repeat(64),
						plan: {
							version: 1, schema: 'canvas.diagram/v1', format: 'mermaid', sourceId,
							checksum, diagrams: [{ id: 'main', type: 'topology', direction: 'LR', nodeCount: 2, edgeCount: 1 }],
							shapeIds: [nodeA, nodeB, edge], actions,
							summary: { create: 3, update: 0, delete: 0, unchanged: 0 },
						},
					})
				case 'PUT':
					return Response.json({
						schema: 'canvas.portal-source-receipt/v1', sourceId, checksum,
						shapeIds: [nodeA, nodeB, edge], applied: true,
					})
				default:
					throw new Error('unexpected method')
			}
		}

		const receipt = await applyCanvasPortalSource({
			app, endpoint: '/__canvas/source', path: 'demo.mmd', format: 'mermaid',
			fetch: fetch as typeof globalThis.fetch, origin: 'https://canvas.example',
			flush: async () => undefined,
		})
		expect(receipt.plan.schema).toBe('canvas.diagram/v1')
		expect(editor.getCurrentPageShapeIds().size).toBe(3)
		expect(editor.getBindingsFromShape(`shape:${edge}` as never, 'arrow')).toHaveLength(2)

		editor.undo()
		expect(editor.getCurrentPageShapeIds().size).toBe(0)
		editor.redo()
		expect(editor.getCurrentPageShapeIds().size).toBe(3)
	})

	it('rejects a mismatched compiler identity before canvas mutation', async () => {
		const fetch = async (_input: RequestInfo | URL, init?: RequestInit) => Response.json(
			(init?.method ?? 'GET') === 'GET'
				? { schema: 'canvas.portal-source/v1', path: 'demo.mmd', sourceId, format: 'mermaid', checksum, shapeIds: [], status: 'new' }
				: { schema: 'canvas.portal-source-plan/v1', token: 'b'.repeat(64), plan: { version: 1, schema: 'wrong', format: 'mermaid', sourceId, checksum, shapeIds: [], actions: [], summary: { create: 0, update: 0, delete: 0, unchanged: 0 } } }
		)
		await expect(applyCanvasPortalSource({
			app, endpoint: '/__canvas/source', path: 'demo.mmd', format: 'mermaid',
			fetch: fetch as typeof globalThis.fetch, origin: 'https://canvas.example',
			flush: async () => undefined,
		})).rejects.toThrow(/mismatched or unbounded plan/)
		expect(editor.getCurrentPageShapeIds().size).toBe(0)
	})

	it('rolls back and persists the rollback when the source commit fails', async () => {
		const actions = [node(nodeA, 'Mermaid', 40)]
		const fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
			switch (init?.method ?? 'GET') {
				case 'GET':
					return Response.json({
						schema: 'canvas.portal-source/v1', path: 'demo.mmd', sourceId,
						format: 'mermaid', checksum, shapeIds: [], status: 'new',
					})
				case 'POST':
					return Response.json({
						schema: 'canvas.portal-source-plan/v1', token: 'b'.repeat(64),
						plan: {
							version: 1, schema: 'canvas.diagram/v1', format: 'mermaid', sourceId,
							checksum, shapeIds: [nodeA], actions,
							summary: { create: 1, update: 0, delete: 0, unchanged: 0 },
						},
					})
				case 'PUT':
					return Response.json({ error: 'source_changed' }, { status: 409 })
				default:
					throw new Error('unexpected method')
			}
		}
		let flushes = 0
		await expect(applyCanvasPortalSource({
			app, endpoint: '/__canvas/source', path: 'demo.mmd', format: 'mermaid',
			fetch: fetch as typeof globalThis.fetch, origin: 'https://canvas.example',
			flush: async () => { flushes += 1 },
		})).rejects.toThrow(/source_changed/)
		expect(editor.getCurrentPageShapeIds().size).toBe(0)
		expect(flushes).toBe(2)
	})
})
