export interface ExperimentBatchControls {
	sampleCount: number
	sampleConcurrency: number
	temperature: number
	maxTokens: number
	samplingSeed?: number
}

export interface ExperimentBatchSampleContext {
	index: number
	signal?: AbortSignal
}

export interface ExperimentBatchOptions {
	sampleCount: number
	sampleConcurrency: number
	executeSample: (context: ExperimentBatchSampleContext) => Promise<string>
	signal?: AbortSignal
}

export interface ExperimentBatchSampleResult {
	index: number
	status: 'succeeded' | 'failed'
	output?: string
	error?: string
}

export interface ExperimentBatchResult {
	schema: 'prompt-experiment-batch/v1'
	status: 'succeeded' | 'partial' | 'failed'
	samples: ExperimentBatchSampleResult[]
}

const MIN_SAMPLE_COUNT = 1
const MAX_SAMPLE_COUNT = 100
const MIN_SAMPLE_CONCURRENCY = 1
const MAX_SAMPLE_CONCURRENCY = 8
const DEFAULT_TEMPERATURE = 0.2
const DEFAULT_MAX_TOKENS = 2048
const MIN_TEMPERATURE = 0
const MAX_TEMPERATURE = 2
const MIN_MAX_TOKENS = 256
const MAX_MAX_TOKENS = 8192

export function validateExperimentControls(
	config: Record<string, string | undefined>
): ExperimentBatchControls {
	const sampleCount = parseBoundedInt(
		config.sampleCount,
		MIN_SAMPLE_COUNT,
		MAX_SAMPLE_COUNT,
		'sampleCount',
		MIN_SAMPLE_COUNT
	)
	const sampleConcurrency = parseBoundedInt(
		config.sampleConcurrency,
		MIN_SAMPLE_CONCURRENCY,
		MAX_SAMPLE_CONCURRENCY,
		'sampleConcurrency',
		MIN_SAMPLE_CONCURRENCY
	)
	const temperature = parseBoundedFloat(
		config.temperature,
		MIN_TEMPERATURE,
		MAX_TEMPERATURE,
		'temperature',
		DEFAULT_TEMPERATURE
	)
	const maxTokens = parseBoundedInt(
		config.maxTokens,
		MIN_MAX_TOKENS,
		MAX_MAX_TOKENS,
		'maxTokens',
		DEFAULT_MAX_TOKENS
	)
	const samplingSeed =
		config.samplingSeed === undefined || config.samplingSeed === ''
			? undefined
			: parseBoundedInt(config.samplingSeed, Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, 'samplingSeed')

	return { sampleCount, sampleConcurrency, temperature, maxTokens, samplingSeed }
}

export async function runExperimentBatch(
	options: ExperimentBatchOptions
): Promise<ExperimentBatchResult> {
	const sampleCount = options.sampleCount
	const sampleConcurrency = options.sampleConcurrency

	if (
		!Number.isInteger(sampleCount) ||
		sampleCount < MIN_SAMPLE_COUNT ||
		sampleCount > MAX_SAMPLE_COUNT
	) {
		throw new Error(`sampleCount must be an integer between ${MIN_SAMPLE_COUNT} and ${MAX_SAMPLE_COUNT}`)
	}
	if (
		!Number.isInteger(sampleConcurrency) ||
		sampleConcurrency < MIN_SAMPLE_CONCURRENCY ||
		sampleConcurrency > MAX_SAMPLE_CONCURRENCY
	) {
		throw new Error(
			`sampleConcurrency must be an integer between ${MIN_SAMPLE_CONCURRENCY} and ${MAX_SAMPLE_CONCURRENCY}`
		)
	}

	const samples: ExperimentBatchSampleResult[] = Array.from({ length: sampleCount }, (_, index) => ({
		index,
		status: 'succeeded',
		output: undefined,
		error: undefined,
	}))

	const queue = Array.from({ length: sampleCount }, (_, index) => index)
	let next = 0
	const parentSignal = options.signal

	async function worker(): Promise<void> {
		while (next < queue.length) {
			if (parentSignal?.aborted) throw new DOMException('Experiment batch cancelled', 'AbortError')
			const index = queue[next]!
			next += 1
			const controller = new AbortController()
			const handleAbort = () => controller.abort()
			parentSignal?.addEventListener('abort', handleAbort, { once: true })
			if (parentSignal?.aborted) controller.abort()
			try {
				const output = await options.executeSample({ index, signal: controller.signal })
				samples[index] = { index, status: 'succeeded', output, error: undefined }
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error)
				samples[index] = { index, status: 'failed', output: undefined, error: message }
			} finally {
				parentSignal?.removeEventListener('abort', handleAbort)
			}
		}
	}

	const workers = Array.from({ length: sampleConcurrency }, () => worker())
	await Promise.all(workers)

	const failedCount = samples.filter((sample) => sample.status === 'failed').length
	return {
		schema: 'prompt-experiment-batch/v1',
		status:
			failedCount === 0
				? 'succeeded'
				: failedCount === samples.length
					? 'failed'
					: 'partial',
		samples,
	}
}

export function createCanvasOutputPreview(raw: string, maxChars = 12_000): string {
	if (raw.length <= maxChars) return raw
	try {
		const parsed = JSON.parse(raw) as {
			schema?: unknown
			status?: unknown
			samples?: Array<{ status?: unknown }>
		}
		if (parsed.schema === 'prompt-experiment-batch/v1' && Array.isArray(parsed.samples)) {
			const succeeded = parsed.samples.filter((sample) => sample.status === 'succeeded').length
			return JSON.stringify({
				schema: 'prompt-experiment-canvas-receipt/v1',
				status: parsed.status,
				sampleCount: parsed.samples.length,
				succeeded,
				failed: parsed.samples.length - succeeded,
				fullOutput: 'saved-in-run-history',
			})
		}
	} catch {
		// Fall through to a generic bounded receipt.
	}
	return JSON.stringify({
		schema: 'workflow-output-canvas-receipt/v1',
		characters: raw.length,
		preview: raw.slice(0, Math.min(1000, maxChars)),
		fullOutput: 'saved-in-run-history',
	})
}

function parseBoundedInt(
	raw: string | undefined,
	min: number,
	max: number,
	name: string,
	defaultValue?: number
): number {
	if (raw === undefined || raw === '') {
		if (defaultValue !== undefined) return defaultValue
		throw new Error(`${name} is required`)
	}
	const value = Number(raw)
	if (!Number.isFinite(value) || !Number.isInteger(value)) {
		throw new Error(`${name} must be an integer`)
	}
	if (value < min || value > max) {
		throw new Error(`${name} must be between ${min} and ${max}`)
	}
	return value
}

function parseBoundedFloat(
	raw: string | undefined,
	min: number,
	max: number,
	name: string,
	defaultValue?: number
): number {
	if (raw === undefined || raw === '') {
		if (defaultValue !== undefined) return defaultValue
		throw new Error(`${name} is required`)
	}
	const value = Number(raw)
	if (!Number.isFinite(value)) {
		throw new Error(`${name} must be a number`)
	}
	if (value < min || value > max) {
		throw new Error(`${name} must be between ${min} and ${max}`)
	}
	return value
}
