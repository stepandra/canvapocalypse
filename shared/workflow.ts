export const WORKFLOW_NODE_KINDS = [
	'input',
	'trigger',
	'context',
	'action',
	'prompt-template',
	'decision',
	'llm',
	'agent',
	'human',
	'data',
	'output',
	'rich-output',
	'mlflow-experiment',
	'mlflow-run',
	'mlflow-evaluation',
	'mlflow-model',
] as const

export type WorkflowNodeKind = (typeof WORKFLOW_NODE_KINDS)[number]
export type WorkflowMode = 'readonly' | 'editable'

export interface WorkflowPort {
	id: string
	direction: 'input' | 'output'
	valueType: 'text' | 'control' | 'artifact'
}

export interface WorkflowNodeSpec {
	id: string
	kind: WorkflowNodeKind
	title: string
	description: string
	readonly: boolean
	ports: WorkflowPort[]
	config: Record<string, string>
}

export interface WorkflowEdgeSpec {
	id: string
	from: string
	fromPort: string
	to: string
	toPort: string
}

export interface WorkflowSpec {
	id: string
	title: string
	mode: WorkflowMode
	nodes: WorkflowNodeSpec[]
	edges: WorkflowEdgeSpec[]
}

const textInput: WorkflowPort = { id: 'input', direction: 'input', valueType: 'text' }
const textOutput: WorkflowPort = { id: 'output', direction: 'output', valueType: 'text' }

export function buildCurrentFlowSpec(): WorkflowSpec {
	const definitions: Array<
		Pick<WorkflowNodeSpec, 'id' | 'kind' | 'title' | 'description' | 'readonly' | 'config'>
	> = [
		{
			id: 'user-request',
			kind: 'input',
			title: 'ML intern request',
			description: 'A bounded canvas request arriving from the terminal ML-Intern tool.',
			readonly: true,
			config: { value: 'Waiting for a terminal ML-Intern tool call.' },
		},
		{
			id: 'context-builder',
			kind: 'context',
			title: 'Context selector',
			description: 'Choose explicit shapes or one bounded canvas area for the next request.',
			readonly: false,
			config: {},
		},
		{
			id: 'canvas-agent',
			kind: 'agent',
			title: 'Canvas Agent',
			description: 'Amp plans validated native tldraw actions from the bounded request.',
			readonly: true,
			config: {
				agentProvider: 'amp',
				model: 'amp-medium',
				instructions: 'Apply the bounded request using validated native tldraw actions.',
			},
		},
		{
			id: 'action-runtime',
			kind: 'action',
			title: 'Action runtime',
			description: 'Validates and applies streamed actions to the tldraw Editor.',
			readonly: true,
			config: {},
		},
		{
			id: 'canvas-result',
			kind: 'output',
			title: 'Canvas result',
			description: 'Persisted shapes, annotations, and workflow metadata.',
			readonly: true,
			config: {},
		},
	]

	const nodes = definitions.map((definition, index) => ({
		...definition,
		ports: [
			...(index === 0 ? [] : [textInput]),
			...(index === definitions.length - 1 ? [] : [textOutput]),
		],
	}))

	return {
		id: 'current-ml-intern-flow',
		title: 'Current ML intern flow',
		mode: 'readonly',
		nodes,
		edges: nodes.slice(0, -1).map((node, index) => ({
			id: `${node.id}->${nodes[index + 1].id}`,
			from: node.id,
			fromPort: 'output',
			to: nodes[index + 1].id,
			toPort: 'input',
		})),
	}
}

