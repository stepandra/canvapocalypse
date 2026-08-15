import { Editor } from 'tldraw'
import { JsonObject } from '@tldraw/utils'
import { TLPageId, TLRichText } from '@tldraw/tlschema'
import {
	TLComment,
	TLCommentAnchor,
	TLCommentId,
	TLCommentReaction,
	TLCommentReactionId,
	TLCommentThread,
	TLCommentThreadId,
	createComment,
	createCommentReaction,
	createCommentReactionId,
	createCommentThread,
} from './records'

function compareCreatedAtAndId(
	left: { createdAt: number; id: string },
	right: { createdAt: number; id: string }
) {
	const createdAtDifference = left.createdAt - right.createdAt
	if (createdAtDifference !== 0) return createdAtDifference
	return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
}

export function getCommentThread(
	editor: Editor,
	threadId: TLCommentThreadId
): TLCommentThread | undefined {
	const record = editor.store.get(threadId)
	return record?.typeName === 'comment-thread' ? record : undefined
}

export function listCommentThreads(editor: Editor, pageId?: TLPageId): TLCommentThread[] {
	return editor.store
		.allRecords()
		.filter(
			(record): record is TLCommentThread =>
				record.typeName === 'comment-thread' && (pageId === undefined || record.pageId === pageId)
		)
		.sort(compareCreatedAtAndId)
}

export function getComment(editor: Editor, commentId: TLCommentId): TLComment | undefined {
	const record = editor.store.get(commentId)
	return record?.typeName === 'comment' ? record : undefined
}

export function listComments(editor: Editor, threadId?: TLCommentThreadId): TLComment[] {
	return editor.store
		.allRecords()
		.filter(
			(record): record is TLComment =>
				record.typeName === 'comment' && (threadId === undefined || record.threadId === threadId)
		)
		.sort(compareCreatedAtAndId)
}

export function getCommentReaction(
	editor: Editor,
	reactionId: TLCommentReactionId
): TLCommentReaction | undefined {
	const record = editor.store.get(reactionId)
	return record?.typeName === 'comment-reaction' ? record : undefined
}

export function listCommentReactions(editor: Editor, commentId?: TLCommentId): TLCommentReaction[] {
	return editor.store
		.allRecords()
		.filter(
			(record): record is TLCommentReaction =>
				record.typeName === 'comment-reaction' &&
				(commentId === undefined || record.commentId === commentId)
		)
		.sort(compareCreatedAtAndId)
}

function requirePage(editor: Editor, pageId: TLPageId) {
	const page = editor.getPage(pageId)
	if (!page) throw new Error(`Missing comment page ${pageId}`)
	return page
}

function requireLiveThread(editor: Editor, threadId: TLCommentThreadId) {
	const thread = getCommentThread(editor, threadId)
	if (!thread) throw new Error(`Missing comment thread ${threadId}`)
	if (thread.isDeleted) throw new Error(`Comment thread ${threadId} is deleted`)
	requirePage(editor, thread.pageId)
	return thread
}

function requireLiveComment(editor: Editor, commentId: TLCommentId) {
	const comment = getComment(editor, commentId)
	if (!comment) throw new Error(`Missing comment ${commentId}`)
	if (comment.isDeleted) throw new Error(`Comment ${commentId} is deleted`)

	const thread = requireLiveThread(editor, comment.threadId)
	if (comment.pageId !== thread.pageId) {
		throw new Error(`Comment ${commentId} does not belong to thread page ${thread.pageId}`)
	}
	return { comment, thread }
}

function runIgnoringHistory<T>(editor: Editor, operation: () => T): T {
	let result!: T
	editor.run(
		() => {
			result = operation()
		},
		{ history: 'ignore' }
	)
	return result
}

export interface CreateThreadWithFirstCommentProps {
	pageId: TLPageId
	anchor: TLCommentAnchor
	createdBy: string
	authorId: string
	body: TLRichText
	now?: number
	threadMeta?: JsonObject
	commentMeta?: JsonObject
}

