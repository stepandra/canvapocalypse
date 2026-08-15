import { CONSTRAINT_LAYOUT_SHAPE_UTILS, mountConstraintLayout } from './binding'
import { FLEX_LAYOUT_SHAPE_UTILS, mountFlexLayout } from './flex'

export {
	CANVAS_LAYOUT_COMPONENTS,
	CanvasLayoutControls,
} from './components'
export {
	CONSTRAINT_LAYOUT_BINDING_TYPE,
	CONSTRAINT_LAYOUT_BINDING_UTILS,
	CONSTRAINT_LAYOUT_BINDING_VERSION,
	CONSTRAINT_LAYOUT_ON_MOUNT,
	CONSTRAINT_LAYOUT_SHAPE_TYPE,
	CONSTRAINT_LAYOUT_SHAPE_UTILS,
	ConstraintLayoutBindingUtil,
	ConstraintLayoutControls,
	ConstraintLayoutShapeUtil,
	bindShapesToConstraintLayout,
	createConstraintLayout,
	detachShapesFromConstraintLayout,
	getConstraintBindingIndexForPoint,
	getConstraintBindingsForContainer,
	getConstraintBindingsForShape,
	mountConstraintLayout,
	projectConstraintLayout,
	updateConstraintLayoutProps,
} from './binding'
export type {
	ConstraintLayoutBinding,
	ConstraintLayoutBindingProps,
	ConstraintLayoutShape,
	ConstraintLayoutShapeProps,
} from './binding'
export {
	FLEX_LAYOUT_COMPONENTS,
	FLEX_LAYOUT_ON_MOUNT,
	FLEX_LAYOUT_SHAPE_TYPE,
	FLEX_LAYOUT_SHAPE_UTILS,
	FlexLayoutControls,
	FlexLayoutShapeUtil,
	createFlexLayout,
	insertShapesIntoFlexLayout,
	mountFlexLayout,
	projectFlexLayout,
	removeShapesFromFlexLayout,
	updateFlexLayoutProps,
} from './flex'
export type { FlexLayoutShape, FlexLayoutShapeProps } from './flex'
export {
	LAYOUT_EPSILON,
	clampInsertionIndex,
	getCrossAxisOffset,
	getMainAxisPositions,
	insertionIndexFromPoint,
	minimumLayoutSize,
	nearlyEqual,
	normalizeLayoutSpec,
	planLayout,
	pointNearlyEqual,
	sizeNearlyEqual,
} from './geometry'
export type {
	LayoutAlign,
	LayoutBox,
	LayoutDirection,
	LayoutJustify,
	LayoutPlan,
	LayoutPoint,
	LayoutSize,
	LayoutSpec,
} from './geometry'

export {
	CONSTRAINT_LAYOUT_BINDING_UTILS as CANVAS_LAYOUT_BINDING_UTILS,
} from './binding'
export {
	CANVAS_LAYOUT_COMPONENTS as CANVAS_LAYOUT_HOST_COMPONENTS,
} from './components'
export const CANVAS_LAYOUT_SHAPE_UTILS = [
	...FLEX_LAYOUT_SHAPE_UTILS,
	...CONSTRAINT_LAYOUT_SHAPE_UTILS,
] as const
export function CANVAS_LAYOUT_ON_MOUNT(editor: import('tldraw').Editor) {
	const disposeFlex = mountFlexLayout(editor)
	const disposeConstraint = mountConstraintLayout(editor)
	return () => {
		disposeConstraint()
		disposeFlex()
	}
}
