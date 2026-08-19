import { describe, expect, it } from 'vitest'
import type { AgentRequest } from '../../shared/types/AgentRequest'
import type { ChatHistoryPromptItem } from '../../shared/types/ChatHistoryItem'
import type { AgentHelpers } from '../AgentHelpers'
import type { TldrawAgent } from '../agent/TldrawAgent'
import { ChatHistoryPartUtil } from './ChatHistoryPartUtil'

describe('ChatHistoryPartUtil', () => {
	it('keeps local turn lineage out of model context', async () => {
		const history: ChatHistoryPromptItem[] = [
			{
				type: 'prompt',
				turnId: 'turn:local-only',
				promptSource: 'user',
				agentFacingMessage: 'Compare the alternatives',
				userFacingMessage: 'Compare the alternatives',
				contextItems: [],
				selectedShapes: [],
			},
		]
		const agent = {
			editor: {},
			chat: { getHistory: () => history },
		} as unknown as TldrawAgent
		const request = {
			source: 'user',
			agentMessages: ['Continue'],
			userMessages: ['Continue'],
			data: [],
			bounds: { x: 0, y: 0, w: 100, h: 100 },
			contextItems: [],
			routing: {
				enabled: true,
				route: 'canvas-edit',
				maxHistoryItems: 4,
			},
		} satisfies AgentRequest

		const part = await new ChatHistoryPartUtil(agent).getPart(
			request,
			{} as AgentHelpers
		)

		expect(part.history[0]).not.toHaveProperty('turnId')
		expect(history[0].turnId).toBe('turn:local-only')
	})
})
