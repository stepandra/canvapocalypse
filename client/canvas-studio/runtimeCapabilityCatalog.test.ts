import {
	defaultBindingUtils,
	defaultShapeUtils,
	type TLAnyBindingUtilConstructor,
	type TLAnyShapeUtilConstructor,
	type TLStateNodeConstructor,
} from 'tldraw'
import { describe, expect, it } from 'vitest'
import {
	ARCHITECTURE_BOUNDARY_SHAPE_TYPE,
	ARCHITECTURE_DIAGRAM_SURFACE_SHAPE_TYPE,
	ARCHITECTURE_RELATION_LABEL_SHAPE_TYPE,
	ARCHITECTURE_SERVICE_SHAPE_TYPE,
} from '../workbench/architecture/ArchitectureDiagramShapes'
import { resolveAgentPageRegistrations } from './agentPageRegistrations'
import { parseCanvasStudioCatalog } from './catalog'
import { createCanvapocalypseCanvasKitComposition } from './host'
import {
	buildCanvasRuntimeCapabilityCatalog,
	resolveCanvasRuntimeKitIds,
	resolveCanvasRuntimePageMode,
} from './runtimeCapabilityCatalog'
import type { CanvasKitContribution } from './types'

const studioCatalog = parseCanvasStudioCatalog({
	version: 1,
	kits: [
		{
			id: 'workbench.architecture',
			title: 'Architecture pack',
			kind: 'workbench-pack',
			runtime: 'pack-templates',
			defaultPage: 'Architecture',
			presets: [],
		},
		{
			id: 'workbench.product',
			title: 'Product pack',
			kind: 'workbench-pack',
			runtime: 'pack-templates',
			defaultPage: 'Product/PM',
			presets: [],
		},
	],
})

function catalogFor(page: { name: string; meta: Record<string, unknown> }) {
	const composition = createCanvapocalypseCanvasKitComposition()
	const pageMode = resolveCanvasRuntimePageMode(page)
	const registrations = resolveAgentPageRegistrations({
		pageMode,
		composition,
		shapeUtils: [...defaultShapeUtils, ...composition.shapeUtils],
		bindingUtils: [...defaultBindingUtils, ...composition.bindingUtils],
		tools: [...composition.tools],
	})
	return buildCanvasRuntimeCapabilityCatalog({
		composition,
		studioCatalog,
		page,
		shapeUtils: registrations.shapeUtils,
		bindingUtils: registrations.bindingUtils,
		tools: registrations.tools,
	})
}

const GrokWorkflowShapeUtil = class {
	static type = 'agents-models-node'
} as unknown as TLAnyShapeUtilConstructor

const grokWorkflowContribution: CanvasKitContribution = {
	kitId: 'grok.workflow',
	runtimeContract: {
		schema: 'canvas.kit-runtime/v1',
		owner: 'grok.workflow',
		tldrawVersion: '5.2.5',
		toolPaths: [],
		migrationIds: [],
		schemaIds: ['grok.workflow/agents-models-node/v1'],
		lifecycleIds: [],
		bridgeIds: [],
	},
	presetIds: [],
	shapeUtils: [GrokWorkflowShapeUtil],
	bindingUtils: [],
	tools: [],
	insertPreset(_editor, presetId) {
		throw new Error(`Unknown preset ${presetId}`)
	},
}

