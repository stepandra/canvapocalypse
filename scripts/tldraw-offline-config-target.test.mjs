import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveOfflineConfigDocument } from './tldraw-offline-config-target.mjs'

test('Offline config resolution uses API documentId, not the file-backed doc id', async () => {
	const candidate =
		'/tmp/tldraw/working/wd-725-15/script/config.js'
	const calls = []
	const fetchImpl = async (url) => {
		calls.push(String(url))
		if (String(url).endsWith('/api/search')) {
			return Response.json({
				success: true,
				result: [
					{
						id: 'tldr:file:opaque-file-id',
						documentId: '4P-1ZfIwAVpdWO8sVnEFG',
					},
				],
			})
		}
		if (
			String(url).endsWith(
				'/api/doc/4P-1ZfIwAVpdWO8sVnEFG/script-workspace'
			)
		) {
			return Response.json({
				success: true,
				result: { scriptDir: '/tmp/tldraw/working/wd-725-15/script' },
			})
		}
		return new Response('not found', { status: 404 })
	}

	const documentId = await resolveOfflineConfigDocument({
		candidate,
		serverConfig: { port: 7236, token: 'test-only-host-token' },
		fetchImpl,
	})

	assert.equal(documentId, '4P-1ZfIwAVpdWO8sVnEFG')
	assert.equal(
		calls.some((url) => url.includes('tldr:file:opaque-file-id')),
		false
	)
})
