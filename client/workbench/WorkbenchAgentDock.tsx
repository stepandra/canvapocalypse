import { FormEvent, KeyboardEvent, useRef, useState } from 'react'
import {
	TldrawUiButton,
	TldrawUiButtonIcon,
	TldrawUiPopover,
	TldrawUiPopoverContent,
	TldrawUiPopoverTrigger,
	useValue,
} from 'tldraw'
import { useAgent } from '../agent/TldrawAgentAppProvider'
import { getCompletedNativeTldrawMutationActions } from '../agent/nativeMutationEvidence'
import {
	type CompanionBridgeState,
	useCompanionCanvasBridge,
} from '../components/CompanionCanvasBridgeController'
import { resolveWorkbenchDomainPack, WorkbenchDomain } from './domainPacks'
import {
	buildWorkbenchAgentInput,
	isWorkbenchCanvasMutationRequest,
	WorkbenchAgentContextMode,
	WorkbenchAgentRequestError,
} from './workbenchAgentRequest'
import './workbenchAgentDock.css'

export interface WorkbenchAgentDockProps {
	domainPack: WorkbenchDomain
}

export type WorkbenchAgentDockStatus =
	| 'idle'
	| 'running'
	| 'finished'
	| 'cancelled'
	| 'error'

export type WorkbenchAgentDockIndicator = 'idle' | 'running' | 'success' | 'error'

type WorkbenchAgentDockSourceState =
	| WorkbenchAgentDockStatus
	| 'offline'
	| 'failed'
	| 'applying'
	| 'ready'

export function getWorkbenchAgentDockMode(domainPack: WorkbenchDomain) {
	return domainPack === 'architecture' ? 'external-thread-status' : 'compact-composer'
}

export function getWorkbenchAgentDockIndicator(
	state: WorkbenchAgentDockSourceState
): WorkbenchAgentDockIndicator {
	switch (state) {
		case 'running':
		case 'applying':
			return 'running'
		case 'finished':
		case 'ready':
			return 'success'
		case 'cancelled':
		case 'error':
		case 'offline':
		case 'failed':
			return 'error'
		default:
			return 'idle'
	}
}

export function getWorkbenchAgentDockBridgeSourceState({
	state,
	latestReceiptStatus,
	reportedLatestStatus,
	hasStatus,
}: {
	state: CompanionBridgeState
	latestReceiptStatus?: 'succeeded' | 'failed'
	reportedLatestStatus?: 'queued' | 'leased' | 'succeeded' | 'failed'
	hasStatus: boolean
}): WorkbenchAgentDockSourceState {
	if (state === 'applying' || state === 'offline' || state === 'failed') {
		return state
	}
	if (latestReceiptStatus === 'failed' || reportedLatestStatus === 'failed') {
		return 'failed'
	}
	return latestReceiptStatus || reportedLatestStatus || hasStatus ? 'ready' : 'idle'
}

