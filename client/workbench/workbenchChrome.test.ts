import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const shellSource = readFileSync(new URL('./WorkbenchShell.tsx', import.meta.url), 'utf8')
const emojiSource = readFileSync(
	new URL('./WorkbenchEmojiPalette.tsx', import.meta.url),
	'utf8'
)
const css = readFileSync(new URL('./workbench.css', import.meta.url), 'utf8')

describe('native tldraw workbench chrome', () => {
	it('builds the shell and emoji menu from public tldraw UI primitives', () => {
		for (const primitive of [
			'TldrawUiToolbar',
			'TldrawUiToolbarToggleGroup',
			'TldrawUiToolbarToggleItem',
			'TldrawUiDropdownMenuRoot',
			'TldrawUiDropdownMenuContent',
			'TldrawUiDropdownMenuItem',
			'TldrawUiButton',
		]) {
			expect(shellSource).toContain(primitive)
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

	it('keeps readable labels and a bounded native three-by-three emoji menu', () => {
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
	})
})
