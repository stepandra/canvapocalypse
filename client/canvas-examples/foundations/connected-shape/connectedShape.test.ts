import { createShapeId } from 'tldraw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CanvasExamplesTestEditor, installCanvasExamplesTestDom } from '../testEditor'
import { addConnectedShape } from './connectedShape'

describe('Add connected shape foundation story', () => {
	let editor: CanvasExamplesTestEditor
	let cleanupDom: () => void

	beforeEach(() => {
		cleanupDom = installCanvasExamplesTestDom()
		editor = new CanvasExamplesTestEditor()
	})

	afterEach(() => {
		editor?.dispose()
		cleanupDom?.()
	})

	it('creates the target, arrow, and native bindings atomically and removes them with one undo', () => {
		const sourceId = createShapeId('source')
		const targetId = createShapeId('target')
		const arrowId = createShapeId('arrow')
		editor.run(
			() => {
				editor.createShape({
					id: sourceId,
					type: 'geo',
					x: 100,
					y: 100,
					props: {
						geo: 'rectangle',
						w: 180,
						h: 100,
					},
				})
			},
			{ history: 'ignore' }
		)

		const result = addConnectedShape(editor, sourceId, { shapeId: targetId, arrowId })
		expect(result).toEqual({ sourceShapeId: sourceId, shapeId: targetId, arrowId })
		expect(editor.getShape(targetId)?.type).toBe('geo')
		expect(editor.getShape(arrowId)?.type).toBe('arrow')
		const bindings = editor.getBindingsFromShape(arrowId, 'arrow')
		expect(bindings).toHaveLength(2)
		expect(bindings.map((binding) => binding.props.terminal).sort()).toEqual(['end', 'start'])
		expect(new Set(bindings.map((binding) => binding.toId))).toEqual(new Set([sourceId, targetId]))
		expect(editor.getOnlySelectedShape()?.id).toBe(targetId)

		editor.undo()
		expect(editor.getShape(sourceId)).toBeDefined()
		expect(editor.getShape(targetId)).toBeUndefined()
		expect(editor.getShape(arrowId)).toBeUndefined()
		expect(editor.getBindingsFromShape(arrowId, 'arrow')).toEqual([])
	})
})
