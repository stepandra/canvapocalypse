import { useRef, useState } from 'react'
import {
	stopEventPropagation,
	TldrawUiButton,
	TldrawUiButtonIcon,
	TldrawUiPopover,
	TldrawUiPopoverContent,
	TldrawUiPopoverTrigger,
	TldrawUiToolbarButton,
	TldrawUiTooltip,
	type Editor,
	type TLShapeId,
	useEditor,
	useToasts,
	useValue,
} from 'tldraw'
import { getWorkbenchPageMode } from '../workbench/workbenchPages'
import {
	createMarkdownDocumentShape,
	isMarkdownDocumentShape,
	MAX_MARKDOWN_DOCUMENT_BYTES,
	replaceMarkdownDocumentShape,
} from './MarkdownDocumentShape'
import {
	createMarkdownDocumentInput,
	type MarkdownDocumentSourceKind,
} from './markdownDocumentContract'

type MarkdownEditorMode = 'create' | 'edit'
type MarkdownFileAction =
	| { type: 'create' }
	| { type: 'refresh'; shapeId: TLShapeId }

export function MarkdownImportButton() {
	const editor = useEditor()
	const toasts = useToasts()
	const inputRef = useRef<HTMLInputElement>(null)
	const fileActionRef = useRef<MarkdownFileAction>({ type: 'create' })
	const [busy, setBusy] = useState(false)
	const [open, setOpen] = useState(false)
	const [editorMode, setEditorMode] = useState<MarkdownEditorMode | null>(null)
	const [draftTitle, setDraftTitle] = useState('')
	const [draftMarkdown, setDraftMarkdown] = useState('')
	const pageMode = useValue(
		'markdown import page mode',
		() => getWorkbenchPageMode(editor),
		[editor]
	)
	const selected = useValue(
		'selected Markdown document',
		() => {
			const shape = editor.getOnlySelectedShape()
			return isMarkdownDocumentShape(shape) ? shape : null
		},
		[editor]
	)

	if (!pageMode || pageMode === 'freeform') return null

	const chooseFile = (action: MarkdownFileAction) => {
		fileActionRef.current = action
		inputRef.current?.click()
	}
	const showEditor = (mode: MarkdownEditorMode) => {
		setEditorMode(mode)
		setDraftTitle(mode === 'edit' && selected ? selected.props.title : '')
		setDraftMarkdown(mode === 'edit' && selected ? selected.props.markdown : '')
	}
	const close = () => {
		setOpen(false)
		setEditorMode(null)
		editor.menus.clearOpenMenus()
	}
	const saveDraft = () => {
		if (!draftMarkdown.trim()) {
			toasts.addToast({
				title: 'Markdown is empty',
				description: 'Paste or write Markdown before saving the document.',
				severity: 'warning',
			})
			return
		}
		if (new TextEncoder().encode(draftMarkdown).byteLength > MAX_MARKDOWN_DOCUMENT_BYTES) {
			toasts.addToast({
				title: 'Markdown is too large',
				description: 'Keep the document at 128 KB or smaller.',
				severity: 'error',
			})
			return
		}
		const latest = selected ? editor.getShape(selected.id) : null
		if (editorMode === 'edit' && !isMarkdownDocumentShape(latest)) {
			toasts.addToast({
				title: 'Selection changed',
				description: 'Select the Markdown document again before editing it.',
				severity: 'warning',
			})
			return
		}
		const input = createMarkdownDocumentInput(
			draftMarkdown,
			editorMode === 'edit' && latest ? latest.props.sourceName : '',
			{
				...(editorMode === 'edit' && latest
					? { documentRef: latest.props.documentRef }
					: {}),
				...(draftTitle.trim() ? { title: draftTitle } : {}),
				sourceKind: editorMode === 'edit' ? 'edited' : 'pasted',
			}
		)
		if (editorMode === 'edit' && latest) {
			replaceMarkdownDocumentShape(editor, latest, input)
		} else {
			createMarkdownDocumentShape(editor, input)
		}
		toasts.addToast({
			title: editorMode === 'edit' ? 'Markdown updated' : 'Markdown created',
			description: `${input.title} · revision ${input.revision.slice(7, 15)}`,
			severity: 'success',
		})
		close()
	}

	return (
		<div
			className="workbench-markdown-import"
			onPointerDown={stopEventPropagation}
			onClick={stopEventPropagation}
		>
			<TldrawUiPopover
				id="workbench-markdown-documents"
				open={open}
				onOpenChange={(next) => {
					setOpen(next)
					if (!next) setEditorMode(null)
				}}
			>
				<TldrawUiTooltip
					content="Markdown documents"
					side="top"
					delayDuration={350}
				>
					<TldrawUiPopoverTrigger>
						<TldrawUiToolbarButton
							type="tool"
							title="Markdown documents"
							aria-label="Markdown documents"
							aria-expanded={open}
							isActive={open || Boolean(selected)}
							disabled={busy}
						>
							<TldrawUiButtonIcon icon="heading" />
						</TldrawUiToolbarButton>
					</TldrawUiPopoverTrigger>
				</TldrawUiTooltip>
				<TldrawUiPopoverContent
					side="top"
					align="center"
					sideOffset={8}
					collisionPadding={8}
				>
					{editorMode ? (
						<div className="markdown-document-editor" role="dialog" aria-label="Markdown editor">
							<header>
								<div>
									<strong>{editorMode === 'edit' ? 'Edit selected note' : 'Paste Markdown'}</strong>
									<small>
										{editorMode === 'edit'
											? 'Saves a new revision to this canvas document.'
											: 'Creates a path-free Markdown snapshot.'}
									</small>
								</div>
							</header>
							<label>
								<span>Title</span>
								<input
									value={draftTitle}
									maxLength={160}
									placeholder="Derived from frontmatter or heading"
									onChange={(event) => setDraftTitle(event.currentTarget.value)}
								/>
							</label>
							<label>
								<span>Markdown</span>
								<textarea
									value={draftMarkdown}
									placeholder="# Context note"
									onChange={(event) => setDraftMarkdown(event.currentTarget.value)}
								/>
							</label>
							<footer>
								<TldrawUiButton type="normal" onClick={() => setEditorMode(null)}>
									Back
								</TldrawUiButton>
								<TldrawUiButton type="primary" onClick={saveDraft}>
									{editorMode === 'edit' ? 'Save revision' : 'Create note'}
								</TldrawUiButton>
							</footer>
						</div>
					) : (
						<div className="markdown-document-menu" role="menu" aria-label="Markdown documents">
							<div className="markdown-document-menu-head">
								<strong>Markdown documents</strong>
								<small>Explicit snapshots only · no Vault indexing</small>
							</div>
							<TldrawUiButton type="menu" onClick={() => chooseFile({ type: 'create' })}>
								<TldrawUiButtonIcon icon="plus" small />
								<span>Import Markdown file</span>
							</TldrawUiButton>
							<TldrawUiButton type="menu" onClick={() => showEditor('create')}>
								<TldrawUiButtonIcon icon="heading" small />
								<span>Paste Markdown</span>
							</TldrawUiButton>
							{selected && (
								<>
									<div className="markdown-document-menu-divider" />
									<div className="markdown-document-menu-selected">
										<span>SELECTED</span>
										<strong>{selected.props.title}</strong>
										<small>r{selected.props.revision.slice(7, 15)}</small>
									</div>
									<TldrawUiButton
										type="menu"
										onClick={() => chooseFile({ type: 'refresh', shapeId: selected.id })}
									>
										<TldrawUiButtonIcon icon="arrow-cycle" small />
										<span>Refresh selected from file…</span>
									</TldrawUiButton>
									<TldrawUiButton type="menu" onClick={() => showEditor('edit')}>
										<TldrawUiButtonIcon icon="heading" small />
										<span>Edit or rename selected</span>
									</TldrawUiButton>
								</>
							)}
						</div>
					)}
				</TldrawUiPopoverContent>
			</TldrawUiPopover>
			<input
				ref={inputRef}
				className="workbench-markdown-file-input"
				type="file"
				accept=".md,.markdown,text/markdown,text/plain"
				tabIndex={-1}
				onChange={(event) => {
					const file = event.currentTarget.files?.[0]
					event.currentTarget.value = ''
					if (!file) return
					setBusy(true)
					void importMarkdownFile(file, editor, fileActionRef.current)
						.then(({ refreshed, title, revision }) => {
							toasts.addToast({
								title: refreshed ? 'Markdown refreshed' : 'Markdown imported',
								description: `${title} · revision ${revision.slice(7, 15)}`,
								severity: 'success',
							})
							close()
						})
						.catch((error) => {
							toasts.addToast({
								title: 'Markdown import failed',
								description:
									error instanceof Error ? error.message : 'The note could not be read.',
								severity: 'error',
							})
						})
						.finally(() => setBusy(false))
				}}
			/>
		</div>
	)
}

export async function importMarkdownFile(
	file: File,
	editor: Editor,
	action: MarkdownFileAction = { type: 'create' }
) {
	if (file.size > MAX_MARKDOWN_DOCUMENT_BYTES) {
		throw new Error('Select a Markdown note at 128 KB or smaller.')
	}
	const markdown = await file.text()
	if (new TextEncoder().encode(markdown).byteLength > MAX_MARKDOWN_DOCUMENT_BYTES) {
		throw new Error('Select a Markdown note at 128 KB or smaller.')
	}
	const target = action.type === 'refresh' ? editor.getShape(action.shapeId) : null
	if (action.type === 'refresh' && !isMarkdownDocumentShape(target)) {
		throw new Error('The Markdown document selected for refresh is no longer available.')
	}
	const sourceKind: MarkdownDocumentSourceKind = 'file'
	const input = createMarkdownDocumentInput(markdown, file.name, {
		...(target ? { documentRef: target.props.documentRef } : {}),
		sourceKind,
	})
	if (target) replaceMarkdownDocumentShape(editor, target, input)
	else createMarkdownDocumentShape(editor, input)
	return { refreshed: Boolean(target), title: input.title, revision: input.revision }
}
