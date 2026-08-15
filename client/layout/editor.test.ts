import {
	createBindingId,
	createShapeId,
	getIndexAbove,
	getSnapshot,
	loadSnapshot,
	TLShape,
	TLShapeId,
	Vec,
} from 'tldraw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
	CONSTRAINT_LAYOUT_BINDING_TYPE,
	CONSTRAINT_LAYOUT_BINDING_VERSION,
	CONSTRAINT_LAYOUT_SHAPE_TYPE,
	ConstraintLayoutBinding,
	ConstraintLayoutShape,
	bindShapesToConstraintLayout,
	createConstraintLayout,
	detachShapesFromConstraintLayout,
	getConstraintBindingIndexForPoint,
	getConstraintBindingsForContainer,
	getConstraintBindingsForShape,
	projectConstraintLayout,
} from './binding'
import {
	FLEX_LAYOUT_MIN_HEIGHT,
	FLEX_LAYOUT_MIN_WIDTH,
	FLEX_LAYOUT_SHAPE_TYPE,
	FlexLayoutShape,
	insertShapesIntoFlexLayout,
	projectFlexLayout,
	removeShapesFromFlexLayout,
	updateFlexLayoutProps,
} from './flex'
import { installLayoutTestDom, LayoutTestEditor } from './testEditor'

function geo(id: TLShapeId, x: number, y: number, w = 80, h = 48, parentId?: TLShapeId) {
	return {
		id,
		type: 'geo' as const,
		x,
		y,
		...(parentId ? { parentId } : {}),
		props: { geo: 'rectangle' as const, w, h },
	}
}

function bindingOrder(editor: LayoutTestEditor, containerId: TLShapeId) {
	return getConstraintBindingsForContainer(editor, containerId).map((binding) => binding.toId)
}

