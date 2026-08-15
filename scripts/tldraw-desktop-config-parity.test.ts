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
			/tools:\s*mergeUniqueRegistrations\(\s*config\.tools,\s*\[[\s\S]*TargetShapeTool,[\s\S]*TargetAreaTool,[\s\S]*\.\.\.WORKFLOW_TOOLS,[\s\S]*\],\s*'id'/
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
			/shapeUtils:\s*mergeUniqueRegistrations\(\s*config\.shapeUtils,\s*\[[\s\S]*LocalHtmlMockupShapeUtil,[\s\S]*\],\s*'type'/
		)
	})

	it('registers the native Agents / Models workflow cards', () => {
		expect(desktopConfigSource).toContain(
			"import { AgentsModelsShapeUtil } from '../client/agents-models/AgentsModelsShape'"
		)
		expect(desktopConfigSource).toMatch(
			/shapeUtils:\s*mergeUniqueRegistrations\(\s*config\.shapeUtils,\s*\[[\s\S]*AgentsModelsShapeUtil,[\s\S]*\],\s*'type'/
		)
	})

	it('keeps host-native registrations deduped after external registrations', () => {
		expect(desktopConfigSource.indexOf('...composition.shapeUtils')).toBeLessThan(
			desktopConfigSource.indexOf('AgentsModelsShapeUtil,')
		)
		expect(desktopConfigSource.indexOf('...composition.tools')).toBeLessThan(
			desktopConfigSource.indexOf('TargetShapeTool,')
		)
	})

	it('uses one supplied Canvas Kit composition for registrations and palette dispatch', () => {
		expect(desktopConfigSource).toContain(
			'export function createTldrawDesktopEvalLabConfig('
		)
		expect(desktopConfigSource).toContain('...composition.shapeUtils')
		expect(desktopConfigSource).toContain('composition.bindingUtils')
		expect(desktopConfigSource).toContain('...composition.tools')
		expect(desktopConfigSource).toContain(
			'<WorkbenchDesktopLayer composition={composition} />'
		)
	})

	it('mounts and disposes live contributions with the supplied composition', () => {
		expect(desktopConfigSource).toContain(
			'useEffect(() => composition.onMount(editor), [composition, editor])'
		)
	})

	it('registers the C1-style experiment card shape used by both surfaces', () => {
		expect(desktopConfigSource).toContain(
			"import { ExperimentCardShapeUtil } from '../client/experiments/ExperimentCardShape'"
		)
		expect(desktopConfigSource).toMatch(
			/shapeUtils:\s*mergeUniqueRegistrations\(\s*config\.shapeUtils,\s*\[[\s\S]*ExperimentCardShapeUtil,[\s\S]*\],\s*'type'/
		)
		expect(desktopConfigSource).toContain(
			"import experimentCardStylesheet from '../client/experiments/experimentCard.css'"
		)
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
