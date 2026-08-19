import { describe, expect, it } from 'vitest'
import type { AgentChatState } from '../../../shared/types/AgentChat'
import type { ChatHistoryPromptItem } from '../../../shared/types/ChatHistoryItem'
import type { TldrawAgent } from '../TldrawAgent'
import { AgentChatManager } from './AgentChatManager'

function prompt(message: string, source: ChatHistoryPromptItem['promptSource'] = 'user') {
	return {
		type: 'prompt',
		promptSource: source,
		agentFacingMessage: message,
		userFacingMessage: message,
		contextItems: [],
		selectedShapes: [],
	} satisfies ChatHistoryPromptItem
}

function createManager(isGenerating = false) {
	const agent = {
		requests: { isGenerating: () => isGenerating },
	} as unknown as TldrawAgent
	return new AgentChatManager(agent)
}

describe('AgentChatManager branching conversations', () => {
	it('migrates legacy append-only history into a Main branch with stable turn IDs', () => {
		const manager = createManager()
		manager.setHistory([prompt('First'), prompt('Second')])

		const state = manager.getState()
		expect(state.version).toBe(1)
		expect(state.branches).toHaveLength(1)
		expect(state.branches[0].name).toBe('Main')
		expect(state.activeBranchId).toBe(state.branches[0].id)
		const turnIds = manager
			.getHistory()
			.flatMap((item) => (item.type === 'prompt' ? [item.turnId] : []))
		expect(turnIds).toHaveLength(2)
		expect(new Set(turnIds).size).toBe(2)
		expect(turnIds.every((id) => id?.startsWith('turn:'))).toBe(true)
	})

	it('forks after the selected turn and keeps later histories isolated', () => {
		const manager = createManager()
		manager.push(
			prompt('Choose a launch strategy'),
			{ type: 'continuation', data: ['analysis complete'] },
			prompt('Use a freemium launch'),
			{ type: 'continuation', data: ['plan complete'] }
		)
		const rootId = manager.getActiveBranchId()
		const firstTurn = manager.getHistory()[0]
		expect(firstTurn.type).toBe('prompt')
		if (firstTurn.type !== 'prompt' || !firstTurn.turnId) throw new Error('missing turn')

		const { branch, turnNumber } = manager.forkFromTurn(firstTurn.turnId)
		expect(turnNumber).toBe(1)
		expect(branch.parent).toEqual({ branchId: rootId, turnId: firstTurn.turnId })
		expect(manager.getHistory()).toHaveLength(2)

		manager.push(prompt('Try an enterprise-first launch'))
		expect(manager.getHistory()).toHaveLength(3)
		manager.switchBranch(rootId)
		expect(manager.getHistory()).toHaveLength(4)
		expect(
			manager.getHistory().some(
				(item) => item.type === 'prompt' && item.agentFacingMessage.includes('enterprise')
			)
		).toBe(false)
	})

	it('round-trips the active branch and explicit lineage through persisted state', () => {
		const original = createManager()
		original.push(prompt('Map the service boundary'))
		const rootId = original.getActiveBranchId()
		const rootTurn = original.getHistory()[0]
		if (rootTurn.type !== 'prompt' || !rootTurn.turnId) throw new Error('missing turn')
		const { branch } = original.forkFromTurn(rootTurn.turnId, 'Queue alternative')
		original.push(prompt('Use an event queue'))

		const persisted = JSON.parse(JSON.stringify(original.getState())) as AgentChatState
		const restored = createManager()
		restored.setState(persisted)

		expect(restored.getActiveBranchId()).toBe(branch.id)
		expect(restored.getBranches()).toHaveLength(2)
		expect(restored.getActiveBranch().parent).toEqual({
			branchId: rootId,
			turnId: rootTurn.turnId,
		})
		expect(
			(restored.getHistory().at(-1) as ChatHistoryPromptItem).agentFacingMessage
		).toBe('Use an event queue')
	})

	it('starts independent root conversations without deleting previous work', () => {
		const manager = createManager()
		manager.push(prompt('Original'))
		const originalId = manager.getActiveBranchId()

		const next = manager.createBranch()
		expect(next.parent).toBeNull()
		expect(manager.getHistory()).toEqual([])
		manager.push(prompt('Independent'))
		manager.switchBranch(originalId)
		expect((manager.getHistory()[0] as ChatHistoryPromptItem).agentFacingMessage).toBe(
			'Original'
		)
	})

	it('rejects branch changes while streamed actions can still arrive', () => {
		const manager = createManager(true)
		manager.push(prompt('In progress'))
		const turn = manager.getHistory()[0] as ChatHistoryPromptItem

		expect(() => manager.createBranch()).toThrow(/current request/i)
		expect(() => manager.forkFromTurn(turn.turnId!)).toThrow(/current request/i)
		expect(() => manager.switchBranch('missing')).toThrow(/current request/i)
	})

	it('repairs a persisted state with no usable branches', () => {
		const manager = createManager()
		manager.setState({
			version: 1,
			activeBranchId: 'missing',
			branches: [{ id: '', name: '', parent: null, createdAt: 0, history: [] }],
		})

		expect(manager.getBranches()).toHaveLength(1)
		expect(manager.getHistory()).toEqual([])
	})

	it('drops persisted lineage that does not identify a real parent turn', () => {
		const manager = createManager()
		manager.setState({
			version: 1,
			activeBranchId: 'child',
			branches: [
				{ id: 'root', name: 'Main', parent: null, createdAt: 1, history: [prompt('Root')] },
				{
					id: 'child',
					name: 'Invalid child',
					parent: { branchId: 'root', turnId: 'turn:missing' },
					createdAt: 2,
					history: [],
				},
			],
		})

		expect(manager.getActiveBranch().parent).toBeNull()
	})
})
