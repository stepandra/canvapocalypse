import assert from 'node:assert/strict'
import test from 'node:test'

import {
	createMcpFramer,
	encodeMcpMessage,
	handleMcpRequest,
	resolveCompanionRuntimeUrl,
} from '../grok/plugins/tldraw-companion/servers/tldraw-companion-mcp.mjs'

test('Grok MCP lists the same three companion tools', async () => {
	const listed = await handleMcpRequest(
		{ jsonrpc: '2.0', id: 1, method: 'tools/list' },
		{}
	)
	assert.deepEqual(
		listed.result.tools.map((tool) => tool.name),
		['tldraw_capabilities', 'tldraw_describe_capability', 'tldraw_execute']
	)
})

test('Grok MCP execute goes through the Grok actor, not Amp', async () => {
	const calls = []
	const api = {
		async capabilities() {
			return { manifestId: 'm1' }
		},
		async describe(input) {
			return { capabilityId: input.capabilityId }
		},
		async execute(input) {
			calls.push(input)
			return { status: 'succeeded', actor: 'grok' }
		},
	}
	const receipt = await handleMcpRequest(
		{
			jsonrpc: '2.0',
			id: 2,
			method: 'tools/call',
			params: {
				name: 'tldraw_execute',
				arguments: {
					manifestId: 'm1',
					capabilityId: 'canvas.inspect',
					context: 'selection',
				},
			},
		},
		api
	)
	assert.match(receipt.result.content[0].text, /"actor": "grok"/)
	assert.equal(calls[0].capabilityId, 'canvas.inspect')
})

test('Grok plugin resolves the shared companion runtime from a canvapocalypse workspace', () => {
	const url = resolveCompanionRuntimeUrl({
		cwd: '/Users/jerryjohnson/dev/canvapocalypse',
	})
	assert.match(url, /amp-tldraw-companion-runtime\.mjs$/)
})

test('Grok MCP emits newline-delimited JSON', () => {
	const message = { jsonrpc: '2.0', id: 1, result: {} }
	const encoded = encodeMcpMessage(message).toString('utf8')
	assert.equal(encoded, `${JSON.stringify(message)}\n`)
	assert.doesNotMatch(encoded, /Content-Length/i)
})

test('MCP input framer accepts both Content-Length and newline JSON', () => {
	const messages = []
	const feed = createMcpFramer((message) => messages.push(message))
	feed(Buffer.from('{"jsonrpc":"2.0","id":1,"method":"ping"}\n'))
	const body = Buffer.from('{"jsonrpc":"2.0","id":2,"method":"ping"}', 'utf8')
	feed(Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`), body]))
	assert.equal(messages.length, 2)
	assert.equal(messages[0].id, 1)
	assert.equal(messages[1].id, 2)
})
