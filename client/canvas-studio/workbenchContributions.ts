import type { Editor } from 'tldraw'
import { ARCHITECTURE_DIAGRAM_SHAPE_UTILS } from '../workbench/architecture/ArchitectureDiagramShapes'
import type { WorkbenchDomain } from '../workbench/domainPacks'
import { WORKBENCH_DOMAIN_PACKS } from '../workbench/domainPacks'
import {
	applyWorkbenchTemplate,
	insertWorkbenchTemplate,
} from '../workbench/workbenchCanvas'
import type {
	CanvasKitAgentCapability,
	CanvasKitContribution,
	CanvasPresetInsertOptions,
} from './types'

export const WORKBENCH_CATALOG_PRESET_MAPPINGS = {
	'workbench.system-context': {
		kitId: 'workbench.architecture',
		pack: 'architecture',
		templateId: 'system-context',
	},
	'workbench.c4-container': {
		kitId: 'workbench.architecture',
		pack: 'architecture',
		templateId: 'c4-container',
	},
	'workbench.c4-component': {
		kitId: 'workbench.architecture',
		pack: 'architecture',
		templateId: 'c4-component',
	},
	'workbench.service-data-flow': {
		kitId: 'workbench.architecture',
		pack: 'architecture',
		templateId: 'service-data-flow',
	},
	'workbench.decision-graph': {
		kitId: 'workbench.architecture',
		pack: 'architecture',
		templateId: 'decision-graph',
	},
	'workbench.change-radar': {
		kitId: 'workbench.architecture',
		pack: 'architecture',
		templateId: 'change-radar',
	},
	'workbench.experiment-loop': {
		kitId: 'workbench.ml',
		pack: 'ml',
		templateId: 'experiment-loop',
	},
	'workbench.eval-pipeline': {
		kitId: 'workbench.ml',
		pack: 'ml',
		templateId: 'evaluation-pipeline',
	},
	'workbench.model-delivery': {
		kitId: 'workbench.ml',
		pack: 'ml',
		templateId: 'model-delivery-map',
	},
	'workbench.user-flow': {
		kitId: 'workbench.uiux',
		pack: 'uiux',
		templateId: 'user-flow',
	},
	'workbench.wireframe-set': {
		kitId: 'workbench.uiux',
		pack: 'uiux',
		templateId: 'wireframe-screen-set',
	},
	'workbench.component-anatomy': {
		kitId: 'workbench.uiux',
		pack: 'uiux',
		templateId: 'component-anatomy',
	},
	'workbench.roadmap': {
		kitId: 'workbench.product',
		pack: 'product',
		templateId: 'product-roadmap',
	},
	'workbench.timeline': {
		kitId: 'workbench.product',
		pack: 'product',
		templateId: 'delivery-timeline',
	},
	'workbench.opportunity-map': {
		kitId: 'workbench.product',
		pack: 'product',
		templateId: 'opportunity-decision',
	},
	'workbench.opportunity-solution-tree': {
		kitId: 'workbench.product',
		pack: 'product',
		templateId: 'opportunity-solution-tree',
	},
	'workbench.impact-map': {
		kitId: 'workbench.product',
		pack: 'product',
		templateId: 'impact-map',
	},
	'workbench.service-blueprint': {
		kitId: 'workbench.product',
		pack: 'product',
		templateId: 'service-blueprint',
	},
} as const satisfies Record<string, { kitId: string; pack: WorkbenchDomain; templateId: string }>

export type WorkbenchCatalogPresetId = keyof typeof WORKBENCH_CATALOG_PRESET_MAPPINGS

const WORKBENCH_KITS = [
	{ kitId: 'workbench.architecture', pack: 'architecture' },
	{ kitId: 'workbench.ml', pack: 'ml' },
	{ kitId: 'workbench.uiux', pack: 'uiux' },
	{ kitId: 'workbench.product', pack: 'product' },
] as const

function insertMappedWorkbenchPreset(
	editor: Editor,
	presetId: string,
	options: CanvasPresetInsertOptions,
	kitId: string
) {
	const mapping = WORKBENCH_CATALOG_PRESET_MAPPINGS[presetId as WorkbenchCatalogPresetId]
	if (!mapping || mapping.kitId !== kitId) {
		throw new Error(`Preset ${presetId} is not allowlisted for ${kitId}`)
	}
	const receipt = insertWorkbenchTemplate(editor, mapping.pack, mapping.templateId, {
		pageId: options.pageId,
		point: options.point,
	})
	return {
		kitId,
		presetId,
		shapeIds: receipt.shapeIds,
		bindingIds: receipt.bindingIds,
	}
}

