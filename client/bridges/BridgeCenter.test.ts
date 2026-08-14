import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
	new URL('./BridgeCenter.tsx', import.meta.url),
	'utf8'
)
const clientSource = readFileSync(
	new URL('./bridgeSupervisorClient.ts', import.meta.url),
	'utf8'
)

describe('Bridge Center surface boundary', () => {
	it('lists the complete supervisor result and exposes Check for every service', () => {
		expect(source).toContain('services.map((service)')
		expect(source).toContain("'check'")
		expect(source).toContain('canRunBridgeServiceAction(service, action)')
		expect(source).toContain('service.capabilities.join')
	})

	it('uses a collision-aware public tldraw popover and one collapsed aggregate dot', () => {
		for (const primitive of [
			'TldrawUiPopover',
			'TldrawUiPopoverTrigger',
			'TldrawUiPopoverContent',
			'TldrawUiToolbarButton',
			'TldrawUiButton',
		]) {
			expect(source).toContain(primitive)
		}
		expect(source).toContain('side="right"')
		expect(source).toContain('collisionPadding={12}')
		expect(source).toContain('className="workbench-bridge-dot"')
		expect(source).not.toMatch(/workbench-bridge-(?:count|badge)/)
	})

	it('rechecks transitional lifecycle states without requiring a manual Check', () => {
		expect(source).toContain("service.state === 'starting'")
		expect(source).toContain("service.state === 'stopping'")
		expect(source).toContain('window.setTimeout')
		expect(source).toContain('void refresh(controller.signal)')
	})

	it('keeps the resident capability in module closure and off window', () => {
		expect(clientSource).toContain(
			'installBridgeSupervisorResidentCapability'
		)
		expect(clientSource).toContain('let residentCapability: string | null')
		expect(clientSource).not.toMatch(/window\.__/)
		expect(clientSource).not.toContain('localStorage')
		expect(clientSource).not.toContain('sessionStorage')
	})
})
