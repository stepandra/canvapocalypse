import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const desktopConfigSource = readFileSync(
	new URL('./tldraw-desktop-eval-lab-config-factory.tsx', import.meta.url),
	'utf8'
)

describe('tldraw Offline config parity', () => {
	it('registers the bounded context picker tools used by the browser surface', () => {
		expect(desktopConfigSource).toContain(
			"import { TargetAreaTool } from '../client/tools/TargetAreaTool'"
		)
		expect(desktopConfigSource).toContain(
			"import { TargetShapeTool } from '../client/tools/TargetShapeTool'"
		)
		expect(desktopConfigSource).toMatch(
			/const desktopTools = mergeUniqueRegistrations\(\s*config\.tools,\s*\[[\s\S]*TargetShapeTool,[\s\S]*TargetAreaTool,[\s\S]*\.\.\.WORKFLOW_TOOLS,[\s\S]*\],\s*'id'/
		)
	})

	it('registers the same agent activity overlay as the browser surface', () => {
		expect(desktopConfigSource).toContain(
			"import { AgentHighlightOverlayUtil } from '../client/overlays/AgentHighlightOverlayUtil'"
		)
		expect(desktopConfigSource).toMatch(
			/overlayUtils:\s*mergeUniqueRegistrations\(\s*config\.overlayUtils,\s*\[AgentHighlightOverlayUtil\],\s*'type'/
		)
	})

	it('registers the Local HTML Mockup custom shape used by the browser surface', () => {
		expect(desktopConfigSource).toContain(
			"import { LocalHtmlMockupShapeUtil } from '../client/html-mockup/LocalHtmlMockupShape'"
		)
		expect(desktopConfigSource).toMatch(
			/const desktopShapeUtils = mergeUniqueRegistrations\(\s*config\.shapeUtils,\s*\[[\s\S]*LocalHtmlMockupShapeUtil,[\s\S]*\],\s*'type'/
		)
	})

	it('registers the native Agents / Models workflow cards', () => {
		expect(desktopConfigSource).toContain(
			"import { AgentsModelsShapeUtil } from '../client/agents-models/AgentsModelsShape'"
		)
		expect(desktopConfigSource).toContain(
			'...(suppliesCanonicalAgentsModelsShape ? [] : [AgentsModelsShapeUtil])'
		)
	})

	it('keeps host-native registrations deduped after external registrations', () => {
		expect(desktopConfigSource.indexOf('...desktopComposition.shapeUtils')).toBeLessThan(
			desktopConfigSource.indexOf(
				'...(suppliesCanonicalAgentsModelsShape ? [] : [AgentsModelsShapeUtil])'
			)
		)
		expect(
			desktopConfigSource.indexOf('...desktopComposition.tools')
		).toBeLessThan(
			desktopConfigSource.indexOf('TargetShapeTool,')
		)
	})

	it('uses the Offline-compatible slice of one supplied composition', () => {
		expect(desktopConfigSource).toContain(
			'export function createTldrawDesktopEvalLabConfig('
		)
		expect(desktopConfigSource).toContain('...desktopComposition.shapeUtils')
		expect(desktopConfigSource).toContain('desktopComposition.bindingUtils')
		expect(desktopConfigSource).toContain('...desktopComposition.tools')
		expect(desktopConfigSource).toContain(
			'composition={desktopComposition}'
		)
	})

	it('keeps the Grok Agents / Models util canonical and registers its port gesture', () => {
		expect(desktopConfigSource).toContain(
			'suppliesCanonicalAgentsModelsShape'
		)
		expect(desktopConfigSource).toContain(
			'...(suppliesCanonicalAgentsModelsShape ? [] : [AgentsModelsShapeUtil])'
		)
		expect(desktopConfigSource).toContain('...desktopComposition.tools')
	})

	it('fails custom-record kits closed with an explicit diagnostic', () => {
		expect(desktopConfigSource).toContain(
			"Object.keys(contribution.records ?? {}).length > 0"
		)
		expect(desktopConfigSource).toContain(
			'Unavailable in tldraw Offline:'
		)
		expect(desktopConfigSource).toContain(
			'its document-script host cannot register.'
		)
	})

	it('mounts and disposes live contributions with the supplied composition', () => {
		expect(desktopConfigSource).toContain(
			'useEffect(() => composition.onMount(editor), [composition, editor])'
		)
	})

	it('materializes mode pages and publishes their exact capability catalog in Offline', () => {
		expect(desktopConfigSource).toContain(
			"import { ensureWorkbenchModePages } from '../client/workbench/workbenchPages'"
		)
		expect(desktopConfigSource).toContain('ensureWorkbenchModePages(editor)')
		expect(desktopConfigSource).toContain('resolveAgentPageRegistrations({')
		expect(desktopConfigSource).toContain('buildCanvasRuntimeCapabilityCatalog({')
		expect(desktopConfigSource).toContain('publishCompanionCanvasCapabilityCatalog(')
	})

	it('registers the C1-style experiment card shape used by both surfaces', () => {
		expect(desktopConfigSource).toContain(
			"import { ExperimentCardShapeUtil } from '../client/experiments/ExperimentCardShape'"
		)
		expect(desktopConfigSource).toMatch(
			/const desktopShapeUtils = mergeUniqueRegistrations\(\s*config\.shapeUtils,\s*\[[\s\S]*ExperimentCardShapeUtil,[\s\S]*\],\s*'type'/
		)
		expect(desktopConfigSource).toContain(
			"import experimentCardStylesheet from '../client/experiments/experimentCard.css'"
		)
	})

	it('installs the Markdown document surface and import toolbar in Offline', () => {
		expect(desktopConfigSource).toContain(
			"import markdownDocumentStylesheet from '../client/markdown/markdownDocument.css'"
		)
		expect(desktopConfigSource).toContain(
			"import { WorkbenchToolbar } from '../client/workbench/WorkbenchToolbar'"
		)
		expect(desktopConfigSource).toContain('Toolbar: WorkbenchToolbar')
	})

	it('requires the Offline entry to install its resident HTML capability', () => {
		const desktopEntrySource = readFileSync(
			new URL('./tldraw-desktop-eval-lab-config.tsx', import.meta.url),
			'utf8'
		)
		expect(desktopEntrySource).toContain(
			'installHtmlMockupResidentCapability(\n\t__TLDRAW_HTML_MOCKUP_RESIDENT_CAPABILITY__\n)'
		)
		expect(desktopEntrySource).not.toContain(
			"typeof __TLDRAW_HTML_MOCKUP_RESIDENT_CAPABILITY__"
		)
	})

	it('installs the same resident capability for the bridge supervisor client', () => {
		const desktopEntrySource = readFileSync(
			new URL('./tldraw-desktop-eval-lab-config.tsx', import.meta.url),
			'utf8'
		)
		expect(desktopEntrySource).toContain(
			"import { installBridgeSupervisorResidentCapability } from '../client/bridges/bridgeSupervisorClient'"
		)
		expect(desktopEntrySource).toContain(
			'installBridgeSupervisorResidentCapability(\n\t__TLDRAW_HTML_MOCKUP_RESIDENT_CAPABILITY__\n)'
		)
	})

	it('replaces the prior workbench desktop layer on hot reapply', () => {
		expect(desktopConfigSource).toContain(
			"import {\n\tmarkWorkbenchDesktopLayer,\n\tunwrapWorkbenchDesktopLayer,\n} from './tldraw-desktop-config-layer'"
		)
		expect(desktopConfigSource).toContain(
			'const PreviousInFrontOfTheCanvas = unwrapWorkbenchDesktopLayer('
		)
		expect(desktopConfigSource).toContain(
			'markWorkbenchDesktopLayer(\n\t\t\tInFrontOfTheCanvas,\n\t\t\tPreviousInFrontOfTheCanvas\n\t\t)'
		)
	})
})
