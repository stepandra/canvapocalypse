#!/usr/bin/env node
/**
 * Document template generator for canvapocalypse tldraw Offline boards.
 *
 * Emits a self-contained document script (script/main.js contract) that
 * idempotently materializes the domain registry, domain pages, Freeform page,
 * and per-domain Decided / In progress frames.
 *
 * Registry is the versioned single source: edit domains + bump REGISTRY_VERSION
 * (or pass --registry) rather than hardcoding pages in product code.
 *
 * Usage:
 *   node scripts/build-tldraw-document-template.mjs [--registry path.json] [--out path]
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

/** Default domain registry embedded when --registry is omitted. */
export const DEFAULT_REGISTRY = {
	version: 1,
	domains: [
		{
			id: 'architecture',
			title: 'Architecture',
			companion: 'amp',
		},
		{
			id: 'ui-ux',
			title: 'UI/UX',
			companion: 'hermes',
		},
		{
			id: 'product-pm',
			title: 'Product/PM',
			companion: 'hermes',
		},
		{
			id: 'ml-llm',
			title: 'ML/LLM',
			companion: 'ml-intern',
		},
		{
			id: 'agents-models',
			title: 'Agents/Models',
			companion: 'hermes',
		},
		{
			id: 'freeform',
			title: 'Freeform',
			companion: null,
			unbound: true,
		},
	],
}

const DOMAIN_ID_PATTERN = /^[a-z0-9-]+$/

/**
 * @typedef {{
 *   id: string,
 *   title: string,
 *   companion?: string | null,
 *   unbound?: boolean
 * }} DomainEntry
 *
 * @typedef {{
 *   version: number,
 *   domains: DomainEntry[]
 * }} DomainRegistry
 */

/**
 * Validate a domain registry.
 * @param {unknown} input
 * @returns {DomainRegistry}
 */
export function validateRegistry(input) {
	if (input == null || typeof input !== 'object' || Array.isArray(input)) {
		throw new Error('Registry must be a JSON object with version and domains.')
	}
	const version = /** @type {{ version?: unknown, domains?: unknown }} */ (
		input
	).version
	const domains = /** @type {{ version?: unknown, domains?: unknown }} */ (
		input
	).domains

	if (!Number.isInteger(version) || version < 1) {
		throw new Error(
			'Registry version must be a positive integer (REGISTRY_VERSION).'
		)
	}
	if (!Array.isArray(domains) || domains.length === 0) {
		throw new Error('Registry domains must be a non-empty array.')
	}

	/** @type {DomainEntry[]} */
	const normalized = []
	const seenIds = new Set()
	const seenTitles = new Set()
	let unboundCount = 0

	for (const [index, raw] of domains.entries()) {
		if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
			throw new Error(`Registry domains[${index}] must be an object.`)
		}
		const entry = /** @type {Record<string, unknown>} */ (raw)
		const id = entry.id
		const title = entry.title
		if (typeof id !== 'string' || !DOMAIN_ID_PATTERN.test(id)) {
			throw new Error(
				`Registry domains[${index}].id must match [a-z0-9-]+ (got ${JSON.stringify(id)}).`
			)
		}
		if (typeof title !== 'string' || !title.trim()) {
			throw new Error(
				`Registry domains[${index}].title must be a non-empty string.`
			)
		}
		const titleKey = title.trim().toLowerCase()
		if (seenIds.has(id)) {
			throw new Error(`Registry domain ids must be unique (duplicate: ${id}).`)
		}
		if (seenTitles.has(titleKey)) {
			throw new Error(
				`Registry domain titles must be unique (duplicate: ${title.trim()}).`
			)
		}
		seenIds.add(id)
		seenTitles.add(titleKey)

		const unbound = entry.unbound === true
		if (unbound) unboundCount += 1

		const companion =
			entry.companion == null
				? null
				: typeof entry.companion === 'string'
					? entry.companion
					: (() => {
							throw new Error(
								`Registry domains[${index}].companion must be a string or null.`
							)
						})()

		/** @type {DomainEntry} */
		const next = {
			id,
			title: title.trim(),
			companion,
		}
		if (unbound) next.unbound = true
		normalized.push(next)
	}

	if (unboundCount !== 1) {
		throw new Error(
			`Registry must include exactly one unbound freeform entry (found ${unboundCount}).`
		)
	}

	return { version, domains: normalized }
}

/**
 * Load registry from a JSON file path or return the default.
 * @param {string | undefined} registryPath
 * @returns {DomainRegistry}
 */
