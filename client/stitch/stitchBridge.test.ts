import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installHtmlMockupResidentCapability } from '../html-mockup/htmlMockupBridge'
import {
	generateStitchScreen,
	getStitchStatus,
	listStitchProjects,
} from './stitchBridge'

const TEST_CAPABILITY = `hr_${'T'.repeat(43)}`
const PROJECT_REF = `stp_${'p'.repeat(22)}`
const SCREEN_REF = `sts_${'s'.repeat(22)}`
const DOCUMENT_REF = `hd_${'d'.repeat(20)}`
const REVISION = `sha256:${'a'.repeat(64)}`

describe('Stitch browser bridge', () => {
	beforeEach(() => {
		installHtmlMockupResidentCapability(TEST_CAPABILITY)
	})

	afterEach(() => {
		vi.unstubAllGlobals()
	})

	it('uses the resident loopback capability for bounded status and projects', async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = new URL(String(input))
			expect(url.origin).toBe('http://127.0.0.1:5176')
			expect(new Headers(init?.headers).get('x-tldraw-html-capability')).toBe(
				TEST_CAPABILITY
			)
			if (url.pathname === '/stitch/status') {
				return Response.json({
					configured: true,
					authMode: 'api-key',
					provider: 'google-stitch',
					surface: 'native-tldraw',
				})
			}
			return Response.json({
				projects: [{ projectRef: PROJECT_REF, title: 'AutoRecruit UI' }],
			})
		})
		vi.stubGlobal('fetch', fetchMock)

		await expect(getStitchStatus()).resolves.toEqual({
			configured: true,
			authMode: 'api-key',
			provider: 'google-stitch',
			surface: 'native-tldraw',
		})
		await expect(listStitchProjects()).resolves.toEqual([
			{ projectRef: PROJECT_REF, title: 'AutoRecruit UI' },
		])
		expect(fetchMock).toHaveBeenCalledTimes(2)
	})

	it('normalizes a compact artifact and rejects provider-only response fields', async () => {
		const compact = {
			receipt: {
				receiptId: `str_${'r'.repeat(22)}`,
				status: 'succeeded',
				operation: 'generate',
			},
			project: { projectRef: PROJECT_REF, title: 'AutoRecruit UI' },
			screen: {
				screenRef: SCREEN_REF,
				projectRef: PROJECT_REF,
				title: 'Candidate screen',
				documentRef: DOCUMENT_REF,
				localRevision: REVISION,
			},
			document: {
				documentRef: DOCUMENT_REF,
				title: 'candidate-screen.html',
				revision: REVISION,
				truncated: false,
			},
		}
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(Response.json(compact))
			.mockResolvedValueOnce(
				Response.json({
					...compact,
					downloadUrl: 'https://stitch.googleapis.com/private',
				})
			)
		vi.stubGlobal('fetch', fetchMock)

		const request = {
			projectRef: PROJECT_REF,
			prompt: 'Create a candidate review screen',
			deviceType: 'DESKTOP' as const,
			idempotencyKey: 'stitch:test:bridge-1',
		}
		await expect(generateStitchScreen(request)).resolves.toEqual(compact)
		await expect(
			generateStitchScreen({
				...request,
				idempotencyKey: 'stitch:test:bridge-2',
			})
		).rejects.toThrow('provider-only data')
	})
})
