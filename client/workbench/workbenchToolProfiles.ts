import type { WorkflowIconName } from '../workflow/WorkflowIcons'

export type WorkbenchToolProfileId = 'ml-workflow' | 'product-planning'

interface WorkbenchPaletteToolBase {
	id: string
	label: string
	icon: WorkflowIconName
}

export interface WorkflowPlacementPaletteTool extends WorkbenchPaletteToolBase {
	action: 'select-workflow-tool'
	toolId: string
}

export interface NativeRelationPaletteTool extends WorkbenchPaletteToolBase {
	action: 'select-native-tool'
	toolId: 'arrow'
	relationType: 'depends-on'
}

export interface ProductArtifactPaletteTool extends WorkbenchPaletteToolBase {
	action: 'insert-product-artifact'
	kind:
		| 'initiative'
		| 'milestone'
		| 'timeline-lane'
		| 'risk'
		| 'decision'
		| 'outcome'
	artifactRole?: 'status-receipt'
	status: 'draft' | 'planned' | 'active'
	shape: {
		geo: 'rectangle' | 'diamond'
		w: number
		h: number
		color: 'grey' | 'orange' | 'red' | 'green'
		fill: 'none' | 'semi'
		dash: 'solid' | 'dashed'
	}
}

export type WorkbenchPaletteTool =
	| WorkflowPlacementPaletteTool
	| NativeRelationPaletteTool
	| ProductArtifactPaletteTool

export interface WorkbenchToolProfile {
	id: WorkbenchToolProfileId
	label: string
	mode: 'workflow' | 'planning'
	tools: readonly WorkbenchPaletteTool[]
}

const ML_WORKFLOW_TOOLS = [
	{
		id: 'workflow-input',
		action: 'select-workflow-tool',
		toolId: 'workflow-input',
		label: 'Text Input',
		icon: 'input',
	},
	{
		id: 'workflow-trigger',
		action: 'select-workflow-tool',
		toolId: 'workflow-trigger',
		label: 'Событие / триггер',
		icon: 'trigger',
	},
	{
		id: 'workflow-context',
		action: 'select-workflow-tool',
		toolId: 'workflow-context',
		label: 'Context',
		icon: 'context',
	},
	{
		id: 'workflow-action',
		action: 'select-workflow-tool',
		toolId: 'workflow-action',
		label: 'Действие',
		icon: 'action',
	},
	{
		id: 'workflow-prompt-template',
		action: 'select-workflow-tool',
		toolId: 'workflow-prompt-template',
		label: 'Prompt Template',
		icon: 'llm',
	},
	{
		id: 'workflow-decision',
		action: 'select-workflow-tool',
		toolId: 'workflow-decision',
		label: 'Условие / развилка',
		icon: 'decision',
	},
	{
		id: 'workflow-agent',
		action: 'select-workflow-tool',
		toolId: 'workflow-agent',
		label: 'Amp Agent',
		icon: 'agent',
	},
	{
		id: 'workflow-llm',
		action: 'select-workflow-tool',
		toolId: 'workflow-llm',
		label: 'Built-in LLM',
		icon: 'llm',
	},
	{
		id: 'workflow-openrouter-llm',
		action: 'select-workflow-tool',
		toolId: 'workflow-openrouter-llm',
		label: 'OpenRouter LLM',
		icon: 'openrouter',
	},
	{
		id: 'workflow-compatible-llm',
		action: 'select-workflow-tool',
		toolId: 'workflow-compatible-llm',
		label: 'OpenAI-compatible Base URL',
		icon: 'base-url',
	},
	{
		id: 'workflow-human',
		action: 'select-workflow-tool',
		toolId: 'workflow-human',
		label: 'Задача для человека',
		icon: 'human',
	},
	{
		id: 'workflow-data',
		action: 'select-workflow-tool',
		toolId: 'workflow-data',
		label: 'Данные / артефакт',
		icon: 'data',
	},
	{
		id: 'workflow-output',
		action: 'select-workflow-tool',
		toolId: 'workflow-output',
		label: 'Простой результат',
		icon: 'output',
	},
	{
		id: 'workflow-rich-output',
		action: 'select-workflow-tool',
		toolId: 'workflow-rich-output',
		label: 'Rich Output: Markdown / JSON',
		icon: 'rich-output',
	},
	{
		id: 'workflow-mlflow-experiment',
		action: 'select-workflow-tool',
		toolId: 'workflow-mlflow-experiment',
		label: 'MLflow Experiment',
		icon: 'mlflow-experiment',
	},
	{
		id: 'workflow-mlflow-run',
		action: 'select-workflow-tool',
		toolId: 'workflow-mlflow-run',
		label: 'MLflow Run',
		icon: 'mlflow-run',
	},
	{
		id: 'workflow-mlflow-evaluation',
		action: 'select-workflow-tool',
		toolId: 'workflow-mlflow-evaluation',
		label: 'MLflow Evaluation',
		icon: 'mlflow-evaluation',
	},
	{
		id: 'workflow-mlflow-model',
		action: 'select-workflow-tool',
		toolId: 'workflow-mlflow-model',
		label: 'MLflow Model',
		icon: 'mlflow-model',
	},
] as const satisfies readonly WorkflowPlacementPaletteTool[]

