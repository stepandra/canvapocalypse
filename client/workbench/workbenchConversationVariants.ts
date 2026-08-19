import type { Editor } from 'tldraw'
import type { AgentChatBranch } from '../../shared/types/AgentChat'
import {
	insertWorkbenchTemplate,
	type InsertWorkbenchTemplateOptions,
	type WorkbenchConversationContext,
} from './workbenchCanvas'

export function getWorkbenchConversationContext(
	branch: AgentChatBranch,
	comparedBranch?: AgentChatBranch
): WorkbenchConversationContext {
	return {
		branchId: branch.id,
		branchName: branch.name,
		...(branch.parent
			? {
					parentBranchId: branch.parent.branchId,
					parentTurnId: branch.parent.turnId,
				}
			: {}),
		...(comparedBranch
			? {
					comparedBranchId: comparedBranch.id,
					comparedBranchName: comparedBranch.name,
				}
			: {}),
	}
}

/** Materialize the active fork versus its parent as a native Decision Graph + ADR. */
export function insertBranchDecisionGraph(
	editor: Editor,
	branch: AgentChatBranch,
	parentBranch: AgentChatBranch,
	options: Pick<InsertWorkbenchTemplateOptions, 'pageId' | 'point' | 'zoomInset'> = {}
) {
	return insertWorkbenchTemplate(editor, 'architecture', 'decision-graph', {
		...options,
		zoomInset: options.zoomInset ?? 640,
		conversation: getWorkbenchConversationContext(branch, parentBranch),
		nodeText: {
			'decision-graph:decision': `Compare alternatives\n${parentBranch.name} ↔ ${branch.name}`,
			'decision-graph:option-a': `${parentBranch.name}\nBase alternative · benefits · costs · risks`,
			'decision-graph:option-b': `${branch.name}\nForked alternative · benefits · costs · risks`,
			'decision-graph:adr-outcome': 'ADR outcome\nChoice · rationale · consequences · review trigger',
		},
	})
}