describe('canvas layout editor behavior', () => {
	let editor: LayoutTestEditor
	let cleanupDom: () => void

	beforeEach(() => {
		cleanupDom = installLayoutTestDom()
		editor = new LayoutTestEditor()
	})

	afterEach(() => {
		editor.dispose()
		cleanupDom()
	})

	it('inserts, reorders, moves across containers, and drops out with native parent/index authority', () => {
		const a = createShapeId('flex-a')
		const b = createShapeId('flex-b')
		const c = createShapeId('flex-c')
		const left = createShapeId('flex-left')
		const right = createShapeId('flex-right')
		editor.createShapes([
			{ id: left, type: FLEX_LAYOUT_SHAPE_TYPE, x: 0, y: 0 },
			{ id: right, type: FLEX_LAYOUT_SHAPE_TYPE, x: 500, y: 0 },
			geo(a, 700, 50, 80, 40),
			geo(b, 800, 50, 100, 70),
			geo(c, 900, 50, 60, 50),
		])

		expect(insertShapesIntoFlexLayout(editor, left, [a, b], 0)).toBe(true)
		expect(editor.getSortedChildIdsForParent(left)).toEqual([a, b])
		expect(editor.getShape(a)?.parentId).toBe(left)
		expect(editor.getShape(b)?.parentId).toBe(left)

		expect(insertShapesIntoFlexLayout(editor, left, [b], 0)).toBe(true)
		expect(editor.getSortedChildIdsForParent(left)).toEqual([b, a])
		expect(editor.getShape(b)!.index < editor.getShape(a)!.index).toBe(true)

		expect(insertShapesIntoFlexLayout(editor, right, [b, c], 0)).toBe(true)
		expect(editor.getSortedChildIdsForParent(left)).toEqual([a])
		expect(editor.getSortedChildIdsForParent(right)).toEqual([b, c])

		expect(removeShapesFromFlexLayout(editor, [b])).toBe(true)
		expect(editor.getShape(b)?.parentId).toBe(editor.getCurrentPageId())
		expect(editor.getSortedChildIdsForParent(right)).toEqual([c])
	})

	it('rejects self-parenting and ancestry cycles and enforces minimum size', () => {
		const outer = createShapeId('flex-outer')
		const inner = createShapeId('flex-inner')
		editor.createShapes([
			{ id: outer, type: FLEX_LAYOUT_SHAPE_TYPE, x: 0, y: 0 },
			{ id: inner, type: FLEX_LAYOUT_SHAPE_TYPE, x: 20, y: 20, parentId: outer },
		])

		expect(insertShapesIntoFlexLayout(editor, outer, [outer], 0)).toBe(false)
		expect(insertShapesIntoFlexLayout(editor, inner, [outer], 0)).toBe(false)
		expect(editor.getShape(outer)?.parentId).toBe(editor.getCurrentPageId())
		expect(editor.getShape(inner)?.parentId).toBe(outer)

		editor.updateShape<FlexLayoutShape>({
			id: outer,
			type: FLEX_LAYOUT_SHAPE_TYPE,
			props: { w: 1, h: 1 },
		})
		updateFlexLayoutProps(editor, outer, { gap: 0 })
		const resized = editor.getShape<FlexLayoutShape>(outer)!
		expect(resized.props.w).toBeGreaterThanOrEqual(FLEX_LAYOUT_MIN_WIDTH)
		expect(resized.props.h).toBeGreaterThanOrEqual(FLEX_LAYOUT_MIN_HEIGHT)
	})

	it('clips children to the container rectangle and does not project during active translation', () => {
		const container = createShapeId('flex-clip')
		const child = createShapeId('flex-clip-child')
		editor.createShapes([
			{ id: container, type: FLEX_LAYOUT_SHAPE_TYPE, x: 100, y: 80 },
			geo(child, 0, 0, 80, 48, container),
		])
		const containerShape = editor.getShape<FlexLayoutShape>(container)!
		const clipPath = editor.getShapeUtil(containerShape).getClipPath!(containerShape)
		expect(clipPath?.map((point) => ({ x: point.x, y: point.y }))).toEqual([
			{ x: 0, y: 0 },
			{ x: containerShape.props.w, y: 0 },
			{ x: containerShape.props.w, y: containerShape.props.h },
			{ x: 0, y: containerShape.props.h },
		])
		expect(Math.min(...clipPath!.map((point) => point.y))).toBe(0)

		editor.select(child)
		const center = editor.getShapePageBounds(child)!.center
		editor.pointerDown(center.x, center.y, child)
		editor.pointerMove(center.x + 40, center.y + 25)
		const dragging = editor.getShape(child)!
		expect(editor.isIn('select.translating')).toBe(true)
		expect(projectFlexLayout(editor, container)).toBe(false)
		expect(editor.getShape(child)).toEqual(dragging)
		editor.pointerUp(center.x + 40, center.y + 25)
		expect(editor.getShape(child)).not.toEqual(dragging)
	})

	it('converges flex projection and records a multi-shape insert as one undo', () => {
		const container = createShapeId('flex-undo')
		const a = createShapeId('flex-undo-a')
		const b = createShapeId('flex-undo-b')
		editor.createShapes([
			{ id: container, type: FLEX_LAYOUT_SHAPE_TYPE, x: 0, y: 0 },
			geo(a, 500, 0),
			geo(b, 600, 0),
		])
		editor.markHistoryStoppingPoint('before flex insert')
		insertShapesIntoFlexLayout(editor, container, [a, b], 0)
		const after = editor.store.allRecords().map((record) => JSON.stringify(record)).sort()
		updateFlexLayoutProps(editor, container, {})
		const converged = editor.store.allRecords().map((record) => JSON.stringify(record)).sort()
		expect(converged).toEqual(after)

		editor.undo()
		expect(editor.getShape(a)?.parentId).toBe(editor.getCurrentPageId())
		expect(editor.getShape(b)?.parentId).toBe(editor.getCurrentPageId())
		expect(editor.getSortedChildIdsForParent(container)).toEqual([])
	})

	it('starts, moves, ends, cancels, detaches, and rebinds placeholder layout bindings', () => {
		const left = createConstraintLayout(editor, new Vec(180, 160))
		const right = createConstraintLayout(editor, new Vec(700, 160))
		const item = createShapeId('constraint-item')
		editor.createShape(geo(item, 500, 400, 80, 50))
		bindShapesToConstraintLayout(editor, left, [item])
		const stable = getConstraintBindingsForContainer(editor, left)[0]
		expect(stable.props.placeholder).toBe(false)

		editor.select(item)
		const center = editor.getShapePageBounds(item)!.center
		editor.pointerDown(center.x, center.y, item)
		editor.pointerMove(700, 160)
		const placeholder = getConstraintBindingsForContainer(editor, right)[0]
		expect(placeholder.toId).toBe(item)
		expect(placeholder.props.placeholder).toBe(true)
		expect(editor.getShape(item)?.parentId).toBe(editor.getCurrentPageId())
		editor.pointerUp(700, 160)
		const committed = getConstraintBindingsForContainer(editor, right)[0]
		expect(committed.toId).toBe(item)
		expect(committed.id).toBe(stable.id)
		expect(committed.props.placeholder).toBe(false)

		editor.select(item)
		const reboundCenter = editor.getShapePageBounds(item)!.center
		editor.pointerDown(reboundCenter.x, reboundCenter.y, item)
		editor.pointerMove(900, 600)
		editor.cancel()
		expect(bindingOrder(editor, right)).toEqual([])

		bindShapesToConstraintLayout(editor, right, [item])
		expect(detachShapesFromConstraintLayout(editor, [item])).toBe(true)
		expect(getConstraintBindingsForContainer(editor, right)).toEqual([])
		bindShapesToConstraintLayout(editor, left, [item])
		expect(bindingOrder(editor, left)).toEqual([item])
	})

	it('uses the off-center pointer for large-shape drag candidates and slots', () => {
		const container = createConstraintLayout(editor, new Vec(300, 180), {
			w: 360,
			h: 220,
			align: 'start',
		})
		const a = createShapeId('constraint-pointer-a')
		const b = createShapeId('constraint-pointer-b')
		const large = createShapeId('constraint-pointer-large')
		editor.createShapes([
			geo(a, 700, 500, 80, 48),
			geo(b, 800, 500, 80, 48),
			geo(large, 780, 520, 400, 160),
		])
		bindShapesToConstraintLayout(editor, container, [a, b])

		editor.select(large)
		const bounds = editor.getShapePageBounds(large)!
		const pointerOffset = { x: 390, y: 20 }
		editor.pointerDown(bounds.x + pointerOffset.x, bounds.y + pointerOffset.y, large)
		const containerShape = editor.getShape<ConstraintLayoutShape>(container)!
		const pointer = editor
			.getShapePageTransform(containerShape)
			.applyToPoint({ x: 4, y: containerShape.props.h / 2 })
		editor.pointerMove(pointer.x, pointer.y)

		expect(bindingOrder(editor, container)).toEqual([large, a, b])
		const placeholder = getConstraintBindingsForShape(editor, large)[0]
		expect(placeholder.props.placeholder).toBe(true)
		expect(editor.getShapePageBounds(large)!.center.x).toBeLessThan(
			editor.getShapePageBounds(container)!.minX
		)

		editor.pointerUp(pointer.x, pointer.y)
		expect(bindingOrder(editor, container)).toEqual([large, a, b])
		expect(getConstraintBindingsForShape(editor, large)[0].props.placeholder).toBe(false)
	})

	it('reorders placeholders and applies distinct container deletion semantics', () => {
		const container = createConstraintLayout(editor, new Vec(240, 180))
		const a = createShapeId('constraint-a')
		const b = createShapeId('constraint-b')
		const c = createShapeId('constraint-c')
		editor.createShapes([geo(a, 500, 400), geo(b, 600, 400), geo(c, 700, 400)])
		bindShapesToConstraintLayout(editor, container, [a, b, c])
		expect(bindingOrder(editor, container)).toEqual([a, b, c])

		const containerShape = editor.getShape<ConstraintLayoutShape>(container)!
		const cShape = editor.getShape(c)!
		const containerTransform = editor.getShapePageTransform(containerShape)
		const beforeFirstPoint = containerTransform.applyToPoint({ x: 4, y: containerShape.props.h / 2 })
		expect(
			getConstraintBindingIndexForPoint(editor, cShape, containerShape, beforeFirstPoint) <
				getConstraintBindingsForContainer(editor, container)[0].props.index
		).toBe(true)
		editor.select(c)
		const center = editor.getShapePageBounds(c)!.center
		editor.pointerDown(center.x, center.y, c)
		editor.pointerMove(beforeFirstPoint.x, beforeFirstPoint.y)
		expect(bindingOrder(editor, container)).toEqual([c, a, b])
		expect(getConstraintBindingsForContainer(editor, container)[0].props.placeholder).toBe(true)
		editor.pointerUp(beforeFirstPoint.x, beforeFirstPoint.y)
		expect(bindingOrder(editor, container)).toEqual([c, a, b])
		expect(getConstraintBindingsForContainer(editor, container)[0].props.placeholder).toBe(false)

		editor.deleteShape(a)
		expect(bindingOrder(editor, container)).toEqual([c, b])
		editor.deleteShape(container)
		expect(editor.getBindingsToShape(b, CONSTRAINT_LAYOUT_BINDING_TYPE)).toEqual([])
		expect(editor.getShape(b)).toBeTruthy()
		expect(editor.getShape(c)).toBeTruthy()

		const flexContainer = createShapeId('flex-delete-container')
		const flexChild = createShapeId('flex-delete-child')
		editor.createShapes([
			{ id: flexContainer, type: FLEX_LAYOUT_SHAPE_TYPE, x: 0, y: 500 },
			geo(flexChild, 700, 500),
		])
		insertShapesIntoFlexLayout(editor, flexContainer, [flexChild], 0)
		editor.deleteShape(flexContainer)
		expect(editor.getShape(flexContainer)).toBeUndefined()
		expect(editor.getShape(flexChild)).toBeUndefined()
	})

	it('restores flex props, parent/index authority, and binding version/order from a snapshot', () => {
		const flexContainer = createShapeId('flex-persist-container')
		const flexA = createShapeId('flex-persist-a')
		const flexB = createShapeId('flex-persist-b')
		const constraintContainer = createConstraintLayout(editor, new Vec(700, 180), {
			direction: 'vertical',
			align: 'end',
			justify: 'space-between',
			gap: 19,
			padding: 27,
		})
		const constraintA = createShapeId('constraint-persist-a')
		const constraintB = createShapeId('constraint-persist-b')
		editor.createShapes([
			{
				id: flexContainer,
				type: FLEX_LAYOUT_SHAPE_TYPE,
				x: 100,
				y: 100,
				props: {
					w: 420,
					h: 260,
					direction: 'vertical',
					align: 'end',
					justify: 'center',
					gap: 13,
					padding: 31,
				},
			},
			geo(flexA, 600, 500, 80, 48),
			geo(flexB, 700, 500, 100, 60),
			geo(constraintA, 900, 500, 80, 48),
			geo(constraintB, 1000, 500, 90, 54),
		])
		insertShapesIntoFlexLayout(editor, flexContainer, [flexB, flexA], 0)
		bindShapesToConstraintLayout(editor, constraintContainer, [constraintB, constraintA])
		const flexBefore = editor.getShape<FlexLayoutShape>(flexContainer)!
		const flexChildRecords = [flexB, flexA].map((id) => editor.getShape(id)!)
		const bindingBefore = getConstraintBindingsForContainer(editor, constraintContainer)
		const snapshot = getSnapshot(editor.store)
		const reopened = new LayoutTestEditor()
		try {
			loadSnapshot(reopened.store, snapshot)
			const flexAfter = reopened.getShape<FlexLayoutShape>(flexContainer)!
			expect(flexAfter.props).toEqual(flexBefore.props)
			expect(reopened.getSortedChildIdsForParent(flexContainer)).toEqual([flexB, flexA])
			for (const childBefore of flexChildRecords) {
				const childAfter = reopened.getShape(childBefore.id)!
				expect(childAfter.parentId).toBe(flexContainer)
				expect(childAfter.index).toBe(childBefore.index)
			}
			const bindingAfter = getConstraintBindingsForContainer(reopened, constraintContainer)
			expect(bindingAfter.map((binding) => binding.toId)).toEqual([constraintB, constraintA])
			expect(bindingAfter.map((binding) => binding.props.index)).toEqual(
				bindingBefore.map((binding) => binding.props.index)
			)
			expect(bindingAfter.every((binding) => binding.props.version === CONSTRAINT_LAYOUT_BINDING_VERSION)).toBe(
				true
			)
		} finally {
			reopened.dispose()
		}
	})

	it('projects through independent parent transforms and converges without capturing unrelated shapes', () => {
		const frame = createShapeId('constraint-parent-frame')
		const container = createConstraintLayout(editor, new Vec(220, 180))
		const bound = createShapeId('constraint-bound')
		const unrelated = createShapeId('constraint-unrelated')
		editor.createShapes([
			{
				id: frame,
				type: 'frame',
				x: 500,
				y: 200,
				rotation: Math.PI / 6,
				props: { w: 320, h: 240, name: 'parent' },
			},
			geo(bound, 40, 40, 90, 60, frame),
			geo(unrelated, 900, 600, 100, 70),
		])
		const unrelatedBefore = editor.getShape(unrelated)!
		bindShapesToConstraintLayout(editor, container, [bound])
		const boundAfter = editor.getShape(bound)!
		expect(boundAfter.parentId).toBe(frame)
		expect(editor.getShape(unrelated)).toEqual(unrelatedBefore)
		const recordsAfter = editor.store.allRecords().map((record) => JSON.stringify(record)).sort()
		expect(projectConstraintLayout(editor, container)).toBe(false)
		const recordsConverged = editor.store.allRecords().map((record) => JSON.stringify(record)).sort()
		expect(recordsConverged).toEqual(recordsAfter)
	})

	it('keeps bound reorder and cross-container movement to one undo step each', () => {
		const left = createConstraintLayout(editor, new Vec(240, 180))
		const right = createConstraintLayout(editor, new Vec(740, 180))
		const a = createShapeId('constraint-undo-a')
		const b = createShapeId('constraint-undo-b')
		const c = createShapeId('constraint-undo-c')
		editor.createShapes([geo(a, 700, 500), geo(b, 800, 500), geo(c, 900, 500)])
		bindShapesToConstraintLayout(editor, left, [a, b, c])
		const cBindingId = getConstraintBindingsForShape(editor, c)[0].id

		editor.select(c)
		let center = editor.getShapePageBounds(c)!.center
		const leftShape = editor.getShape<ConstraintLayoutShape>(left)!
		const beforeFirst = editor
			.getShapePageTransform(leftShape)
			.applyToPoint({ x: 4, y: leftShape.props.h / 2 })
		editor.pointerDown(center.x, center.y, c)
		editor.pointerMove(beforeFirst.x, beforeFirst.y)
		editor.pointerUp(beforeFirst.x, beforeFirst.y)
		expect(bindingOrder(editor, left)).toEqual([c, a, b])
		expect(getConstraintBindingsForShape(editor, c)[0].id).toBe(cBindingId)
		editor.undo()
		expect(bindingOrder(editor, left)).toEqual([a, b, c])
		expect(bindingOrder(editor, right)).toEqual([])
		expect(getConstraintBindingsForShape(editor, c)[0].id).toBe(cBindingId)

		editor.select(c)
		center = editor.getShapePageBounds(c)!.center
		editor.pointerDown(center.x, center.y, c)
		editor.pointerMove(740, 180)
		editor.pointerUp(740, 180)
		expect(bindingOrder(editor, left)).toEqual([a, b])
		expect(bindingOrder(editor, right)).toEqual([c])
		expect(getConstraintBindingsForShape(editor, c)[0].id).toBe(cBindingId)
		editor.undo()
		expect(bindingOrder(editor, left)).toEqual([a, b, c])
		expect(bindingOrder(editor, right)).toEqual([])
		expect(getConstraintBindingsForShape(editor, c)[0].id).toBe(cBindingId)
	})

	it('admits only explicit container-to-element endpoints and versioned props', () => {
		const container = createConstraintLayout(editor, new Vec(240, 180))
		const otherContainer = createConstraintLayout(editor, new Vec(700, 180))
		const item = createShapeId('constraint-explicit')
		editor.createShape(geo(item, 700, 500))
		editor.createBinding<ConstraintLayoutBinding>({
			id: createBindingId(),
			type: CONSTRAINT_LAYOUT_BINDING_TYPE,
			fromId: item,
			toId: container,
			props: {
				index: getIndexAbove(),
				placeholder: false,
				version: CONSTRAINT_LAYOUT_BINDING_VERSION,
			},
		})
		expect(editor.getBindingsFromShape(item, CONSTRAINT_LAYOUT_BINDING_TYPE)).toEqual([])
		editor.createBinding<ConstraintLayoutBinding>({
			id: createBindingId(),
			type: CONSTRAINT_LAYOUT_BINDING_TYPE,
			fromId: container,
			toId: otherContainer,
			props: {
				index: getIndexAbove(),
				placeholder: false,
				version: CONSTRAINT_LAYOUT_BINDING_VERSION,
			},
		})
		expect(editor.getBindingsFromShape(container, CONSTRAINT_LAYOUT_BINDING_TYPE)).toEqual([])
	})
})
