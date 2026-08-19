import { FormEvent, useMemo, useState } from 'react'
import {
	Editor,
	renderPlaintextFromRichText,
	TldrawUiButton,
	TldrawUiButtonIcon,
	TldrawUiButtonLabel,
	TldrawUiPopover,
	TldrawUiPopoverContent,
	TldrawUiPopoverTrigger,
	TldrawUiToolbar,
	TldrawUiToolbarButton,
	TldrawUiTooltip,
	toRichText,
	track,
	type TLUiIconType,
	useEditor,
	useValue,
} from 'tldraw'
import { resolveCommentAnchorPagePoint } from './core/anchors'
import {
	createThreadWithFirstComment,
	replyToThread,
	setThreadResolved,
	softDeleteComment,
	softDeleteThread,
	toggleCommentReaction,
} from './core/mutations'
import {
	TLComment,
	TLCommentAnchor,
	TLCommentReaction,
	TLCommentThread,
} from './core/records'
import {
	CommentAnchorMode,
	beginCommentPlacement,
	closeCommentComposer,
	getCommentUiState,
	selectCommentThread,
} from './uiState'
import './comments.css'

const modes: Array<{
	id: CommentAnchorMode
	label: string
	title: string
	icon: TLUiIconType
}> = [
	{ id: 'point', label: 'Pin', title: 'Comment at a page point', icon: 'comment' },
	{
		id: 'shape-precise',
		label: 'Shape point',
		title: 'Comment at this exact point on a shape',
		icon: 'geo-rectangle',
	},
	{
		id: 'shape-imprecise',
		label: 'Shape edge',
		title: 'Comment attached to a shape edge',
		icon: 'corners',
	},
	{ id: 'region', label: 'Region', title: 'Comment on a dragged page region', icon: 'crop' },
	{ id: 'page', label: 'Page', title: 'Comment on the whole page', icon: 'tool-frame' },
]

function currentUserId(editor: Editor) {
	return editor.getAttributionUserId() ?? 'local-user'
}

function compareCreatedAtAndId(
	left: { createdAt: number; id: string },
	right: { createdAt: number; id: string }
) {
	return left.createdAt - right.createdAt || left.id.localeCompare(right.id)
}

function anchorPanelPosition(editor: Editor, anchor: TLCommentAnchor) {
	const pagePoint = resolveCommentAnchorPagePoint(editor, anchor)
	if (!pagePoint) return null
	return editor.pageToViewport(pagePoint)
}

function anchoredCardStyle(
	editor: Editor,
	point: { x: number; y: number } | null,
	reservedHeight: number
) {
	if (!point) return undefined
	const viewport = editor.getViewportScreenBounds()
	return {
		left: Math.max(16, Math.min(point.x + 16, viewport.w - 316)),
		top: Math.max(72, Math.min(point.y + 16, viewport.h - reservedHeight)),
	}
}

function regionStyle(editor: Editor, anchor: Extract<TLCommentAnchor, { type: 'region' }>) {
	const topLeft = editor.pageToViewport({ x: anchor.x, y: anchor.y })
	const bottomRight = editor.pageToViewport({
		x: anchor.x + anchor.w,
		y: anchor.y + anchor.h,
	})
	return {
		left: Math.min(topLeft.x, bottomRight.x),
		top: Math.min(topLeft.y, bottomRight.y),
		width: Math.abs(bottomRight.x - topLeft.x),
		height: Math.abs(bottomRight.y - topLeft.y),
	}
}

