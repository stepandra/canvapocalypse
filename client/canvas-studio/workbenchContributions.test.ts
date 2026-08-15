import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CanvasExamplesTestEditor, installCanvasExamplesTestDom } from '../canvas-examples/foundations/testEditor'
import { WORKBENCH_DOMAIN_PACKS } from '../workbench/domainPacks'
import { composeCanvasKitContributions } from './compose'
import {
	WORKBENCH_CANVAS_KIT_CONTRIBUTIONS,
	WORKBENCH_CATALOG_PRESET_MAPPINGS,
} from './workbenchContributions'

describe('Workbench Canvas Studio contributions', () => {
	it('maps all 12 catalog preset ids to the existing Workbench template ids', () => {
		expect(Object.keys(WORKBENCH_CATALOG_PRESET_MAPPINGS)).toHaveLength(12)
		for (const [presetId, mapping] of Object.entries(
			WORKBENCH_CATALOG_PRESET_MAPPINGS
		)) {
			expect(presetId.startsWith('workbench.')).toBe(true)
			expect(
				WORKBENCH_DOMAIN_PACKS[mapping.pack].templates.some(
					(template) => template.id === mapping.templateId
				)
			).toBe(true)
		}
		expect(
			WORKBENCH_CANVAS_KIT_CONTRIBUTIONS.map((contribution) => contribution.kitId)
		).toEqual([
			'workbench.architecture',
			'workbench.ml',
			'workbench.uiux',
			'workbench.product',
		])
	})
})

describe('Workbench contribution insertion', () => {
	let editor: CanvasExamplesTestEditor
	let cleanupDom: () => void

	beforeEach(() => {
		cleanupDom = installCanvasExamplesTestDom()
		editor = new CanvasExamplesTestEditor()
	})

	afterEach(() => {
		editor.dispose()
		cleanupDom()
	})

	it('creates native records with a receipt and removes them in one undo', () => {
		const composition = composeCanvasKitContributions(
			WORKBENCH_CANVAS_KIT_CONTRIBUTIONS
		)
		const pageId = editor.getCurrentPageId()
		const receipt = composition.insertPreset(
			editor,
			'workbench.system-context',
			{
				pageId,
				point: { x: 800, y: 500 },
			}
		)

		expect(receipt.kitId).toBe('workbench.architecture')
		expect(receipt.presetId).toBe('workbench.system-context')
		expect(receipt.shapeIds.length).toBeGreaterThan(0)
		expect(receipt.bindingIds.length).toBeGreaterThan(0)
		for (const shapeId of receipt.shapeIds) {
			expect(editor.getShape(shapeId)).toBeDefined()
		}
		for (const bindingId of receipt.bindingIds) {
			expect(editor.getBinding(bindingId)).toBeDefined()
		}

		editor.undo()
		for (const shapeId of receipt.shapeIds) {
			expect(editor.getShape(shapeId)).toBeUndefined()
		}
		for (const bindingId of receipt.bindingIds) {
			expect(editor.getBinding(bindingId)).toBeUndefined()
		}
	})

	it('rejects a preset outside the kit allowlist before mutation', () => {
		const architecture = WORKBENCH_CANVAS_KIT_CONTRIBUTIONS[0]
		const before = editor.getCurrentPageShapeIds().size
		expect(() =>
			architecture.insertPreset(editor, 'workbench.experiment-loop', {
				pageId: editor.getCurrentPageId(),
				point: { x: 0, y: 0 },
			})
		).toThrow(/not allowlisted/)
		expect(editor.getCurrentPageShapeIds().size).toBe(before)
	})
})
