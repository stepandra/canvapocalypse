import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { constants as fsConstants } from 'node:fs'
import {
	mkdir,
	lstat,
	open as openFile,
	readdir,
	realpath,
	rename,
	stat,
	unlink,
	writeFile,
} from 'node:fs/promises'
import {
	basename,
	delimiter,
	dirname,
	extname,
	isAbsolute,
	join,
	relative,
	resolve,
	sep,
} from 'node:path'
import { parse, parseFragment, serialize } from 'parse5'

const MAX_DOCUMENTS = 200
const MAX_REGISTRY_FILES = 5_000
const MAX_SCAN_ENTRIES = 20_000
const MAX_FILE_BYTES = 4 * 1024 * 1024
const MAX_IMPORT_BODY_BYTES = MAX_FILE_BYTES + 16_384
const MAX_PATCH_BODY_BYTES = 256 * 1024
const MAX_PREVIEW_TICKET_BODY_BYTES = 4 * 1024
const MAX_REPLACEMENT_BYTES = 32 * 1024
const MAX_SNAPSHOT_NODES = 200
const MAX_SNAPSHOT_CHARS = 12_000
const MAX_NAME_CHARS = 160
const MAX_TARGET_REF_CHARS = 80
const MAX_VARIANT_OPERATIONS = 500
const MAX_CONTEXT_GRANTS = 500
const MAX_PREVIEW_TICKETS = 1_000
const CONTEXT_GRANT_TTL_MS = 2 * 60 * 1000
const PREVIEW_TICKET_TTL_MS = 5 * 60 * 1000
const RESIDENT_CAPABILITY_HEADER = 'x-tldraw-html-capability'
const RESIDENT_CAPABILITY_PATTERN = /^hr_[A-Za-z0-9_-]{43,128}$/
const PREVIEW_TICKET_PATTERN = /^hp_[A-Za-z0-9_-]{24,128}$/
const DEFAULT_PREVIEW_PARENT_ORIGINS = [
	'file://',
	'http://127.0.0.1:5173',
	'http://localhost:5173',
	'http://127.0.0.1:5175',
	'http://localhost:5175',
]

const SKIPPED_DIRECTORIES = new Set([
	'.git',
	'node_modules',
	'.pnpm-store',
	'.wrangler',
	'.tldraw-backups',
])
const HTML_EXTENSIONS = new Set(['.html', '.htm'])
const WEB_ASSET_MIME_TYPES = new Map([
	['.avif', 'image/avif'],
	['.bmp', 'image/bmp'],
	['.css', 'text/css; charset=utf-8'],
	['.gif', 'image/gif'],
	['.ico', 'image/x-icon'],
	['.jpeg', 'image/jpeg'],
	['.jpg', 'image/jpeg'],
	['.mp3', 'audio/mpeg'],
	['.mp4', 'video/mp4'],
	['.ogg', 'audio/ogg'],
	['.otf', 'font/otf'],
	['.png', 'image/png'],
	['.ttf', 'font/ttf'],
	['.wav', 'audio/wav'],
	['.webm', 'video/webm'],
	['.webp', 'image/webp'],
	['.woff', 'font/woff'],
	['.woff2', 'font/woff2'],
])
const FORBIDDEN_REPLACEMENT_TAGS = new Set([
	'base',
	'embed',
	'iframe',
	'object',
	'script',
])
const FORBIDDEN_PREVIEW_TAGS = new Set([
	'base',
	'embed',
	'iframe',
	'object',
])
const SAFE_INLINE_PREVIEW_SCRIPT_TYPES = new Set([
	'',
	'application/ecmascript',
	'application/javascript',
	'text/ecmascript',
	'text/javascript',
])
const URL_ATTRIBUTES = new Set([
	'action',
	'formaction',
	'href',
	'poster',
	'src',
	'xlink:href',
])
const LANDMARK_ROLES = new Map([
	['aside', 'complementary'],
	['footer', 'contentinfo'],
	['form', 'form'],
	['header', 'banner'],
	['main', 'main'],
	['nav', 'navigation'],
])
const TAG_ROLES = new Map([
	['button', 'button'],
	['dialog', 'dialog'],
	['img', 'img'],
	['li', 'listitem'],
	['ol', 'list'],
	['option', 'option'],
	['progress', 'progressbar'],
	['select', 'combobox'],
	['table', 'table'],
	['tbody', 'rowgroup'],
	['td', 'cell'],
	['textarea', 'textbox'],
	['tfoot', 'rowgroup'],
	['th', 'columnheader'],
	['thead', 'rowgroup'],
	['tr', 'row'],
	['ul', 'list'],
])
const SEMANTIC_TAGS = new Set([
	'a',
	'abbr',
	'address',
	'article',
	'aside',
	'blockquote',
	'button',
	'details',
	'dialog',
	'figcaption',
	'figure',
	'footer',
	'form',
	'h1',
	'h2',
	'h3',
	'h4',
	'h5',
	'h6',
	'header',
	'img',
	'input',
	'label',
	'li',
	'main',
	'nav',
	'ol',
	'option',
	'output',
	'progress',
	'section',
	'select',
	'summary',
	'table',
	'td',
	'textarea',
	'th',
	'tr',
	'ul',
])
const NON_CONTEXT_TAGS = new Set([
	'head',
	'noscript',
	'script',
	'style',
	'template',
])
const TEXT_NAMED_TAGS = new Set([
	'a',
	'abbr',
	'button',
	'figcaption',
	'h1',
	'h2',
	'h3',
	'h4',
	'h5',
	'h6',
	'label',
	'legend',
	'li',
	'option',
	'output',
	'summary',
	'td',
	'th',
])

