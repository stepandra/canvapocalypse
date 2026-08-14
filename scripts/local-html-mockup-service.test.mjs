import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import {
	mkdtemp,
	mkdir,
	readFile,
	readdir,
	rename,
	stat,
	symlink,
	writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
	createLocalHtmlMockupService,
	htmlMockupServiceTestInternals,
} from './local-html-mockup-service.mjs'

const TEST_RESIDENT_CAPABILITY = `hr_${'A'.repeat(43)}`

test('registry, bounded snapshots, safe preview, and contained assets', async (t) => {
	const root = await mkdtemp(join(tmpdir(), 'canvapocalypse-html-'))
	await mkdir(join(root, 'screens'), { recursive: true })
	await mkdir(join(root, 'node_modules', 'ignored'), { recursive: true })
	await writeFile(join(root, 'node_modules', 'ignored', 'hidden.html'), '<p>hidden</p>')
	await writeFile(join(root, 'oversize.html'), Buffer.alloc(4 * 1024 * 1024 + 1, 65))
	await writeFile(join(root, 'screens', 'app.css'), 'body { color: teal }')
	await writeFile(
		join(root, 'screens', 'active.svg'),
		'<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(2)</script></svg>'
	)
	await writeFile(
		join(root, 'screens', 'index.html'),
		`<!doctype html>
<html>
<head>
	<title>Candidate cockpit</title>
	<meta http-equiv="refresh" content="0;https://example.invalid">
	<meta http-equiv="content-security-policy" content="script-src 'unsafe-inline'">
	<link rel="stylesheet" href="app.css">
	<script src="https://example.invalid/remote.js"></script>
	<script>window.LOCAL_INTERACTION_BOOT = true</script>
	<style>.STYLE_SECRET_MUST_NOT_REACH_AGENT { color: red }</style>
</head>
<body>
	<main id="app">
		<h1>Candidate cockpit</h1>
		<section hidden><h2>HIDDEN_SECRET_MUST_NOT_REACH_AGENT</h2></section>
		<section aria-hidden="true"><h2>ARIA_SECRET_MUST_NOT_REACH_AGENT</h2></section>
		<section id="hero" class="hero primary">
			<button aria-label="Approve candidate" onclick="window.evil()">Approve</button>
			<button id="leaky-parent"><span>Visible picker label</span><span hidden>PICKER_HIDDEN_SECRET</span><span aria-hidden="true">PICKER_ARIA_SECRET</span></button>
		</section>
		<iframe src="https://example.invalid"></iframe>
	</main>
</body>
</html>`
	)
	const outside = await mkdtemp(join(tmpdir(), 'canvapocalypse-outside-'))
	await writeFile(join(outside, 'escape.png'), 'outside')
	await symlink(join(outside, 'escape.png'), join(root, 'escape.png'))
	await writeFile(join(root, '.env'), 'LOCAL_SECRET=must-not-leak')
	await symlink(join(root, '.env'), join(root, 'leak.png'))

	const host = await startService(t, root)
	const listResponse = await residentFetch(`${host}/html-mockups`)
	assert.equal(listResponse.status, 200)
	assert.equal(listResponse.headers.get('cache-control'), 'no-store')
	const listing = await listResponse.json()
	assert.equal(listing.documents.length, 1)
	assert.equal(listing.documents[0].relativePath, 'screens/index.html')
	assert.equal(listing.limits.maxDocuments, 200)
	assert.equal(listing.limits.maxFileBytes, 4 * 1024 * 1024)
	assert.doesNotMatch(JSON.stringify(listing), /LOCAL_INTERACTION_BOOT/)

	const documentRef = listing.documents[0].documentRef
	const snapshotResponse = await residentFetch(`${host}/html-mockups/${documentRef}/snapshot`)
	assert.equal(snapshotResponse.status, 200)
	const snapshot = await snapshotResponse.json()
	assert.match(snapshot.revision, /^sha256:[a-f0-9]{64}$/)
	assert(snapshot.bytes > 0)
	assert.equal(snapshot.title, 'Candidate cockpit')
	assert(snapshot.nodes.length > 0)
	assert(snapshot.nodes.length <= 200)
	assert(snapshot.charCount <= 12_000)
	assert.doesNotMatch(
		JSON.stringify(snapshot),
		/LOCAL_INTERACTION_BOOT|STYLE_SECRET_MUST_NOT_REACH_AGENT|HIDDEN_SECRET_MUST_NOT_REACH_AGENT|ARIA_SECRET_MUST_NOT_REACH_AGENT/
	)
	const button = snapshot.nodes.find((node) => node.role === 'button')
	assert(button)
	assert.equal(button.name, 'Approve candidate')
	assert.match(button.ref, /^he_[A-Za-z0-9_-]+$/)
	assert.equal(typeof button.childCount, 'number')

	const targetResponse = await residentFetch(
		`${host}/html-mockups/${documentRef}/snapshot?targetRef=${button.ref}&parentOrigin=${encodeURIComponent('file://')}`,
		{ headers: { origin: 'http://localhost:5173' } }
	)
	assert.equal(targetResponse.status, 200)
	const targetSnapshot = await targetResponse.json()
	assert.equal(targetSnapshot.scope.targetRef, button.ref)
	assert.equal(targetSnapshot.target.ref, button.ref)
	assert.equal(targetSnapshot.nodes[0].ref, button.ref)
	assert(targetSnapshot.ancestors.some((node) => node.tag === 'main'))
	assert.match(targetSnapshot.contextRef, /^hc_[A-Za-z0-9_-]+$/)
	assert(Number.isFinite(Date.parse(targetSnapshot.contextExpiresAt)))
	assert.equal('contextRef' in snapshot, false)

	const forbiddenPreview = await residentFetch(
		`${host}/html-mockups/${documentRef}/preview`
	)
	assert.equal(forbiddenPreview.status, 401)
	assert.equal(
		(await forbiddenPreview.json()).error,
		'preview_ticket_required'
	)
	const previewTicket = await issuePreviewTicket(
		host,
		documentRef,
		snapshot.revision,
		'http://localhost:5173'
	)
	const previewResponse = await residentFetch(
		`${host}/html-mockups/${documentRef}/preview?revision=${encodeURIComponent(snapshot.revision)}&ticket=${previewTicket}`
	)
	assert.equal(previewResponse.status, 200)
	assert.equal(previewResponse.headers.get('cache-control'), 'no-store')
	const csp = previewResponse.headers.get('content-security-policy')
	assert.match(csp, /script-src 'nonce-[^']+'/)
	assert.doesNotMatch(csp, /script-src[^;]*unsafe-inline/)
	assert.match(csp, /connect-src 'none'/)
	assert.match(csp, /frame-ancestors http:\/\/localhost:5173/)
	const preview = await previewResponse.text()
	assert.match(
		preview,
		/<script nonce="[^"]+">window\.LOCAL_INTERACTION_BOOT = true<\/script>/
	)
	assert.doesNotMatch(preview, /remote\.js|window\.evil|example\.invalid/)
	assert.doesNotMatch(preview, /<iframe/i)
	assert.match(preview, /data-tldraw-html-ref="he_[A-Za-z0-9_-]+"/)
	const leakyParentOpeningTag = preview.match(
		/<button[^>]*id="leaky-parent"[^>]*>/
	)?.[0]
	assert(leakyParentOpeningTag)
	assert.match(
		leakyParentOpeningTag,
		/data-tldraw-html-summary="Visible picker label"/
	)
	assert.doesNotMatch(
		leakyParentOpeningTag,
		/PICKER_HIDDEN_SECRET|PICKER_ARIA_SECRET/
	)
	assert.match(preview, /type:'html-mockup:selection'/)
	assert.doesNotMatch(preview, /\|\|e\.textContent/)
	assert.match(preview, /const owner=hit\.closest\('\[data-tldraw-html-ref\]'\)/)
	assert.match(preview, /n\.innerText/)
	assert.match(preview, /activate\(p\.hit\)/)
	assert.match(preview, /data-tldraw-html-keyboard-target/)
	assert.match(preview, /addEventListener\('focusin'/)
	assert.match(preview, /addEventListener\('keydown'/)
	assert.match(preview, /type!=='html-mockup:mode'/)
	assert.match(preview, /if\(m!=='inspect'\)return/)
	assert.match(preview, /e\.source!==parent/)
	assert.match(preview, /e\.key!=='Enter'&&e\.key!==' '/)
	assert.match(preview, /"parentOrigin":"http:\/\/localhost:5173"/)
	assert.match(preview, /},c\.postMessageTarget\)/)
	assert.doesNotMatch(preview, /postMessage\([^)]*,['"]\*['"]\)/)

	const offlinePreviewTicket = await issuePreviewTicket(
		host,
		documentRef,
		snapshot.revision,
		'null'
	)
	const offlinePreviewResponse = await residentFetch(
		`${host}/html-mockups/${documentRef}/preview?revision=${encodeURIComponent(snapshot.revision)}&ticket=${offlinePreviewTicket}`
	)
	assert.equal(offlinePreviewResponse.status, 200)
	assert.match(
		offlinePreviewResponse.headers.get('content-security-policy'),
		/frame-ancestors file:/
	)
	const offlinePreview = await offlinePreviewResponse.text()
	assert.match(offlinePreview, /"parentOrigin":"file:\/\/"/)
	assert.match(offlinePreview, /"postMessageTarget":"\*"/)
	assert.match(
		preview,
		new RegExp(
			`<base href="/html-mockups/${documentRef}/assets/${previewTicket}/screens/">`
		)
	)

	const cssResponse = await residentFetch(
		`${host}/html-mockups/${documentRef}/assets/${previewTicket}/screens/app.css`
	)
	assert.equal(cssResponse.status, 200)
	assert.equal(cssResponse.headers.get('content-type'), 'text/css; charset=utf-8')
	assert.equal(await cssResponse.text(), 'body { color: teal }')

	const htmlAssetResponse = await residentFetch(
		`${host}/html-mockups/${documentRef}/assets/${previewTicket}/screens/index.html`
	)
	assert.equal(htmlAssetResponse.status, 415)
	const activeSvgResponse = await residentFetch(
		`${host}/html-mockups/${documentRef}/assets/${previewTicket}/screens/active.svg`
	)
	assert.equal(activeSvgResponse.status, 415)
	assert.doesNotMatch(await activeSvgResponse.text(), /alert\(/)
	const escapedAssetResponse = await residentFetch(
		`${host}/html-mockups/${documentRef}/assets/${previewTicket}/escape.png`
	)
	assert.equal(escapedAssetResponse.status, 403)
	const disguisedAssetResponse = await residentFetch(
		`${host}/html-mockups/${documentRef}/assets/${previewTicket}/leak.png`
	)
	assert.equal(disguisedAssetResponse.status, 403)
	assert.doesNotMatch(await disguisedAssetResponse.text(), /LOCAL_SECRET/)

	await writeFile(
		join(root, 'screens', 'index.html'),
		'<main><h1>Changed after preview ticket</h1></main>'
	)
	const staleAssetResponse = await residentFetch(
		`${host}/html-mockups/${documentRef}/assets/${previewTicket}/screens/app.css`
	)
	assert.equal(staleAssetResponse.status, 409)
	assert.equal((await staleAssetResponse.json()).error, 'revision_conflict')
})

test('origin null grants no authority while an exact HTTP workbench may bootstrap the resident capability', async (t) => {
	const root = await mkdtemp(join(tmpdir(), 'canvapocalypse-html-resident-'))
	await writeFile(join(root, 'screen.html'), '<main>Resident only</main>')
	const host = await startService(t, root)

	const opaqueBootstrap = await fetch(`${host}/html-mockups/session`, {
		method: 'POST',
		headers: { origin: 'null' },
	})
	assert.equal(opaqueBootstrap.status, 403)
	assert.equal(
		(await opaqueBootstrap.json()).error,
		'resident_bootstrap_forbidden'
	)

	const opaqueList = await fetch(`${host}/html-mockups`, {
		headers: { origin: 'null' },
	})
	assert.equal(opaqueList.status, 401)
	assert.equal(
		(await opaqueList.json()).error,
		'resident_capability_required'
	)

	const trustedBootstrap = await fetch(`${host}/html-mockups/session`, {
		method: 'POST',
		headers: { origin: 'http://localhost:5173' },
	})
	assert.equal(trustedBootstrap.status, 200)
	assert.deepEqual(await trustedBootstrap.json(), {
		capability: TEST_RESIDENT_CAPABILITY,
	})

	const wrongCapability = await fetch(`${host}/html-mockups`, {
		headers: {
			origin: 'null',
			'x-tldraw-html-capability': `hr_${'B'.repeat(43)}`,
		},
	})
	assert.equal(wrongCapability.status, 401)

	const provisionedOfflineList = await residentFetch(`${host}/html-mockups`, {
		headers: { origin: 'null' },
	})
	assert.equal(provisionedOfflineList.status, 200)

	const hostileOriginWithCapability = await residentFetch(
		`${host}/html-mockups`,
		{ headers: { origin: 'https://example.invalid' } }
	)
	assert.equal(hostileOriginWithCapability.status, 403)
	assert.equal(
		(await hostileOriginWithCapability.json()).error,
		'resident_origin_forbidden'
	)
})

test('descriptor-bound reads reject final and intermediate symlink swaps', async () => {
	const root = await mkdtemp(join(tmpdir(), 'canvapocalypse-html-nofollow-'))
	const safeDirectory = join(root, 'safe')
	const outsideDirectory = await mkdtemp(
		join(tmpdir(), 'canvapocalypse-html-nofollow-outside-')
	)
	await mkdir(safeDirectory)
	const sourcePath = join(safeDirectory, 'screen.html')
	await writeFile(sourcePath, '<main>safe</main>')
	const sourceMetadata = await stat(sourcePath)
	const finalBindingError = new Error('final binding changed')
	await rename(sourcePath, join(safeDirectory, 'screen-safe.html'))
	await writeFile(join(outsideDirectory, 'outside.html'), '<main>secret</main>')
	await symlink(join(outsideDirectory, 'outside.html'), sourcePath)

	await assert.rejects(
		htmlMockupServiceTestInternals.readBoundRegularFile({
			filePath: sourcePath,
			expectedDevice: sourceMetadata.dev,
			expectedInode: sourceMetadata.ino,
			maxBytes: 1024,
			bindingError: finalBindingError,
			tooLargeError: new Error('too large'),
		}),
		(error) => error === finalBindingError
	)

	const nestedRoot = join(root, 'nested')
	await mkdir(nestedRoot)
	const nestedPath = join(nestedRoot, 'asset.png')
	await writeFile(nestedPath, 'safe asset')
	const nestedMetadata = await stat(nestedPath)
	await writeFile(join(outsideDirectory, 'asset.png'), 'outside secret')
	await rename(nestedRoot, join(root, 'nested-safe'))
	await symlink(outsideDirectory, nestedRoot)
	const intermediateBindingError = new Error('intermediate binding changed')

	await assert.rejects(
		htmlMockupServiceTestInternals.readBoundRegularFile({
			filePath: nestedPath,
			expectedDevice: nestedMetadata.dev,
			expectedInode: nestedMetadata.ino,
			maxBytes: 1024,
			bindingError: intermediateBindingError,
			tooLargeError: new Error('too large'),
		}),
		(error) => error === intermediateBindingError
	)
})

test('snapshot output remains bounded for a very large semantic tree', async (t) => {
	const root = await mkdtemp(join(tmpdir(), 'canvapocalypse-html-bounds-'))
	const buttons = Array.from(
		{ length: 400 },
		(_, index) => `<button aria-label="Action ${index} ${'x'.repeat(100)}">Run</button>`
	).join('')
	await writeFile(join(root, 'many.html'), `<main>${buttons}</main>`)
	const host = await startService(t, root)
	const listing = await fetchJson(`${host}/html-mockups`)
	const snapshot = await fetchJson(
		`${host}/html-mockups/${listing.documents[0].documentRef}/snapshot`
	)
	assert(snapshot.nodes.length <= 200)
	assert(snapshot.charCount <= 12_000)
	assert.equal(snapshot.truncated, true)
	assert(JSON.stringify(snapshot).length < 14_000)
})

test('a 20,000-line mockup stays local while the agent snapshot remains bounded', async (t) => {
	const root = await mkdtemp(join(tmpdir(), 'canvapocalypse-html-20k-'))
	const lines = [
		'<main aria-label="Twenty thousand line mockup">',
		...Array.from(
			{ length: 19_998 },
			(_, index) =>
				`<div data-component="row-${index}">Candidate row ${index}</div>`
		),
		'</main>',
	]
	assert.equal(lines.length, 20_000)
	const source = lines.join('\n')
	assert(Buffer.byteLength(source, 'utf8') < 4 * 1024 * 1024)
	await writeFile(join(root, 'twenty-thousand-lines.html'), source)

	const host = await startService(t, root)
	const listing = await fetchJson(`${host}/html-mockups`)
	const snapshot = await fetchJson(
		`${host}/html-mockups/${listing.documents[0].documentRef}/snapshot`
	)

	assert.equal(snapshot.bytes, Buffer.byteLength(source, 'utf8'))
	assert(snapshot.nodes.length <= 200)
	assert(snapshot.charCount <= 12_000)
	assert.equal(snapshot.truncated, true)
	assert(JSON.stringify(snapshot).length < 14_000)
	assert.doesNotMatch(JSON.stringify(snapshot), /row-19997/)
})

test('list is capped at 200 documents', async (t) => {
	const root = await mkdtemp(join(tmpdir(), 'canvapocalypse-html-list-'))
	await Promise.all(
		Array.from({ length: 205 }, (_, index) =>
			writeFile(join(root, `screen-${String(index).padStart(3, '0')}.html`), '<p>screen</p>')
		)
	)
	const host = await startService(t, root)
	const listing = await fetchJson(`${host}/html-mockups`)
	assert.equal(listing.documents.length, 200)
	assert.equal(listing.truncated, true)
})

test('revision-guarded patches create variants only and leave the source untouched', async (t) => {
	const root = await mkdtemp(join(tmpdir(), 'canvapocalypse-html-patch-'))
	const sourcePath = join(root, 'screen.html')
	const original =
		'<!doctype html><html><body><main><section id="hero"><h1>Old</h1></section></main></body></html>'
	await writeFile(sourcePath, original)
	const host = await startService(t, root)
	const listing = await fetchJson(`${host}/html-mockups`)
	const documentRef = listing.documents[0].documentRef
	const snapshot = await fetchJson(`${host}/html-mockups/${documentRef}/snapshot`)
	const hero = snapshot.nodes.find((node) => node.name === '#hero')
	assert(hero)
	const authorizedSnapshot = await fetchJson(
		`${host}/html-mockups/${documentRef}/snapshot?targetRef=${hero.ref}`,
		{ headers: { origin: 'http://localhost:5173' } }
	)
	const contextRef = authorizedSnapshot.contextRef
	assert.match(contextRef, /^hc_[A-Za-z0-9_-]+$/)

	const directMutation = await residentFetch(
		`${host}/html-mockups/${documentRef}/patch`,
		{
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				expectedRevision: snapshot.revision,
				targetRef: hero.ref,
				contextRef,
				replacementHtml:
					'<section id="hero"><h1>Direct caller</h1></section>',
			}),
		}
	)
	assert.equal(directMutation.status, 403)
	assert.equal(
		(await directMutation.json()).error,
		'scope_violation'
	)

	const missingContext = await postJson(
		`${host}/html-mockups/${documentRef}/patch`,
		{
			expectedRevision: snapshot.revision,
			targetRef: hero.ref,
			replacementHtml: '<section id="hero"><h1>No context</h1></section>',
		}
	)
	assert.equal(missingContext.response.status, 403)
	assert.equal(missingContext.body.error, 'context_required')

	const conflict = await postJson(`${host}/html-mockups/${documentRef}/patch`, {
		expectedRevision: 'sha256_stale',
		targetRef: hero.ref,
		contextRef,
		replacementHtml: '<section id="hero"><h1>New</h1></section>',
	})
	assert.equal(conflict.response.status, 403)
	assert.equal(conflict.body.error, 'scope_violation')

	const exactLimitReplacement = replacementWithUtf8Bytes(32 * 1024)
	assert.equal(Buffer.byteLength(exactLimitReplacement, 'utf8'), 32 * 1024)
	const exactLimit = await postJson(
		`${host}/html-mockups/${documentRef}/patch`,
		{
			expectedRevision: snapshot.revision,
			targetRef: hero.ref,
			contextRef,
			replacementHtml: exactLimitReplacement,
		}
	)
	assert.equal(exactLimit.response.status, 201)

	const overLimitReplacement = replacementWithUtf8Bytes(32 * 1024 + 1)
	assert.equal(
		Buffer.byteLength(overLimitReplacement, 'utf8'),
		32 * 1024 + 1
	)
	const oversizedReplacement = await postJson(
		`${host}/html-mockups/${documentRef}/patch`,
		{
			expectedRevision: snapshot.revision,
			targetRef: hero.ref,
			contextRef,
			replacementHtml: overLimitReplacement,
		}
	)
	assert.equal(oversizedReplacement.response.status, 413)
	assert.equal(
		oversizedReplacement.body.error,
		'replacement_too_large'
	)

	for (const replacementHtml of [
		'<script>alert(1)</script>',
		'<section onclick="evil()">Unsafe</section>',
		'<a href=" \\n javascript:alert(1)">Unsafe</a>',
		'<iframe src="https://example.invalid"></iframe>',
		'<meta http-equiv="refresh" content="0;url=/">',
	]) {
		const unsafe = await postJson(`${host}/html-mockups/${documentRef}/patch`, {
			expectedRevision: snapshot.revision,
			targetRef: hero.ref,
			contextRef,
			replacementHtml,
		})
		assert.equal(unsafe.response.status, 400, replacementHtml)
		assert.equal(unsafe.body.error, 'unsafe_replacement_html')
	}

	const variant = await postJson(`${host}/html-mockups/${documentRef}/patch`, {
		expectedRevision: snapshot.revision,
		targetRef: hero.ref,
		contextRef,
		replacementHtml: '<section id="hero"><h1>Variant</h1></section>',
	})
	assert.equal(variant.response.status, 201)
	assert.equal(variant.body.mode, 'variant')
	assert.equal(variant.body.status, 'succeeded')
	assert.equal(variant.body.documentRef, documentRef)
	assert.equal(variant.body.targetRef, hero.ref)
	assert.equal(variant.body.beforeRevision, snapshot.revision)
	assert.match(variant.body.afterRevision, /^sha256:[a-f0-9]{64}$/)
	assert.equal(typeof variant.body.summary, 'string')
	assert.match(variant.body.variantDocumentRef, /^hd_[A-Za-z0-9_-]+$/)
	assert.equal(await readFile(sourcePath, 'utf8'), original)

	const offlineAuthorizedSnapshot = await fetchJson(
		`${host}/html-mockups/${documentRef}/snapshot?targetRef=${hero.ref}`,
		{ headers: { origin: 'null' } }
	)
	const offlineVariantResponse = await residentFetch(
		`${host}/html-mockups/${documentRef}/patch`,
		{
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				expectedRevision: snapshot.revision,
				targetRef: hero.ref,
				contextRef: offlineAuthorizedSnapshot.contextRef,
				replacementHtml:
					'<section id="hero"><h1>Offline variant</h1></section>',
			}),
		}
	)
	assert.equal(offlineVariantResponse.status, 201)
	assert.equal((await offlineVariantResponse.json()).status, 'succeeded')

	const mismatchedOfflineOrigin = await postJson(
		`${host}/html-mockups/${documentRef}/patch`,
		{
			expectedRevision: snapshot.revision,
			targetRef: hero.ref,
			contextRef: offlineAuthorizedSnapshot.contextRef,
			replacementHtml:
				'<section id="hero"><h1>Wrong resident</h1></section>',
		}
	)
	assert.equal(mismatchedOfflineOrigin.response.status, 403)
	assert.equal(
		mismatchedOfflineOrigin.body.error,
		'scope_violation'
	)
	assert.equal(await readFile(sourcePath, 'utf8'), original)

	const parallelVariants = await Promise.all(
		Array.from({ length: 10 }, () =>
			postJson(`${host}/html-mockups/${documentRef}/patch`, {
				expectedRevision: snapshot.revision,
				targetRef: hero.ref,
				contextRef,
				replacementHtml: '<section id="hero"><h1>Parallel variant</h1></section>',
				mode: 'variant',
			})
		)
	)
	assert(parallelVariants.every(({ response }) => response.status === 201))
	assert.equal(
		new Set(parallelVariants.map(({ body }) => body.receiptId)).size,
		10
	)
	assert.equal(
		new Set(parallelVariants.map(({ body }) => body.variantDocumentRef)).size,
		10
	)
	assert.equal(await readFile(sourcePath, 'utf8'), original)

	const variantFilesBeforeReplay = (await readdir(root)).filter((name) =>
		name.includes('.tldraw-variant-')
	)
	const idempotentPayload = {
		expectedRevision: snapshot.revision,
		targetRef: hero.ref,
		contextRef,
		replacementHtml: '<section id="hero"><h1>Retry-safe variant</h1></section>',
		mode: 'variant',
		idempotencyKey: 'variant-retry-1',
	}
	const idempotentVariants = await Promise.all(
		Array.from({ length: 5 }, () =>
			postJson(`${host}/html-mockups/${documentRef}/patch`, idempotentPayload)
		)
	)
	assert(idempotentVariants.every(({ response }) => response.status === 201))
	for (const replay of idempotentVariants.slice(1)) {
		assert.deepEqual(replay.body, idempotentVariants[0].body)
	}
	const sequentialReplay = await postJson(
		`${host}/html-mockups/${documentRef}/patch`,
		idempotentPayload
	)
	assert.equal(sequentialReplay.response.status, 201)
	assert.deepEqual(sequentialReplay.body, idempotentVariants[0].body)
	const variantFilesAfterReplay = (await readdir(root)).filter((name) =>
		name.includes('.tldraw-variant-')
	)
	assert.equal(variantFilesAfterReplay.length, variantFilesBeforeReplay.length + 1)

	const idempotencyConflict = await postJson(
		`${host}/html-mockups/${documentRef}/patch`,
		{
			...idempotentPayload,
			replacementHtml: '<section id="hero"><h1>Different request</h1></section>',
		}
	)
	assert.equal(idempotencyConflict.response.status, 409)
	assert.equal(idempotencyConflict.body.error, 'idempotency_conflict')

	const rejectedApply = await postJson(`${host}/html-mockups/${documentRef}/patch`, {
		expectedRevision: snapshot.revision,
		targetRef: hero.ref,
		contextRef,
		replacementHtml: '<section id="hero"><h1>Applied</h1></section>',
		mode: 'apply',
	})
	assert.equal(rejectedApply.response.status, 400)
	assert.equal(rejectedApply.body.error, 'invalid_patch_mode')

	await writeFile(
		sourcePath,
		original.replace('<h1>Old</h1>', '<h1>Drifted</h1>')
	)
	const revisionConflict = await postJson(
		`${host}/html-mockups/${documentRef}/patch`,
		{
			expectedRevision: snapshot.revision,
			targetRef: hero.ref,
			contextRef,
			replacementHtml: '<section id="hero"><h1>Stale</h1></section>',
			mode: 'variant',
		}
	)
	assert.equal(revisionConflict.response.status, 409)
	assert.equal(revisionConflict.body.error, 'revision_conflict')
	await writeFile(sourcePath, original)
	assert.equal(await readFile(sourcePath, 'utf8'), original)
})