export function loadRegistry(registryPath) {
	if (!registryPath) return validateRegistry(DEFAULT_REGISTRY)
	const absolute = resolve(registryPath)
	let parsed
	try {
		parsed = JSON.parse(readFileSync(absolute, 'utf8'))
	} catch (error) {
		const message =
			error instanceof Error ? error.message : String(error)
		throw new Error(`Failed to read registry at ${absolute}: ${message}`)
	}
	return validateRegistry(parsed)
}

/**
 * Emit the self-contained document script source for a registry.
 * @param {DomainRegistry} registry
 * @returns {string}
 */
export function buildDocumentTemplateScript(registry) {
	const validated = validateRegistry(registry)
	const registryLiteral = JSON.stringify(
		{
			version: validated.version,
			domains: validated.domains,
		},
		null,
		2
	)

	return `/**
 * canvapocalypse document template — generated by
 * scripts/build-tldraw-document-template.mjs
 *
 * Idempotently creates domain pages + Freeform, and Decided / In progress
 * frames on each bound domain page. Never deletes user pages.
 *
 * REGISTRY_VERSION: ${validated.version}
 * Domains: ${validated.domains.map((d) => d.title).join(', ')}
 *
 * Other document scripts can read:
 *   globalThis.__CANVAPOCALYPSE_REGISTRY__  // { version, domains }
 */

import { createShapeId, PageRecordType } from 'tldraw'

/** @type {number} */
export const REGISTRY_VERSION = ${validated.version}

/** @type {{ version: number, domains: Array<{ id: string, title: string, companion: string | null, unbound?: boolean }> }} */
export const CANVAPOCALYPSE_REGISTRY = ${registryLiteral}

const FRAME_WIDTH = 960
const FRAME_HEIGHT = 640
const FRAME_GAP = 80
const DECIDED_X = 80
const DECIDED_Y = 80
const IN_PROGRESS_X = DECIDED_X + FRAME_WIDTH + FRAME_GAP
const IN_PROGRESS_Y = DECIDED_Y

/**
 * @param {import('../.script-workspace/script-context').MainScriptContext} ctx
 */
export default function ({ editor, helpers, signal }) {
	if (signal?.aborted) return

	const registry = {
		version: REGISTRY_VERSION,
		domains: CANVAPOCALYPSE_REGISTRY.domains.map((domain) => ({ ...domain })),
	}

	const host =
		typeof globalThis !== 'undefined'
			? globalThis
			: typeof window !== 'undefined'
				? window
				: null
	if (host) {
		host.__CANVAPOCALYPSE_REGISTRY__ = registry
	}

	const run = (fn) => {
		if (typeof editor.run === 'function') {
			try {
				return editor.run(fn, { history: 'ignore' })
			} catch {
				return editor.run(fn)
			}
		}
		return fn()
	}

	/** @type {{ pagesCreated: number, framesCreated: number, pagesExisting: number }} */
	const summary = { pagesCreated: 0, framesCreated: 0, pagesExisting: 0 }

	run(() => {
		const pagesByName = new Map(
			editor.getPages().map((page) => [page.name, page])
		)

		for (const domain of registry.domains) {
			let page = pagesByName.get(domain.title)
			if (!page) {
				const pageId = PageRecordType.createId(\`canvapocalypse-\${domain.id}\`)
				editor.createPage({ id: pageId, name: domain.title })
				page = editor.getPage(pageId) ?? editor.getPages().find((p) => p.name === domain.title)
				if (page) pagesByName.set(domain.title, page)
				summary.pagesCreated += 1
			} else {
				summary.pagesExisting += 1
			}

			if (!page || domain.unbound) continue

			const previousPageId = editor.getCurrentPageId()
			editor.setCurrentPage(page.id)

			const decidedId = createShapeId(\`canvapocalypse-\${domain.id}-decided\`)
			const inProgressId = createShapeId(
				\`canvapocalypse-\${domain.id}-in-progress\`
			)

			const decidedCreated = helpers.createShapeIfMissing({
				id: decidedId,
				type: 'frame',
				x: DECIDED_X,
				y: DECIDED_Y,
				parentId: page.id,
				meta: {
					canvapocalypse: {
						kind: 'layer-frame',
						layer: 'decided',
						domainId: domain.id,
						registryVersion: REGISTRY_VERSION,
					},
				},
				props: {
					name: 'Decided',
					w: FRAME_WIDTH,
					h: FRAME_HEIGHT,
				},
			})
			const inProgressCreated = helpers.createShapeIfMissing({
				id: inProgressId,
				type: 'frame',
				x: IN_PROGRESS_X,
				y: IN_PROGRESS_Y,
				parentId: page.id,
				meta: {
					canvapocalypse: {
						kind: 'layer-frame',
						layer: 'in-progress',
						domainId: domain.id,
						registryVersion: REGISTRY_VERSION,
					},
				},
				props: {
					name: 'In progress',
					w: FRAME_WIDTH,
					h: FRAME_HEIGHT,
				},
			})
			if (decidedCreated) summary.framesCreated += 1
			if (inProgressCreated) summary.framesCreated += 1

			if (previousPageId && previousPageId !== page.id) {
				editor.setCurrentPage(previousPageId)
			}
		}
	})

	const line = \`[canvapocalypse] registry v\${REGISTRY_VERSION}: pages created=\${summary.pagesCreated} existing=\${summary.pagesExisting} frames created=\${summary.framesCreated}\`
	if (typeof editor.run === 'function') {
		try {
			editor.run(() => {
				console.log(line)
			}, { history: 'ignore' })
		} catch {
			console.log(line)
		}
	} else {
		console.log(line)
	}
}
`
}