export function createLocalHtmlMockupService(options = {}) {
	const cwd = resolve(options.cwd ?? process.cwd())
	const residentAuthority = createResidentCapabilityAuthority(
		options.residentCapability ??
			process.env.TLDRAW_HTML_MOCKUP_RESIDENT_CAPABILITY
	)
	const configuredRoots =
		options.roots ??
		[cwd, ...parseConfiguredRoots(options.rootsEnv ?? process.env.TLDRAW_HTML_MOCKUP_ROOTS, cwd)]
	const previewParentOrigins = resolvePreviewParentOrigins(
		options.parentOrigins ??
			parseConfiguredParentOrigins(
				options.parentOriginsEnv ??
					process.env.TLDRAW_HTML_MOCKUP_PARENT_ORIGINS
			)
	)
	let rootsPromise
	const variantOperations = new Map()
	const contextGrants = new Map()
	const previewTickets = new Map()

	const getRoots = () => {
		rootsPromise ??= resolveRoots(configuredRoots)
		return rootsPromise
	}

	return async function handleLocalHtmlMockupRequest(
		url,
		request,
		response,
		readBody,
		send
	) {
		if (!url.pathname.startsWith('/html-mockups')) return false
		setNoStore(response)

		try {
			const roots = await getRoots()
			const routePath = normalizeRoutePath(url.pathname)
			if (
				request.method === 'POST' &&
				routePath === '/html-mockups/session'
			) {
				return bootstrapResidentCapability({
					request,
					response,
					send,
					previewParentOrigins,
					residentAuthority,
				})
			}

			if (request.method === 'GET' && routePath === '/html-mockups') {
				authorizeResidentCapability(
					request,
					residentAuthority,
					previewParentOrigins
				)
				const registry = await scanRegistry(roots)
				return sendJson(response, send, 200, {
					documents: registry.entries.slice(0, MAX_DOCUMENTS).map(publicDocumentMetadata),
					truncated: registry.entries.length > MAX_DOCUMENTS || registry.scanTruncated,
					limits: {
						maxDocuments: MAX_DOCUMENTS,
						maxFileBytes: MAX_FILE_BYTES,
					},
				})
			}

			if (request.method === 'POST' && routePath === '/html-mockups/import') {
				authorizeResidentCapability(
					request,
					residentAuthority,
					previewParentOrigins
				)
				return await importDocument({ roots, request, response, readBody, send })
			}

			const documentRoute = matchDocumentRoute(url.pathname)
			if (!documentRoute) return sendJson(response, send, 404, { error: 'not_found' })
			const registry = await scanRegistry(roots)
			const entry = registry.byRef.get(documentRoute.documentRef)
			if (!entry) {
				return sendJson(response, send, 404, { error: 'document_not_found' })
			}

			if (request.method === 'GET' && documentRoute.action === 'snapshot') {
				const residentAuthorization = authorizeResidentCapability(
					request,
					residentAuthority,
					previewParentOrigins
				)
				return await sendSnapshot({
					entry,
					url,
					response,
					send,
					contextGrants,
					residentAuthorization,
				})
			}
			if (
				request.method === 'POST' &&
				documentRoute.action === 'preview-ticket'
			) {
				const residentAuthorization = authorizeResidentCapability(
					request,
					residentAuthority,
					previewParentOrigins
				)
				return await sendPreviewTicket({
					entry,
					request,
					response,
					readBody,
					send,
					previewTickets,
					residentAuthorization,
				})
			}
			if (request.method === 'GET' && documentRoute.action === 'preview') {
				const previewTicket = authorizePreviewTicket(previewTickets, {
					ticket: url.searchParams.get('ticket'),
					documentRef: entry.documentRef,
				})
				return await sendPreview({
					entry,
					url,
					response,
					send,
					previewTicket,
				})
			}
			if (request.method === 'GET' && documentRoute.action === 'assets') {
				const previewTicket = authorizePreviewTicket(previewTickets, {
					ticket: documentRoute.previewTicket,
					documentRef: entry.documentRef,
				})
				return await sendAsset({
					entry,
					assetPath: documentRoute.assetPath,
					response,
					send,
					previewTicket,
				})
			}
			if (request.method === 'POST' && documentRoute.action === 'patch') {
				const residentAuthorization = authorizeResidentCapability(
					request,
					residentAuthority,
					previewParentOrigins
				)
				return await patchDocument({
					entry,
					request,
					response,
					readBody,
					send,
					variantOperations,
					contextGrants,
					residentAuthorization,
				})
			}
			return sendJson(response, send, 405, { error: 'method_not_allowed' })
		} catch (error) {
			const status = Number.isInteger(error?.statusCode) ? error.statusCode : 500
			return sendJson(response, send, status, {
				error: typeof error?.code === 'string' ? error.code : 'html_mockup_error',
				message:
					status >= 500
						? 'The local HTML mockup request failed.'
						: error instanceof Error
							? error.message
							: String(error),
			})
		}
	}
}

/**
 * Server-internal importer used by trusted provider adapters such as Stitch.
 * It grants no HTTP or filesystem authority to the caller: roots are fixed at
 * construction time and the same import validation/managed directory are used
 * as the resident Local HTML endpoint.
 */
export function createLocalHtmlMockupImporter(options = {}) {
	const cwd = resolve(options.cwd ?? process.cwd())
	const configuredRoots =
		options.roots ??
		[cwd, ...parseConfiguredRoots(options.rootsEnv ?? process.env.TLDRAW_HTML_MOCKUP_ROOTS, cwd)]
	let rootsPromise

	const getRoots = () => {
		rootsPromise ??= resolveRoots(configuredRoots)
		return rootsPromise
	}

	return async function importLocalHtmlMockup({ name, content }) {
		const roots = await getRoots()
		return persistImportedDocument({ roots, name, content })
	}
}

let defaultService

export async function handleLocalHtmlMockupRequest(...args) {
	defaultService ??= createLocalHtmlMockupService()
	return defaultService(...args)
}

function createResidentCapabilityAuthority(configuredCapability) {
	const capability =
		configuredCapability == null || configuredCapability === ''
			? `hr_${randomBytes(32).toString('base64url')}`
			: String(configuredCapability)
	if (!RESIDENT_CAPABILITY_PATTERN.test(capability)) {
		throw httpError(
			500,
			'invalid_resident_capability',
			'TLDRAW_HTML_MOCKUP_RESIDENT_CAPABILITY must be a high-entropy hr_ token.'
		)
	}
	return {
		capability,
		id: `hri_${createHash('sha256')
			.update(capability)
			.digest('base64url')
			.slice(0, 22)}`,
	}
}

function bootstrapResidentCapability({
	request,
	response,
	send,
	previewParentOrigins,
	residentAuthority,
}) {
	const origin = request.headers.origin
	if (
		typeof origin !== 'string' ||
		origin === 'null' ||
		origin === 'file://' ||
		!previewParentOrigins.has(origin)
	) {
		throw httpError(
			403,
			'resident_bootstrap_forbidden',
			'Only an exact trusted HTTP workbench origin may bootstrap a resident capability.'
		)
	}
	return sendJson(response, send, 200, {
		capability: residentAuthority.capability,
	})
}

function authorizeResidentCapability(
	request,
	residentAuthority,
	previewParentOrigins
) {
	const supplied = readRequestHeader(request, RESIDENT_CAPABILITY_HEADER)
	if (
		typeof supplied !== 'string' ||
		!constantTimeTokenEqual(supplied, residentAuthority.capability)
	) {
		throw httpError(
			401,
			'resident_capability_required',
			'A valid resident Local HTML Mockup capability is required.'
		)
	}
	const requestOrigin = readRequestHeader(request, 'origin')
	let parentOrigin
	if (
		requestOrigin == null ||
		requestOrigin === '' ||
		requestOrigin === 'null'
	) {
		parentOrigin = 'file://'
	} else if (
		typeof requestOrigin === 'string' &&
		previewParentOrigins.has(requestOrigin) &&
		requestOrigin !== 'file://'
	) {
		parentOrigin = requestOrigin
	} else {
		throw httpError(
			403,
			'resident_origin_forbidden',
			'The Local HTML Mockup resident origin is not allowlisted.'
		)
	}
	return { id: residentAuthority.id, parentOrigin }
}

function constantTimeTokenEqual(left, right) {
	const leftBuffer = Buffer.from(left)
	const rightBuffer = Buffer.from(right)
	return (
		leftBuffer.byteLength === rightBuffer.byteLength &&
		timingSafeEqual(leftBuffer, rightBuffer)
	)
}

function readRequestHeader(request, name) {
	const value = request.headers?.[name]
	return Array.isArray(value) ? value[0] : value
}

async function importDocument({ roots, request, response, readBody, send }) {
	const payload = parseJson(await readBody(request, MAX_IMPORT_BODY_BYTES))
	const document = await persistImportedDocument({
		roots,
		name: payload?.name,
		content: payload?.content,
	})
	return sendJson(response, send, 201, { document })
}

async function persistImportedDocument({ roots, name: rawName, content }) {
	if (!roots.length) throw httpError(503, 'mockup_root_unavailable', 'No mockup root is available.')
	const name = validateImportName(rawName)
	if (typeof content !== 'string') {
		throw httpError(400, 'invalid_import_content', 'content must be a UTF-8 string.')
	}
	const contentBytes = Buffer.byteLength(content, 'utf8')
	if (contentBytes > MAX_FILE_BYTES) {
		throw httpError(413, 'import_too_large', 'The HTML mockup exceeds the 4 MiB limit.')
	}

	const root = roots[0]
	const managedDirectory = await ensureContainedDirectory(
		root.realPath,
		join(root.realPath, '.tldraw-html-mockups')
	)
	const importDirectory = await ensureContainedDirectory(
		root.realPath,
		join(managedDirectory, 'imports')
	)
	const extension = extname(name).toLowerCase()
	const stem = basename(name, extension).replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 96) || 'mockup'
	const suffix = createHash('sha256')
		.update(content)
		.update(randomBytes(12))
		.digest('hex')
		.slice(0, 10)
	const outputName = `${stem}-${suffix}${extension}`
	const outputPath = join(importDirectory, outputName)
	await atomicWrite(outputPath, content)
	const outputRealPath = await realpath(outputPath)
	const entry = await makeRegistryEntry(root, outputRealPath)
	const revision = revisionFor(Buffer.from(content, 'utf8'))
	return {
		...publicDocumentMetadata(entry),
		revision,
	}
}

