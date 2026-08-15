import { Migration, MigrationSequence, UnknownRecord } from '@tldraw/store'
import { TLPageId, createShapeId, toRichText } from '@tldraw/tlschema'
import { createTLStore } from 'tldraw'
import { describe, expect, it } from 'vitest'
import {
	CANVAS_COMMENT_RECORDS,
	TLComment,
	TLCommentReaction,
	TLCommentThread,
	createComment,
	createCommentId,
	createCommentReaction,
	createCommentReactionId,
	createCommentThread,
	createCommentThreadId,
} from './records'

const pageId = 'page:page' as TLPageId

function createRecords() {
	const thread = createCommentThread({
		pageId,
		anchor: {
			type: 'shape',
			shapeId: createShapeId('target'),
			x: 0.25,
			y: 0.75,
			isPrecise: true,
		},
		createdBy: 'user:author',
		now: 100,
		meta: { source: 'test' },
	})
	const comment = createComment({
		threadId: thread.id,
		pageId,
		authorId: 'user:author',
		body: toRichText('Hello'),
		now: 101,
		meta: { source: 'test' },
	})
	const reaction = createCommentReaction({
		commentId: comment.id,
		threadId: thread.id,
		pageId,
		userId: 'user:reactor',
		emoji: '👍',
		now: 102,
		meta: { source: 'test' },
	})

	return { thread, comment, reaction }
}

function getThreadMigration(id: string): Extract<Migration, { scope: 'record' }> {
	const sequence = CANVAS_COMMENT_RECORDS['comment-thread'].migrations as MigrationSequence
	const migration = sequence.sequence.find((candidate) => candidate.id === id)
	if (!migration || migration.scope !== 'record') {
		throw new Error(`Missing record migration ${id}`)
	}
	return migration
}

function applyRecordMigration(
	migration: Extract<Migration, { scope: 'record' }>,
	direction: 'up' | 'down',
	record: UnknownRecord
) {
	const input = structuredClone(record)
	const migrate = migration[direction]
	if (!migrate) throw new Error(`Migration ${migration.id} has no ${direction} function`)
	return migrate(input) ?? input
}

describe('canvas comment records', () => {
	it('puts and gets typed records created by the constructors', () => {
		const store = createTLStore({ records: CANVAS_COMMENT_RECORDS })
		const { thread, comment, reaction } = createRecords()

		store.put([thread, comment, reaction])

		const storedThread: TLCommentThread | undefined = store.get(thread.id)
		const storedComment: TLComment | undefined = store.get(comment.id)
		const storedReaction: TLCommentReaction | undefined = store.get(reaction.id)
		expect(storedThread).toEqual(thread)
		expect(storedComment).toEqual(comment)
		expect(storedReaction).toEqual(reaction)
	})

	it('rejects malformed normalized anchors', () => {
		const store = createTLStore({ records: CANVAS_COMMENT_RECORDS })
		const { thread } = createRecords()

		expect(() =>
			store.put([
				{
					...thread,
					id: createCommentThreadId('bad-shape-anchor'),
					anchor: { ...thread.anchor, x: 1.01 },
				} as TLCommentThread,
			])
		).toThrow()

		expect(() =>
			store.put([
				{
					...thread,
					id: createCommentThreadId('bad-region-pin'),
					anchor: { type: 'region', x: 0, y: 0, w: 10, h: 10, pinX: -0.01 },
				} as TLCommentThread,
			])
		).toThrow()

		expect(() =>
			store.put([
				{
					...thread,
					id: createCommentThreadId('bad-region-size'),
					anchor: { type: 'region', x: 0, y: 0, w: -1, h: 10 },
				} as TLCommentThread,
			])
		).toThrow()
	})

	it('rejects emoji longer than 64 characters', () => {
		const store = createTLStore({ records: CANVAS_COMMENT_RECORDS })
		const { reaction } = createRecords()

		expect(() =>
			store.put([
				{
					...reaction,
					id: createCommentReactionId(reaction.commentId, reaction.userId, 'x'.repeat(65)),
					emoji: 'x'.repeat(65),
				},
			])
		).toThrow()
	})

	it('creates deterministic collision-safe reaction ids', () => {
		const first = createCommentReactionId(createCommentId('a:b'), 'c', 'd:e')
		const repeated = createCommentReactionId(createCommentId('a:b'), 'c', 'd:e')
		const shiftedCommentBoundary = createCommentReactionId(createCommentId('a'), 'b:c', 'd:e')
		const shiftedEmojiBoundary = createCommentReactionId(createCommentId('a:b'), 'c:d', 'e')

		expect(repeated).toBe(first)
		expect(shiftedCommentBoundary).not.toBe(first)
		expect(shiftedEmojiBoundary).not.toBe(first)
	})

	it('round-trips all three record types through a store snapshot', () => {
		const store = createTLStore({ records: CANVAS_COMMENT_RECORDS })
		const records = createRecords()
		store.put([records.thread, records.comment, records.reaction])

		const snapshot = store.getStoreSnapshot()
		const reopened = createTLStore({ records: CANVAS_COMMENT_RECORDS })
		reopened.loadStoreSnapshot(snapshot)

		expect(reopened.get(records.thread.id)).toEqual(records.thread)
		expect(reopened.get(records.comment.id)).toEqual(records.comment)
		expect(reopened.get(records.reaction.id)).toEqual(records.reaction)
	})

	it('upgrades old shape anchors and strips region pins on down-migration', () => {
		const v2 = getThreadMigration('com.tldraw.comment-thread/2')
		const v3 = getThreadMigration('com.tldraw.comment-thread/3')
		const baseRecord = {
			id: createCommentThreadId('migration'),
			typeName: 'comment-thread',
			pageId,
			createdBy: 'user:author',
			createdAt: 100,
			resolved: null,
			isDeleted: false,
			meta: {},
		}

		const upgraded = applyRecordMigration(v2, 'up', {
			...baseRecord,
			anchor: { type: 'shape', shapeId: createShapeId('legacy') },
		} as UnknownRecord)
		expect((upgraded as TLCommentThread).anchor).toEqual({
			type: 'shape',
			shapeId: createShapeId('legacy'),
			x: 1,
			y: 0,
			isPrecise: false,
		})

		const downgraded = applyRecordMigration(v3, 'down', {
			...baseRecord,
			anchor: { type: 'region', x: 10, y: 20, w: 30, h: 40, pinX: 0.25, pinY: 0.75 },
		} as UnknownRecord)
		expect((downgraded as TLCommentThread).anchor).toEqual({
			type: 'region',
			x: 10,
			y: 20,
			w: 30,
			h: 40,
		})
	})
})
