export const WORKFLOW_NODE_KINDS = [
	'input',
	'trigger',
	'action',
	'decision',
	'llm',
	'human',
	'data',
	'output',
	'rich-output',
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
	const definitions: Array<Pick<WorkflowNodeSpec, 'id' | 'kind' | 'title' | 'description'>> = [
		{
			id: 'user-request',
			kind: 'input',
			title: 'ML intern request',
			description: 'Text, selected shapes, or a target area supplied by the intern.',
		},
		{
			id: 'context-builder',
			kind: 'action',
			title: 'Context builder',
			description: 'Serializes canvas context, conversation state, and current task.',
		},
		{
			id: 'canvas-agent',
			kind: 'llm',
			title: 'Canvas LLM agent',
			description: 'Streams typed drawing actions through the server-side model API.',
		},
		{
			id: 'action-runtime',
			kind: 'action',
			title: 'Action runtime',
			description: 'Validates and applies streamed actions to the tldraw Editor.',
		},
		{
			id: 'canvas-result',
			kind: 'output',
			title: 'Canvas result',
			description: 'Persisted shapes, annotations, and workflow metadata.',
		},
	]

	const nodes = definitions.map((definition, index) => ({
		...definition,
		readonly: true,
		ports: [
			...(index === 0 ? [] : [textInput]),
			...(index === definitions.length - 1 ? [] : [textOutput]),
		],
		config: {},
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
				title: 'Input',
				description: 'Editable workflow input.',
				readonly: false,
				ports: [textOutput],
				config: { value: 'Describe the ML task or artifact to process.' },
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
					model: 'amp-rush',
					provider: 'amp',
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
			{ id: 'input->llm', from: 'input', fromPort: 'output', to: 'llm', toPort: 'input' },
			{ id: 'llm->output', from: 'llm', fromPort: 'output', to: 'output', toPort: 'input' },
		],
	}
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
