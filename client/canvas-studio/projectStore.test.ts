import {
	createShapeId,
	createTLStore,
	toRichText,
	type TLPageId,
	type TLStoreSnapshot,
} from 'tldraw'
import { describe, expect, it, vi } from 'vitest'
import {
	CANVAS_COMMENT_RECORDS,
	createComment,
	createCommentReaction,
	createCommentThread,
} from '../comments/core/records'
import { openCanvasStudioProjectStore } from './projectStore'

const origin = 'https://canvas.example'
const endpoint = `${origin}/__canvas/project`
const pageId = 'page:project' as TLPageId
const inventorySha256 = 'a'.repeat(64)

function emptyProjectSnapshot() {
	return createTLStore({ records: CANVAS_COMMENT_RECORDS }).getStoreSnapshot()
}

function commentRecords() {
	const thread = createCommentThread({
		pageId,
		anchor: {
			type: 'shape',
			shapeId: createShapeId('persisted-anchor'),
			x: 0.25,
			y: 0.75,
			isPrecise: true,
		},
		createdBy: 'user:author',
		now: 100,
	})
	const comment = createComment({
		threadId: thread.id,
		pageId,
		authorId: 'user:author',
		body: toRichText('Persist this thread'),
		now: 101,
	})
	const reaction = createCommentReaction({
		commentId: comment.id,
		threadId: thread.id,
		pageId,
		userId: 'user:reviewer',
		emoji: '✅',
		now: 102,
	})
	return { thread, comment, reaction }
}

function createProjectApi(initialSnapshot: TLStoreSnapshot | null) {
	let snapshot = initialSnapshot
	let revision = 1
	const requests: Array<{ url: string; init?: RequestInit }> = []
	const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
		const url = String(input)
		requests.push({ url, init })
		if ((init?.method ?? 'GET') === 'GET') {
			return Response.json(
				{
					schema: 'canvas.portal-project/v1',
					revision: `revision-${revision}`,
					inventorySha256,
					snapshot,
				},
				{ headers: { etag: `"revision-${revision}"` } }
			)
		}
		if (init?.method !== 'PUT') return new Response(null, { status: 405 })
		const headers = new Headers(init.headers)
		if (headers.get('if-match') !== `"revision-${revision}"`) {
			return new Response(null, { status: 412 })
		}
		const body = JSON.parse(String(init.body)) as {
			schema: string
			snapshot: TLStoreSnapshot
		}
		if (body.schema !== 'canvas.portal-project-update/v1') {
			return Response.json({ error: 'invalid_project_update' }, { status: 400 })
		}
		snapshot = body.snapshot
		revision += 1
		return Response.json({
			schema: 'canvas.portal-project/v1',
			revision: `revision-${revision}`,
			saved: true,
		}, {
			headers: { etag: `"revision-${revision}"` },
		})
	}) as typeof globalThis.fetch
	return { fetch, requests, getSnapshot: () => snapshot }
}

