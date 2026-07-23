import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const HOST = '127.0.0.1'
const PORT = Number(process.env.WORKFLOW_LLM_PORT || 5176)
const AMP_BIN = process.env.AMP_BIN || 'amp'
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))
const MAX_BODY_BYTES = 32_000
const MAX_OUTPUT_BYTES = 120_000
const REQUEST_TIMEOUT_MS = 120_000
const ALLOWED_ORIGINS = new Set(['http://127.0.0.1:5175', 'http://localhost:5175'])
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1'

const server = createServer(async (request, response) => {
	const origin = request.headers.origin
	if (origin && !ALLOWED_ORIGINS.has(origin)) {
		return send(response, 403, 'Origin is not allowed')
	}
	if (origin) response.setHeader('Access-Control-Allow-Origin', origin)
	response.setHeader('Vary', 'Origin')
	response.setHeader(
		'Access-Control-Allow-Headers',
		'authorization, content-type, x-workflow-run-id'
	)
	response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')

	if (request.method === 'OPTIONS') return send(response, 204, '')
	const url = new URL(request.url ?? '/', `http://${HOST}:${PORT}`)
	if (request.method === 'GET' && url.pathname === '/openrouter/models') {
		try {
			return await listOpenRouterModels(request, response)
		} catch (error) {
			return send(
				response,
				typeof error?.statusCode === 'number' ? error.statusCode : 502,
				error instanceof Error ? error.message : String(error)
			)
		}
	}
	if (request.method === 'POST' && url.pathname === '/compatible/models') {
		try {
			const payload = JSON.parse(await readBody(request))
			return await listCompatibleModels(payload, request, response)
		} catch (error) {
			return send(
				response,
				typeof error?.statusCode === 'number' ? error.statusCode : 502,
				error instanceof Error ? error.message : String(error)
			)
		}
	}
	if (request.method === 'POST' && url.pathname === '/isoflow/agent') {
		try {
			const payload = JSON.parse(await readBody(request))
			const input = typeof payload.input === 'string' ? payload.input.trim() : ''
			const instructions =
				typeof payload.instructions === 'string' ? payload.instructions.trim() : ''
			if (!input || !instructions) return send(response, 400, 'input and instructions are required')
			const mode = normalizeAmpMode(payload.mode)
			const prompt = [
				'Use the project skill at .agents/skills/isoflow-studio/SKILL.md.',
				'You are handling one bounded Isoflow canvas request from Canvapocalypse.',
				'You may inspect this repository and use read-only tools to resolve IDs, contracts, and architecture.',
				'Do not edit repository files in this bridge call. Diagram changes must be returned as JSON actions.',
				`Instructions:\n${instructions}`,
				`Input:\n${input}`,
			].join('\n\n')
			const output = await runAmp(prompt, mode, request, REPO_ROOT)
			response.setHeader('Content-Type', 'text/plain; charset=utf-8')
			response.setHeader('Cache-Control', 'no-store')
			response.setHeader('X-Workflow-Provider', `amp-${mode}`)
			response.setHeader('X-Amp-Workspace', 'canvapocalypse')
			return send(response, 200, output)
		} catch (error) {
			return send(
				response,
				typeof error?.statusCode === 'number' ? error.statusCode : 500,
				error instanceof Error ? error.message : String(error)
			)
		}
	}
	if (request.method !== 'POST' || url.pathname !== '/workflow/llm') {
		return send(response, 404, 'Not found')
	}

	try {
		const payload = JSON.parse(await readBody(request))
		const input = typeof payload.input === 'string' ? payload.input.trim() : ''
		const instructions =
			typeof payload.instructions === 'string' ? payload.instructions.trim() : ''
		if (!input || !instructions) return send(response, 400, 'input and instructions are required')
		if (payload.provider === 'openrouter') {
			return await streamOpenRouter(
				{
					input,
					instructions,
					model: typeof payload.model === 'string' ? payload.model.trim() : '',
				},
				request,
				response
			)
		}
		if (payload.provider === 'compatible') {
			return await streamCompatible(
				{
					input,
					instructions,
					model: typeof payload.model === 'string' ? payload.model.trim() : '',
					baseUrl: normalizeBaseUrl(payload.baseUrl),
				},
				request,
				response
			)
		}
		const mode = normalizeAmpMode(payload.model)
		const prompt = [
			'You are executing one node in a local visual workflow.',
			'Do not inspect or modify files. Do not invoke tools. Return only the node output.',
			`Instructions:\n${instructions}`,
			`Input:\n${input}`,
		].join('\n\n')
		const output = await runAmp(prompt, mode, request, tmpdir())
		response.setHeader('Content-Type', 'text/plain; charset=utf-8')
		response.setHeader('Cache-Control', 'no-store')
		response.setHeader('X-Workflow-Provider', `amp-${mode}`)
		return send(response, 200, output)
	} catch (error) {
		return send(
			response,
			typeof error?.statusCode === 'number' ? error.statusCode : 500,
			error instanceof Error ? error.message : String(error)
		)
	}
})

