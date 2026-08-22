import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const shellSource = readFileSync(new URL('./WorkbenchShell.tsx', import.meta.url), 'utf8')
const bridgeSource = readFileSync(
	new URL('../bridges/BridgeCenter.tsx', import.meta.url),
	'utf8'
)
const emojiSource = readFileSync(
	new URL('./WorkbenchEmojiPalette.tsx', import.meta.url),
	'utf8'
)
const toolbarSource = readFileSync(
	new URL('./WorkbenchToolbar.tsx', import.meta.url),
	'utf8'
)
const creativeIdeationSource = readFileSync(
	new URL('./ProductCreativeIdeationButton.tsx', import.meta.url),
	'utf8'
)
const stylePanelSource = readFileSync(
	new URL('./WorkbenchStylePanel.tsx', import.meta.url),
	'utf8'
)
const layoutSource = readFileSync(
	new URL('../layout/components.tsx', import.meta.url),
	'utf8'
)
const css = readFileSync(new URL('./workbench.css', import.meta.url), 'utf8')
const workflowCss = readFileSync(
	new URL('../../scripts/tldraw-desktop-eval-lab.css', import.meta.url),
	'utf8'
)

describe('native tldraw workbench chrome', () => {
	it('builds the auxiliary rail and menus from public tldraw UI primitives', () => {
		for (const primitive of [
			'TldrawUiToolbar',
			'TldrawUiToolbarButton',
			'TldrawUiPopover',
			'TldrawUiPopoverContent',
			'TldrawUiPopoverTrigger',
			'TldrawUiButton',
		]) {
			expect(shellSource).toContain(primitive)
		}

		for (const primitive of [
			'TldrawUiToolbarButton',
			'TldrawUiPopover',
			'TldrawUiPopoverContent',
			'TldrawUiButton',
		]) {
			expect(bridgeSource).toContain(primitive)
		}

		for (const primitive of [
			'TldrawUiToolbarButton',
			'TldrawUiDropdownMenuRoot',
			'TldrawUiDropdownMenuContent',
			'TldrawUiDropdownMenuItem',
			'TldrawUiButton',
		]) {
			expect(emojiSource).toContain(primitive)
		}

		expect(emojiSource).toContain('activateEmojiStamp')
		expect(toolbarSource).toContain('DefaultToolbar')
		expect(toolbarSource).toContain('<WorkbenchEmojiPalette />')
		expect(toolbarSource).toContain('<MarkdownImportButton />')
		expect(shellSource).not.toContain('<WorkbenchEmojiPalette />')
		expect(emojiSource).not.toContain('<svg')
	})

	it('keeps domain controls in a compact vertical rail without empty slots', () => {
		expect(shellSource).toContain('workbench-aux-rail')
		expect(shellSource).toContain('orientation="vertical"')
		expect(shellSource).toContain(
			'<CanvasStudioPalette composition={canvasKitComposition} />'
		)
		expect(shellSource).toContain('<GrokWorkflowToolbox inToolbar />')
		expect(shellSource).toContain('<IsoflowProviderControl />')
		expect(shellSource).toContain('<IsoflowSelectionInspector />')
		expect(shellSource).not.toContain('aria-label="Open Grok workspace"')
		expect(shellSource).toContain('<CanvasLayoutControls />')
		expect(shellSource).toContain('showCommentTools && <CanvasCommentControls />')
		expect(shellSource).toContain('<BridgeCenter')
		expect(bridgeSource).toContain('useOptionalCompanionCanvasBridge')
		expect(shellSource).toContain("effectiveDomain !== 'architecture'")
		expect(css).toMatch(
			/\.workbench-aux-rail\s*\{[^}]*top:\s*var\(--tl-space-10\);[^}]*left:\s*var\(--tl-space-4\);[^}]*width:\s*48px;[^}]*height:\s*fit-content;[^}]*flex-direction:\s*column;[^}]*transform:\s*none;/s
		)
		expect(css).toMatch(
			/\.workbench-rail-trigger\s*\{[^}]*width:\s*48px;[^}]*min-width:\s*48px;[^}]*height:\s*48px;/s
		)
		const isoflowToolbarRule = workflowCss.match(
			/\.isoflow-provider-toolbar\s*\{([^}]*)\}/s
		)?.[1]
		expect(isoflowToolbarRule).toContain('width: 48px')
		expect(isoflowToolbarRule).toContain('height: 48px')
		expect(isoflowToolbarRule).not.toContain('position: absolute')
		expect(isoflowToolbarRule).not.toContain('top:')
		expect(isoflowToolbarRule).not.toContain('left:')
	})

	it('extends the native style panel with selection-aware workflow and layout context', () => {
		expect(stylePanelSource).toContain('DefaultStylePanelContent')
		expect(stylePanelSource).toContain('WorkbenchSelectionContext')
		expect(stylePanelSource).toContain('<WorkflowInspector')
		expect(stylePanelSource).toContain('<CanvasLayoutSelectionControls />')
		expect(layoutSource).toContain('content="Frame and layout tools"')
		expect(layoutSource).toContain('icon="tool-frame"')
		expect(layoutSource).toContain('icon="stack-horizontal"')
	})

	it('pins the workflow toolbar directly at top center', () => {
		expect(workflowCss).toMatch(
			/\.workflow-palette\s*\{[^}]*top:\s*var\(--tl-space-3\);[^}]*left:\s*50%;[^}]*background:\s*var\(--tl-color-panel\);[^}]*box-shadow:\s*var\(--tl-shadow-2\);[^}]*transform:\s*translateX\(-50%\);/s
		)
		expect(workflowCss).toMatch(/\.workflow-toolbar\.tlui-toolbar\s*\{[^}]*display:\s*flex;[^}]*flex-flow:\s*row wrap;[^}]*width:\s*fit-content;[^}]*max-width:\s*calc\(100vw - 32px\);[^}]*max-height:\s*104px;/s)
		expect(workflowCss).not.toContain('workflow-palette-toggle')
		expect(workflowCss).not.toContain('.tlui-popover__content > .workflow-toolbar')
	})

	it('keeps all domain tools in one bounded right-opening popover', () => {
		expect(shellSource).toContain('WORKBENCH_DOMAINS.map')
		expect(shellSource).toContain('activePack.templates.map')
		expect(shellSource).toContain(
			'<WorkbenchDomainIcon name={activePack.icon} />'
		)
		expect(shellSource).toContain('<WorkbenchDomainIcon name={pack.icon} small />')
		expect(shellSource).toContain('<WorkbenchTemplatePreview templateId={template.id} />')
		expect(shellSource).toContain('<ProductCreativeIdeationButton />')
		expect(shellSource).not.toContain('pack.shortLabel')
		expect(shellSource).not.toContain('workbench-domain-option-short')
		expect(shellSource).toContain('<UiuxProviderDock />')
		expect(shellSource).toContain('<KanbanTracksControl />')
		expect(shellSource).toContain('Auto route')
		expect(shellSource).toContain('side="right"')
		expect(shellSource).toContain('collisionPadding={12}')
		expect(css).toMatch(
			/\.workbench-domain-center,[\s\S]*?width:\s*min\(344px,\s*calc\(100vw - 24px\)\);[\s\S]*?max-height:\s*min\(640px,\s*calc\(100vh - 24px\)\);/
		)
		expect(css).toMatch(
			/\.uiux-provider-dock\s*\{[^}]*position:\s*static;[^}]*box-shadow:\s*none;/s
		)
	})

	it('routes Product creative ideation through the existing bounded agent thread', () => {
		expect(shellSource).toContain("effectiveDomain === 'product' && app")
		expect(creativeIdeationSource).toContain('useAgent()')
		expect(creativeIdeationSource).toContain('buildWorkbenchAgentInput({')
		expect(creativeIdeationSource).toContain("domain: 'product'")
		expect(creativeIdeationSource).toContain("'selection' : 'visible-area'")
		expect(creativeIdeationSource).toContain('await agent.prompt(input)')
		expect(creativeIdeationSource).not.toContain('insertWorkbenchTemplate')
	})

	it('inherits tldraw panel, text, focus, radius, spacing, and shadow tokens', () => {
		for (const token of [
			'--tl-color-panel',
			'--tl-color-text-1',
			'--tl-color-text-3',
			'--tl-color-divider',
			'--tl-radius-4',
			'--tl-space-3',
			'--tl-shadow-2',
			'--tl-layer-panels',
		]) {
			expect(css).toContain(`var(${token})`)
		}

		expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i)
		expect(css).not.toMatch(/\b(?:rgb|hsl)a?\(/i)
		expect(css).not.toContain('backdrop-filter')
	})

	it('keeps the bottom-toolbar emoji menu bounded at narrow widths', () => {
		const fontSizes = [...css.matchAll(/font-size:\s*(\d+)px/g)].map((match) =>
			Number(match[1])
		)
		expect(fontSizes.length).toBeGreaterThan(0)
		expect(Math.min(...fontSizes)).toBeGreaterThanOrEqual(11)
		expect(css).toMatch(
			/\.workbench-emoji-control\s*\{[^}]*order:\s*1;[^}]*width:\s*40px;[^}]*height:\s*40px;/s
		)
		expect(css).toMatch(
			/\.workbench-emoji-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*40px\);/s
		)
		expect(css).toMatch(/@media \(max-width: 760px\)[\s\S]*?\.workbench-aux-rail\s*\{[^}]*width:\s*48px;/)
	})
})
