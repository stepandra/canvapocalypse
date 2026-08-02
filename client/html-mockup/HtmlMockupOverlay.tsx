import { ChangeEvent, useCallback, useEffect, useRef, useState } from 'react'
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
import {
	getHtmlMockupSnapshot,
	HtmlMockupDocumentSummary,
	importHtmlMockupDocument,
	listHtmlMockupDocuments,
} from './htmlMockupBridge'
import {
	clearLocalHtmlMockupTarget,
	createLocalHtmlMockupShape,
	isLocalHtmlMockupShape,
	LocalHtmlMockupShape,
	readLocalHtmlMockupMeta,
	replaceLocalHtmlMockupDocument,
	updateLocalHtmlMockupSnapshot,
} from './LocalHtmlMockupShape'

const MAX_IMPORT_BYTES = 4 * 1024 * 1024

export function HtmlMockupOverlay() {
	const editor = useEditor()
	const selected = useValue(
		'selected Local HTML Mockup',
		() => {
			const selectedShapes = editor.getSelectedShapes()
			if (selectedShapes.length !== 1) return null
			return isLocalHtmlMockupShape(selectedShapes[0])
				? selectedShapes[0]
				: null
		},
		[editor]
	)
	const [pickerOpen, setPickerOpen] = useState(false)
	const [documents, setDocuments] = useState<HtmlMockupDocumentSummary[]>([])
	const [status, setStatus] = useState('LOCAL HTML')
	const [busy, setBusy] = useState(false)
	const fileInputRef = useRef<HTMLInputElement>(null)

	const loadDocuments = useCallback(async () => {
		setBusy(true)
		setStatus('LOADING…')
		try {
			const next = await listHtmlMockupDocuments()
			setDocuments(next)
			setStatus(`${next.length} AVAILABLE`)
		} catch (error) {
			setStatus(error instanceof Error ? error.message : 'BRIDGE OFFLINE')
		} finally {
			setBusy(false)
		}
	}, [])

	useEffect(() => {
		if (pickerOpen) void loadDocuments()
	}, [loadDocuments, pickerOpen])

	const createFromDocument = useCallback(
		async (document: HtmlMockupDocumentSummary) => {
			setBusy(true)
			setStatus('CONNECTING…')
			try {
				const snapshot = await getHtmlMockupSnapshot(document.documentRef)
				const latestSelected = selected ? editor.getShape(selected.id) : null
				if (latestSelected && isLocalHtmlMockupShape(latestSelected)) {
					replaceLocalHtmlMockupDocument(editor, latestSelected, snapshot)
				} else {
					createLocalHtmlMockupShape(editor, snapshot)
				}
				setStatus(`r${snapshot.revision}`)
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

	const importFile = useCallback(
		async (event: ChangeEvent<HTMLInputElement>) => {
			const file = event.currentTarget.files?.[0]
			event.currentTarget.value = ''
			if (!file) return
			if (file.size > MAX_IMPORT_BYTES) {
				setStatus('HTML EXCEEDS 4 MB')
				return
			}
			setBusy(true)
			setStatus('IMPORTING…')
			try {
				const content = await file.text()
				const imported = await importHtmlMockupDocument({
					name: file.name,
					content,
				})
				await createFromDocument(imported)
			} catch (error) {
				setStatus(error instanceof Error ? error.message : 'IMPORT FAILED')
			} finally {
				setBusy(false)
			}
		},
		[createFromDocument]
	)

	return (
		<>
			<div
				className="html-mockup-provider-toolbar"
				onPointerDown={(event) => event.stopPropagation()}
				onClick={(event) => event.stopPropagation()}
			>
				<TldrawUiPopover
					id="html-mockup-provider-picker"
					open={pickerOpen}
					onOpenChange={setPickerOpen}
				>
					<TldrawUiTooltip
						content="Local HTML Mockups"
						side="right"
						sideOffset={8}
						delayDuration={350}
					>
						<TldrawUiPopoverTrigger>
							<TldrawUiButton
								type="tool"
								className="html-mockup-provider-button"
								aria-label="Local HTML Mockups"
								aria-expanded={pickerOpen}
								isActive={pickerOpen || Boolean(selected)}
							>
								<TldrawUiButtonIcon icon="code" />
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
							className="html-mockup-provider-picker"
							onPointerDown={(event) => event.stopPropagation()}
							onClick={(event) => event.stopPropagation()}
						>
							<div className="html-mockup-picker-kicker">EMBED PROVIDER</div>
							<div className="html-mockup-picker-title">
								<span>Local HTML Mockup</span>
								<small>{status}</small>
							</div>
							<label className="html-mockup-import-control">
								<input
									ref={fileInputRef}
									type="file"
									accept=".html,.htm,text/html"
									disabled={busy}
									onChange={importFile}
								/>
								<TldrawUiButtonIcon icon="plus" small />
								<span>
									<strong>Import local HTML</strong>
									<small>
										Transient upload; canvas stores only an opaque reference.
									</small>
								</span>
							</label>
							<div className="html-mockup-picker-section">
								REGISTERED MOCKUPS
							</div>
							{documents.length ? (
								documents.map((document) => (
									<TldrawUiButton
										type="menu"
										className="html-mockup-document-option"
										key={document.documentRef}
										disabled={busy}
										onClick={() => createFromDocument(document)}
									>
										<span>
											<strong>{document.title}</strong>
											<small>
												{document.documentRef}
												{document.revision === 'unresolved'
													? ''
													: ` · r${document.revision}`}
												{document.truncated ? ' · bounded' : ''}
											</small>
										</span>
									</TldrawUiButton>
								))
							) : (
								<p className="html-mockup-empty">
									{busy
										? 'Reading the local registry…'
										: 'No registered mockups.'}
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
			{selected && (
				<HtmlMockupInspector
					key={selected.id}
					shape={selected}
					onSelectDocument={() => setPickerOpen(true)}
				/>
			)}
		</>
	)
}

function HtmlMockupInspector({
	shape,
	onSelectDocument,
}: {
	shape: LocalHtmlMockupShape
	onSelectDocument: () => void
}) {
	const editor = useEditor()
	const meta = readLocalHtmlMockupMeta(shape)!
	const [status, setStatus] = useState('READY')
	const [refreshing, setRefreshing] = useState(false)

	const refresh = async () => {
		setRefreshing(true)
		setStatus('REFRESHING…')
		try {
			const snapshot = await getHtmlMockupSnapshot(meta.documentRef)
			const latest = editor.getShape(shape.id)
			if (!latest || !isLocalHtmlMockupShape(latest)) return
			updateLocalHtmlMockupSnapshot(editor, latest, snapshot)
			setStatus(`r${snapshot.revision}`)
		} catch (error) {
			setStatus(error instanceof Error ? error.message : 'REFRESH FAILED')
		} finally {
			setRefreshing(false)
		}
	}

	return (
		<aside
			className="html-mockup-inspector"
			aria-label="Local HTML Mockup inspector"
			onPointerDown={(event) => event.stopPropagation()}
			onClick={(event) => event.stopPropagation()}
		>
			<header className="html-mockup-inspector-head">
				<span>
					<TldrawUiButtonIcon icon="code" small />
					Local HTML Mockup
				</span>
				<small role="status" aria-live="polite" aria-atomic="true">
					{status}
				</small>
			</header>
			<div className="html-mockup-inspector-title">
				<strong>{meta.title}</strong>
				<span>{meta.documentRef}</span>
			</div>
			<div className="html-mockup-inspector-metrics">
				<span>
					REVISION
					<strong>{meta.revision.slice(0, 12)}</strong>
				</span>
				<span>
					CONTEXT
					<strong>{meta.truncated ? 'BOUNDED' : 'COMPACT'}</strong>
				</span>
			</div>
			<div className="html-mockup-inspector-target">
				<span>SELECTED TARGET</span>
				<strong>{meta.selectedTargetLabel ?? 'None'}</strong>
				<small>
					{meta.selectedTargetRef ??
						'Select a component in the preview. Keyboard: Tab, then Enter or Space.'}
				</small>
			</div>
			<div className="html-mockup-inspector-actions">
				<TldrawUiButton type="normal" onClick={onSelectDocument}>
					<TldrawUiButtonIcon icon="pack" small />
					Select
				</TldrawUiButton>
				<TldrawUiButton type="normal" disabled={refreshing} onClick={refresh}>
					<TldrawUiButtonIcon icon="arrow-cycle" small />
					Refresh
				</TldrawUiButton>
				<TldrawUiButton
					type="normal"
					disabled={!meta.selectedTargetRef}
					onClick={() => clearLocalHtmlMockupTarget(editor, shape)}
				>
					<TldrawUiButtonIcon icon="cross-2" small />
					Clear
				</TldrawUiButton>
			</div>
		</aside>
	)
}
