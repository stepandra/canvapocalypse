import {
	createShapeId,
	Editor,
	TLArrowShape,
	TLGeoShape,
	TLShapeId,
	toRichText,
} from 'tldraw'
import {
	buildCurrentFlowSpec,
	buildEditableLlmWorkflowSpec,
	buildMlflowWorkflowSpec,
	WorkflowEdgeSpec,
	WorkflowNodeKind,
	WorkflowNodeSpec,
	WorkflowSpec,
} from '../../shared/workflow'
import {
	WORKFLOW_RICH_OUTPUT_SHAPE_TYPE,
	WorkflowRichOutputShape,
} from './RichOutputShape'
import {
	WORKFLOW_NODE_SHAPE_TYPE,
	WorkflowCardShape,
} from './WorkflowNodeShape'

export type WorkflowNodeShape = WorkflowCardShape | WorkflowRichOutputShape | TLGeoShape

export interface WorkflowNodeMeta {
	schema: 'ml-intern-workflow-node/v1'
	workflowId: string
	nodeId: string
	kind: WorkflowNodeKind
	title?: string
	description?: string
	mode: WorkflowSpec['mode']
	readonly: boolean
	ports: WorkflowNodeSpec['ports']
	config: Record<string, string>
	status: 'idle' | 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
	error?: string
}

export interface WorkflowEdgeMeta {
	schema: 'ml-intern-workflow-edge/v1'
	workflowId: string
	edgeId: string
	fromNodeId: string
	fromPort: string
	toNodeId: string
	toPort: string
}

const NODE_WIDTH = 300
const NODE_HEIGHT = 220
const NODE_GAP = 120

const KIND_STYLE: Record<WorkflowNodeKind, { geo: TLGeoShape['props']['geo']; color: TLGeoShape['props']['color'] }> = {
	input: { geo: 'rectangle', color: 'light-blue' },
	trigger: { geo: 'ellipse', color: 'orange' },
	context: { geo: 'rectangle', color: 'light-blue' },
	action: { geo: 'rectangle', color: 'blue' },
	'prompt-template': { geo: 'rectangle', color: 'violet' },
	decision: { geo: 'diamond', color: 'yellow' },
	llm: { geo: 'hexagon', color: 'violet' },
	agent: { geo: 'hexagon', color: 'green' },
	human: { geo: 'ellipse', color: 'green' },
	data: { geo: 'cloud', color: 'grey' },
	output: { geo: 'rectangle', color: 'light-green' },
	'rich-output': { geo: 'rectangle', color: 'light-green' },
	'mlflow-experiment': { geo: 'rectangle', color: 'light-blue' },
	'mlflow-run': { geo: 'rectangle', color: 'violet' },
	'mlflow-evaluation': { geo: 'rectangle', color: 'orange' },
	'mlflow-model': { geo: 'rectangle', color: 'green' },
}

export function isWorkflowNode(shape: unknown): shape is WorkflowNodeShape {
	return Boolean((shape as any)?.meta?.workflow?.schema === 'ml-intern-workflow-node/v1')
}

export function isWorkflowEdge(shape: unknown): shape is TLArrowShape {
	return Boolean((shape as any)?.meta?.workflowEdge?.schema === 'ml-intern-workflow-edge/v1')
}

export function getWorkflowNodeMeta(shape: WorkflowNodeShape): WorkflowNodeMeta {
	return shape.meta.workflow as unknown as WorkflowNodeMeta
}

export function getWorkflowEdgeMeta(shape: TLArrowShape): WorkflowEdgeMeta {
	return shape.meta.workflowEdge as unknown as WorkflowEdgeMeta
}

export function installCurrentFlow(editor: Editor) {
	return createWorkflowOnCanvas(editor, buildCurrentFlowSpec(), { x: 120, y: 160 })
}

export function installEditableLlmFlow(editor: Editor) {
	const bounds = editor.getViewportPageBounds()
	const spec = buildEditableLlmWorkflowSpec(`candidate-${Date.now()}`)
	const workflowWidth =
		spec.nodes.reduce((width, node) => width + (node.kind === 'rich-output' ? 420 : NODE_WIDTH), 0) +
		Math.max(0, spec.nodes.length - 1) * NODE_GAP
	return createWorkflowOnCanvas(editor, spec, {
		x: bounds.x + bounds.w / 2 - workflowWidth / 2,
		y: bounds.y + bounds.h / 2 - NODE_HEIGHT / 2,
	})
}

