import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const shapeSource = readFileSync(
	new URL('./LocalHtmlMockupShape.tsx', import.meta.url),
	'utf8'
)
const overlaySource = readFileSync(
	new URL('./HtmlMockupOverlay.tsx', import.meta.url),
	'utf8'
)

describe('Local HTML Mockup native surface', () => {
	it('uses the exact fail-closed iframe sandbox', () => {
		expect(shapeSource).toContain('sandbox="allow-scripts"')
		expect(shapeSource).not.toContain('allow-same-origin')
		expect(shapeSource).not.toContain('allow-forms')
		expect(shapeSource).not.toContain('allow-popups')
		expect(shapeSource).not.toContain('allow-downloads')
		expect(shapeSource).toContain('editor.select(latest.id)')
	})

	it('offers both a resident HTML file input and the opaque registry picker', () => {
		expect(overlaySource).toContain('type="file"')
		expect(overlaySource).toContain('accept=".html,.htm,text/html"')
		expect(overlaySource).toContain('listHtmlMockupDocuments')
		expect(overlaySource).toContain('importHtmlMockupDocument')
		expect(overlaySource).toContain('createLocalHtmlMockupShape')
		expect(overlaySource).toContain('editor.menus.clearOpenMenus()')
	})

	it('composes public tldraw controls for picker and inspector chrome', () => {
		for (const primitive of [
			'TldrawUiButton',
			'TldrawUiButtonIcon',
			'TldrawUiPopover',
			'TldrawUiPopoverContent',
			'TldrawUiPopoverTrigger',
			'TldrawUiTooltip',
		]) {
			expect(overlaySource).toContain(primitive)
		}
		expect(overlaySource).not.toContain('<svg')
	})

	it('keeps the inspector exclusive and announces asynchronous status', () => {
		expect(overlaySource).toContain('selectedShapes.length !== 1')
		expect(overlaySource).toContain('aria-live="polite"')
		expect(overlaySource).toContain('aria-atomic="true"')
		expect(overlaySource).toContain('Tab, then Enter or Space')
	})

	it('keeps the preview usable through bounded responsive resizing', () => {
		expect(shapeSource).toContain('resizeBox(shape, info')
		expect(shapeSource).toContain('minWidth: HTML_MOCKUP_MIN_WIDTH')
		expect(shapeSource).toContain('minHeight: HTML_MOCKUP_MIN_HEIGHT')
		expect(shapeSource).toContain('bounds.w - HTML_MOCKUP_VIEWPORT_MARGIN * 2')
		expect(shapeSource).toContain('bounds.h - HTML_MOCKUP_VIEWPORT_MARGIN * 2')
	})
})
