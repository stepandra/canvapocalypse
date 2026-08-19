import { Atom, atom, uniqueId } from 'tldraw'
import type {
	AgentChatBranch,
	AgentChatState,
} from '../../../shared/types/AgentChat'
import type {
	ChatHistoryItem,
	ChatHistoryPromptItem,
} from '../../../shared/types/ChatHistoryItem'
import type { TldrawAgent } from '../TldrawAgent'
import { BaseAgentManager } from './BaseAgentManager'

const ROOT_BRANCH_NAME = 'Main'

function createBranchId() {
	return `branch:${uniqueId()}`
}

function createTurnId() {
	return `turn:${uniqueId()}`
}

function withStableTurnIds(history: ChatHistoryItem[]): ChatHistoryItem[] {
	let changed = false
	const next = history.map((item) => {
		if (item.type !== 'prompt' || item.turnId) return item
		changed = true
		return { ...item, turnId: createTurnId() }
	})
	return changed ? next : history
}

function createRootBranch(history: ChatHistoryItem[] = []): AgentChatBranch {
	return {
		id: createBranchId(),
		name: ROOT_BRANCH_NAME,
		parent: null,
		createdAt: Date.now(),
		history: withStableTurnIds(history),
	}
}

function createInitialState(history: ChatHistoryItem[] = []): AgentChatState {
	const root = createRootBranch(history)
	return { version: 1, activeBranchId: root.id, branches: [root] }
}

/**
 * Manages chat history for an agent.
 * The chat history stores all interactions between the user and the agent,
 * including prompts, actions, and continuations.
 */
export class AgentChatManager extends BaseAgentManager {
	/**
	 * All persisted conversation branches. Existing callers continue to work
	 * against the active branch through getHistory(), push(), and update().
	 */
	private $chatState: Atom<AgentChatState>

	/**
	 * Creates a new AgentChatManager instance.
	 * Initializes one empty root conversation.
	 */
	constructor(agent: TldrawAgent) {
		super(agent)
		this.$chatState = atom('chatState', createInitialState())
	}

	/**
	 * Get the current chat history.
	 * @returns The array of chat history items.
	 */
	getHistory() {
		return this.getActiveBranch().history
	}

	getState() {
		return this.$chatState.get()
	}

	getBranches() {
		return this.$chatState.get().branches
	}

	getActiveBranchId() {
		return this.$chatState.get().activeBranchId
	}

	getActiveBranch() {
		const state = this.$chatState.get()
		return (
			state.branches.find((branch) => branch.id === state.activeBranchId) ??
			state.branches[0]
		)
	}

	/**
	 * Set the chat history directly.
	 * Primarily used for loading persisted state.
	 * @param history - The chat history items to set.
	 */
	setHistory(history: ChatHistoryItem[]) {
		this.$chatState.set(createInitialState(history))
	}

	/** Restore a persisted branch graph, falling back to one empty root. */
	setState(state: AgentChatState) {
		if (state.version !== 1 || !Array.isArray(state.branches)) {
			this.$chatState.set(createInitialState())
			return
		}

		const branchIds = new Set<string>()
		const branches = state.branches.flatMap((branch) => {
			if (
				!branch ||
				typeof branch.id !== 'string' ||
				branch.id.length === 0 ||
				branchIds.has(branch.id) ||
				!Array.isArray(branch.history)
			) {
				return []
			}
			branchIds.add(branch.id)
			return [
				{
					...branch,
					name:
						typeof branch.name === 'string' && branch.name.trim()
							? branch.name.trim().slice(0, 80)
							: `Branch ${branchIds.size}`,
					createdAt: Number.isFinite(branch.createdAt)
						? branch.createdAt
						: Date.now(),
					history: withStableTurnIds(branch.history),
				},
			]
		})

		if (branches.length === 0) {
			this.$chatState.set(createInitialState())
			return
		}

		const normalizedBranches = branches.map((branch) => {
			const candidateParent = branch.parent
			const parent = candidateParent
				? branches.find(
						(candidate) =>
							candidate.id === candidateParent.branchId &&
							candidate.id !== branch.id &&
							candidate.history.some(
								(item) =>
									item.type === 'prompt' && item.turnId === candidateParent.turnId
							)
					)
				: undefined
			return {
				...branch,
				parent: parent
					? { branchId: parent.id, turnId: candidateParent!.turnId }
					: null,
			}
		})

		this.$chatState.set({
			version: 1,
			activeBranchId: branchIds.has(state.activeBranchId)
				? state.activeBranchId
				: branches[0].id,
			branches: normalizedBranches,
		})
	}