export function installMlflowWorkflow(editor: Editor) {
	const bounds = editor.getViewportPageBounds()
	const spec = buildMlflowWorkflowSpec(`mlflow-${Date.now()}`)
	const workflowWidth =
		spec.nodes.reduce((width) => width + NODE_WIDTH, 0) +
		Math.max(0, spec.nodes.length - 1) * NODE_GAP
	return createWorkflowOnCanvas(editor, spec, {
		x: bounds.x + bounds.w / 2 - workflowWidth / 2,
		y: bounds.y + bounds.h / 2 - NODE_HEIGHT / 2,
	})
}

export function bootstrapMlInternWorkflows(editor: Editor) {
	upgradeLegacyWorkflowNodes(editor)
	repairWorkflowNodeSemantics(editor)
	ensurePromptTemplateInDraft(editor)
	repairEscapedPromptTemplates(editor)
	const shapes = editor.getCurrentPageShapes()
	const hasCurrent = shapes.some(
		(shape) => isWorkflowNode(shape) && getWorkflowNodeMeta(shape).workflowId === 'current-ml-intern-flow'
	)
	const hasDraft = shapes.some(
		(shape) => isWorkflowNode(shape) && getWorkflowNodeMeta(shape).workflowId === 'ml-intern-draft'
	)
	let bounds = editor.getCurrentPageBounds()
	const x = bounds?.x ?? 120
	let y = bounds ? bounds.maxY + 180 : 160

	if (!hasCurrent) {
		createWorkflowOnCanvas(editor, buildCurrentFlowSpec(), { x, y })
		bounds = editor.getCurrentPageBounds()
		y = bounds ? bounds.maxY + 180 : y + NODE_HEIGHT + 180
	}
	if (!hasDraft) {
		createWorkflowOnCanvas(editor, buildEditableLlmWorkflowSpec('ml-intern-draft'), { x, y })
	}
}

function repairEscapedPromptTemplates(editor: Editor) {
	for (const shape of editor.getCurrentPageShapes().filter(isWorkflowNode)) {
		const meta = getWorkflowNodeMeta(shape)
		if (meta.kind !== 'prompt-template' || !meta.config.template?.includes('\\n')) continue
		updateWorkflowNode(editor, shape, {
			config: { ...meta.config, template: meta.config.template.replaceAll('\\n', '\n') },
		})
	}
}

function ensurePromptTemplateInDraft(editor: Editor) {
	const workflowId = 'ml-intern-draft'
	const nodes = editor
		.getCurrentPageShapes()
		.filter(isWorkflowNode)
		.filter((shape) => getWorkflowNodeMeta(shape).workflowId === workflowId)
	if (!nodes.length || nodes.some((shape) => getWorkflowNodeMeta(shape).kind === 'prompt-template')) {
		return
	}

	const input = nodes.find((shape) => getWorkflowNodeMeta(shape).nodeId === 'input')
	const llm = nodes.find((shape) => getWorkflowNodeMeta(shape).nodeId === 'llm')
	if (!input || !llm) return

	const promptNode = buildEditableLlmWorkflowSpec(workflowId).nodes.find(
		(node) => node.kind === 'prompt-template'
	)
	if (!promptNode) return
	const promptId = createShapeId(`${workflowId}-${promptNode.id}`)

	for (const node of nodes.filter((candidate) => candidate.x >= llm.x)) {
		editor.updateShape({ id: node.id, type: node.type as any, x: node.x + NODE_WIDTH + NODE_GAP } as any)
	}

	editor.createShape(
		buildNodeShape(
			{ ...buildEditableLlmWorkflowSpec(workflowId), nodes: [promptNode], edges: [] },
			promptNode,
			promptId,
			input.x + NODE_WIDTH + NODE_GAP,
			input.y
		) as any
	)

	const staleEdge = editor
		.getCurrentPageShapes()
		.filter(isWorkflowEdge)
		.find((shape) => {
			const edge = getWorkflowEdgeMeta(shape)
			return edge.workflowId === workflowId && edge.fromNodeId === 'input' && edge.toNodeId === 'llm'
		})
	if (staleEdge) editor.deleteShape(staleEdge.id)

	const shapeIds = new Map<string, TLShapeId>()
	for (const shape of editor.getCurrentPageShapes().filter(isWorkflowNode)) {
		const meta = getWorkflowNodeMeta(shape)
		if (meta.workflowId === workflowId) shapeIds.set(meta.nodeId, shape.id)
	}
	createWorkflowArrow(
		editor,
		workflowId,
		{ id: 'input->prompt', from: 'input', fromPort: 'output', to: 'prompt', toPort: 'input' },
		shapeIds
	)
	createWorkflowArrow(
		editor,
		workflowId,
		{ id: 'prompt->llm', from: 'prompt', fromPort: 'output', to: 'llm', toPort: 'input' },
		shapeIds
	)
}

