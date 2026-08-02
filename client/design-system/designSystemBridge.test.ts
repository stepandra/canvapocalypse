import type { Editor, TLShape } from 'tldraw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installHtmlMockupResidentCapability } from '../html-mockup/htmlMockupBridge'
import {
	getDesignSystemSnapshot,
	MAX_DESIGN_SYSTEM_COMPONENT_ITEMS,
	MAX_DESIGN_SYSTEM_PROJECTION_CHARS,
	normalizeDesignSystemSnapshot,
} from './designSystemBridge'
import { getSelectedDesignSystemContext } from './designSystemContext'
import {
	createDesignSystemMeta,
	readDesignSystemMeta,
} from './DesignSystemShape'

const DOCUMENT_REF = `ds_${'A'.repeat(20)}`
const REVISION = `sha256:${'a'.repeat(64)}`
const NEXT_REVISION = `sha256:${'b'.repeat(64)}`
const RESIDENT_CAPABILITY = `hr_${'A'.repeat(43)}`

function serverSnapshot(revision = REVISION) {
	return {
		documentRef: DOCUMENT_REF,
		revision,
		title: 'Canvapocalypse UI',
		projectId: 'canvapocalypse',
		bytes: 12_000,
		status: 'current',
		truncated: false,
		sourcePath: '/private/project/DESIGN.md',
		markdown: '# secret source',
		projection: {
			projectId: 'canvapocalypse',
			theme: 'Technical calm',
			atmosphere: Array.from(
				{ length: 30 },
				(_, index) => `Atmosphere ${index} ${'a'.repeat(300)}`
			),
			palette: Array.from({ length: 40 }, (_, index) => ({
				role: `Role ${index}`,
				name: `Color ${index}`,
				hex: index % 2 ? '#31c3d8' : '#0f172a',
				cssVariable: `--secret-${index}`,
			})),
			typography: Array.from({ length: 30 }, (_, index) => ({
				role: `Type ${index}`,
				family: 'Inter',
				weight: '600',
				summary: `Usage ${index} ${'t'.repeat(300)}`,
				fontFile: '/private/inter.woff2',
			})),
			components: Array.from({ length: 60 }, (_, index) => ({
				name: `Component ${index}`,
				summary: `Styling ${index} ${'c'.repeat(500)}`,
				source: '<button>secret</button>',
			})),
			layoutPrinciples: Array.from(
				{ length: 30 },
				(_, index) => `Layout ${index} ${'l'.repeat(300)}`
			),
			raw: '# secret source',
		},
	}
}

function designSystemShape(revision = REVISION): TLShape {
	return {
		id: 'shape:design-system',
		type: 'design-system',
		props: { w: 560, h: 440 },
		meta: {
			designSystem: createDesignSystemMeta(
				normalizeDesignSystemSnapshot(serverSnapshot(revision))
			),
			sourcePath: '/private/project/DESIGN.md',
		},
	} as unknown as TLShape
}

beforeEach(() => {
	installHtmlMockupResidentCapability(RESIDENT_CAPABILITY)
})

afterEach(() => {
	vi.unstubAllGlobals()
})

describe('Design System bridge boundaries', () => {
	it('keeps only a capped semantic projection and rejects source-shaped fields', () => {
		const snapshot = normalizeDesignSystemSnapshot(serverSnapshot())
		expect(snapshot.projection.components.length).toBeLessThanOrEqual(
			MAX_DESIGN_SYSTEM_COMPONENT_ITEMS
		)
		expect(JSON.stringify(snapshot.projection).length).toBeLessThanOrEqual(
			MAX_DESIGN_SYSTEM_PROJECTION_CHARS
		)
		const serialized = JSON.stringify(snapshot)
		for (const forbidden of [
			'/private/',
			'secret source',
			'cssVariable',
			'fontFile',
			'<button>',
			'markdown',
			'sourcePath',
		]) {
			expect(serialized).not.toContain(forbidden)
		}
		expect(snapshot.truncated).toBe(true)
	})

	it('persists only an opaque ref, revision, title, and compact drift state', () => {
		const snapshot = normalizeDesignSystemSnapshot(serverSnapshot())
		const meta = createDesignSystemMeta(snapshot)
		expect(Object.keys(meta).sort()).toEqual([
			'documentRef',
			'revision',
			'schema',
			'status',
			'title',
			'truncated',
		])
		expect(JSON.stringify(meta)).not.toContain('projection')
		expect(JSON.stringify(meta)).not.toContain('DESIGN.md')
		expect(
			readDesignSystemMeta({
				meta: { designSystem: meta },
			} as never)
		).toEqual(meta)
		expect(
			readDesignSystemMeta({
				meta: {
					designSystem: { ...meta, documentRef: '/private/DESIGN.md' },
				},
			} as never)
		).toBeNull()
	})

	it('uses the shared resident capability and expected revision', async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(JSON.stringify(serverSnapshot()), {
				status: 200,
				headers: { 'content-type': 'application/json' },
			})
		)
		vi.stubGlobal('fetch', fetchMock)

		await expect(
			getDesignSystemSnapshot(DOCUMENT_REF, REVISION)
		).resolves.toMatchObject({
			documentRef: DOCUMENT_REF,
			revision: REVISION,
			title: 'Canvapocalypse UI',
		})

		const [input, init] = fetchMock.mock.calls[0]
		const url = new URL(String(input))
		expect(url.origin).toBe('http://127.0.0.1:5176')
		expect(url.pathname).toBe(
			`/design-systems/${DOCUMENT_REF}/snapshot`
		)
		expect(url.searchParams.get('expectedRevision')).toBe(REVISION)
		expect(
			new Headers(init.headers).get('x-tldraw-html-capability')
		).toBe(RESIDENT_CAPABILITY)
	})

	it('rechecks exact selection authority after asynchronous inspection', async () => {
		let selection = [designSystemShape()]
		const editor = {
			getSelectedShapes: vi.fn(() => selection),
		} as unknown as Editor
		let resolveFetch!: (response: Response) => void
		vi.stubGlobal(
			'fetch',
			vi.fn(
				() =>
					new Promise<Response>((resolve) => {
						resolveFetch = resolve
					})
			)
		)

		const pending = getSelectedDesignSystemContext(editor)
		await vi.waitFor(() => expect(resolveFetch).toBeTypeOf('function'))
		selection = [designSystemShape(NEXT_REVISION)]
		resolveFetch(
			new Response(JSON.stringify(serverSnapshot()), {
				status: 200,
				headers: { 'content-type': 'application/json' },
			})
		)
		await expect(pending).rejects.toThrow(
			'revision changed while context was being inspected'
		)
	})
})
