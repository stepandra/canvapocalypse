import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const overlaySource = readFileSync(
	new URL('./IsoflowOverlay.tsx', import.meta.url),
	'utf8'
)
const normalizedOverlaySource = overlaySource.replace(/\s+/g, ' ')
const legacyConsoleSource = readFileSync(
	new URL('./isoflowAgentConsole.ts', import.meta.url),
	'utf8'
)

describe('IsoflowOverlay external Architect handoff', () => {
	it('uses public tldraw controls for provider, project picker, and inspector chrome', () => {
		expect(overlaySource).toContain('TldrawUiPopover')
		expect(overlaySource).toContain('TldrawUiPopoverTrigger')
		expect(overlaySource).toContain('TldrawUiPopoverContent')
		expect(overlaySource).toContain('TldrawUiTooltip')
		expect(overlaySource).toContain('TldrawUiButton')
		expect(overlaySource).toContain('TldrawUiInput')
		expect(overlaySource).toContain('TldrawUiSelect')
		expect(overlaySource).toContain('className="tlui-menu isoflow-inspector"')
		expect(overlaySource).not.toContain('<button')
		expect(overlaySource).not.toContain('<select')
		expect(overlaySource).not.toContain('IsoflowOverlay.css')
	})

	it('does not expose or invoke the legacy embedded model console', () => {
		expect(overlaySource).not.toContain('runIsoflowAgent')
		expect(overlaySource).not.toContain('IsoflowAgentProvider')
		expect(overlaySource).not.toContain('AMP / GROK CONTROL')
		expect(overlaySource).not.toContain('<textarea')
		expect(overlaySource).not.toContain('amp-medium')
		expect(overlaySource).not.toContain('OpenRouter')
		expect(legacyConsoleSource).not.toContain('/isoflow/agent')
		expect(legacyConsoleSource).not.toContain('fetch(')
	})

	it('keeps a passive handoff and the revision-guarded proposal confirmation seam', () => {
		expect(overlaySource).toContain('EXTERNAL AMPCODE ARCHITECT')
		expect(overlaySource).toContain('PASSIVE · NO MODEL')
		expect(normalizedOverlaySource).toContain(
			'separate revision-guarded Isoflow'
		)
		expect(normalizedOverlaySource).toContain(
			'Ordinary canvas work uses tldraw Offline tools.'
		)
		expect(normalizedOverlaySource).toContain(
			'This canvas never launches a model.'
		)
		expect(overlaySource).toContain('role="status"')
		expect(overlaySource).toContain('subscribeToIsoflowMutationProposals')
		expect(overlaySource).toContain('applyIsoflowMutationPreview')
		expect(overlaySource).toContain('CONFIRM EXACT PROPOSAL')
	})

	it('shows the bounded normalized parameters being confirmed for the selected target', () => {
		expect(normalizedOverlaySource).toContain(
			'EXACT OPERATIONS · {pending.preview.projectId} /'
		)
		expect(overlaySource).toContain('pending.preview.selectedViewId')
		expect(overlaySource).toContain(
			'Normalized exact Isoflow operation parameters'
		)
		expect(overlaySource).toContain('formatIsoflowOperation(operation)')
		expect(overlaySource).toContain('<code>')
	})
})