export function buildEditableLlmWorkflowSpec(id = `workflow-${Date.now()}`): WorkflowSpec {
	return {
		id,
		title: 'ML intern candidate workflow',
		mode: 'editable',
		nodes: [
			{
				id: 'input',
				kind: 'input',
				title: 'Text Input',
				description: 'Editable text supplied to downstream workflow nodes.',
				readonly: false,
				ports: [textOutput],
				config: { value: 'Describe the ML task or artifact to process.' },
			},
			{
				id: 'prompt',
				kind: 'prompt-template',
				title: 'Prompt Template',
				description: 'Combines upstream text with reusable instructions and variables.',
				readonly: false,
				ports: [textInput, textOutput],
				config: {
					template:
						'Analyze the following ML task and return one concise, executable next step:\n\n{input}',
					inputVariable: 'input',
				},
			},
			{
				id: 'llm',
				kind: 'llm',
				title: 'LLM',
				description: 'Server-side inference node with streamed output.',
				readonly: false,
				ports: [textInput, textOutput],
				config: {
					instructions:
						'You are an ML workflow assistant. Transform the input into a concise, executable next step.',
					model: 'claude-sonnet-4-5',
					provider: 'builtin',
				},
			},
			{
				id: 'output',
				kind: 'rich-output',
				title: 'Rich Output',
				description: 'Renders Markdown or recursively collapsible JSON.',
				readonly: false,
				ports: [textInput],
				config: { value: 'Run the workflow to populate this node.' },
			},
		],
		edges: [
			{ id: 'input->prompt', from: 'input', fromPort: 'output', to: 'prompt', toPort: 'input' },
			{ id: 'prompt->llm', from: 'prompt', fromPort: 'output', to: 'llm', toPort: 'input' },
			{ id: 'llm->output', from: 'llm', fromPort: 'output', to: 'output', toPort: 'input' },
		],
	}
}

export function buildMlflowWorkflowSpec(
	id = `mlflow-workflow-${Date.now()}`
): WorkflowSpec {
	const experimentOutput: WorkflowPort = {
		id: 'experiment',
		direction: 'output',
		valueType: 'artifact',
	}
	const artifactInput: WorkflowPort = {
		id: 'artifact',
		direction: 'input',
		valueType: 'artifact',
	}
	const artifactOutput: WorkflowPort = {
		id: 'artifact',
		direction: 'output',
		valueType: 'artifact',
	}

	return {
		id,
		title: 'MLflow evaluation pipeline',
		mode: 'editable',
		nodes: [
			{
				id: 'experiment',
				kind: 'mlflow-experiment',
				title: 'MLflow Experiment',
				description:
					'Names an experiment and emits a compact local MLflow reference.',
				readonly: false,
				ports: [experimentOutput],
				config: {
					experimentName: 'autorecruit-eval-lab',
					trackingAlias: 'local-mlflow',
				},
			},
			{
				id: 'run',
				kind: 'mlflow-run',
				title: 'MLflow Run',
				description:
					'Binds parameters, metrics, and artifacts to one inspectable run.',
				readonly: false,
				ports: [
					{ id: 'experiment', direction: 'input', valueType: 'artifact' },
					artifactOutput,
				],
				config: {
					runName: 'candidate-run',
					runMode: 'create-or-resume',
				},
			},
			{
				id: 'evaluation',
				kind: 'mlflow-evaluation',
				title: 'MLflow Evaluation',
				description:
					'References one bounded dataset and evaluator configuration.',
				readonly: false,
				ports: [
					{ id: 'candidate', direction: 'input', valueType: 'artifact' },
					{ id: 'dataset', direction: 'input', valueType: 'artifact' },
					artifactOutput,
				],
				config: {
					datasetRef: 'selected dataset artifact',
					evaluator: 'default',
				},
			},
			{
				id: 'model',
				kind: 'mlflow-model',
				title: 'MLflow Model',
				description:
					'Carries an explicit registered-model name and alias; promotion stays external.',
				readonly: false,
				ports: [artifactInput],
				config: {
					modelName: 'autorecruit-candidate',
					modelAlias: 'candidate',
				},
			},
		],
		edges: [
			{
				id: 'experiment->run',
				from: 'experiment',
				fromPort: 'experiment',
				to: 'run',
				toPort: 'experiment',
			},
			{
				id: 'run->evaluation',
				from: 'run',
				fromPort: 'artifact',
				to: 'evaluation',
				toPort: 'candidate',
			},
			{
				id: 'evaluation->model',
				from: 'evaluation',
				fromPort: 'artifact',
				to: 'model',
				toPort: 'artifact',
			},
		],
	}
}