async function sendSnapshot({
	entry,
	url,
	response,
	send,
	contextGrants,
	residentAuthorization,
}) {
	const document = await readDocument(entry)
	const targetRef = normalizeTargetRef(url.searchParams.get('targetRef'))
	const maxNodes = readBoundedInteger(
		url.searchParams.get('maxNodes'),
		MAX_SNAPSHOT_NODES,
		1,
		MAX_SNAPSHOT_NODES
	)
	const maxChars = readBoundedInteger(
		url.searchParams.get('maxChars'),
		MAX_SNAPSHOT_CHARS,
		512,
		MAX_SNAPSHOT_CHARS
	)
	const parsed = parseDocumentWithRefs(document.source, document.revision)
	let scopeNode = parsed.document
	let ancestors = []
	if (targetRef) {
		scopeNode = parsed.byRef.get(targetRef)
		if (!scopeNode || isExcludedContextSubtree(scopeNode)) {
			throw httpError(
				404,
				'target_not_found',
				'The target reference is not valid for this document revision.'
			)
		}
		ancestors = collectAncestors(scopeNode, parsed.refByNode)
	}

	const flat = buildSemanticSnapshot(
		scopeNode,
		parsed.refByNode,
		Boolean(targetRef),
		maxNodes,
		maxChars
	)
	const target = targetRef
		? semanticNodeSummary(
				scopeNode,
				targetRef,
				0,
				parsed.refByNode
			)
		: undefined
	const contextGrant = targetRef
		? issueContextGrant(contextGrants, {
				documentRef: entry.documentRef,
				revision: document.revision,
				targetRef,
				parentOrigin: residentAuthorization.parentOrigin,
				residentCapabilityId: residentAuthorization.id,
			})
		: null
	return sendJson(response, send, 200, {
		documentRef: entry.documentRef,
		revision: document.revision,
		title: documentTitle(parsed.document) || entry.name,
		bytes: document.buffer.byteLength,
		scope: { targetRef: targetRef ?? null },
		nodes: flat.nodes,
		...(target ? { target } : {}),
		...(contextGrant
			? {
					contextRef: contextGrant.contextRef,
					contextExpiresAt: new Date(contextGrant.expiresAt).toISOString(),
				}
			: {}),
		ancestors,
		truncated: flat.truncated,
		charCount: flat.charCount,
		limits: {
			maxNodes,
			maxChars,
		},
	})
}

async function sendPreviewTicket({
	entry,
	request,
	response,
	readBody,
	send,
	previewTickets,
	residentAuthorization,
}) {
	const payload = parseJson(
		await readBody(request, MAX_PREVIEW_TICKET_BODY_BYTES)
	)
	const expectedRevision =
		typeof payload?.revision === 'string' ? payload.revision : ''
	const document = await readDocument(entry)
	if (!expectedRevision || expectedRevision !== document.revision) {
		throw httpError(
			409,
			'revision_conflict',
			'The document changed before its preview ticket was issued.'
		)
	}
	const previewTicket = issuePreviewTicket(previewTickets, {
		documentRef: entry.documentRef,
		revision: document.revision,
		parentOrigin: residentAuthorization.parentOrigin,
		residentCapabilityId: residentAuthorization.id,
	})
	return sendJson(response, send, 201, {
		ticket: previewTicket.ticket,
		documentRef: entry.documentRef,
		revision: document.revision,
		parentOrigin: residentAuthorization.parentOrigin,
		expiresAt: new Date(previewTicket.expiresAt).toISOString(),
	})
}

async function sendPreview({
	entry,
	url,
	response,
	send,
	previewTicket,
}) {
	const document = await readDocument(entry)
	const expectedRevision = url.searchParams.get('revision')
	if (
		previewTicket.revision !== document.revision ||
		(expectedRevision && expectedRevision !== document.revision)
	) {
		throw httpError(
			409,
			'revision_conflict',
			'The document changed after this preview URL was created.'
		)
	}
	const parsed = parseDocumentWithRefs(document.source, document.revision)
	sanitizePreviewTree(parsed.document)
	for (const [node, targetRef] of parsed.refByNode) {
		if (
			isElement(node) &&
			isAttached(node, parsed.document) &&
			!isInExcludedContextSubtree(node)
		) {
			setAttribute(node, 'data-tldraw-html-ref', targetRef)
			setAttribute(
				node,
				'data-tldraw-html-summary',
				previewSelectionSummary(node)
			)
		}
	}

	const nonce = randomBytes(18).toString('base64')
	authorizeInlinePreviewScripts(parsed.document, nonce)
	const documentDirectory = dirname(entry.relativePath)
	const encodedDirectory =
		documentDirectory === '.'
			? ''
			: `${documentDirectory
					.split(/[\\/]+/)
					.filter(Boolean)
					.map(encodeURIComponent)
					.join('/')}/`
	const ticketedAssetBase = `/html-mockups/${entry.documentRef}/assets/${previewTicket.ticket}/${encodedDirectory}`
	injectPreviewRuntime(parsed.document, {
		assetBase: ticketedAssetBase,
		documentRef: entry.documentRef,
		revision: document.revision,
		nonce,
		parentOrigin: previewTicket.parentOrigin,
	})

	response.setHeader(
		'Content-Security-Policy',
		[
			"default-src 'none'",
			`script-src 'nonce-${nonce}'`,
			"style-src 'self' 'unsafe-inline'",
			"img-src 'self' data: blob:",
			"font-src 'self' data:",
			"media-src 'self' data:",
			"connect-src 'none'",
			"frame-src 'none'",
			"object-src 'none'",
			"form-action 'none'",
			"base-uri 'self'",
			`frame-ancestors ${frameAncestorForParentOrigin(
				previewTicket.parentOrigin
			)}`,
		].join('; ')
	)
	response.setHeader('Content-Type', 'text/html; charset=utf-8')
	response.setHeader('Referrer-Policy', 'no-referrer')
	response.setHeader('X-Content-Type-Options', 'nosniff')
	send(response, 200, serialize(parsed.document))
	return true
}

async function sendAsset({
	entry,
	assetPath,
	response,
	send,
	previewTicket,
}) {
	const document = await readDocument(entry)
	if (previewTicket.revision !== document.revision) {
		throw httpError(
			409,
			'revision_conflict',
			'The document changed after this preview asset ticket was issued.'
		)
	}
	let decoded
	try {
		decoded = decodeURIComponent(assetPath)
	} catch {
		throw httpError(400, 'invalid_asset_path', 'The asset path is invalid.')
	}
	if (
		!decoded ||
		decoded.includes('\0') ||
		decoded.includes('\\') ||
		isAbsolute(decoded) ||
		decoded.split('/').includes('..')
	) {
		throw httpError(400, 'invalid_asset_path', 'The asset path is invalid.')
	}
	const extension = extname(decoded).toLowerCase()
	const contentType = WEB_ASSET_MIME_TYPES.get(extension)
	if (!contentType || HTML_EXTENSIONS.has(extension)) {
		throw httpError(415, 'unsupported_asset_type', 'The requested asset type is not allowed.')
	}

	const candidate = resolve(entry.root.realPath, decoded)
	if (!isPathInside(entry.root.realPath, candidate)) {
		throw httpError(403, 'asset_outside_root', 'The asset is outside the registered root.')
	}
	let candidateRealPath
	try {
		const candidateMetadata = await lstat(candidate)
		if (candidateMetadata.isSymbolicLink()) {
			throw httpError(
				403,
				'asset_symlink_forbidden',
				'Symlinked assets are not allowed.'
			)
		}
		candidateRealPath = await realpath(candidate)
	} catch (error) {
		if (error?.statusCode) throw error
		throw httpError(404, 'asset_not_found', 'The asset does not exist.')
	}
	if (!isPathInside(entry.root.realPath, candidateRealPath)) {
		throw httpError(403, 'asset_outside_root', 'The asset is outside the registered root.')
	}
	const targetExtension = extname(candidateRealPath).toLowerCase()
	if (
		targetExtension !== extension ||
		WEB_ASSET_MIME_TYPES.get(targetExtension) !== contentType
	) {
		throw httpError(
			415,
			'asset_type_mismatch',
			'The requested asset type does not match the registered file.'
		)
	}
	const metadata = await stat(candidateRealPath)
	if (!metadata.isFile() || metadata.size > MAX_FILE_BYTES) {
		throw httpError(404, 'asset_not_found', 'The asset does not exist.')
	}
	const body = await readBoundRegularFile({
		filePath: candidateRealPath,
		expectedDevice: metadata.dev,
		expectedInode: metadata.ino,
		maxBytes: MAX_FILE_BYTES,
		bindingError: httpError(
			409,
			'asset_binding_changed',
			'The asset binding changed while it was being opened.'
		),
		tooLargeError: httpError(
			413,
			'asset_too_large',
			'The asset exceeds the local preview byte limit.'
		),
	})
	response.setHeader('Content-Type', contentType)
	response.setHeader('X-Content-Type-Options', 'nosniff')
	send(response, 200, body)
	return true
}

