import { describe, expect, it } from 'vitest'
import type { AgentInput } from '../../shared/types/AgentInput'
import type { AgentRequest } from '../../shared/types/AgentRequest'
import { TldrawAgent } from './TldrawAgent'

const baseRequest: AgentRequest = {
	agentMessages: ['Initial request'],
	userMessages: ['Initial request'],
	bounds: { x: 0, y: 0, w: 100, h: 100 },
	data: [],
	source: 'self',
	contextItems: [],
	routing: {
		enabled: true,
		route: 'canvas-edit',
	},
}

function createScheduleHarness(scheduledRequest: AgentRequest) {
	let captured: AgentRequest | null = null
	const requests = {
		getScheduledRequest: () => scheduledRequest,
		getPartialRequestFromInput: (input: AgentInput): Partial<AgentRequest> => {
			if (typeof input === 'string') return { agentMessages: [input] }
			if (Array.isArray(input)) return { agentMessages: input }
			return { ...input } as Partial<AgentRequest>
		},
		getFullRequestFromInput: (input: AgentInput) => input as AgentRequest,
		isGenerating: () => true,
		setScheduledRequest: (request: AgentRequest) => {
			captured = request
		},
	}
	const agent = Object.create(TldrawAgent.prototype) as TldrawAgent
	agent.requests = requests as unknown as TldrawAgent['requests']
	return {
		agent,
		getCaptured: () => captured,
	}
}

describe('TldrawAgent scheduled requests', () => {
	it('preserves the existing companion routing grant when merging a follow-up', () => {
		const { agent, getCaptured } = createScheduleHarness(baseRequest)

		agent.schedule('Continue with the selected shapes')

		expect(getCaptured()?.routing).toEqual(baseRequest.routing)
	})

	it('allows an explicit follow-up routing grant to replace the scheduled one', () => {
		const { agent, getCaptured } = createScheduleHarness(baseRequest)

		agent.schedule({
			routing: {
				enabled: true,
				route: 'canvas-edit',
				capabilityTier: 'extended',
			},
		})

		expect(getCaptured()?.routing).toEqual({
			enabled: true,
			route: 'canvas-edit',
			capabilityTier: 'extended',
		})
	})
})
