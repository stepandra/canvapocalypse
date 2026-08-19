import { useCallback, useMemo, useRef, useState } from 'react'
import {
	DEFAULT_EMBED_DEFINITIONS,
	DefaultSizeStyle,
	EmbedShapeUtil,
	TLComponents,
	Tldraw,
	TldrawUiToastsProvider,
	TLUiOverrides,
	defaultAssetUtils,
	defaultBindingUtils,
	defaultShapeUtils,
} from 'tldraw'
import { TldrawAgentApp } from './agent/TldrawAgentApp'
import {
	TldrawAgentAppContextProvider,
	TldrawAgentAppProvider,
} from './agent/TldrawAgentAppProvider'
import { publishCompanionCanvasCapabilityCatalog } from './agent/companionCanvasBinding'
import { mountGrokWorkspaceRuntime } from './agents-models/grokWorkspaceRuntime'
import { resolveAgentPageRegistrations } from './canvas-studio/agentPageRegistrations'
import { readEmbeddedCanvasStudioCatalog } from './canvas-studio/catalog'
import { CANVAPOCALYPSE_CANVAS_KIT_COMPOSITION } from './canvas-studio/host'
import { buildCanvasRuntimeCapabilityCatalog } from './canvas-studio/runtimeCapabilityCatalog'
import { resolveCanvasRuntimePageMode } from './canvas-studio/runtimeCapabilityCatalog'
import { useCanvasStudioLocalStore } from './canvas-studio/useCanvasStudioLocalStore'
import { CommentOverlay } from './comments/CommentOverlay'
import { CustomHelperButtons } from './components/CustomHelperButtons'
import { DesignSystemShapeUtil } from './design-system/DesignSystemShape'
import { ExperimentCardShapeUtil } from './experiments/ExperimentCardShape'
import './experiments/experimentCard.css'
import { LocalHtmlMockupShapeUtil } from './html-mockup/LocalHtmlMockupShape'
import { ISOFLOW_EMBED_DEFINITION } from './isoflow/isoflowProvider'
import { CanvasLayoutControls } from './layout/components'
import './markdown/markdownDocument.css'
import { AgentHighlightOverlayUtil } from './overlays/AgentHighlightOverlayUtil'
import { TargetAreaTool } from './tools/TargetAreaTool'
import { TargetShapeTool } from './tools/TargetShapeTool'
import { WorkflowNodeShapeUtil } from './workflow/WorkflowNodeShape'
import { WorkflowRichOutputShapeUtil } from './workflow/RichOutputShape'
import { WORKFLOW_TOOLS } from './workflow/WorkflowTools'
import { bootstrapMlInternWorkflows } from './workflow/workflowCanvas'
import { EmojiStampTool } from './workbench/EmojiStampTool'
import { WorkbenchShell } from './workbench/WorkbenchShell'
import { resolveCanvasPersistenceKey } from './workbench/workbenchPersistence'
import { ensureWorkbenchModePages } from './workbench/workbenchPages'
import { WorkbenchStylePanel } from './workbench/WorkbenchStylePanel'
import { WorkbenchToolbar } from './workbench/WorkbenchToolbar'
import { readWorkbenchDomainSelection } from './workbench/workbenchState'

// Customize tldraw's styles to play to the agent's strengths
DefaultSizeStyle.setDefaultValue('s')

// Custom tools for picking context items
const hostTools = [
	TargetShapeTool,
	TargetAreaTool,
	EmojiStampTool,
	...WORKFLOW_TOOLS,
]
const tools = [...hostTools, ...CANVAPOCALYPSE_CANVAS_KIT_COMPOSITION.tools]
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

function mergeRegistrationsByType<
	Default extends { type: string },
	Custom extends { type: string },
>(
	defaults: readonly Default[],
	custom: readonly Custom[]
) {
	const customTypes = new Set(custom.map((registration) => registration.type))
	return [
		...defaults.filter((registration) => !customTypes.has(registration.type)),
		...custom,
	]
}