export function createWorkflowOnCanvas(
	editor: Editor,
	spec: WorkflowSpec,
	origin: { x: number; y: number }
) {
	const existing = editor
		.getCurrentPageShapes()
		.filter((shape) => isWorkflowNode(shape) && getWorkflowNodeMeta(shape).workflowId === spec.id)
	if (existing.length) {
		editor.select(...existing.map((shape) => shape.id))
		editor.zoomToSelection({ animation: { duration: 200 } })
		return { workflowId: spec.id, created: false, shapeIds: existing.map((shape) => shape.id) }
	}

	const shapeIds = new Map<string, TLShapeId>()
	const nodeShapes = spec.nodes.map((node, index) => {
		const id = createShapeId(`${spec.id}-${node.id}`)
		shapeIds.set(node.id, id)
		return buildNodeShape(spec, node, id, origin.x + index * (NODE_WIDTH + NODE_GAP), origin.y)
	})

	editor.createShapes(nodeShapes as any)
	for (const edge of spec.edges) createWorkflowArrow(editor, spec.id, edge, shapeIds)
	const readonlyShapeIds = nodeShapes
		.filter((_, index) => spec.nodes[index]?.readonly)
		.map((shape) => shape.id)
	if (readonlyShapeIds.length) editor.toggleLock(readonlyShapeIds)
	editor.select(...nodeShapes.map((shape) => shape.id))
	editor.zoomToSelection({ animation: { duration: 200 } })
	return { workflowId: spec.id, created: true, shapeIds: nodeShapes.map((shape) => shape.id) }
}

export function createStandaloneWorkflowNode(
	editor: Editor,
	kind: WorkflowNodeKind,
	preset?: 'openrouter' | 'compatible'
) {
	const point = editor.inputs.getCurrentPagePoint()
	const workflowId = `draft-${Date.now()}`
	const node: WorkflowNodeSpec = {
		id: kind,
		kind,
		title: nodeTitle(kind),
		description: `Editable ${kind} workflow node.`,
		readonly: false,
		ports: standaloneNodePorts(kind),
		config: standaloneNodeConfig(kind, preset),
	}
	const spec: WorkflowSpec = { id: workflowId, title: 'Draft workflow', mode: 'editable', nodes: [node], edges: [] }
	const id = createShapeId(`${workflowId}-${kind}`)
	editor.createShape(
		buildNodeShape(spec, node, id, point.x - NODE_WIDTH / 2, point.y - NODE_HEIGHT / 2) as any
	)
	editor.select(id)
	return id
}

export function duplicateLlmBranch(editor: Editor, shape: WorkflowNodeShape) {
	const meta = getWorkflowNodeMeta(shape)
	if (meta.kind !== 'llm' || meta.readonly) throw new Error('Select an editable LLM node')
	const suffix = createBranchSuffix()
	const nodeId = `${meta.nodeId}-${suffix}`
	const node: WorkflowNodeSpec = {
		id: nodeId,
		kind: 'llm',
		title: 'LLM',
		description: 'Parallel model branch.',
		readonly: false,
		ports: meta.ports,
		config: { ...meta.config },
	}
	const spec: WorkflowSpec = {
		id: meta.workflowId,
		title: 'ML intern candidate workflow',
		mode: 'editable',
		nodes: [node],
		edges: [],
	}
	const id = createShapeId(`${meta.workflowId}-${nodeId}`)
	editor.createShape(buildNodeShape(spec, node, id, shape.x, shape.y + NODE_HEIGHT + 70) as any)
	const created = editor.getShape(id)
	if (!created || !isWorkflowNode(created)) throw new Error('Could not duplicate the LLM node')
	const result = attachOutputBranch(editor, created, meta.nodeId, suffix)
	editor.select(created.id, result.outputId)
	editor.zoomToSelection({ animation: { duration: 200 } })
	return { llmId: created.id, ...result }
}

