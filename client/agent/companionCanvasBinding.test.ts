import { afterEach, describe, expect, it, vi } from 'vitest'
import {
	COMPANION_CANVAS_BINDING,
	resolveCompanionCanvasClientKind,
} from './companionCanvasBinding'

const COMPANION_CANVAS_BINDING_SLOT = Symbol.for(
	'canvapocalypse.renderer.companionCanvasBinding'
)
const INITIAL_RENDERER_BINDING = COMPANION_CANVAS_BINDING

afterEach(() => {
	Reflect.deleteProperty(globalThis, COMPANION_CANVAS_BINDING_SLOT)
	Object.defineProperty(globalThis, COMPANION_CANVAS_BINDING_SLOT, {
		value: INITIAL_RENDERER_BINDING,
		configurable: true,
		enumerable: false,
		writable: false,
	})
	vi.resetModules()
})

describe('companion canvas binding identity', () => {
	it('converges module, HMR, and config re-evaluation on one renderer binding', async () => {
		const registrations = [COMPANION_CANVAS_BINDING]

		vi.resetModules()
		registrations.push(
			(await import('./companionCanvasBinding')).COMPANION_CANVAS_BINDING
		)
		vi.resetModules()
		registrations.push(
			(await import('./companionCanvasBinding')).COMPANION_CANVAS_BINDING
		)

		expect(new Set(registrations).size).toBe(1)
		expect(registrations[0]).toMatch(/^canvas-[a-zA-Z0-9._:-]+$/)
	})

	it('generates a different random identity for a fresh renderer global', async () => {
		expect(
			Reflect.deleteProperty(globalThis, COMPANION_CANVAS_BINDING_SLOT)
		).toBe(true)
		vi.resetModules()

		const restarted =
			(await import('./companionCanvasBinding')).COMPANION_CANVAS_BINDING

		expect(restarted).toMatch(/^canvas-[a-zA-Z0-9._:-]+$/)
		expect(restarted).not.toBe(COMPANION_CANVAS_BINDING)
	})
})

describe('companion canvas client kind', () => {
	it('identifies the packaged tldraw Offline file surface', () => {
		expect(resolveCompanionCanvasClientKind('file:')).toBe('offline-desktop')
	})

	it('treats localhost and unknown browser surfaces as web previews', () => {
		expect(resolveCompanionCanvasClientKind('http:')).toBe('web-preview')
		expect(resolveCompanionCanvasClientKind('https:')).toBe('web-preview')
		expect(resolveCompanionCanvasClientKind(undefined)).toBe('web-preview')
	})
})
