import { useCallback, useEffect, useState } from 'react'
import {
	TldrawUiButton,
	TldrawUiButtonIcon,
	TldrawUiPopover,
	TldrawUiPopoverContent,
	TldrawUiPopoverTrigger,
	TldrawUiTooltip,
	useEditor,
	useValue,
} from 'tldraw'
import type {
	DesignSystemDocumentSummary,
	DesignSystemSnapshot,
} from '../../shared/types/DesignSystem'
import {
	getDesignSystemSnapshot,
	listDesignSystems,
} from './designSystemBridge'
import {
	createDesignSystemShape,
	DesignSystemShape,
	isDesignSystemShape,
	readDesignSystemMeta,
	replaceDesignSystemDocument,
	updateDesignSystemDrift,
	updateDesignSystemSnapshot,
} from './DesignSystemShape'
import './design-system.css'

export function DesignSystemOverlay() {
	const editor = useEditor()
	const selected = useValue(
		'selected Design System',
		() => {
			const shapes = editor.getSelectedShapes()
			return shapes.length === 1 && isDesignSystemShape(shapes[0])
				? shapes[0]
				: null
		},
		[editor]
	)
	const [pickerOpen, setPickerOpen] = useState(false)
	const [documents, setDocuments] = useState<DesignSystemDocumentSummary[]>([])
	const [status, setStatus] = useState('DESIGN.md')
	const [busy, setBusy] = useState(false)

	const loadDocuments = useCallback(async () => {
		setBusy(true)
		setStatus('DISCOVERING…')
		try {
			const next = await listDesignSystems()
			setDocuments(next)
			setStatus(`${next.length} AVAILABLE`)
		} catch (error) {
			setStatus(error instanceof Error ? error.message : 'REGISTRY OFFLINE')
		} finally {
			setBusy(false)
		}
	}, [])

	useEffect(() => {
		if (pickerOpen) void loadDocuments()
	}, [loadDocuments, pickerOpen])

	const connectDocument = useCallback(
		async (document: DesignSystemDocumentSummary) => {
			setBusy(true)
			setStatus('INSPECTING…')
			try {
				const snapshot = await getDesignSystemSnapshot(
					document.documentRef,
					document.revision
				)
				const latest = selected ? editor.getShape(selected.id) : null
				if (isDesignSystemShape(latest)) {
					replaceDesignSystemDocument(editor, latest, snapshot)
				} else {
					createDesignSystemShape(editor, snapshot)
				}
				setStatus('CONNECTED')
				setPickerOpen(false)
				editor.menus.clearOpenMenus()
			} catch (error) {
				setStatus(error instanceof Error ? error.message : 'CREATE FAILED')
			} finally {
				setBusy(false)
			}
		},
		[editor, selected]
	)

	return (
		<>
			<div
				className="design-system-provider-toolbar"
				onPointerDown={(event) => event.stopPropagation()}
				onClick={(event) => event.stopPropagation()}
			>
				<TldrawUiPopover
					id="design-system-provider-picker"
					open={pickerOpen}
					onOpenChange={setPickerOpen}
				>
					<TldrawUiTooltip
						content="Design System"
						side="right"
						sideOffset={8}
						delayDuration={350}
					>
						<TldrawUiPopoverTrigger>
							<TldrawUiButton
								type="tool"
								className="design-system-provider-button"
								aria-label="Design System"
								aria-expanded={pickerOpen}
								isActive={pickerOpen || Boolean(selected)}
							>
								<TldrawUiButtonIcon icon="pack" />
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
							className="design-system-provider-picker"
							onPointerDown={(event) => event.stopPropagation()}
							onClick={(event) => event.stopPropagation()}
						>
							<div className="design-system-picker-kicker">
								LOCAL REGISTRY
							</div>
							<div className="design-system-picker-title">
								<span>Design System</span>
								<small>{status}</small>
							</div>
							<p className="design-system-picker-boundary">
								Discovered from configured roots. The canvas stores an opaque
								reference, never a path or Markdown body.
							</p>
							<div className="design-system-picker-section">
								REGISTERED DESIGN.md
							</div>
							{documents.length ? (
								documents.map((document) => (
									<TldrawUiButton
										type="menu"
										className="design-system-document-option"
										key={document.documentRef}
										disabled={busy}
										onClick={() => connectDocument(document)}
									>
										<span>
											<strong>{document.title}</strong>
											<small>
												{document.projectId ?? document.documentRef}
												{' · '}
												{document.revision.slice(7, 15)}
												{document.truncated ? ' · bounded' : ''}
											</small>
										</span>
									</TldrawUiButton>
								))
							) : (
								<p className="design-system-empty">
									{busy
										? 'Reading the local registry…'
										: 'No DESIGN.md found in configured roots.'}
								</p>
							)}
						</div>
					</TldrawUiPopoverContent>
				</TldrawUiPopover>
			</div>
			<span
				className="workflow-sr-only"
				role="status"
				aria-live="polite"
				aria-atomic="true"
			>
				{status}
			</span>
			{selected && <DesignSystemInspector key={selected.id} shape={selected} />}
		</>
	)
}

