import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CanvasExamplesTestEditor, installCanvasExamplesTestDom } from '../canvas-examples/foundations/testEditor'
import { ARCHITECTURE_DIAGRAM_SHAPE_UTILS } from '../workbench/architecture/ArchitectureDiagramShapes'
import { WORKBENCH_DOMAIN_PACKS } from '../workbench/domainPacks'
import { composeCanvasKitContributions } from './compose'
import { WORKBENCH_CANVAS_KIT_CONTRIBUTIONS, WORKBENCH_CATALOG_PRESET_MAPPINGS } from './workbenchContributions'

describe('Workbench Canvas Studio contributions', () => {
	it('maps every Workbench template exactly once into the Canvas Studio catalog', () => {
		const expectedTemplateCount = Object.values(WORKBENCH_DOMAIN_PACKS).reduce(
			(total, pack) => total + pack.templates.length,
			0
		)
		expect(Object.keys(WORKBENCH_CATALOG_PRESET_MAPPINGS)).toHaveLength(expectedTemplateCount)
		for (const [presetId, mapping] of Object.entries(WORKBENCH_CATALOG_PRESET_MAPPINGS)) {
			expect(presetId.startsWith('workbench.')).toBe(true)
			expect(
				WORKBENCH_DOMAIN_PACKS[mapping.pack].templates.some((template) => template.id === mapping.templateId)
			).toBe(true)
		}
		for (const pack of Object.values(WORKBENCH_DOMAIN_PACKS)) {
			const mappedTemplateIds = Object.values(WORKBENCH_CATALOG_PRESET_MAPPINGS)
				.filter((mapping) => mapping.pack === pack.id)
				.map((mapping) => mapping.templateId)
			expect(mappedTemplateIds).toEqual(expect.arrayContaining(pack.templates.map((template) => template.id)))
			expect(new Set(mappedTemplateIds).size).toBe(pack.templates.length)
		}
		expect(WORKBENCH_CANVAS_KIT_CONTRIBUTIONS.map((contribution) => contribution.kitId)).toEqual([
			'workbench.architecture',
			'workbench.ml',
			'workbench.uiux',
			'workbench.product',
		])
		expect(WORKBENCH_CANVAS_KIT_CONTRIBUTIONS[0].shapeUtils).toEqual(
			ARCHITECTURE_DIAGRAM_SHAPE_UTILS
		)
		expect(
			WORKBENCH_CANVAS_KIT_CONTRIBUTIONS.slice(1).every(
				(contribution) => contribution.shapeUtils.length === 0
			)
		).toBe(true)
	})
})

describe('Workbench contribution insertion', () => {
	const composition = composeCanvasKitContributions(WORKBENCH_CANVAS_KIT_CONTRIBUTIONS)
	let editor: CanvasExamplesTestEditor
	let cleanupDom: () => void

	beforeEach(() => {
		cleanupDom = installCanvasExamplesTestDom()
		editor = new CanvasExamplesTestEditor({
			shapeUtils: [...composition.shapeUtils],
			bindingUtils: [...composition.bindingUtils],
		})
	})

	afterEach(() => {
		editor.dispose()
		cleanupDom()
	})

	it('creates native records with a receipt and removes them in one undo', () => {
		const pageId = editor.getCurrentPageId()
		const receipt = composition.insertPreset(editor, 'workbench.system-context', {
			pageId,
			point: { x: 800, y: 500 },
		})

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
