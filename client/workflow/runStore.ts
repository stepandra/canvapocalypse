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
