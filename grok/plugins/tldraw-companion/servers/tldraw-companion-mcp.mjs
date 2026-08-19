#!/usr/bin/env node
import { pathToFileURL, fileURLToPath } from 'node:url'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

const PROTOCOL_VERSION = '2024-11-05'
const TOOLS = [
	{
		name: 'tldraw_capabilities',
		description:
			"Discover the compact native-tldraw capability manifest for this workspace's sole .canvas/*.tldraw document. Call this before describe or execute. Fails closed when the project target is missing, ambiguous, or not open.",
		inputSchema: {
			type: 'object',
			properties: {},
			additionalProperties: false,
		},
	},
	{
		name: 'tldraw_describe_capability',
		description:
			'Hydrate the bounded input and AgentAction schema for exactly one capability from a current tldraw manifest.',
		inputSchema: {
			type: 'object',
			properties: {
				manifestId: { type: 'string', description: 'Manifest returned by tldraw_capabilities.' },
				capabilityId: {
					type: 'string',
					description: 'One capability id from that manifest.',
				},
			},
			required: ['manifestId', 'capabilityId'],
			additionalProperties: false,
		},
	},
	{
		name: 'tldraw_execute',
		description:
			'Inspect, semantically read, or mutate one explicit native-tldraw selection/area. Inspect first, then pass its contextRef with the hydrated capability’s bounded query/action plan. Waits for and returns the local canvas receipt. Always stamped actor=grok.',
		inputSchema: {
			type: 'object',
			properties: {
				manifestId: { type: 'string' },
				capabilityId: { type: 'string' },
				context: { enum: ['selection', 'selection-or-area'] },
				contextRef: {
					type: 'string',
					description:
						'Required for mutation and custom semantic reads; returned by a succeeded canvas.inspect receipt.',
				},
				idempotencyKey: {
					type: 'string',
					description: 'Stable retry key for this exact bounded operation.',
				},
				actions: {
					type: 'array',
					maxItems: 24,
					description:
						'Required for mutation and custom semantic reads, omitted for base inspection. Must match the hydrated capability schema.',
					items: { type: 'object' },
				},
			},
			required: ['manifestId', 'capabilityId', 'context'],
			additionalProperties: false,
		},
	},
]

export function resolveCompanionRuntimeUrl({
	cwd = process.cwd(),
	pluginRoot = process.env.GROK_PLUGIN_ROOT || process.env.CLAUDE_PLUGIN_ROOT,
	envRoot = process.env.CANVAPOCALYPSE_ROOT,
	registryPath = join(homedir(), '.grok', 'installed-plugins', 'registry.json'),
} = {}) {
	const sourcePluginRoots = readInstalledPluginSourceRoots(registryPath)
	const candidates = [
		envRoot && join(envRoot, 'scripts/amp-tldraw-companion-runtime.mjs'),
		join(cwd, 'scripts/amp-tldraw-companion-runtime.mjs'),
		pluginRoot && join(pluginRoot, '../../../scripts/amp-tldraw-companion-runtime.mjs'),
		fileURLToPath(
			new URL('../../../../scripts/amp-tldraw-companion-runtime.mjs', import.meta.url)
		),
		...sourcePluginRoots.map((sourceRoot) =>
			join(sourceRoot, '../../../scripts/amp-tldraw-companion-runtime.mjs')
		),
	].filter(Boolean)
	for (const candidate of candidates) {
		const resolved = resolve(candidate)
		if (existsSync(resolved)) return pathToFileURL(resolved).href
	}
	throw new Error(
		'Grok tldraw companion plugin must run from a canvapocalypse workspace (scripts/amp-tldraw-companion-runtime.mjs).'
	)
}

function readInstalledPluginSourceRoots(registryPath) {
	let registry
	try {
		registry = JSON.parse(readFileSync(registryPath, 'utf8'))
	} catch {
		return []
	}
	const roots = []
	const visit = (value) => {
		if (!value || typeof value !== 'object') return
		if (
			typeof value.source === 'string' &&
			value.source.replaceAll('\\', '/').endsWith('/grok/plugins/tldraw-companion')
		) {
			roots.push(value.source)
		}
		for (const child of Object.values(value)) visit(child)
	}
	visit(registry)
	return [...new Set(roots)]
}

