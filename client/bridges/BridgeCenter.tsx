import { useCallback, useEffect, useState } from 'react'
import {
	TldrawUiButton,
	TldrawUiButtonIcon,
	TldrawUiButtonLabel,
	TldrawUiIcon,
	TldrawUiPopover,
	TldrawUiPopoverContent,
	TldrawUiPopoverTrigger,
	TldrawUiToolbarButton,
} from 'tldraw'
import {
	getWorkbenchAgentDockBridgeSourceState,
	getWorkbenchAgentDockIndicator,
} from '../workbench/WorkbenchAgentDock'
import {
	useCompanionCanvasBridge,
	useOptionalCompanionCanvasBridge,
} from '../components/CompanionCanvasBridgeController'
import {
	BridgeAggregateState,
	BridgeService,
	BridgeServiceAction,
	canRunBridgeServiceAction,
	listBridgeServices,
	runBridgeServiceAction,
	summarizeBridgeServices,
} from './bridgeSupervisorClient'

const SERVICE_ACTIONS: readonly BridgeServiceAction[] = [
	'check',
	'start',
	'stop',
	'restart',
]

export function BridgeCenter() {
	const companionBridge = useOptionalCompanionCanvasBridge()
	const [open, setOpen] = useState(false)
	const [services, setServices] = useState<readonly BridgeService[]>([])
	const [checkedAt, setCheckedAt] = useState<string | undefined>()
	const [busyServiceId, setBusyServiceId] = useState<string | null>(null)
	const [error, setError] = useState<string | null>(null)
	const architectureIndicator = companionBridge
		? getWorkbenchAgentDockIndicator(
				getWorkbenchAgentDockBridgeSourceState({
					state: companionBridge.state,
					latestReceiptStatus: companionBridge.latestReceipt?.status,
					reportedLatestStatus: companionBridge.status?.latest?.status,
					hasStatus: Boolean(companionBridge.status),
				})
			)
		: null
	const architectureNeedsAttention =
		architectureIndicator === 'error' || architectureIndicator === 'running'
	const aggregate = error && services.length === 0
		? 'attention'
		: architectureNeedsAttention
			? 'attention'
			: summarizeBridgeServices(services)
	const hasTransition = services.some(
		(service) =>
			service.state === 'starting' || service.state === 'stopping'
	)

	const refresh = useCallback(async (signal?: AbortSignal) => {
		setError(null)
		try {
			const listing = await listBridgeServices(signal)
			setServices(listing.services)
			setCheckedAt(listing.checkedAt)
		} catch (cause) {
			if (signal?.aborted) return
			setError(
				cause instanceof Error ? cause.message : 'Bridge supervisor unavailable'
			)
		}
	}, [])

	useEffect(() => {
		if (!open) return
		const controller = new AbortController()
		void refresh(controller.signal)
		return () => controller.abort()
	}, [open, refresh])

	useEffect(() => {
		if (!open || !hasTransition) return
		const controller = new AbortController()
		const timer = window.setTimeout(() => {
			void refresh(controller.signal)
		}, 500)
		return () => {
			window.clearTimeout(timer)
			controller.abort()
		}
	}, [hasTransition, open, refresh, services])

	const runAction = useCallback(
		async (service: BridgeService, action: BridgeServiceAction) => {
			setBusyServiceId(service.id)
			setError(null)
			try {
				const next = await runBridgeServiceAction(service, action)
				setServices((current) =>
					current.map((item) => (item.id === next.id ? next : item))
				)
				const listing = await listBridgeServices()
				setServices(listing.services)
				setCheckedAt(listing.checkedAt)
			} catch (cause) {
				setError(
					cause instanceof Error
						? cause.message
						: `${action} failed for ${service.label}`
				)
			} finally {
				setBusyServiceId(null)
			}
		},
		[]
	)

	return (
		<TldrawUiPopover
			id="workbench-bridge-center"
			open={open}
			onOpenChange={setOpen}
			className="workbench-bridge-popover"
		>
			<TldrawUiPopoverTrigger>
				<TldrawUiToolbarButton
					type="icon"
					className="workbench-rail-trigger workbench-bridge-trigger"
					title={`Bridge Center · ${aggregateLabel(aggregate)}`}
					aria-label={`Bridge Center · ${aggregateLabel(aggregate)}`}
					aria-expanded={open}
				>
					<TldrawUiButtonIcon icon="link" />
					<span
						className="workbench-bridge-dot"
						data-state={aggregate}
						aria-hidden="true"
					/>
				</TldrawUiToolbarButton>
			</TldrawUiPopoverTrigger>
			<TldrawUiPopoverContent
				side="right"
				align="start"
				sideOffset={8}
				collisionPadding={12}
				autoFocusFirstButton={false}
			>
				<section
					className="workbench-bridge-center"
					aria-label="Bridge Center"
					onPointerDown={(event) => event.stopPropagation()}
					onClick={(event) => event.stopPropagation()}
				>
					<header className="workbench-popover-header">
						<span className="workbench-popover-kicker">LOCAL CONTROL PLANE</span>
						<div className="workbench-popover-title">
							<strong>Bridge Center</strong>
							<span data-state={aggregate}>{aggregateLabel(aggregate)}</span>
						</div>
						<p>
							Managed bridges expose bounded lifecycle controls. External
							dependencies stay observation-only.
						</p>
					</header>

					<div className="workbench-bridge-services">
						{companionBridge && architectureIndicator && (
							<ArchitectThreadBridgeRow
								companionBridge={companionBridge}
								indicator={architectureIndicator}
							/>
						)}
						{services.map((service) => (
							<BridgeServiceRow
								key={service.id}
								service={service}
								busy={busyServiceId === service.id}
								onAction={runAction}
							/>
						))}
						{services.length === 0 && !error && !companionBridge && (
							<p className="workbench-bridge-empty">
								Reading the supervisor registry…
							</p>
						)}
					</div>

					{error && (
						<p
							className="workbench-bridge-error"
							role="status"
							aria-live="polite"
						>
							<TldrawUiIcon icon="status-offline" label="" small />
							{error}
						</p>
					)}
					{checkedAt && !error && (
						<p className="workbench-bridge-checked" role="status">
							Registry checked {formatCheckedAt(checkedAt)}
						</p>
					)}
				</section>
			</TldrawUiPopoverContent>
		</TldrawUiPopover>
	)
}

