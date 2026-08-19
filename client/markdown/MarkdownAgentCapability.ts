import type { JsonObject, TLShapeId } from 'tldraw'
import type { CanvasKitAgentCapability } from '../canvas-studio/types'
import { isMarkdownDocumentShape } from './MarkdownDocumentShape'
import {
	MARKDOWN_DOCUMENT_REF_PATTERN,
	MARKDOWN_DOCUMENT_REVISION_PATTERN,
	MAX_MARKDOWN_DOCUMENT_BYTES,
	markdownDocumentRevision,
	sliceUtf8Chunk,
} from './markdownDocumentContract'

export const MARKDOWN_READ_CAPABILITY_ID = 'canvas.markdown.read'
export const MARKDOWN_READ_ACTION_TYPE = 'readMarkdownChunk'
export const MAX_MARKDOWN_CHUNK_BYTES = 8 * 1024
const DEFAULT_MARKDOWN_CHUNK_BYTES = 4 * 1024
const MIN_MARKDOWN_CHUNK_BYTES = 256
const MAX_MARKDOWN_READ_RESULT_BYTES = 20 * 1024
const CURSOR_TTL_MS = 5 * 60_000
const MAX_CURSORS = 64

interface MarkdownReadCursor {
	shapeId: TLShapeId
	documentRef: string
	revision: string
	contextRef: string
	offset: number
	expiresAt: number
}

const cursors = new Map<string, MarkdownReadCursor>()

export const MARKDOWN_READ_AGENT_CAPABILITY: CanvasKitAgentCapability = {
	descriptor: {
		id: MARKDOWN_READ_CAPABILITY_ID,
		version: 1,
		kitId: 'canvas.markdown',
		mode: 'read',
		summary:
			'Read one explicitly selected native Markdown document in revision-bound chunks without exposing its Vault path.',
		contexts: ['selection'],
		actionPlan: {
			coordinateSystem: 'absolute-page',
			maxActions: 1,
			actionTypes: [MARKDOWN_READ_ACTION_TYPE],
			schema: {
				type: 'array',
				minItems: 1,
				maxItems: 1,
				items: {
					type: 'object',
					additionalProperties: false,
					required: ['_type', 'shapeId', 'documentRef', 'revision'],
					properties: {
						_type: { const: MARKDOWN_READ_ACTION_TYPE },
						shapeId: {
							type: 'string',
							description: 'Selected simple shape id from canvas.inspect, without shape: prefix.',
						},
						documentRef: {
							type: 'string',
							description: 'Opaque documentRef from canvas.inspect.',
						},
						revision: {
							type: 'string',
							description: 'Exact sha256 revision from canvas.inspect.',
						},
						cursor: {
							type: 'string',
							description: 'Opaque nextCursor from the preceding successful chunk.',
						},
						maxBytes: {
							type: 'integer',
							minimum: MIN_MARKDOWN_CHUNK_BYTES,
							maximum: MAX_MARKDOWN_CHUNK_BYTES,
						},
					},
				},
			},
		},
		effects: {
			recordTypes: [],
			atomic: true,
			undoable: false,
		},
	},
	execute(editor, actions, context) {
		if (actions.length !== 1) {
			throw new Error('Markdown chunk read requires exactly one action')
		}
		const action = readMarkdownChunkAction(actions[0])
		const shapeId = normalizeShapeId(action.shapeId)
		if (!context.shapeIds.includes(shapeId)) {
			throw new Error('Markdown chunk read target is not in the explicit selection')
		}
		const shape = editor.getShape(shapeId)
		if (!isMarkdownDocumentShape(shape)) {
			throw new Error('Markdown chunk read requires a selected Markdown document')
		}
		if (
			shape.props.documentRef !== action.documentRef ||
			shape.props.revision !== action.revision
		) {
			throw new Error('Markdown document revision drifted; inspect the selection again')
		}
		if (
			shape.props.bytes > MAX_MARKDOWN_DOCUMENT_BYTES ||
			new TextEncoder().encode(shape.props.markdown).byteLength !== shape.props.bytes ||
			markdownDocumentRevision(shape.props.markdown) !== shape.props.revision
		) {
			throw new Error('Markdown document content does not match its revision metadata')
		}

		const now = Date.now()
		pruneCursors(now)
		const offset = action.cursor
			? requireCursor(action.cursor, {
					shapeId,
					documentRef: action.documentRef,
					revision: action.revision,
					contextRef: context.contextRef,
					now,
				}).offset
			: 0
		let maxBytes = action.maxBytes ?? DEFAULT_MARKDOWN_CHUNK_BYTES
		let chunk = sliceUtf8Chunk(shape.props.markdown, offset, maxBytes)
		while (
			new TextEncoder().encode(JSON.stringify({ text: chunk.text })).byteLength >
				MAX_MARKDOWN_READ_RESULT_BYTES &&
			maxBytes > MIN_MARKDOWN_CHUNK_BYTES
		) {
			maxBytes = Math.max(MIN_MARKDOWN_CHUNK_BYTES, Math.floor(maxBytes / 2))
			chunk = sliceUtf8Chunk(shape.props.markdown, offset, maxBytes)
		}

		if (action.cursor) cursors.delete(action.cursor)
		const nextCursor = chunk.eof
			? undefined
			: createCursor({
					shapeId,
					documentRef: shape.props.documentRef,
					revision: shape.props.revision,
					contextRef: context.contextRef,
					offset: chunk.end,
					expiresAt: now + CURSOR_TTL_MS,
				})
		const result: JsonObject = {
			shapeId: action.shapeId,
			documentRef: shape.props.documentRef,
			revision: shape.props.revision,
			title: shape.props.title,
			...(shape.props.sourceName ? { sourceName: shape.props.sourceName } : {}),
			links: shape.props.links.slice(0, 24).map((link) => link.slice(0, 120)),
			text: chunk.text,
			byteRange: { start: chunk.start, end: chunk.end },
			totalBytes: chunk.totalBytes,
			...(nextCursor ? { nextCursor } : {}),
			truncated: !chunk.eof,
			eof: chunk.eof,
		}
		return {
			shapeIds: [],
			bindingIds: [],
			summary: `Read Markdown bytes ${chunk.start}–${chunk.end} of ${chunk.totalBytes}.`,
			result,
		}
	},
}

