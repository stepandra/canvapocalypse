import { describe, expect, it } from 'vitest'
import {
	buildCurrentFlowSpec,
	buildEditableLlmWorkflowSpec,
	buildMlflowWorkflowSpec,
	buildPromptExperimentWorkflowSpec,
	extractTemplateVariables,
	getExecutionLayers,
	getExecutionOrder,
	renderMlflowReference,
	renderPromptTemplate,
	validateWorkflowSpec,
} from './workflow'
import { parseWorkflowLlmRequest } from './workflowLlm'

describe('buildCurrentFlowSpec', () => {
	it('describes the terminal-first ML-Intern flow with an interactive bounded context step', () => {
		const workflow = buildCurrentFlowSpec()

		expect(workflow.mode).toBe('readonly')
		expect(workflow.nodes.map((node) => node.kind)).toEqual([
			'input',
			'context',
			'agent',
			'action',
			'output',
		])
		expect(workflow.nodes.find((node) => node.kind === 'context')?.readonly).toBe(false)
		expect(workflow.nodes.find((node) => node.kind === 'agent')?.config.agentProvider).toBe('amp')
		expect(workflow.edges).toHaveLength(workflow.nodes.length - 1)
		expect(workflow.edges[0]).toMatchObject({ fromPort: 'output', toPort: 'input' })
	})
})

describe('buildEditableLlmWorkflowSpec', () => {
	it('creates an editable INPUT → LLM → OUTPUT workflow with exact text ports', () => {
		const workflow = buildEditableLlmWorkflowSpec('candidate-flow')

		expect(workflow.mode).toBe('editable')
		expect(workflow.nodes.map((node) => node.kind)).toEqual([
			'input',
			'prompt-template',
			'llm',
			'rich-output',
		])
		expect(workflow.nodes.every((node) => !node.readonly)).toBe(true)
		expect(workflow.nodes.find((node) => node.kind === 'llm')?.config.instructions).toContain(
			'ML workflow assistant'
		)
		expect(workflow.nodes.find((node) => node.kind === 'llm')?.config).toMatchObject({
			provider: 'builtin',
			model: 'claude-sonnet-4-5',
		})
		expect(validateWorkflowSpec(workflow)).toEqual([])
		expect(getExecutionOrder(workflow)).toEqual(['input', 'prompt', 'llm', 'output'])
	})
})

describe('buildMlflowWorkflowSpec', () => {
	it('creates native MLflow cards with artifact ports and no direct infrastructure route', () => {
		const workflow = buildMlflowWorkflowSpec('mlflow-native')

		expect(workflow.nodes.map((node) => node.kind)).toEqual([
			'mlflow-experiment',
			'mlflow-run',
			'mlflow-evaluation',
			'mlflow-model',
		])
		expect(
			workflow.nodes
				.flatMap((node) => node.ports)
				.every((port) => port.valueType === 'artifact')
		).toBe(true)
		expect(validateWorkflowSpec(workflow)).toEqual([])
		expect(JSON.stringify(workflow)).not.toMatch(/isoflow/i)
		expect(
			renderMlflowReference(
				'mlflow-evaluation',
				{ datasetRef: 'dataset:eval-v3', evaluator: 'default' },
				'run:123'
			)
		).toContain('"schema":"mlflow-workflow-reference/v1"')
	})
})

describe('getExecutionLayers', () => {
	it('places independent model branches in the same parallel execution layer', () => {
		const workflow = buildEditableLlmWorkflowSpec('parallel-flow')
		const originalLlm = workflow.nodes.find((node) => node.id === 'llm')!
		const originalOutput = workflow.nodes.find((node) => node.id === 'output')!
		workflow.nodes = [
			workflow.nodes[0],
			{ ...originalLlm, id: 'llm-a' },
			{ ...originalLlm, id: 'llm-b' },
			{ ...originalOutput, id: 'output-a' },
			{ ...originalOutput, id: 'output-b' },
		]
		workflow.edges = [
			{ id: 'input->llm-a', from: 'input', fromPort: 'output', to: 'llm-a', toPort: 'input' },
			{ id: 'input->llm-b', from: 'input', fromPort: 'output', to: 'llm-b', toPort: 'input' },
			{ id: 'llm-a->output-a', from: 'llm-a', fromPort: 'output', to: 'output-a', toPort: 'input' },
			{ id: 'llm-b->output-b', from: 'llm-b', fromPort: 'output', to: 'output-b', toPort: 'input' },
		]

		expect(validateWorkflowSpec(workflow)).toEqual([])
		expect(getExecutionLayers(workflow)).toEqual([
			['input'],
			['llm-a', 'llm-b'],
			['output-a', 'output-b'],
		])
	})
})

