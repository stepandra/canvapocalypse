import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
	getWorkbenchAgentDockBridgeSourceState,
	getWorkbenchAgentDockIndicator,
	getWorkbenchAgentDockMode,
} from './WorkbenchAgentDock'

describe('Workbench Agent dock ownership', () => {
	it('hides Architecture because the Amp thread lives in Bridge Center', () => {
		expect(getWorkbenchAgentDockMode('architecture')).toBe('hidden')
	})

	it('retains compact composers for the non-Architecture packs', () => {
		expect(getWorkbenchAgentDockMode('ml')).toBe('compact-composer')
		expect(getWorkbenchAgentDockMode('uiux')).toBe('compact-composer')
		expect(getWorkbenchAgentDockMode('product')).toBe('compact-composer')
	})

	it('maps request and bridge state onto a compact native status badge', () => {
		expect(getWorkbenchAgentDockIndicator('idle')).toBe('idle')
		expect(getWorkbenchAgentDockIndicator('running')).toBe('running')
		expect(getWorkbenchAgentDockIndicator('applying')).toBe('running')
		expect(getWorkbenchAgentDockIndicator('finished')).toBe('success')
		expect(getWorkbenchAgentDockIndicator('ready')).toBe('success')
		expect(getWorkbenchAgentDockIndicator('offline')).toBe('error')
		expect(getWorkbenchAgentDockIndicator('failed')).toBe('error')
		expect(getWorkbenchAgentDockIndicator('cancelled')).toBe('error')
		expect(getWorkbenchAgentDockIndicator('error')).toBe('error')
	})

	it('does not turn a failed Amp receipt green on an idle ready poll', () => {
		expect(
			getWorkbenchAgentDockBridgeSourceState({
				state: 'ready',
				latestReceiptStatus: 'failed',
				reportedLatestStatus: 'failed',
				hasStatus: true,
			})
		).toBe('failed')
		expect(
			getWorkbenchAgentDockBridgeSourceState({
				state: 'applying',
				latestReceiptStatus: 'failed',
				reportedLatestStatus: 'failed',
				hasStatus: true,
			})
		).toBe('applying')
	})

	it('uses the native 48px tool footprint and public tldraw theme tokens', () => {
		const css = readFileSync(
			new URL('./workbenchAgentDock.css', import.meta.url),
			'utf8'
		)
		expect(css).toContain('width: 48px')
		expect(css).toContain('height: 48px')
		expect(css).toContain('var(--tl-color-panel)')
		expect(css).toContain('var(--tl-shadow-2)')
		expect(css).not.toMatch(/#[\da-f]{3,8}\b/i)
	})
})
