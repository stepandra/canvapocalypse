import {
	type BaseRecord,
	type CustomRecordInfo,
	type JsonObject,
	type Migration,
	type MigrationSequence,
	type RecordId,
	T,
	type TLPageId,
	type TLRichText,
	type TLShapeId,
	type UnknownRecord,
	createCustomRecordId,
	createMigrationSequence,
	idValidator,
	isCustomRecordId,
	richTextValidator,
} from 'tldraw'

export type TLCommentAnchor =
	| { type: 'shape'; shapeId: TLShapeId; x: number; y: number; isPrecise: boolean }
	| { type: 'point'; x: number; y: number }
	| {
			type: 'region'
			x: number
			y: number
			w: number
			h: number
			pinX?: number
			pinY?: number
	  }
	| { type: 'page' }

export interface TLCommentThread extends BaseRecord<'comment-thread', TLCommentThreadId> {
	pageId: TLPageId
	anchor: TLCommentAnchor
	createdBy: string
	createdAt: number
	resolved: { at: number; by: string } | null
	isDeleted: boolean
	meta: JsonObject
}

export type TLCommentThreadId = RecordId<TLCommentThread>

export interface TLComment extends BaseRecord<'comment', TLCommentId> {
	threadId: TLCommentThreadId
	pageId: TLPageId
	authorId: string
	createdAt: number
	editedAt: number | null
	body: TLRichText
	isDeleted: boolean
	meta: JsonObject
}

export type TLCommentId = RecordId<TLComment>

export interface TLCommentReaction extends BaseRecord<'comment-reaction', TLCommentReactionId> {
	commentId: TLCommentId
	threadId: TLCommentThreadId
	pageId: TLPageId
	userId: string
	emoji: string
	createdAt: number
	meta: JsonObject
}

export type TLCommentReactionId = RecordId<TLCommentReaction>

declare module '@tldraw/tlschema' {
	interface TLGlobalRecordPropsMap {
		'comment-thread': TLCommentThread
		comment: TLComment
		'comment-reaction': TLCommentReaction
	}
}

const normalizedNumberValidator = T.number.check((value) => {
	if (value < 0 || value > 1) {
		throw new T.ValidationError(`Expected a normalized number between 0 and 1, got ${value}`)
	}
})

const positiveNumberValidator = T.number.check((value) => {
	if (value <= 0) {
		throw new T.ValidationError(`Expected a positive number, got ${value}`)
	}
})

const emojiValidator = T.string.check((value) => {
	if (value.length === 0 || value.length > 64) {
		throw new T.ValidationError(`Expected an emoji of 1-64 characters, got ${value.length}`)
	}
})

const commentAnchorValidator: T.Validator<TLCommentAnchor> = T.union('type', {
	shape: T.object({
		type: T.literal('shape'),
		shapeId: idValidator<TLShapeId>('shape'),
		x: normalizedNumberValidator,
		y: normalizedNumberValidator,
		isPrecise: T.boolean,
	}),
	point: T.object({
		type: T.literal('point'),
		x: T.number,
		y: T.number,
	}),
	region: T.object({
		type: T.literal('region'),
		x: T.number,
		y: T.number,
		w: positiveNumberValidator,
		h: positiveNumberValidator,
		pinX: normalizedNumberValidator.optional(),
		pinY: normalizedNumberValidator.optional(),
	}),
	page: T.object({
		type: T.literal('page'),
	}),
})

type RecordMigration = Omit<Extract<Migration, { scope: 'record' }>, 'scope'>

function createCommentGuardMigrations(
	typeName: 'comment-thread' | 'comment' | 'comment-reaction',
	extra: RecordMigration[] = []
) {
	const sequence: RecordMigration[] = [
		{
			id: `com.tldraw.${typeName}/1`,
			up: (record: UnknownRecord) => record,
		},
		...extra,
	]
	return createMigrationSequence({
		sequenceId: `com.tldraw.${typeName}`,
		retroactive: true,
		sequence: sequence.map((migration) => ({
			...migration,
			scope: 'record' as const,
			filter: (record: UnknownRecord) =>
				record.typeName === typeName && (migration.filter?.(record) ?? true),
		})),
	})
}

