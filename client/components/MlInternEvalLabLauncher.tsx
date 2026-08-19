import { useCallback, useEffect, useRef, useState } from 'react'
import {
	TldrawUiButton,
	TldrawUiButtonIcon,
	TldrawUiPopover,
	TldrawUiPopoverContent,
	TldrawUiPopoverTrigger,
	TldrawUiTooltip,
	useValue,
} from 'tldraw'
import {
	executeMlInternCanvasToolRequest,
	getMlInternCanvasToolStatus,
	leaseMlInternCanvasToolRequest,
	MlInternCanvasToolRequest,
	MlInternCanvasToolStatus,
	postMlInternCanvasToolReceipt,
} from '../agent/mlInternCanvasTool'
import { useAgent } from '../agent/TldrawAgentAppProvider'
import type { TldrawAgent } from '../agent/TldrawAgent'
import type { CompanionCanvasToolReceipt } from '../agent/companionCanvasTool'
import {
	createCompanionCanvasReceiptDeliveryQueue,
	executeCompanionCanvasRequestLocally,
} from './CompanionCanvasBridgeController'

const POLL_INTERVAL_MS = 1_500

type MlInternRequestExecutor = (
	agent: TldrawAgent,
	request: MlInternCanvasToolRequest
) => Promise<CompanionCanvasToolReceipt>

type MlInternReceiptDeliverer = (
	receipt: CompanionCanvasToolReceipt,
	lease: Pick<MlInternCanvasToolRequest, 'leaseToken' | 'canvasBinding'>
) => Promise<unknown>

export function executeMlInternRequestLocally(
	agent: TldrawAgent,
	request: MlInternCanvasToolRequest,
	execute: MlInternRequestExecutor = executeMlInternCanvasToolRequest
) {
	return executeCompanionCanvasRequestLocally(agent, request, execute)
}

export function createMlInternReceiptDeliveryQueue(
	deliver: MlInternReceiptDeliverer = (receipt, lease) =>
		postMlInternCanvasToolReceipt(receipt, lease)
) {
	return createCompanionCanvasReceiptDeliveryQueue(deliver)
}

export function resolveMlInternLauncherTone({
	hasError,
	isProcessing,
	hasBridge,
	latestStatus,
}: {
	hasError: boolean
	isProcessing: boolean
	hasBridge: boolean
	latestStatus?: MlInternCanvasToolRequest['status'] | CompanionCanvasToolReceipt['status']
}) {
	if (latestStatus === 'failed' || hasError) return 'error'
	if (isProcessing) return 'running'
	return hasBridge ? 'ready' : 'connecting'
}

