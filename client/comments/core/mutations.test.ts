import {
	Editor,
	createTLStore,
	defaultBindingUtils,
	defaultShapeTools,
	defaultShapeUtils,
	defaultTools,
} from 'tldraw'
import { TLPageId, toRichText } from '@tldraw/tlschema'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
	createThreadWithFirstComment,
	editComment,
	getComment,
	getCommentReaction,
	getCommentThread,
	listCommentReactions,
	listCommentThreads,
	listComments,
	replyToThread,
	setThreadResolved,
	softDeleteComment,
	softDeleteThread,
	toggleCommentReaction,
	updateCommentThreadAnchor,
} from './mutations'
import {
	CANVAS_COMMENT_RECORDS,
	TLComment,
	createComment,
	createCommentId,
	createCommentReaction,
	createCommentReactionId,
	createCommentThread,
	createCommentThreadId,
} from './records'

function installMinimalEditorDom() {
	class FakeElement {
		constructor(public ownerDocument: typeof document) {}

		tabIndex = 0
		classList = { add() {}, remove() {} }
		style = {
			setProperty() {},
			removeProperty() {},
			getPropertyValue() {
				return ''
			},
		}
		addEventListener() {}
		removeEventListener() {}
		setAttribute() {}
		removeAttribute() {}
		appendChild() {
			return this
		}
		removeChild() {
			return this
		}
		remove() {}
		focus() {}
		blur() {}
		contains() {
			return true
		}
		getBoundingClientRect() {
			return {
				x: 0,
				y: 0,
				top: 0,
				left: 0,
				width: 1080,
				height: 720,
				bottom: 720,
				right: 1080,
				toJSON: () => ({}),
			}
		}
	}

	const fakeDocument = {
		activeElement: null,
		body: null as unknown as FakeElement,
		documentElement: null as unknown as FakeElement,
		createElement: () => new FakeElement(fakeDocument as unknown as typeof document),
	}
	const body = new FakeElement(fakeDocument as unknown as typeof document)
	fakeDocument.body = body
	fakeDocument.documentElement = body
	vi.stubGlobal('document', fakeDocument)
	const requestAnimationFrame = () => 1
	const cancelAnimationFrame = () => undefined
	vi.stubGlobal('window', {
		devicePixelRatio: 1,
		addEventListener() {},
		removeEventListener() {},
		requestAnimationFrame,
		cancelAnimationFrame,
	})
	vi.stubGlobal('navigator', { userAgent: 'vitest' })
	vi.stubGlobal('requestAnimationFrame', requestAnimationFrame)
	vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrame)
}

class TestEditor extends Editor {
	constructor() {
		const shapeUtils = [...defaultShapeUtils]
		const bindingUtils = [...defaultBindingUtils]
		super({
			shapeUtils,
			bindingUtils,
			tools: [...defaultTools, ...defaultShapeTools],
			store: createTLStore({ shapeUtils, bindingUtils, records: CANVAS_COMMENT_RECORDS }),
			getContainer: () => document.createElement('div'),
			initialState: 'select',
		})
	}
}

function makePageId(id: string) {
	return `page:${id}` as TLPageId
}

function createThread(editor: Editor, overrides: Partial<Parameters<typeof createThreadWithFirstComment>[1]> = {}) {
	return createThreadWithFirstComment(editor, {
		pageId: editor.getCurrentPageId(),
		anchor: { type: 'point', x: 10, y: 20 },
		createdBy: 'user:author',
		authorId: 'user:author',
		body: toRichText('First'),
		now: 100,
		...overrides,
	})
}

function expectNoUndo(editor: Editor, assertion: () => void) {
	editor.undo()
	assertion()
}