function DesignSystemInspector({ shape }: { shape: DesignSystemShape }) {
	const editor = useEditor()
	const meta = readDesignSystemMeta(shape)!
	const [latest, setLatest] = useState<DesignSystemSnapshot | null>(null)
	const [status, setStatus] = useState('READY')
	const [busy, setBusy] = useState(false)

	const checkDrift = async () => {
		setBusy(true)
		setStatus('CHECKING…')
		try {
			const snapshot = await getDesignSystemSnapshot(meta.documentRef)
			const current = editor.getShape(shape.id)
			if (!isDesignSystemShape(current)) return
			const drifted = snapshot.revision !== meta.revision
			updateDesignSystemDrift(
				editor,
				current,
				drifted ? 'drifted' : 'current',
				drifted
					? `Host revision ${snapshot.revision.slice(7, 15)} differs from the linked revision`
					: undefined
			)
			setLatest(snapshot)
			setStatus(drifted ? 'DRIFT FOUND' : 'CURRENT')
		} catch {
			const current = editor.getShape(shape.id)
			if (isDesignSystemShape(current)) {
				updateDesignSystemDrift(
					editor,
					current,
					'unavailable',
					'Registry inspection failed'
				)
			}
			setStatus('CHECK FAILED')
		} finally {
			setBusy(false)
		}
	}

	const refresh = async () => {
		setBusy(true)
		setStatus('REFRESHING…')
		try {
			const snapshot =
				latest?.documentRef === meta.documentRef
					? latest
					: await getDesignSystemSnapshot(meta.documentRef)
			const current = editor.getShape(shape.id)
			if (!isDesignSystemShape(current)) return
			updateDesignSystemSnapshot(editor, current, snapshot)
			setLatest(snapshot)
			setStatus('REFRESHED')
		} catch {
			setStatus('REFRESH FAILED')
		} finally {
			setBusy(false)
		}
	}

	return (
		<aside
			className="design-system-inspector"
			aria-label="Design System inspector"
			onPointerDown={(event) => event.stopPropagation()}
			onClick={(event) => event.stopPropagation()}
		>
			<header className="design-system-inspector-head">
				<span>
					<TldrawUiButtonIcon icon="pack" small />
					Design System
				</span>
				<small role="status" aria-live="polite" aria-atomic="true">
					{status}
				</small>
			</header>
			<div className="design-system-inspector-title">
				<strong>{meta.title}</strong>
				<span>{meta.documentRef}</span>
			</div>
			<div className="design-system-inspector-metrics">
				<span>
					REVISION
					<strong>{meta.revision.slice(7, 15)}</strong>
				</span>
				<span>
					STATUS
					<strong>{meta.status.toUpperCase()}</strong>
				</span>
			</div>
			<p>
				{meta.driftSummary ??
					'The linked Markdown stays in the local registry. Inspection returns only a bounded semantic projection.'}
			</p>
			<div className="design-system-inspector-actions">
				<TldrawUiButton type="normal" disabled={busy} onClick={checkDrift}>
					<TldrawUiButtonIcon icon="check-circle" small />
					Check drift
				</TldrawUiButton>
				<TldrawUiButton
					type="normal"
					disabled={busy || (!latest && meta.status !== 'drifted')}
					onClick={refresh}
				>
					<TldrawUiButtonIcon icon="arrow-cycle" small />
					Refresh
				</TldrawUiButton>
			</div>
		</aside>
	)
}
