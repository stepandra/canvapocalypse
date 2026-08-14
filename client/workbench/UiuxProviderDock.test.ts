import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const dockSource = readFileSync(
	new URL('./UiuxProviderDock.tsx', import.meta.url),
	'utf8'
)
const shellSource = readFileSync(
	new URL('./WorkbenchShell.tsx', import.meta.url),
	'utf8'
)
const cssSource = readFileSync(new URL('./workbench.css', import.meta.url), 'utf8')
const stitchSource = readFileSync(
	new URL('../stitch/StitchOverlay.tsx', import.meta.url),
	'utf8'
)
const designSource = readFileSync(
	new URL('../design-system/DesignSystemOverlay.tsx', import.meta.url),
	'utf8'
)
const htmlSource = readFileSync(
	new URL('../html-mockup/HtmlMockupOverlay.tsx', import.meta.url),
	'utf8'
)

describe('UI/UX provider dock', () => {
	it('groups exactly the three explicit UI/UX providers', () => {
		expect(dockSource).toContain('<StitchOverlay docked />')
		expect(dockSource).toContain('<DesignSystemOverlay docked />')
		expect(dockSource).toContain('<HtmlMockupOverlay docked />')
		expect(shellSource).toContain('<UiuxProviderDock />')
		expect(shellSource).not.toContain(
			"{activeDomain === 'uiux' && <DesignSystemOverlay />}"
		)
	})

	it('uses visible labels instead of anonymous floating glyphs', () => {
		expect(stitchSource).toContain('uiux-provider-label">Stitch')
		expect(designSource).toContain('uiux-provider-label">DESIGN.md')
		expect(htmlSource).toContain('uiux-provider-label">Local HTML')
		expect(cssSource).toContain('.uiux-provider-dock')
		expect(cssSource).toMatch(
			/\.uiux-provider-dock[\s\S]*pointer-events:\s*auto/
		)
	})

	it('keeps Stitch credentials out of all browser provider source', () => {
		const browserSource = `${dockSource}\n${stitchSource}\n${designSource}\n${htmlSource}`
		expect(browserSource).not.toContain('STITCH_API_KEY')
		expect(browserSource).not.toContain('STITCH_ACCESS_TOKEN')
		expect(browserSource).not.toContain('GOOGLE_CLOUD_PROJECT')
		expect(browserSource).not.toContain('@google/stitch-sdk')
	})
})
