import { composeCanvasKitContributions } from './compose'
import type { CanvasKitComposition, CanvasKitContribution } from './types'
import { WORKBENCH_CANVAS_KIT_CONTRIBUTIONS } from './workbenchContributions'
import { CANVAS_LAYOUT_KIT_CONTRIBUTION } from '../layout/contribution'

export function createCanvapocalypseCanvasKitComposition(
	externalContributions: readonly CanvasKitContribution[] = []
): CanvasKitComposition {
	return composeCanvasKitContributions([
		...WORKBENCH_CANVAS_KIT_CONTRIBUTIONS,
		CANVAS_LAYOUT_KIT_CONTRIBUTION,
		...externalContributions,
	])
}

export const CANVAPOCALYPSE_CANVAS_KIT_COMPOSITION =
	createCanvapocalypseCanvasKitComposition()
