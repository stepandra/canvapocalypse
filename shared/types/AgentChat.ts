import type { ChatHistoryItem } from './ChatHistoryItem'

export interface AgentChatBranchParent {
	branchId: string
	turnId: string
}

export interface AgentChatBranch {
	id: string
	name: string
	parent: AgentChatBranchParent | null
	createdAt: number
	history: ChatHistoryItem[]
}

export interface AgentChatState {
	version: 1
	activeBranchId: string
	branches: AgentChatBranch[]
}
