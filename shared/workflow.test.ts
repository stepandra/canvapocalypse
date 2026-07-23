import { describe, expect, it } from 'vitest'
import {
	buildCurrentFlowSpec,
	buildEditableLlmWorkflowSpec,
	getExecutionLayers,
	getExecutionOrder,
	validateWorkflowSpec,
} from './workflow'
import { parseWorkflowLlmRequest } from './workflowLlm'

describe('buildCurrentFlowSpec', () => {
	it('describes the current ml-intern flow as a connected read-only graph', () => {
		const workflow = buildCurrentFlowSpec()

		expect(workflow.mode).toBe('readonly')
		expect(workflow.nodes.map((node) => node.kind)).toEqual([
			'input',
			'action',
			'llm',
			'action',
			'output',
		])
		expect(workflow.nodes.every((node) => node.readonly)).toBe(true)
		expect(workflow.edges).toHaveLength(workflow.nodes.length - 1)
		expect(workflow.edges[0]).toMatchObject({ fromPort: 'output', toPort: 'input' })
	})
})

describe('buildEditableLlmWorkflowSpec', () => {
	it('creates an editable INPUT → LLM → OUTPUT workflow with exact text ports', () => {
		const workflow = buildEditableLlmWorkflowSpec('candidate-flow')

		expect(workflow.mode).toBe('editable')
		expect(workflow.nodes.map((node) => node.kind)).toEqual(['input', 'llm', 'rich-output'])
		expect(workflow.nodes.every((node) => !node.readonly)).toBe(true)
		expect(workflow.nodes[1].config.instructions).toContain('ML workflow assistant')
		expect(validateWorkflowSpec(workflow)).toEqual([])
		expect(getExecutionOrder(workflow)).toEqual(['input', 'llm', 'output'])
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
		expect(validateWorkflowSpec(dangling)).toContain('Edge input->llm targets missing node missing')

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
