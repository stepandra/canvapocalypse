import { Editor, TLPageId, TLShape, TLShapeId } from 'tldraw'
import { resolveCommentAnchorPagePoint } from './anchors'
import {
	TLComment,
	TLCommentAnchor,
	TLCommentReaction,
	TLCommentThread,
	TLCommentThreadId,
} from './records'

type ShapeCommentAnchor = Extract<TLCommentAnchor, { type: 'shape' }>
type PendingShapeAnchor = {
	anchor: ShapeCommentAnchor
	point: { x: number; y: number }
}

export const CANVAS_COMMENT_LIFECYCLE_ID =
	'canvas.comments/anchor-lifecycle/v1' as const

function commentThreads(editor: Editor) {
	return editor.store
		.allRecords()
		.filter(
			(record): record is TLCommentThread => record.typeName === 'comment-thread'
		)
}

function moveThreadToPage(
	editor: Editor,
	thread: TLCommentThread,
	pageId: TLPageId
) {
	const updates: Array<TLCommentThread | TLComment | TLCommentReaction> = [
		{ ...thread, pageId },
	]
	for (const record of editor.store.allRecords()) {
		if (record.typeName === 'comment' && record.threadId === thread.id) {
			updates.push({ ...record, pageId })
		} else if (
			record.typeName === 'comment-reaction' &&
			record.threadId === thread.id
		) {
			updates.push({ ...record, pageId })
		}
	}
	editor.store.put(updates)
}

/**
 * Keeps semantic comment anchors consistent with native shape lifecycle operations.
 * Moving a shape between pages moves its thread records with it. Deleting a target
 * preserves the conversation at its last page-space point instead of leaving a
 * dangling shape reference. Both side effects participate in the shape operation's
 * existing history transaction.
 */
export function mountCommentLifecycle(editor: Editor) {
	const pendingShapeAnchors = new Map<
		TLShapeId,
		Map<TLCommentThreadId, PendingShapeAnchor>
	>()

	const disposeBeforeDelete = editor.sideEffects.registerBeforeDeleteHandler(
		'shape',
		(shape) => {
			const pending = new Map<TLCommentThreadId, PendingShapeAnchor>()
			for (const thread of commentThreads(editor)) {
				if (
					thread.isDeleted ||
					thread.anchor.type !== 'shape' ||
					thread.anchor.shapeId !== shape.id
				) {
					continue
				}
				const point = resolveCommentAnchorPagePoint(editor, thread.anchor)
				if (point) {
					pending.set(thread.id, {
						anchor: thread.anchor,
						point: { x: point.x, y: point.y },
					})
				}
			}
			if (pending.size) pendingShapeAnchors.set(shape.id, pending)
		}
	)

	const disposeAfterDelete = editor.sideEffects.registerAfterDeleteHandler(
		'shape',
		(shape) => {
			const pending = pendingShapeAnchors.get(shape.id)
			if (!pending) return
			const updates: TLCommentThread[] = []
			for (const [threadId, { point }] of pending) {
				const record = editor.store.get(threadId)
				if (record?.typeName !== 'comment-thread' || record.isDeleted) continue
				updates.push({ ...record, anchor: { type: 'point', ...point } })
			}
			if (updates.length) editor.store.put(updates)
			queueMicrotask(() => pendingShapeAnchors.delete(shape.id))
		}
	)

	const disposeAfterCreate = editor.sideEffects.registerAfterCreateHandler(
		'shape',
		(shape) => {
			const pending = pendingShapeAnchors.get(shape.id)
			if (!pending) return
			pendingShapeAnchors.delete(shape.id)
			const pageId = editor.getAncestorPageId(shape.id)
			if (!pageId) return
			for (const [threadId, { anchor }] of pending) {
				const record = editor.store.get(threadId)
				if (record?.typeName !== 'comment-thread' || record.isDeleted) continue
				moveThreadToPage(editor, { ...record, anchor }, pageId)
			}
		}
	)

	const disposeAfterChange = editor.sideEffects.registerAfterChangeHandler(
		'shape',
		(_before: TLShape, after: TLShape) => {
			const affectedShapeIds = editor.getShapeAndDescendantIds([after.id])
			for (const thread of commentThreads(editor)) {
				if (
					thread.isDeleted ||
					thread.anchor.type !== 'shape' ||
					!affectedShapeIds.has(thread.anchor.shapeId)
				) {
					continue
				}
				const pageId = editor.getAncestorPageId(thread.anchor.shapeId)
				if (pageId && pageId !== thread.pageId) {
					moveThreadToPage(editor, thread, pageId)
				}
			}
		}
	)

	const disposeAfterPageDelete = editor.sideEffects.registerAfterDeleteHandler(
		'page',
		(page) => {
			const recordIds = editor.store
				.allRecords()
				.filter(
					(record) =>
						(record.typeName === 'comment-thread' ||
							record.typeName === 'comment' ||
							record.typeName === 'comment-reaction') &&
						record.pageId === page.id
				)
				.map((record) => record.id)
			if (recordIds.length) editor.store.remove(recordIds)
		}
	)

	return () => {
		pendingShapeAnchors.clear()
		disposeAfterPageDelete()
		disposeAfterChange()
		disposeAfterCreate()
		disposeAfterDelete()
		disposeBeforeDelete()
	}
}