describe('locked Canvas Studio project store', () => {
	it('materializes an initial null portal document through the registered custom-record store', async () => {
		const api = createProjectApi(null)
		const first = await openCanvasStudioProjectStore({
			fetch: api.fetch,
			origin,
			inventorySha256,
			debounceMs: 60_000,
			records: CANVAS_COMMENT_RECORDS,
		})
		const { thread } = commentRecords()
		first.store.put([thread])
		await first.flush()
		await first.dispose()
		expect(api.getSnapshot()).not.toBeNull()

		const reopened = await openCanvasStudioProjectStore({
			fetch: api.fetch,
			origin,
			inventorySha256,
			records: CANVAS_COMMENT_RECORDS,
		})
		expect(reopened.store.get(thread.id)).toEqual(thread)
		await reopened.dispose()
	})

	it('registers comment records before load and persists them across save/reopen', async () => {
		const api = createProjectApi(emptyProjectSnapshot())
		const first = await openCanvasStudioProjectStore({
			fetch: api.fetch,
			origin,
			inventorySha256,
			debounceMs: 60_000,
			records: CANVAS_COMMENT_RECORDS,
		})
		const records = commentRecords()
		first.store.put([records.thread, records.comment, records.reaction])

		await first.flush()

		const put = api.requests.find((request) => request.init?.method === 'PUT')
		expect(put?.url).toBe(endpoint)
		expect(new Headers(put?.init?.headers).get('if-match')).toBe('"revision-1"')
		expect(first.revision).toBe('"revision-2"')
		await first.dispose()

		const reopened = await openCanvasStudioProjectStore({
			fetch: api.fetch,
			origin,
			inventorySha256,
			debounceMs: 60_000,
			records: CANVAS_COMMENT_RECORDS,
		})
		expect(reopened.store.get(records.thread.id)).toEqual(records.thread)
		expect(reopened.store.get(records.comment.id)).toEqual(records.comment)
		expect(reopened.store.get(records.reaction.id)).toEqual(records.reaction)
		expect(
			(reopened.store.get(records.thread.id) as typeof records.thread).anchor
		).toEqual(records.thread.anchor)
		await reopened.dispose()
	})

	it('fails closed on a stale optimistic revision', async () => {
		const onError = vi.fn()
		const fetch = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
			if ((init?.method ?? 'GET') === 'GET') {
				return Response.json(
					{
						schema: 'canvas.portal-project/v1',
						revision: 'revision-1',
						inventorySha256,
						snapshot: emptyProjectSnapshot(),
					},
					{ headers: { etag: '"revision-1"' } }
				)
			}
			return new Response(null, { status: 412 })
		}) as typeof globalThis.fetch
		const controller = await openCanvasStudioProjectStore({
			fetch,
			origin,
			inventorySha256,
			debounceMs: 60_000,
			onError,
			records: CANVAS_COMMENT_RECORDS,
		})
		const { thread } = commentRecords()
		controller.store.put([thread])

		await expect(controller.flush()).rejects.toThrow(
			'Canvas project revision "revision-1" is stale'
		)
		expect(controller.error?.message).toContain('is stale')
		expect(onError).toHaveBeenCalledOnce()
		await expect(controller.flush()).rejects.toBe(controller.error)
	})

	it.each([
		{
			label: 'missing API',
			response: new Response(null, { status: 404 }),
			error: /GET failed with HTTP 404/,
		},
		{
			label: 'missing ETag',
			response: Response.json({
				schema: 'canvas.portal-project/v1',
				revision: 'revision-1',
				inventorySha256,
				snapshot: emptyProjectSnapshot(),
			}),
			error: /requires a strong ETag/,
		},
		{
			label: 'weak ETag',
			response: Response.json(
				{
					schema: 'canvas.portal-project/v1',
					revision: 'revision-1',
					inventorySha256,
					snapshot: emptyProjectSnapshot(),
				},
				{ headers: { etag: 'W/"revision-1"' } }
			),
			error: /requires a strong ETag/,
		},
	])('does not fall back when the project API has a $label', async ({ response, error }) => {
		const fetch = vi.fn(async () => response.clone()) as typeof globalThis.fetch
		await expect(
			openCanvasStudioProjectStore({
				fetch,
				origin,
				inventorySha256,
				records: CANVAS_COMMENT_RECORDS,
			})
		).rejects.toThrow(error)
	})

	it('rejects cross-origin project endpoints before fetching', async () => {
		const fetch = vi.fn() as unknown as typeof globalThis.fetch
		await expect(
			openCanvasStudioProjectStore({
				fetch,
				origin,
				inventorySha256,
				endpoint: 'https://other.example/__canvas/project',
				records: CANVAS_COMMENT_RECORDS,
			})
		).rejects.toThrow('must be same-origin')
		expect(fetch).not.toHaveBeenCalled()
	})
})
