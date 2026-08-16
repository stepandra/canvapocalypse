import {
	BaseFrameLikeShapeUtil,
	createShapeId,
	Editor,
	getIndicesBetween,
	Group2d,
	HTMLContainer,
	RecordProps,
	Rectangle2d,
	resizeBox,
	stopEventPropagation,
	T,
	TLDragShapesInInfo,
	TLDragShapesOutInfo,
	TLDropShapesOverInfo,
	TLEventInfo,
	TLResizeInfo,
	TLShape,
	TLShapeId,
	TLShapePartial,
	Vec,
	track,
	useEditor,
	useValue,
} from 'tldraw'
import {
	insertionIndexFromPoint,
	LayoutAlign,
	LayoutDirection,
	LayoutJustify,
	LayoutSize,
	minimumLayoutSize,
	nearlyEqual,
	planLayout,
	pointNearlyEqual,
} from './geometry'

export const FLEX_LAYOUT_SHAPE_TYPE = 'canvapocalypse-flex-layout' as const
export const FLEX_LAYOUT_LABEL = 'Flex layout'
export const FLEX_LAYOUT_DEFAULT_GAP = 16
export const FLEX_LAYOUT_DEFAULT_PADDING = 24
export const FLEX_LAYOUT_MIN_WIDTH = 120
export const FLEX_LAYOUT_MIN_HEIGHT = 96

export interface FlexLayoutShapeProps {
	w: number
	h: number
	direction: LayoutDirection
	align: LayoutAlign
	justify: LayoutJustify
	gap: number
	padding: number
}

declare module '@tldraw/tlschema' {
	export interface TLGlobalShapePropsMap {
		[FLEX_LAYOUT_SHAPE_TYPE]: FlexLayoutShapeProps
	}
}

export type FlexLayoutShape = TLShape<typeof FLEX_LAYOUT_SHAPE_TYPE>

function getLayoutSpec(shape: FlexLayoutShape) {
	return {
		direction: shape.props.direction,
		align: shape.props.align,
		justify: shape.props.justify,
		gap: shape.props.gap,
		padding: shape.props.padding,
	}
}

function getFlexChildren(editor: Editor, containerId: TLShapeId, excludeIds?: Set<TLShapeId>) {
	return editor
		.getSortedChildIdsForParent(containerId)
		.filter((id) => !excludeIds?.has(id))
		.map((id) => editor.getShape(id))
		.filter((shape): shape is TLShape => Boolean(shape))
}

function getShapeLocalBox(editor: Editor, shape: TLShape) {
	const geometryBounds = editor.getShapeGeometry(shape).bounds
	return {
		x: shape.x + geometryBounds.x,
		y: shape.y + geometryBounds.y,
		w: geometryBounds.w,
		h: geometryBounds.h,
	}
}

function getShapeLayoutSize(editor: Editor, shape: TLShape): LayoutSize {
	const bounds = editor.getShapeGeometry(shape).bounds
	return { w: bounds.w, h: bounds.h }
}

const projectingFlexEditors = new WeakSet<Editor>()
const pendingFlexContainerIds = new WeakMap<Editor, Set<TLShapeId>>()

function deferFlexProjection(editor: Editor, containerId: TLShapeId) {
	let pending = pendingFlexContainerIds.get(editor)
	if (!pending) {
		pending = new Set()
		pendingFlexContainerIds.set(editor, pending)
	}
	pending.add(containerId)
}

function flushDeferredFlexProjection(editor: Editor) {
	const pending = pendingFlexContainerIds.get(editor)
	if (!pending?.size) return
	pendingFlexContainerIds.delete(editor)
	for (const containerId of pending) projectFlexLayout(editor, containerId)
}

export function projectFlexLayout(editor: Editor, containerId: TLShapeId) {
	if (projectingFlexEditors.has(editor)) return false
	if (editor.isIn('select.translating')) {
		deferFlexProjection(editor, containerId)
		return false
	}
	const shape = editor.getShape<FlexLayoutShape>(containerId)
	if (!shape || shape.type !== FLEX_LAYOUT_SHAPE_TYPE) return false
	const children = getFlexChildren(editor, shape.id)
	const plan = planLayout(
		children.map((child) => getShapeLayoutSize(editor, child)),
		{ w: shape.props.w, h: shape.props.h },
		getLayoutSpec(shape),
		{ w: FLEX_LAYOUT_MIN_WIDTH, h: FLEX_LAYOUT_MIN_HEIGHT }
	)

	const updates: TLShapePartial[] = []
	if (!nearlyEqual(shape.props.w, plan.size.w) || !nearlyEqual(shape.props.h, plan.size.h)) {
		updates.push({
			id: shape.id,
			type: shape.type,
			props: { w: plan.size.w, h: plan.size.h },
		})
	}

	for (let index = 0; index < children.length; index += 1) {
		const child = children[index]
		const geometryBounds = editor.getShapeGeometry(child).bounds
		const point = {
			x: plan.positions[index].x - geometryBounds.x,
			y: plan.positions[index].y - geometryBounds.y,
		}
		if (pointNearlyEqual(child, point)) continue
		updates.push({ id: child.id, type: child.type, ...point })
	}

	if (updates.length === 0) return false
	projectingFlexEditors.add(editor)
	try {
		editor.updateShapes(updates)
	} finally {
		projectingFlexEditors.delete(editor)
	}
	return true
}