describe('Canvas runtime capability catalog page boundary', () => {
	it('uses the page lens as the mode source of truth', () => {
		expect(
			resolveCanvasRuntimePageMode({
				name: 'Misleading name',
				meta: { lens: 'product-pm' },
			})
		).toBe('product')
		expect(
			resolveCanvasRuntimeKitIds({
				page: { name: 'Product/PM', meta: { lens: 'product-pm' } },
				studioCatalog,
			}).kitIds
		).toEqual([
			'workbench.product',
			'canvas.comments',
			'canvas.layout',
			'canvas.markdown',
		])
	})

	it('publishes only the active domain semantic capability', () => {
		const architecture = catalogFor({
			name: 'Architecture',
			meta: { lens: 'architecture' },
		})
		const product = catalogFor({
			name: 'Product/PM',
			meta: { lens: 'product-pm' },
		})

		expect(architecture.pageMode).toBe('architecture')
		expect(architecture.capabilities.map((capability) => capability.id)).toEqual([
			'workbench.architecture.preset.insert',
			'canvas.markdown.read',
		])
		expect(product.pageMode).toBe('product')
		expect(product.capabilities.map((capability) => capability.id)).toEqual([
			'workbench.product.preset.insert',
			'canvas.markdown.read',
		])
		expect(product.catalogRevision).not.toBe(architecture.catalogRevision)
		expect(architecture.registrations.shapeTypes).toEqual(
			expect.arrayContaining(
				[
					ARCHITECTURE_DIAGRAM_SURFACE_SHAPE_TYPE,
					ARCHITECTURE_BOUNDARY_SHAPE_TYPE,
					ARCHITECTURE_RELATION_LABEL_SHAPE_TYPE,
					ARCHITECTURE_SERVICE_SHAPE_TYPE,
				].map((id) => ({ id, owner: 'workbench.architecture' }))
			)
		)
		expect(product.registrations.shapeTypes.map(({ id }) => id)).not.toContain(
			ARCHITECTURE_SERVICE_SHAPE_TYPE
		)
		expect(product.kits.map(({ id }) => id)).toContain('canvas.markdown')
		expect(product.registrations.shapeTypes).toContainEqual({
			id: 'markdown-document',
			owner: 'canvas.markdown',
		})
	})

	it('keeps Freeform restricted to base registrations and no custom kits', () => {
		const freeform = catalogFor({
			name: 'Freeform',
			meta: { lens: 'freeform' },
		})

		expect(freeform.pageMode).toBe('freeform')
		expect(freeform.kits).toEqual([])
		expect(freeform.capabilities).toEqual([])
		expect(freeform.registrations.shapeTypes.map(({ id }) => id)).not.toContain(
			'markdown-document'
		)
		expect(new Set(freeform.registrations.shapeTypes.map((entry) => entry.id))).toEqual(
			new Set(defaultShapeUtils.map((shapeUtil) => shapeUtil.type))
		)
	})

	it('does not disclose registrations owned by a kit bound to another page', () => {
		const composition = createCanvapocalypseCanvasKitComposition([
			grokWorkflowContribution,
		])
		const build = (lens: string, name: string) =>
			buildCanvasRuntimeCapabilityCatalog({
				composition,
				page: { name, meta: { lens } },
				shapeUtils: [...defaultShapeUtils, ...composition.shapeUtils],
				bindingUtils: [...defaultBindingUtils, ...composition.bindingUtils],
				tools: [...composition.tools],
			})

		const architecture = build('architecture', 'Architecture')
		const agentsModels = build('agents-models', 'Agents/Models')

		expect(architecture.registrations.shapeTypes.map(({ id }) => id)).not.toContain(
			'agents-models-node'
		)
		expect(architecture.kits.map(({ id }) => id)).not.toContain('grok.workflow')
		expect(agentsModels.registrations.shapeTypes).toContainEqual({
			id: 'agents-models-node',
			owner: 'grok.workflow',
		})
		expect(agentsModels.kits.map(({ id }) => id)).toContain('grok.workflow')
	})

	it('filters host registrations by page while preserving active context tools', () => {
		const hostShape = (type: string) => class { static type = type } as unknown as TLAnyShapeUtilConstructor
		const hostTool = (id: string) => class { static id = id } as unknown as TLStateNodeConstructor
		const composition = createCanvapocalypseCanvasKitComposition()
		const shapeUtils = [
			...defaultShapeUtils,
			hostShape('design-system'),
			hostShape('workflow-node'),
			...composition.shapeUtils,
		]
		const tools = [
			hostTool('target-shape'),
			hostTool('workflow-input'),
			hostTool('unrelated-tool'),
			...composition.tools,
		]
		const resolve = (pageMode: string) =>
			resolveAgentPageRegistrations({
				pageMode,
				composition,
				shapeUtils,
				bindingUtils: [
					...defaultBindingUtils,
					...composition.bindingUtils,
				] as TLAnyBindingUtilConstructor[],
				tools,
			})

		expect(resolve('uiux').shapeUtils.map(({ type }) => type)).toContain('design-system')
		expect(resolve('uiux').shapeUtils.map(({ type }) => type)).not.toContain('workflow-node')
		expect(resolve('product').shapeUtils.map(({ type }) => type)).toContain('workflow-node')
		expect(resolve('product').tools.map(({ id }) => id)).toEqual(
			expect.arrayContaining(['target-shape', 'workflow-input'])
		)
		expect(resolve('freeform').shapeUtils.map(({ type }) => type)).not.toContain(
			'markdown-document'
		)
		expect(resolve('freeform').tools).toEqual([])
	})
})