export const CommentOverlay = track(function CommentOverlay() {
	const editor = useEditor()
	const [toolbarOpen, setToolbarOpen] = useState(false)
	const state = useValue('canvas comment ui', () => getCommentUiState(editor).get(), [editor])
	const threadQuery = useMemo(() => editor.store.query.records('comment-thread'), [editor])
	const commentQuery = useMemo(() => editor.store.query.records('comment'), [editor])
	const reactionQuery = useMemo(
		() => editor.store.query.records('comment-reaction'),
		[editor]
	)
	const view = useValue(
		'canvas comments view',
		() => {
			const pageId = editor.getCurrentPageId()
			const threads = threadQuery
				.get()
				.filter((thread) => !thread.isDeleted && thread.pageId === pageId)
				.sort(compareCreatedAtAndId)
			return {
				threads: threads.map((thread) => ({
					thread,
					point: anchorPanelPosition(editor, thread.anchor),
				})),
				comments: commentQuery.get().sort(compareCreatedAtAndId),
				reactions: reactionQuery.get(),
				toolId: editor.getCurrentToolId(),
				composerPoint: state.composerAnchor
					? anchorPanelPosition(editor, state.composerAnchor)
					: null,
			}
		},
		[editor, threadQuery, commentQuery, reactionQuery, state.composerAnchor]
	)
	const selected = view.threads.find(
		({ thread }) => thread.id === state.selectedThreadId
	)
	const pageThreads = view.threads.filter(({ thread }) => thread.anchor.type === 'page')

	return (
		<div className="canvas-comments" onPointerDown={(event) => event.stopPropagation()}>
			<div className="canvas-comments__toolbar" role="toolbar" aria-label="Canvas comments">
				<TldrawUiPopover
					id="canvas-comment-tools"
					open={toolbarOpen}
					onOpenChange={setToolbarOpen}
				>
					<TldrawUiTooltip
						content="Comment tools"
						side="right"
						sideOffset={8}
						delayDuration={350}
					>
						<TldrawUiPopoverTrigger>
							<TldrawUiButton
								type="tool"
								className="workbench-rail-trigger canvas-comments__trigger"
								isActive={toolbarOpen || view.toolId === 'comment'}
								aria-label="Comment tools"
								aria-expanded={toolbarOpen}
							>
								<TldrawUiButtonIcon icon="comment" />
							</TldrawUiButton>
						</TldrawUiPopoverTrigger>
					</TldrawUiTooltip>
					<TldrawUiPopoverContent
						side="right"
						align="start"
						sideOffset={8}
						collisionPadding={8}
					>
						<div className="canvas-comments__menu">
							<TldrawUiToolbar
								className="canvas-comments__mode-toolbar"
								label="Comment placement"
								orientation="horizontal"
								tooltipSide="bottom"
							>
								{modes.map((mode) => {
									const active = state.mode === mode.id && view.toolId === 'comment'
									return (
										<TldrawUiToolbarButton
											key={mode.id}
											type="tool"
											className="canvas-comments__mode"
											title={mode.title}
											tooltip={mode.title}
											isActive={active}
											aria-label={mode.label}
											aria-pressed={active}
											onClick={() => {
												beginCommentPlacement(editor, mode.id)
												setToolbarOpen(false)
											}}
										>
											<TldrawUiButtonIcon icon={mode.icon} />
										</TldrawUiToolbarButton>
									)
								})}
							</TldrawUiToolbar>
							{pageThreads.length > 0 && (
								<div className="canvas-comments__page-threads">
									{pageThreads.map(({ thread }, index) => (
										<TldrawUiButton
											key={thread.id}
											type="menu"
											className="canvas-comments__page-thread"
											onClick={() => {
												selectCommentThread(editor, thread.id)
												setToolbarOpen(false)
											}}
										>
											<TldrawUiButtonIcon icon="comment" small />
											<TldrawUiButtonLabel>Page #{index + 1}</TldrawUiButtonLabel>
										</TldrawUiButton>
									))}
								</div>
							)}
						</div>
					</TldrawUiPopoverContent>
				</TldrawUiPopover>
			</div>

			{view.threads.map(({ thread, point }, index) => (
				<div key={thread.id}>
					{thread.anchor.type === 'region' && (
						<div
							className="canvas-comments__region"
							data-resolved={Boolean(thread.resolved)}
							style={regionStyle(editor, thread.anchor)}
						/>
					)}
					{point && (
						<button
							type="button"
							className="canvas-comments__pin"
							data-resolved={Boolean(thread.resolved)}
							style={{ left: point.x, top: point.y }}
							onClick={() => selectCommentThread(editor, thread.id)}
							aria-label={`Open comment thread ${index + 1}`}
						>
							{index + 1}
						</button>
					)}
				</div>
			))}

			{state.composerAnchor?.type === 'region' && (
				<div
					className="canvas-comments__region canvas-comments__region--draft"
					style={regionStyle(editor, state.composerAnchor)}
				/>
			)}
			{state.composerAnchor && (
				<CommentComposer
					anchor={state.composerAnchor}
					point={view.composerPoint}
					onCancel={() => closeCommentComposer(editor)}
					onSubmit={(body) => {
						const userId = currentUserId(editor)
						const created = createThreadWithFirstComment(editor, {
							pageId: editor.getCurrentPageId(),
							anchor: state.composerAnchor!,
							createdBy: userId,
							authorId: userId,
							body: toRichText(body),
						})
						selectCommentThread(editor, created.thread.id)
					}}
				/>
			)}

			{selected && (
				<CommentThreadPanel
					thread={selected.thread}
					point={selected.point}
					comments={view.comments.filter(
						(comment) => comment.threadId === selected.thread.id
					)}
					reactions={view.reactions.filter(
						(reaction) => reaction.threadId === selected.thread.id
					)}
					onClose={() => selectCommentThread(editor, null)}
				/>
			)}
		</div>
	)
})

