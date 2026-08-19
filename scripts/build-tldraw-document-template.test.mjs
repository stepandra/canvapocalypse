import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import {
	DEFAULT_REGISTRY,
	buildDocumentTemplateScript,
	loadRegistry,
	main,
	validateRegistry,
} from './build-tldraw-document-template.mjs'

const scriptPath = fileURLToPath(
	new URL('./build-tldraw-document-template.mjs', import.meta.url)
)

const DEFAULT_TITLES = [
	'Architecture',
	'UI/UX',
	'Product/PM',
	'ML/LLM',
	'Agents/Models',
	'Freeform',
]

test('default registry validates and includes Freeform + five domains', () => {
	const registry = validateRegistry(DEFAULT_REGISTRY)
	assert.equal(registry.version, 1)
	assert.equal(registry.domains.length, 6)
	assert.deepEqual(
		registry.domains.map((d) => d.title),
		DEFAULT_TITLES
	)
	const unbound = registry.domains.filter((d) => d.unbound)
	assert.equal(unbound.length, 1)
	assert.equal(unbound[0].title, 'Freeform')
})

test('generation succeeds with default registry and embeds required furniture', () => {
	const registry = loadRegistry()
	const script = buildDocumentTemplateScript(registry)
	assert.match(script, /export const REGISTRY_VERSION = 1/)
	assert.match(script, /__CANVAPOCALYPSE_REGISTRY__/)
	assert.match(script, /history:\s*['"]ignore['"]/)
	assert.match(script, /createShapeIfMissing/)
	assert.match(script, /name:\s*['"]Decided['"]/)
	assert.match(script, /name:\s*['"]In progress['"]/)
	assert.match(script, /Freeform/)
	for (const title of DEFAULT_TITLES) {
		assert.match(script, new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
	}
	assert.match(script, /PageRecordType\.createId/)
	assert.match(script, /editor\.createPage/)
	assert.match(script, /meta:\s*\{\s*lens:\s*domain\.id\s*\}/)
	assert.match(script, /editor\.updatePage/)
	assert.doesNotMatch(script, /deletePage|deletePages/)
})

test('generation succeeds with a custom registry', async () => {
	const root = await mkdtemp(join(tmpdir(), 'canvapocalypse-template-'))
	try {
		const registryPath = join(root, 'registry.json')
		const custom = {
			version: 7,
			domains: [
				{ id: 'ops', title: 'Ops', companion: 'hermes' },
				{ id: 'freeform', title: 'Freeform', companion: null, unbound: true },
			],
		}
		await writeFile(registryPath, JSON.stringify(custom))
		const registry = loadRegistry(registryPath)
		assert.equal(registry.version, 7)
		const script = buildDocumentTemplateScript(registry)
		assert.match(script, /export const REGISTRY_VERSION = 7/)
		assert.match(script, /"title": "Ops"/)
		assert.match(script, /Freeform/)
		assert.match(script, /Decided/)
		assert.match(script, /In progress/)
	} finally {
		await rm(root, { recursive: true, force: true })
	}
})

test('invalid registry: duplicate titles exit with clear error', () => {
	assert.throws(
		() =>
			validateRegistry({
				version: 1,
				domains: [
					{ id: 'a', title: 'Same', companion: 'hermes' },
					{ id: 'b', title: 'Same', companion: 'hermes' },
					{ id: 'freeform', title: 'Freeform', unbound: true },
				],
			}),
		/titles must be unique/i
	)
})

test('invalid registry: bad id exits with clear error', () => {
	assert.throws(
		() =>
			validateRegistry({
				version: 1,
				domains: [
					{ id: 'Bad_ID', title: 'Broken', companion: 'hermes' },
					{ id: 'freeform', title: 'Freeform', unbound: true },
				],
			}),
		/\[a-z0-9-\]/
	)
})

test('invalid registry: missing freeform exits with clear error', () => {
	assert.throws(
		() =>
			validateRegistry({
				version: 1,
				domains: [{ id: 'architecture', title: 'Architecture', companion: 'amp' }],
			}),
		/exactly one unbound freeform/i
	)
})

test('CLI --out writes file and stderr reports domain count + version', async () => {
	const root = await mkdtemp(join(tmpdir(), 'canvapocalypse-template-out-'))
	try {
		const outPath = join(root, 'main.js')
		/** @type {string[]} */
		const stderrChunks = []
		const result = main({
			argv: ['--out', outPath],
			stdout: { write: () => {} },
			stderr: {
				write: (chunk) => {
					stderrChunks.push(String(chunk))
				},
			},
		})
		const written = await readFile(outPath, 'utf8')
		assert.equal(written, result.script)
		assert.match(written, /REGISTRY_VERSION/)
		assert.match(written, /Architecture/)
		const stderr = stderrChunks.join('')
		assert.match(stderr, /domains=6/)
		assert.match(stderr, /registryVersion=1/)
	} finally {
		await rm(root, { recursive: true, force: true })
	}
})

test('CLI rejects invalid registry files with non-zero exit', async () => {
	const root = await mkdtemp(join(tmpdir(), 'canvapocalypse-template-bad-'))
	try {
		const badPath = join(root, 'bad.json')
		await writeFile(
			badPath,
			JSON.stringify({
				version: 1,
				domains: [
					{ id: 'a', title: 'Dup', companion: 'hermes' },
					{ id: 'b', title: 'Dup', companion: 'hermes' },
					{ id: 'freeform', title: 'Freeform', unbound: true },
				],
			})
		)
		const proc = spawnSync(process.execPath, [scriptPath, '--registry', badPath], {
			encoding: 'utf8',
		})
		assert.notEqual(proc.status, 0)
		assert.match(proc.stderr, /titles must be unique|template error/i)
	} finally {
		await rm(root, { recursive: true, force: true })
	}
})

test('CLI rejects bad id registry with non-zero exit', async () => {
	const root = await mkdtemp(join(tmpdir(), 'canvapocalypse-template-bad-id-'))
	try {
		const badPath = join(root, 'bad-id.json')
		await writeFile(
			badPath,
			JSON.stringify({
				version: 1,
				domains: [
					{ id: 'NOPE!', title: 'Nope', companion: 'hermes' },
					{ id: 'freeform', title: 'Freeform', unbound: true },
				],
			})
		)
		const proc = spawnSync(process.execPath, [scriptPath, '--registry', badPath], {
			encoding: 'utf8',
		})
		assert.notEqual(proc.status, 0)
		assert.match(proc.stderr, /\[a-z0-9-\]|template error/i)
	} finally {
		await rm(root, { recursive: true, force: true })
	}
})

test('CLI rejects missing freeform registry with non-zero exit', async () => {
	const root = await mkdtemp(join(tmpdir(), 'canvapocalypse-template-no-ff-'))
	try {
		const badPath = join(root, 'no-freeform.json')
		await writeFile(
			badPath,
			JSON.stringify({
				version: 1,
				domains: [{ id: 'architecture', title: 'Architecture', companion: 'amp' }],
			})
		)
		const proc = spawnSync(process.execPath, [scriptPath, '--registry', badPath], {
			encoding: 'utf8',
		})
		assert.notEqual(proc.status, 0)
		assert.match(proc.stderr, /freeform|template error/i)
	} finally {
		await rm(root, { recursive: true, force: true })
	}
})
