import z from 'zod'
import {
	IsoflowCreateViewAction,
	IsoflowPatchAction,
} from '../../shared/schema/AgentActionSchemas'
import { IsoflowCompactView } from './isoflowBridge'

const IsoflowAgentResponse = z.object({
	message: z.string(),
	actions: z.array(z.union([IsoflowPatchAction, IsoflowCreateViewAction])).max(8),
})

export type IsoflowAgentResponse = z.infer<typeof IsoflowAgentResponse>
export type IsoflowAgentProvider =
	| 'amp-low'
	| 'amp-medium'
	| 'amp-high'
	| 'amp-ultra'
	| 'openrouter'

export async function runIsoflowAgent({
	provider,
	model,
	apiKey,
	userPrompt,
	view,
	signal,
}: {
	provider: IsoflowAgentProvider
	model?: string
	apiKey?: string
	userPrompt: string
	view: IsoflowCompactView
	signal?: AbortSignal
}) {
	if (provider === 'openrouter' && !apiKey) {
		throw new Error('Connect OpenRouter in an OpenRouter LLM node first')
	}
	if (provider === 'openrouter' && !model) {
		throw new Error('Choose an OpenRouter model first')
	}

	const isOpenRouter = provider === 'openrouter'
	const response = await fetch(
		`http://127.0.0.1:5176/${isOpenRouter ? 'workflow/llm' : 'isoflow/agent'}`,
		{
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				...(provider === 'openrouter' ? { Authorization: `Bearer ${apiKey}` } : {}),
			},
			cache: 'no-store',
			signal,
			body: JSON.stringify({
				provider: isOpenRouter ? 'openrouter' : 'amp',
				model: isOpenRouter ? model : undefined,
				mode: isOpenRouter ? undefined : provider,
				instructions: ISOFLOW_AGENT_INSTRUCTIONS,
				input: JSON.stringify({
					request: userPrompt,
					context: compactAgentContext(view),
				}),
			}),
		}
	)
	if (!response.ok) {
		throw new Error((await response.text()) || `Isoflow agent failed (${response.status})`)
	}
	return parseIsoflowAgentResponse(await response.text())
}

export function parseIsoflowAgentResponse(text: string): IsoflowAgentResponse {
	const normalized = text
		.trim()
		.replace(/^```(?:json)?\s*/i, '')
		.replace(/\s*```$/i, '')
	const start = normalized.indexOf('{')
	const end = normalized.lastIndexOf('}')
	if (start === -1 || end < start) throw new Error('Agent did not return a JSON object')
	let payload: unknown
	try {
		payload = JSON.parse(normalized.slice(start, end + 1))
	} catch {
		throw new Error('Agent returned invalid JSON')
	}
	const parsed = IsoflowAgentResponse.safeParse(payload)
	if (!parsed.success) {
		throw new Error(`Agent returned invalid Isoflow actions: ${parsed.error.issues[0]?.message}`)
	}
	return parsed.data
}

function compactAgentContext(view: IsoflowCompactView) {
	return {
		projectId: view.projectId,
		revision: view.revision,
		title: view.title,
		activeViewId: view.view.id,
		views: view.views,
		legend: view.legend,
		colors: view.colors,
		items: view.items.slice(0, 32).map((item) => ({
			id: item.id,
			name: item.name,
			icon: item.icon,
			tile: item.tile,
		})),
		connectors: view.view.connectors.slice(0, 48).map((connector) => ({
			id: connector.id,
			from: connector.anchors[0]?.ref.item,
			to: connector.anchors.at(-1)?.ref.item,
			color: connector.color,
			width: connector.width,
			style: connector.style,
			direction: connector.direction,
		})),
		rectangles: view.view.rectangles.slice(0, 24),
		textBoxes: view.view.textBoxes.slice(0, 24),
		truncated:
			view.items.length > 32 ||
			view.view.connectors.length > 48 ||
			view.view.rectangles.length > 24 ||
			view.view.textBoxes.length > 24,
	}
}

const ISOFLOW_AGENT_INSTRUCTIONS = `You control one selected native Isoflow diagram.
Return JSON only, with this exact top-level shape:
{"message":"brief answer for the user","actions":[]}

Use actions only when the user asks to change or create a diagram.
Supported action shapes:
{"_type":"isoflowPatch","intent":"...","projectId":"...","dryRun":false,"operations":[...]}
{"_type":"isoflowCreateView","intent":"...","projectId":"...","viewId":"stable-kebab-id","name":"...","nodes":[{"id":"stable-kebab-id","name":"...","iconQuery":"optional native icon name","x":0,"y":0}],"connectors":[{"id":"stable-id","from":"node-id","to":"node-id"}]}

Patch operations are set_view, create_view, update_view, duplicate_view, remove_view,
move_item, rename_item, update_item, add_item, remove_item, connect,
update_connector, disconnect, add/update/remove_rectangle,
add/update/remove_text_box, update_color, and replace_legend.
Use only IDs present in context for patching. For a new view, use unique stable IDs, at most 32 nodes and 48 connectors. Tile coordinates are small integers. Prefer native iconQuery names such as server, database, user, cloud, shield, github, or terminal; omit iconQuery when uncertain. Never invent hidden project state. If context is truncated and the request depends on missing nodes, return no actions and explain that the user should narrow the view.`