server.listen(PORT, HOST, () => {
	console.log(`workflow LLM bridge listening on http://${HOST}:${PORT}`)
})

function runAmp(prompt, mode, request, cwd) {
	return new Promise((resolve, reject) => {
		const child = spawn(AMP_BIN, ['--mode', mode, '-x', prompt], {
			cwd,
			stdio: ['ignore', 'pipe', 'pipe'],
			env: process.env,
		})
		let stdout = ''
		let stderr = ''
		const timeout = setTimeout(() => {
			child.kill('SIGTERM')
			reject(new Error('Amp workflow node timed out'))
		}, REQUEST_TIMEOUT_MS)
		const abort = () => child.kill('SIGTERM')
		request.once('aborted', abort)

		child.stdout.on('data', (chunk) => {
			stdout += chunk
			if (Buffer.byteLength(stdout) > MAX_OUTPUT_BYTES) child.kill('SIGTERM')
		})
		child.stderr.on('data', (chunk) => {
			stderr += chunk
		})
		child.once('error', (error) => {
			clearTimeout(timeout)
			request.off('aborted', abort)
			reject(error)
		})
		child.once('close', (code) => {
			clearTimeout(timeout)
			request.off('aborted', abort)
			if (code === 0 && stdout.trim()) resolve(stdout.trim())
			else reject(new Error(stderr.trim() || `Amp exited with code ${code}`))
		})
	})
}

function normalizeAmpMode(value) {
	const mode = typeof value === 'string' ? value.replace(/^amp-/, '') : 'medium'
	if (!['low', 'medium', 'high', 'ultra'].includes(mode)) {
		const error = new Error('Amp mode must be low, medium, high, or ultra')
		error.statusCode = 400
		throw error
	}
	return mode
}

async function listOpenRouterModels(request, response) {
	const authorization = requireAuthorization(request)
	const validation = await fetch(`${OPENROUTER_API_URL}/key`, {
		headers: { Authorization: authorization },
	})
	if (!validation.ok) {
		return send(response, validation.status, (await validation.text()) || 'OpenRouter API key is invalid')
	}
	const upstream = await fetch(
		`${OPENROUTER_API_URL}/models?output_modalities=text&limit=500`,
		{
			headers: {
				Authorization: authorization,
				'X-OpenRouter-Title': 'Canvapocalypse',
			},
		}
	)
	const body = await upstream.text()
	response.setHeader('Content-Type', 'application/json; charset=utf-8')
	response.setHeader('Cache-Control', 'no-store')
	return send(response, upstream.status, body)
}

async function streamOpenRouter(payload, request, response) {
	if (!payload.model) return send(response, 400, 'OpenRouter model is required')
	const authorization = requireAuthorization(request)
	const controller = new AbortController()
	const abort = () => controller.abort()
	request.once('aborted', abort)

	try {
		const upstream = await fetch(`${OPENROUTER_API_URL}/chat/completions`, {
			method: 'POST',
			headers: {
				Authorization: authorization,
				'Content-Type': 'application/json',
				'X-OpenRouter-Title': 'Canvapocalypse',
			},
			body: JSON.stringify({
				model: payload.model,
				messages: [
					{ role: 'system', content: payload.instructions },
					{ role: 'user', content: payload.input },
				],
				stream: true,
				temperature: 0.2,
				max_tokens: 2048,
			}),
			signal: controller.signal,
		})

		if (!upstream.ok || !upstream.body) {
			return send(
				response,
				upstream.status || 502,
				(await upstream.text()) || 'OpenRouter did not return a response stream'
			)
		}

		response.statusCode = 200
		response.setHeader('Content-Type', 'text/plain; charset=utf-8')
		response.setHeader('Cache-Control', 'no-store')
		response.setHeader('X-Workflow-Provider', 'openrouter')
		response.setHeader('X-Workflow-Model', payload.model)

		const reader = upstream.body.getReader()
		const decoder = new TextDecoder()
		let buffer = ''
		while (true) {
			const { done, value } = await reader.read()
			if (done) break
			buffer += decoder.decode(value, { stream: true })
			const events = buffer.split('\n\n')
			buffer = events.pop() ?? ''
			for (const event of events) {
				for (const line of event.split('\n')) {
					if (!line.startsWith('data:')) continue
					const data = line.slice(5).trim()
					if (!data || data === '[DONE]') continue
					const chunk = JSON.parse(data)
					const content = chunk?.choices?.[0]?.delta?.content
					if (typeof content === 'string') response.write(content)
				}
			}
		}
		response.end()
	} finally {
		request.off('aborted', abort)
	}
}