export async function createDefaultCompanionApi({
	cwd = process.cwd(),
	loadRuntime = (url) => import(url),
} = {}) {
	const runtimeUrl = resolveCompanionRuntimeUrl({ cwd })
	const runtime = await loadRuntime(runtimeUrl)
	const htmlMockupUrl = runtimeUrl.replace(
		/amp-tldraw-companion-runtime\.mjs$/,
		'html-mockup-resident-capability.mjs'
	)
	const htmlMockup = existsSync(fileURLToPath(htmlMockupUrl))
		? await loadRuntime(htmlMockupUrl)
		: null
	const client = runtime.createAmpTldrawCompanionClient({
		actor: 'grok',
		source: 'grok-plugin',
		startBridge: htmlMockup
			? () =>
					runtime.startWorkbenchBridge({
						residentCapability: htmlMockup.loadOrCreateHtmlMockupResidentCapability({ cwd }),
					})
			: undefined,
	})
	return {
		async capabilities() {
			const canvasTarget = await runtime.resolveProjectCanvasTarget({ workspaceRoot: cwd })
			return client.capabilities(canvasTarget)
		},
		describe: (input) => client.describe(input),
		execute: (input) => client.execute(input),
	}
}

export async function handleMcpRequest(message, api) {
	if (!message || message.jsonrpc !== '2.0') {
		return error(-32600, 'Invalid Request', message?.id ?? null)
	}
	if (message.method === 'initialize') {
		return ok(message.id, {
			protocolVersion: PROTOCOL_VERSION,
			capabilities: { tools: {} },
			serverInfo: { name: 'tldraw-companion', version: '0.1.0' },
		})
	}
	if (message.method === 'notifications/initialized' || message.method === 'initialized') {
		return null
	}
	if (message.method === 'ping') return ok(message.id, {})
	if (message.method === 'tools/list') return ok(message.id, { tools: TOOLS })
	if (message.method === 'tools/call') {
		const name = message.params?.name
		const args = message.params?.arguments ?? {}
		try {
			const result = await dispatchTool(name, args, api)
			return ok(message.id, {
				content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
			})
		} catch (errorValue) {
			return ok(message.id, {
				content: [{ type: 'text', text: String(errorValue?.message ?? errorValue) }],
				isError: true,
			})
		}
	}
	return error(-32601, `Method not found: ${message.method}`, message.id ?? null)
}

async function dispatchTool(name, args, api) {
	if (name === 'tldraw_capabilities') return api.capabilities()
	if (name === 'tldraw_describe_capability') return api.describe(args)
	if (name === 'tldraw_execute') return api.execute(args)
	throw new Error(`Unknown tool: ${name}`)
}

function ok(id, result) {
	return { jsonrpc: '2.0', id, result }
}

function error(code, message, id) {
	return { jsonrpc: '2.0', id, error: { code, message } }
}

export function encodeMcpMessage(payload) {
	return Buffer.from(`${JSON.stringify(payload)}\n`, 'utf8')
}

export function createMcpFramer(onMessage) {
	let buffer = Buffer.alloc(0)
	return (chunk) => {
		buffer = Buffer.concat([buffer, chunk])
		while (true) {
			const headerEnd = buffer.indexOf('\r\n\r\n')
			if (headerEnd === -1) {
				const lineEnd = buffer.indexOf('\n')
				if (lineEnd !== -1 && !buffer.subarray(0, lineEnd).toString('utf8').startsWith('Content-Length:')) {
					const line = buffer.subarray(0, lineEnd).toString('utf8').trim()
					buffer = buffer.subarray(lineEnd + 1)
					if (line) onMessage(JSON.parse(line))
					continue
				}
				return
			}
			const header = buffer.subarray(0, headerEnd).toString('utf8')
			const match = /Content-Length:\s*(\d+)/i.exec(header)
			if (!match) {
				buffer = buffer.subarray(headerEnd + 4)
				continue
			}
			const length = Number(match[1])
			const start = headerEnd + 4
			if (buffer.length < start + length) return
			const body = buffer.subarray(start, start + length).toString('utf8')
			buffer = buffer.subarray(start + length)
			onMessage(JSON.parse(body))
		}
	}
}

async function main() {
	const api = await createDefaultCompanionApi({ cwd: process.cwd() })
	const write = (payload) => {
		if (!payload) return
		process.stdout.write(encodeMcpMessage(payload))
	}
	const feed = createMcpFramer(async (message) => {
		write(await handleMcpRequest(message, api))
	})
	process.stdin.on('data', feed)
}

const launchedDirectly =
	process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (launchedDirectly) {
	main().catch((errorValue) => {
		process.stderr.write(`${errorValue?.stack || errorValue}\n`)
		process.exit(1)
	})
}
