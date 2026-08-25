/// <reference types="vite/client" />

declare module 'virtual:canvas-studio-portal' {
	import type { CanvasStudioCatalog } from './canvas-studio/catalog'
	import type { CanvasStudioPortalRuntime } from './canvas-studio/portalOwnerRuntime'
	import type { CanvasKitContribution } from './canvas-studio/types'

	export const CANVAS_STUDIO_PORTAL_LOCKED: boolean
	export const CANVAS_STUDIO_PORTAL_CONTRIBUTIONS: readonly CanvasKitContribution[]
	export const CANVAS_STUDIO_PORTAL_RUNTIME: CanvasStudioPortalRuntime
	export const CANVAS_STUDIO_PORTAL_CATALOG: CanvasStudioCatalog | undefined
}
