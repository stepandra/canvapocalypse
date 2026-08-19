import { composeCanvasKitContributions } from './compose'
import { CANVAPOCALYPSE_EXTERNAL_CANVAS_KIT_CONTRIBUTIONS } from './externalContributions'
import type { CanvasKitComposition, CanvasKitContribution } from './types'
import { WORKBENCH_CANVAS_KIT_CONTRIBUTIONS } from './workbenchContributions'
import { CANVAS_COMMENTS_KIT_CONTRIBUTION } from '../comments/contribution'
import { CANVAS_LAYOUT_KIT_CONTRIBUTION } from '../layout/contribution'
import { CANVAS_MARKDOWN_KIT_CONTRIBUTION } from '../markdown/contribution'

export function createCanvapocalypseCanvasKitComposition(
	externalContributions: readonly CanvasKitContribution[] =
		CANVAPOCALYPSE_EXTERNAL_CANVAS_KIT_CONTRIBUTIONS
): CanvasKitComposition {
	return composeCanvasKitContributions([
		...WORKBENCH_CANVAS_KIT_CONTRIBUTIONS,
		CANVAS_COMMENTS_KIT_CONTRIBUTION,
		CANVAS_LAYOUT_KIT_CONTRIBUTION,
		CANVAS_MARKDOWN_KIT_CONTRIBUTION,
		...externalContributions,
	])
}

export const CANVAPOCALYPSE_CANVAS_KIT_COMPOSITION =
	createCanvapocalypseCanvasKitComposition()
