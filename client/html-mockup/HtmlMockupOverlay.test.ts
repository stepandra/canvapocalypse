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
const overlayStyles = readFileSync(
	new URL('../../scripts/tldraw-desktop-eval-lab.css', import.meta.url),
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
		expect(shapeSource).toContain('HTML_MOCKUP_MODE_MESSAGE')
		expect(shapeSource).toContain('onLoad={syncPreviewMode}')
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

	it('separates prototype interaction from target selection without reloading the iframe', () => {
		expect(overlaySource).toContain('Interact')
		expect(overlaySource).toContain('Select target')
		expect(overlaySource).toContain(
			'updateLocalHtmlMockupPreviewMode(editor, latest, previewMode)'
		)
		expect(overlaySource).toContain("setPreviewMode('preview')")
		expect(overlaySource).toContain("setPreviewMode('inspect')")
		expect(overlaySource).toContain(
			"setStatus(previewMode === 'preview' ? 'INTERACT' : 'SELECT TARGET')"
		)
		expect(overlaySource).toContain('aria-pressed={meta.previewMode')
		expect(shapeSource).toContain('Interact with Local HTML Mockup')
		expect(shapeSource).toContain('selectedTargetRef: _selectedTargetRef')
		expect(shapeSource).not.toContain('sandbox="allow-scripts allow-forms"')
	})

	it('anchors the inspector to the viewport rather than the narrow provider dock', () => {
		expect(overlayStyles).toMatch(
			/\.html-mockup-inspector\s*\{\s*position:\s*fixed;/
		)
	})

	it('keeps the preview usable through bounded responsive resizing', () => {
		expect(shapeSource).toContain('resizeBox(shape, info')
		expect(shapeSource).toContain('minWidth: HTML_MOCKUP_MIN_WIDTH')
		expect(shapeSource).toContain('minHeight: HTML_MOCKUP_MIN_HEIGHT')
		expect(shapeSource).toContain('bounds.w - HTML_MOCKUP_VIEWPORT_MARGIN * 2')
		expect(shapeSource).toContain('bounds.h - HTML_MOCKUP_VIEWPORT_MARGIN * 2')
	})
})
