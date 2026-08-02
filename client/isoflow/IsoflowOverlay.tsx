import { useCallback, useEffect, useState } from 'react'
import {
	TLEmbedShape,
	TldrawUiButton,
	TldrawUiInput,
	TldrawUiPopover,
	TldrawUiPopoverContent,
	TldrawUiPopoverTrigger,
	TldrawUiSelect,
	TldrawUiSelectContent,
	TldrawUiSelectItem,
	TldrawUiSelectTrigger,
	TldrawUiSelectValue,
	TldrawUiTooltip,
	useEditor,
	useValue,
} from 'tldraw'
import {
	applyIsoflowMutationPreview,
	formatIsoflowOperation,
	IsoflowMutationPreview,
	subscribeToIsoflowMutationProposals,
} from './isoflowAgentActions'
import {
	getIsoflowHealth,
	getIsoflowView,
	IsoflowCompactView,
} from './isoflowBridge'
import {
	createIsoflowEmbed,
	ISOFLOW_ORIGIN,
	ISOFLOW_PROJECTS,
	isIsoflowEmbedShape,
	readIsoflowEmbedMeta,
	updateIsoflowEmbedView,
} from './isoflowProvider'

export function IsoflowOverlay() {
	const editor = useEditor()
	const selected = useValue(
		'selected Isoflow embed',
		() => editor.getSelectedShapes().find(isIsoflowEmbedShape) ?? null,
		[editor]
	)
	const [pickerOpen, setPickerOpen] = useState(false)
	const [status, setStatus] = useState('ISOFLOW')
	const [creating, setCreating] = useState(false)

	const createProject = useCallback(
		async (projectId: string, preferredViewId?: string) => {
			setCreating(true)
			setStatus('CONNECTING…')
			try {
				const view = await getIsoflowView(
					ISOFLOW_ORIGIN,
					projectId,
					preferredViewId
				)
				createIsoflowEmbed(editor, {
					projectId,
					viewId: view.view.id,
				})
				setStatus(`r${view.revision}`)
				setPickerOpen(false)
			} catch (error) {
				setStatus(error instanceof Error ? error.message : 'ISOFLOW OFFLINE')
			} finally {
				setCreating(false)
			}
		},
		[editor]
	)

	useEffect(() => {
		let cancelled = false
		const refreshHealth = () =>
			getIsoflowHealth(ISOFLOW_ORIGIN)
				.then(() => {
					if (!cancelled)
						setStatus((value) =>
							value.startsWith('r') ? value : 'BRIDGE ONLINE'
						)
				})
				.catch(() => {
					if (!cancelled) setStatus('BRIDGE OFFLINE')
				})
		refreshHealth()
		const timer = window.setInterval(refreshHealth, 3000)
		return () => {
			cancelled = true
			window.clearInterval(timer)
		}
	}, [])

	return (
		<>
			<div
				className="isoflow-provider-toolbar"
				onPointerDown={(event) => event.stopPropagation()}
				onClick={(event) => event.stopPropagation()}
			>
				<TldrawUiPopover
					id="isoflow-provider-picker"
					open={pickerOpen}
					onOpenChange={setPickerOpen}
				>
					<TldrawUiTooltip
						content="Isoflow embeds"
						side="right"
						sideOffset={8}
						delayDuration={350}
					>
						<TldrawUiPopoverTrigger>
							<TldrawUiButton
								type="tool"
								className="isoflow-provider-button"
								aria-label="Isoflow embeds"
								aria-expanded={pickerOpen}
								isActive={pickerOpen || Boolean(selected)}
							>
								<IsoflowMark />
							</TldrawUiButton>
						</TldrawUiPopoverTrigger>
					</TldrawUiTooltip>
					<TldrawUiPopoverContent
						side="right"
						align="start"
						sideOffset={8}
						collisionPadding={8}
					>
						<div
							className="isoflow-provider-picker"
							onPointerDown={(event) => event.stopPropagation()}
							onClick={(event) => event.stopPropagation()}
						>
							<div className="isoflow-picker-kicker">EMBED PROVIDER</div>
							<div className="isoflow-picker-title">
								<span>Isoflow</span>
								<small>{status}</small>
							</div>
							<div className="isoflow-picker-section">SOURCE DIAGRAMS</div>
							{ISOFLOW_PROJECTS.map((project) => (
								<TldrawUiButton
									type="menu"
									className="isoflow-project-option"
									key={project.id}
									disabled={creating}
									onClick={() =>
										createProject(
											project.id,
											'preferredViewId' in project
												? project.preferredViewId
												: undefined
										)
									}
								>
									<span>
										<strong>{project.label}</strong>
										<small>{project.description}</small>
									</span>
								</TldrawUiButton>
							))}
						</div>
					</TldrawUiPopoverContent>
				</TldrawUiPopover>
				<span className="workflow-sr-only" role="status">
					{status}
				</span>
			</div>
			{selected && <IsoflowInspector key={selected.id} shape={selected} />}
		</>
	)
}