async function patchDocument({
	entry,
	request,
	response,
	readBody,
	send,
	variantOperations,
	contextGrants,
	residentAuthorization,
}) {
	const payload = parseJson(await readBody(request, MAX_PATCH_BODY_BYTES))
	const expectedRevision =
		typeof payload?.expectedRevision === 'string' ? payload.expectedRevision : ''
	const targetRef = normalizeTargetRef(payload?.targetRef)
	const replacementHtml =
		typeof payload?.replacementHtml === 'string' ? payload.replacementHtml : ''
	const mode = payload?.mode == null ? 'variant' : payload.mode
	const contextRef = normalizeContextRef(payload?.contextRef)
	const idempotencyKey =
		payload?.idempotencyKey == null
			? null
			: validateIdempotencyKey(payload.idempotencyKey)
	if (!expectedRevision || !targetRef || !replacementHtml) {
		throw httpError(
			400,
			'invalid_patch',
			'expectedRevision, targetRef, and replacementHtml are required.'
		)
	}
	if (!contextRef) {
		throw httpError(
			403,
			'context_required',
			'Inspect the selected Local HTML Mockup target before creating a variant.'
		)
	}
	if (mode !== 'variant') {
		throw httpError(
			400,
			'invalid_patch_mode',
			'Only safe variant patches are available in this workbench slice.'
		)
	}
	if (Buffer.byteLength(replacementHtml, 'utf8') > MAX_REPLACEMENT_BYTES) {
		throw httpError(413, 'replacement_too_large', 'The replacement HTML is too large.')
	}
	const fingerprint = createHash('sha256')
		.update(
			JSON.stringify({
				documentRef: entry.documentRef,
				expectedRevision,
				targetRef,
				contextRef,
				replacementHtml,
				mode,
			})
		)
		.digest('hex')

	if (idempotencyKey) {
		const replay = variantOperations.get(idempotencyKey)
		if (replay) {
			if (replay.fingerprint !== fingerprint) {
				throw httpError(
					409,
					'idempotency_conflict',
					'The idempotency key was already used for a different variant request.'
				)
			}
			try {
				const receipt = await replay.promise
				replay.settled = true
				return sendJson(response, send, 201, receipt)
			} catch (error) {
				if (variantOperations.get(idempotencyKey) === replay) {
					variantOperations.delete(idempotencyKey)
				}
				throw error
			}
		}
	}

	const contextGrant = authorizeContextGrant(contextGrants, {
		contextRef,
		documentRef: entry.documentRef,
		revision: expectedRevision,
		targetRef,
		residentCapabilityId: residentAuthorization.id,
		parentOrigin: residentAuthorization.parentOrigin,
	})
	validateReplacementHtml(replacementHtml)

	if (!idempotencyKey) {
		const receipt = await createVariantReceipt({
			entry,
			expectedRevision,
			targetRef,
			replacementHtml,
			mode,
		})
		return sendJson(response, send, 201, receipt)
	}

	pruneVariantOperations(variantOperations)
	const operation = {
		fingerprint,
		settled: false,
		promise: createVariantReceipt({
			entry,
			expectedRevision,
			targetRef,
			replacementHtml,
			mode,
		}),
	}
	variantOperations.set(idempotencyKey, operation)

	try {
		const receipt = await operation.promise
		operation.settled = true
		return sendJson(response, send, 201, receipt)
	} catch (error) {
		if (variantOperations.get(idempotencyKey) === operation) {
			variantOperations.delete(idempotencyKey)
		}
		throw error
	}
}

async function createVariantReceipt({
	entry,
	expectedRevision,
	targetRef,
	replacementHtml,
	mode,
}) {
	const document = await readDocument(entry)
	if (document.revision !== expectedRevision) {
		throw httpError(
			409,
			'revision_conflict',
			'The document changed after it was inspected. Inspect it again before patching.'
		)
	}
	const parsed = parseDocumentWithRefs(document.source, document.revision)
	const target = parsed.byRef.get(targetRef)
	const location = target?.sourceCodeLocation
	if (
		!target ||
		!isElement(target) ||
		!location ||
		!Number.isInteger(location.startOffset) ||
		!Number.isInteger(location.endOffset)
	) {
		throw httpError(
			404,
			'target_not_found',
			'The target reference is not valid for this document revision.'
		)
	}

	const updatedSource =
		document.source.slice(0, location.startOffset) +
		replacementHtml +
		document.source.slice(location.endOffset)
	const updatedBuffer = Buffer.from(updatedSource, 'utf8')
	if (updatedBuffer.byteLength > MAX_FILE_BYTES) {
		throw httpError(413, 'document_too_large', 'The patched document exceeds the 4 MiB limit.')
	}
	const nextRevision = revisionFor(updatedBuffer)
	const operationNonce = randomBytes(12).toString('base64url')
	const receiptId = `htmlr_${createHash('sha256')
		.update(entry.documentRef)
		.update(document.revision)
		.update(nextRevision)
		.update(targetRef)
		.update(mode)
		.update(operationNonce)
		.digest('base64url')
		.slice(0, 18)}`

	const extension = extname(entry.name)
	const stem = basename(entry.name, extension)
	const variantName = `${stem}.tldraw-variant-${Date.now()}-${operationNonce.slice(0, 10)}${extension}`
	const variantPath = join(dirname(entry.realPath), variantName)
	await atomicWrite(variantPath, updatedBuffer)
	const variantRealPath = await realpath(variantPath)
	const variantEntry = await makeRegistryEntry(entry.root, variantRealPath)
	return {
		receiptId,
		status: 'succeeded',
		mode,
		documentRef: entry.documentRef,
		variantDocumentRef: variantEntry.documentRef,
		targetRef,
		beforeRevision: document.revision,
		afterRevision: nextRevision,
		summary: `Created a safe Local HTML Mockup variant for ${targetRef}.`,
	}
}

function validateIdempotencyKey(value) {
	if (
		typeof value !== 'string' ||
		!value.length ||
		value.length > 128 ||
		!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)
	) {
		throw httpError(
			400,
			'invalid_idempotency_key',
			'idempotencyKey must be a 1-128 character opaque token.'
		)
	}
	return value
}

function pruneVariantOperations(variantOperations) {
	if (variantOperations.size < MAX_VARIANT_OPERATIONS) return
	for (const [key, operation] of variantOperations) {
		if (!operation.settled) continue
		variantOperations.delete(key)
		if (variantOperations.size < MAX_VARIANT_OPERATIONS) return
	}
	throw httpError(
		429,
		'too_many_variant_operations',
		'Too many Local HTML Mockup variant operations are still in progress.'
	)
}

