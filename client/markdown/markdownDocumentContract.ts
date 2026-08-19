export const MARKDOWN_DOCUMENT_CONTRACT_SCHEMA =
	'canvapocalypse-markdown-document/v1' as const
export const MARKDOWN_DOCUMENT_REVISION_PATTERN = /^sha256:[a-f0-9]{64}$/
export const MARKDOWN_DOCUMENT_REF_PATTERN = /^markdown-[a-zA-Z0-9-]{8,96}$/
export const MAX_MARKDOWN_DOCUMENT_BYTES = 128 * 1024
export const MAX_MARKDOWN_LINK_REFS = 64

export type MarkdownDocumentRevision = `sha256:${string}`
export type MarkdownDocumentSourceKind = 'file' | 'pasted' | 'edited'

export interface MarkdownDocumentInput {
	schema: typeof MARKDOWN_DOCUMENT_CONTRACT_SCHEMA
	documentRef: string
	revision: MarkdownDocumentRevision
	bytes: number
	title: string
	markdown: string
	sourceName: string
	sourceKind: MarkdownDocumentSourceKind
	links: string[]
}

export interface CreateMarkdownDocumentInputOptions {
	documentRef?: string
	title?: string
	sourceKind?: MarkdownDocumentSourceKind
}

export function createMarkdownDocumentInput(
	markdown: string,
	sourceName = '',
	options: CreateMarkdownDocumentInputOptions = {}
): MarkdownDocumentInput {
	const normalizedMarkdown = markdown.replace(/\r\n?/g, '\n')
	const safeSourceName = sourceName.split(/[\\/]/).at(-1)?.slice(0, 180) ?? ''
	const revision = markdownDocumentRevision(normalizedMarkdown)
	const bytes = new TextEncoder().encode(normalizedMarkdown).byteLength
	if (bytes > MAX_MARKDOWN_DOCUMENT_BYTES) {
		throw new Error('Markdown document must be 128 KB or smaller')
	}
	const documentRef = options.documentRef ?? createMarkdownDocumentRef()
	if (!MARKDOWN_DOCUMENT_REF_PATTERN.test(documentRef)) {
		throw new Error('Markdown document reference is invalid')
	}
	return {
		schema: MARKDOWN_DOCUMENT_CONTRACT_SCHEMA,
		documentRef,
		revision,
		bytes,
		title:
			cleanMarkdownTitle(
				options.title ?? deriveMarkdownTitle(normalizedMarkdown, safeSourceName)
			) || 'Untitled Markdown',
		markdown: normalizedMarkdown,
		sourceName: safeSourceName,
		sourceKind: options.sourceKind ?? (safeSourceName ? 'file' : 'pasted'),
		links: extractMarkdownLinkRefs(normalizedMarkdown),
	}
}

export function createMarkdownDocumentRef() {
	const suffix =
		typeof globalThis.crypto?.randomUUID === 'function'
			? globalThis.crypto.randomUUID()
			: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
	return `markdown-${suffix}`
}

export function deriveMarkdownTitle(markdown: string, sourceName = '') {
	const frontmatterTitle = markdown.match(
		/^---\s*$[\s\S]*?^title:\s*["']?(.+?)["']?\s*$[\s\S]*?^---\s*$/m
	)?.[1]
	const heading = markdown.match(/^#\s+(.+?)\s*$/m)?.[1]
	const filename = sourceName.replace(/\.md(?:own)?$/i, '')
	return cleanMarkdownTitle(frontmatterTitle ?? heading ?? filename ?? '') || 'Untitled Markdown'
}

export function markdownDocumentBody(markdown: string) {
	return markdown.replace(/^---\s*\r?\n[\s\S]*?\r?\n---\s*(?:\r?\n|$)/, '')
}

export function markdownDocumentRevision(markdown: string): MarkdownDocumentRevision {
	const bytes = new TextEncoder().encode(markdown.replace(/\r\n?/g, '\n'))
	return `sha256:${sha256Hex(bytes)}`
}

export function extractMarkdownLinkRefs(markdown: string) {
	const refs = new Set<string>()
	const add = (candidate: string | undefined) => {
		const normalized = candidate
			?.trim()
			.replace(/^<|>$/g, '')
			.replace(/\\/g, '/')
			.slice(0, 240)
		if (
			!normalized ||
			/^(?:[a-z]+:|\/|~\/)/i.test(normalized) ||
			normalized.includes('\0')
		) {
			return
		}
		refs.add(normalized)
	}
	for (const match of markdown.matchAll(/!?\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g)) {
		add(match[1])
		if (refs.size >= MAX_MARKDOWN_LINK_REFS) break
	}
	if (refs.size < MAX_MARKDOWN_LINK_REFS) {
		for (const match of markdown.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g)) {
			add(match[1])
			if (refs.size >= MAX_MARKDOWN_LINK_REFS) break
		}
	}
	return [...refs]
}

export function sliceUtf8Chunk(value: string, offset: number, maxBytes: number) {
	const bytes = new TextEncoder().encode(value)
	if (!Number.isInteger(offset) || offset < 0 || offset > bytes.byteLength) {
		throw new Error('Markdown chunk cursor is stale or invalid')
	}
	let end = Math.min(bytes.byteLength, offset + maxBytes)
	while (end > offset && end < bytes.byteLength && (bytes[end] & 0xc0) === 0x80) {
		end -= 1
	}
	return {
		text: new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(offset, end)),
		start: offset,
		end,
		totalBytes: bytes.byteLength,
		eof: end >= bytes.byteLength,
	}
}

