import React, { useEffect, useState } from 'react'
import { DEFAULT_EMBED_DEFINITIONS, EmbedShapeUtil, useEditor } from 'tldraw'
import { TldrawAgentApp } from '../client/agent/TldrawAgentApp'
import { AgentsModelsShapeUtil } from '../client/agents-models/AgentsModelsShape'
import { CANVAPOCALYPSE_CANVAS_KIT_COMPOSITION } from '../client/canvas-studio/host'
import { installBridgeSupervisorResidentCapability } from '../client/bridges/bridgeSupervisorClient'
import { DesignSystemShapeUtil } from '../client/design-system/DesignSystemShape'
import { ExperimentCardShapeUtil } from '../client/experiments/ExperimentCardShape'
import { installHtmlMockupResidentCapability } from '../client/html-mockup/htmlMockupBridge'
import { LocalHtmlMockupShapeUtil } from '../client/html-mockup/LocalHtmlMockupShape'
import { ISOFLOW_EMBED_DEFINITION } from '../client/isoflow/isoflowProvider'
import { AgentHighlightOverlayUtil } from '../client/overlays/AgentHighlightOverlayUtil'
import { TargetAreaTool } from '../client/tools/TargetAreaTool'
import { TargetShapeTool } from '../client/tools/TargetShapeTool'
import { WorkflowRichOutputShapeUtil } from '../client/workflow/RichOutputShape'
import { WorkflowNodeShapeUtil } from '../client/workflow/WorkflowNodeShape'
import { WORKFLOW_TOOLS } from '../client/workflow/WorkflowTools'
import { WorkbenchShell } from '../client/workbench/WorkbenchShell'
import designSystemStylesheet from '../client/design-system/design-system.css'
import experimentCardStylesheet from '../client/experiments/experimentCard.css'
import terminalSessionMonitorStylesheet from '../client/terminal/terminalSessionMonitor.css'
import workbenchStylesheet from '../client/workbench/workbench.css'
import workbenchAgentDockStylesheet from '../client/workbench/workbenchAgentDock.css'
import { mergeUniqueRegistrations } from './tldraw-desktop-config-dedupe'
import {
	markWorkbenchDesktopLayer,
	unwrapWorkbenchDesktopLayer,
} from './tldraw-desktop-config-layer'
import stylesheet from './tldraw-desktop-eval-lab.css'

declare const __TLDRAW_HTML_MOCKUP_RESIDENT_CAPABILITY__: string

// The Offline build helper injects the same persistent process capability used
// by the loopback bridge. Missing injection fails while loading this config.
// The value stays in the resident module closure and never enters canvas
// metadata or prompts.
installHtmlMockupResidentCapability(
	__TLDRAW_HTML_MOCKUP_RESIDENT_CAPABILITY__
)
installBridgeSupervisorResidentCapability(
	__TLDRAW_HTML_MOCKUP_RESIDENT_CAPABILITY__
)

const IsoflowEmbedShapeUtil = EmbedShapeUtil.configure({
	embedDefinitions: [ISOFLOW_EMBED_DEFINITION, ...DEFAULT_EMBED_DEFINITIONS],
})
const desktopStylesheet = [
	designSystemStylesheet as unknown as string,
	experimentCardStylesheet as unknown as string,
	terminalSessionMonitorStylesheet as unknown as string,
	workbenchStylesheet as unknown as string,
	workbenchAgentDockStylesheet as unknown as string,
	stylesheet as unknown as string,
].join('\n')

function WorkbenchDesktopLayer() {
	const editor = useEditor()
	const [app, setApp] = useState<TldrawAgentApp | null>(null)

	useEffect(() => {
		const instance = new TldrawAgentApp(editor, { onError: console.error })
		instance.persistence.loadState()
		instance.agents.ensureAtLeastOneAgent()
		instance.persistence.startAutoSave()
		setApp(instance)
		return () => instance.dispose()
	}, [editor])

	return (
		<>
			<style>{desktopStylesheet}</style>
			<WorkbenchShell app={app} />
		</>
	)
}

/** @param {import('../.script-workspace/script-context').ConfigScriptContext} ctx */
export default function ({ config }: { config: any }) {
	const PreviousInFrontOfTheCanvas = unwrapWorkbenchDesktopLayer(
		config.components.InFrontOfTheCanvas
	)

	function InFrontOfTheCanvas() {
		return (
			<>
				{PreviousInFrontOfTheCanvas && <PreviousInFrontOfTheCanvas />}
				<WorkbenchDesktopLayer />
			</>
		)
	}
	markWorkbenchDesktopLayer(
		InFrontOfTheCanvas,
		PreviousInFrontOfTheCanvas
	)

	return {
		...config,
		shapeUtils: mergeUniqueRegistrations(
			config.shapeUtils,
			[
				...CANVAPOCALYPSE_CANVAS_KIT_COMPOSITION.shapeUtils,
				AgentsModelsShapeUtil,
				ExperimentCardShapeUtil,
				WorkflowNodeShapeUtil,
				WorkflowRichOutputShapeUtil,
				DesignSystemShapeUtil,
				LocalHtmlMockupShapeUtil,
				IsoflowEmbedShapeUtil,
			],
			'type'
		),
		bindingUtils: mergeUniqueRegistrations(
			config.bindingUtils,
			CANVAPOCALYPSE_CANVAS_KIT_COMPOSITION.bindingUtils,
			'type'
		),
		tools: mergeUniqueRegistrations(
			config.tools,
			[
				...CANVAPOCALYPSE_CANVAS_KIT_COMPOSITION.tools,
				TargetShapeTool,
				TargetAreaTool,
				...WORKFLOW_TOOLS,
			],
			'id'
		),
		overlayUtils: mergeUniqueRegistrations(
			config.overlayUtils,
			[AgentHighlightOverlayUtil],
			'type'
		),
		components: {
			...config.components,
			InFrontOfTheCanvas,
		},
	}
}