async function listCompatibleModels(payload, request, response) {
	const baseUrl = normalizeBaseUrl(payload?.baseUrl)
	const upstream = await fetch(`${baseUrl}/models`, {
		headers: optionalAuthorizationHeaders(request),
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
		cache: 'no-store',
	})
	const body = await upstream.text()
	response.setHeader(
		'Content-Type',
		upstream.headers.get('content-type') ?? 'application/json; charset=utf-8'
	)
	response.setHeader('Cache-Control', 'no-store')
	return send(response, upstream.status, body)
}

async function streamCompatible(payload, request, response) {
	if (!payload.model) return send(response, 400, 'OpenAI-compatible model is required')
	const controller = new AbortController()
	const abort = () => controller.abort()
	request.once('aborted', abort)

	try {
		const upstream = await fetch(`${payload.baseUrl}/chat/completions`, {
			method: 'POST',
			headers: {
				...optionalAuthorizationHeaders(request),
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				model: payload.model,
				messages: [
					{ role: 'system', content: payload.instructions },
					{ role: 'user', content: payload.input },
				],
				stream: true,
				temperature: 0.2,
				max_tokens: 2048,
			}),
			signal: controller.signal,
			cache: 'no-store',
		})

		if (!upstream.ok) {
			return send(
				response,
				upstream.status || 502,
				(await upstream.text()) || 'The OpenAI-compatible endpoint returned an error'
			)
		}

		response.statusCode = 200
		response.setHeader('Content-Type', 'text/plain; charset=utf-8')
		response.setHeader('Cache-Control', 'no-store')
		response.setHeader('X-Workflow-Provider', 'compatible')
		response.setHeader('X-Workflow-Model', payload.model)

		const contentType = upstream.headers.get('content-type') ?? ''
		if (!contentType.includes('text/event-stream')) {
			const result = await upstream.json()
			const content = result?.choices?.[0]?.message?.content
			if (typeof content !== 'string') {
				throw new Error('The endpoint response did not include choices[0].message.content')
			}
			return send(response, 200, content)
		}

		await pipeOpenAiEventStream(upstream.body, response)
		response.end()
	} finally {
		request.off('aborted', abort)
	}
}

async function pipeOpenAiEventStream(body, response) {
	if (!body) throw new Error('The endpoint did not return a response stream')
	const reader = body.getReader()
	const decoder = new TextDecoder()
	let buffer = ''
	while (true) {
		const { done, value } = await reader.read()
		if (done) break
		buffer += decoder.decode(value, { stream: true })
		const events = buffer.split('\n\n')
		buffer = events.pop() ?? ''
		for (const event of events) {
			for (const line of event.split('\n')) {
				if (!line.startsWith('data:')) continue
				const data = line.slice(5).trim()
				if (!data || data === '[DONE]') continue
				const chunk = JSON.parse(data)
				const content = chunk?.choices?.[0]?.delta?.content
				if (typeof content === 'string') response.write(content)
			}
		}
	}
}

function requireAuthorization(request) {
	const authorization = request.headers.authorization
	if (!authorization?.startsWith('Bearer ')) {
		const error = new Error('OpenRouter API key is required')
		error.statusCode = 401
		throw error
	}
	return authorization
}

function optionalAuthorizationHeaders(request) {
	const authorization = request.headers.authorization
	return authorization?.startsWith('Bearer ') ? { Authorization: authorization } : {}
}

function normalizeBaseUrl(value) {
	if (typeof value !== 'string' || !value.trim()) {
		const error = new Error('OpenAI-compatible Base URL is required')
		error.statusCode = 400
		throw error
	}
	const parsed = new URL(value.trim())
	if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
		const error = new Error('Base URL must use http or https')
		error.statusCode = 400
		throw error
	}
	return parsed.toString().replace(/\/+$/, '')
}

function readBody(request) {
	return new Promise((resolve, reject) => {
		let body = ''
		request.setEncoding('utf8')
		request.on('data', (chunk) => {
			body += chunk
			if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
				request.destroy()
				reject(new Error('Request body is too large'))
			}
		})
		request.on('end', () => resolve(body))
		request.on('error', reject)
	})
}

function send(response, status, body) {
	response.statusCode = status
	response.end(body)
}
