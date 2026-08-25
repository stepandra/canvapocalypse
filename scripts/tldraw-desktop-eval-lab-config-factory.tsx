import React, { useEffect, useState } from 'react'
import {
	DEFAULT_EMBED_DEFINITIONS,
	defaultBindingUtils,
	defaultShapeUtils,
	EmbedShapeUtil,
	type TLAnyBindingUtilConstructor,
	type TLAnyShapeUtilConstructor,
	type TLStateNodeConstructor,
	useEditor,
} from 'tldraw'
import { TldrawAgentApp } from '../client/agent/TldrawAgentApp'
import { publishCompanionCanvasCapabilityCatalog } from '../client/agent/companionCanvasBinding'
import { resolveAgentPageRegistrations } from '../client/canvas-studio/agentPageRegistrations'
import { readEmbeddedCanvasStudioCatalog } from '../client/canvas-studio/catalog'
import { createCanvapocalypseOfflineCanvasKitComposition } from '../client/canvas-studio/host'
import {
	buildCanvasRuntimeCapabilityCatalog,
	resolveCanvasRuntimePageMode,
} from '../client/canvas-studio/runtimeCapabilityCatalog'
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
import { EmojiStampTool } from '../client/workbench/EmojiStampTool'
import { WorkbenchShell } from '../client/workbench/WorkbenchShell'
import { WorkbenchToolbar } from '../client/workbench/WorkbenchToolbar'
import { ensureWorkbenchModePages } from '../client/workbench/workbenchPages'
import designSystemStylesheet from '../client/design-system/design-system.css'
import experimentCardStylesheet from '../client/experiments/experimentCard.css'
import markdownDocumentStylesheet from '../client/markdown/markdownDocument.css'
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
	markdownDocumentStylesheet as unknown as string,
	terminalSessionMonitorStylesheet as unknown as string,
	workbenchStylesheet as unknown as string,
	workbenchAgentDockStylesheet as unknown as string,
	stylesheet as unknown as string,
].join('\n')

function WorkbenchDesktopLayer({
	composition,
	shapeUtils,
	bindingUtils,
	tools,
}: {
	composition: CanvasKitComposition
	shapeUtils: readonly TLAnyShapeUtilConstructor[]
	bindingUtils: readonly TLAnyBindingUtilConstructor[]
	tools: readonly TLStateNodeConstructor[]
}) {
	const editor = useEditor()
	const [app, setApp] = useState<TldrawAgentApp | null>(null)

	useEffect(() => composition.onMount(editor), [composition, editor])

	useEffect(() => {
		ensureWorkbenchModePages(editor)
		const studioCatalog = readEmbeddedCanvasStudioCatalog()
		let pageSignature = ''
		let disposePublishedCatalog: (() => void) | undefined
		const publishCurrentPageCatalog = () => {
			const page = editor.getCurrentPage()
			const nextSignature = JSON.stringify({ id: page.id, name: page.name, meta: page.meta })
			if (nextSignature === pageSignature) return
			pageSignature = nextSignature
			const pageMode = resolveCanvasRuntimePageMode(page)
			const registrations = resolveAgentPageRegistrations({
				pageMode,
				composition,
				shapeUtils,
				bindingUtils,
				tools,
			})
			disposePublishedCatalog?.()
			disposePublishedCatalog = publishCompanionCanvasCapabilityCatalog(
				buildCanvasRuntimeCapabilityCatalog({
					composition,
					studioCatalog,
					page,
					shapeUtils: registrations.shapeUtils,
					bindingUtils: registrations.bindingUtils,
					tools: registrations.tools,
				})
			)
		}
		publishCurrentPageCatalog()
		const stopPublishingCatalog = editor.store.listen(publishCurrentPageCatalog, {
			scope: 'all',
			source: 'all',
		})
		return () => {
			stopPublishingCatalog()
			disposePublishedCatalog?.()
		}
	}, [bindingUtils, composition, editor, shapeUtils, tools])

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
	composition: CanvasKitComposition = createCanvapocalypseOfflineCanvasKitComposition()
) {
	const recordKitIds = composition.contributions
		.filter((contribution) => Object.keys(contribution.records ?? {}).length > 0)
		.map((contribution) => contribution.kitId)
	if (recordKitIds.length > 0) {
		throw new Error(
			`tldraw Offline cannot register custom records required by Canvas Studio kits: ${recordKitIds.join(', ')}`
		)
	}

	return function applyTldrawDesktopEvalLabConfig({ config }: { config: any }) {
		const desktopShapeUtils = mergeUniqueRegistrations(
			config.shapeUtils,
			[
				...composition.shapeUtils,
				ExperimentCardShapeUtil,
				WorkflowNodeShapeUtil,
				WorkflowRichOutputShapeUtil,
				DesignSystemShapeUtil,
				LocalHtmlMockupShapeUtil,
				IsoflowEmbedShapeUtil,
			],
			'type'
		)
		const desktopBindingUtils = mergeUniqueRegistrations(
			config.bindingUtils,
			composition.bindingUtils,
			'type'
		)
		const desktopTools = mergeUniqueRegistrations(
			config.tools,
			[
				...composition.tools,
				TargetShapeTool,
				TargetAreaTool,
				EmojiStampTool,
				...WORKFLOW_TOOLS,
			],
			'id'
		)
		const desktopCatalogShapeUtils = mergeUniqueRegistrations(
			defaultShapeUtils,
			desktopShapeUtils,
			'type'
		)
		const desktopCatalogBindingUtils = mergeUniqueRegistrations(
			defaultBindingUtils,
			desktopBindingUtils,
			'type'
		)
		const PreviousInFrontOfTheCanvas = unwrapWorkbenchDesktopLayer(
			config.components.InFrontOfTheCanvas
		)

		function InFrontOfTheCanvas() {
			return (
				<>
					{PreviousInFrontOfTheCanvas && <PreviousInFrontOfTheCanvas />}
					<WorkbenchDesktopLayer
						composition={composition}
						shapeUtils={desktopCatalogShapeUtils}
						bindingUtils={desktopCatalogBindingUtils}
						tools={desktopTools}
					/>
				</>
			)
		}
		markWorkbenchDesktopLayer(
			InFrontOfTheCanvas,
			PreviousInFrontOfTheCanvas
		)

		return {
			...config,
			shapeUtils: desktopShapeUtils,
			bindingUtils: desktopBindingUtils,
			tools: desktopTools,
			overlayUtils: mergeUniqueRegistrations(
				config.overlayUtils,
				[AgentHighlightOverlayUtil],
				'type'
			),
			components: {
				...config.components,
				InFrontOfTheCanvas,
				Toolbar: WorkbenchToolbar,
			},
		}
	}
}
