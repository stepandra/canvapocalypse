export type WorkflowRunStatus = 'succeeded' | 'failed' | 'cancelled'

export interface WorkflowRunNodeResult {
	nodeId: string
	kind: string
	status: 'succeeded' | 'failed' | 'cancelled'
	startedAt: string
	finishedAt: string
	output: string
	error?: string
	provider?: string
	model?: string
	baseUrl?: string
}

export interface WorkflowRunRecord {
	id: string
	workflowId: string
	startedAt: string
	finishedAt: string
	status: WorkflowRunStatus
	nodeResults: Record<string, WorkflowRunNodeResult>
}

export interface WorkflowRunJsonlRow {
	workflowId: string
	runId: string
	nodeId: string
	provider: string | undefined
	model: string | undefined
	sampleIndex: number
	status: WorkflowRunNodeResult['status']
	output: string | undefined
	error: string | undefined
}

function isPromptExperimentBatch(value: unknown): value is {
	schema: 'prompt-experiment-batch/v1'
	status: 'succeeded' | 'partial' | 'failed'
	samples: Array<{ index: number; status: 'succeeded' | 'failed'; output?: string; error?: string }>
} {
	if (typeof value !== 'object' || value === null) return false
	const candidate = value as Record<string, unknown>
	return (
		candidate.schema === 'prompt-experiment-batch/v1' &&
		Array.isArray(candidate.samples) &&
		candidate.samples.every(
			(sample) =>
				typeof sample === 'object' &&
				sample !== null &&
				typeof (sample as Record<string, unknown>).index === 'number' &&
				['succeeded', 'failed'].includes((sample as Record<string, unknown>).status as string)
		)
	)
}

export function exportWorkflowRunJsonl(run: WorkflowRunRecord): string {
	const rows: WorkflowRunJsonlRow[] = []
	const llmResults = Object.values(run.nodeResults)
		.filter((result) => result.kind === 'llm')
		.sort((a, b) => a.nodeId.localeCompare(b.nodeId))

	for (const result of llmResults) {
		let parsed: unknown
		try {
			parsed = JSON.parse(result.output)
		} catch {
			parsed = undefined
		}

		if (isPromptExperimentBatch(parsed)) {
			const orderedSamples = [...parsed.samples].sort((a, b) => a.index - b.index)
			for (const sample of orderedSamples) {
				rows.push({
					workflowId: run.workflowId,
					runId: run.id,
					nodeId: result.nodeId,
					provider: result.provider,
					model: result.model,
					sampleIndex: sample.index,
					status: sample.status,
					output: sample.output,
					error: sample.error,
				})
			}
		} else {
			rows.push({
				workflowId: run.workflowId,
				runId: run.id,
				nodeId: result.nodeId,
				provider: result.provider,
				model: result.model,
				sampleIndex: 0,
				status: result.status,
				output: result.output,
				error: result.error,
			})
		}
	}

	return rows.map((row) => JSON.stringify(row)).join('\n')
}

const DATABASE_NAME = 'canvapocalypse-workflow-runs'
const DATABASE_VERSION = 1
const STORE_NAME = 'runs'
const RUN_SAVED_EVENT = 'canvapocalypse:workflow-run-saved'

export async function appendWorkflowRun(run: WorkflowRunRecord) {
	const database = await openRunDatabase()
	await new Promise<void>((resolve, reject) => {
		const transaction = database.transaction(STORE_NAME, 'readwrite')
		transaction.objectStore(STORE_NAME).add(run)
		transaction.oncomplete = () => resolve()
		transaction.onerror = () => reject(transaction.error ?? new Error('Could not append workflow run'))
		transaction.onabort = () => reject(transaction.error ?? new Error('Workflow run append aborted'))
	})
	database.close()
	window.dispatchEvent(
		new CustomEvent(RUN_SAVED_EVENT, { detail: { runId: run.id, workflowId: run.workflowId } })
	)
}

export async function listWorkflowRuns(workflowId: string, limit = 100) {
	const database = await openRunDatabase()
	const runs = await new Promise<WorkflowRunRecord[]>((resolve, reject) => {
		const transaction = database.transaction(STORE_NAME, 'readonly')
		const index = transaction.objectStore(STORE_NAME).index('workflowId')
		const request = index.getAll(IDBKeyRange.only(workflowId))
		request.onsuccess = () => resolve((request.result as WorkflowRunRecord[]) ?? [])
		request.onerror = () => reject(request.error ?? new Error('Could not read workflow runs'))
	})
	database.close()
	return runs
		.sort((a, b) => b.startedAt.localeCompare(a.startedAt))
		.slice(0, Math.max(1, limit))
}

export function subscribeToWorkflowRuns(listener: (workflowId: string) => void) {
	const handle = (event: Event) => {
		const detail = (event as CustomEvent<{ workflowId?: unknown }>).detail
		if (typeof detail?.workflowId === 'string') listener(detail.workflowId)
	}
	window.addEventListener(RUN_SAVED_EVENT, handle)
	return () => window.removeEventListener(RUN_SAVED_EVENT, handle)
}

function openRunDatabase() {
	if (typeof indexedDB === 'undefined') {
		return Promise.reject(new Error('IndexedDB is unavailable; run history cannot be persisted'))
	}
	return new Promise<IDBDatabase>((resolve, reject) => {
		const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
		request.onupgradeneeded = () => {
			const database = request.result
			const store = database.objectStoreNames.contains(STORE_NAME)
				? request.transaction!.objectStore(STORE_NAME)
				: database.createObjectStore(STORE_NAME, { keyPath: 'id' })
			if (!store.indexNames.contains('workflowId')) {
				store.createIndex('workflowId', 'workflowId', { unique: false })
			}
		}
		request.onsuccess = () => resolve(request.result)
		request.onerror = () => reject(request.error ?? new Error('Could not open workflow run history'))
	})
}