function IsoflowInspector({ shape }: { shape: TLEmbedShape }) {
	const editor = useEditor()
	const meta = readIsoflowEmbedMeta(shape)!
	const [view, setView] = useState<IsoflowCompactView | null>(null)
	const [status, setStatus] = useState('LOADING')

	useEffect(() => {
		let cancelled = false
		const refresh = () =>
			getIsoflowView(meta.baseUrl, meta.projectId, meta.viewId)
				.then((next) => {
					if (cancelled) return
					setView(next)
					setStatus(`BRIDGE r${next.revision}`)
				})
				.catch((error) => {
					if (!cancelled)
						setStatus(error instanceof Error ? error.message : 'BRIDGE OFFLINE')
				})
		refresh()
		const timer = window.setInterval(refresh, 1500)
		return () => {
			cancelled = true
			window.clearInterval(timer)
		}
	}, [meta.baseUrl, meta.projectId, meta.viewId])

	return (
		<div
			className="tlui-menu isoflow-inspector"
			onPointerDown={(event) => event.stopPropagation()}
			onClick={(event) => event.stopPropagation()}
		>
			<div className="isoflow-inspector-head">
				<span>
					<IsoflowMark /> ISOFLOW
				</span>
				<small>{status}</small>
			</div>
			<div className="isoflow-inspector-field">
				<span>PROJECT</span>
				<TldrawUiInput
					value={meta.projectId}
					disabled
					aria-label="Isoflow project"
				/>
			</div>
			<div className="isoflow-inspector-field">
				<span>VIEW</span>
				<TldrawUiSelect
					id={`isoflow-view-${shape.id}`}
					value={meta.viewId}
					aria-label="Isoflow view"
					onValueChange={(value) =>
						updateIsoflowEmbedView(editor, shape, value)
					}
				>
					<TldrawUiSelectTrigger>
						<TldrawUiSelectValue>
							{(view?.views ?? []).find(
								(candidate) => candidate.id === meta.viewId
							)?.name ?? meta.viewId}
						</TldrawUiSelectValue>
					</TldrawUiSelectTrigger>
					<TldrawUiSelectContent>
						{(view?.views ?? [{ id: meta.viewId, name: meta.viewId }]).map(
							(candidate) => (
								<TldrawUiSelectItem
									key={candidate.id}
									value={candidate.id}
									label={candidate.name}
								/>
							)
						)}
					</TldrawUiSelectContent>
				</TldrawUiSelect>
			</div>
			<div className="isoflow-inspector-metrics">
				<span>
					<strong>{view?.items.length ?? '—'}</strong> NODES
				</span>
				<span>
					<strong>{view?.view.connectors.length ?? '—'}</strong> LINKS
				</span>
				<span>
					<strong>{view?.revision ?? '—'}</strong> REV
				</span>
			</div>
			<p>
				Select this embed before asking the existing Ampcode Architect thread to
				inspect it.
			</p>
			{view && <IsoflowExternalThreadHandoff shape={shape} view={view} />}
		</div>
	)
}

