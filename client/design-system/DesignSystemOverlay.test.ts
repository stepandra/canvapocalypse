import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')
const shellSource = readFileSync(
	new URL('../workbench/WorkbenchShell.tsx', import.meta.url),
	'utf8'
)
const overlaySource = readFileSync(
	new URL('./DesignSystemOverlay.tsx', import.meta.url),
	'utf8'
)
const shapeSource = readFileSync(
	new URL('./DesignSystemShape.tsx', import.meta.url),
	'utf8'
)

describe('Design System native UI/UX surface', () => {
	it('registers one native shape and mounts its overlay only for UI/UX', () => {
		expect(appSource).toContain('DesignSystemShapeUtil')
		expect(shellSource).toContain(
			"{activeDomain === 'uiux' && <DesignSystemOverlay />}"
		)
		expect(shellSource).not.toContain(
			'activePack.overlays.designSystem'
		)
	})

	it('uses public tldraw controls and exposes read-only drift inspection', () => {
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
		expect(overlaySource).toContain('Check drift')
		expect(overlaySource).toContain('Refresh')
		expect(overlaySource).not.toContain('Patch')
		expect(overlaySource).not.toContain('Propose')
		expect(overlaySource).not.toContain('type="file"')
	})

	it('renders only semantic projection sections and keeps source out of metadata', () => {
		for (const label of [
			'THEME &amp; ATMOSPHERE',
			'PALETTE',
			'TYPE',
			'COMPONENTS',
			'LAYOUT',
		]) {
			expect(shapeSource).toContain(label)
		}
		expect(shapeSource).toContain('documentRef')
		expect(shapeSource).toContain('revision')
		expect(shapeSource).not.toContain('sourcePath')
		expect(shapeSource).not.toContain('markdown')
	})
})