function canParentShapesInFlex(editor: Editor, container: FlexLayoutShape, shapes: TLShape[]) {
	return shapes.every(
		(shape) => shape.id !== container.id && !editor.hasAncestor(container, shape.id)
	)
}

function getFlexDropIndex(editor: Editor, container: FlexLayoutShape, movingShapes: TLShape[]) {
	const movingIds = new Set(movingShapes.map((shape) => shape.id))
	const children = getFlexChildren(editor, container.id, movingIds)
	const point = editor.getPointInShapeSpace(container, editor.inputs.getCurrentPagePoint())
	return insertionIndexFromPoint(
		point,
		children.map((child) => getShapeLocalBox(editor, child)),
		container.props.direction
	)
}

export function insertShapesIntoFlexLayout(
	editor: Editor,
	containerId: TLShapeId,
	shapeIds: readonly TLShapeId[],
	dropIndex: number
) {
	const container = editor.getShape<FlexLayoutShape>(containerId)
	if (!container || container.type !== FLEX_LAYOUT_SHAPE_TYPE) return false
	const shapes = shapeIds
		.map((id) => editor.getShape(id))
		.filter((shape): shape is TLShape => Boolean(shape))
	if (shapes.length === 0 || !canParentShapesInFlex(editor, container, shapes)) return false

	const movingIds = new Set(shapes.map((shape) => shape.id))
	const remaining = getFlexChildren(editor, container.id, movingIds)
	const insertionIndex = Math.max(0, Math.min(dropIndex, remaining.length))
	const next = [...remaining]
	next.splice(insertionIndex, 0, ...shapes)
	const movingIndices = getIndicesBetween(
		remaining[insertionIndex - 1]?.index,
		remaining[insertionIndex]?.index,
		shapes.length
	)
	const movingIndexById = new Map(
		shapes.map((shape, index) => [shape.id, movingIndices[index]] as const)
	)
	const plan = planLayout(
		next.map((child) => getShapeLayoutSize(editor, child)),
		{ w: container.props.w, h: container.props.h },
		getLayoutSpec(container),
		{ w: FLEX_LAYOUT_MIN_WIDTH, h: FLEX_LAYOUT_MIN_HEIGHT }
	)

	editor.run(() => {
		editor.reparentShapes(shapes, container.id)
		editor.updateShape<FlexLayoutShape>({
			id: container.id,
			type: container.type,
			props: { w: plan.size.w, h: plan.size.h },
		})
		editor.updateShapes(
			next.map((child, index) => {
				const current = editor.getShape(child.id) ?? child
				const geometryBounds = editor.getShapeGeometry(current).bounds
				return {
					id: current.id,
					type: current.type,
					...(movingIndexById.has(current.id)
						? { index: movingIndexById.get(current.id) }
						: {}),
					x: plan.positions[index].x - geometryBounds.x,
					y: plan.positions[index].y - geometryBounds.y,
				}
			}) as TLShapePartial[]
		)
	})
	return true
}

export function removeShapesFromFlexLayout(editor: Editor, shapeIds: readonly TLShapeId[]) {
	const shapes = shapeIds
		.map((id) => editor.getShape(id))
		.filter((shape): shape is TLShape => Boolean(shape))
	const containerIds = new Set<TLShapeId>()
	for (const shape of shapes) {
		const parent = editor.getShape(shape.parentId)
		if (parent?.type === FLEX_LAYOUT_SHAPE_TYPE) containerIds.add(parent.id)
	}
	if (containerIds.size === 0) return false

	editor.run(() => {
		editor.reparentShapes(shapes, editor.getCurrentPageId())
		for (const containerId of containerIds) projectFlexLayout(editor, containerId)
	})
	return true
}

export function updateFlexLayoutProps(
	editor: Editor,
	containerId: TLShapeId,
	props: Partial<Pick<FlexLayoutShapeProps, 'direction' | 'align' | 'justify' | 'gap' | 'padding'>>
) {
	const shape = editor.getShape<FlexLayoutShape>(containerId)
	if (!shape || shape.type !== FLEX_LAYOUT_SHAPE_TYPE) return false
	editor.run(() => {
		editor.updateShape<FlexLayoutShape>({ id: shape.id, type: shape.type, props })
		projectFlexLayout(editor, shape.id)
	})
	return true
}