function validateReplacementHtml(replacementHtml) {
	const errors = []
	const fragment = parseFragment(replacementHtml, {
		sourceCodeLocationInfo: true,
		onParseError(error) {
			errors.push(error.code)
		},
	})
	if (errors.length) {
		throw httpError(400, 'invalid_replacement_html', 'The replacement HTML is malformed.')
	}
	const roots = (fragment.childNodes ?? []).filter(
		(node) => !(node.nodeName === '#text' && !String(node.value ?? '').trim())
	)
	if (roots.length !== 1 || !isElement(roots[0])) {
		throw httpError(
			400,
			'invalid_replacement_html',
			'The replacement must contain exactly one root element.'
		)
	}
	walkNodes(fragment, (node) => {
		if (!isElement(node)) return
		const tag = node.tagName.toLowerCase()
		if (
			FORBIDDEN_REPLACEMENT_TAGS.has(tag) ||
			(tag === 'meta' && getAttribute(node, 'http-equiv')?.toLowerCase() === 'refresh')
		) {
			throw httpError(
				400,
				'unsafe_replacement_html',
				`The replacement contains a forbidden ${tag} element.`
			)
		}
		for (const attribute of node.attrs ?? []) {
			const attributeName = qualifiedAttributeName(attribute)
			if (attributeName.startsWith('on')) {
				throw httpError(
					400,
					'unsafe_replacement_html',
					'Inline event handlers are not allowed.'
				)
			}
			if (
				URL_ATTRIBUTES.has(attributeName) &&
				normalizeUrlScheme(attribute.value).includes('javascript:')
			) {
				throw httpError(
					400,
					'unsafe_replacement_html',
					'javascript: URLs are not allowed.'
				)
			}
		}
	})
}

function parseDocumentWithRefs(source, revision) {
	const document = parse(source, { sourceCodeLocationInfo: true })
	const byRef = new Map()
	const refByNode = new Map()
	walkNodes(document, (node) => {
		if (!isElement(node) || !node.sourceCodeLocation) return
		const location = node.sourceCodeLocation
		if (!Number.isInteger(location.startOffset) || !Number.isInteger(location.endOffset)) return
		const targetRef = `he_${createHash('sha256')
			.update(revision)
			.update(':')
			.update(String(location.startOffset))
			.update(':')
			.update(String(location.endOffset))
			.update(':')
			.update(node.tagName)
			.digest('base64url')
			.slice(0, 14)}`
		byRef.set(targetRef, node)
		refByNode.set(node, targetRef)
	})
	return { document, byRef, refByNode }
}

function buildSemanticSnapshot(
	scopeNode,
	refByNode,
	includeScopeRoot,
	maxNodes,
	maxChars
) {
	const nodes = []
	let charCount = 0
	let truncated = false
	const rootDepth = nodeDepth(scopeNode)
	walkContextNodes(scopeNode, (node) => {
		if (truncated || !isElement(node)) return
		const targetRef = refByNode.get(node)
		if (!targetRef) return
		const isScopeRoot = includeScopeRoot && node === scopeNode
		if (!isScopeRoot && !isSemanticNode(node)) return
		const summary = semanticNodeSummary(
			node,
			targetRef,
			Math.max(0, nodeDepth(node) - rootDepth),
			refByNode
		)
		const serializedLength = JSON.stringify(summary).length
		if (
			nodes.length >= maxNodes ||
			charCount + serializedLength > maxChars
		) {
			truncated = true
			return
		}
		nodes.push(summary)
		charCount += serializedLength
	})
	return { nodes, charCount, truncated }
}

function semanticNodeSummary(node, ref, depth, refByNode) {
	const role = roleFor(node)
	const name = accessibleName(node).slice(0, MAX_NAME_CHARS)
	const summary = {
		ref,
		tag: node.tagName,
		depth,
		childCount: directElementChildren(node).length,
	}
	const parentRef = nearestParentRef(node, refByNode)
	if (parentRef) summary.parentRef = parentRef
	if (role !== 'generic') summary.role = role
	if (name) summary.name = name
	const text = textContent(node).slice(0, 240)
	if (text && text !== name) summary.text = text
	return summary
}

function collectAncestors(node, refByNode) {
	const ancestors = []
	let current = node.parentNode
	while (current && ancestors.length < 8) {
		if (isElement(current)) {
			const targetRef = refByNode.get(current)
			if (targetRef) {
				ancestors.unshift({
					ref: targetRef,
					tag: current.tagName,
					role: roleFor(current),
					name: accessibleName(current).slice(0, 96),
					depth: nodeDepth(current),
					childCount: directElementChildren(current).length,
				})
			}
		}
		current = current.parentNode
	}
	return ancestors
}

function sanitizePreviewTree(document) {
	removeUnsafeChildren(document)
	walkNodes(document, (node) => {
		if (!isElement(node)) return
		node.attrs = (node.attrs ?? []).filter((attribute) => {
			const name = qualifiedAttributeName(attribute)
			if (
				name.startsWith('data-tldraw-html-') ||
				name.startsWith('on') ||
				name === 'nonce'
			) {
				return false
			}
			if (
				URL_ATTRIBUTES.has(name) &&
				normalizeUrlScheme(attribute.value).includes('javascript:')
			) {
				return false
			}
			return true
		})
	})
}

function isUnsafePreviewMeta(node) {
	if (!isElement(node) || node.tagName.toLowerCase() !== 'meta') return false
	const httpEquiv = getAttribute(node, 'http-equiv')?.toLowerCase()
	return httpEquiv === 'refresh' || httpEquiv === 'content-security-policy'
}

function removeUnsafeChildren(node) {
	for (const collection of childCollections(node)) {
		const kept = []
		for (const child of collection) {
			if (
				isElement(child) &&
				(isUnsafePreviewElement(child) ||
					isUnsafePreviewMeta(child))
			) {
				continue
			}
			removeUnsafeChildren(child)
			kept.push(child)
		}
		collection.splice(0, collection.length, ...kept)
	}
}

function isUnsafePreviewElement(node) {
	const tag = node.tagName.toLowerCase()
	if (FORBIDDEN_PREVIEW_TAGS.has(tag)) return true
	if (tag !== 'script') return false
	if (getAttribute(node, 'src')) return true
	const type = (getAttribute(node, 'type') ?? '').trim().toLowerCase()
	return !SAFE_INLINE_PREVIEW_SCRIPT_TYPES.has(type)
}

function authorizeInlinePreviewScripts(document, nonce) {
	walkNodes(document, (node) => {
		if (
			!isElement(node) ||
			node.tagName.toLowerCase() !== 'script' ||
			getAttribute(node, 'src')
		) {
			return
		}
		const type = (getAttribute(node, 'type') ?? '').trim().toLowerCase()
		if (!SAFE_INLINE_PREVIEW_SCRIPT_TYPES.has(type)) return
		setAttribute(node, 'nonce', nonce)
	})
}

function injectPreviewRuntime(document, config) {
	const html = findElement(document, 'html')
	const head = findElement(document, 'head')
	const body = findElement(document, 'body')
	if (!html || !head || !body) return
	const base = createElement('base', [['href', config.assetBase]])
	const style = createElement('style')
	appendText(
		style,
		'[data-tldraw-html-active]{outline:2px solid #2f80ed!important;outline-offset:2px!important;cursor:crosshair!important}[data-tldraw-html-keyboard-target]:focus-visible{outline:2px solid #2f80ed!important;outline-offset:2px!important}'
	)
	const script = createElement('script', [['nonce', config.nonce]])
	appendText(
		script,
		previewBridgeSource(
			config.documentRef,
			config.revision,
			config.parentOrigin
		)
	)
	prependChild(head, style)
	prependChild(head, base)
	appendChild(body, script)
}

