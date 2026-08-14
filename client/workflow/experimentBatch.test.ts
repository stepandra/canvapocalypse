import { describe, expect, it } from 'vitest'
import {
	createCanvasOutputPreview,
	runExperimentBatch,
	validateExperimentControls,
	ExperimentBatchOptions,
} from './experimentBatch'

describe('runExperimentBatch', () => {
	const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

	function makeOptions(
		overrides: Partial<ExperimentBatchOptions> = {}
	): ExperimentBatchOptions {
		return {
			sampleCount: 3,
			sampleConcurrency: 2,
			executeSample: async ({ index }) => `output-${index}`,
			...overrides,
		}
	}

	it('returns one sample result per requested sample', async () => {
		const result = await runExperimentBatch(makeOptions({ sampleCount: 5 }))
		expect(result.samples).toHaveLength(5)
		expect(result.samples.map((s) => s.index)).toEqual([0, 1, 2, 3, 4])
	})

	it('returns the compact JSON schema prompt-experiment-batch/v1', async () => {
		const result = await runExperimentBatch(makeOptions())
		expect(result.schema).toBe('prompt-experiment-batch/v1')
		expect(JSON.parse(JSON.stringify(result))).toEqual(result)
	})

	it('preserves per-sample status, output and error', async () => {
		const result = await runExperimentBatch(
			makeOptions({
				sampleCount: 3,
				executeSample: async ({ index }) => {
					if (index === 1) throw new Error('boom')
					return `ok-${index}`
				},
			})
		)
		expect(result.samples[0]).toEqual({ index: 0, status: 'succeeded', output: 'ok-0', error: undefined })
		expect(result.samples[1]).toEqual({ index: 1, status: 'failed', output: undefined, error: 'boom' })
		expect(result.samples[2]).toEqual({ index: 2, status: 'succeeded', output: 'ok-2', error: undefined })
		expect(result.status).toBe('partial')
	})

	it('keeps successful outputs when some samples fail', async () => {
		const result = await runExperimentBatch(
			makeOptions({
				sampleCount: 4,
				executeSample: async ({ index }) => {
					if (index === 2) throw new Error('partial')
					return `sample-${index}`
				},
			})
		)
		const succeeded = result.samples.filter((s) => s.status === 'succeeded')
		expect(succeeded).toHaveLength(3)
		expect(result.samples.find((s) => s.index === 2)?.error).toBe('partial')
	})

	it('fails the batch when all samples fail', async () => {
		const result = await runExperimentBatch(
			makeOptions({
				sampleCount: 3,
				executeSample: async () => {
					throw new Error('always')
				},
			})
		)
		expect(result.status).toBe('failed')
		expect(result.samples.every((s) => s.status === 'failed')).toBe(true)
	})

	it('succeeds when every sample succeeds', async () => {
		const result = await runExperimentBatch(makeOptions({ sampleCount: 2 }))
		expect(result.status).toBe('succeeded')
	})

	it('respects sampleConcurrency not exceeding the bound', async () => {
		let running = 0
		let maxRunning = 0
		const result = await runExperimentBatch(
			makeOptions({
				sampleCount: 8,
				sampleConcurrency: 3,
				executeSample: async () => {
					running += 1
					maxRunning = Math.max(maxRunning, running)
					await sleep(20)
					running -= 1
					return 'ok'
				},
			})
		)
		expect(result.status).toBe('succeeded')
		expect(maxRunning).toBeLessThanOrEqual(3)
	})

	it('runs samples with concurrency greater than 1 in parallel', async () => {
		let running = 0
		let maxRunning = 0
		await runExperimentBatch(
			makeOptions({
				sampleCount: 4,
				sampleConcurrency: 4,
				executeSample: async () => {
					running += 1
					maxRunning = Math.max(maxRunning, running)
					await sleep(40)
					running -= 1
					return 'ok'
				},
			})
		)
		expect(maxRunning).toBeGreaterThan(1)
	})

	it('propagates abort signal to executeSample', async () => {
		const controller = new AbortController()
		const result = await runExperimentBatch(
			makeOptions({
				sampleCount: 2,
				sampleConcurrency: 2,
				signal: controller.signal,
				executeSample: async ({ signal }) => {
					await sleep(10)
					if (signal?.aborted) throw new Error('aborted')
					return 'ok'
				},
			})
		)
		expect(result.status).toBe('succeeded')
	})

	it('passes a per-sample signal that aborts when the parent signal aborts', async () => {
		const controller = new AbortController()
		let abortedIndex: number | undefined
		const promise = runExperimentBatch(
			makeOptions({
				sampleCount: 2,
				sampleConcurrency: 2,
				signal: controller.signal,
				executeSample: async ({ index, signal }) => {
					await sleep(20)
					if (signal?.aborted) {
						abortedIndex = index
						throw new Error('aborted')
					}
					return 'ok'
				},
			})
		)
		controller.abort()
		const result = await promise
		expect(result.status).toBe('failed')
		expect(abortedIndex).toBeDefined()
	})

	it('throws synchronously for out-of-range sampleCount', async () => {
		await expect(runExperimentBatch(makeOptions({ sampleCount: 0 }))).rejects.toThrow('sampleCount')
		await expect(runExperimentBatch(makeOptions({ sampleCount: 101 }))).rejects.toThrow('sampleCount')
	})

	it('throws synchronously for out-of-range sampleConcurrency', async () => {
		await expect(runExperimentBatch(makeOptions({ sampleConcurrency: 0 }))).rejects.toThrow(
			'sampleConcurrency'
		)
		await expect(runExperimentBatch(makeOptions({ sampleConcurrency: 9 }))).rejects.toThrow(
			'sampleConcurrency'
		)
	})

	it('serializes to a compact JSON string with ordered samples', async () => {
		const result = await runExperimentBatch(makeOptions({ sampleCount: 3 }))
		const json = JSON.stringify(result)
		const parsed = JSON.parse(json)
		expect(parsed.schema).toBe('prompt-experiment-batch/v1')
		expect(parsed.status).toBe('succeeded')
		expect(parsed.samples).toHaveLength(3)
		expect(parsed.samples[0].index).toBe(0)
	})
})

describe('validateExperimentControls', () => {
	it('preserves legacy single-run workflows with safe defaults', () => {
		expect(validateExperimentControls({})).toEqual({
			sampleCount: 1,
			sampleConcurrency: 1,
			temperature: 0.2,
			maxTokens: 2048,
			samplingSeed: undefined,
		})
	})
})

describe('createCanvasOutputPreview', () => {
	it('keeps ordinary small outputs unchanged', () => {
		expect(createCanvasOutputPreview('small output')).toBe('small output')
	})

	it('replaces oversized experiment batches with a bounded receipt', () => {
		const raw = JSON.stringify({
			schema: 'prompt-experiment-batch/v1',
			status: 'partial',
			samples: [
				{ index: 0, status: 'succeeded', output: 'x'.repeat(200) },
				{ index: 1, status: 'failed', error: 'boom' },
			],
		})
		const preview = JSON.parse(createCanvasOutputPreview(raw, 80))
		expect(preview).toMatchObject({
			schema: 'prompt-experiment-canvas-receipt/v1',
			status: 'partial',
			sampleCount: 2,
			succeeded: 1,
			failed: 1,
			fullOutput: 'saved-in-run-history',
		})
		expect(JSON.stringify(preview).length).toBeLessThan(500)
	})
})
