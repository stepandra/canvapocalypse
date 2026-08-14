import { describe, expect, it } from 'vitest'
import {
	markWorkbenchDesktopLayer,
	unwrapWorkbenchDesktopLayer,
} from './tldraw-desktop-config-layer'

describe('tldraw Offline workbench desktop layer', () => {
	it('replaces its prior hot-applied layer without nesting another workbench', () => {
		const HostLayer = () => null
		const FirstWorkbench = () => null
		const SecondWorkbench = () => null

		markWorkbenchDesktopLayer(FirstWorkbench, HostLayer)
		const preservedHost = unwrapWorkbenchDesktopLayer(FirstWorkbench)
		markWorkbenchDesktopLayer(SecondWorkbench, preservedHost)

		expect(preservedHost).toBe(HostLayer)
		expect(unwrapWorkbenchDesktopLayer(SecondWorkbench)).toBe(HostLayer)
	})

	it('preserves an unmarked host component and accepts an empty host slot', () => {
		const HostLayer = () => null

		expect(unwrapWorkbenchDesktopLayer(HostLayer)).toBe(HostLayer)
		expect(unwrapWorkbenchDesktopLayer(undefined)).toBeUndefined()
	})
})