function previewBridgeSource(documentRef, revision, parentOrigin) {
	const config = JSON.stringify({
		documentRef,
		revision,
		parentOrigin,
		postMessageTarget: parentOrigin === 'file://' ? '*' : parentOrigin,
	})
	return `(()=>{'use strict';const c=${config};let a=null,t=0,m='inspect';const clean=v=>String(v??'').replace(/\\s+/g,' ').trim().slice(0,160);const pick=e=>{const n=e&&e.nodeType===1?e:null;if(!n||!n.closest)return null;const hit=n.closest('button,a,input,select,textarea,[role],[aria-label],[data-testid],[data-component]')||n;const owner=hit.closest('[data-tldraw-html-ref]');return owner?{hit,owner}:null};const label=n=>clean(n.getAttribute('aria-label')||n.getAttribute('title')||n.innerText||n.value||n.getAttribute('placeholder')||n.tagName);const activate=n=>{if(!n||n===a)return;if(a)a.removeAttribute('data-tldraw-html-active');a=n;a.setAttribute('data-tldraw-html-active','')};const say=(phase,p)=>{const r=p&&p.owner.getAttribute('data-tldraw-html-ref');if(!r||r.length>${MAX_TARGET_REF_CHARS})return;const s=label(p.hit)||clean(p.owner.getAttribute('data-tldraw-html-summary')||p.owner.tagName);parent.postMessage({type:'html-mockup:selection',phase,documentRef:c.documentRef,revision:c.revision,targetRef:r,summary:s},c.postMessageTarget)};const enableKeys=()=>{for(const n of document.querySelectorAll('[data-tldraw-html-ref]')){if(n.tabIndex<0&&!n.hasAttribute('data-tldraw-html-keyboard-target')){const v=n.getAttribute('tabindex');n.setAttribute('data-tldraw-html-keyboard-target',v===null?'':v);n.tabIndex=0}}};const disableKeys=()=>{for(const n of document.querySelectorAll('[data-tldraw-html-keyboard-target]')){const v=n.getAttribute('data-tldraw-html-keyboard-target');if(v==='')n.removeAttribute('tabindex');else n.setAttribute('tabindex',v);n.removeAttribute('data-tldraw-html-keyboard-target')}};const mode=v=>{m=v==='preview'?'preview':'inspect';document.documentElement.setAttribute('data-tldraw-html-mode',m);if(m==='inspect')enableKeys();else{clearTimeout(t);if(a)a.removeAttribute('data-tldraw-html-active');a=null;disableKeys()}};addEventListener('message',e=>{if(e.source!==parent)return;const d=e.data;if(!d||d.type!=='html-mockup:mode'||d.documentRef!==c.documentRef||d.revision!==c.revision)return;mode(d.mode)},false);mode('inspect');addEventListener('mouseover',e=>{if(m!=='inspect')return;const p=pick(e.target);if(!p||p.hit===a)return;activate(p.hit);clearTimeout(t);t=setTimeout(()=>say('hover',p),50)},true);addEventListener('focusin',e=>{if(m!=='inspect')return;const p=pick(e.target);if(!p)return;activate(p.hit);say('hover',p)},true);addEventListener('click',e=>{if(m!=='inspect')return;const p=pick(e.target);if(!p)return;e.preventDefault();e.stopPropagation();activate(p.hit);say('click',p)},true);addEventListener('keydown',e=>{if(m!=='inspect'||(e.key!=='Enter'&&e.key!==' '))return;const p=pick(e.target);if(!p)return;e.preventDefault();e.stopPropagation();activate(p.hit);say('click',p)},true)})();`
}

function previewSelectionSummary(node) {
	const name = accessibleName(node)
	if (name) return name.slice(0, MAX_NAME_CHARS)
	const role = roleFor(node)
	return (role === 'generic' ? node.tagName : role).slice(0, MAX_NAME_CHARS)
}

function documentTitle(document) {
	const title = findElement(document, 'title')
	return title ? textContent(title).slice(0, MAX_NAME_CHARS) : ''
}

function isSemanticNode(node) {
	if (SEMANTIC_TAGS.has(node.tagName)) return true
	if (getAttribute(node, 'role') || getAttribute(node, 'aria-label')) return true
	return Boolean(
		getAttribute(node, 'id') ||
			getAttribute(node, 'data-component') ||
			getAttribute(node, 'data-testid')
	)
}

function roleFor(node) {
	const explicitRole = getAttribute(node, 'role')
	if (explicitRole) return explicitRole.split(/\s+/)[0].slice(0, 48)
	if (/^h[1-6]$/.test(node.tagName)) return 'heading'
	if (node.tagName === 'a' && getAttribute(node, 'href')) return 'link'
	if (node.tagName === 'input') {
		const type = (getAttribute(node, 'type') || 'text').toLowerCase()
		if (type === 'checkbox') return 'checkbox'
		if (type === 'radio') return 'radio'
		if (type === 'button' || type === 'submit' || type === 'reset') return 'button'
		if (type === 'range') return 'slider'
		return 'textbox'
	}
	return LANDMARK_ROLES.get(node.tagName) ?? TAG_ROLES.get(node.tagName) ?? 'generic'
}

function accessibleName(node) {
	for (const name of ['aria-label', 'alt', 'title', 'placeholder']) {
		const value = getAttribute(node, name)
		if (value) return normalizeWhitespace(value)
	}
	if (TEXT_NAMED_TAGS.has(node.tagName)) {
		return textContent(node).slice(0, MAX_NAME_CHARS)
	}
	const component = getAttribute(node, 'data-component')
	if (component) return normalizeWhitespace(component).slice(0, MAX_NAME_CHARS)
	const id = getAttribute(node, 'id')
	return id ? `#${id}`.slice(0, MAX_NAME_CHARS) : ''
}

function textContent(node) {
	let result = ''
	const stack = [...childCollections(node).flat()].reverse()
	while (stack.length && result.length < 240) {
		const candidate = stack.pop()
		if (candidate.nodeName === '#text') {
			result += ` ${candidate.value ?? ''}`
			continue
		}
		if (isElement(candidate) && isExcludedContextSubtree(candidate)) continue
		const children = childCollections(candidate).flat()
		for (let index = children.length - 1; index >= 0; index -= 1) {
			stack.push(children[index])
		}
	}
	return normalizeWhitespace(result).slice(0, 240)
}

function isExcludedContextSubtree(node) {
	if (!isElement(node)) return false
	if (NON_CONTEXT_TAGS.has(node.tagName.toLowerCase())) return true
	if (getAttribute(node, 'hidden') != null) return true
	return getAttribute(node, 'aria-hidden')?.toLowerCase() === 'true'
}

function isInExcludedContextSubtree(node) {
	let current = node
	while (current) {
		if (isExcludedContextSubtree(current)) return true
		current = current.parentNode
	}
	return false
}

function issueContextGrant(contextGrants, binding) {
	pruneContextGrants(contextGrants)
	while (contextGrants.size >= MAX_CONTEXT_GRANTS) {
		const oldest = contextGrants.keys().next().value
		if (oldest === undefined) break
		contextGrants.delete(oldest)
	}
	const contextRef = `hc_${randomBytes(18).toString('base64url')}`
	const grant = {
		...binding,
		contextRef,
		expiresAt: Date.now() + CONTEXT_GRANT_TTL_MS,
	}
	contextGrants.set(contextRef, grant)
	return grant
}

function issuePreviewTicket(previewTickets, binding) {
	prunePreviewTickets(previewTickets)
	while (previewTickets.size >= MAX_PREVIEW_TICKETS) {
		const oldest = previewTickets.keys().next().value
		if (oldest === undefined) break
		previewTickets.delete(oldest)
	}
	const ticket = `hp_${randomBytes(24).toString('base64url')}`
	const grant = {
		...binding,
		ticket,
		expiresAt: Date.now() + PREVIEW_TICKET_TTL_MS,
	}
	previewTickets.set(ticket, grant)
	return grant
}

function authorizePreviewTicket(
	previewTickets,
	{ ticket, documentRef }
) {
	prunePreviewTickets(previewTickets)
	if (typeof ticket !== 'string' || !PREVIEW_TICKET_PATTERN.test(ticket)) {
		throw httpError(
			401,
			'preview_ticket_required',
			'A valid scoped Local HTML Mockup preview ticket is required.'
		)
	}
	const grant = previewTickets.get(ticket)
	if (!grant) {
		throw httpError(
			401,
			'preview_ticket_expired',
			'The scoped Local HTML Mockup preview ticket expired.'
		)
	}
	if (grant.documentRef !== documentRef) {
		throw httpError(
			403,
			'preview_ticket_scope_violation',
			'The preview ticket does not authorize this Local HTML Mockup.'
		)
	}
	return grant
}

