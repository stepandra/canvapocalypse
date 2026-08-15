import type { Editor } from 'tldraw'
import type { WorkbenchDomain } from '../workbench/domainPacks'
import { WORKBENCH_DOMAIN_PACKS } from '../workbench/domainPacks'
import { insertWorkbenchTemplate } from '../workbench/workbenchCanvas'
import type {
	CanvasKitContribution,
	CanvasPresetInsertOptions,
} from './types'

export const WORKBENCH_CATALOG_PRESET_MAPPINGS = {
	'workbench.system-context': {
		kitId: 'workbench.architecture',
		pack: 'architecture',
		templateId: 'system-context',
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
} as const satisfies Record<
	string,
	{ kitId: string; pack: WorkbenchDomain; templateId: string }
>

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
	const mapping = WORKBENCH_CATALOG_PRESET_MAPPINGS[
		presetId as WorkbenchCatalogPresetId
	]
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

function createWorkbenchContribution(
	kitId: string,
	pack: WorkbenchDomain
): CanvasKitContribution {
	const presetIds = (
		Object.keys(WORKBENCH_CATALOG_PRESET_MAPPINGS) as WorkbenchCatalogPresetId[]
	).filter(
		(presetId) => WORKBENCH_CATALOG_PRESET_MAPPINGS[presetId].kitId === kitId
	)
	const expectedTemplates = new Set(
		WORKBENCH_DOMAIN_PACKS[pack].templates.map((template) => template.id)
	)
	const mappedTemplates = new Set<string>(
		presetIds.map(
			(presetId) => WORKBENCH_CATALOG_PRESET_MAPPINGS[presetId].templateId
		)
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
		shapeUtils: [],
		bindingUtils: [],
		tools: [],
		insertPreset: (editor, presetId, options) =>
			insertMappedWorkbenchPreset(editor, presetId, options, kitId),
	}
}

export const WORKBENCH_CANVAS_KIT_CONTRIBUTIONS: readonly CanvasKitContribution[] =
	WORKBENCH_KITS.map(({ kitId, pack }) =>
		createWorkbenchContribution(kitId, pack)
	)
