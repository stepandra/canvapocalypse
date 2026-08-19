import { describe, expect, it } from 'vitest'
import type { AgentChatBranch } from '../../shared/types/AgentChat'
import { getWorkbenchConversationContext } from './workbenchConversationVariants'

const main: AgentChatBranch = {
	id: 'branch:main',
	name: 'Main',
	parent: null,
	createdAt: 1,
	history: [],
}

const alternative: AgentChatBranch = {
	id: 'branch:alternative',
	name: 'Alternative',
	parent: { branchId: main.id, turnId: 'turn:2' },
	createdAt: 2,
	history: [],
}

describe('workbench conversation variants', () => {
	it('projects stable branch lineage and the compared alternative only', () => {
		expect(getWorkbenchConversationContext(alternative, main)).toEqual({
			branchId: 'branch:alternative',
			branchName: 'Alternative',
			parentBranchId: 'branch:main',
			parentTurnId: 'turn:2',
			comparedBranchId: 'branch:main',
			comparedBranchName: 'Main',
		})
	})

	it('keeps a root branch context compact', () => {
		expect(getWorkbenchConversationContext(main)).toEqual({
			branchId: 'branch:main',
			branchName: 'Main',
		})
	})
})
