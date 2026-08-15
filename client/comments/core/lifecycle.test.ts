import {
	Editor,
	TLPageId,
	createShapeId,
	createTLStore,
	defaultBindingUtils,
	defaultShapeTools,
	defaultShapeUtils,
	defaultTools,
	toRichText,
} from 'tldraw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveCommentAnchorPagePoint } from './anchors'
import { mountCommentLifecycle } from './lifecycle'
import {
	CANVAS_COMMENT_RECORDS,
	createComment,
	createCommentReaction,
	createCommentThread,
} from './records'

function installMinimalEditorDom() {
	class FakeElement {
		constructor(public ownerDocument: typeof document) {}

		tabIndex = 0
		classList = { add() {}, remove() {} }
		style = { setProperty() {}, removeProperty() {}, getPropertyValue: () => '' }
		addEventListener() {}
		removeEventListener() {}
		setAttribute() {}
		removeAttribute() {}
		appendChild() { return this }
		removeChild() { return this }
		remove() {}
		focus() {}
		blur() {}
		contains() { return true }
		getBoundingClientRect() {
			return {
				x: 0, y: 0, top: 0, left: 0, width: 1080, height: 720,
				bottom: 720, right: 1080, toJSON: () => ({}),
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

function createThreadRecords(editor: Editor, pageId: TLPageId, anchor: Parameters<typeof createCommentThread>[0]['anchor']) {
	const thread = createCommentThread({ pageId, anchor, createdBy: 'user:one', now: 1 })
	const comment = createComment({
		threadId: thread.id,
		pageId,
		authorId: 'user:one',
		body: toRichText('Hello'),
		now: 2,
	})
	const reaction = createCommentReaction({
		commentId: comment.id,
		threadId: thread.id,
		pageId,
		userId: 'user:two',
		emoji: '👍',
		now: 3,
	})
	editor.store.put([thread, comment, reaction])
	return { thread, comment, reaction }
}

describe('comment anchor lifecycle', () => {
	let editor: TestEditor
	let dispose: () => void

	beforeEach(() => {
		installMinimalEditorDom()
		editor = new TestEditor()
		dispose = mountCommentLifecycle(editor)
	})

	afterEach(() => {
		dispose()
		editor.dispose()
		vi.unstubAllGlobals()
	})

	it('preserves a shape thread at its last page point on delete and restores it with Undo', () => {
		const shapeId = createShapeId('comment-target')
		editor.createShape({
			id: shapeId,
			type: 'geo',
			x: 100,
			y: 80,
			props: { geo: 'rectangle', w: 120, h: 60 },
		})
		const records = createThreadRecords(editor, editor.getCurrentPageId(), {
			type: 'shape', shapeId, x: 0.25, y: 0.75, isPrecise: true,
		})
		const expectedPoint = resolveCommentAnchorPagePoint(editor, records.thread.anchor)
		editor.clearHistory()

		editor.deleteShape(shapeId)

		expect(editor.getShape(shapeId)).toBeUndefined()
		expect(editor.store.get(records.thread.id)).toMatchObject({
			anchor: { type: 'point', ...expectedPoint },
		})

		editor.undo()
		expect(editor.getShape(shapeId)).toBeDefined()
		expect(editor.store.get(records.thread.id)).toMatchObject({
			anchor: records.thread.anchor,
		})
	})

	it('moves a descendant thread and its flat records across pages in one undoable operation', () => {
		const sourcePageId = editor.getCurrentPageId()
		const targetPageId = 'page:comments-target' as TLPageId
		editor.createPage({ id: targetPageId, name: 'Target' })
		const frameId = createShapeId('comment-frame')
		const childId = createShapeId('comment-child')
		editor.createShape({
			id: frameId,
			type: 'frame',
			x: 20,
			y: 20,
			props: { w: 300, h: 180, name: 'Frame' },
		})
		editor.createShape({
			id: childId,
			type: 'geo',
			parentId: frameId,
			x: 30,
			y: 30,
			props: { geo: 'rectangle', w: 80, h: 40 },
		})
		const records = createThreadRecords(editor, sourcePageId, {
			type: 'shape', shapeId: childId, x: 0.5, y: 0.5, isPrecise: true,
		})
		editor.clearHistory()

		editor.moveShapesToPage([frameId], targetPageId)

		for (const id of [records.thread.id, records.comment.id, records.reaction.id]) {
			expect(editor.store.get(id)).toMatchObject({ pageId: targetPageId })
		}
		expect(editor.getAncestorPageId(childId)).toBe(targetPageId)

		editor.undo()
		for (const id of [records.thread.id, records.comment.id, records.reaction.id]) {
			expect(editor.store.get(id)).toMatchObject({ pageId: sourcePageId })
		}
		expect(editor.getAncestorPageId(childId)).toBe(sourcePageId)
	})

	it('removes page-owned comment records with a deleted page and restores them with Undo', () => {
		const pageId = 'page:comments-delete' as TLPageId
		editor.createPage({ id: pageId, name: 'Comments' })
		const records = createThreadRecords(editor, pageId, { type: 'page' })
		editor.clearHistory()

		editor.deletePage(pageId)
		expect(editor.store.get(records.thread.id)).toBeUndefined()
		expect(editor.store.get(records.comment.id)).toBeUndefined()
		expect(editor.store.get(records.reaction.id)).toBeUndefined()

		editor.undo()
		expect(editor.getPage(pageId)).toBeDefined()
		expect(editor.store.get(records.thread.id)).toEqual(records.thread)
		expect(editor.store.get(records.comment.id)).toEqual(records.comment)
		expect(editor.store.get(records.reaction.id)).toEqual(records.reaction)
	})
})