function IsoflowExternalThreadHandoff({
	shape,
	view,
}: {
	shape: TLEmbedShape
	view: IsoflowCompactView
}) {
	const editor = useEditor()
	const meta = readIsoflowEmbedMeta(shape)
	const [status, setStatus] = useState(
		'Waiting for the external Architect thread'
	)
	const [applying, setApplying] = useState(false)
	const [pending, setPending] = useState<{
		message: string
		preview: IsoflowMutationPreview
	} | null>(null)

	useEffect(
		() =>
			subscribeToIsoflowMutationProposals(shape.id, (proposal) => {
				setPending({ message: proposal.message, preview: proposal.preview })
				setStatus(
					`${proposal.message} · dry-run passed; review the exact proposal below`
				)
			}),
		[shape.id]
	)

	useEffect(() => {
		if (!pending || !meta) return
		if (
			pending.preview.projectId !== meta.projectId ||
			pending.preview.selectedViewId !== meta.viewId ||
			view.revision > pending.preview.baseRevision
		) {
			setPending(null)
			setStatus(
				'Preview expired because the selected Isoflow target changed. Ask the thread again.'
			)
		}
	}, [meta, pending, view.revision])

	const applyPending = async () => {
		if (!pending || applying) return
		const confirmed = pending
		setApplying(true)
		setStatus('Applying the confirmed proposal at its previewed revision…')
		try {
			const result = await applyIsoflowMutationPreview(
				editor,
				shape,
				confirmed.preview,
				confirmed.preview.digest,
				'canvapocalypse:external-architect-confirmation'
			)
			setPending(null)
			setStatus(
				`${confirmed.message} · applied at revision ${result.revision} (${confirmed.preview.digest.slice(0, 12)})`
			)
		} catch (error) {
			setPending(null)
			const message = error instanceof Error ? error.message : String(error)
			setStatus(
				/revision|conflict|target changed/i.test(message)
					? `Preview expired: ${message}. Ask the thread to inspect and propose again.`
					: `Apply failed or its outcome is unknown: ${message}. Inspect before retrying.`
			)
		} finally {
			setApplying(false)
		}
	}

	return (
		<div className="isoflow-agent-controls">
			<div
				role="status"
				aria-live="polite"
				aria-label="Existing Ampcode Architect handoff"
			>
				<div className="isoflow-agent-preview-head">
					<strong>EXTERNAL AMPCODE ARCHITECT</strong>
					<span>{pending ? 'REVIEW REQUIRED' : 'PASSIVE · NO MODEL'}</span>
				</div>
				<p>
					The existing Ampcode Architect thread owns planning and conversation.
					With this native infrastructure view selected, it uses the separate
					revision-guarded Isoflow Bridge v2 tools. Ordinary canvas work uses
					tldraw Offline tools. This canvas never launches a model.
				</p>
				<div className="isoflow-agent-run">
					<small>{status}</small>
				</div>
			</div>
			{pending && (
				<section
					className="isoflow-agent-preview"
					aria-label="Isoflow mutation preview"
				>
					<div className="isoflow-agent-preview-head">
						<strong>DRY-RUN PASSED</strong>
						<span>
							r{pending.preview.baseRevision} → r
							{pending.preview.expectedRevision}
						</span>
					</div>
					<p>{pending.message}</p>
					<ul>
						{pending.preview.summaries.map((summary, index) => (
							<li key={`${summary.kind}:${index}`}>
								{summary.intent} · {summary.operationCount} op
								{summary.operationCount === 1 ? '' : 's'}
							</li>
						))}
					</ul>
					<small className="isoflow-agent-preview-proof">
						{pending.preview.operations.length} operations ·{' '}
						{pending.preview.digest.slice(0, 16)}
					</small>
					<small className="isoflow-agent-preview-proof">
						{pending.preview.operationTypes.join(', ')}
						{pending.preview.affectedIds.length > 0
							? ` · ${pending.preview.affectedIds.slice(0, 8).join(', ')}${pending.preview.affectedIds.length > 8 ? '…' : ''}`
							: ''}
					</small>
					<details className="isoflow-agent-exact-operations" open>
						<summary>
							EXACT OPERATIONS · {pending.preview.projectId} /{' '}
							{pending.preview.selectedViewId}
						</summary>
						<ol aria-label="Normalized exact Isoflow operation parameters">
							{pending.preview.operations.map((operation, index) => (
								<li key={`${operation.op}:${index}`}>
									<strong>
										{index + 1}. {operation.op}
									</strong>
									<pre>
										<code>{formatIsoflowOperation(operation)}</code>
									</pre>
								</li>
							))}
						</ol>
					</details>
					<div className="isoflow-agent-preview-actions">
						<TldrawUiButton
							type="normal"
							disabled={applying}
							onClick={() => {
								setPending(null)
								setStatus('Preview discarded. No changes were applied.')
							}}
						>
							Discard
						</TldrawUiButton>
						<TldrawUiButton
							type="primary"
							disabled={applying}
							onClick={() => void applyPending()}
						>
							{applying ? 'APPLYING…' : 'CONFIRM EXACT PROPOSAL'}
						</TldrawUiButton>
					</div>
				</section>
			)}
		</div>
	)
}

function IsoflowMark() {
	return (
		<svg viewBox="0 0 24 24" aria-hidden="true">
			<path
				d="m4 7.2 8-4.4 8 4.4-8 4.5-8-4.5Zm0 5.1 8 4.5 8-4.5M4 17.4l8 4.4 8-4.4"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.8"
				strokeLinejoin="round"
			/>
			<circle cx="4" cy="12.3" r="1.4" fill="currentColor" />
			<circle cx="20" cy="12.3" r="1.4" fill="currentColor" />
		</svg>
	)
}
