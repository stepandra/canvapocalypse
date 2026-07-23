import { Editor } from 'tldraw'
import { getExecutionLayers, validateWorkflowSpec, WorkflowSpec } from '../../shared/workflow'
import { getCompatibleApiKey } from './compatibleProvider'
import { getOpenRouterApiKey } from './openRouter'
import {
	appendWorkflowRun,
	WorkflowRunNodeResult,
	WorkflowRunRecord,
} from './runStore'
import {
	getWorkflowNodeMeta,
	isWorkflowNode,
	readWorkflowSpec,
	updateWorkflowNode,
	WorkflowNodeShape,
} from './workflowCanvas'

const runningControllers = new WeakMap<Editor, AbortController>()

export async function runWorkflow(editor: Editor, workflowId: string) {
	stopWorkflow(editor)
	const workflow = readWorkflowSpec(editor, workflowId)
	if (workflow.mode !== 'editable') throw new Error('Read-only workflows cannot be executed')
	const errors = validateWorkflowSpec(workflow)
	if (errors.length) throw new Error(errors.join('\n'))

	const shapesByNodeId = new Map(
		editor
			.getCurrentPageShapes()
			.filter(isWorkflowNode)
			.filter((shape) => getWorkflowNodeMeta(shape).workflowId === workflowId)
			.map((shape) => [getWorkflowNodeMeta(shape).nodeId, shape])
	)
	const controller = new AbortController()
	runningControllers.set(editor, controller)
	const values = new Map<string, string>()
	const runId = crypto.randomUUID()
	const runStartedAt = new Date().toISOString()
	const nodeResults: Record<string, WorkflowRunNodeResult> = {}
	let runStatus: WorkflowRunRecord['status'] = 'succeeded'

	for (const shape of shapesByNodeId.values()) {
		updateWorkflowNode(editor, shape, { status: 'queued', error: undefined })
	}

	try {
		for (const layer of getExecutionLayers(workflow)) {
			if (controller.signal.aborted) throw new DOMException('Workflow cancelled', 'AbortError')
			const results = await Promise.allSettled(
				layer.map(async (nodeId) => {
					const node = workflow.nodes.find((candidate) => candidate.id === nodeId)
					const shape = shapesByNodeId.get(nodeId)
					if (!node || !shape) throw new Error(`Missing canvas shape for node ${nodeId}`)
					updateWorkflowNode(editor, shape, { status: 'running' })
					const nodeStartedAt = new Date().toISOString()

					try {
						const incoming = workflow.edges.filter((edge) => edge.to === nodeId)
						const input = incoming.length
							? incoming.map((edge) => values.get(edge.from) ?? '').filter(Boolean).join('\n\n')
							: node.config.value ?? ''
						let output = input
						if (node.kind === 'llm') {
							output = await streamLlmNode(
								editor,
								workflow,
								shape,
								input,
								node.config.instructions,
								node.config.model,
								node.config.provider,
								node.config.baseUrl,
								runId,
								controller.signal
							)
						} else if (node.kind === 'output' || node.kind === 'rich-output') {
							updateWorkflowNode(editor, shape, {
								config: { ...getWorkflowNodeMeta(shape).config, value: input },
							})
						} else if (node.kind === 'input') {
							output = node.config.value ?? ''
						}
						values.set(nodeId, output)
						updateWorkflowNode(editor, shape, { status: 'succeeded' })
						nodeResults[nodeId] = buildNodeResult({
							nodeId,
							kind: node.kind,
							status: 'succeeded',
							startedAt: nodeStartedAt,
							output,
							provider: node.config.provider,
							model: node.config.model,
							baseUrl: node.config.baseUrl,
						})
					} catch (error) {
						const cancelled =
							controller.signal.aborted ||
							(error instanceof DOMException && error.name === 'AbortError')
						updateWorkflowNode(editor, shape, {
							status: cancelled ? 'cancelled' : 'failed',
							error: error instanceof Error ? error.message : String(error),
						})
						nodeResults[nodeId] = buildNodeResult({
							nodeId,
							kind: node.kind,
							status: cancelled ? 'cancelled' : 'failed',
							startedAt: nodeStartedAt,
							output: values.get(nodeId) ?? '',
							error: error instanceof Error ? error.message : String(error),
							provider: node.config.provider,
							model: node.config.model,
							baseUrl: node.config.baseUrl,
						})
						throw error
					}
				})
			)
			const rejected = results.find(
				(result): result is PromiseRejectedResult => result.status === 'rejected'
			)
			if (rejected) throw rejected.reason
		}
		const terminalNodeIds = workflow.nodes
			.filter((node) => !workflow.edges.some((edge) => edge.from === node.id))
			.map((node) => node.id)
		return terminalNodeIds.map((nodeId) => values.get(nodeId) ?? '').filter(Boolean).join('\n\n')
	} catch (error) {
		const cancelled = controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')
		runStatus = cancelled ? 'cancelled' : 'failed'
		controller.abort()
		for (const shape of shapesByNodeId.values()) {
			const latest = editor.getShape(shape.id)
			const status = latest && isWorkflowNode(latest) ? getWorkflowNodeMeta(latest).status : undefined
			if (status === 'queued' || status === 'running') {
				updateWorkflowNode(editor, shape, {
					status: cancelled ? 'cancelled' : 'failed',
					error: error instanceof Error ? error.message : String(error),
				})
			}
		}
		throw error
	} finally {
		if (runningControllers.get(editor) === controller) runningControllers.delete(editor)
		const finishedAt = new Date().toISOString()
		for (const node of workflow.nodes) {
			if (nodeResults[node.id]) continue
			const shape = shapesByNodeId.get(node.id)
			const current = shape ? editor.getShape(shape.id) : null
			const meta = current && isWorkflowNode(current) ? getWorkflowNodeMeta(current) : null
			const status =
				meta?.status === 'cancelled'
					? 'cancelled'
					: meta?.status === 'succeeded'
						? 'succeeded'
						: 'failed'
			nodeResults[node.id] = {
				nodeId: node.id,
				kind: node.kind,
				status,
				startedAt: runStartedAt,
				finishedAt,
				output: values.get(node.id) ?? meta?.config.value ?? '',
				...(meta?.error ? { error: meta.error } : {}),
				...(node.config.provider ? { provider: node.config.provider } : {}),
				...(node.config.model ? { model: node.config.model } : {}),
				...(node.config.baseUrl ? { baseUrl: node.config.baseUrl } : {}),
			}
		}
		await appendWorkflowRun({
			id: runId,
			workflowId,
			startedAt: runStartedAt,
			finishedAt,
			status: runStatus,
			nodeResults,
		})
		for (const shape of shapesByNodeId.values()) {
			const latest = editor.getShape(shape.id)
			if (!latest || !isWorkflowNode(latest)) continue
			const meta = getWorkflowNodeMeta(latest)
			if (meta.kind !== 'output' && meta.kind !== 'rich-output') continue
			updateWorkflowNode(editor, latest, {
				config: { ...meta.config, latestRunId: runId },
			})
		}
	}
}

