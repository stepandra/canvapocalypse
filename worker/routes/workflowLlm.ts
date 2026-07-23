import { generateText } from 'ai'
import { IRequest } from 'itty-router'
import { DEFAULT_MODEL_NAME, isValidModelName } from '../../shared/models'
import { parseWorkflowLlmRequest } from '../../shared/workflowLlm'
import { AgentService } from '../do/AgentService'
import { Environment } from '../environment'

export async function workflowLlm(request: IRequest, env: Environment) {
	const payload = parseWorkflowLlmRequest(await request.json())
	if (payload.provider === 'openrouter') {
		const authorization = requireOpenRouterAuthorization(request)
		const openRouterModel = payload.model!
		const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
			method: 'POST',
			headers: {
				Authorization: authorization,
				'Content-Type': 'application/json',
				'X-OpenRouter-Title': 'Canvapocalypse',
			},
			body: JSON.stringify({
				model: openRouterModel,
				messages: [
					{ role: 'system', content: payload.instructions },
					{ role: 'user', content: payload.input },
				],
				max_tokens: 2048,
				temperature: 0.2,
			}),
			signal: request.signal,
		})
		if (!response.ok) {
			return new Response(await response.text(), { status: response.status })
		}
		const result = (await response.json()) as {
			choices?: Array<{ message?: { content?: string } }>
		}
		return new Response(result.choices?.[0]?.message?.content ?? '', {
			headers: {
				'Cache-Control': 'no-store',
				'Content-Type': 'text/plain; charset=utf-8',
				'X-Workflow-Model': openRouterModel,
				'X-Workflow-Provider': 'openrouter',
			},
		})
	}
	if (payload.provider === 'compatible') {
		return new Response(
			'OpenAI-compatible Base URL nodes require the loopback workflow bridge',
			{ status: 400, headers: { 'Cache-Control': 'no-store' } }
		)
	}

	const modelName = payload.model && isValidModelName(payload.model) ? payload.model : DEFAULT_MODEL_NAME
	const service = new AgentService(env)
	const result = await generateText({
		model: service.getModel(modelName),
		system: payload.instructions,
		prompt: payload.input,
		maxOutputTokens: 2048,
		temperature: 0.2,
		abortSignal: request.signal,
	})

	return new Response(result.text, {
		headers: {
			'Cache-Control': 'no-store',
			'Content-Type': 'text/plain; charset=utf-8',
			'X-Workflow-Model': modelName,
		},
	})
}

export async function workflowOpenRouterModels(request: IRequest) {
	const authorization = requireOpenRouterAuthorization(request)
	const validation = await fetch('https://openrouter.ai/api/v1/key', {
		headers: { Authorization: authorization },
		signal: request.signal,
	})
	if (!validation.ok) {
		return new Response(await validation.text(), { status: validation.status })
	}
	const response = await fetch(
		'https://openrouter.ai/api/v1/models?output_modalities=text&limit=500',
		{
			headers: {
				Authorization: authorization,
				'X-OpenRouter-Title': 'Canvapocalypse',
			},
			signal: request.signal,
		}
	)
	return new Response(response.body, {
		status: response.status,
		headers: {
			'Cache-Control': 'no-store',
			'Content-Type': response.headers.get('content-type') ?? 'application/json; charset=utf-8',
		},
	})
}

function requireOpenRouterAuthorization(request: IRequest) {
	const authorization = request.headers.get('authorization')
	if (!authorization?.startsWith('Bearer ')) {
		throw new Error('OpenRouter API key is required')
	}
	return authorization
}
