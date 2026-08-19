import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
	buildCanvasStudioPaletteModel,
	CANVAPOCALYPSE_CANVAS_KIT_COMPOSITION,
} from '../../../canvas-studio'
import { CanvasExamplesTestEditor, installCanvasExamplesTestDom } from '../testEditor'
import { CANVAS_STUDIO_CATALOG_STORY_CATALOG } from './CanvasStudioCatalogStory'

describe('Canvas Studio catalog story', () => {
	let editor: CanvasExamplesTestEditor
	let cleanupDom: () => void

	beforeEach(() => {
		cleanupDom = installCanvasExamplesTestDom()
		editor = new CanvasExamplesTestEditor({
			shapeUtils: [...CANVAPOCALYPSE_CANVAS_KIT_COMPOSITION.shapeUtils],
			bindingUtils: [...CANVAPOCALYPSE_CANVAS_KIT_COMPOSITION.bindingUtils],
		})
		editor.updatePage({
			id: editor.getCurrentPageId(),
			name: 'Architecture',
			meta: { lens: 'architecture' },
		})
	})

	afterEach(() => {
		editor.dispose()
		cleanupDom()
	})

	it('searches, dispatches the matching preset, creates native records, and undoes once', () => {
		const model = buildCanvasStudioPaletteModel({
			catalog: CANVAS_STUDIO_CATALOG_STORY_CATALOG,
			composition: CANVAPOCALYPSE_CANVAS_KIT_COMPOSITION,
			page: editor.getCurrentPage(),
			query: 'c4',
		})
		expect(model.kits).toHaveLength(1)
		expect(model.kits[0].presets.map((preset) => preset.id)).toEqual([
			'workbench.system-context',
		])

		const receipt = CANVAPOCALYPSE_CANVAS_KIT_COMPOSITION.insertPreset(
			editor,
			model.kits[0].presets[0].id,
			{
				pageId: editor.getCurrentPageId(),
				point: { x: 900, y: 620 },
			}
		)
		expect(
			receipt.shapeIds.map((shapeId) => editor.getShape(shapeId)?.type)
		).toContain('architecture-diagram-surface')
		expect(
			receipt.shapeIds.map((shapeId) => editor.getShape(shapeId)?.type)
		).toContain('architecture-service')
		expect(receipt.bindingIds.every((bindingId) => editor.getBinding(bindingId))).toBe(
			true
		)

		editor.undo()
		expect(receipt.shapeIds.every((shapeId) => !editor.getShape(shapeId))).toBe(true)
		expect(receipt.bindingIds.every((bindingId) => !editor.getBinding(bindingId))).toBe(
			true
		)
	})
})