export function stopWorkflow(editor: Editor) {
	runningControllers.get(editor)?.abort()
	runningControllers.delete(editor)
}

async function streamLlmNode(
	editor: Editor,
	workflow: WorkflowSpec,
	shape: WorkflowNodeShape,
	input: string,
	instructions: string | undefined,
	model: string | undefined,
	provider: string | undefined,
	baseUrl: string | undefined,
	runId: string,
	signal: AbortSignal
) {
	const isOpenRouter = provider === 'openrouter'
	const isCompatible = provider === 'compatible'
	const requestInit: RequestInit = {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			...(isOpenRouter
				? { Authorization: `Bearer ${requireOpenRouterApiKey()}` }
				: isCompatible && getCompatibleApiKey(baseUrl ?? '')
					? { Authorization: `Bearer ${getCompatibleApiKey(baseUrl ?? '')}` }
					: {}),
			'X-Workflow-Run-Id': runId,
		},
		cache: 'no-store',
		body: JSON.stringify({
			input,
			instructions: instructions || 'Transform the input into one executable next step.',
			model,
			provider: isOpenRouter
				? 'openrouter'
				: isCompatible
					? 'compatible'
					: model?.startsWith('amp-')
						? 'amp'
						: 'builtin',
			...(isCompatible ? { baseUrl } : {}),
			runId,
		}),
		signal,
	}
	let response: Response
	if (isCompatible) {
		try {
			response = await fetch('http://127.0.0.1:5176/workflow/llm', requestInit)
		} catch {
			throw new Error('OpenAI-compatible Base URL nodes require the local workflow bridge')
		}
	} else if (isOpenRouter || model?.startsWith('amp-')) {
		try {
			response = await fetch('http://127.0.0.1:5176/workflow/llm', requestInit)
		} catch {
			response = await fetch('/workflow/llm', requestInit)
		}
	} else {
		response = await fetch('/workflow/llm', requestInit)
	}
	if (!response.ok) throw new Error((await response.text()) || `LLM request failed (${response.status})`)
	if (!response.body) throw new Error('LLM response did not include a stream')

	const reader = response.body.getReader()
	const decoder = new TextDecoder()
	let output = ''
	while (true) {
		const { done, value } = await reader.read()
		if (done) break
		output += decoder.decode(value, { stream: true })
		updateWorkflowNode(editor, shape, {
			config: { ...getWorkflowNodeMeta(shape).config, lastOutput: output },
		})
		const downstreamOutputIds = workflow.edges
			.filter((edge) => edge.from === getWorkflowNodeMeta(shape).nodeId)
			.map((edge) => edge.to)
		for (const outputShape of findWorkflowNodes(
			editor,
			getWorkflowNodeMeta(shape).workflowId,
			downstreamOutputIds
		)) {
			updateWorkflowNode(editor, outputShape, {
				status: 'running',
				config: { ...getWorkflowNodeMeta(outputShape).config, value: output },
			})
		}
	}
	return output
}

function findWorkflowNodes(editor: Editor, workflowId: string, nodeIds: string[]) {
	const wanted = new Set(nodeIds)
	return editor
		.getCurrentPageShapes()
		.filter(isWorkflowNode)
		.filter((shape) => {
			const meta = getWorkflowNodeMeta(shape)
			return meta.workflowId === workflowId && wanted.has(meta.nodeId)
		})
}

function requireOpenRouterApiKey() {
	const apiKey = getOpenRouterApiKey()
	if (!apiKey) throw new Error('Connect OpenRouter in the selected LLM node first')
	return apiKey
}

function buildNodeResult({
	nodeId,
	kind,
	status,
	startedAt,
	output,
	error,
	provider,
	model,
	baseUrl,
}: {
	nodeId: string
	kind: string
	status: WorkflowRunNodeResult['status']
	startedAt: string
	output: string
	error?: string
	provider?: string
	model?: string
	baseUrl?: string
}): WorkflowRunNodeResult {
	return {
		nodeId,
		kind,
		status,
		startedAt,
		finishedAt: new Date().toISOString(),
		output,
		...(error ? { error } : {}),
		...(provider ? { provider } : {}),
		...(model ? { model } : {}),
		...(baseUrl ? { baseUrl } : {}),
	}
}
