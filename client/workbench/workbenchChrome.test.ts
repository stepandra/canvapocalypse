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
			'TldrawUiToolbar',
			'TldrawUiToolbarButton',
			'TldrawUiButtonIcon',
			'TldrawUiDropdownMenuRoot',
			'TldrawUiDropdownMenuContent',
			'TldrawUiDropdownMenuItem',
			'TldrawUiButton',
		]) {
			expect(emojiSource).toContain(primitive)
		}

		expect(emojiSource).toContain('icon="geo-star"')
		expect(emojiSource).not.toContain('<svg')
	})

	it('keeps mode and bridge as a vertical rail beside ML-intern', () => {
		expect(shellSource).toContain('workbench-aux-rail')
		expect(shellSource).toContain('orientation="vertical"')
		expect(shellSource).toContain('<BridgeCenter />')
		expect(css).toMatch(
			/\.workbench-aux-rail\s*\{[^}]*top:\s*var\(--tl-space-10\);[^}]*left:\s*var\(--tl-space-4\);[^}]*width:\s*48px;[^}]*height:\s*96px;[^}]*flex-direction:\s*column;[^}]*transform:\s*none;/s
		)
		expect(css).toMatch(
			/\.workbench-rail-trigger\s*\{[^}]*width:\s*48px;[^}]*min-width:\s*48px;[^}]*height:\s*48px;/s
		)
	})

	it('centers only the workflow launcher and opens a shorter two-row palette', () => {
		expect(workflowCss).toMatch(
			/\.workflow-palette\s*\{[^}]*top:\s*var\(--tl-space-3\);[^}]*left:\s*50%;[^}]*transform:\s*translateX\(-50%\);/s
		)
		expect(workflowCss).toMatch(/\.workflow-toolbar\.tlui-toolbar\s*\{[^}]*display:\s*flex;[^}]*flex-flow:\s*row wrap;[^}]*width:\s*min\(584px,\s*calc\(100vw - 32px\)\);[^}]*max-height:\s*104px;/s)
		expect(workflowCss).toMatch(/\.tl-container > div:has\(> \.tlui-popover__content > \.workflow-toolbar\)\s*\{[^}]*left:\s*50% !important;[^}]*transform:\s*translate\(-50%,\s*calc\(var\(--tl-space-3\) \+ 56px\)\) !important;/s)
	})

	it('keeps all domain tools in one bounded right-opening popover', () => {
		expect(shellSource).toContain('WORKBENCH_DOMAINS.map')
		expect(shellSource).toContain('activePack.templates.map')
		expect(shellSource).toContain(
			'<WorkbenchDomainIcon name={activePack.icon} />'
		)
		expect(shellSource).toContain('<WorkbenchDomainIcon name={pack.icon} small />')
		expect(shellSource).toContain('icon={template.icon}')
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

	it('keeps the horizontal rail and emoji menu bounded at narrow widths', () => {
		const fontSizes = [...css.matchAll(/font-size:\s*(\d+)px/g)].map((match) =>
			Number(match[1])
		)
		expect(fontSizes.length).toBeGreaterThan(0)
		expect(Math.min(...fontSizes)).toBeGreaterThanOrEqual(11)
		expect(css).toMatch(
			/\.workbench-emoji-control\s*\{[^}]*width:\s*48px;[^}]*height:\s*48px;/s
		)
		expect(css).toMatch(
			/\.workbench-emoji-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*40px\);/s
		)
		expect(css).toContain('width: min(96px, calc(100vw - 24px))')
	})
})
