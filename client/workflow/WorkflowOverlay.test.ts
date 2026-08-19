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

describe('WorkflowOverlay Prompt Experiment Lab', () => {
	it('adds a toolbar action to open the Prompt Experiment Lab', () => {
		expect(overlaySource).toContain('Prompt Experiment Lab')
		expect(overlaySource).toContain('installPromptExperimentWorkflow')
		expect(overlaySource).toContain('configureLlmModelSet')
		expect(overlaySource).toContain('icon="experiment"')
	})

	it('adds a toolbar action to materialize C1-style lead experiment cards', () => {
		expect(overlaySource).toContain('Lead Acquisition Experiment Cards')
		expect(overlaySource).toContain('installLeadAcquisitionExperimentCards')
	})

	it('renders numeric batch controls for editable LLM nodes', () => {
		expect(overlaySource).toMatch(/SAMPLES\s*\/\s*MODEL/)
		expect(overlaySource).toMatch(/PARALLEL\s*\/\s*MODEL/)
		expect(overlaySource).toContain('TEMPERATURE')
		expect(overlaySource).toContain('MAX TOKENS')
		expect(overlaySource).toContain('SEED BASE')
		expect(overlaySource).toContain("updateConfig('sampleCount'")
		expect(overlaySource).toContain("updateConfig('sampleConcurrency'")
		expect(overlaySource).toContain("updateConfig('temperature'")
		expect(overlaySource).toContain("updateConfig('maxTokens'")
		expect(overlaySource).toContain("'samplingSeed'")
	})

	it('keeps numeric batch control values within documented ranges', () => {
		expect(overlaySource).toContain('Math.max(1, Math.min(100,')
		expect(overlaySource).toContain('Math.max(1, Math.min(8,')
		expect(overlaySource).toContain('Math.max(0, Math.min(2,')
		expect(overlaySource).toContain('Math.max(256, Math.min(8192,')
	})

	it('shows a searchable multi-model checkbox picker for the selected provider', () => {
		expect(overlaySource).toContain('experimentModelSearch')
		expect(overlaySource).toContain('type="checkbox"')
		expect(overlaySource).toContain('checked={isSelected}')
		expect(overlaySource).toContain('builtinModels')
		expect(overlaySource).toContain('models.map((model)')
		expect(overlaySource).toContain('compatibleModels')
	})

	it('keeps OpenRouter and OpenAI-compatible connection controls available', () => {
		expect(overlaySource).toContain('OPENROUTER API KEY')
		expect(overlaySource).toContain('BASE URL')
		expect(overlaySource).toContain('CONNECT + LOAD MODELS')
		expect(overlaySource).toContain('loadOpenRouterModels')
		expect(overlaySource).toContain('loadCompatibleModels')
	})

	it('calls configureLlmModelSet when applying the selected model set', () => {
		expect(overlaySource).toContain('onClick={applyModelSet}')
		expect(overlaySource).toContain('configureLlmModelSet(')
		expect(overlaySource).toContain('selectedExperimentModels.map((model)')
	})

	it('does not store API keys inside shape metadata', () => {
		expect(overlaySource).not.toContain('apiKey:')
		expect(overlaySource).not.toContain('meta.config.apiKey')
		expect(overlaySource).not.toContain('sessionStorage.setItem')
	})
})

describe('WorkflowOverlay native tldraw chrome', () => {
	it('pins the public toolbar controls as a horizontal top-center tool strip', () => {
		expect(overlaySource).not.toContain('paletteOpen')
		expect(overlaySource).not.toContain('TldrawUiPopover')
		expect(overlaySource).not.toContain('workflow-palette-toggle')
		expect(overlaySource).toContain('className="workflow-palette"')
		expect(overlaySource).toContain('TldrawUiToolbar')
		expect(overlaySource).toContain('orientation="horizontal"')

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
		expect(WORKBENCH_DOMAIN_PACKS.ml.overlays).not.toHaveProperty('terminalSession')
	})
})
