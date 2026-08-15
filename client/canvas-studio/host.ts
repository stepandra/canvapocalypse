import { composeCanvasKitContributions } from './compose'
import type { CanvasKitComposition, CanvasKitContribution } from './types'
import { WORKBENCH_CANVAS_KIT_CONTRIBUTIONS } from './workbenchContributions'

export function createCanvapocalypseCanvasKitComposition(
	externalContributions: readonly CanvasKitContribution[] = []
): CanvasKitComposition {
	return composeCanvasKitContributions([
		...WORKBENCH_CANVAS_KIT_CONTRIBUTIONS,
		...externalContributions,
	])
}

export const CANVAPOCALYPSE_CANVAS_KIT_COMPOSITION =
	createCanvapocalypseCanvasKitComposition()
