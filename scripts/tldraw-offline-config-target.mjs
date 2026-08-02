import { resolve } from 'node:path'

const DOCUMENT_ID_PATTERN = /^[A-Za-z0-9_-]+$/

export async function resolveOfflineConfigDocument({
	candidate,
	serverConfig,
	fetchImpl = fetch,
}) {
	const baseUrl = `http://127.0.0.1:${serverConfig.port}`
	const documentsResponse = await fetchImpl(`${baseUrl}/api/search`, {
		method: 'POST',
		headers: {
			authorization: `Bearer ${serverConfig.token}`,
			'content-type': 'text/plain',
		},
		body: 'return await api.getDocs()',
		cache: 'no-store',
	})
	if (!documentsResponse.ok) {
		throw new Error(
			`tldraw Offline document lookup returned HTTP ${documentsResponse.status}.`
		)
	}
	const documentsPayload = await documentsResponse.json()
	const documents = Array.isArray(documentsPayload?.result)
		? documentsPayload.result
		: []
	for (const document of documents) {
		const documentId = document?.documentId
		if (
			typeof documentId !== 'string' ||
			!DOCUMENT_ID_PATTERN.test(documentId)
		) {
			continue
		}
		const workspaceResponse = await fetchImpl(
			`${baseUrl}/api/doc/${documentId}/script-workspace`,
			{
				method: 'POST',
				headers: { authorization: `Bearer ${serverConfig.token}` },
				cache: 'no-store',
			}
		)
		if (!workspaceResponse.ok) continue
		const workspacePayload = await workspaceResponse.json()
		const scriptDir = workspacePayload?.result?.scriptDir
		if (
			typeof scriptDir === 'string' &&
			resolve(scriptDir, 'config.js') === candidate
		) {
			return documentId
		}
	}
	throw new Error(
		'No open tldraw Offline document owns the requested config.js path.'
	)
}