function ArchitectThreadBridgeRow({
	companionBridge,
	indicator,
}: {
	companionBridge: ReturnType<typeof useCompanionCanvasBridge>
	indicator: ReturnType<typeof getWorkbenchAgentDockIndicator>
}) {
	const statusLabel =
		companionBridge.state === 'offline'
			? 'Offline'
			: companionBridge.state === 'applying'
				? 'Applying'
				: companionBridge.state === 'failed'
					? 'Failed'
					: companionBridge.state === 'connecting'
						? 'Connecting'
						: 'Ready'
	const latest =
		companionBridge.latestReceipt?.status.toUpperCase() ??
		companionBridge.status?.latest?.status.toUpperCase() ??
		'NONE'
	const summary =
		companionBridge.latestReceipt?.summary ??
		companionBridge.status?.latest?.summary ??
		'Ask the existing Ampcode Architect thread to inspect this selection.'

	return (
		<article
			className="workbench-bridge-service workbench-architect-bridge"
			data-state={indicator}
		>
			<div className="workbench-bridge-service-heading">
				<div>
					<strong>Amp Architect thread</strong>
					<span>Existing thread canvas executor</span>
				</div>
				<b>{statusLabel}</b>
			</div>
			<p>
				The Ampcode thread owns planning, conversation, history, and capability
				discovery. Context is explicit selection or a bounded area.
			</p>
			<p className="workbench-bridge-capabilities">
				Latest receipt {latest} · {summary}
			</p>
			{companionBridge.error && (
				<p className="workbench-bridge-error" aria-live="polite">
					<TldrawUiIcon icon="status-offline" label="" small />
					{companionBridge.error}
				</p>
			)}
			<div className="workbench-bridge-actions" aria-label="Amp Architect thread actions">
				<TldrawUiButton
					type="normal"
					className="workbench-bridge-action"
					disabled={companionBridge.state === 'applying'}
					onClick={companionBridge.refresh}
				>
					<TldrawUiButtonIcon icon="check-circle" small />
					<TldrawUiButtonLabel>Check now</TldrawUiButtonLabel>
				</TldrawUiButton>
			</div>
		</article>
	)
}

function BridgeServiceRow({
	service,
	busy,
	onAction,
}: {
	service: BridgeService
	busy: boolean
	onAction: (
		service: BridgeService,
		action: BridgeServiceAction
	) => Promise<void>
}) {
	const boundary = getServiceBoundaryLabel(service)
	return (
		<article className="workbench-bridge-service" data-state={service.state}>
			<div className="workbench-bridge-service-heading">
				<div>
					<strong>{service.label}</strong>
					<span>{boundary}</span>
				</div>
				<b>{serviceStateLabel(service.state)}</b>
			</div>
			{service.detail && <p>{service.detail}</p>}
			{service.capabilities.length > 0 && (
				<p className="workbench-bridge-capabilities">
					{service.capabilities.join(' · ')}
				</p>
			)}
			<div
				className="workbench-bridge-actions"
				aria-label={`${service.label} actions`}
			>
				{SERVICE_ACTIONS.map((action) =>
					canRunBridgeServiceAction(service, action) ? (
						<TldrawUiButton
							key={action}
							type={action === 'stop' ? 'danger' : 'normal'}
							className="workbench-bridge-action"
							disabled={busy}
							onClick={() => void onAction(service, action)}
						>
							<TldrawUiButtonIcon icon={actionIcon(action)} small />
							<TldrawUiButtonLabel>
								{busy ? 'Working…' : actionLabel(action)}
							</TldrawUiButtonLabel>
						</TldrawUiButton>
					) : null
				)}
			</div>
		</article>
	)
}

function actionIcon(action: BridgeServiceAction) {
	switch (action) {
		case 'check':
			return 'check-circle' as const
		case 'start':
			return 'play' as const
		case 'stop':
			return 'stop' as const
		case 'restart':
			return 'arrow-cycle' as const
	}
}

function actionLabel(action: BridgeServiceAction) {
	return capitalize(action)
}

function serviceStateLabel(state: BridgeService['state']) {
	switch (state) {
		case 'port-conflict':
			return 'Port conflict'
		case 'external':
			return 'External'
		default:
			return capitalize(state)
	}
}

function capitalize(value: string) {
	return value[0].toUpperCase() + value.slice(1)
}

function getServiceBoundaryLabel(service: BridgeService) {
	if (service.state === 'external' || service.state === 'port-conflict') {
		return 'Observed external'
	}
	if (service.controllable) return 'Supervisor service'
	return 'Observed dependency'
}

function aggregateLabel(state: BridgeAggregateState) {
	switch (state) {
		case 'healthy':
			return 'Healthy'
		case 'attention':
			return 'Attention'
		case 'transition':
			return 'Changing'
		case 'idle':
			return 'Stopped'
		default:
			return 'Not checked'
	}
}

function formatCheckedAt(value: string) {
	const date = new Date(value)
	return Number.isFinite(date.getTime())
		? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
		: 'now'
}