const PRODUCT_PLANNING_TOOLS = [
	{
		id: 'product-initiative',
		action: 'insert-product-artifact',
		kind: 'initiative',
		label: 'Initiative',
		icon: 'action',
		status: 'planned',
		shape: {
			geo: 'rectangle',
			w: 240,
			h: 112,
			color: 'orange',
			fill: 'semi',
			dash: 'solid',
		},
	},
	{
		id: 'product-milestone',
		action: 'insert-product-artifact',
		kind: 'milestone',
		label: 'Milestone',
		icon: 'trigger',
		status: 'planned',
		shape: {
			geo: 'diamond',
			w: 132,
			h: 112,
			color: 'orange',
			fill: 'semi',
			dash: 'solid',
		},
	},
	{
		id: 'product-timeline-lane',
		action: 'insert-product-artifact',
		kind: 'timeline-lane',
		label: 'Timeline lane',
		icon: 'map',
		status: 'active',
		shape: {
			geo: 'rectangle',
			w: 520,
			h: 164,
			color: 'grey',
			fill: 'none',
			dash: 'dashed',
		},
	},
	{
		id: 'product-dependency',
		action: 'select-native-tool',
		toolId: 'arrow',
		relationType: 'depends-on',
		label: 'Dependency',
		icon: 'link',
	},
	{
		id: 'product-risk',
		action: 'insert-product-artifact',
		kind: 'risk',
		label: 'Risk',
		icon: 'trigger',
		status: 'draft',
		shape: {
			geo: 'rectangle',
			w: 220,
			h: 112,
			color: 'red',
			fill: 'semi',
			dash: 'solid',
		},
	},
	{
		id: 'product-decision',
		action: 'insert-product-artifact',
		kind: 'decision',
		label: 'Decision',
		icon: 'decision',
		status: 'draft',
		shape: {
			geo: 'diamond',
			w: 176,
			h: 120,
			color: 'orange',
			fill: 'semi',
			dash: 'solid',
		},
	},
	{
		id: 'product-outcome',
		action: 'insert-product-artifact',
		kind: 'outcome',
		label: 'Outcome',
		icon: 'output',
		status: 'draft',
		shape: {
			geo: 'rectangle',
			w: 240,
			h: 112,
			color: 'green',
			fill: 'semi',
			dash: 'solid',
		},
	},
	{
		id: 'product-status-receipt',
		action: 'insert-product-artifact',
		kind: 'outcome',
		artifactRole: 'status-receipt',
		label: 'Status/Receipt',
		icon: 'rich-output',
		status: 'draft',
		shape: {
			geo: 'rectangle',
			w: 240,
			h: 112,
			color: 'green',
			fill: 'none',
			dash: 'dashed',
		},
	},
] as const satisfies readonly WorkbenchPaletteTool[]

export const WORKBENCH_TOOL_PROFILES: Readonly<
	Record<WorkbenchToolProfileId, WorkbenchToolProfile>
> = {
	'ml-workflow': {
		id: 'ml-workflow',
		label: 'ML intern workflow tools',
		mode: 'workflow',
		tools: ML_WORKFLOW_TOOLS,
	},
	'product-planning': {
		id: 'product-planning',
		label: 'Product planning tools',
		mode: 'planning',
		tools: PRODUCT_PLANNING_TOOLS,
	},
}

export function resolveWorkbenchToolProfile(
	id: WorkbenchToolProfileId
): WorkbenchToolProfile {
	return WORKBENCH_TOOL_PROFILES[id]
}
