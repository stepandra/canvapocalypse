import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const shapeSource = readFileSync(
	new URL('./AgentsModelsShape.tsx', import.meta.url),
	'utf8'
)
const scriptSource = readFileSync(
	new URL('../../scripts/agents-models-canvas-script.mjs', import.meta.url),
	'utf8'
)
const stylesheetSource = readFileSync(
	new URL('../../scripts/tldraw-desktop-eval-lab.css', import.meta.url),
	'utf8'
)
const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')
const shellSource = readFileSync(
	new URL('../workbench/WorkbenchShell.tsx', import.meta.url),
	'utf8'
)
const runtimeSource = readFileSync(
	new URL('./grokWorkspaceRuntime.ts', import.meta.url),
	'utf8'
)
const stylePanelSource = readFileSync(
	new URL('../workbench/WorkbenchStylePanel.tsx', import.meta.url),
	'utf8'
)

describe('Agents / Models native workflow surface', () => {
	it('uses one custom shape with real controls for all logical card roles', () => {
		expect(shapeSource).toContain(
			"export const AGENTS_MODELS_SHAPE_TYPE = 'agents-models-node'"
		)
		expect(shapeSource).toContain('<AgentsModelsToolbar')
		expect(shapeSource).toContain('<AgentsModelsCatalog')
		expect(shapeSource).toContain('<AgentsModelsStage')
		expect(shapeSource).toContain('<AgentsModelsAgent')
		expect(shapeSource).toContain('<AgentsModelsPersona')
		expect(shapeSource).toContain('<AgentsModelsExtendedNode')
		expect(shapeSource.match(/<button/g)?.length).toBeGreaterThanOrEqual(3)
		expect(shapeSource.match(/<select/g)?.length).toBeGreaterThanOrEqual(4)
	})

	it('routes toolbar controls through explicit inspectable requests', () => {
		expect(shapeSource).toContain('actionRequest:')
		expect(shapeSource).toContain(
			"kind: 'preset' | 'node' | 'preflight' | 'apply' | 'play' | 'config-sync'"
		)
		expect(shapeSource).toContain('nodeKind?: AgentsModelsNodeKind')
		expect(shapeSource).toContain("capabilityMode?: 'all' | 'read-only'")
		expect(shapeSource).toContain("value={meta.capabilityMode || 'all'}")
		expect(shapeSource).toContain('select .agents/skills entry')
		expect(scriptSource).toContain('const onToolbarActionMaybe = () =>')
		expect(scriptSource).toContain('handledActionRequests.has(request.id)')
		expect(scriptSource).not.toContain('onSelectionMaybeClick')
		expect(scriptSource).not.toContain("selectNone?.()")
	})

	it('uses the shared light workflow card anatomy for editable graph nodes', () => {
		expect(shapeSource).toContain('workflow-node-card agents-models-workflow-node')
		expect(shapeSource).toContain('<WorkflowCardHeader')
		expect(shapeSource).toContain('<WorkflowCardFooter')
		expect(shapeSource).toContain('workflow-node-card-description')
		expect(shapeSource).toContain('workflow-node-port')
	})

	it('materializes logical workflow nodes as native roots', () => {
		expect(scriptSource).toContain('type: AGENTS_MODELS_SHAPE_TYPE')
		expect(scriptSource).toContain(
			'(spec) => spec.kind === "stage" || spec.kind === "subagent"'
		)
		expect(scriptSource).toContain('createArrowBetweenShapes(from, to')
		expect(scriptSource).toContain('collectBoundWorkflowEdges(')
	})

	it('materializes a dragged catalog row through the same inspected action seam', () => {
		expect(shapeSource).toContain('editor.screenToPage({')
		expect(shapeSource).toContain("source: 'catalog'")
		expect(shapeSource).toContain('catalogItemId: item.id')
		expect(shapeSource).toContain('dropPoint: { x: pagePoint.x, y: pagePoint.y }')
		expect(scriptSource).toContain('catalogItemId: request.catalogItemId')
		expect(scriptSource).toContain('dropPoint: request.dropPoint')
	})

	it('uses dimension-aware resize and responsive node fields', () => {
		expect(shapeSource).toContain('return resizeBox(shape, info')
		expect(shapeSource).toContain("minWidth: role === 'catalog' ? 300 : 210")
		expect(shapeSource).toContain('is-responsive-fields')
		expect(stylesheetSource).toContain('container-name: agents-models-workflow-node')
		expect(stylesheetSource).toContain(
			'@container agents-models-workflow-node (max-width: 259px)'
		)
		expect(stylesheetSource).toContain('.agents-models-catalog-row')
	})

	it('mounts the complete Grok workspace on its dedicated web page', () => {
		expect(appSource).toContain('mountGrokWorkspaceRuntime(nextApp.editor)')
		expect(appSource).toContain("? 'agents-models'")
		expect(shellSource).toContain("pageMode === 'agents-models'")
		expect(shellSource).toContain('<GrokToolboxLayer showToolbox={false} />')
		expect(shellSource).toContain('<GrokWorkflowToolbox inToolbar />')
		expect(stylesheetSource).toContain(
			'.tlui-dialog__content:has(> .grok-definition-dialog)'
		)
		expect(stylesheetSource).toContain('.grok-definition-fields')
		expect(runtimeSource).toContain('agentsModelsDocumentScript({ editor })')
		expect(runtimeSource).toContain("_materializePreset('fanout')")
		expect(runtimeSource).toContain('frameGrokWorkspace(editor)')
		expect(stylePanelSource).toContain("pageMode === 'agents-models'")
		expect(scriptSource).toContain('name: "PHASE"')
		expect(scriptSource).toContain('name: "SUBAGENT RUN / PERSONA"')
	})
})
