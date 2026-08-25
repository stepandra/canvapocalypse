import { useEffect, useState } from 'react'
import {
	createTLStore,
	type TLStore,
	type TLStoreOptions,
	type TLStoreSnapshot,
	type TLStoreWithStatus,
} from 'tldraw'

const DEFAULT_PROJECT_ENDPOINT = '/__canvas/project'
const DEFAULT_DEBOUNCE_MS = 500
const CANVAS_PROJECT_SCHEMA = 'canvas.portal-project/v1'
const CANVAS_PROJECT_UPDATE_SCHEMA = 'canvas.portal-project-update/v1'
const SHA256_PATTERN = /^[a-f0-9]{64}$/

export type CanvasStudioProjectStoreOptions = TLStoreOptions & {
	readonly inventorySha256: string
	readonly endpoint?: string
	readonly debounceMs?: number
	readonly fetch?: typeof globalThis.fetch
	readonly origin?: string
	readonly onError?: (error: Error) => void
}

export interface CanvasStudioProjectStoreController {
	readonly store: TLStore
	readonly revision: string
	readonly error: Error | null
	flush(options?: { keepalive?: boolean }): Promise<void>
	dispose(): Promise<void>
}

function strongEtag(response: Response, operation: string) {
	const etag = response.headers.get('etag')
	if (!etag || !/^"[^"\r\n]+"$/.test(etag)) {
		throw new Error(`Canvas project ${operation} requires a strong ETag`)
	}
	return etag
}

function projectUrl(endpoint: string, origin: string) {
	const url = new URL(endpoint, origin)
	if (url.origin !== origin) {
		throw new Error('Canvas project endpoint must be same-origin')
	}
	return url.href
}

function projectSnapshot(
	payload: unknown,
	inventorySha256: string,
	revision: string
): TLStoreSnapshot | null {
	if (
		!payload ||
		typeof payload !== 'object' ||
		Array.isArray(payload) ||
		Reflect.get(payload, 'schema') !== CANVAS_PROJECT_SCHEMA ||
		Reflect.get(payload, 'inventorySha256') !== inventorySha256 ||
		Reflect.get(payload, 'revision') !== revision.slice(1, -1) ||
		!('snapshot' in payload) ||
		(Reflect.get(payload, 'snapshot') !== null &&
			typeof Reflect.get(payload, 'snapshot') !== 'object')
	) {
		throw new Error('Canvas project API returned a mismatched project contract')
	}
	return Reflect.get(payload, 'snapshot') as TLStoreSnapshot | null
}

async function assertProjectUpdate(
	response: Response,
	revision: string
) {
	let payload: unknown
	try {
		payload = await response.json()
	} catch {
		throw new Error('Canvas project PUT returned invalid JSON')
	}
	if (
		!payload ||
		typeof payload !== 'object' ||
		Array.isArray(payload) ||
		Reflect.get(payload, 'schema') !== CANVAS_PROJECT_SCHEMA ||
		Reflect.get(payload, 'revision') !== revision.slice(1, -1) ||
		Reflect.get(payload, 'saved') !== true
	) {
		throw new Error('Canvas project PUT returned a mismatched project contract')
	}
}

/**
 * Opens the locked project portal store. Custom records are registered when
 * the store is created, before the project snapshot is fetched or loaded.
 */