export function adoptDuplicatedLlmBranch(editor: Editor, shape: WorkflowNodeShape) {
	const meta = getWorkflowNodeMeta(shape)
	if (meta.kind !== 'llm' || meta.readonly) return null
	const original = editor
		.getCurrentPageShapes()
		.filter(isWorkflowNode)
		.find(
			(candidate) =>
				candidate.id !== shape.id &&
				getWorkflowNodeMeta(candidate).workflowId === meta.workflowId &&
				getWorkflowNodeMeta(candidate).nodeId === meta.nodeId
		)
	if (!original) return null

	const suffix = createBranchSuffix()
	const nextMeta: WorkflowNodeMeta = {
		...meta,
		nodeId: `${meta.nodeId}-${suffix}`,
		status: 'idle',
		error: undefined,
		config: { ...meta.config },
	}
	editor.updateShape({
		id: shape.id,
		type: shape.type as any,
		...(shape.type === 'geo'
			? { props: { richText: toRichText(formatNodeText(nextMeta)) } }
			: {}),
		meta: { ...shape.meta, workflow: nextMeta as any },
	} as any)
	const updated = editor.getShape(shape.id)
	if (!updated || !isWorkflowNode(updated)) return null
	const result = attachOutputBranch(editor, updated, meta.nodeId, suffix)
	editor.select(updated.id, result.outputId)
	return { llmId: updated.id, ...result }
}

export function readWorkflowSpec(editor: Editor, workflowId: string): WorkflowSpec {
	const shapes = editor.getCurrentPageShapes()
	const nodes = shapes
		.filter(isWorkflowNode)
		.filter((shape) => getWorkflowNodeMeta(shape).workflowId === workflowId)
		.map((shape) => {
			const meta = getWorkflowNodeMeta(shape)
			return {
				id: meta.nodeId,
				kind: meta.kind,
				title: meta.title || nodeTitle(meta.kind),
				description: meta.description || '',
				readonly: meta.readonly,
				ports: meta.ports,
				config: meta.config,
			}
		})
	const edges = shapes
		.filter(isWorkflowEdge)
		.filter((shape) => getWorkflowEdgeMeta(shape).workflowId === workflowId)
		.map((shape) => {
			const meta = getWorkflowEdgeMeta(shape)
			return {
				id: meta.edgeId,
				from: meta.fromNodeId,
				fromPort: meta.fromPort,
				to: meta.toNodeId,
				toPort: meta.toPort,
			}
		})
	return {
		id: workflowId,
		title: workflowId === 'current-ml-intern-flow' ? 'Current ML intern flow' : 'ML intern candidate workflow',
		mode: nodes.every((node) => node.readonly) ? 'readonly' : 'editable',
		nodes,
		edges,
	}
}

export function updateWorkflowNode(
	editor: Editor,
	shape: WorkflowNodeShape,
	patch: Partial<Pick<WorkflowNodeMeta, 'config' | 'status' | 'error'>>
) {
	const latest = editor.getShape(shape.id)
	const current = latest && isWorkflowNode(latest) ? latest : shape
	const meta = getWorkflowNodeMeta(current)
	const next: WorkflowNodeMeta = {
		...meta,
		...patch,
		config: patch.config ?? meta.config,
	}
	if (next.error === undefined) delete next.error
	if (current.type === WORKFLOW_RICH_OUTPUT_SHAPE_TYPE) {
		editor.updateShape({
			id: current.id,
			type: WORKFLOW_RICH_OUTPUT_SHAPE_TYPE,
			meta: { ...current.meta, workflow: next as any },
		})
	} else if (current.type === WORKFLOW_NODE_SHAPE_TYPE) {
		editor.updateShape({
			id: current.id,
			type: WORKFLOW_NODE_SHAPE_TYPE,
			meta: { ...current.meta, workflow: next as any },
		})
	} else {
		editor.updateShape({
			id: current.id,
			type: 'geo',
			props: {
				richText: toRichText(formatNodeText(next)),
				color: statusColor(next),
			},
			meta: { ...current.meta, workflow: next as any },
		})
	}
}