export function truncateUtf8(value: string, maxBytes: number) {
	if (!Number.isFinite(maxBytes)) return value
	return sliceUtf8Chunk(value, 0, Math.max(0, maxBytes)).text
}

function cleanMarkdownTitle(value: string) {
	return value
		.trim()
		.replace(/^[`*_]+|[`*_]+$/g, '')
		.slice(0, 160)
}

const SHA256_ROUND_CONSTANTS = new Uint32Array([
	0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
	0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
	0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
	0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
	0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
	0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
	0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
	0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
	0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
	0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
	0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])

function sha256Hex(input: Uint8Array) {
	const paddedLength = Math.ceil((input.byteLength + 9) / 64) * 64
	const padded = new Uint8Array(paddedLength)
	padded.set(input)
	padded[input.byteLength] = 0x80
	const view = new DataView(padded.buffer)
	const bitLength = input.byteLength * 8
	view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x1_0000_0000), false)
	view.setUint32(paddedLength - 4, bitLength >>> 0, false)

	const state = new Uint32Array([
		0x6a09e667,
		0xbb67ae85,
		0x3c6ef372,
		0xa54ff53a,
		0x510e527f,
		0x9b05688c,
		0x1f83d9ab,
		0x5be0cd19,
	])
	const words = new Uint32Array(64)
	const rotateRight = (value: number, amount: number) =>
		(value >>> amount) | (value << (32 - amount))

	for (let block = 0; block < paddedLength; block += 64) {
		for (let index = 0; index < 16; index += 1) {
			words[index] = view.getUint32(block + index * 4, false)
		}
		for (let index = 16; index < 64; index += 1) {
			const left = words[index - 15]
			const right = words[index - 2]
			const sigma0 = rotateRight(left, 7) ^ rotateRight(left, 18) ^ (left >>> 3)
			const sigma1 = rotateRight(right, 17) ^ rotateRight(right, 19) ^ (right >>> 10)
			words[index] = (words[index - 16] + sigma0 + words[index - 7] + sigma1) >>> 0
		}

		let [a, b, c, d, e, f, g, h] = state
		for (let index = 0; index < 64; index += 1) {
			const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25)
			const choice = (e & f) ^ (~e & g)
			const temp1 = (h + sum1 + choice + SHA256_ROUND_CONSTANTS[index] + words[index]) >>> 0
			const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22)
			const majority = (a & b) ^ (a & c) ^ (b & c)
			const temp2 = (sum0 + majority) >>> 0
			h = g
			g = f
			f = e
			e = (d + temp1) >>> 0
			d = c
			c = b
			b = a
			a = (temp1 + temp2) >>> 0
		}

		state[0] = (state[0] + a) >>> 0
		state[1] = (state[1] + b) >>> 0
		state[2] = (state[2] + c) >>> 0
		state[3] = (state[3] + d) >>> 0
		state[4] = (state[4] + e) >>> 0
		state[5] = (state[5] + f) >>> 0
		state[6] = (state[6] + g) >>> 0
		state[7] = (state[7] + h) >>> 0
	}

	return [...state].map((word) => word.toString(16).padStart(8, '0')).join('')
}