export function mountFlexLayout(editor: Editor) {
	const handleEvent = (event: TLEventInfo) => {
		if (
			(event.type === 'pointer' && event.name === 'pointer_up') ||
			(event.type === 'misc' &&
				(event.name === 'complete' || event.name === 'cancel' || event.name === 'interrupt'))
		) {
			flushDeferredFlexProjection(editor)
		}
	}
	editor.on('event', handleEvent)
	return () => {
		pendingFlexContainerIds.delete(editor)
		editor.off('event', handleEvent)
	}
}

export function createFlexLayout(
	editor: Editor,
	point = editor.getViewportPageBounds().center,
	props: Partial<FlexLayoutShapeProps> = {}
) {
	const id = createShapeId()
	const w = Math.max(FLEX_LAYOUT_MIN_WIDTH, props.w ?? 360)
	const h = Math.max(FLEX_LAYOUT_MIN_HEIGHT, props.h ?? 220)
	editor.markHistoryStoppingPoint('Create flex layout')
	editor.createShape<FlexLayoutShape>({
		id,
		type: FLEX_LAYOUT_SHAPE_TYPE,
		x: point.x - w / 2,
		y: point.y - h / 2,
		props: { ...props, w, h },
	})
	editor.select(id)
	return id
}

export class FlexLayoutShapeUtil extends BaseFrameLikeShapeUtil<FlexLayoutShape> {
	static override type = FLEX_LAYOUT_SHAPE_TYPE
	static override props: RecordProps<FlexLayoutShape> = {
		w: T.nonZeroNumber,
		h: T.nonZeroNumber,
		direction: T.literalEnum('horizontal', 'vertical'),
		align: T.literalEnum('start', 'center', 'end'),
		justify: T.literalEnum('start', 'center', 'end', 'space-between'),
		gap: T.number,
		padding: T.number,
	}

	override canResizeChildren() {
		return false
	}

	override getDefaultProps(): FlexLayoutShape['props'] {
		return {
			w: 360,
			h: 220,
			direction: 'horizontal',
			align: 'center',
			justify: 'start',
			gap: FLEX_LAYOUT_DEFAULT_GAP,
			padding: FLEX_LAYOUT_DEFAULT_PADDING,
		}
	}

	override getGeometry(shape: FlexLayoutShape) {
		return new Group2d({
			children: [
				new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: false }),
				new Rectangle2d({
					x: 0,
					y: -28,
					width: Math.max(96, Math.min(shape.props.w, 164)),
					height: 24,
					isFilled: true,
					isLabel: true,
					excludeFromShapeBounds: true,
				}),
			],
		})
	}

	override getClipPath(shape: FlexLayoutShape) {
		return [
			new Vec(0, 0),
			new Vec(shape.props.w, 0),
			new Vec(shape.props.w, shape.props.h),
			new Vec(0, shape.props.h),
		]
	}

	override component(shape: FlexLayoutShape) {
		return (
			<HTMLContainer
				style={{
					width: shape.props.w,
					height: shape.props.h,
					border: '2px solid var(--tl-color-text-3, #64748b)',
					borderRadius: 12,
					background: 'color-mix(in srgb, var(--tl-color-panel, #fff) 88%, transparent)',
					boxSizing: 'border-box',
					pointerEvents: 'none',
				}}
			>
				<div
					style={{
						position: 'absolute',
						left: 0,
						top: -28,
						height: 24,
						padding: '3px 9px',
						borderRadius: 6,
						background: 'var(--tl-color-panel, #fff)',
						border: '1px solid var(--tl-color-muted-1, #cbd5e1)',
						font: '600 12px/16px Inter, sans-serif',
						color: 'var(--tl-color-text-1, #0f172a)',
						boxSizing: 'border-box',
					}}
				>
					{FLEX_LAYOUT_LABEL}
				</div>
			</HTMLContainer>
		)
	}

	override getText() {
		return FLEX_LAYOUT_LABEL
	}

	override getIndicatorPath(shape: FlexLayoutShape) {
		const path = new Path2D()
		path.roundRect(0, 0, shape.props.w, shape.props.h, 12)
		return path
	}

	override onResize(shape: FlexLayoutShape, info: TLResizeInfo<FlexLayoutShape>) {
		const children = getFlexChildren(this.editor, shape.id)
		const minimum = minimumLayoutSize(
			children.map((child) => getShapeLayoutSize(this.editor, child)),
			getLayoutSpec(shape),
			{ w: FLEX_LAYOUT_MIN_WIDTH, h: FLEX_LAYOUT_MIN_HEIGHT }
		)
		return resizeBox(shape, info, { minWidth: minimum.w, minHeight: minimum.h })
	}

	override onResizeEnd(_initial: FlexLayoutShape, current: FlexLayoutShape) {
		projectFlexLayout(this.editor, current.id)
	}

	override onChildrenChange(shape: FlexLayoutShape) {
		projectFlexLayout(this.editor, shape.id)
	}

	override onDragShapesIn(
		shape: FlexLayoutShape,
		draggingShapes: TLShape[],
		info: TLDragShapesInInfo
	) {
		if (!canParentShapesInFlex(this.editor, shape, draggingShapes)) return
		super.onDragShapesIn(shape, draggingShapes, info)
	}

	override onDragShapesOut(
		shape: FlexLayoutShape,
		draggingShapes: TLShape[],
		info: TLDragShapesOutInfo
	) {
		if (info.nextDraggingOverShapeId) return
		const children = draggingShapes.filter((child) => child.parentId === shape.id)
		if (children.length === 0) return
		this.editor.reparentShapes(children, this.editor.getCurrentPageId())
		projectFlexLayout(this.editor, shape.id)
	}

	override onDropShapesOver(
		shape: FlexLayoutShape,
		draggingShapes: TLShape[],
		_info: TLDropShapesOverInfo
	) {
		insertShapesIntoFlexLayout(
			this.editor,
			shape.id,
			draggingShapes.map((child) => child.id),
			getFlexDropIndex(this.editor, shape, draggingShapes)
		)
	}
}