describe('validateWorkflowSpec', () => {
	it('rejects dangling edges and cycles before execution', () => {
		const dangling = buildEditableLlmWorkflowSpec('dangling')
		dangling.edges[0].to = 'missing'
		expect(validateWorkflowSpec(dangling)).toContain('Edge input->prompt targets missing node missing')

		const cyclic = buildEditableLlmWorkflowSpec('cyclic')
		cyclic.edges.push({
			id: 'output->input',
			from: 'output',
			fromPort: 'output',
			to: 'input',
			toPort: 'input',
		})
		expect(() => getExecutionOrder(cyclic)).toThrow(/cycle/i)
	})
})

describe('prompt template nodes', () => {
	it('finds unique variables and renders upstream input without losing unresolved fields', () => {
		const template = 'Role: {role}\\nInput: {candidate}\\nAgain: {role}'
		expect(extractTemplateVariables(template)).toEqual(['role', 'candidate'])
		expect(
			renderPromptTemplate(
				{
					template,
					inputVariable: 'candidate',
					'var:role': 'ML Engineer',
				},
				'Senior Python developer'
			)
		).toBe('Role: ML Engineer\\nInput: Senior Python developer\\nAgain: ML Engineer')
	})
})

describe('buildPromptExperimentWorkflowSpec', () => {
it('creates an editable SEED INPUT → PROMPT TEMPLATE → LLM → RICH OUTPUT workflow', () => {
	const workflow = buildPromptExperimentWorkflowSpec('prompt-exp-1')

	expect(workflow.id).toBe('prompt-exp-1')
	expect(workflow.mode).toBe('editable')
	expect(workflow.nodes.map((node) => node.kind)).toEqual([
		'input',
		'prompt-template',
		'llm',
		'rich-output',
	])
	expect(workflow.nodes.map((node) => node.id)).toEqual([
		'seed-input',
		'prompt-template',
		'llm',
		'rich-output',
	])
	expect(workflow.nodes.every((node) => !node.readonly)).toBe(true)

	const input = workflow.nodes.find((node) => node.id === 'seed-input')!
	expect(input.title.toLowerCase()).toContain('seed')

	const prompt = workflow.nodes.find((node) => node.id === 'prompt-template')!
	expect(prompt.config.template).toContain('{input}')
	expect(prompt.config.inputVariable).toBe('input')

	const llm = workflow.nodes.find((node) => node.id === 'llm')!
	expect(llm.config).toMatchObject({
		provider: 'builtin',
		model: 'claude-sonnet-4-5',
		sampleCount: '8',
		sampleConcurrency: '4',
		temperature: '0.8',
		maxTokens: '2048',
	})

	expect(validateWorkflowSpec(workflow)).toEqual([])
	expect(getExecutionOrder(workflow)).toEqual(['seed-input', 'prompt-template', 'llm', 'rich-output'])
})
})
describe('parseWorkflowLlmRequest', () => {
	it('accepts bounded text requests and rejects empty or oversized input', () => {
		expect(
			parseWorkflowLlmRequest({
				input: 'dataset summary',
				instructions: 'Return one next step.',
				model: 'openai/gpt-4.1-mini',
				provider: 'openrouter',
			})
		).toMatchObject({
			input: 'dataset summary',
			instructions: 'Return one next step.',
			model: 'openai/gpt-4.1-mini',
			provider: 'openrouter',
		})
		expect(() => parseWorkflowLlmRequest({ input: '', instructions: 'x' })).toThrow(/input/i)
		expect(() =>
			parseWorkflowLlmRequest({ input: 'x', instructions: 'x', provider: 'openrouter' })
		).toThrow(/model/i)
		expect(() => parseWorkflowLlmRequest({ input: 'x'.repeat(20_001), instructions: 'x' })).toThrow(
			/too long/i
		)
	})

	it('accepts an explicit OpenAI-compatible Base URL and rejects unsafe protocols', () => {
		expect(
			parseWorkflowLlmRequest({
				input: 'dataset summary',
				instructions: 'Return JSON.',
				model: 'llama3.2',
				provider: 'compatible',
				baseUrl: 'http://127.0.0.1:11434/v1',
				runId: 'run-123',
			})
		).toMatchObject({
			provider: 'compatible',
			baseUrl: 'http://127.0.0.1:11434/v1',
			model: 'llama3.2',
			runId: 'run-123',
		})
		expect(() =>
			parseWorkflowLlmRequest({
				input: 'x',
				instructions: 'x',
				model: 'x',
				provider: 'compatible',
				baseUrl: 'file:///tmp/models',
			})
		).toThrow(/http/i)
	})
})
