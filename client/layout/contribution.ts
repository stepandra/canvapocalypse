import type { CanvasKitContribution } from '../canvas-studio/types'
import {
	CANVAS_LAYOUT_BINDING_UTILS,
	CANVAS_LAYOUT_LIFECYCLE_IDS,
	CANVAS_LAYOUT_MIGRATION_IDS,
	CANVAS_LAYOUT_ON_MOUNT,
	CANVAS_LAYOUT_SCHEMA_IDS,
	CANVAS_LAYOUT_SHAPE_UTILS,
} from './index'

export const CANVAS_LAYOUT_KIT_CONTRIBUTION: CanvasKitContribution = {
	kitId: 'canvas.layout',
	runtimeContract: {
		schema: 'canvas.kit-runtime/v1',
		owner: 'canvas.layout',
		tldrawVersion: '5.2.5',
		toolPaths: [],
		migrationIds: CANVAS_LAYOUT_MIGRATION_IDS,
		schemaIds: CANVAS_LAYOUT_SCHEMA_IDS,
		lifecycleIds: CANVAS_LAYOUT_LIFECYCLE_IDS,
		bridgeIds: [],
	},
	presetIds: [],
	shapeUtils: CANVAS_LAYOUT_SHAPE_UTILS,
	bindingUtils: CANVAS_LAYOUT_BINDING_UTILS,
	tools: [],
	onMount: CANVAS_LAYOUT_ON_MOUNT,
	insertPreset(_editor, presetId) {
		throw new Error(`Canvas layout kit does not provide preset ${presetId}`)
	},
}