export function createThreadWithFirstComment(
	editor: Editor,
	props: CreateThreadWithFirstCommentProps
): { thread: TLCommentThread; comment: TLComment } {
	requirePage(editor, props.pageId)
	const thread = createCommentThread({
		pageId: props.pageId,
		anchor: props.anchor,
		createdBy: props.createdBy,
		now: props.now,
		meta: props.threadMeta,
	})
	const comment = createComment({
		threadId: thread.id,
		pageId: thread.pageId,
		authorId: props.authorId,
		body: props.body,
		now: props.now,
		meta: props.commentMeta,
	})
	editor.store.schema.validateRecord(editor.store, thread, 'createRecord', null)
	editor.store.schema.validateRecord(editor.store, comment, 'createRecord', null)

	return runIgnoringHistory(editor, () => {
		editor.store.put([thread, comment])
		return {
			thread: getCommentThread(editor, thread.id) ?? thread,
			comment: getComment(editor, comment.id) ?? comment,
		}
	})
}

export interface ReplyToThreadProps {
	threadId: TLCommentThreadId
	authorId: string
	body: TLRichText
	now?: number
	meta?: JsonObject
}

export function replyToThread(editor: Editor, props: ReplyToThreadProps): TLComment {
	const thread = requireLiveThread(editor, props.threadId)
	const comment = createComment({
		threadId: thread.id,
		pageId: thread.pageId,
		authorId: props.authorId,
		body: props.body,
		now: props.now,
		meta: props.meta,
	})

	return runIgnoringHistory(editor, () => {
		editor.store.put([comment])
		return getComment(editor, comment.id) ?? comment
	})
}

export interface EditCommentProps {
	commentId: TLCommentId
	body: TLRichText
	now?: number
}

export function editComment(editor: Editor, props: EditCommentProps): TLComment {
	const { comment } = requireLiveComment(editor, props.commentId)
	const updated: TLComment = {
		...comment,
		body: props.body,
		editedAt: props.now ?? Date.now(),
	}

	return runIgnoringHistory(editor, () => {
		editor.store.put([updated])
		return getComment(editor, updated.id) ?? updated
	})
}

export interface SetThreadResolvedProps {
	threadId: TLCommentThreadId
	resolved: boolean
	by: string
	now?: number
}

export function setThreadResolved(editor: Editor, props: SetThreadResolvedProps): TLCommentThread {
	const thread = requireLiveThread(editor, props.threadId)
	const updated: TLCommentThread = {
		...thread,
		resolved: props.resolved ? { at: props.now ?? Date.now(), by: props.by } : null,
	}

	return runIgnoringHistory(editor, () => {
		editor.store.put([updated])
		return getCommentThread(editor, updated.id) ?? updated
	})
}

export function softDeleteComment(
	editor: Editor,
	commentId: TLCommentId
): TLComment {
	const { comment } = requireLiveComment(editor, commentId)
	const updated: TLComment = { ...comment, isDeleted: true }

	return runIgnoringHistory(editor, () => {
		editor.store.put([updated])
		return getComment(editor, updated.id) ?? updated
	})
}

export function softDeleteThread(
	editor: Editor,
	threadId: TLCommentThreadId
): TLCommentThread {
	const thread = requireLiveThread(editor, threadId)
	const updated: TLCommentThread = { ...thread, isDeleted: true }

	return runIgnoringHistory(editor, () => {
		editor.store.put([updated])
		return getCommentThread(editor, updated.id) ?? updated
	})
}

export interface ToggleCommentReactionProps {
	commentId: TLCommentId
	userId: string
	emoji: string
	now?: number
	meta?: JsonObject
}