function createWorkbenchPresetAgentCapability(
	kitId: string,
	presetIds: readonly WorkbenchCatalogPresetId[]
): CanvasKitAgentCapability {
	return {
		descriptor: {
			id: `${kitId}.preset.insert`,
			version: 1,
			kitId,
			mode: 'mutate',
			summary: `Insert one native ${WORKBENCH_DOMAIN_PACKS[WORKBENCH_CATALOG_PRESET_MAPPINGS[presetIds[0]].pack].label} diagram preset inside an inspected boundary.`,
			contexts: ['selection', 'selection-or-area'],
			actionPlan: {
				coordinateSystem: 'absolute-page',
				maxActions: 1,
				actionTypes: ['insertPreset'],
				schema: {
					type: 'array',
					minItems: 1,
					maxItems: 1,
					items: {
						type: 'object',
						additionalProperties: false,
						required: ['_type', 'presetId'],
						properties: {
							_type: { const: 'insertPreset' },
							presetId: { enum: presetIds },
						},
					},
				},
			},
			effects: {
				recordTypes: ['shape', 'binding'],
				atomic: true,
				undoable: true,
			},
		},
		execute(editor, actions, context) {
			if (actions.length !== 1) {
				throw new Error(`${kitId} preset insertion requires exactly one action`)
			}
			const action = actions[0]
			if (!action || typeof action !== 'object' || Array.isArray(action)) {
				throw new Error(`${kitId} preset insertion action must be an object`)
			}
			const fields = Object.keys(action)
			if (
				fields.some((field) => field !== '_type' && field !== 'presetId') ||
				Reflect.get(action, '_type') !== 'insertPreset' ||
				typeof Reflect.get(action, 'presetId') !== 'string'
			) {
				throw new Error(`${kitId} preset insertion action is invalid`)
			}
			const presetId = Reflect.get(action, 'presetId') as WorkbenchCatalogPresetId
			const mapping = WORKBENCH_CATALOG_PRESET_MAPPINGS[presetId]
			if (!mapping || mapping.kitId !== kitId || !presetIds.includes(presetId)) {
				throw new Error(`Preset ${presetId} is not allowlisted for ${kitId}`)
			}
			const receipt = applyWorkbenchTemplate(
				editor,
				mapping.pack,
				mapping.templateId,
				{
					pageId: context.pageId,
					point: {
						x: context.bounds.x + context.bounds.w / 2,
						y: context.bounds.y + context.bounds.h / 2,
					},
				}
			)
			return {
				shapeIds: receipt.shapeIds,
				bindingIds: receipt.bindingIds,
				summary: `Inserted ${presetId} as ${receipt.shapeIds.length} native shapes and ${receipt.bindingIds.length} bindings.`,
			}
		},
	}
}

function createWorkbenchContribution(kitId: string, pack: WorkbenchDomain): CanvasKitContribution {
	const presetIds = (Object.keys(WORKBENCH_CATALOG_PRESET_MAPPINGS) as WorkbenchCatalogPresetId[]).filter(
		(presetId) => WORKBENCH_CATALOG_PRESET_MAPPINGS[presetId].kitId === kitId
	)
	const expectedTemplates = new Set(WORKBENCH_DOMAIN_PACKS[pack].templates.map((template) => template.id))
	const mappedTemplates = new Set<string>(
		presetIds.map((presetId) => WORKBENCH_CATALOG_PRESET_MAPPINGS[presetId].templateId)
	)
	if (
		expectedTemplates.size !== mappedTemplates.size ||
		[...expectedTemplates].some((templateId) => !mappedTemplates.has(templateId))
	) {
		throw new Error(`Workbench catalog mappings are incomplete for ${kitId}`)
	}
	return {
		kitId,
		presetIds,
		shapeUtils: pack === 'architecture' ? ARCHITECTURE_DIAGRAM_SHAPE_UTILS : [],
		bindingUtils: [],
		tools: [],
		agentCapabilities: [createWorkbenchPresetAgentCapability(kitId, presetIds)],
		insertPreset: (editor, presetId, options) => insertMappedWorkbenchPreset(editor, presetId, options, kitId),
	}
}

export const WORKBENCH_CANVAS_KIT_CONTRIBUTIONS: readonly CanvasKitContribution[] = WORKBENCH_KITS.map(
	({ kitId, pack }) => createWorkbenchContribution(kitId, pack)
)
