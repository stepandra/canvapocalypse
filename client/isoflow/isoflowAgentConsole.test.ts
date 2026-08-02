import { describe, expect, it } from 'vitest'
import { parseIsoflowAgentResponse } from './isoflowAgentConsole'

describe('parseIsoflowAgentResponse', () => {
	it('accepts fenced JSON and validates actions', () => {
		const result = parseIsoflowAgentResponse(`\`\`\`json
{"message":"ready","actions":[{"_type":"isoflowPatch","intent":"rename","dryRun":true,"operations":[{"op":"rename_item","itemId":"api","name":"API v2"}]}]}
\`\`\``)
		expect(result.message).toBe('ready')
		expect(result.actions[0]?._type).toBe('isoflowPatch')
	})

	it('rejects model-controlled direct mutation authority', () => {
		expect(() =>
			parseIsoflowAgentResponse(
				'{"message":"applied","actions":[{"_type":"isoflowPatch","intent":"rename","dryRun":false,"operations":[{"op":"rename_item","itemId":"api","name":"API v2"}]}]}'
			)
		).toThrow('Agent returned invalid Isoflow actions')
	})

	it('rejects prose without JSON', () => {
		expect(() => parseIsoflowAgentResponse('I would change the diagram.')).toThrow(
			'Agent did not return a JSON object'
		)
	})
})