export async function openCanvasStudioProjectStore(
	options: CanvasStudioProjectStoreOptions
): Promise<CanvasStudioProjectStoreController> {
	const {
		inventorySha256,
		endpoint = DEFAULT_PROJECT_ENDPOINT,
		debounceMs = DEFAULT_DEBOUNCE_MS,
		fetch: fetchProject = globalThis.fetch,
		origin = globalThis.location?.origin,
		onError,
		...storeOptions
	} = options
	if (!fetchProject) throw new Error('Canvas project portal requires fetch')
	if (!origin) throw new Error('Canvas project portal requires a browser origin')
	if (!SHA256_PATTERN.test(inventorySha256)) {
		throw new Error('Canvas project portal requires a locked inventory SHA-256')
	}
	if (!Number.isFinite(debounceMs) || debounceMs < 0) {
		throw new Error('Canvas project debounce must be a non-negative number')
	}

	const store = createTLStore(storeOptions)
	const url = projectUrl(endpoint, origin)
	const response = await fetchProject(url, {
		method: 'GET',
		headers: { accept: 'application/json' },
		credentials: 'same-origin',
	})
	if (!response.ok) {
		throw new Error(`Canvas project GET failed with HTTP ${response.status}`)
	}
	let revision = strongEtag(response, 'GET')
	let payload: unknown
	try {
		payload = await response.json()
	} catch {
		throw new Error('Canvas project API returned invalid JSON')
	}
	const snapshot = projectSnapshot(payload, inventorySha256, revision)
	if (snapshot) store.loadStoreSnapshot(snapshot)

	let dirty = false
	let timer: ReturnType<typeof setTimeout> | undefined
	let pendingWrite: Promise<void> | undefined
	let terminalError: Error | null = null
	let disposed = false
	let stopListening: () => void = () => undefined
	const fail = (cause: unknown) => {
		if (terminalError) return terminalError
		terminalError = cause instanceof Error ? cause : new Error(String(cause))
		if (timer) clearTimeout(timer)
		timer = undefined
		stopListening()
		try {
			onError?.(terminalError)
		} catch {
			// The terminal persistence error remains authoritative.
		}
		return terminalError
	}
	const write = async (keepalive: boolean) => {
		const expectedRevision = revision
		const snapshot = store.getStoreSnapshot()
		dirty = false
		const update = await fetchProject(url, {
			method: 'PUT',
			headers: {
				accept: 'application/json',
				'content-type': 'application/json',
				'if-match': expectedRevision,
			},
			credentials: 'same-origin',
			keepalive,
			body: JSON.stringify({
				schema: CANVAS_PROJECT_UPDATE_SCHEMA,
				snapshot,
			}),
		})
		if (!update.ok) {
			const conflict = update.status === 409 || update.status === 412
			throw new Error(
				conflict
					? `Canvas project revision ${expectedRevision} is stale`
					: `Canvas project PUT failed with HTTP ${update.status}`
			)
		}
		const nextRevision = strongEtag(update, 'PUT')
		if (nextRevision === expectedRevision) {
			throw new Error('Canvas project PUT did not advance its ETag')
		}
		await assertProjectUpdate(update, nextRevision)
		revision = nextRevision
	}
	const flush = async ({ keepalive = false }: { keepalive?: boolean } = {}) => {
		if (terminalError) throw terminalError
		if (timer) clearTimeout(timer)
		timer = undefined
		while (dirty || pendingWrite) {
			if (!pendingWrite) {
				pendingWrite = write(keepalive)
					.catch((error) => {
						throw fail(error)
					})
					.finally(() => {
						pendingWrite = undefined
					})
			}
			await pendingWrite
		}
	}
	const schedule = () => {
		dirty = true
		if (timer) clearTimeout(timer)
		timer = setTimeout(() => void flush().catch(() => undefined), debounceMs)
	}
	stopListening = store.listen(schedule, {
		scope: 'document',
		source: 'all',
	})

	return {
		store,
		get revision() {
			return revision
		},
		get error() {
			return terminalError
		},
		flush,
		async dispose() {
			if (disposed) return
			disposed = true
			try {
				await flush({ keepalive: true })
			} finally {
				if (timer) clearTimeout(timer)
				stopListening()
			}
		},
	}
}

/** React adapter for the locked portal. It never falls back to IndexedDB. */
export function useCanvasStudioProjectStore(
	options: CanvasStudioProjectStoreOptions
): TLStoreWithStatus {
	const [status, setStatus] = useState<TLStoreWithStatus>({ status: 'loading' })

	useEffect(() => {
		let active = true
		let controller: CanvasStudioProjectStoreController | undefined
		void openCanvasStudioProjectStore({
			...options,
			onError(error) {
				options.onError?.(error)
				if (active) setStatus({ status: 'error', error })
			},
		})
			.then((opened) => {
				controller = opened
				if (!active) return opened.dispose()
				setStatus({
					status: 'synced-remote',
					connectionStatus: 'online',
					store: opened.store,
				})
					return undefined
			})
			.catch((error) => {
				if (active) {
					setStatus({
						status: 'error',
						error: error instanceof Error ? error : new Error(String(error)),
					})
				}
			})

		const flush = () => void controller?.flush({ keepalive: true }).catch((error) => {
			if (active) setStatus({ status: 'error', error })
		})
		const onVisibilityChange = () => {
			if (document.visibilityState === 'hidden') flush()
		}
		window.addEventListener('pagehide', flush)
		document.addEventListener('visibilitychange', onVisibilityChange)
		return () => {
			active = false
			window.removeEventListener('pagehide', flush)
			document.removeEventListener('visibilitychange', onVisibilityChange)
			void controller?.dispose().catch(() => undefined)
		}
	}, [options])

	return status
}
