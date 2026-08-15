import { FormEvent, useMemo, useState } from 'react'
import {
	Editor,
	renderPlaintextFromRichText,
	toRichText,
	track,
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

const modes: Array<{ id: CommentAnchorMode; label: string; title: string }> = [
	{ id: 'point', label: 'Pin', title: 'Comment at a page point' },
	{ id: 'shape-precise', label: 'Shape', title: 'Comment at this exact point on a shape' },
	{ id: 'shape-imprecise', label: 'Edge', title: 'Comment attached to a shape edge' },
	{ id: 'region', label: 'Region', title: 'Comment on a dragged page region' },
	{ id: 'page', label: 'Page', title: 'Comment on the whole page' },
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
				{modes.map((mode) => (
					<button
						key={mode.id}
						type="button"
						title={mode.title}
						data-active={state.mode === mode.id && view.toolId === 'comment'}
						onClick={() => beginCommentPlacement(editor, mode.id)}
					>
						{mode.label}
					</button>
				))}
				{pageThreads.map(({ thread }, index) => (
					<button
						key={thread.id}
						type="button"
						className="canvas-comments__page-thread"
						onClick={() => selectCommentThread(editor, thread.id)}
					>
						Page #{index + 1}
					</button>
				))}
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
			style={point ? { left: point.x + 16, top: point.y + 16 } : undefined}
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
			style={point ? { left: point.x + 16, top: point.y + 16 } : undefined}
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