const storeShapeUtils = mergeRegistrationsByType(defaultShapeUtils, shapeUtils)
const storeBindingUtils = mergeRegistrationsByType(defaultBindingUtils, bindingUtils)

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
	const disposeCapabilityCatalog = useRef<(() => void) | undefined>(undefined)
	const disposeGrokWorkspace = useRef<(() => void) | undefined>(undefined)
	const persistenceKey = resolveCanvasPersistenceKey(window.location.search)
	const store = useCanvasStudioLocalStore({
		persistenceKey,
		shapeUtils: storeShapeUtils,
		bindingUtils: storeBindingUtils,
		assetUtils: defaultAssetUtils,
		records: CANVAPOCALYPSE_CANVAS_KIT_COMPOSITION.records,
	})

	const handleUnmount = useCallback(() => {
		disposeGrokWorkspace.current?.()
		disposeGrokWorkspace.current = undefined
		disposeCapabilityCatalog.current?.()
		disposeCapabilityCatalog.current = undefined
		disposeCanvasKits.current?.()
		disposeCanvasKits.current = undefined
		setApp(null)
	}, [])
	const handleMount = useCallback((nextApp: TldrawAgentApp) => {
		disposeGrokWorkspace.current?.()
		disposeCapabilityCatalog.current?.()
		disposeCanvasKits.current?.()
		disposeCanvasKits.current =
			CANVAPOCALYPSE_CANVAS_KIT_COMPOSITION.onMount(nextApp.editor) ?? undefined
		const search = new URLSearchParams(window.location.search)
		const hasRequestedMode =
			search.has('pack') ||
			search.get('workflow') === 'ml-intern' ||
			search.get('canvas') === 'eval-lab'
		const requestedPageMode = ['grok', 'agents-models'].includes(
			search.get('pack') ?? ''
		)
			? 'agents-models'
			: hasRequestedMode
				? readWorkbenchDomainSelection()
				: undefined
		ensureWorkbenchModePages(
			nextApp.editor,
			requestedPageMode
		)
		disposeGrokWorkspace.current = mountGrokWorkspaceRuntime(nextApp.editor)
		const studioCatalog = readEmbeddedCanvasStudioCatalog()
		let pageSignature = ''
		let disposePublishedCatalog: (() => void) | undefined
		const publishCurrentPageCatalog = () => {
			const page = nextApp.editor.getCurrentPage()
			const nextSignature = JSON.stringify({
				id: page.id,
				name: page.name,
				meta: page.meta,
			})
			if (nextSignature === pageSignature) return
			pageSignature = nextSignature
			const pageMode = resolveCanvasRuntimePageMode(page)
			const registrations = resolveAgentPageRegistrations({
				pageMode,
				composition: CANVAPOCALYPSE_CANVAS_KIT_COMPOSITION,
				shapeUtils: storeShapeUtils,
				bindingUtils: storeBindingUtils,
				tools,
			})
			disposePublishedCatalog?.()
			disposePublishedCatalog = publishCompanionCanvasCapabilityCatalog(
				buildCanvasRuntimeCapabilityCatalog({
				composition: CANVAPOCALYPSE_CANVAS_KIT_COMPOSITION,
				studioCatalog,
				page,
				shapeUtils: registrations.shapeUtils,
				bindingUtils: registrations.bindingUtils,
				tools: registrations.tools,
				})
			)
		}
		publishCurrentPageCatalog()
		const stopPublishingCatalog = nextApp.editor.store.listen(
			publishCurrentPageCatalog,
			{ scope: 'all', source: 'all' }
		)
		disposeCapabilityCatalog.current = () => {
			stopPublishingCatalog()
			disposePublishedCatalog?.()
			disposePublishedCatalog = undefined
		}
		setApp(nextApp)
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
					<CommentOverlay />
				</>
			),
			HelperButtons: () =>
				app && (
					<TldrawAgentAppContextProvider app={app}>
						<CustomHelperButtons />
					</TldrawAgentAppContextProvider>
				),
			StylePanel: WorkbenchStylePanel,
			Toolbar: WorkbenchToolbar,
			LoadingScreen: () => null,
		}
	}, [app])

	return (
		<TldrawUiToastsProvider>
			<div className="tldraw-agent-container">
				<div className="tldraw-canvas">
					<Tldraw
						store={store}
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
