import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { WORKBENCH_DOMAIN_PACKS } from '../workbench/domainPacks'
import { WORKBENCH_TOOL_PROFILES } from '../workbench/workbenchToolProfiles'

const overlaySource = readFileSync(
	new URL('./WorkflowOverlay.tsx', import.meta.url),
	'utf8'
)
const workbenchShellSource = readFileSync(
	new URL('../workbench/WorkbenchShell.tsx', import.meta.url),
	'utf8'
)

describe('WorkflowOverlay native tldraw chrome', () => {
	it('uses the public toolbar controls as an icon-first 48px tool rail', () => {
		expect(overlaySource).toContain('TldrawUiPopover')
		expect(overlaySource).toContain('className="workflow-palette-toggle"')
		expect(overlaySource).toContain('TldrawUiToolbar')
		expect(overlaySource).toContain('orientation="grid"')
		expect(overlaySource).toContain('TldrawUiToolbarButton')
		expect(overlaySource).toContain('type="tool"')
		expect(overlaySource).toContain('tooltip={label}')
		expect(overlaySource).not.toContain('showLabel')
		expect(overlaySource).not.toContain('has-label')
	})

	it('uses public tldraw controls for ordinary inspector actions and choices', () => {
		expect(overlaySource).toContain('TldrawUiButton')
		expect(overlaySource).toContain('TldrawUiInput')
		expect(overlaySource).toContain('TldrawUiSelect')
		expect(overlaySource).toContain('TldrawUiSelectTrigger')
		expect(overlaySource).toContain('TldrawUiSelectItem')
		expect(overlaySource).toContain('className="tlui-menu workflow-inspector"')
	})

	it('drives the visible overlay from the active declarative tool profile', () => {
		expect(WORKBENCH_DOMAIN_PACKS.ml.toolProfile).toBe('ml-workflow')
		expect(WORKBENCH_DOMAIN_PACKS.product.toolProfile).toBe('product-planning')
		expect(WORKBENCH_DOMAIN_PACKS.architecture.toolProfile).toBeNull()
		expect(WORKBENCH_DOMAIN_PACKS.uiux.toolProfile).toBeNull()
		expect(workbenchShellSource).toContain(
			'resolveWorkbenchToolProfile(activePack.toolProfile)'
		)
		expect(workbenchShellSource).toContain('profile={toolProfile}')
		expect(overlaySource).toContain('profile.tools.map')
		expect(overlaySource).toContain("profile.mode === 'workflow'")
	})

	it('gives Product a compact planning palette with no ML or LLM tools', () => {
		const product = WORKBENCH_TOOL_PROFILES['product-planning']

		expect(product.tools.map((tool) => tool.label)).toEqual([
			'Initiative',
			'Milestone',
			'Timeline lane',
			'Dependency',
			'Risk',
			'Decision',
			'Outcome',
			'Status/Receipt',
		])
		expect(
			product.tools.some((tool) => tool.action === 'select-workflow-tool')
		).toBe(false)
		expect(product.tools.map((tool) => tool.label).join(' ')).not.toMatch(
			/LLM|Prompt|OpenRouter|Agent/
		)
	})

	it('uses native shapes and Product metadata for planning artifacts', () => {
		const product = WORKBENCH_TOOL_PROFILES['product-planning']
		const dependency = product.tools.find(
			(tool) => tool.id === 'product-dependency'
		)
		const receipt = product.tools.find(
			(tool) => tool.id === 'product-status-receipt'
		)

		expect(dependency).toMatchObject({
			action: 'select-native-tool',
			toolId: 'arrow',
			relationType: 'depends-on',
		})
		expect(receipt).toMatchObject({
			action: 'insert-product-artifact',
			kind: 'outcome',
			artifactRole: 'status-receipt',
		})
		expect(overlaySource).toContain("type: 'geo'")
		expect(overlaySource).toContain("schema: 'workbench-native-shape/v1'")
		expect(overlaySource).toContain("pack: 'product'")
	})

	it('keeps the ML workflow palette as a separate profile', () => {
		const ml = WORKBENCH_TOOL_PROFILES['ml-workflow']

		expect(ml.mode).toBe('workflow')
		expect(ml.tools.map((tool) => tool.id)).toContain('workflow-llm')
		expect(ml.tools.map((tool) => tool.id)).toContain('workflow-openrouter-llm')
		expect(ml.tools.map((tool) => tool.id)).toEqual(
			expect.arrayContaining([
				'workflow-mlflow-experiment',
				'workflow-mlflow-run',
				'workflow-mlflow-evaluation',
				'workflow-mlflow-model',
			])
		)
		expect(WORKBENCH_DOMAIN_PACKS.ml.overlays.terminalSession).toBe(false)
	})
})
