import { CANVAS_KIT_CONTRIBUTIONS as BOTFLOW_CONTRIBUTIONS } from './vendor/tldraw-botflow.js'
import { CANVAS_KIT_CONTRIBUTIONS as GROK_CONTRIBUTIONS } from './vendor/grok-canvas-kit.js'
import { CANVAS_KIT_CONTRIBUTIONS as HERMES_CONTRIBUTIONS } from './vendor/hermes-flight-deck-kit.js'
import type { CanvasKitContribution } from './types'

export const CANVAPOCALYPSE_EXTERNAL_CANVAS_KIT_CONTRIBUTIONS = [
	...GROK_CONTRIBUTIONS,
	...HERMES_CONTRIBUTIONS,
	...BOTFLOW_CONTRIBUTIONS,
] as readonly CanvasKitContribution[]
