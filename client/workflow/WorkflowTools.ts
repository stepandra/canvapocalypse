import { StateNode } from 'tldraw'
import { createStandaloneWorkflowNode } from './workflowCanvas'

abstract class WorkflowPlacementTool extends StateNode {
	abstract readonly kind: Parameters<typeof createStandaloneWorkflowNode>[1]
	readonly preset?: Parameters<typeof createStandaloneWorkflowNode>[2]

	override onEnter() {
		this.editor.setCursor({ type: 'cross', rotation: 0 })
	}

	override onExit() {
		this.editor.setCursor({ type: 'default', rotation: 0 })
	}

	override onCancel() {
		this.editor.setCurrentTool('select')
	}

	override onInterrupt() {
		this.editor.setCurrentTool('select')
	}

	override onPointerDown() {
		createStandaloneWorkflowNode(this.editor, this.kind, this.preset)
		this.editor.setCurrentTool('select')
	}
}

class WorkflowInputTool extends WorkflowPlacementTool {
	static override id = 'workflow-input'
	readonly kind = 'input' as const
}
class WorkflowTriggerTool extends WorkflowPlacementTool {
	static override id = 'workflow-trigger'
	readonly kind = 'trigger' as const
}
class WorkflowActionTool extends WorkflowPlacementTool {
	static override id = 'workflow-action'
	readonly kind = 'action' as const
}
class WorkflowDecisionTool extends WorkflowPlacementTool {
	static override id = 'workflow-decision'
	readonly kind = 'decision' as const
}
class WorkflowOpenRouterLlmTool extends WorkflowPlacementTool {
	static override id = 'workflow-openrouter-llm'
	readonly kind = 'llm' as const
	override readonly preset = 'openrouter' as const
}
class WorkflowCompatibleLlmTool extends WorkflowPlacementTool {
	static override id = 'workflow-compatible-llm'
	readonly kind = 'llm' as const
	override readonly preset = 'compatible' as const
}
class WorkflowHumanTool extends WorkflowPlacementTool {
	static override id = 'workflow-human'
	readonly kind = 'human' as const
}
class WorkflowDataTool extends WorkflowPlacementTool {
	static override id = 'workflow-data'
	readonly kind = 'data' as const
}
class WorkflowOutputTool extends WorkflowPlacementTool {
	static override id = 'workflow-output'
	readonly kind = 'output' as const
}
class WorkflowRichOutputTool extends WorkflowPlacementTool {
	static override id = 'workflow-rich-output'
	readonly kind = 'rich-output' as const
}

export const WORKFLOW_TOOLS = [
	WorkflowInputTool,
	WorkflowTriggerTool,
	WorkflowActionTool,
	WorkflowDecisionTool,
	WorkflowOpenRouterLlmTool,
	WorkflowCompatibleLlmTool,
	WorkflowHumanTool,
	WorkflowDataTool,
	WorkflowOutputTool,
	WorkflowRichOutputTool,
]