function LayoutNumberControl({
	label,
	value,
	onChange,
}: {
	label: string
	value: number
	onChange(value: number): void
}) {
	return (
		<label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
			<span>{label}</span>
			<input
				type="number"
				min={0}
				value={value}
				style={{ width: 54 }}
				onPointerDown={stopEventPropagation}
				onChange={(event) => onChange(Number(event.currentTarget.value))}
			/>
		</label>
	)
}

export const FlexLayoutControls = track(function FlexLayoutControls() {
	const editor = useEditor()
	const shape = useValue(
		'selected flex layout',
		() =>
			editor.getSelectedShapes().find((selected) => selected.type === FLEX_LAYOUT_SHAPE_TYPE) ??
			null,
		[editor]
	) as FlexLayoutShape | null
	if (!shape) return null

	const update = (
		props: Partial<Pick<FlexLayoutShapeProps, 'direction' | 'align' | 'justify' | 'gap' | 'padding'>>
	) => {
		updateFlexLayoutProps(editor, shape.id, props)
		editor.getContainer().focus()
	}

	return (
		<div
			onPointerDown={stopEventPropagation}
			style={{
				position: 'absolute',
				left: '50%',
				bottom: 120,
				transform: 'translateX(-50%)',
				display: 'flex',
				alignItems: 'center',
				gap: 6,
				padding: 8,
				borderRadius: 10,
				background: 'var(--tl-color-panel, #fff)',
				border: '1px solid var(--tl-color-muted-1, #cbd5e1)',
				boxShadow: '0 4px 16px rgb(15 23 42 / 16%)',
				pointerEvents: 'all',
			}}
		>
			<button type="button" onClick={() => createFlexLayout(editor)}>New flex layout</button>
			<button type="button" onClick={() => update({ direction: 'horizontal' })}>Row</button>
			<button type="button" onClick={() => update({ direction: 'vertical' })}>Column</button>
			<select
				aria-label="Flex alignment"
				value={shape.props.align}
				onChange={(event) => update({ align: event.currentTarget.value as LayoutAlign })}
			>
				<option value="start">Align start</option>
				<option value="center">Align center</option>
				<option value="end">Align end</option>
			</select>
			<select
				aria-label="Flex justification"
				value={shape.props.justify}
				onChange={(event) => update({ justify: event.currentTarget.value as LayoutJustify })}
			>
				<option value="start">Justify start</option>
				<option value="center">Justify center</option>
				<option value="end">Justify end</option>
				<option value="space-between">Space between</option>
			</select>
			<LayoutNumberControl label="Gap" value={shape.props.gap} onChange={(gap) => update({ gap })} />
			<LayoutNumberControl
				label="Padding"
				value={shape.props.padding}
				onChange={(padding) => update({ padding })}
			/>
			<button
				type="button"
				onClick={() => {
					const ids = editor
						.getSelectedShapeIds()
						.filter((id) => id !== shape.id)
					insertShapesIntoFlexLayout(editor, shape.id, ids, getFlexChildren(editor, shape.id).length)
				}}
			>
				Insert selected
			</button>
		</div>
	)
})

export const FLEX_LAYOUT_SHAPE_UTILS = [FlexLayoutShapeUtil] as const
export const FLEX_LAYOUT_COMPONENTS = { InFrontOfTheCanvas: FlexLayoutControls } as const
export const FLEX_LAYOUT_ON_MOUNT = mountFlexLayout
