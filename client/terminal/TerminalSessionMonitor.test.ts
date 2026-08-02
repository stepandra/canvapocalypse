import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { getTerminalSessionPresentation } from './TerminalSessionMonitor'

describe('Terminal session monitor presentation', () => {
	it('keeps the exact role owner explicit without exposing a transcript', () => {
		expect(
			getTerminalSessionPresentation('architecture', 'available')
		).toEqual({
			state: 'available',
			owner: 'Ampcode Architect',
			label: 'Session present',
		})
		expect(getTerminalSessionPresentation('ml', 'unconfigured')).toEqual({
			state: 'unconfigured',
			owner: 'ML-Intern',
			label: 'Target not configured',
		})
	})

	it('renders poll failures as a quiet offline state', () => {
		expect(
			getTerminalSessionPresentation('architecture', 'available', true)
		).toEqual({
			state: 'offline',
			owner: 'Ampcode Architect',
			label: 'Zellij offline',
		})
	})

	it('uses public tldraw theme tokens and no hardcoded light surface', () => {
		const css = readFileSync(
			new URL('./terminalSessionMonitor.css', import.meta.url),
			'utf8'
		)
		expect(css).toContain('var(--tl-color-panel)')
		expect(css).toContain('var(--tl-color-text-3)')
		expect(css).toContain('var(--tl-shadow-1)')
		expect(css).not.toMatch(/#[\da-f]{3,8}\b/i)
		expect(css).not.toContain('backdrop-filter')
	})
})