export function toggleCommentReaction(
	editor: Editor,
	props: ToggleCommentReactionProps
): TLCommentReaction | undefined {
	const { comment, thread } = requireLiveComment(editor, props.commentId)
	const reactionId = createCommentReactionId(comment.id, props.userId, props.emoji)
	const existing = getCommentReaction(editor, reactionId)

	if (existing) {
		if (
			existing.commentId !== comment.id ||
			existing.threadId !== thread.id ||
			existing.pageId !== thread.pageId ||
			existing.userId !== props.userId ||
			existing.emoji !== props.emoji
		) {
			throw new Error(`Comment reaction ${reactionId} has inconsistent references`)
		}
		return runIgnoringHistory(editor, () => {
			editor.store.remove([existing.id])
			return undefined
		})
	}

	const reaction = createCommentReaction({
		commentId: comment.id,
		threadId: thread.id,
		pageId: thread.pageId,
		userId: props.userId,
		emoji: props.emoji,
		now: props.now,
		meta: props.meta,
	})
	return runIgnoringHistory(editor, () => {
		editor.store.put([reaction])
		return getCommentReaction(editor, reaction.id) ?? reaction
	})
}

const editorsWithAnchorHistoryIsolation = new WeakSet<Editor>()
const editorsUpdatingCommentAnchor = new WeakSet<Editor>()

function anchorsEqual(left: TLCommentAnchor, right: TLCommentAnchor) {
	if (left.type !== right.type) return false
	if (left.type === 'page' && right.type === 'page') return true
	if (left.type === 'point' && right.type === 'point') {
		return left.x === right.x && left.y === right.y
	}
	if (left.type === 'shape' && right.type === 'shape') {
		return (
			left.shapeId === right.shapeId &&
			left.x === right.x &&
			left.y === right.y &&
			left.isPrecise === right.isPrecise
		)
	}
	if (left.type === 'region' && right.type === 'region') {
		return (
			left.x === right.x &&
			left.y === right.y &&
			left.w === right.w &&
			left.h === right.h &&
			left.pinX === right.pinX &&
			left.pinY === right.pinY
		)
	}
	return false
}

function installAnchorHistoryIsolation(editor: Editor) {
	if (editorsWithAnchorHistoryIsolation.has(editor)) return
	editorsWithAnchorHistoryIsolation.add(editor)
	let isRestoringContent = false
	editor.sideEffects.registerAfterChangeHandler('comment-thread', (previous, next, source) => {
		if (
			source === 'remote' ||
			editorsUpdatingCommentAnchor.has(editor) ||
			isRestoringContent ||
			anchorsEqual(previous.anchor, next.anchor)
		) {
			return
		}
		isRestoringContent = true
		try {
			editor.run(
				() => {
					editor.store.put([
						{
							...next,
							pageId: previous.pageId,
							createdBy: previous.createdBy,
							createdAt: previous.createdAt,
							resolved: previous.resolved,
							isDeleted: previous.isDeleted,
							meta: previous.meta,
						},
					])
				},
				{ history: 'ignore' }
			)
		} finally {
			isRestoringContent = false
		}
	})
}

export interface UpdateCommentThreadAnchorProps {
	threadId: TLCommentThreadId
	anchor: TLCommentAnchor
}

export function updateCommentThreadAnchor(
	editor: Editor,
	props: UpdateCommentThreadAnchorProps
): TLCommentThread {
	const thread = requireLiveThread(editor, props.threadId)
	if (anchorsEqual(thread.anchor, props.anchor)) return thread

	const updated: TLCommentThread = { ...thread, anchor: props.anchor }
	editor.store.schema.validateRecord(editor.store, updated, 'updateRecord', thread)
	installAnchorHistoryIsolation(editor)
	editorsUpdatingCommentAnchor.add(editor)
	try {
		editor.run(() => {
			editor.markHistoryStoppingPoint('Update comment thread anchor')
			editor.store.put([updated])
			const committed = getCommentThread(editor, thread.id)
			if (!committed || !anchorsEqual(committed.anchor, props.anchor)) {
				throw new Error(`Comment thread ${thread.id} anchor update was rejected`)
			}
		})
	} finally {
		editorsUpdatingCommentAnchor.delete(editor)
	}
	return getCommentThread(editor, thread.id) ?? updated
}
