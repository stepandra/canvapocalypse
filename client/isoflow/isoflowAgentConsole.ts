import z from 'zod'
import {
	IsoflowCreateViewAction,
	IsoflowPatchAction,
} from '../../shared/schema/AgentActionSchemas'

const IsoflowAgentResponse = z.object({
	message: z.string(),
	actions: z.array(z.union([IsoflowPatchAction, IsoflowCreateViewAction])).max(8),
})

export type IsoflowAgentResponse = z.infer<typeof IsoflowAgentResponse>

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