export function renderMlflowReference(
	kind: Extract<WorkflowNodeKind, `mlflow-${string}`>,
	config: Record<string, string>,
	input: string
) {
	const compactConfig = Object.fromEntries(
		Object.entries(config)
			.filter(([, value]) => Boolean(value))
			.slice(0, 6)
	)
	return JSON.stringify({
		schema: 'mlflow-workflow-reference/v1',
		kind,
		config: compactConfig,
		inputRef: input.slice(0, 1000),
	})
}

export function validateWorkflowSpec(workflow: WorkflowSpec): string[] {
	const errors: string[] = []
	const nodesById = new Map(workflow.nodes.map((node) => [node.id, node]))
	if (nodesById.size !== workflow.nodes.length) errors.push('Workflow contains duplicate node ids')

	for (const edge of workflow.edges) {
		const from = nodesById.get(edge.from)
		const to = nodesById.get(edge.to)
		if (!from) errors.push(`Edge ${edge.id} starts at missing node ${edge.from}`)
		if (!to) errors.push(`Edge ${edge.id} targets missing node ${edge.to}`)
		if (from && !from.ports.some((port) => port.id === edge.fromPort && port.direction === 'output')) {
			errors.push(`Edge ${edge.id} starts at invalid output port ${edge.fromPort}`)
		}
		if (to && !to.ports.some((port) => port.id === edge.toPort && port.direction === 'input')) {
			errors.push(`Edge ${edge.id} targets invalid input port ${edge.toPort}`)
		}
	}

	try {
		getExecutionOrder(workflow)
	} catch (error) {
		errors.push(error instanceof Error ? error.message : String(error))
	}
	return errors
}

export function getExecutionOrder(workflow: WorkflowSpec): string[] {
	return getExecutionLayers(workflow).flat()
}

export function getExecutionLayers(workflow: WorkflowSpec): string[][] {
	const inDegree = new Map(workflow.nodes.map((node) => [node.id, 0]))
	const downstream = new Map(workflow.nodes.map((node) => [node.id, [] as string[]]))

	for (const edge of workflow.edges) {
		if (!inDegree.has(edge.from) || !inDegree.has(edge.to)) continue
		inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1)
		downstream.get(edge.from)?.push(edge.to)
	}

	let layer = workflow.nodes.filter((node) => inDegree.get(node.id) === 0).map((node) => node.id)
	const layers: string[][] = []
	let visited = 0
	while (layer.length) {
		layers.push(layer)
		visited += layer.length
		const nextLayer: string[] = []
		for (const nodeId of layer) {
			for (const next of downstream.get(nodeId) ?? []) {
				const remaining = (inDegree.get(next) ?? 0) - 1
				inDegree.set(next, remaining)
				if (remaining === 0) nextLayer.push(next)
			}
		}
		layer = nextLayer
	}

	if (visited !== workflow.nodes.length) throw new Error('Workflow contains a cycle')
	return layers
}

export function renderPromptTemplate(config: Record<string, string>, input: string) {
	const template = config.template || '{input}'
	const inputVariable = config.inputVariable || 'input'
	return template.replace(/\{([a-zA-Z_][\w-]*)\}/g, (match, variable: string) => {
		if (variable === inputVariable || variable === 'input') return input
		return config[`var:${variable}`] ?? match
	})
}

export function extractTemplateVariables(template: string) {
	return [...new Set([...template.matchAll(/\{([a-zA-Z_][\w-]*)\}/g)].map((match) => match[1]))]
}
