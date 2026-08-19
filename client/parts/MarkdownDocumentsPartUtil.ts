import { convertTldrawIdToSimpleId } from '../../shared/format/convertTldrawShapeToFocusedShape'
import type { MarkdownDocumentsPart } from '../../shared/schema/PromptPartDefinitions'
import type { AgentRequest } from '../../shared/types/AgentRequest'
import { projectMarkdownDocumentsForAgent } from '../markdown/MarkdownDocumentShape'
import { getWorkbenchPageMode } from '../workbench/workbenchPages'
import { PromptPartUtil, registerPromptPartUtil } from './PromptPartUtil'

const MAX_SELECTED_MARKDOWN_CONTEXT_BYTES = 128 * 1024

export const MarkdownDocumentsPartUtil = registerPromptPartUtil(
	class MarkdownDocumentsPartUtil extends PromptPartUtil<MarkdownDocumentsPart> {
		static override type = 'markdownDocuments' as const

		override getPart(_request: AgentRequest): MarkdownDocumentsPart {
			const pageMode = getWorkbenchPageMode(this.editor)
			if (!pageMode || pageMode === 'freeform') {
				return { type: 'markdownDocuments', documents: [] }
			}
			const contexts = projectMarkdownDocumentsForAgent(
				this.editor.getSelectedShapes(),
				MAX_SELECTED_MARKDOWN_CONTEXT_BYTES
			)
			return {
				type: 'markdownDocuments',
				documents: contexts.map((context) => ({
					shapeId: convertTldrawIdToSimpleId(context.shapeId),
					documentRef: context.documentRef,
					revision: context.revision,
					bytes: context.bytes,
					title: context.title,
					...(context.sourceName ? { sourceName: context.sourceName } : {}),
					links: context.links,
					markdown: context.markdown,
					truncated: context.truncated,
				})),
			}
		}
	}
)
