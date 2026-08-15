import type { CanvasKitContribution } from '../canvas-studio/types'
import {
	CANVAS_LAYOUT_BINDING_UTILS,
	CANVAS_LAYOUT_ON_MOUNT,
	CANVAS_LAYOUT_SHAPE_UTILS,
} from './index'

export const CANVAS_LAYOUT_KIT_CONTRIBUTION: CanvasKitContribution = {
	kitId: 'canvas.layout',
	presetIds: [],
	shapeUtils: CANVAS_LAYOUT_SHAPE_UTILS,
	bindingUtils: CANVAS_LAYOUT_BINDING_UTILS,
	tools: [],
	onMount: CANVAS_LAYOUT_ON_MOUNT,
	insertPreset(_editor, presetId) {
		throw new Error(`Canvas layout kit does not provide preset ${presetId}`)
	},
}
