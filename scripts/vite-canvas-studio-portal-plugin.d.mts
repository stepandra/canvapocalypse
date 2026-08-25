import type { Plugin } from 'vite'

export const CANVAS_STUDIO_PORTAL_VIRTUAL_ID: 'virtual:canvas-studio-portal'

export interface CanvasStudioPortalManifestEntry {
	readonly path: string
	readonly sha256: string
}

export interface CanvasStudioPortalBuildConfig {
	readonly schema: 'canvas.portal-build/v1'
	readonly project: object
	readonly catalog: object
	readonly contributions: readonly string[]
	readonly runtime: object
}

export function parsePortalManifest(
	manifestJson?: string
): readonly CanvasStudioPortalManifestEntry[]

export function parsePortalBuildConfig(configJson: string): CanvasStudioPortalBuildConfig

export function createCanvasStudioPortalPlugin(
	manifestJson?: string,
	portalBuildConfigJson?: string
): Plugin