function CommentComposer({
	anchor,
	point,
	onCancel,
	onSubmit,
}: {
	anchor: TLCommentAnchor
	point: { x: number; y: number } | null
	onCancel(): void
	onSubmit(body: string): void
}) {
	const editor = useEditor()
	const [body, setBody] = useState('')
	const submit = (event: FormEvent) => {
		event.preventDefault()
		const trimmed = body.trim()
		if (trimmed) onSubmit(trimmed)
	}
	return (
		<form
			className="canvas-comments__card canvas-comments__composer"
			data-page-anchor={!point}
			style={anchoredCardStyle(editor, point, 210)}
			onSubmit={submit}
		>
			<strong>New {anchor.type} comment</strong>
			<textarea
				autoFocus
				value={body}
				onChange={(event) => setBody(event.target.value)}
				placeholder="Leave a comment…"
			/>
			<div className="canvas-comments__actions">
				<button type="button" onClick={onCancel}>Cancel</button>
				<button type="submit" disabled={!body.trim()}>Post</button>
			</div>
		</form>
	)
}

function CommentThreadPanel({
	thread,
	point,
	comments,
	reactions,
	onClose,
}: {
	thread: TLCommentThread
	point: { x: number; y: number } | null
	comments: TLComment[]
	reactions: TLCommentReaction[]
	onClose(): void
}) {
	const editor = useEditor()
	const [reply, setReply] = useState('')
	const userId = currentUserId(editor)
	const submitReply = (event: FormEvent) => {
		event.preventDefault()
		const body = reply.trim()
		if (!body) return
		replyToThread(editor, {
			threadId: thread.id,
			authorId: userId,
			body: toRichText(body),
		})
		setReply('')
	}

	return (
		<section
			className="canvas-comments__card canvas-comments__thread"
			data-page-anchor={!point}
			style={anchoredCardStyle(editor, point, 500)}
		>
			<header>
				<strong>{thread.resolved ? 'Resolved thread' : 'Comment thread'}</strong>
				<button type="button" onClick={onClose} aria-label="Close thread">×</button>
			</header>
			<div className="canvas-comments__messages">
				{comments.map((comment) => {
					const ownReactions = reactions.filter(
						(reaction) => reaction.commentId === comment.id
					)
					return (
						<article key={comment.id} data-deleted={comment.isDeleted}>
							<small>{comment.authorId}</small>
							<p>
								{comment.isDeleted
									? 'Comment deleted'
									: renderPlaintextFromRichText(editor, comment.body)}
							</p>
							{!comment.isDeleted && (
								<div className="canvas-comments__reactions">
									{['👍', '❤️', '🎉'].map((emoji) => {
										const matching = ownReactions.filter(
											(reaction) => reaction.emoji === emoji
										)
										return (
											<button
												key={emoji}
												type="button"
												data-active={matching.some(
													(reaction) => reaction.userId === userId
												)}
												onClick={() =>
													toggleCommentReaction(editor, {
														commentId: comment.id,
														userId,
														emoji,
													})
												}
											>
												{emoji}{matching.length > 0 ? ` ${matching.length}` : ''}
											</button>
										)
									})}
									<button type="button" onClick={() => softDeleteComment(editor, comment.id)}>
										Delete
									</button>
								</div>
							)}
						</article>
					)
				})}
			</div>
			<form onSubmit={submitReply}>
				<textarea
					value={reply}
					onChange={(event) => setReply(event.target.value)}
					placeholder="Reply…"
				/>
				<div className="canvas-comments__actions">
					<button
						type="button"
						onClick={() =>
							setThreadResolved(editor, {
								threadId: thread.id,
								resolved: !thread.resolved,
								by: userId,
							})
						}
					>
						{thread.resolved ? 'Reopen' : 'Resolve'}
					</button>
					<button type="button" onClick={() => softDeleteThread(editor, thread.id)}>
						Delete thread
					</button>
					<button type="submit" disabled={!reply.trim()}>Reply</button>
				</div>
			</form>
		</section>
	)
}
