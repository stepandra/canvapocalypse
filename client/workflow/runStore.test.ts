import { describe, expect, it } from 'vitest'
import { exportWorkflowRunJsonl, WorkflowRunRecord } from './runStore'

describe('exportWorkflowRunJsonl', () => {
	const makeRun = (overrides: Partial<WorkflowRunRecord> = {}): WorkflowRunRecord => ({
		id: 'run-1',
		workflowId: 'wf-1',
		startedAt: '2026-08-09T10:00:00.000Z',
		finishedAt: '2026-08-09T10:00:01.000Z',
		status: 'succeeded',
		nodeResults: {},
		...overrides,
	})

	it('emits one JSONL row per legacy plain LLM output', () => {
		const run = makeRun({
			nodeResults: {
				'llm-a': {
					nodeId: 'llm-a',
					kind: 'llm',
					status: 'succeeded',
					startedAt: '2026-08-09T10:00:00.000Z',
					finishedAt: '2026-08-09T10:00:01.000Z',
					output: 'hello',
					provider: 'openrouter',
					model: 'anthropic/claude-3.5-sonnet',
					baseUrl: 'https://api.openrouter.ai/api/v1',
				},
			},
		})
		const jsonl = exportWorkflowRunJsonl(run)
		const rows = jsonl.trim().split('\n').map((line) => JSON.parse(line))
		expect(rows).toHaveLength(1)
		expect(rows[0]).toEqual({
			workflowId: 'wf-1',
			runId: 'run-1',
			nodeId: 'llm-a',
			provider: 'openrouter',
			model: 'anthropic/claude-3.5-sonnet',
			sampleIndex: 0,
			status: 'succeeded',
			output: 'hello',
			error: undefined,
		})
		expect(rows[0]).not.toHaveProperty('baseUrl')
	})

	it('expands prompt-experiment-batch/v1 outputs into one row per sample', () => {
		const run = makeRun({
			nodeResults: {
				'llm-a': {
					nodeId: 'llm-a',
					kind: 'llm',
					status: 'failed',
					startedAt: '2026-08-09T10:00:00.000Z',
					finishedAt: '2026-08-09T10:00:01.000Z',
					output: JSON.stringify({
						schema: 'prompt-experiment-batch/v1',
						status: 'failed',
						samples: [
							{ index: 0, status: 'succeeded', output: 'out-0' },
							{ index: 1, status: 'failed', error: 'boom' },
						],
					}),
					provider: 'compatible',
					model: 'local-model',
				},
			},
		})
		const jsonl = exportWorkflowRunJsonl(run)
		const rows = jsonl.trim().split('\n').map((line) => JSON.parse(line))
		expect(rows).toHaveLength(2)
		expect(rows[0]).toEqual({
			workflowId: 'wf-1',
			runId: 'run-1',
			nodeId: 'llm-a',
			provider: 'compatible',
			model: 'local-model',
			sampleIndex: 0,
			status: 'succeeded',
			output: 'out-0',
			error: undefined,
		})
		expect(rows[1]).toEqual({
			workflowId: 'wf-1',
			runId: 'run-1',
			nodeId: 'llm-a',
			provider: 'compatible',
			model: 'local-model',
			sampleIndex: 1,
			status: 'failed',
			output: undefined,
			error: 'boom',
		})
	})

	it('produces deterministic order by nodeId then sampleIndex', () => {
		const run = makeRun({
			nodeResults: {
				'z-node': {
					nodeId: 'z-node',
					kind: 'llm',
					status: 'succeeded',
					startedAt: '2026-08-09T10:00:00.000Z',
					finishedAt: '2026-08-09T10:00:01.000Z',
					output: 'z-only',
				},
				'a-node': {
					nodeId: 'a-node',
					kind: 'llm',
					status: 'succeeded',
					startedAt: '2026-08-09T10:00:00.000Z',
					finishedAt: '2026-08-09T10:00:01.000Z',
					output: JSON.stringify({
						schema: 'prompt-experiment-batch/v1',
						status: 'succeeded',
						samples: [
							{ index: 2, status: 'succeeded', output: 'a-2' },
							{ index: 0, status: 'succeeded', output: 'a-0' },
							{ index: 1, status: 'succeeded', output: 'a-1' },
						],
					}),
				},
			},
		})
		const rows = exportWorkflowRunJsonl(run)
			.trim()
			.split('\n')
			.map((line) => JSON.parse(line))
		expect(rows.map((row) => `${row.nodeId}:${row.sampleIndex}`)).toEqual([
			'a-node:0',
			'a-node:1',
			'a-node:2',
			'z-node:0',
		])
	})

	it('skips non-LLM nodes', () => {
		const run = makeRun({
			nodeResults: {
				'input-1': {
					nodeId: 'input-1',
					kind: 'input',
					status: 'succeeded',
					startedAt: '2026-08-09T10:00:00.000Z',
					finishedAt: '2026-08-09T10:00:01.000Z',
					output: 'seed',
				},
				'llm-1': {
					nodeId: 'llm-1',
					kind: 'llm',
					status: 'succeeded',
					startedAt: '2026-08-09T10:00:00.000Z',
					finishedAt: '2026-08-09T10:00:01.000Z',
					output: 'hello',
				},
			},
		})
		const rows = exportWorkflowRunJsonl(run)
			.trim()
			.split('\n')
			.map((line) => JSON.parse(line))
		expect(rows).toHaveLength(1)
		expect(rows[0].nodeId).toBe('llm-1')
	})

	it('treats malformed batch JSON as a single failed sample with raw output', () => {
		const run = makeRun({
			nodeResults: {
				'llm-bad': {
					nodeId: 'llm-bad',
					kind: 'llm',
					status: 'succeeded',
					startedAt: '2026-08-09T10:00:00.000Z',
					finishedAt: '2026-08-09T10:00:01.000Z',
					output: 'not-json',
					error: 'parse failure',
				},
			},
		})
		const rows = exportWorkflowRunJsonl(run)
			.trim()
			.split('\n')
			.map((line) => JSON.parse(line))
		expect(rows).toHaveLength(1)
		expect(rows[0]).toEqual({
			workflowId: 'wf-1',
			runId: 'run-1',
			nodeId: 'llm-bad',
			provider: undefined,
			model: undefined,
			sampleIndex: 0,
			status: 'succeeded',
			output: 'not-json',
			error: 'parse failure',
		})
	})

	it('returns empty string when there are no LLM results', () => {
		const run = makeRun({
			nodeResults: {
				'input-1': {
					nodeId: 'input-1',
					kind: 'input',
					status: 'succeeded',
					startedAt: '2026-08-09T10:00:00.000Z',
					finishedAt: '2026-08-09T10:00:01.000Z',
					output: 'seed',
				},
			},
		})
		expect(exportWorkflowRunJsonl(run)).toBe('')
	})
})