export function WorkbenchAgentDock({ domainPack }: WorkbenchAgentDockProps) {
	const agent = useAgent()
	const companionBridge = useCompanionCanvasBridge()
	const pack = resolveWorkbenchDomainPack(domainPack)
	const [expanded, setExpanded] = useState(false)
	const [message, setMessage] = useState('')
	const [contextMode, setContextMode] =
		useState<WorkbenchAgentContextMode>('selection')
	const [status, setStatus] = useState<WorkbenchAgentDockStatus>('idle')
	const [feedback, setFeedback] = useState('')
	const requestEpochRef = useRef(0)

	const selectedShapeCount = useValue(
		'workbench companion selected shapes',
		() => agent.editor.getSelectedShapeIds().length,
		[agent]
	)
	const isGenerating = useValue(
		'workbench companion generating',
		() => agent.requests.isGenerating(),
		[agent]
	)

	const submit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault()
		if (isGenerating) return

		try {
			const isMutation = isWorkbenchCanvasMutationRequest(message)
			const input = buildWorkbenchAgentInput({
				message,
				domainPack,
				contextMode,
				selectedShapeCount,
				viewportBounds:
					contextMode === 'visible-area'
						? agent.editor.getViewportPageBounds()
						: undefined,
				contextItems: agent.context.getItems(),
			})
			const epoch = ++requestEpochRef.current
			const historyStartIndex = agent.chat.getHistory().length
			setStatus('running')
			setFeedback(
				contextMode === 'visible-area'
					? 'Running with the visible bounded area.'
					: 'Running with selection and attached context only.'
			)
			setMessage('')
			await agent.prompt(input)
			if (requestEpochRef.current !== epoch) return
			if (
				isMutation &&
				getCompletedNativeTldrawMutationActions(
					agent.chat.getHistory(),
					historyStartIndex
				).length === 0
			) {
				throw new Error(
					'No completed validated canvas mutation was recorded. The request is not marked successful.'
				)
			}
			setStatus('finished')
			setFeedback('Request returned. Verify the canvas and its action receipt.')
		} catch (error) {
			if (error instanceof WorkbenchAgentRequestError) {
				setFeedback(error.message)
			} else {
				setFeedback(error instanceof Error ? error.message : 'The request could not start.')
			}
			setStatus('error')
		}
	}

	const cancel = () => {
		requestEpochRef.current += 1
		agent.cancel()
		setStatus('cancelled')
		setFeedback('Request cancelled. No further agent actions will be applied.')
	}

	const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
		if (event.key !== 'Enter' || event.shiftKey) return
		event.preventDefault()
		event.currentTarget.form?.requestSubmit()
	}

	const passiveArchitecture = getWorkbenchAgentDockMode(domainPack) === 'external-thread-status'
	const architectureSourceState = getWorkbenchAgentDockBridgeSourceState({
		state: companionBridge.state,
		latestReceiptStatus: companionBridge.latestReceipt?.status,
		reportedLatestStatus: companionBridge.status?.latest?.status,
		hasStatus: Boolean(companionBridge.status),
	})
	const indicator = getWorkbenchAgentDockIndicator(
		passiveArchitecture
			? architectureSourceState
			: isGenerating
				? 'running'
				: status
	)
	const triggerTitle = passiveArchitecture
		? `Amp Architect canvas bridge: ${indicator}`
		: `${pack.label} AI companion: ${indicator}`

	return (
		<aside
			className="workbench-agent-dock"
			data-tone={pack.tone}
			data-state={indicator}
			onPointerDown={(event) => event.stopPropagation()}
			onClick={(event) => event.stopPropagation()}
			onWheel={(event) => event.stopPropagation()}
			aria-label="AI workbench companion"
		>
			<TldrawUiPopover
				id={`workbench-agent-${domainPack}`}
				open={expanded}
				onOpenChange={setExpanded}
				className="workbench-agent-popover"
			>
				<TldrawUiPopoverTrigger>
					<TldrawUiButton
						type="tool"
						className="workbench-agent-dock-trigger"
						isActive={expanded}
						aria-label={triggerTitle}
						title={triggerTitle}
					>
						<TldrawUiButtonIcon icon="comment" />
						<span
							className="workbench-agent-dock-state"
							data-state={indicator}
							aria-hidden="true"
						/>
						{selectedShapeCount > 0 && (
							<span className="workbench-agent-dock-count" aria-hidden="true">
								{Math.min(selectedShapeCount, 99)}
							</span>
						)}
					</TldrawUiButton>
				</TldrawUiPopoverTrigger>

				<TldrawUiPopoverContent
					side="top"
					align="end"
					sideOffset={8}
					collisionPadding={8}
					autoFocusFirstButton={false}
				>
					{passiveArchitecture ? (
						<section
							className="workbench-agent-dock-panel workbench-architect-thread"
							aria-label="Amp Architect thread canvas connection"
						>
							<header className="workbench-agent-panel-header">
								<div>
									<span className="workbench-agent-kicker">AMP ARCHITECT</span>
									<strong>Existing thread bridge</strong>
								</div>
								<span className="workbench-agent-selection">
									{selectedShapeCount} selected
								</span>
							</header>

							<div className="workbench-architect-connection">
								<span
									className="workbench-architect-connection-dot"
									data-state={indicator}
									aria-hidden="true"
								/>
								<div>
									<strong>
										{companionBridge.state === 'offline'
											? 'Bridge offline'
											: companionBridge.state === 'applying'
												? 'Applying validated plan'
												: companionBridge.state === 'failed'
													? 'Latest operation failed'
													: 'Live canvas executor ready'}
									</strong>
									<span>
										The Ampcode thread owns planning, conversation, history, and
										capability discovery.
									</span>
								</div>
							</div>

							<dl className="workbench-architect-facts">
								<div>
									<dt>Context</dt>
									<dd>Explicit selection or bounded area</dd>
								</div>
								<div>
									<dt>Mutation</dt>
									<dd>Inspect first · validated native actions · undoable receipt</dd>
								</div>
								<div>
									<dt>Latest receipt</dt>
									<dd>
										<strong>
											{companionBridge.latestReceipt
												? companionBridge.latestReceipt.status.toUpperCase()
												: companionBridge.status?.latest?.status.toUpperCase() ??
													'NONE'}
										</strong>
										<span>
											{companionBridge.latestReceipt?.summary ??
												companionBridge.status?.latest?.summary ??
												'Ask the existing Ampcode Architect thread to inspect this selection.'}
										</span>
									</dd>
								</div>
							</dl>

							{companionBridge.error && (
								<p className="workbench-architect-error" aria-live="polite">
									{companionBridge.error}
								</p>
							)}

							<footer className="workbench-architect-actions">
								<span>No embedded planner, terminal, transcript, or credentials</span>
								<TldrawUiButton
									type="low"
									onClick={companionBridge.refresh}
									disabled={companionBridge.state === 'applying'}
								>
									Check now
								</TldrawUiButton>
							</footer>
						</section>
					) : (
						<form className="workbench-agent-dock-panel" onSubmit={submit}>
							<header className="workbench-agent-panel-header">
								<div>
									<span className="workbench-agent-kicker">AI COMPANION</span>
									<strong>{pack.label}</strong>
								</div>
								<span className="workbench-agent-selection">
									{selectedShapeCount} selected
								</span>
							</header>

							<fieldset className="workbench-agent-context">
								<legend>Context boundary</legend>
								<label>
									<input
										type="radio"
										name="workbench-agent-context"
										value="selection"
										checked={contextMode === 'selection'}
										onChange={() => {
											setContextMode('selection')
											setFeedback('')
											setStatus('idle')
										}}
									/>
									<span>
										<strong>Selection</strong>
										<small>Default · fail closed for edits</small>
									</span>
								</label>
								<label>
									<input
										type="radio"
										name="workbench-agent-context"
										value="visible-area"
										checked={contextMode === 'visible-area'}
										onChange={() => {
											setContextMode('visible-area')
											setFeedback('')
											setStatus('idle')
										}}
									/>
									<span>
										<strong>Visible area</strong>
										<small>Explicit bounded canvas context</small>
									</span>
								</label>
							</fieldset>

							<label className="workbench-agent-composer">
								<span>Request</span>
								<textarea
									value={message}
									onChange={(event) => {
										setMessage(event.currentTarget.value)
										if (status === 'error') {
											setFeedback('')
											setStatus('idle')
										}
									}}
									onKeyDown={handleComposerKeyDown}
									placeholder={`Ask ${pack.label} companion…`}
									rows={3}
									disabled={isGenerating}
								/>
							</label>

							<div className="workbench-agent-dock-footer">
								<p className={`is-${status}`} aria-live="polite">
									{feedback ||
										(contextMode === 'selection' && selectedShapeCount === 0
											? 'Select shapes before asking for a canvas mutation.'
											: 'Route auto · native tldraw by default')}
								</p>
								{isGenerating ? (
									<TldrawUiButton type="danger" onClick={cancel}>
										Cancel
									</TldrawUiButton>
								) : (
									<TldrawUiButton
										type="primary"
										htmlButtonType="submit"
										disabled={message.trim() === ''}
									>
										Send
									</TldrawUiButton>
								)}
							</div>
						</form>
					)}
				</TldrawUiPopoverContent>
			</TldrawUiPopover>
		</aside>
	)
}
