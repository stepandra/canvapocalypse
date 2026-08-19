import { CSSProperties, useEffect, useMemo, useState } from 'react'
import {
	TldrawUiButton,
	TldrawUiButtonIcon,
	useValue,
} from 'tldraw'
import type { AgentChatBranch } from '../../shared/types/AgentChat'
import type { ChatHistoryItem } from '../../shared/types/ChatHistoryItem'
import type { TldrawAgent } from '../agent/TldrawAgent'
import './chatBranchNavigator.css'

export interface ChatBranchNavigatorProps {
	agent: TldrawAgent
	onCompareWithParent?: (
		branch: AgentChatBranch,
		parentBranch: AgentChatBranch
	) => void
}

export function ChatBranchNavigator({
	agent,
	onCompareWithParent,
}: ChatBranchNavigatorProps) {
	const state = useValue('chat branches', () => agent.chat.getState(), [agent])
	const isGenerating = useValue(
		'chat branch request state',
		() => agent.requests.isGenerating(),
		[agent]
	)
	const activeBranch =
		state.branches.find((branch) => branch.id === state.activeBranchId) ??
		state.branches[0]
	const parentBranch = activeBranch?.parent
		? state.branches.find(
				(branch) => branch.id === activeBranch.parent?.branchId
			)
		: undefined
	const turns = useMemo(
		() => getBranchTurnOptions(activeBranch?.history ?? []),
		[activeBranch]
	)
	const [forkTurnId, setForkTurnId] = useState('')

	useEffect(() => {
		if (turns.some((turn) => turn.id === forkTurnId)) return
		setForkTurnId(turns.at(-1)?.id ?? '')
	}, [forkTurnId, turns])

	return (
		<section className="chat-branch-navigator" aria-label="Conversation branches">
		<header>
			<div>
				<span>CONVERSATIONS</span>
				<strong>{activeBranch?.name ?? 'Main'}</strong>
			</div>
			<small>{state.branches.length} branches · shared canvas</small>
		</header>

		<div className="chat-branch-tree" role="tablist" aria-label="Conversation tree">
			{state.branches.map((branch) => {
				const active = branch.id === state.activeBranchId
				const turnCount = getBranchTurnOptions(branch.history).length
				return (
					<TldrawUiButton
						key={branch.id}
						type="low"
						className="chat-branch-tree-item"
						style={
							{
								'--chat-branch-indent': `${getBranchDepth(branch, state.branches) * 14}px`,
							} as CSSProperties
						}
						role="tab"
						aria-selected={active}
						data-active={active}
						disabled={isGenerating}
						title={getBranchTitle(branch, state.branches)}
						onClick={() => agent.chat.switchBranch(branch.id)}
					>
						<span className="chat-branch-tree-stem" aria-hidden="true" />
						<span className="chat-branch-tree-dot" aria-hidden="true" />
						<span className="chat-branch-tree-label">{branch.name}</span>
						<small>{turnCount}</small>
					</TldrawUiButton>
				)
			})}
		</div>

		<div className="chat-branch-actions">
			<label>
				<span>Fork from</span>
				<select
					value={forkTurnId}
					disabled={isGenerating || turns.length === 0}
					onChange={(event) => setForkTurnId(event.currentTarget.value)}
				>
					{turns.length === 0 ? (
						<option value="">No turns yet</option>
					) : (
						turns.map((turn) => (
							<option key={turn.id} value={turn.id}>
								{turn.label}
							</option>
						))
					)}
				</select>
			</label>
			<TldrawUiButton
				type="low"
				title="Fork this conversation after the selected turn"
				aria-label="Fork conversation"
				disabled={isGenerating || !forkTurnId}
				onClick={() => agent.chat.forkFromTurn(forkTurnId)}
			>
				<TldrawUiButtonIcon icon="duplicate" small />
				Fork
			</TldrawUiButton>
			<TldrawUiButton
				type="low"
				title="Start a separate conversation on the shared canvas"
				aria-label="New conversation"
				disabled={isGenerating}
				onClick={() => agent.chat.createBranch()}
			>
				<TldrawUiButtonIcon icon="plus" small />
				New
			</TldrawUiButton>
			{onCompareWithParent && (
				<TldrawUiButton
					type="low"
					title="Create a native Decision Graph and ADR outcome for this branch versus its parent"
					aria-label="Compare branch with parent"
					disabled={isGenerating || !activeBranch || !parentBranch}
					onClick={() => {
						if (activeBranch && parentBranch) {
							onCompareWithParent(activeBranch, parentBranch)
						}
					}}
				>
					<TldrawUiButtonIcon icon="geo-diamond" small />
					Compare
				</TldrawUiButton>
			)}
		</div>
	</section>
	)
}

export function getBranchTurnOptions(history: ChatHistoryItem[]) {
	const turns: Array<{ id: string; label: string }> = []
	for (const item of history) {
		if (item.type !== 'prompt' || item.promptSource === 'self' || !item.turnId) {
			continue
		}
		const message = item.userFacingMessage ?? item.agentFacingMessage
		const compactMessage = message.replace(/\s+/g, ' ').trim()
		turns.push({
			id: item.turnId,
			label: `${turns.length + 1} · ${compactMessage.slice(0, 52) || 'Untitled turn'}`,
		})
	}
	return turns
}

function getBranchDepth(branch: AgentChatBranch, branches: AgentChatBranch[]) {
	let depth = 0
	let current = branch
	const visited = new Set([branch.id])
	while (current.parent && depth < 8) {
		const parent = branches.find((candidate) => candidate.id === current.parent?.branchId)
		if (!parent || visited.has(parent.id)) break
		visited.add(parent.id)
		current = parent
		depth += 1
	}
	return depth
}

function getBranchTitle(branch: AgentChatBranch, branches: AgentChatBranch[]) {
	if (!branch.parent) return `${branch.name} · root conversation`
	const parent = branches.find((candidate) => candidate.id === branch.parent?.branchId)
	const turnIndex = parent
		? getBranchTurnOptions(parent.history).findIndex(
				(turn) => turn.id === branch.parent?.turnId
			)
		: -1
	return `${branch.name} · forked from ${parent?.name ?? 'another conversation'}${
		turnIndex === -1 ? '' : ` after turn ${turnIndex + 1}`
	}`
}