describe('comment mutations', () => {
	let editor: TestEditor

	beforeEach(() => {
		installMinimalEditorDom()
		editor = new TestEditor()
	})

	afterEach(() => {
		editor.dispose()
		vi.unstubAllGlobals()
	})

	it('creates the thread and first comment atomically without entering history', () => {
		const created = createThread(editor)

		expect(getCommentThread(editor, created.thread.id)).toEqual(created.thread)
		expect(getComment(editor, created.comment.id)).toEqual(created.comment)
		expect(created.comment.threadId).toBe(created.thread.id)
		expect(created.comment.pageId).toBe(created.thread.pageId)
		expectNoUndo(editor, () => {
			expect(getCommentThread(editor, created.thread.id)).toEqual(created.thread)
			expect(getComment(editor, created.comment.id)).toEqual(created.comment)
		})
	})

	it('rolls back both first-post records when the comment insert fails', () => {
		const beforeIds = new Set(editor.store.allRecords().map((record) => record.id))
		const dispose = editor.sideEffects.registerBeforeCreateHandler('comment', () => {
			throw new Error('reject first comment')
		})

		try {
			expect(() => createThread(editor)).toThrow('reject first comment')
		} finally {
			dispose()
		}

		expect(editor.store.allRecords().map((record) => record.id).filter((id) => !beforeIds.has(id))).toEqual([])
		expect(listCommentThreads(editor)).toEqual([])
		expect(listComments(editor)).toEqual([])
	})

	it('rejects an invalid first-post anchor without creating either record', () => {
		expect(() =>
			createThread(editor, {
				anchor: { type: 'region', x: 0, y: 0, w: -1, h: 10 },
			})
		).toThrow()

		expect(listCommentThreads(editor)).toEqual([])
		expect(listComments(editor)).toEqual([])
	})

	it('rejects a missing page before creating the first post', () => {
		const pageId = makePageId('missing')
		expect(() => createThread(editor, { pageId })).toThrow(`Missing comment page ${pageId}`)
		expect(listCommentThreads(editor)).toEqual([])
	})

	it('adds flat, page-consistent replies without entering history', () => {
		const { thread, comment: first } = createThread(editor)
		const reply = replyToThread(editor, {
			threadId: thread.id,
			authorId: 'user:reply',
			body: toRichText('Reply'),
			now: 101,
		})

		expect(reply.threadId).toBe(first.threadId)
		expect(reply.pageId).toBe(thread.pageId)
		expect(Object.hasOwn(reply, 'parentCommentId')).toBe(false)
		expect(listComments(editor, thread.id).map((comment) => comment.id)).toEqual([
			first.id,
			reply.id,
		])
		expectNoUndo(editor, () => expect(getComment(editor, reply.id)).toEqual(reply))
	})

	it('edits, resolves, reopens, and soft-deletes live records', () => {
		const { thread, comment } = createThread(editor)

		const edited = editComment(editor, {
			commentId: comment.id,
			body: toRichText('Edited'),
			now: 110,
		})
		expect(edited.body).toEqual(toRichText('Edited'))
		expect(edited.editedAt).toBe(110)

		const resolved = setThreadResolved(editor, {
			threadId: thread.id,
			resolved: true,
			by: 'user:resolver',
			now: 120,
		})
		expect(resolved.resolved).toEqual({ at: 120, by: 'user:resolver' })

		const reopened = setThreadResolved(editor, {
			threadId: thread.id,
			resolved: false,
			by: 'user:resolver',
			now: 121,
		})
		expect(reopened.resolved).toBeNull()

		expect(softDeleteComment(editor, comment.id).isDeleted).toBe(true)
		expect(() => editComment(editor, { commentId: comment.id, body: toRichText('No') })).toThrow(
			'is deleted'
		)
		expect(softDeleteThread(editor, thread.id).isDeleted).toBe(true)
		expect(() => replyToThread(editor, { threadId: thread.id, authorId: 'user:x', body: toRichText('No') })).toThrow(
			'is deleted'
		)
	})

	it('toggles a deterministic reaction idempotently and outside history', () => {
		const { thread, comment } = createThread(editor)
		const props = { commentId: comment.id, userId: 'user:reactor', emoji: '👍', now: 130 }
		const expectedId = createCommentReactionId(comment.id, props.userId, props.emoji)

		const added = toggleCommentReaction(editor, props)
		expect(added?.id).toBe(expectedId)
		expect(added).toMatchObject({
			commentId: comment.id,
			threadId: thread.id,
			pageId: thread.pageId,
		})
		expect(getCommentReaction(editor, expectedId)).toEqual(added)
		expectNoUndo(editor, () => expect(getCommentReaction(editor, expectedId)).toEqual(added))

		expect(toggleCommentReaction(editor, props)).toBeUndefined()
		expect(getCommentReaction(editor, expectedId)).toBeUndefined()
		expect(toggleCommentReaction(editor, props)?.id).toBe(expectedId)
		expect(listCommentReactions(editor, comment.id)).toHaveLength(1)
	})

	it('rejects inconsistent comment, thread, page, and reaction references', () => {
		const { thread, comment } = createThread(editor)
		const inconsistentComment: TLComment = {
			...createComment({
				threadId: thread.id,
				pageId: makePageId('wrong'),
				authorId: 'user:bad',
				body: toRichText('Bad'),
				now: 140,
			}),
			id: createCommentId('inconsistent'),
		}
		editor.run(() => editor.store.put([inconsistentComment]), { history: 'ignore' })

		expect(() => editComment(editor, { commentId: inconsistentComment.id, body: toRichText('No') })).toThrow(
			'does not belong to thread page'
		)
		expect(() => toggleCommentReaction(editor, { commentId: inconsistentComment.id, userId: 'user:x', emoji: '👎' })).toThrow(
			'does not belong to thread page'
		)

		const reactionId = createCommentReactionId(comment.id, 'user:reactor', '👍')
		const inconsistentReaction = {
			...createCommentReaction({
				commentId: comment.id,
				threadId: createCommentThreadId('wrong'),
				pageId: thread.pageId,
				userId: 'user:reactor',
				emoji: '👍',
				now: 141,
			}),
			id: reactionId,
		}
		editor.run(() => editor.store.put([inconsistentReaction]), { history: 'ignore' })

		expect(() => toggleCommentReaction(editor, { commentId: comment.id, userId: 'user:reactor', emoji: '👍' })).toThrow(
			'has inconsistent references'
		)
		expect(getCommentReaction(editor, reactionId)).toEqual(inconsistentReaction)
	})

	it('keeps every content mutation out of canvas Undo', () => {
		const { thread, comment } = createThread(editor)
		const reply = replyToThread(editor, {
			threadId: thread.id,
			authorId: 'user:reply',
			body: toRichText('Reply'),
		})
		editComment(editor, { commentId: comment.id, body: toRichText('Edited'), now: 150 })
		setThreadResolved(editor, { threadId: thread.id, resolved: true, by: 'user:r', now: 151 })
		const reaction = toggleCommentReaction(editor, {
			commentId: comment.id,
			userId: 'user:reactor',
			emoji: '🔥',
		})
		softDeleteComment(editor, reply.id)

		editor.undo()
		expect(getComment(editor, comment.id)?.body).toEqual(toRichText('Edited'))
		expect(getCommentThread(editor, thread.id)?.resolved).toEqual({ at: 151, by: 'user:r' })
		expect(getCommentReaction(editor, reaction!.id)).toEqual(reaction)
		expect(getComment(editor, reply.id)?.isDeleted).toBe(true)
	})

	it('records only the spatial anchor update and undoes it in exactly one step', () => {
		const { thread, comment } = createThread(editor)
		editComment(editor, { commentId: comment.id, body: toRichText('Edited'), now: 160 })
		const nextAnchor = { type: 'point' as const, x: 300, y: 400 }

		updateCommentThreadAnchor(editor, { threadId: thread.id, anchor: nextAnchor })
		expect(getCommentThread(editor, thread.id)?.anchor).toEqual(nextAnchor)

		editor.undo()
		expect(getCommentThread(editor, thread.id)?.anchor).toEqual(thread.anchor)
		expect(getComment(editor, comment.id)?.body).toEqual(toRichText('Edited'))

		editor.redo()
		expect(getCommentThread(editor, thread.id)?.anchor).toEqual(nextAnchor)
	})

	it('preserves ignored thread content when anchor history is undone and redone', async () => {
		const { thread } = createThread(editor)
		const nextAnchor = { type: 'point' as const, x: 300, y: 400 }
		updateCommentThreadAnchor(editor, { threadId: thread.id, anchor: nextAnchor })
		setThreadResolved(editor, {
			threadId: thread.id,
			resolved: true,
			by: 'user:resolver',
			now: 170,
		})

		editor.undo()
		await vi.waitFor(() => {
			expect(getCommentThread(editor, thread.id)).toMatchObject({
				anchor: thread.anchor,
				resolved: { at: 170, by: 'user:resolver' },
			})
		})

		setThreadResolved(editor, {
			threadId: thread.id,
			resolved: false,
			by: 'user:resolver',
			now: 171,
		})
		editor.redo()
		await vi.waitFor(() => {
			expect(getCommentThread(editor, thread.id)).toMatchObject({
				anchor: nextAnchor,
				resolved: null,
			})
		})
	})

	it('does not resurrect a soft-deleted thread when anchor history is undone', async () => {
		const { thread } = createThread(editor)
		updateCommentThreadAnchor(editor, {
			threadId: thread.id,
			anchor: { type: 'point', x: 300, y: 400 },
		})
		softDeleteThread(editor, thread.id)

		editor.undo()
		await vi.waitFor(() => {
			expect(getCommentThread(editor, thread.id)).toMatchObject({
				anchor: thread.anchor,
				isDeleted: true,
			})
		})
	})

	it('keeps redo intact when an invalid anchor update is rejected', async () => {
		const { thread } = createThread(editor)
		const validAnchor = { type: 'point' as const, x: 300, y: 400 }
		updateCommentThreadAnchor(editor, { threadId: thread.id, anchor: validAnchor })
		editor.undo()
		expect(editor.canRedo()).toBe(true)

		expect(() =>
			updateCommentThreadAnchor(editor, {
				threadId: thread.id,
				anchor: { type: 'region', x: 0, y: 0, w: -1, h: 10 },
			})
		).toThrow()
		expect(getCommentThread(editor, thread.id)?.anchor).toEqual(thread.anchor)
		expect(editor.canRedo()).toBe(true)

		editor.redo()
		await vi.waitFor(() => {
			expect(getCommentThread(editor, thread.id)?.anchor).toEqual(validAnchor)
		})
	})

	it('keeps redo intact when a side effect rejects the anchor update', () => {
		const { thread } = createThread(editor)
		const validAnchor = { type: 'point' as const, x: 300, y: 400 }
		updateCommentThreadAnchor(editor, { threadId: thread.id, anchor: validAnchor })
		editor.undo()
		const dispose = editor.sideEffects.registerBeforeChangeHandler(
			'comment-thread',
			(previous) => previous
		)

		try {
			expect(() =>
				updateCommentThreadAnchor(editor, {
					threadId: thread.id,
					anchor: { type: 'point', x: 500, y: 600 },
				})
			).toThrow('anchor update was rejected')
		} finally {
			dispose()
		}
		expect(getCommentThread(editor, thread.id)?.anchor).toEqual(thread.anchor)
		expect(editor.canRedo()).toBe(true)
	})

	it('preserves complete remote thread updates', () => {
		const { thread } = createThread(editor)
		const remote = {
			...thread,
			anchor: { type: 'point' as const, x: 700, y: 800 },
			resolved: { at: 180, by: 'user:remote' },
			isDeleted: true,
		}

		editor.store.mergeRemoteChanges(() => {
			editor.store.put([remote])
		})

		expect(getCommentThread(editor, thread.id)).toEqual(remote)
	})

	it('orders thread, flat comment, and reaction lists by createdAt then id', () => {
		const pageId = editor.getCurrentPageId()
		const lateThread = {
			...createCommentThread({ pageId, anchor: { type: 'page' }, createdBy: 'user:a', now: 20 }),
			id: createCommentThreadId('z'),
		}
		const earlyThreadZ = {
			...createCommentThread({ pageId, anchor: { type: 'page' }, createdBy: 'user:a', now: 10 }),
			id: createCommentThreadId('z-early'),
		}
		const earlyThreadA = {
			...createCommentThread({ pageId, anchor: { type: 'page' }, createdBy: 'user:a', now: 10 }),
			id: createCommentThreadId('a-early'),
		}
		const comments = [
			{ ...createComment({ threadId: lateThread.id, pageId, authorId: 'u', body: toRichText('3'), now: 30 }), id: createCommentId('c') },
			{ ...createComment({ threadId: lateThread.id, pageId, authorId: 'u', body: toRichText('2'), now: 20 }), id: createCommentId('b') },
			{ ...createComment({ threadId: lateThread.id, pageId, authorId: 'u', body: toRichText('1'), now: 20 }), id: createCommentId('a') },
		]
		const reactions = [
			createCommentReaction({ commentId: comments[0].id, threadId: lateThread.id, pageId, userId: 'z', emoji: '👍', now: 40 }),
			createCommentReaction({ commentId: comments[0].id, threadId: lateThread.id, pageId, userId: 'b', emoji: '👍', now: 35 }),
			createCommentReaction({ commentId: comments[0].id, threadId: lateThread.id, pageId, userId: 'a', emoji: '👍', now: 35 }),
		]
		editor.run(
			() => editor.store.put([lateThread, earlyThreadZ, earlyThreadA, ...comments, ...reactions]),
			{ history: 'ignore' }
		)

		expect(listCommentThreads(editor, pageId).map((record) => record.id)).toEqual([
			earlyThreadA.id,
			earlyThreadZ.id,
			lateThread.id,
		])
		expect(listComments(editor, lateThread.id).map((record) => record.id)).toEqual([
			comments[2].id,
			comments[1].id,
			comments[0].id,
		])
		const expectedReactionIds = [...reactions]
			.sort((left, right) => {
				const createdAtDifference = left.createdAt - right.createdAt
				if (createdAtDifference !== 0) return createdAtDifference
				return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
			})
			.map((record) => record.id)
		expect(listCommentReactions(editor, comments[0].id).map((record) => record.id)).toEqual(
			expectedReactionIds
		)
	})

	it('rejects mutations after the referenced thread is deleted', () => {
		const { thread, comment } = createThread(editor)
		softDeleteThread(editor, thread.id)

		expect(() => editComment(editor, { commentId: comment.id, body: toRichText('No') })).toThrow(
			`Comment thread ${thread.id} is deleted`
		)
		expect(() => toggleCommentReaction(editor, { commentId: comment.id, userId: 'u', emoji: '👍' })).toThrow(
			`Comment thread ${thread.id} is deleted`
		)
	})
})
