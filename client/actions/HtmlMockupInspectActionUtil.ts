import type { JsonValue } from 'tldraw'
import type { HtmlMockupInspectAction } from '../../shared/schema/AgentActionSchemas'
import type { Streaming } from '../../shared/types/Streaming'
import {
	fetchHtmlMockupSnapshot,
	getSelectedHtmlMockup,
} from '../parts/HtmlMockupContextPartUtil'
import { AgentActionUtil, registerActionUtil } from './AgentActionUtil'

export const HtmlMockupInspectActionUtil = registerActionUtil(
	class HtmlMockupInspectActionUtil extends AgentActionUtil<HtmlMockupInspectAction> {
		static override type = 'htmlMockupInspect' as const

		override getInfo(action: Streaming<HtmlMockupInspectAction>) {
			return {
				icon: 'search' as const,
				description: action.complete
					? 'Inspected Local HTML Mockup'
					: 'Inspecting Local HTML Mockup',
			}
		}

		override async applyAction(action: Streaming<HtmlMockupInspectAction>) {
			if (!action.complete) return
			const selected = getSelectedHtmlMockup(this.editor, action.documentRef)
			if (
				action.targetRef &&
				action.targetRef !== selected.selectedTargetRef
			) {
				throw new Error(
					'Local HTML Mockup inspection target does not match the resident picker selection',
				)
			}
			const targetRef = selected.selectedTargetRef
			const snapshot = await fetchHtmlMockupSnapshot(
				selected.documentRef,
				selected.revision,
				targetRef,
			)
			const current = getSelectedHtmlMockup(this.editor, selected.documentRef)
			if (
				current.shapeId !== selected.shapeId ||
				current.revision !== selected.revision ||
				current.selectedTargetRef !== selected.selectedTargetRef
			) {
				throw new Error(
					'Local HTML Mockup selection changed while it was being inspected',
				)
			}
			const result = {
				kind: 'local-html-mockup-snapshot',
				documentRef: snapshot.documentRef,
				revision: snapshot.revision,
				title: snapshot.title,
				bytes: snapshot.bytes,
				nodes: snapshot.nodes,
				...(snapshot.target ? { target: snapshot.target } : {}),
				...(snapshot.contextRef ? { contextRef: snapshot.contextRef } : {}),
				truncated: snapshot.truncated,
			}
			this.agent.schedule({ data: [result as unknown as JsonValue] })
		}
	},
)
