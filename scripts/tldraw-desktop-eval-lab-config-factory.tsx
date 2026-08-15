import React, { useEffect, useState } from 'react'
import { DEFAULT_EMBED_DEFINITIONS, EmbedShapeUtil, useEditor } from 'tldraw'
import { TldrawAgentApp } from '../client/agent/TldrawAgentApp'
import { AgentsModelsShapeUtil } from '../client/agents-models/AgentsModelsShape'
import { CANVAPOCALYPSE_CANVAS_KIT_COMPOSITION } from '../client/canvas-studio/host'
import type { CanvasKitComposition } from '../client/canvas-studio/types'
import { DesignSystemShapeUtil } from '../client/design-system/DesignSystemShape'
import { ExperimentCardShapeUtil } from '../client/experiments/ExperimentCardShape'
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

function WorkbenchDesktopLayer({
	composition,
}: {
	composition: CanvasKitComposition
}) {
	const editor = useEditor()
	const [app, setApp] = useState<TldrawAgentApp | null>(null)

	useEffect(() => composition.onMount(editor), [composition, editor])

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
			<WorkbenchShell app={app} canvasKitComposition={composition} />
		</>
	)
}

export function createTldrawDesktopEvalLabConfig(
	composition: CanvasKitComposition = CANVAPOCALYPSE_CANVAS_KIT_COMPOSITION
) {
	return function applyTldrawDesktopEvalLabConfig({ config }: { config: any }) {
		const PreviousInFrontOfTheCanvas = unwrapWorkbenchDesktopLayer(
			config.components.InFrontOfTheCanvas
		)

		function InFrontOfTheCanvas() {
			return (
				<>
					{PreviousInFrontOfTheCanvas && <PreviousInFrontOfTheCanvas />}
					<WorkbenchDesktopLayer composition={composition} />
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
					...composition.shapeUtils,
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
				composition.bindingUtils,
				'type'
			),
			tools: mergeUniqueRegistrations(
				config.tools,
				[
					...composition.tools,
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
}