	/**
	 * Reset the chat manager to its initial state.
	 * Clears all chat history.
	 */
	reset(): void {
		this.$chatState.set(createInitialState())
	}

	/**
	 * Push one or more items to the chat history.
	 * Items are appended to the end of the history array.
	 * If no items are provided, this method does nothing.
	 * @param items - The chat history item(s) to add.
	 * @example
	 * ```ts
	 * chatManager.push(promptItem)
	 * chatManager.push(actionItem1, actionItem2)
	 * ```
	 */
	push(...items: ChatHistoryItem[]) {
		if (items.length === 0) return
		this.update((history) => [...history, ...items])
	}

	/**
	 * Update chat history items in place using an updater function.
	 * This is used for operations like marking actions as accepted/rejected,
	 * modifying existing items, or filtering the history.
	 * @param updater - A function that receives the current history and returns the updated history.
	 * @example
	 * ```ts
	 * // Mark all actions as accepted
	 * chatManager.update((history) =>
	 *   history.map((item) =>
	 *     item.type === 'action' ? { ...item, acceptance: 'accepted' } : item
	 *   )
	 * )
	 * ```
	 */
	update(updater: (history: ChatHistoryItem[]) => ChatHistoryItem[]) {
		this.$chatState.update((state) => ({
			...state,
			branches: state.branches.map((branch) =>
				branch.id === state.activeBranchId
					? {
							...branch,
							history: withStableTurnIds(updater(branch.history)),
						}
					: branch
			),
		}))
	}

	/** Start a separate root conversation without deleting existing branches. */
	createBranch(name?: string) {
		this.assertCanChangeBranch()
		const state = this.$chatState.get()
		const branch: AgentChatBranch = {
			id: createBranchId(),
			name: name?.trim().slice(0, 80) || `Conversation ${state.branches.length + 1}`,
			parent: null,
			createdAt: Date.now(),
			history: [],
		}
		this.$chatState.set({
			...state,
			activeBranchId: branch.id,
			branches: [...state.branches, branch],
		})
		return branch
	}

	/**
	 * Fork after one external prompt and all actions/continuations belonging to
	 * that turn. The canvas remains shared; only conversational context branches.
	 */
	forkFromTurn(turnId: string, name?: string) {
		this.assertCanChangeBranch()
		const state = this.$chatState.get()
		const parent = this.getActiveBranch()
		const turnIndex = parent.history.findIndex(
			(item) =>
				item.type === 'prompt' &&
				item.promptSource !== 'self' &&
				item.turnId === turnId
		)
		if (turnIndex === -1) {
			throw new Error('Cannot fork from a turn outside the active conversation')
		}

		let historyEnd = parent.history.length
		for (let index = turnIndex + 1; index < parent.history.length; index += 1) {
			const item = parent.history[index]
			if (item.type === 'prompt' && item.promptSource !== 'self') {
				historyEnd = index
				break
			}
		}

		const turnNumber = parent.history
			.slice(0, turnIndex + 1)
			.filter(isExternalPrompt).length
		const branch: AgentChatBranch = {
			id: createBranchId(),
			name:
				name?.trim().slice(0, 80) ||
				`${parent.name} · alternative ${state.branches.length}`,
			parent: { branchId: parent.id, turnId },
			createdAt: Date.now(),
			history: parent.history.slice(0, historyEnd),
		}
		this.$chatState.set({
			...state,
			activeBranchId: branch.id,
			branches: [...state.branches, branch],
		})
		return { branch, turnNumber }
	}

	switchBranch(branchId: string) {
		this.assertCanChangeBranch()
		const state = this.$chatState.get()
		if (state.activeBranchId === branchId) return this.getActiveBranch()
		const branch = state.branches.find((candidate) => candidate.id === branchId)
		if (!branch) throw new Error('Conversation branch not found')
		this.$chatState.set({ ...state, activeBranchId: branch.id })
		return branch
	}

	private assertCanChangeBranch() {
		if (this.agent.requests?.isGenerating()) {
			throw new Error('Wait for the current request to finish before changing conversation branches')
		}
	}
}

function isExternalPrompt(item: ChatHistoryItem): item is ChatHistoryPromptItem {
	return item.type === 'prompt' && item.promptSource !== 'self'
}