function attachOutputBranch(
	editor: Editor,
	llmShape: WorkflowNodeShape,
	sourceNodeId: string,
	suffix: string
) {
	const meta = getWorkflowNodeMeta(llmShape)
	const outputNodeId = `output-${suffix}`
	const outputNode: WorkflowNodeSpec = {
		id: outputNodeId,
		kind: 'rich-output',
		title: 'Rich Output',
		description: 'Parallel model result with Markdown and JSON rendering.',
		readonly: false,
		ports: [{ id: 'input', direction: 'input', valueType: 'text' }],
		config: { value: 'Run the workflow to compare this model.' },
	}
	const spec: WorkflowSpec = {
		id: meta.workflowId,
		title: 'ML intern candidate workflow',
		mode: 'editable',
		nodes: [outputNode],
		edges: [],
	}
	const outputId = createShapeId(`${meta.workflowId}-${outputNodeId}`)
	editor.createShape(
		buildNodeShape(
			spec,
			outputNode,
			outputId,
			llmShape.x + NODE_WIDTH + NODE_GAP,
			llmShape.y
		) as any
	)

	const shapesByNodeId = new Map<string, TLShapeId>()
	for (const candidate of editor.getCurrentPageShapes().filter(isWorkflowNode)) {
		const candidateMeta = getWorkflowNodeMeta(candidate)
		if (candidateMeta.workflowId === meta.workflowId) {
			shapesByNodeId.set(candidateMeta.nodeId, candidate.id)
		}
	}
	const incomingEdges = editor
		.getCurrentPageShapes()
		.filter(isWorkflowEdge)
		.map(getWorkflowEdgeMeta)
		.filter((edge) => edge.workflowId === meta.workflowId && edge.toNodeId === sourceNodeId)

	for (const edge of incomingEdges) {
		createWorkflowArrow(
			editor,
			meta.workflowId,
			{
				id: `${edge.edgeId}-${suffix}`,
				from: edge.fromNodeId,
				fromPort: edge.fromPort,
				to: meta.nodeId,
				toPort: 'input',
			},
			shapesByNodeId
		)
	}
	createWorkflowArrow(
		editor,
		meta.workflowId,
		{
			id: `${meta.nodeId}->${outputNodeId}`,
			from: meta.nodeId,
			fromPort: 'output',
			to: outputNodeId,
			toPort: 'input',
		},
		shapesByNodeId
	)
	return { outputId }
}

