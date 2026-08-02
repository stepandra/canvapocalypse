/**
 * Module and config evaluation can repeat inside one tldraw Offline renderer.
 * Keep its opaque binding on the renderer global so HMR/config replacement
 * cannot briefly register the same desktop as two active Offline clients. A
 * full renderer restart gets a fresh global and therefore a fresh identity.
 */
const COMPANION_CANVAS_BINDING_SLOT = Symbol.for(
	'canvapocalypse.renderer.companionCanvasBinding'
)

function createCompanionCanvasBinding() {
	return `canvas-${
		typeof globalThis.crypto?.randomUUID === 'function'
			? globalThis.crypto.randomUUID()
			: Math.random().toString(36).slice(2)
	}`
}

function resolveRendererCompanionCanvasBinding() {
	const existing = Reflect.get(globalThis, COMPANION_CANVAS_BINDING_SLOT)
	if (typeof existing === 'string') return existing

	const binding = createCompanionCanvasBinding()
	Object.defineProperty(globalThis, COMPANION_CANVAS_BINDING_SLOT, {
		value: binding,
		configurable: true,
		enumerable: false,
		writable: false,
	})
	return binding
}

/**
 * One opaque, renderer-session-local binding identifies the live tldraw canvas
 * executor to every provider adapter. It is never persisted in canvas metadata
 * and is deliberately shared by the generic and ML-Intern compatibility routes.
 */
export const COMPANION_CANVAS_BINDING =
	resolveRendererCompanionCanvasBinding()

export type CompanionCanvasClientKind = 'offline-desktop' | 'web-preview'

/**
 * Client kind is deliberately coarse and non-secret. It lets the local bridge
 * prefer the actual desktop workbench over a concurrently open Vite preview
 * without exposing an opaque canvas binding to an external agent.
 */
export function resolveCompanionCanvasClientKind(
	protocol = globalThis.location?.protocol
): CompanionCanvasClientKind {
	return protocol === 'file:' ? 'offline-desktop' : 'web-preview'
}

export const COMPANION_CANVAS_CLIENT_KIND =
	resolveCompanionCanvasClientKind()