function prunePreviewTickets(previewTickets) {
	const now = Date.now()
	for (const [ticket, grant] of previewTickets) {
		if (grant.expiresAt > now) continue
		previewTickets.delete(ticket)
	}
}

function authorizeContextGrant(
	contextGrants,
	{
		contextRef,
		documentRef,
		revision,
		targetRef,
		residentCapabilityId,
		parentOrigin,
	}
) {
	pruneContextGrants(contextGrants)
	const grant = contextGrants.get(contextRef)
	if (!grant) {
		throw httpError(
			409,
			'context_expired',
			'The Local HTML Mockup context expired. Inspect the selected target again.'
		)
	}
	if (
		grant.documentRef !== documentRef ||
		grant.revision !== revision ||
		grant.targetRef !== targetRef ||
		grant.residentCapabilityId !== residentCapabilityId ||
		grant.parentOrigin !== parentOrigin
	) {
		throw httpError(
			403,
			'scope_violation',
			'The Local HTML Mockup context does not authorize this target or revision.'
		)
	}
	return grant
}

function pruneContextGrants(contextGrants) {
	const now = Date.now()
	for (const [contextRef, grant] of contextGrants) {
		if (grant.expiresAt > now) continue
		contextGrants.delete(contextRef)
	}
}

async function scanRegistry(roots) {
	const entries = []
	let scannedEntries = 0
	let scanTruncated = false
	for (const root of roots) {
		const pending = [root.realPath]
		while (pending.length) {
			if (
				scannedEntries >= MAX_SCAN_ENTRIES ||
				entries.length >= MAX_REGISTRY_FILES
			) {
				scanTruncated = true
				break
			}
			const directory = pending.pop()
			let directoryEntries
			try {
				directoryEntries = await readdir(directory, { withFileTypes: true })
			} catch {
				continue
			}
			directoryEntries.sort((left, right) => left.name.localeCompare(right.name))
			for (let index = directoryEntries.length - 1; index >= 0; index -= 1) {
				const item = directoryEntries[index]
				scannedEntries += 1
				if (item.isDirectory()) {
					if (!SKIPPED_DIRECTORIES.has(item.name)) pending.push(join(directory, item.name))
					continue
				}
				if (!item.isFile() || !HTML_EXTENSIONS.has(extname(item.name).toLowerCase())) continue
				const filePath = join(directory, item.name)
				let metadata
				try {
					metadata = await stat(filePath)
				} catch {
					continue
				}
				if (!metadata.isFile() || metadata.size > MAX_FILE_BYTES) continue
				const entry = await makeRegistryEntry(root, filePath)
				if (entry) entries.push(entry)
			}
		}
		if (scanTruncated) break
	}
	entries.sort((left, right) => {
		const rootOrder = left.root.order - right.root.order
		return rootOrder || left.relativePath.localeCompare(right.relativePath)
	})
	const byRef = new Map(entries.map((entry) => [entry.documentRef, entry]))
	return { entries, byRef, scanTruncated }
}

async function makeRegistryEntry(root, filePath) {
	const fileRealPath = await realpath(filePath)
	if (!isPathInside(root.realPath, fileRealPath)) return null
	const fileMetadata = await lstat(fileRealPath)
	if (fileMetadata.isSymbolicLink() || !fileMetadata.isFile()) return null
	const relativePath = relative(root.realPath, fileRealPath).split(sep).join('/')
	return {
		documentRef: documentRefFor(fileRealPath),
		name: basename(fileRealPath),
		relativePath,
		root,
		realPath: fileRealPath,
		byteSize: fileMetadata.size,
		device: fileMetadata.dev,
		inode: fileMetadata.ino,
	}
}

function publicDocumentMetadata(entry) {
	return {
		documentRef: entry.documentRef,
		name: entry.name,
		relativePath: entry.relativePath,
		rootLabel: entry.root.label,
		byteSize: entry.byteSize,
	}
}

async function readDocument(entry) {
	let fileRealPath
	try {
		fileRealPath = await realpath(entry.realPath)
	} catch {
		throw httpError(404, 'document_not_found', 'The HTML mockup no longer exists.')
	}
	if (
		fileRealPath !== entry.realPath ||
		!isPathInside(entry.root.realPath, fileRealPath)
	) {
		throw httpError(409, 'document_binding_changed', 'The document binding changed.')
	}
	const buffer = await readBoundRegularFile({
		filePath: fileRealPath,
		expectedDevice: entry.device,
		expectedInode: entry.inode,
		maxBytes: MAX_FILE_BYTES,
		bindingError: httpError(
			409,
			'document_binding_changed',
			'The document binding changed while it was being opened.'
		),
		tooLargeError: httpError(
			413,
			'document_too_large',
			'The HTML mockup exceeds the 4 MiB limit.'
		),
	})
	return {
		buffer,
		source: buffer.toString('utf8'),
		revision: revisionFor(buffer),
	}
}

async function readBoundRegularFile({
	filePath,
	expectedDevice,
	expectedInode,
	maxBytes,
	bindingError,
	tooLargeError,
}) {
	if (!Number.isInteger(fsConstants.O_NOFOLLOW)) {
		throw httpError(
			503,
			'nofollow_unavailable',
			'This platform cannot safely open Local HTML Mockup files.'
		)
	}
	let handle
	try {
		handle = await openFile(
			filePath,
			fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW
		)
		const metadata = await handle.stat()
		if (
			!metadata.isFile() ||
			metadata.dev !== expectedDevice ||
			metadata.ino !== expectedInode
		) {
			throw bindingError
		}
		if (metadata.size > maxBytes) throw tooLargeError
		const buffer = await handle.readFile()
		if (buffer.byteLength > maxBytes) throw tooLargeError
		const afterRead = await handle.stat()
		if (
			afterRead.dev !== metadata.dev ||
			afterRead.ino !== metadata.ino
		) {
			throw bindingError
		}
		return buffer
	} catch (error) {
		if (error?.statusCode) throw error
		if (error?.code === 'ELOOP') throw bindingError
		throw error
	} finally {
		await handle?.close()
	}
}

export const htmlMockupServiceTestInternals = Object.freeze({
	readBoundRegularFile,
})

async function atomicWrite(destination, content) {
	const temporary = join(
		dirname(destination),
		`.${basename(destination)}.tldraw-tmp-${randomBytes(8).toString('hex')}`
	)
	await writeFile(temporary, content, { flag: 'wx' })
	try {
		await rename(temporary, destination)
	} catch (error) {
		try {
			await unlink(temporary)
		} catch {
			// Best-effort cleanup of a same-directory temporary file.
		}
		throw error
	}
}

async function ensureContainedDirectory(rootRealPath, directoryPath) {
	try {
		await mkdir(directoryPath)
	} catch (error) {
		if (error?.code !== 'EEXIST') throw error
	}
	const metadata = await lstat(directoryPath)
	if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
		throw httpError(
			403,
			'import_directory_unsafe',
			'The managed HTML mockup import directory is unsafe.'
		)
	}
	const directoryRealPath = await realpath(directoryPath)
	if (!isPathInside(rootRealPath, directoryRealPath)) {
		throw httpError(
			403,
			'import_directory_outside_root',
			'The managed HTML mockup import directory escaped the registered root.'
		)
	}
	return directoryRealPath
}

function parseConfiguredRoots(value, cwd) {
	if (typeof value !== 'string' || !value.trim()) return []
	return value
		.split(delimiter)
		.map((item) => item.trim())
		.filter(Boolean)
		.map((item) => resolve(cwd, item))
}

function parseConfiguredParentOrigins(value) {
	if (typeof value !== 'string' || !value.trim()) return []
	return value
		.split(',')
		.map((item) => item.trim())
		.filter(Boolean)
}