const commentThreadRecord: CustomRecordInfo = {
	scope: 'document',
	migrations: createCommentGuardMigrations('comment-thread', [
		{
			id: 'com.tldraw.comment-thread/2',
			up: (record: UnknownRecord) => {
				const anchor = (record as TLCommentThread).anchor
				if (anchor?.type === 'shape' && anchor.x === undefined) {
					return {
						...record,
						anchor: { ...anchor, x: 1, y: 0, isPrecise: false },
					}
				}
				return record
			},
			down: (record: UnknownRecord) => {
				const anchor = (record as TLCommentThread).anchor
				if (anchor?.type === 'shape') {
					return {
						...record,
						anchor: { type: 'shape', shapeId: anchor.shapeId },
					}
				}
				return record
			},
		},
		{
			id: 'com.tldraw.comment-thread/3',
			up: (record: UnknownRecord) => record,
			down: (record: UnknownRecord) => {
				const anchor = (record as TLCommentThread).anchor
				if (anchor?.type === 'region') {
					const { pinX: _pinX, pinY: _pinY, ...anchorWithoutPin } = anchor
					return { ...record, anchor: anchorWithoutPin }
				}
				return record
			},
		},
	]),
	validator: T.object({
		id: idValidator<TLCommentThreadId>('comment-thread'),
		typeName: T.literal('comment-thread'),
		pageId: idValidator<TLPageId>('page'),
		anchor: commentAnchorValidator,
		createdBy: T.string,
		createdAt: T.number,
		resolved: T.object({ at: T.number, by: T.string }).nullable(),
		isDeleted: T.boolean,
		meta: T.jsonValue,
	}),
}

const commentRecord: CustomRecordInfo = {
	scope: 'document',
	migrations: createCommentGuardMigrations('comment'),
	validator: T.object({
		id: idValidator<TLCommentId>('comment'),
		typeName: T.literal('comment'),
		threadId: idValidator<TLCommentThreadId>('comment-thread'),
		pageId: idValidator<TLPageId>('page'),
		authorId: T.string,
		createdAt: T.number,
		editedAt: T.number.nullable(),
		body: richTextValidator,
		isDeleted: T.boolean,
		meta: T.jsonValue,
	}),
}

const commentReactionRecord: CustomRecordInfo = {
	scope: 'document',
	migrations: createCommentGuardMigrations('comment-reaction'),
	validator: T.object({
		id: idValidator<TLCommentReactionId>('comment-reaction'),
		typeName: T.literal('comment-reaction'),
		commentId: idValidator<TLCommentId>('comment'),
		threadId: idValidator<TLCommentThreadId>('comment-thread'),
		pageId: idValidator<TLPageId>('page'),
		userId: T.string,
		emoji: emojiValidator,
		createdAt: T.number,
		meta: T.jsonValue,
	}),
}

export const CANVAS_COMMENT_RECORDS = {
	'comment-thread': commentThreadRecord,
	comment: commentRecord,
	'comment-reaction': commentReactionRecord,
} satisfies Record<'comment-thread' | 'comment' | 'comment-reaction', CustomRecordInfo>

export function createCommentThreadId(id?: string): TLCommentThreadId {
	return createCustomRecordId('comment-thread', id) as TLCommentThreadId
}

export function createCommentId(id?: string): TLCommentId {
	return createCustomRecordId('comment', id) as TLCommentId
}

export function createCommentReactionId(
	commentId: TLCommentId,
	userId: string,
	emoji: string
): TLCommentReactionId {
	return createCustomRecordId(
		'comment-reaction',
		`${encodeURIComponent(commentId)}:${encodeURIComponent(userId)}:${encodeURIComponent(emoji)}`
	) as TLCommentReactionId
}

export function isCommentThreadId(id: string): id is TLCommentThreadId {
	return isCustomRecordId('comment-thread', id)
}

export function isCommentId(id: string): id is TLCommentId {
	return isCustomRecordId('comment', id)
}

export function isCommentReactionId(id: string): id is TLCommentReactionId {
	return isCustomRecordId('comment-reaction', id)
}

export function createCommentThread(props: {
	pageId: TLPageId
	anchor: TLCommentAnchor
	createdBy: string
	now?: number
	meta?: JsonObject
}): TLCommentThread {
	return {
		id: createCommentThreadId(),
		typeName: 'comment-thread',
		pageId: props.pageId,
		anchor: props.anchor,
		createdBy: props.createdBy,
		createdAt: props.now ?? Date.now(),
		resolved: null,
		isDeleted: false,
		meta: props.meta ?? {},
	}
}

export function createComment(props: {
	threadId: TLCommentThreadId
	pageId: TLPageId
	authorId: string
	body: TLRichText
	now?: number
	meta?: JsonObject
}): TLComment {
	return {
		id: createCommentId(),
		typeName: 'comment',
		threadId: props.threadId,
		pageId: props.pageId,
		authorId: props.authorId,
		createdAt: props.now ?? Date.now(),
		editedAt: null,
		body: props.body,
		isDeleted: false,
		meta: props.meta ?? {},
	}
}

export function createCommentReaction(props: {
	commentId: TLCommentId
	threadId: TLCommentThreadId
	pageId: TLPageId
	userId: string
	emoji: string
	now?: number
	meta?: JsonObject
}): TLCommentReaction {
	return {
		id: createCommentReactionId(props.commentId, props.userId, props.emoji),
		typeName: 'comment-reaction',
		commentId: props.commentId,
		threadId: props.threadId,
		pageId: props.pageId,
		userId: props.userId,
		emoji: props.emoji,
		createdAt: props.now ?? Date.now(),
		meta: props.meta ?? {},
	}
}