function createBranchSuffix() {
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

function buildNodeShape(
	spec: WorkflowSpec,
	node: WorkflowNodeSpec,
	id: TLShapeId,
	x: number,
	y: number
) {
	const meta: WorkflowNodeMeta = {
		schema: 'ml-intern-workflow-node/v1',
		workflowId: spec.id,
		nodeId: node.id,
		kind: node.kind,
		title: node.title,
		description: node.description,
		mode: spec.mode,
		readonly: node.readonly,
		ports: node.ports,
		config: node.config,
		status: 'idle',
	}
	if (node.kind === 'rich-output') {
		return {
			id,
			type: WORKFLOW_RICH_OUTPUT_SHAPE_TYPE,
			x,
			y: y - 75,
			props: {
				w: 420,
				h: 300,
			},
			meta: { workflow: meta },
		}
	}
	return {
		id,
		type: WORKFLOW_NODE_SHAPE_TYPE,
		x,
		y,
		props: {
			w: NODE_WIDTH,
			h: NODE_HEIGHT,
		},
		meta: { workflow: meta },
	}
}

export function upgradeLegacyWorkflowNodes(editor: Editor) {
	const replacements = editor
		.getCurrentPageShapes()
		.filter((shape): shape is TLGeoShape => shape.type === 'geo' && isWorkflowNode(shape))
		.map((shape) => {
			const meta = hydrateWorkflowNodeCopy(getWorkflowNodeMeta(shape))
			return {
				...shape,
				type: WORKFLOW_NODE_SHAPE_TYPE,
				props: { w: NODE_WIDTH, h: NODE_HEIGHT },
				meta: { ...shape.meta, workflow: meta as any },
			}
		})
	if (replacements.length) editor.store.put(replacements as any)
	return replacements.length
}

function repairWorkflowNodeSemantics(editor: Editor) {
	const currentDefinitions = new Map(buildCurrentFlowSpec().nodes.map((node) => [node.id, node]))
	for (const shape of editor.getCurrentPageShapes().filter(isWorkflowNode)) {
		const meta = getWorkflowNodeMeta(shape)
		if (meta.workflowId === 'current-ml-intern-flow') {
			const definition = currentDefinitions.get(meta.nodeId)
			if (!definition) continue
			const nextMeta: WorkflowNodeMeta = {
				...meta,
				kind: definition.kind,
				title: definition.title,
				description: definition.description,
				readonly: definition.readonly,
				ports: definition.ports,
				config: { ...meta.config, ...definition.config },
			}
			if (nextMeta.error === undefined) delete nextMeta.error
			editor.store.put([
				{
					...shape,
					meta: { ...shape.meta, workflow: nextMeta as any },
				} as any,
			])
			if (shape.isLocked !== definition.readonly) editor.toggleLock([shape.id])
			continue
		}

		if (
			meta.kind === 'llm' &&
			meta.config.provider === 'amp' &&
			meta.config.model === 'amp-medium'
		) {
			updateWorkflowNode(editor, shape, {
				config: {
					...meta.config,
					provider: 'builtin',
					model: 'claude-sonnet-4-5',
				},
			})
		}
	}
}

function hydrateWorkflowNodeCopy(meta: WorkflowNodeMeta): WorkflowNodeMeta {
	if (meta.title && meta.description) return meta
	const current = buildCurrentFlowSpec().nodes.find((node) => node.id === meta.nodeId)
	const editable = buildEditableLlmWorkflowSpec(meta.workflowId).nodes.find(
		(node) => node.id === meta.nodeId
	)
	const source = current ?? editable
	return {
		...meta,
		title: meta.title || source?.title || nodeTitle(meta.kind),
		description:
			meta.description ||
			source?.description ||
			(meta.kind === 'llm' ? 'Server-side inference node with streamed output.' : `Workflow ${meta.kind} step.`),
	}
}

function createWorkflowArrow(
	editor: Editor,
	workflowId: string,
	edge: WorkflowEdgeSpec,
	shapeIds: Map<string, TLShapeId>
) {
	const fromId = shapeIds.get(edge.from)
	const toId = shapeIds.get(edge.to)
	if (!fromId || !toId) return
	const from = editor.getShapePageBounds(fromId)
	const to = editor.getShapePageBounds(toId)
	if (!from || !to) return
	const arrowId = createShapeId(`${workflowId}-edge-${edge.id}`)
	editor.createShape({
		id: arrowId,
		type: 'arrow',
		x: from.maxX,
		y: from.center.y,
		props: {
			start: { x: 0, y: 0 },
			end: { x: to.minX - from.maxX, y: to.center.y - from.center.y },
			arrowheadEnd: 'arrow',
			dash: 'solid',
			size: 's',
			color: 'grey',
		},
		meta: {
			workflowEdge: {
				schema: 'ml-intern-workflow-edge/v1',
				workflowId,
				edgeId: edge.id,
				fromNodeId: edge.from,
				fromPort: edge.fromPort,
				toNodeId: edge.to,
				toPort: edge.toPort,
			} satisfies WorkflowEdgeMeta,
		},
	})
	editor.createBindings([
		{
			type: 'arrow',
			fromId: arrowId,
			toId: fromId,
			props: {
				terminal: 'start',
				normalizedAnchor: { x: 1, y: 0.5 },
				isExact: false,
				isPrecise: true,
			},
		},
		{
			type: 'arrow',
			fromId: arrowId,
			toId,
			props: {
				terminal: 'end',
				normalizedAnchor: { x: 0, y: 0.5 },
				isExact: false,
				isPrecise: true,
			},
		},
	])
}

function nodeTitle(kind: WorkflowNodeKind) {
	if (kind === 'llm') return 'LLM'
	if (kind === 'agent') return 'AGENT'
	if (kind === 'context') return 'CONTEXT'
	if (kind === 'input') return 'TEXT INPUT'
	if (kind === 'prompt-template') return 'PROMPT TEMPLATE'
	if (kind === 'rich-output') return 'RICH OUTPUT'
	if (kind === 'mlflow-experiment') return 'MLFLOW EXPERIMENT'
	if (kind === 'mlflow-run') return 'MLFLOW RUN'
	if (kind === 'mlflow-evaluation') return 'MLFLOW EVALUATION'
	if (kind === 'mlflow-model') return 'MLFLOW MODEL'
	return kind.toUpperCase()
}

function formatNodeText(meta: WorkflowNodeMeta, title = nodeTitle(meta.kind), description = '') {
	const value = meta.kind === 'llm' ? meta.config.instructions : meta.config.value
	const status = meta.status === 'idle' ? '' : `\n[${meta.status.toUpperCase()}]`
	const detail = value || description
	return `${title}${status}${detail ? `\n${detail.slice(0, 240)}` : ''}`
}

function statusColor(meta: WorkflowNodeMeta): TLGeoShape['props']['color'] {
	if (meta.status === 'failed') return 'red'
	if (meta.status === 'running' || meta.status === 'queued') return 'orange'
	if (meta.status === 'succeeded') return 'green'
	return KIND_STYLE[meta.kind].color
}

function standaloneNodeConfig(
	kind: WorkflowNodeKind,
	preset?: 'openrouter' | 'compatible'
): Record<string, string> {
	if (kind === 'rich-output') {
		return { value: 'Connect an LLM and run the workflow to render Markdown or JSON.' }
	}
	if (kind === 'input') {
		return { value: 'Type the text passed to the next node.' }
	}
	if (kind === 'context') {
		return { selectionMode: 'explicit' }
	}
	if (kind === 'prompt-template') {
		return {
			template: 'Use the following input to produce a concise result:\n\n{input}',
			inputVariable: 'input',
		}
	}
	if (kind === 'agent') {
		return {
			agentProvider: 'amp',
			model: 'amp-medium',
			instructions: 'Use bounded canvas context and return a compact validated result.',
		}
	}
	if (kind === 'mlflow-experiment') {
		return {
			experimentName: 'autorecruit-eval-lab',
			trackingAlias: 'local-mlflow',
		}
	}
	if (kind === 'mlflow-run') {
		return { runName: 'candidate-run', runMode: 'create-or-resume' }
	}
	if (kind === 'mlflow-evaluation') {
		return {
			datasetRef: 'selected dataset artifact',
			evaluator: 'default',
		}
	}
	if (kind === 'mlflow-model') {
		return { modelName: 'autorecruit-candidate', modelAlias: 'candidate' }
	}
	if (kind !== 'llm') return {}
	if (preset === 'openrouter') {
		return {
			instructions: 'Transform the input.',
			model: '',
			provider: 'openrouter',
		}
	}
	if (preset === 'compatible') {
		return {
			instructions: 'Transform the input.',
			model: '',
			provider: 'compatible',
			baseUrl: 'http://127.0.0.1:11434/v1',
		}
	}
	return {
		instructions: 'Transform the input.',
		model: 'claude-sonnet-4-5',
		provider: 'builtin',
	}
}

function standaloneNodePorts(kind: WorkflowNodeKind): WorkflowNodeSpec['ports'] {
	if (kind === 'mlflow-experiment') {
		return [{ id: 'experiment', direction: 'output', valueType: 'artifact' }]
	}
	if (kind === 'mlflow-run') {
		return [
			{ id: 'experiment', direction: 'input', valueType: 'artifact' },
			{ id: 'artifact', direction: 'output', valueType: 'artifact' },
		]
	}
	if (kind === 'mlflow-evaluation') {
		return [
			{ id: 'candidate', direction: 'input', valueType: 'artifact' },
			{ id: 'dataset', direction: 'input', valueType: 'artifact' },
			{ id: 'artifact', direction: 'output', valueType: 'artifact' },
		]
	}
	if (kind === 'mlflow-model') {
		return [{ id: 'artifact', direction: 'input', valueType: 'artifact' }]
	}
	return [
		...(kind === 'input' || kind === 'trigger' || kind === 'context'
			? []
			: [{ id: 'input', direction: 'input' as const, valueType: 'text' as const }]),
		...(kind === 'output'
			? []
			: [{ id: 'output', direction: 'output' as const, valueType: 'text' as const }]),
	]
}
