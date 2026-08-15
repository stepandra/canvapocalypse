import { useCallback, useMemo, useRef, useState } from 'react'
import {
	DEFAULT_EMBED_DEFINITIONS,
	DefaultSizeStyle,
	EmbedShapeUtil,
	TLComponents,
	Tldraw,
	TldrawUiToastsProvider,
	TLUiOverrides,
} from 'tldraw'
import { TldrawAgentApp } from './agent/TldrawAgentApp'
import {
	TldrawAgentAppContextProvider,
	TldrawAgentAppProvider,
} from './agent/TldrawAgentAppProvider'
import { CANVAPOCALYPSE_CANVAS_KIT_COMPOSITION } from './canvas-studio/host'
import { CustomHelperButtons } from './components/CustomHelperButtons'
import { DesignSystemShapeUtil } from './design-system/DesignSystemShape'
import { ExperimentCardShapeUtil } from './experiments/ExperimentCardShape'
import './experiments/experimentCard.css'
import { LocalHtmlMockupShapeUtil } from './html-mockup/LocalHtmlMockupShape'
import { ISOFLOW_EMBED_DEFINITION } from './isoflow/isoflowProvider'
import { CanvasLayoutControls } from './layout/components'
import { AgentHighlightOverlayUtil } from './overlays/AgentHighlightOverlayUtil'
import { TargetAreaTool } from './tools/TargetAreaTool'
import { TargetShapeTool } from './tools/TargetShapeTool'
import { WorkflowNodeShapeUtil } from './workflow/WorkflowNodeShape'
import { WorkflowRichOutputShapeUtil } from './workflow/RichOutputShape'
import { WORKFLOW_TOOLS } from './workflow/WorkflowTools'
import { bootstrapMlInternWorkflows } from './workflow/workflowCanvas'
import { WorkbenchShell } from './workbench/WorkbenchShell'
import { resolveCanvasPersistenceKey } from './workbench/workbenchPersistence'

// Customize tldraw's styles to play to the agent's strengths
DefaultSizeStyle.setDefaultValue('s')

// Custom tools for picking context items
const tools = [
	TargetShapeTool,
	TargetAreaTool,
	...WORKFLOW_TOOLS,
	...CANVAPOCALYPSE_CANVAS_KIT_COMPOSITION.tools,
]
const IsoflowEmbedShapeUtil = EmbedShapeUtil.configure({
	embedDefinitions: [ISOFLOW_EMBED_DEFINITION, ...DEFAULT_EMBED_DEFINITIONS],
})
const shapeUtils = [
	ExperimentCardShapeUtil,
	WorkflowNodeShapeUtil,
	WorkflowRichOutputShapeUtil,
	DesignSystemShapeUtil,
	LocalHtmlMockupShapeUtil,
	IsoflowEmbedShapeUtil,
	...CANVAPOCALYPSE_CANVAS_KIT_COMPOSITION.shapeUtils,
]
const bindingUtils = CANVAPOCALYPSE_CANVAS_KIT_COMPOSITION.bindingUtils
const overlayUtils = [AgentHighlightOverlayUtil]
const overrides: TLUiOverrides = {
	tools: (editor, tools) => {
		return {
			...tools,
			'target-area': {
				id: 'target-area',
				label: 'Pick Area',
				kbd: 'c',
				icon: 'tool-frame',
				onSelect() {
					editor.setCurrentTool('target-area')
				},
			},
			'target-shape': {
				id: 'target-shape',
				label: 'Pick Shape',
				kbd: 's',
				icon: 'tool-frame',
				onSelect() {
					editor.setCurrentTool('target-shape')
				},
			},
		}
	},
}

function App() {
	const [app, setApp] = useState<TldrawAgentApp | null>(null)
	const disposeCanvasKits = useRef<(() => void) | undefined>(undefined)
	const persistenceKey = resolveCanvasPersistenceKey(window.location.search)

	const handleUnmount = useCallback(() => {
		disposeCanvasKits.current?.()
		disposeCanvasKits.current = undefined
		setApp(null)
	}, [])
	const handleMount = useCallback((nextApp: TldrawAgentApp) => {
		disposeCanvasKits.current?.()
		disposeCanvasKits.current =
			CANVAPOCALYPSE_CANVAS_KIT_COMPOSITION.onMount(nextApp.editor) ?? undefined
		setApp(nextApp)
		const search = new URLSearchParams(window.location.search)
		if (search.get('workflow') === 'ml-intern') {
			bootstrapMlInternWorkflows(nextApp.editor)
		}
	}, [])

	// Custom components that need the agent app's React context
	const components: TLComponents = useMemo(() => {
		return {
			InFrontOfTheCanvas: () => (
				<>
					<WorkbenchShell app={app} />
					<CanvasLayoutControls />
				</>
			),
			HelperButtons: () =>
				app && (
					<TldrawAgentAppContextProvider app={app}>
						<CustomHelperButtons />
					</TldrawAgentAppContextProvider>
				),
		}
	}, [app])

	return (
		<TldrawUiToastsProvider>
			<div className="tldraw-agent-container">
				<div className="tldraw-canvas">
					<Tldraw
						persistenceKey={persistenceKey}
						tools={tools}
						shapeUtils={shapeUtils}
						bindingUtils={bindingUtils}
						overlayUtils={overlayUtils}
						overrides={overrides}
						components={components}
					>
						<TldrawAgentAppProvider onMount={handleMount} onUnmount={handleUnmount} />
					</Tldraw>
				</div>
			</div>
		</TldrawUiToastsProvider>
	)
}

export default App
