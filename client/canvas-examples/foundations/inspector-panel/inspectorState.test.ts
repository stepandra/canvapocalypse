import { createShapeId, react } from 'tldraw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CanvasExamplesTestEditor, installCanvasExamplesTestDom } from '../testEditor'
import { readCanvasInspectorState } from './inspectorState'

describe('Inspector panel foundation story', () => {
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

	it('reacts to selection changes and binding lifecycle through editor signals', () => {
		const firstId = createShapeId('first')
		const secondId = createShapeId('second')
		const arrowId = createShapeId('arrow')
		editor.run(
			() => {
				editor.createShapes([
					{
						id: firstId,
						type: 'geo',
						x: 0,
						y: 0,
						props: { geo: 'rectangle', w: 100, h: 60 },
					},
					{
						id: secondId,
						type: 'geo',
						x: 220,
						y: 0,
						props: { geo: 'ellipse', w: 100, h: 60 },
					},
					{
						id: arrowId,
						type: 'arrow',
						x: 50,
						y: 30,
						props: { start: { x: 0, y: 0 }, end: { x: 220, y: 0 } },
					},
				])
			},
			{ history: 'ignore' }
		)

		const snapshots: Array<{ selected: string[]; bindingCount: number }> = []
		const stop = react('test inspector reactivity', () => {
			const state = readCanvasInspectorState(editor)
			snapshots.push({
				selected: state.selectedShapes.map((shape) => shape.id),
				bindingCount: state.bindings.length,
			})
		})

		editor.select(firstId)
		editor.createBinding({
			type: 'arrow',
			fromId: arrowId,
			toId: firstId,
			props: {
				terminal: 'start',
				normalizedAnchor: { x: 0.5, y: 0.5 },
				isExact: false,
				isPrecise: false,
				snap: 'none',
			},
		})
		editor.createBinding({
			type: 'arrow',
			fromId: arrowId,
			toId: secondId,
			props: {
				terminal: 'end',
				normalizedAnchor: { x: 0.5, y: 0.5 },
				isExact: false,
				isPrecise: false,
				snap: 'none',
			},
		})
		editor.select(secondId)
		stop()

		expect(snapshots.some((snapshot) => snapshot.selected[0] === firstId)).toBe(true)
		expect(
			snapshots.some((snapshot) => snapshot.selected[0] === firstId && snapshot.bindingCount === 1)
		).toBe(true)
		expect(
			snapshots.some((snapshot) => snapshot.selected[0] === secondId && snapshot.bindingCount === 1)
		).toBe(true)
	})
})