test('import grants a managed copy only and rejects traversal, extension, and oversize input', async (t) => {
	const root = await mkdtemp(join(tmpdir(), 'canvapocalypse-html-import-'))
	const host = await startService(t, root)
	const imported = await postJson(`${host}/html-mockups/import`, {
		name: 'candidate.html',
		content: '<main><h1>Imported</h1></main>',
	})
	assert.equal(imported.response.status, 201)
	assert.match(imported.body.document.documentRef, /^hd_[A-Za-z0-9_-]+$/)
	assert.match(
		imported.body.document.relativePath,
		/^\.tldraw-html-mockups\/imports\/candidate-[a-f0-9]{10}\.html$/
	)
	assert.match(imported.body.document.revision, /^sha256:[a-f0-9]{64}$/)

	const listing = await fetchJson(`${host}/html-mockups`)
	assert.equal(listing.documents.length, 1)
	assert.equal(listing.documents[0].documentRef, imported.body.document.documentRef)

	for (const name of ['../escape.html', 'folder/screen.html', 'screen.txt']) {
		const rejected = await postJson(`${host}/html-mockups/import`, {
			name,
			content: '<p>no</p>',
		})
		assert(
			rejected.response.status === 400 || rejected.response.status === 415,
			`${name} should be rejected`
		)
	}

	const oversized = await postJson(`${host}/html-mockups/import`, {
		name: 'huge.html',
		content: 'x'.repeat(4 * 1024 * 1024 + 1),
	})
	assert.equal(oversized.response.status, 413)
	assert.equal(oversized.body.error, 'import_too_large')
})

