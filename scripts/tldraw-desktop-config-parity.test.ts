import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const desktopConfigSource = readFileSync(
	new URL('./tldraw-desktop-eval-lab-config.tsx', import.meta.url),
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
			/tools:\s*mergeUniqueRegistrations\(\s*config\.tools,\s*\[TargetShapeTool,\s*TargetAreaTool,\s*\.\.\.WORKFLOW_TOOLS\],\s*'id'/
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

	it('requires the Offline bundle to install its resident HTML capability', () => {
		expect(desktopConfigSource).toContain(
			'installHtmlMockupResidentCapability(\n\t__TLDRAW_HTML_MOCKUP_RESIDENT_CAPABILITY__\n)'
		)
		expect(desktopConfigSource).not.toContain(
			"typeof __TLDRAW_HTML_MOCKUP_RESIDENT_CAPABILITY__"
		)
	})
})
