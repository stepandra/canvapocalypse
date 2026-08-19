import {
	DefaultStylePanel,
	DefaultStylePanelContent,
	type TLShape,
	type TLUiStylePanelProps,
	useEditor,
	useValue,
} from 'tldraw'
import { CONSTRAINT_LAYOUT_SHAPE_TYPE } from '../layout/binding'
import { CanvasLayoutSelectionControls } from '../layout/components'
import { FLEX_LAYOUT_SHAPE_TYPE } from '../layout/flex'
import { resolveCanvasRuntimePageMode } from '../canvas-studio/runtimeCapabilityCatalog'
import { WorkflowInspector } from '../workflow/WorkflowOverlay'
import { getWorkflowNodeMeta, isWorkflowNode, type WorkflowNodeShape } from '../workflow/workflowCanvas'
import { WORKBENCH_NATIVE_SHAPE_SCHEMA } from './workbenchCanvas'

interface SelectedWorkbenchMeta {
	pack: string
	templateId: string
	artifact?: { title?: string; kind?: string; role?: string }
	relation?: { type?: string; label?: string }
	conversation?: {
		branchName?: string
		comparedBranchName?: string
	}
}

function getSelectedWorkbenchMeta(shape: TLShape): SelectedWorkbenchMeta | null {
	const workbench = (shape.meta as { workbench?: SelectedWorkbenchMeta & { schema?: string } }).workbench
	return workbench?.schema === WORKBENCH_NATIVE_SHAPE_SCHEMA ? workbench : null
}

function WorkbenchSelectionContext() {
	const editor = useEditor()
	const selectedShape = useValue(
		'workbench style panel selection',
		() =>
			editor
				.getSelectedShapes()
				.find(
					(shape) =>
						isWorkflowNode(shape) ||
						shape.type === FLEX_LAYOUT_SHAPE_TYPE ||
						shape.type === CONSTRAINT_LAYOUT_SHAPE_TYPE ||
						Boolean(getSelectedWorkbenchMeta(shape))
				) ?? null,
		[editor]
	)

	if (!selectedShape) return null

	let label = 'Layout'
	let detail = 'Selection controls'
	const workbenchMeta = getSelectedWorkbenchMeta(selectedShape)
	if (isWorkflowNode(selectedShape)) {
		const meta = getWorkflowNodeMeta(selectedShape)
		label = meta.kind.replaceAll('-', ' ')
		detail = meta.readonly ? 'Read only' : meta.status
	} else if (selectedShape.type === FLEX_LAYOUT_SHAPE_TYPE) {
		label = 'Flex layout'
		detail = 'Shape context'
	} else if (selectedShape.type === CONSTRAINT_LAYOUT_SHAPE_TYPE) {
		label = 'Constraint layout'
		detail = 'Shape context'
	} else if (workbenchMeta) {
		label =
			workbenchMeta.artifact?.title ??
			workbenchMeta.relation?.label ??
			workbenchMeta.relation?.type ??
			workbenchMeta.templateId.replaceAll('-', ' ')
		detail = workbenchMeta.artifact?.kind ?? workbenchMeta.pack
	}

	return (
		<section className="workbench-selection-context" aria-label="Selected shape context">
			<header className="workbench-selection-context__header">
				<span>SELECTION</span>
				<strong>{label}</strong>
				<small>{detail}</small>
			</header>
			{workbenchMeta ? (
				<div className="workbench-selection-artifact">
					<span>
						{workbenchMeta.pack} · {workbenchMeta.templateId.replaceAll('-', ' ')}
					</span>
					{workbenchMeta.conversation?.branchName && (
						<strong>
							Branch · {workbenchMeta.conversation.branchName}
							{workbenchMeta.conversation.comparedBranchName
								? ` ↔ ${workbenchMeta.conversation.comparedBranchName}`
								: ''}
						</strong>
					)}
				</div>
			) : isWorkflowNode(selectedShape) ? (
				<WorkflowInspector key={selectedShape.id} shape={selectedShape as WorkflowNodeShape} />
			) : (
				<CanvasLayoutSelectionControls />
			)}
		</section>
	)
}

export function WorkbenchStylePanel(props: TLUiStylePanelProps) {
	const editor = useEditor()
	const pageMode = useValue(
		'workbench style panel page mode',
		() => resolveCanvasRuntimePageMode(editor.getCurrentPage()),
		[editor]
	)
	if (pageMode === 'agents-models') return null

	return (
		<DefaultStylePanel {...props}>
			<DefaultStylePanelContent />
			<WorkbenchSelectionContext />
		</DefaultStylePanel>
	)
}