function readMarkdownChunkAction(value: unknown) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error('Markdown chunk action must be an object')
	}
	const action = value as Record<string, unknown>
	const allowed = new Set([
		'_type',
		'shapeId',
		'documentRef',
		'revision',
		'cursor',
		'maxBytes',
	])
	if (
		Object.keys(action).some((key) => !allowed.has(key)) ||
		action._type !== MARKDOWN_READ_ACTION_TYPE ||
		typeof action.shapeId !== 'string' ||
		!/^[a-zA-Z0-9._:-]{1,128}$/.test(action.shapeId) ||
		typeof action.documentRef !== 'string' ||
		!MARKDOWN_DOCUMENT_REF_PATTERN.test(action.documentRef) ||
		typeof action.revision !== 'string' ||
		!MARKDOWN_DOCUMENT_REVISION_PATTERN.test(action.revision) ||
		(action.cursor !== undefined &&
			(typeof action.cursor !== 'string' || !/^mdc-[a-zA-Z0-9-]{8,96}$/.test(action.cursor))) ||
		(action.maxBytes !== undefined &&
			(!Number.isInteger(action.maxBytes) ||
				(action.maxBytes as number) < MIN_MARKDOWN_CHUNK_BYTES ||
				(action.maxBytes as number) > MAX_MARKDOWN_CHUNK_BYTES))
	) {
		throw new Error('Markdown chunk action is invalid')
	}
	return action as {
		_type: typeof MARKDOWN_READ_ACTION_TYPE
		shapeId: string
		documentRef: string
		revision: string
		cursor?: string
		maxBytes?: number
	}
}

function normalizeShapeId(value: string) {
	return (value.startsWith('shape:') ? value : `shape:${value}`) as TLShapeId
}

function createCursor(entry: MarkdownReadCursor) {
	while (cursors.size >= MAX_CURSORS) {
		const oldest = cursors.keys().next().value
		if (typeof oldest !== 'string') break
		cursors.delete(oldest)
	}
	const suffix =
		typeof globalThis.crypto?.randomUUID === 'function'
			? globalThis.crypto.randomUUID()
			: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
	const cursor = `mdc-${suffix}`
	cursors.set(cursor, entry)
	return cursor
}

function requireCursor(
	cursor: string,
	expected: Omit<MarkdownReadCursor, 'offset' | 'expiresAt'> & { now: number }
) {
	const entry = cursors.get(cursor)
	if (
		!entry ||
		entry.expiresAt <= expected.now ||
		entry.shapeId !== expected.shapeId ||
		entry.documentRef !== expected.documentRef ||
		entry.revision !== expected.revision ||
		entry.contextRef !== expected.contextRef
	) {
		cursors.delete(cursor)
		throw new Error('Markdown chunk cursor is stale or belongs to another selection')
	}
	return entry
}

function pruneCursors(now: number) {
	for (const [cursor, entry] of cursors) {
		if (entry.expiresAt <= now) cursors.delete(cursor)
	}
}