/**
 * @param {string[]} argv
 * @returns {{ registryPath?: string, outPath?: string, help: boolean }}
 */
export function parseArgs(argv) {
	/** @type {{ registryPath?: string, outPath?: string, help: boolean }} */
	const options = { help: false }
	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i]
		if (arg === '--help' || arg === '-h') {
			options.help = true
			continue
		}
		if (arg === '--registry' || arg.startsWith('--registry=')) {
			const value =
				arg === '--registry' ? argv[++i] : arg.slice('--registry='.length)
			if (!value) throw new Error('Missing value for --registry <path.json>.')
			options.registryPath = value
			continue
		}
		if (arg === '--out' || arg.startsWith('--out=')) {
			const value = arg === '--out' ? argv[++i] : arg.slice('--out='.length)
			if (!value) throw new Error('Missing value for --out <path>.')
			options.outPath = value
			continue
		}
		throw new Error(`Unknown argument: ${arg}`)
	}
	return options
}

/**
 * CLI entry: write/print the document script and emit a stderr summary.
 * @param {{
 *   argv?: string[],
 *   stdout?: { write: (chunk: string) => void },
 *   stderr?: { write: (chunk: string) => void },
 *   writeFile?: (path: string, data: string, encoding: string) => void,
 * }} [options]
 * @returns {{ script: string, registry: DomainRegistry, outPath?: string }}
 */
export function main(options = {}) {
	const argv = options.argv ?? process.argv.slice(2)
	const stdout = options.stdout ?? process.stdout
	const stderr = options.stderr ?? process.stderr
	const writeFile = options.writeFile ?? writeFileSync

	const parsed = parseArgs(argv)
	if (parsed.help) {
		stdout.write(
			[
				'Usage: node scripts/build-tldraw-document-template.mjs [--registry path.json] [--out path]',
				'',
				'Emits a tldraw Offline document script (script/main.js) that materializes',
				'the domain registry, domain pages, Freeform, and Decided / In progress frames.',
				'',
			].join('\n')
		)
		return {
			script: '',
			registry: validateRegistry(DEFAULT_REGISTRY),
		}
	}

	const registry = loadRegistry(parsed.registryPath)
	const script = buildDocumentTemplateScript(registry)

	if (parsed.outPath) {
		const absolute = resolve(parsed.outPath)
		writeFile(absolute, script, 'utf8')
	} else {
		stdout.write(script)
		if (!script.endsWith('\n')) stdout.write('\n')
	}

	const domainCount = registry.domains.length
	stderr.write(
		`[canvapocalypse] template: domains=${domainCount} registryVersion=${registry.version}${
			parsed.outPath ? ` out=${resolve(parsed.outPath)}` : ''
		}\n`
	)

	return {
		script,
		registry,
		outPath: parsed.outPath ? resolve(parsed.outPath) : undefined,
	}
}

const isDirectRun =
	process.argv[1] &&
	import.meta.url === pathToFileURL(resolve(process.argv[1])).href

if (isDirectRun) {
	try {
		main()
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		process.stderr.write(`[canvapocalypse] template error: ${message}\n`)
		process.exitCode = 1
	}
}
