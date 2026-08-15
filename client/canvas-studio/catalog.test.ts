import { describe, expect, it } from 'vitest'
import { buildCanvasStudioPaletteModel, parseCanvasStudioCatalog } from './catalog'
import { composeCanvasKitContributions } from './compose'
import { WORKBENCH_CANVAS_KIT_CONTRIBUTIONS } from './workbenchContributions'

const catalog = parseCanvasStudioCatalog({
	version: 1,
	kits: [
		{
			id: 'workbench.architecture',
			title: 'Architecture pack',
			kind: 'workbench-pack',
			runtime: 'pack-templates',
			tags: ['architecture'],
			presets: [
				{
					id: 'workbench.system-context',
					title: 'System context',
					tags: ['c4'],
				},
			],
		},
		{
			id: 'workbench.ml',
			title: 'ML pack',
			kind: 'workbench-pack',
			runtime: 'pack-templates',
			presets: [
				{ id: 'workbench.experiment-loop', title: 'Experiment loop' },
			],
		},
		{
			id: 'grok.workflow',
			title: 'Grok workflow',
			kind: 'workflow',
			runtime: 'custom-nodes',
			presets: [{ id: 'grok.single', title: 'Single agent' }],
		},
	],
	pages: {
		architecture: ['workbench.architecture'],
	},
})
const composition = composeCanvasKitContributions(
	WORKBENCH_CANVAS_KIT_CONTRIBUTIONS
)
const architecturePage = {
	name: 'Architecture',
	meta: { lens: 'architecture' },
}

describe('Canvas Studio catalog palette model', () => {
	it('searches catalog kit, preset, and tag text', () => {
		expect(catalog).toBeDefined()
		const model = buildCanvasStudioPaletteModel({
			catalog,
			composition,
			page: architecturePage,
			query: 'c4',
		})
		expect(model.state).toBe('ready')
		expect(model.kits.map((kit) => kit.id)).toEqual([
			'workbench.architecture',
		])
		expect(model.kits[0].presets.map((preset) => preset.id)).toEqual([
			'workbench.system-context',
		])
	})

	it('marks composed, unbound, and unavailable kits explicitly', () => {
		const model = buildCanvasStudioPaletteModel({
			catalog,
			composition,
			page: architecturePage,
		})
		expect(
			Object.fromEntries(model.kits.map((kit) => [kit.id, kit.availability]))
		).toEqual({
			'workbench.architecture': 'available',
			'workbench.ml': 'unbound',
			'grok.workflow': 'unavailable',
		})
		expect(
			model.kits.find((kit) => kit.id === 'grok.workflow')?.presets[0]
				.availability
		).toBe('unavailable')
	})

	it('returns explicit missing and empty states', () => {
		expect(
			buildCanvasStudioPaletteModel({
				catalog: undefined,
				composition,
				page: architecturePage,
			})
		).toEqual({ state: 'missing', kits: [] })
		expect(
			buildCanvasStudioPaletteModel({
				catalog,
				composition,
				page: architecturePage,
				query: 'not-present',
			}).state
		).toBe('empty')
	})
})
