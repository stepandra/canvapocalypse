import {
	createContext,
	ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react'
import { useValue } from 'tldraw'
import {
	type CompanionCanvasToolReceipt,
	type CompanionCanvasToolRequest,
	type CompanionCanvasToolStatus,
	executeCompanionCanvasToolRequest,
	getCompanionCanvasToolStatus,
	leaseCompanionCanvasToolRequest,
	postCompanionCanvasToolReceipt,
} from '../agent/companionCanvasTool'
import type { TldrawAgent } from '../agent/TldrawAgent'
import { useAgent } from '../agent/TldrawAgentAppProvider'

const POLL_INTERVAL_MS = 1_500

export type CompanionBridgeState =
	| 'connecting'
	| 'ready'
	| 'applying'
	| 'failed'
	| 'offline'

export interface CompanionCanvasBridgeValue {
	state: CompanionBridgeState
	status: CompanionCanvasToolStatus | null
	error: string
	latestReceipt: CompanionCanvasToolReceipt | null
	refresh(): void
}

const CompanionCanvasBridgeContext =
	createContext<CompanionCanvasBridgeValue | null>(null)

type CompanionCanvasReceiptLease = Readonly<
	Pick<CompanionCanvasToolRequest, 'leaseToken' | 'canvasBinding'>
>

export interface CompanionCanvasLocalExecutionOutcome {
	readonly receipt: Readonly<CompanionCanvasToolReceipt>
	readonly lease: CompanionCanvasReceiptLease
	readonly executionError: string
}

export type CompanionCanvasReceiptDeliveryAttempt =
	| Readonly<{
			status: 'delivered'
			outcome: CompanionCanvasLocalExecutionOutcome
		}>
	| Readonly<{
			status: 'unknown'
			outcome: CompanionCanvasLocalExecutionOutcome
			error: string
		}>

type CompanionCanvasRequestExecutor = (
	agent: TldrawAgent,
	request: CompanionCanvasToolRequest
) => Promise<CompanionCanvasToolReceipt>

type CompanionCanvasReceiptDeliverer = (
	receipt: CompanionCanvasToolReceipt,
	lease: Pick<CompanionCanvasToolRequest, 'leaseToken' | 'canvasBinding'>
) => Promise<unknown>

export interface CompanionCanvasReceiptDeliveryQueue {
	getPending(): CompanionCanvasLocalExecutionOutcome | null
	stage(outcome: CompanionCanvasLocalExecutionOutcome): void
	attempt(): Promise<CompanionCanvasReceiptDeliveryAttempt | null>
}

/**
 * Settle canvas execution exactly once. Receipt transport is intentionally not
 * part of this catch boundary: once a success receipt exists, a later network
 * failure must never rewrite the local outcome to failed.
 */
export async function executeCompanionCanvasRequestLocally(
	agent: TldrawAgent,
	request: CompanionCanvasToolRequest,
	execute: CompanionCanvasRequestExecutor = executeCompanionCanvasToolRequest
): Promise<CompanionCanvasLocalExecutionOutcome> {
	try {
		const receipt = await execute(agent, request)
		return freezeLocalExecutionOutcome(
			request,
			receipt,
			receipt.status === 'failed' ? receipt.summary : ''
		)
	} catch (executionError) {
		const summary = errorSummary(executionError)
		return freezeLocalExecutionOutcome(
			request,
			{
				requestId: request.id,
				status: 'failed',
				capabilityId: request.capabilityId,
				summary,
			},
			summary
		)
	}
}

/**
 * Retain a locally settled outcome until its exact receipt is acknowledged.
 * An unsuccessful attempt is delivery-unknown: retrying never re-executes the
 * canvas operation and never manufactures a different terminal receipt.
 */
export function createCompanionCanvasReceiptDeliveryQueue(
	deliver: CompanionCanvasReceiptDeliverer = postCompanionCanvasToolReceipt
): CompanionCanvasReceiptDeliveryQueue {
	let pending: CompanionCanvasLocalExecutionOutcome | null = null

	return Object.freeze({
		getPending: () => pending,
		stage: (outcome: CompanionCanvasLocalExecutionOutcome) => {
			if (pending && pending !== outcome) {
				throw new Error(
					'Cannot replace an unacknowledged companion canvas execution outcome'
				)
			}
			pending = outcome
		},
		attempt: async () => {
			const outcome = pending
			if (!outcome) return null
			try {
				await deliver(
					outcome.receipt as CompanionCanvasToolReceipt,
					outcome.lease
				)
				if (pending === outcome) pending = null
				return Object.freeze({
					status: 'delivered' as const,
					outcome,
				})
			} catch (deliveryError) {
				return Object.freeze({
					status: 'unknown' as const,
					outcome,
					error: errorSummary(deliveryError),
				})
			}
		},
	})
}

function freezeLocalExecutionOutcome(
	request: CompanionCanvasToolRequest,
	receipt: CompanionCanvasToolReceipt,
	executionError: string
): CompanionCanvasLocalExecutionOutcome {
	return Object.freeze({
		receipt: Object.freeze({ ...receipt }),
		lease: Object.freeze({
			...(request.leaseToken ? { leaseToken: request.leaseToken } : {}),
			...(request.canvasBinding ? { canvasBinding: request.canvasBinding } : {}),
		}),
		executionError,
	})
}

function errorSummary(error: unknown) {
	return error instanceof Error ? error.message : String(error)
}

export function resolveCompanionCanvasBridgeIdlePresentation(
	localReceipt: Pick<CompanionCanvasToolReceipt, 'status' | 'summary'> | null,
	status: CompanionCanvasToolStatus | null
): Readonly<{ state: 'ready' | 'failed'; error: string }> {
	const latest = localReceipt ?? status?.latest ?? null
	if (latest?.status === 'failed') {
		return Object.freeze({
			state: 'failed' as const,
			error: latest.summary || 'Latest validated canvas operation failed',
		})
	}
	return Object.freeze({ state: 'ready' as const, error: '' })
}

/**
 * Headless live-canvas executor shared by every Workbench pack. External
 * companions enqueue bounded plans; this controller validates and applies them
 * without owning their thread, planner prompt, history, or credentials.
 */
export function CompanionCanvasBridgeController({
	children,
}: {
	children: ReactNode
}) {
	const agent = useAgent()
	const [status, setStatus] = useState<CompanionCanvasToolStatus | null>(null)
	const [state, setState] = useState<CompanionBridgeState>('connecting')
	const [error, setError] = useState('')
	const [latestReceipt, setLatestReceipt] =
		useState<CompanionCanvasToolReceipt | null>(null)
	const processingRef = useRef(false)
	const mountedRef = useRef(true)
	const deliveryQueueRef = useRef<CompanionCanvasReceiptDeliveryQueue | null>(null)
	if (!deliveryQueueRef.current) {
		deliveryQueueRef.current = createCompanionCanvasReceiptDeliveryQueue()
	}
	const deliveryQueue = deliveryQueueRef.current
	const isGenerating = useValue(
		'provider-neutral companion canvas executor generating',
		() => agent.requests.isGenerating(),
		[agent]
	)

	const showDeliveredOutcome = useCallback(
		(outcome: CompanionCanvasLocalExecutionOutcome) => {
			setLatestReceipt(outcome.receipt as CompanionCanvasToolReceipt)
			if (outcome.receipt.status === 'failed') {
				setError(outcome.executionError || outcome.receipt.summary)
				setState('failed')
				return
			}
			setError('')
			setState('ready')
		},
		[]
	)

	const showUnknownDelivery = useCallback(
		(
			attempt: Extract<
				CompanionCanvasReceiptDeliveryAttempt,
				{ status: 'unknown' }
			>
		) => {
			setLatestReceipt(attempt.outcome.receipt as CompanionCanvasToolReceipt)
			setError(
				`${
					attempt.outcome.receipt.status === 'succeeded'
						? 'Canvas execution succeeded locally'
						: 'Canvas execution failed locally'
				}, but receipt delivery is unconfirmed and will be retried: ${attempt.error}`
			)
			setState('offline')
		},
		[]
	)

	const poll = useCallback(
		async (signal?: AbortSignal) => {
			if (processingRef.current) return
			try {
				const pendingOutcome = deliveryQueue.getPending()
				if (pendingOutcome) {
					processingRef.current = true
					let attempt: CompanionCanvasReceiptDeliveryAttempt | null
					try {
						attempt = await deliveryQueue.attempt()
					} finally {
						processingRef.current = false
					}
					if (!attempt || signal?.aborted || !mountedRef.current) return
					if (attempt.status === 'unknown') {
						showUnknownDelivery(attempt)
						return
					}
					showDeliveredOutcome(attempt.outcome)
					const refreshed = await getCompanionCanvasToolStatus(signal)
					if (!signal?.aborted && mountedRef.current) setStatus(refreshed)
					return
				}

				const nextStatus = await getCompanionCanvasToolStatus(signal)
				if (signal?.aborted || !mountedRef.current) return
				setStatus(nextStatus)
				if (isGenerating) {
					setError('')
					setState('ready')
					return
				}
				const idlePresentation = resolveCompanionCanvasBridgeIdlePresentation(
					latestReceipt,
					nextStatus
				)
				setError(idlePresentation.error)

				const request = await leaseCompanionCanvasToolRequest(signal)
				if (!request || signal?.aborted || !mountedRef.current) {
					setState(idlePresentation.state)
					return
				}

				processingRef.current = true
				setState('applying')
				try {
					const outcome = await executeCompanionCanvasRequestLocally(agent, request)
					deliveryQueue.stage(outcome)
					if (mountedRef.current) {
						setLatestReceipt(outcome.receipt as CompanionCanvasToolReceipt)
					}
					const attempt = await deliveryQueue.attempt()
					if (!attempt || signal?.aborted || !mountedRef.current) return
					if (attempt.status === 'unknown') {
						showUnknownDelivery(attempt)
						return
					}
					showDeliveredOutcome(attempt.outcome)
				} finally {
					processingRef.current = false
				}

				if (deliveryQueue.getPending()) return
				const refreshed = await getCompanionCanvasToolStatus(signal)
				if (!signal?.aborted && mountedRef.current) setStatus(refreshed)
			} catch (pollError) {
				if (signal?.aborted || !mountedRef.current) return
				setError(errorSummary(pollError))
				setState('offline')
			}
		},
		[
			agent,
			deliveryQueue,
			isGenerating,
			latestReceipt,
			showDeliveredOutcome,
			showUnknownDelivery,
		]
	)

	useEffect(() => {
		mountedRef.current = true
		const controller = new AbortController()
		void poll(controller.signal)
		const interval = window.setInterval(
			() => void poll(controller.signal),
			POLL_INTERVAL_MS
		)
		return () => {
			mountedRef.current = false
			controller.abort()
			window.clearInterval(interval)
		}
	}, [poll])

	const value = useMemo<CompanionCanvasBridgeValue>(
		() => ({
			state,
			status,
			error,
			latestReceipt,
			refresh: () => void poll(),
		}),
		[error, latestReceipt, poll, state, status]
	)

	return (
		<CompanionCanvasBridgeContext.Provider value={value}>
			{children}
		</CompanionCanvasBridgeContext.Provider>
	)
}

export function useOptionalCompanionCanvasBridge() {
	return useContext(CompanionCanvasBridgeContext)
}

export function useCompanionCanvasBridge() {
	const value = useOptionalCompanionCanvasBridge()
	if (!value) {
		throw new Error(
			'useCompanionCanvasBridge must be used inside CompanionCanvasBridgeController'
		)
	}
	return value
}