export function MlInternEvalLabLauncher() {
	const agent = useAgent()
	const [expanded, setExpanded] = useState(false)
	const [bridge, setBridge] = useState<MlInternCanvasToolStatus | null>(null)
	const [status, setStatus] = useState('CONNECTING')
	const [error, setError] = useState('')
	const [localReceipt, setLocalReceipt] =
		useState<CompanionCanvasToolReceipt | null>(null)
	const processingRef = useRef(false)
	const deliveryQueueRef = useRef<ReturnType<
		typeof createMlInternReceiptDeliveryQueue
	> | null>(null)
	if (!deliveryQueueRef.current) {
		deliveryQueueRef.current = createMlInternReceiptDeliveryQueue()
	}
	const deliveryQueue = deliveryQueueRef.current
	const isGenerating = useValue(
		'terminal ml-intern canvas tool generating',
		() => agent.requests.isGenerating(),
		[agent]
	)

	const poll = useCallback(
		async (signal?: AbortSignal) => {
			if (processingRef.current) return
			try {
				const pendingOutcome = deliveryQueue.getPending()
				if (pendingOutcome) {
					processingRef.current = true
					setStatus('RETRYING RECEIPT DELIVERY')
					try {
						const attempt = await deliveryQueue.attempt()
						if (!attempt || signal?.aborted) return
						setLocalReceipt(
							attempt.outcome.receipt as CompanionCanvasToolReceipt
						)
						if (attempt.status === 'unknown') {
							setError(
								`${
									attempt.outcome.receipt.status === 'succeeded'
										? 'Canvas execution succeeded locally'
										: 'Canvas execution failed locally'
								}, but receipt delivery is unconfirmed and will be retried: ${attempt.error}`
							)
							setStatus('DELIVERY UNKNOWN · RETRYING')
							return
						}
						if (attempt.outcome.receipt.status === 'failed') {
							setError(
								attempt.outcome.executionError ||
									attempt.outcome.receipt.summary
							)
							setStatus('REQUEST FAILED')
						} else {
							setError('')
							setStatus('RECEIPT RETURNED TO TERMINAL')
						}
					} finally {
						processingRef.current = false
					}
					if (deliveryQueue.getPending()) return
					setBridge(await getMlInternCanvasToolStatus(signal))
					return
				}

				const nextStatus = await getMlInternCanvasToolStatus(signal)
				setBridge(nextStatus)
				const latestStatus =
					localReceipt?.status ?? nextStatus.latest?.status
				if (latestStatus === 'failed') {
					setError(
						localReceipt?.summary ??
							nextStatus.latest?.summary ??
							'Latest validated canvas operation failed'
					)
					setStatus('REQUEST FAILED')
				} else {
					setError('')
				}
				if (processingRef.current || isGenerating) {
					setStatus('APPLYING CANVAS REQUEST')
					return
				}
				const request = await leaseMlInternCanvasToolRequest(signal)
				if (!request) {
					if (latestStatus !== 'failed') {
						setStatus('WAITING FOR TERMINAL TOOL CALL')
					}
					return
				}

				processingRef.current = true
				setStatus('APPLYING CANVAS REQUEST')
				try {
					const outcome = await executeMlInternRequestLocally(agent, request)
					deliveryQueue.stage(outcome)
					setLocalReceipt(outcome.receipt as CompanionCanvasToolReceipt)
					const attempt = await deliveryQueue.attempt()
					if (!attempt || signal?.aborted) return
					if (attempt.status === 'unknown') {
						setError(
							`${
								outcome.receipt.status === 'succeeded'
									? 'Canvas execution succeeded locally'
									: 'Canvas execution failed locally'
							}, but receipt delivery is unconfirmed and will be retried: ${attempt.error}`
						)
						setStatus('DELIVERY UNKNOWN · RETRYING')
						return
					}
					if (outcome.receipt.status === 'failed') {
						setError(outcome.executionError || outcome.receipt.summary)
						setStatus('REQUEST FAILED')
					} else {
						setError('')
						setStatus('RECEIPT RETURNED TO TERMINAL')
					}
				} finally {
					processingRef.current = false
				}
				if (deliveryQueue.getPending()) return
				setBridge(await getMlInternCanvasToolStatus(signal))
			} catch (pollError) {
				if (signal?.aborted) return
				setError(
					pollError instanceof Error ? pollError.message : String(pollError)
				)
				setStatus('BRIDGE OFFLINE')
			}
		},
		[agent, deliveryQueue, isGenerating, localReceipt]
	)

	useEffect(() => {
		const controller = new AbortController()
		void poll(controller.signal)
		const interval = window.setInterval(
			() => void poll(controller.signal),
			POLL_INTERVAL_MS
		)
		return () => {
			controller.abort()
			window.clearInterval(interval)
		}
	}, [poll])

	const latest = localReceipt ?? bridge?.latest
	const tone = resolveMlInternLauncherTone({
		hasError: Boolean(error),
		isProcessing: processingRef.current || isGenerating,
		hasBridge: Boolean(bridge),
		latestStatus: latest?.status,
	})

	return (
		<div
			className={`ml-intern-eval-launcher${expanded ? ' is-expanded' : ''}`}
			onPointerDown={(event) => event.stopPropagation()}
			onClick={(event) => event.stopPropagation()}
		>
			<TldrawUiPopover
				id="ml-intern-terminal-bridge"
				open={expanded}
				onOpenChange={setExpanded}
			>
				<TldrawUiTooltip
					content="ML-Intern terminal bridge"
					side="right"
					sideOffset={8}
					delayDuration={350}
				>
					<TldrawUiPopoverTrigger>
						<TldrawUiButton
							type="tool"
							className="workbench-rail-trigger ml-intern-eval-launcher-toggle"
							isActive={expanded}
							aria-label="ML-Intern terminal bridge"
							aria-expanded={expanded}
						>
							<TldrawUiButtonIcon icon="code" />
							<span className={`ml-intern-eval-status is-${tone}`} />
						</TldrawUiButton>
					</TldrawUiPopoverTrigger>
				</TldrawUiTooltip>
				<TldrawUiPopoverContent
					side="right"
					align="start"
					sideOffset={8}
					collisionPadding={8}
				>
					<div className="ml-intern-eval-launcher-panel">
						<header className="ml-intern-eval-launcher-header">
							<div>
								<strong>ML-Intern</strong>
								<span>Terminal bridge</span>
							</div>
							<small>
								{bridge ? `${bridge.pending} queued` : 'No connection'}
							</small>
						</header>
						<div className="ml-intern-terminal-primary">
							<span>PRIMARY</span>
							<strong>ml-intern CLI session</strong>
							<small>
								The terminal owns planning, tools, history, and approvals.
							</small>
						</div>
						<div className="ml-intern-terminal-route">
							<span>BUILT-IN TOOLS</span>
							<code>tldraw_capabilities</code>
							<code>tldraw_describe_capability</code>
							<code>tldraw_execute</code>
							<small>
								Discover IDs → hydrate one schema → execute on an explicit
								selection or bounded area.
							</small>
						</div>
						<div className="ml-intern-terminal-status">
							<span>{status}</span>
							<strong>{bridge ? `${bridge.pending} queued` : 'Offline'}</strong>
						</div>
						{latest && (
							<div className="ml-intern-terminal-receipt">
								<span>LAST RECEIPT · {latest.status.toUpperCase()}</span>
								<code>
									{('requestId' in latest ? latest.requestId : latest.id).slice(
										0,
										12
									)}
								</code>
								<small>
									{latest.summary || 'Waiting for canvas completion.'}
								</small>
							</div>
						)}
						{error && <p className="ml-intern-terminal-error">{error}</p>}
						<div className="ml-intern-terminal-actions">
							<small>Observes and executes; it never starts ML-Intern.</small>
							<TldrawUiButton
								type="normal"
								onClick={() => void poll()}
								disabled={processingRef.current}
							>
								Check now
							</TldrawUiButton>
						</div>
					</div>
				</TldrawUiPopoverContent>
			</TldrawUiPopover>
		</div>
	)
}