test('import refuses a pre-existing managed-directory symlink that escapes the root', async (t) => {
	const root = await mkdtemp(join(tmpdir(), 'canvapocalypse-html-import-root-'))
	const outside = await mkdtemp(join(tmpdir(), 'canvapocalypse-html-import-outside-'))
	await symlink(outside, join(root, '.tldraw-html-mockups'))
	const host = await startService(t, root)
	const rejected = await postJson(`${host}/html-mockups/import`, {
		name: 'escape.html',
		content: '<main>must stay inside</main>',
	})
	assert.equal(rejected.response.status, 403)
	assert.equal(rejected.body.error, 'import_directory_unsafe')
	assert.deepEqual(await readdir(outside), [])
})

async function startService(t, root) {
	const service = createLocalHtmlMockupService({
		roots: [root],
		residentCapability: TEST_RESIDENT_CAPABILITY,
	})
	const server = createServer(async (request, response) => {
		const url = new URL(request.url ?? '/', 'http://127.0.0.1')
		const handled = await service(url, request, response, readBody, send)
		if (!handled) send(response, 404, 'Not found')
	})
	server.listen(0, '127.0.0.1')
	await new Promise((resolve) => server.once('listening', resolve))
	t.after(
		() =>
			new Promise((resolve) => {
				server.close(resolve)
			})
	)
	const address = server.address()
	assert(address && typeof address === 'object')
	return `http://127.0.0.1:${address.port}`
}