function resolvePreviewParentOrigins(configuredOrigins) {
	const origins = new Set(DEFAULT_PREVIEW_PARENT_ORIGINS)
	for (const value of configuredOrigins) {
		let parsed
		try {
			parsed = new URL(value)
		} catch {
			throw httpError(
				500,
				'invalid_preview_parent_origin',
				'The configured Local HTML Mockup parent origin is invalid.'
			)
		}
		if (
			(parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
			parsed.origin !== value ||
			parsed.username ||
			parsed.password
		) {
			throw httpError(
				500,
				'invalid_preview_parent_origin',
				'The configured Local HTML Mockup parent origin must be an exact HTTP origin.'
			)
		}
		origins.add(parsed.origin)
	}
	return origins
}

function frameAncestorForParentOrigin(parentOrigin) {
	return parentOrigin === 'file://' ? 'file:' : parentOrigin
}

async function resolveRoots(paths) {
	const roots = []
	const seen = new Set()
	for (const rootPath of paths) {
		try {
			const rootRealPath = await realpath(resolve(rootPath))
			if (seen.has(rootRealPath) || !(await stat(rootRealPath)).isDirectory()) continue
			seen.add(rootRealPath)
			roots.push({
				realPath: rootRealPath,
				label: basename(rootRealPath) || 'root',
				order: roots.length,
			})
		} catch {
			// A missing configured root grants no authority and is ignored.
		}
	}
	return roots
}

function matchDocumentRoute(pathname) {
	const route = normalizeRoutePath(pathname)
	const direct = /^\/html-mockups\/([A-Za-z0-9_-]{8,64})\/(snapshot|preview|preview-ticket|patch)$/.exec(
		route
	)
	if (direct) return { documentRef: direct[1], action: direct[2] }
	const asset =
		/^\/html-mockups\/([A-Za-z0-9_-]{8,64})\/assets\/(hp_[A-Za-z0-9_-]{24,128})\/(.+)$/.exec(
			route
		)
	if (asset) {
		return {
			documentRef: asset[1],
			action: 'assets',
			previewTicket: asset[2],
			assetPath: asset[3],
		}
	}
	return null
}

function validateImportName(value) {
	if (typeof value !== 'string' || !value || value.length > 180) {
		throw httpError(400, 'invalid_import_name', 'A short HTML filename is required.')
	}
	if (
		value !== basename(value) ||
		value.includes('/') ||
		value.includes('\\') ||
		/[\0-\x1f\x7f]/.test(value)
	) {
		throw httpError(400, 'invalid_import_name', 'The import name must not contain a path.')
	}
	if (!HTML_EXTENSIONS.has(extname(value).toLowerCase())) {
		throw httpError(415, 'invalid_import_extension', 'The import must use .html or .htm.')
	}
	return value
}

function normalizeTargetRef(value) {
	if (value == null || value === '') return null
	if (
		typeof value !== 'string' ||
		value.length > MAX_TARGET_REF_CHARS ||
		!/^he_[A-Za-z0-9_-]{8,64}$/.test(value)
	) {
		throw httpError(400, 'invalid_target_ref', 'The target reference is invalid.')
	}
	return value
}

function normalizeContextRef(value) {
	if (value == null || value === '') return null
	if (
		typeof value !== 'string' ||
		!/^hc_[A-Za-z0-9_-]{16,64}$/.test(value)
	) {
		throw httpError(400, 'invalid_context_ref', 'The context reference is invalid.')
	}
	return value
}

function normalizeRoutePath(pathname) {
	return pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
}

function normalizeWhitespace(value) {
	return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function readBoundedInteger(value, fallback, minimum, maximum) {
	if (value == null || value === '') return fallback
	const parsed = Number(value)
	if (!Number.isSafeInteger(parsed)) return fallback
	return Math.min(maximum, Math.max(minimum, parsed))
}

function normalizeUrlScheme(value) {
	return String(value ?? '')
		.replace(/[\u0000-\u0020]+/g, '')
		.toLowerCase()
}

function documentRefFor(fileRealPath) {
	return `hd_${createHash('sha256').update(fileRealPath).digest('base64url').slice(0, 20)}`
}

function revisionFor(buffer) {
	return `sha256:${createHash('sha256').update(buffer).digest('hex')}`
}

function isPathInside(root, candidate) {
	const child = relative(root, candidate)
	return child === '' || (!child.startsWith(`..${sep}`) && child !== '..' && !isAbsolute(child))
}

function parseJson(source) {
	try {
		return JSON.parse(source)
	} catch {
		throw httpError(400, 'invalid_json', 'The request body must be valid JSON.')
	}
}

function httpError(statusCode, code, message) {
	const error = new Error(message)
	error.statusCode = statusCode
	error.code = code
	return error
}

function setNoStore(response) {
	response.setHeader('Cache-Control', 'no-store')
}

function sendJson(response, send, status, body) {
	response.setHeader('Content-Type', 'application/json; charset=utf-8')
	send(response, status, JSON.stringify(body))
	return true
}

function isElement(node) {
	return Boolean(node && typeof node.tagName === 'string')
}

function getAttribute(node, name) {
	const expected = name.toLowerCase()
	const attribute = (node.attrs ?? []).find(
		(candidate) => qualifiedAttributeName(candidate) === expected
	)
	return attribute?.value
}

function setAttribute(node, name, value) {
	const expected = name.toLowerCase()
	const existing = (node.attrs ?? []).find(
		(candidate) => qualifiedAttributeName(candidate) === expected
	)
	if (existing) existing.value = value
	else {
		node.attrs ??= []
		node.attrs.push({ name: expected, value })
	}
}

function qualifiedAttributeName(attribute) {
	return `${attribute.prefix ? `${attribute.prefix}:` : ''}${attribute.name}`.toLowerCase()
}

function childCollections(node) {
	const collections = []
	if (Array.isArray(node.childNodes)) collections.push(node.childNodes)
	if (node.content && Array.isArray(node.content.childNodes)) collections.push(node.content.childNodes)
	return collections
}

function walkNodes(root, visitor) {
	const stack = [root]
	while (stack.length) {
		const node = stack.pop()
		visitor(node)
		const children = childCollections(node).flat()
		for (let index = children.length - 1; index >= 0; index -= 1) stack.push(children[index])
	}
}

function walkContextNodes(root, visitor) {
	const stack = [root]
	while (stack.length) {
		const node = stack.pop()
		if (isElement(node) && isExcludedContextSubtree(node)) continue
		visitor(node)
		const children = childCollections(node).flat()
		for (let index = children.length - 1; index >= 0; index -= 1) stack.push(children[index])
	}
}

function findElement(root, tagName) {
	let result
	walkNodes(root, (node) => {
		if (!result && isElement(node) && node.tagName === tagName) result = node
	})
	return result
}

function nodeDepth(node) {
	let depth = 0
	let current = node?.parentNode
	while (current) {
		depth += 1
		current = current.parentNode
	}
	return depth
}

function nearestParentRef(node, refByNode) {
	let current = node?.parentNode
	while (current) {
		const ref = refByNode.get(current)
		if (ref) return ref
		current = current.parentNode
	}
	return undefined
}

function directElementChildren(node) {
	return childCollections(node).flat().filter(isElement)
}

function isAttached(node, document) {
	let current = node
	while (current?.parentNode) current = current.parentNode
	return current === document
}

function createElement(tagName, attributes = []) {
	return {
		nodeName: tagName,
		tagName,
		attrs: attributes.map(([name, value]) => ({ name, value })),
		namespaceURI: 'http://www.w3.org/1999/xhtml',
		childNodes: [],
		parentNode: null,
	}
}

function appendText(parent, value) {
	const child = { nodeName: '#text', value, parentNode: parent }
	parent.childNodes.push(child)
}

function appendChild(parent, child) {
	child.parentNode = parent
	parent.childNodes.push(child)
}

function prependChild(parent, child) {
	child.parentNode = parent
	parent.childNodes.unshift(child)
}
