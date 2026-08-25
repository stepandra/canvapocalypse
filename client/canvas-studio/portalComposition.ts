import {
	CANVAS_STUDIO_PORTAL_CATALOG,
	CANVAS_STUDIO_PORTAL_CONTRIBUTIONS,
	CANVAS_STUDIO_PORTAL_LOCKED,
	CANVAS_STUDIO_PORTAL_RUNTIME,
} from 'virtual:canvas-studio-portal'
import { createCanvapocalypseCanvasKitComposition } from './host'

export {
	CANVAS_STUDIO_PORTAL_CATALOG,
	CANVAS_STUDIO_PORTAL_LOCKED,
	CANVAS_STUDIO_PORTAL_RUNTIME,
}

/** The locked portal's one source-driven composition; standalone receives no externals. */
export const CANVAS_STUDIO_PORTAL_COMPOSITION =
	createCanvapocalypseCanvasKitComposition(CANVAS_STUDIO_PORTAL_CONTRIBUTIONS)
