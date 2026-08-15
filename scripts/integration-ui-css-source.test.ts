import { readFileSync } from 'node:fs'
import { parse } from 'postcss'
import { describe, expect, it } from 'vitest'

function readRepoFile(relativePath: string) {
	return readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8')
}

describe('integration UI stylesheet ownership', () => {
	it('loads the desktop integration stylesheet as the final browser integration layer', () => {
		const browserEntry = readRepoFile('client/main.tsx')
		const baseStylesIndex = browserEntry.indexOf("import './index.css'")
		const integrationStylesIndex = browserEntry.indexOf(
			"import '../scripts/tldraw-desktop-eval-lab.css'"
		)

		expect(baseStylesIndex).toBeGreaterThanOrEqual(0)
		expect(integrationStylesIndex).toBeGreaterThan(baseStylesIndex)
	})

	it('uses the same integration stylesheet in the offline desktop bundle', () => {
		const desktopEntry = readRepoFile(
			'scripts/tldraw-desktop-eval-lab-config-factory.tsx'
		)

		expect(desktopEntry).toContain(
			"import stylesheet from './tldraw-desktop-eval-lab.css'"
		)
		expect(desktopEntry).not.toContain('IsoflowOverlay.css')
	})

	it('does not reintroduce duplicated integration chrome into base or component CSS', () => {
		const baseStyles = readRepoFile('client/index.css')
		const overlaySource = readRepoFile('client/isoflow/IsoflowOverlay.tsx')
		const integrationStyles = readRepoFile(
			'scripts/tldraw-desktop-eval-lab.css'
		)

		expect(baseStyles).not.toContain('/* ML intern workflow controls */')
		expect(baseStyles).not.toContain('.workflow-toolbar')
		expect(baseStyles).not.toContain('.isoflow-provider-toolbar')
		expect(overlaySource).not.toContain('IsoflowOverlay.css')
		expect(integrationStyles).not.toContain(
			'.ml-intern-eval-launcher-panel > div'
		)
		expect(integrationStyles).not.toContain('.workflow-tool-button.has-label')
		expect(integrationStyles).not.toContain('Inter')
		expect(integrationStyles).not.toContain('#172033')
		expect(integrationStyles).not.toContain('backdrop-filter')
		expect(integrationStyles).toContain(
			'grid-template-columns: repeat(2, 48px)'
		)
		expect(integrationStyles).toContain('.workflow-palette-toggle {')
		expect(integrationStyles).toContain('max-height: min(72vh, 592px)')
		expect(integrationStyles).toContain('background: var(--tl-color-panel)')
		expect(integrationStyles).toContain('box-shadow: var(--tl-shadow-2)')
		expect(integrationStyles).toContain('.workflow-rich-output-shell {')
		expect(integrationStyles).toContain('border-radius: var(--tl-radius-3)')
		expect(integrationStyles).toContain(
			'.workflow-rich-output-controls select {'
		)
		expect(integrationStyles).toContain('height: 40px')
	})

	it('keeps one authoritative top-level rule per integration selector group', () => {
		const integrationStyles = readRepoFile(
			'scripts/tldraw-desktop-eval-lab.css'
		)
		const root = parse(integrationStyles)
		const selectorCounts = new Map<string, number>()

		for (const node of root.nodes) {
			if (node.type !== 'rule') continue
			const selectorGroup = node.selector
				.split(',')
				.map((selector) => selector.trim().replace(/\s+/g, ' '))
				.sort()
				.join(', ')
			selectorCounts.set(
				selectorGroup,
				(selectorCounts.get(selectorGroup) ?? 0) + 1
			)
		}

		expect(
			[...selectorCounts]
				.filter(([, count]) => count > 1)
				.map(([selector]) => selector)
		).toEqual([])
	})

	it('uses theme-aware semantic tokens for JSON syntax colors', () => {
		const integrationStyles = readRepoFile(
			'scripts/tldraw-desktop-eval-lab.css'
		)
		const root = parse(integrationStyles)
		const syntaxRules = root.nodes
			.filter(
				(node) =>
					node.type === 'rule' && node.selector.includes('.workflow-json')
			)
			.map((node) => node.toString())
			.join('\n')

		expect(syntaxRules).not.toMatch(/#[0-9a-f]{3,8}\b/i)
		expect(syntaxRules).toContain('var(--tl-color-text-1)')
		expect(syntaxRules).toContain('var(--tl-color-success)')
		expect(syntaxRules).toContain('var(--tl-color-info)')
		expect(syntaxRules).toContain('var(--tl-color-warning)')
	})
})
