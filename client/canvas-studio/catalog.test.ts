import { describe, expect, it } from 'vitest'
import { buildCanvasStudioPaletteModel, parseCanvasStudioCatalog } from './catalog'
import { composeCanvasKitContributions } from './compose'
import {
	CANVAPOCALYPSE_DEFAULT_CANVAS_STUDIO_CATALOG,
	installDefaultCanvasStudioCatalog,
} from './defaultCatalog'
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

	it('ships complete web-host metadata for every local and cross-repo kit', () => {
		expect(
			CANVAPOCALYPSE_DEFAULT_CANVAS_STUDIO_CATALOG.kits.map((kit) => kit.id)
		).toEqual([
			'botflow.telegram-journey',
			'grok.workflow',
			'hermes.flight-deck',
			'workbench.architecture',
			'workbench.ml',
			'workbench.uiux',
			'workbench.product',
			'canvas.comments',
			'canvas.layout',
			'canvas.markdown',
		])
		expect(CANVAPOCALYPSE_DEFAULT_CANVAS_STUDIO_CATALOG.pages).toMatchObject({
			architecture: expect.arrayContaining(['workbench.architecture']),
			workflow: expect.arrayContaining(['grok.workflow']),
			botflow: expect.arrayContaining(['botflow.telegram-journey']),
			'flight-deck': expect.arrayContaining(['hermes.flight-deck']),
			freeform: [],
		})
		expect(
			CANVAPOCALYPSE_DEFAULT_CANVAS_STUDIO_CATALOG.kits
				.find((kit) => kit.id === 'hermes.flight-deck')
				?.presets.map((preset) => preset.id)
		).toEqual(['hermes.profile-canvas'])
	})

	it('installs the web catalog without replacing document-embedded metadata', () => {
		const emptyTarget = {} as typeof globalThis
		installDefaultCanvasStudioCatalog(emptyTarget)
		expect(
			(emptyTarget as typeof globalThis & { __CANVAS_STUDIO_CATALOG__?: unknown })
				.__CANVAS_STUDIO_CATALOG__
		).toBe(CANVAPOCALYPSE_DEFAULT_CANVAS_STUDIO_CATALOG)

		const embedded = { version: 99, kits: [] }
		const embeddedTarget = {
			__CANVAS_STUDIO_CATALOG__: embedded,
		} as unknown as typeof globalThis
		installDefaultCanvasStudioCatalog(embeddedTarget)
		expect(
			(embeddedTarget as typeof globalThis & { __CANVAS_STUDIO_CATALOG__?: unknown })
				.__CANVAS_STUDIO_CATALOG__
		).toBe(embedded)
	})
})