function readBody(request, maxBytes) {
	return new Promise((resolve, reject) => {
		const chunks = []
		let bytes = 0
		let tooLarge = false
		request.on('data', (chunk) => {
			if (tooLarge) return
			bytes += chunk.length
			if (bytes > maxBytes) {
				tooLarge = true
				const error = new Error('Request body is too large')
				error.statusCode = 413
				error.code = 'request_too_large'
				reject(error)
				return
			}
			chunks.push(chunk)
		})
		request.on('end', () => {
			if (!tooLarge) resolve(Buffer.concat(chunks).toString('utf8'))
		})
		request.on('error', reject)
	})
}

function send(response, status, body) {
	response.statusCode = status
	response.end(body)
}

async function fetchJson(url, init = {}) {
	const response = await residentFetch(url, init)
	assert.equal(response.status, 200)
	return response.json()
}

async function postJson(url, payload) {
	const response = await residentFetch(url, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			origin: 'http://localhost:5173',
		},
		body: JSON.stringify(payload),
	})
	return { response, body: await response.json() }
}

async function issuePreviewTicket(
	host,
	documentRef,
	revision,
	origin = 'http://localhost:5173'
) {
	const response = await residentFetch(
		`${host}/html-mockups/${documentRef}/preview-ticket`,
		{
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				origin,
			},
			body: JSON.stringify({ revision }),
		}
	)
	assert.equal(response.status, 201)
	const body = await response.json()
	assert.match(body.ticket, /^hp_[A-Za-z0-9_-]+$/)
	assert.equal(body.parentOrigin, origin === 'null' ? 'file://' : origin)
	return body.ticket
}

function replacementWithUtf8Bytes(byteLength) {
	const prefix = '<section>'
	const suffix = '</section>'
	return `${prefix}${'x'.repeat(
		byteLength - Buffer.byteLength(prefix) - Buffer.byteLength(suffix)
	)}${suffix}`
}

function residentFetch(url, init = {}) {
	const headers = new Headers(init.headers)
	headers.set(
		'x-tldraw-html-capability',
		TEST_RESIDENT_CAPABILITY
	)
	return fetch(url, { ...init, headers })
}
