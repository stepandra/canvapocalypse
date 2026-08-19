import {
	BindingOnChangeOptions,
	BindingOnCreateOptions,
	BindingOnDeleteOptions,
	BindingOnShapeChangeOptions,
	BindingUtil,
	Box,
	createBindingId,
	createBindingPropsMigrationIds,
	createBindingPropsMigrationSequence,
	createShapeId,
	Editor,
	getIndexBetween,
	getIndicesBetween,
	HTMLContainer,
	IndexKey,
	RecordProps,
	Rectangle2d,
	resizeBox,
	stopEventPropagation,
	T,
	TLBinding,
	TLBindingId,
	TLEventInfo,
	TLResizeInfo,
	TLShape,
	TLShapeId,
	TLShapePartial,
	TLShapeUtilCanBindOpts,
	TldrawUiButtonIcon,
	TldrawUiToolbar,
	TldrawUiToolbarButton,
	BaseBoxShapeUtil,
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
	nearlyEqual,
	planLayout,
	pointNearlyEqual,
} from './geometry'

export const CONSTRAINT_LAYOUT_SHAPE_TYPE = 'canvapocalypse-constraint-layout' as const
export const CONSTRAINT_LAYOUT_BINDING_TYPE = 'canvapocalypse-layout-item' as const
export const CONSTRAINT_LAYOUT_BINDING_VERSION = 1
export const CONSTRAINT_LAYOUT_MIN_WIDTH = 120
export const CONSTRAINT_LAYOUT_MIN_HEIGHT = 96
export const CONSTRAINT_LAYOUT_DEFAULT_GAP = 16
export const CONSTRAINT_LAYOUT_DEFAULT_PADDING = 24

export interface ConstraintLayoutShapeProps {
	w: number
	h: number
	direction: LayoutDirection
	align: LayoutAlign
	justify: LayoutJustify
	gap: number
	padding: number
}

export interface ConstraintLayoutBindingProps {
	index: IndexKey
	placeholder: boolean
	version: number
}

declare module '@tldraw/tlschema' {
	export interface TLGlobalShapePropsMap {
		[CONSTRAINT_LAYOUT_SHAPE_TYPE]: ConstraintLayoutShapeProps
	}

	export interface TLGlobalBindingPropsMap {
		[CONSTRAINT_LAYOUT_BINDING_TYPE]: ConstraintLayoutBindingProps
	}
}

export type ConstraintLayoutShape = TLShape<typeof CONSTRAINT_LAYOUT_SHAPE_TYPE>
export type ConstraintLayoutBinding = TLBinding<typeof CONSTRAINT_LAYOUT_BINDING_TYPE>

const ConstraintLayoutBindingVersions = createBindingPropsMigrationIds(
	CONSTRAINT_LAYOUT_BINDING_TYPE,
	{ AddVersion: 1 }
)

const constraintLayoutBindingMigrations = createBindingPropsMigrationSequence({
	sequence: [
		{
			id: ConstraintLayoutBindingVersions.AddVersion,
			up: (props: Record<string, unknown>) => {
				props.version = CONSTRAINT_LAYOUT_BINDING_VERSION
				if (typeof props.placeholder !== 'boolean') props.placeholder = false
			},
			down: (props: Record<string, unknown>) => {
				delete props.version
			},
		},
	],
})

function isConstraintLayoutShape(shape: TLShape | null | undefined): shape is ConstraintLayoutShape {
	return shape?.type === CONSTRAINT_LAYOUT_SHAPE_TYPE
}

function getConstraintLayoutSpec(shape: ConstraintLayoutShape) {
	return {
		direction: shape.props.direction,
		align: shape.props.align,
		justify: shape.props.justify,
		gap: shape.props.gap,
		padding: shape.props.padding,
	}
}

function sortLayoutBindings(bindings: readonly ConstraintLayoutBinding[]) {
	return [...bindings].sort((a, b) =>
		a.props.index === b.props.index ? a.id.localeCompare(b.id) : a.props.index < b.props.index ? -1 : 1
	)
}

export function getConstraintBindingsForContainer(editor: Editor, containerId: TLShapeId) {
	return sortLayoutBindings(
		editor.getBindingsFromShape<ConstraintLayoutBinding>(
			containerId,
			CONSTRAINT_LAYOUT_BINDING_TYPE
		)
	)
}

export function getConstraintBindingsForShape(editor: Editor, shapeId: TLShapeId) {
	return editor.getBindingsToShape<ConstraintLayoutBinding>(
		shapeId,
		CONSTRAINT_LAYOUT_BINDING_TYPE
	)
}

function getShapeBoxInContainer(
	editor: Editor,
	container: ConstraintLayoutShape,
	shape: TLShape
) {
	const pagePoints = editor
		.getShapePageTransform(shape)
		.applyToPoints(editor.getShapeGeometry(shape).vertices)
	const inverseContainer = editor.getShapePageTransform(container).clone().invert()
	return Box.FromPoints(inverseContainer.applyToPoints(pagePoints))
}

function getShapeSizeInContainer(
	editor: Editor,
	container: ConstraintLayoutShape,
	shape: TLShape
): LayoutSize {
	const box = getShapeBoxInContainer(editor, container, shape)
	return { w: box.w, h: box.h }
}

function getBindingShapes(editor: Editor, bindings: readonly ConstraintLayoutBinding[]) {
	return bindings
		.map((binding) => ({ binding, shape: editor.getShape(binding.toId) }))
		.filter(
			(value): value is { binding: ConstraintLayoutBinding; shape: TLShape } =>
				Boolean(value.shape)
		)
}

function getDesiredShapePoint(
	editor: Editor,
	container: ConstraintLayoutShape,
	shape: TLShape,
	desiredBoxPoint: { x: number; y: number }
) {
	const currentBox = getShapeBoxInContainer(editor, container, shape)
	const shapeOriginPage = editor.getShapePageTransform(shape).point()
	const shapeOriginContainer = editor.getPointInShapeSpace(container, shapeOriginPage)
	const desiredOriginContainer = {
		x: shapeOriginContainer.x + desiredBoxPoint.x - currentBox.x,
		y: shapeOriginContainer.y + desiredBoxPoint.y - currentBox.y,
	}
	const desiredPagePoint = editor
		.getShapePageTransform(container)
		.applyToPoint(desiredOriginContainer)
	const point = editor.getPointInParentSpace(shape, desiredPagePoint)
	return { x: point.x, y: point.y }
}

const projectingEditors = new WeakSet<Editor>()

export function projectConstraintLayout(editor: Editor, containerId: TLShapeId) {
	if (projectingEditors.has(editor)) return false
	const container = editor.getShape<ConstraintLayoutShape>(containerId)
	if (!isConstraintLayoutShape(container)) return false
	const entries = getBindingShapes(editor, getConstraintBindingsForContainer(editor, container.id))
	const plan = planLayout(
		entries.map(({ shape }) => getShapeSizeInContainer(editor, container, shape)),
		{ w: container.props.w, h: container.props.h },
		getConstraintLayoutSpec(container),
		{ w: CONSTRAINT_LAYOUT_MIN_WIDTH, h: CONSTRAINT_LAYOUT_MIN_HEIGHT }
	)
	const updates: TLShapePartial[] = []

	if (!nearlyEqual(container.props.w, plan.size.w) || !nearlyEqual(container.props.h, plan.size.h)) {
		updates.push({
			id: container.id,
			type: container.type,
			props: { w: plan.size.w, h: plan.size.h },
		})
	}

	for (let index = 0; index < entries.length; index += 1) {
		const { binding, shape } = entries[index]
		if (binding.props.placeholder) continue
		const point = getDesiredShapePoint(editor, container, shape, plan.positions[index])
		if (pointNearlyEqual(shape, point)) continue
		updates.push({ id: shape.id, type: shape.type, ...point })
	}

	if (updates.length === 0) return false
	projectingEditors.add(editor)
	try {
		editor.updateShapes(updates)
	} finally {
		projectingEditors.delete(editor)
	}
	return true
}

function canUseConstraintEndpoint(
	editor: Editor,
	container: ConstraintLayoutShape,
	shape: TLShape
) {
	return (
		shape.id !== container.id &&
		shape.type !== CONSTRAINT_LAYOUT_SHAPE_TYPE &&
		!editor.hasAncestor(container, shape.id) &&
		editor.canBindShapes({
			fromShape: container,
			toShape: shape,
			binding: CONSTRAINT_LAYOUT_BINDING_TYPE,
		})
	)
}

function getContainerAtPoint(editor: Editor, shape: TLShape, pagePoint: { x: number; y: number }) {
	return editor.getShapeAtPoint(pagePoint, {
		hitInside: true,
		hitFrameInside: true,
		filter: (candidate) =>
			isConstraintLayoutShape(candidate) && canUseConstraintEndpoint(editor, candidate, shape),
	}) as ConstraintLayoutShape | undefined
}

export function getConstraintBindingIndexForPoint(
	editor: Editor,
	shape: TLShape,
	container: ConstraintLayoutShape,
	pagePoint: { x: number; y: number }
) {
	const entries = getBindingShapes(
		editor,
		getConstraintBindingsForContainer(editor, container.id).filter(
			(binding) => binding.toId !== shape.id
		)
	)
	const planned = planLayout(
		entries.map(({ shape: sibling }) => getShapeSizeInContainer(editor, container, sibling)),
		{ w: container.props.w, h: container.props.h },
		getConstraintLayoutSpec(container),
		{ w: CONSTRAINT_LAYOUT_MIN_WIDTH, h: CONSTRAINT_LAYOUT_MIN_HEIGHT }
	)
	const point = editor.getPointInShapeSpace(container, pagePoint)
	const insertionIndex = insertionIndexFromPoint(
		point,
		entries.map(({ shape: sibling }, index) => {
			const size = getShapeSizeInContainer(editor, container, sibling)
			return { ...planned.positions[index], ...size }
		}),
		container.props.direction
	)
	return getIndexBetween(
		entries[insertionIndex - 1]?.binding.props.index,
		entries[insertionIndex]?.binding.props.index
	)
}

function updateConstraintDragCandidate(editor: Editor, shape: TLShape) {
	const pagePoint = editor.inputs.getCurrentPagePoint()
	const container = getContainerAtPoint(editor, shape, pagePoint)
	const currentBindings = getConstraintBindingsForShape(editor, shape.id)
	if (!container) {
		if (currentBindings.length) editor.deleteBindings(currentBindings)
		return
	}

	const index = getConstraintBindingIndexForPoint(editor, shape, container, pagePoint)
	const reusable = currentBindings.find((binding) => binding.fromId === container.id) ?? currentBindings[0]
	const stale = currentBindings.filter((binding) => binding.id !== reusable?.id)
	if (stale.length) editor.deleteBindings(stale)
	if (reusable) {
		if (
			reusable.fromId === container.id &&
			reusable.props.index === index &&
			reusable.props.placeholder
		) {
			return
		}
		editor.updateBinding<ConstraintLayoutBinding>({
			id: reusable.id,
			type: reusable.type,
			fromId: container.id,
			props: {
				index,
				placeholder: true,
				version: CONSTRAINT_LAYOUT_BINDING_VERSION,
			},
		})
		return
	}

	editor.createBinding<ConstraintLayoutBinding>({
		id: createBindingId(),
		type: CONSTRAINT_LAYOUT_BINDING_TYPE,
		fromId: container.id,
		toId: shape.id,
		props: {
			index,
			placeholder: true,
			version: CONSTRAINT_LAYOUT_BINDING_VERSION,
		},
	})
}

function finalizeConstraintShape(editor: Editor, shape: TLShape) {
	const pagePoint = editor.inputs.getCurrentPagePoint()
	const container = getContainerAtPoint(editor, shape, pagePoint)
	const bindings = getConstraintBindingsForShape(editor, shape.id)
	if (!container) {
		if (bindings.length) editor.deleteBindings(bindings)
		return
	}
	const index = getConstraintBindingIndexForPoint(editor, shape, container, pagePoint)
	const reusable = bindings.find((binding) => binding.fromId === container.id) ?? bindings[0]
	const stale = bindings.filter((binding) => binding.id !== reusable?.id)
	if (stale.length) editor.deleteBindings(stale)
	if (reusable) {
		editor.updateBinding<ConstraintLayoutBinding>({
			id: reusable.id,
			type: reusable.type,
			fromId: container.id,
			props: {
				index,
				placeholder: false,
				version: CONSTRAINT_LAYOUT_BINDING_VERSION,
			},
		})
		return
	}
	editor.createBinding<ConstraintLayoutBinding>({
		id: createBindingId(),
		type: CONSTRAINT_LAYOUT_BINDING_TYPE,
		fromId: container.id,
		toId: shape.id,
		props: {
			index,
			placeholder: false,
			version: CONSTRAINT_LAYOUT_BINDING_VERSION,
		},
	})
}

export function bindShapesToConstraintLayout(
	editor: Editor,
	containerId: TLShapeId,
	shapeIds: readonly TLShapeId[],
	insertAt = getConstraintBindingsForContainer(editor, containerId).length
) {
	const container = editor.getShape<ConstraintLayoutShape>(containerId)
	if (!isConstraintLayoutShape(container)) return []
	const shapes = shapeIds
		.map((id) => editor.getShape(id))
		.filter((shape): shape is TLShape => Boolean(shape))
		.filter((shape) => canUseConstraintEndpoint(editor, container, shape))
	if (shapes.length === 0) return []

	const shapeIdsSet = new Set(shapes.map((shape) => shape.id))
	const existing = getConstraintBindingsForContainer(editor, container.id).filter(
		(binding) => !shapeIdsSet.has(binding.toId)
	)
	const insertionIndex = Math.max(0, Math.min(insertAt, existing.length))
	const indices = getIndicesBetween(
		existing[insertionIndex - 1]?.props.index,
		existing[insertionIndex]?.props.index,
		shapes.length
	)
	const created: TLBindingId[] = []

	editor.run(() => {
		for (let index = 0; index < shapes.length; index += 1) {
			const shape = shapes[index]
			const currentBindings = getConstraintBindingsForShape(editor, shape.id)
			const reusable = currentBindings[0]
			const stale = currentBindings.slice(1)
			if (stale.length) editor.deleteBindings(stale)
			if (reusable) {
				editor.updateBinding<ConstraintLayoutBinding>({
					id: reusable.id,
					type: reusable.type,
					fromId: container.id,
					props: {
						...reusable.props,
						index: indices[index],
						placeholder: false,
						version: CONSTRAINT_LAYOUT_BINDING_VERSION,
					},
				})
				continue
			}
			const id = createBindingId()
			created.push(id)
			editor.createBinding<ConstraintLayoutBinding>({
				id,
				type: CONSTRAINT_LAYOUT_BINDING_TYPE,
				fromId: container.id,
				toId: shape.id,
				props: {
					index: indices[index],
					placeholder: false,
					version: CONSTRAINT_LAYOUT_BINDING_VERSION,
				},
			})
		}
	})
	return created
}

export function detachShapesFromConstraintLayout(editor: Editor, shapeIds: readonly TLShapeId[]) {
	const bindings = shapeIds.flatMap((shapeId) => getConstraintBindingsForShape(editor, shapeId))
	if (bindings.length === 0) return false
	editor.deleteBindings(bindings)
	return true
}

export function updateConstraintLayoutProps(
	editor: Editor,
	containerId: TLShapeId,
	props: Partial<
		Pick<ConstraintLayoutShapeProps, 'direction' | 'align' | 'justify' | 'gap' | 'padding'>
	>
) {
	const container = editor.getShape<ConstraintLayoutShape>(containerId)
	if (!isConstraintLayoutShape(container)) return false
	editor.run(() => {
		editor.updateShape<ConstraintLayoutShape>({ id: container.id, type: container.type, props })
		projectConstraintLayout(editor, container.id)
	})
	return true
}

export function createConstraintLayout(
	editor: Editor,
	point = editor.getViewportPageBounds().center,
	props: Partial<ConstraintLayoutShapeProps> = {}
) {
	const id = createShapeId()
	const w = Math.max(CONSTRAINT_LAYOUT_MIN_WIDTH, props.w ?? 360)
	const h = Math.max(CONSTRAINT_LAYOUT_MIN_HEIGHT, props.h ?? 220)
	editor.markHistoryStoppingPoint('Create constraint layout')
	editor.createShape<ConstraintLayoutShape>({
		id,
		type: CONSTRAINT_LAYOUT_SHAPE_TYPE,
		x: point.x - w / 2,
		y: point.y - h / 2,
		props: { ...props, w, h },
	})
	editor.select(id)
	return id
}

export class ConstraintLayoutShapeUtil extends BaseBoxShapeUtil<ConstraintLayoutShape> {
	static override type = CONSTRAINT_LAYOUT_SHAPE_TYPE
	static override props: RecordProps<ConstraintLayoutShape> = {
		w: T.nonZeroNumber,
		h: T.nonZeroNumber,
		direction: T.literalEnum('horizontal', 'vertical'),
		align: T.literalEnum('start', 'center', 'end'),
		justify: T.literalEnum('start', 'center', 'end', 'space-between'),
		gap: T.number,
		padding: T.number,
	}

	override getDefaultProps(): ConstraintLayoutShape['props'] {
		return {
			w: 360,
			h: 220,
			direction: 'horizontal',
			align: 'center',
			justify: 'start',
			gap: CONSTRAINT_LAYOUT_DEFAULT_GAP,
			padding: CONSTRAINT_LAYOUT_DEFAULT_PADDING,
		}
	}

	override canBind({ fromShape, toShape, bindingType }: TLShapeUtilCanBindOpts<ConstraintLayoutShape>) {
		return (
			bindingType === CONSTRAINT_LAYOUT_BINDING_TYPE &&
			fromShape.type === CONSTRAINT_LAYOUT_SHAPE_TYPE &&
			toShape.type !== CONSTRAINT_LAYOUT_SHAPE_TYPE
		)
	}

	override canResizeChildren() {
		return false
	}

	override getGeometry(shape: ConstraintLayoutShape) {
		return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true })
	}

	override component(shape: ConstraintLayoutShape) {
		return (
			<HTMLContainer
				style={{
					width: shape.props.w,
					height: shape.props.h,
					border: '2px dashed var(--tl-color-text-3, #64748b)',
					borderRadius: 12,
					background: 'color-mix(in srgb, var(--tl-color-panel, #fff) 72%, transparent)',
					boxSizing: 'border-box',
					pointerEvents: 'none',
				}}
			>
				<div style={{ padding: 8, font: '600 12px/16px Inter, sans-serif' }}>
					Constraint layout
				</div>
			</HTMLContainer>
		)
	}

	override getIndicatorPath(shape: ConstraintLayoutShape) {
		const path = new Path2D()
		path.roundRect(0, 0, shape.props.w, shape.props.h, 12)
		return path
	}

	override onResize(shape: ConstraintLayoutShape, info: TLResizeInfo<ConstraintLayoutShape>) {
		return resizeBox(shape, info, {
			minWidth: CONSTRAINT_LAYOUT_MIN_WIDTH,
			minHeight: CONSTRAINT_LAYOUT_MIN_HEIGHT,
		})
	}
}

export class ConstraintLayoutBindingUtil extends BindingUtil<ConstraintLayoutBinding> {
	static override type = CONSTRAINT_LAYOUT_BINDING_TYPE
	static override props: RecordProps<ConstraintLayoutBinding> = {
		index: T.indexKey,
		placeholder: T.boolean,
		version: T.number,
	}
	static override migrations = constraintLayoutBindingMigrations

	private dirtyContainerIds = new Set<TLShapeId>()
	private updatingDragCandidate = false

	override getDefaultProps(): ConstraintLayoutBinding['props'] {
		return {
			index: getIndexBetween(undefined, undefined),
			placeholder: false,
			version: CONSTRAINT_LAYOUT_BINDING_VERSION,
		}
	}

	override onBeforeCreate({ binding }: BindingOnCreateOptions<ConstraintLayoutBinding>) {
		const fromShape = this.editor.getShape(binding.fromId)
		const toShape = this.editor.getShape(binding.toId)
		if (!isConstraintLayoutShape(fromShape) || !toShape || !canUseConstraintEndpoint(this.editor, fromShape, toShape)) {
			throw new Error('Invalid constraint layout binding endpoints')
		}
		return {
			...binding,
			props: {
				...binding.props,
				version: CONSTRAINT_LAYOUT_BINDING_VERSION,
			},
		}
	}

	override onAfterCreate({ binding }: BindingOnCreateOptions<ConstraintLayoutBinding>) {
		this.dirtyContainerIds.add(binding.fromId)
	}

	override onAfterChange({ bindingBefore, bindingAfter }: BindingOnChangeOptions<ConstraintLayoutBinding>) {
		this.dirtyContainerIds.add(bindingBefore.fromId)
		this.dirtyContainerIds.add(bindingAfter.fromId)
	}

	override onAfterDelete({ binding }: BindingOnDeleteOptions<ConstraintLayoutBinding>) {
		this.dirtyContainerIds.add(binding.fromId)
	}

	override onAfterChangeFromShape({ binding }: BindingOnShapeChangeOptions<ConstraintLayoutBinding>) {
		if (!projectingEditors.has(this.editor)) this.dirtyContainerIds.add(binding.fromId)
	}

	override onAfterChangeToShape({ binding, shapeAfter, reason }: BindingOnShapeChangeOptions<ConstraintLayoutBinding>) {
		if (projectingEditors.has(this.editor)) return
		if (
			reason === 'self' &&
			this.editor.isIn('select.translating') &&
			this.editor.getSelectedShapeIds().includes(shapeAfter.id) &&
			!this.updatingDragCandidate
		) {
			this.updatingDragCandidate = true
			try {
				updateConstraintDragCandidate(this.editor, shapeAfter)
			} finally {
				this.updatingDragCandidate = false
			}
			return
		}
		this.dirtyContainerIds.add(binding.fromId)
	}

	override onOperationComplete() {
		if (projectingEditors.has(this.editor) || this.dirtyContainerIds.size === 0) return
		const ids = [...this.dirtyContainerIds]
		this.dirtyContainerIds.clear()
		for (const id of ids) projectConstraintLayout(this.editor, id)
	}
}

export function mountConstraintLayout(editor: Editor) {
	const dragMarks = new Map<TLShapeId, string>()
	const disposeShapeChange = editor.sideEffects.registerAfterChangeHandler(
		'shape',
		(_before, after, source) => {
			if (
				source !== 'user' ||
				projectingEditors.has(editor) ||
				!editor.isIn('select.translating') ||
				!editor.getSelectedShapeIds().includes(after.id) ||
				isConstraintLayoutShape(after) ||
				getConstraintBindingsForShape(editor, after.id).length > 0
			) {
				return
			}
			if (!dragMarks.has(after.id)) {
				dragMarks.set(after.id, editor.markHistoryStoppingPoint('constraint layout drag'))
			}
			updateConstraintDragCandidate(editor, after)
		}
	)

	const handleEvent = (event: TLEventInfo) => {
		if (
			(event.type === 'pointer' && event.name === 'pointer_up') ||
			(event.type === 'misc' && event.name === 'complete')
		) {
			for (const shape of editor.getSelectedShapes()) {
				if (isConstraintLayoutShape(shape)) continue
				finalizeConstraintShape(editor, shape)
				const mark = dragMarks.get(shape.id)
				if (mark) editor.squashToMark(mark)
				dragMarks.delete(shape.id)
			}
		}
		if (event.type === 'misc' && (event.name === 'cancel' || event.name === 'interrupt')) {
			dragMarks.clear()
			const placeholderBindings = editor.store
				.allRecords()
				.filter(
					(record): record is ConstraintLayoutBinding =>
						record.typeName === 'binding' &&
						record.type === CONSTRAINT_LAYOUT_BINDING_TYPE &&
						record.props.placeholder
				)
			if (placeholderBindings.length) {
				editor.run(
					() => {
						editor.updateBindings(
							placeholderBindings.map((binding) => ({
								id: binding.id,
								type: binding.type,
								props: { ...binding.props, placeholder: false },
							}))
						)
					},
					{ history: 'ignore' }
				)
			}
		}
	}
	editor.on('event', handleEvent)

	editor.run(
		() => {
			for (const binding of editor.store.allRecords().filter(
				(record): record is ConstraintLayoutBinding =>
					record.typeName === 'binding' && record.type === CONSTRAINT_LAYOUT_BINDING_TYPE
			)) {
				if (binding.props.placeholder) {
					editor.updateBinding<ConstraintLayoutBinding>({
						id: binding.id,
						type: binding.type,
						props: { ...binding.props, placeholder: false },
					})
				}
				projectConstraintLayout(editor, binding.fromId)
			}
		},
		{ history: 'ignore' }
	)

	return () => {
		dragMarks.clear()
		disposeShapeChange()
		editor.off('event', handleEvent)
	}
}

function findSelectedConstraintContainer(editor: Editor) {
	return editor.getSelectedShapes().find(isConstraintLayoutShape) ?? null
}

export const ConstraintLayoutControls = track(function ConstraintLayoutControls() {
	const editor = useEditor()
	const selected = useValue(
		'constraint layout controls selection',
		() => ({
			container: findSelectedConstraintContainer(editor),
			shapeIds: editor
				.getSelectedShapes()
				.filter((shape) => !isConstraintLayoutShape(shape))
				.map((shape) => shape.id),
		}),
		[editor]
	)
	const container = selected.container
	if (!container) return null

	const updateContainer = (
		props: Partial<Pick<ConstraintLayoutShapeProps, 'direction' | 'align' | 'justify' | 'gap' | 'padding'>>
	) => {
		if (!container) return
		editor.markHistoryStoppingPoint('Update constraint layout')
		updateConstraintLayoutProps(editor, container.id, props)
	}

	return (
		<TldrawUiToolbar
			className="canvas-layout-context-toolbar canvas-constraint-layout-toolbar"
			label="Constraint layout controls"
			orientation="horizontal"
			tooltipSide="top"
			onPointerDown={stopEventPropagation}
		>
			<TldrawUiToolbarButton
				type="tool"
				className="canvas-layout-action"
				title="Bind selected shapes"
				tooltip="Bind selected shapes"
				disabled={selected.shapeIds.length === 0}
				onClick={() => {
					editor.markHistoryStoppingPoint('Bind shapes to constraint layout')
					bindShapesToConstraintLayout(editor, container.id, selected.shapeIds)
				}}
			>
				<TldrawUiButtonIcon icon="group" />
			</TldrawUiToolbarButton>
			<TldrawUiToolbarButton
				type="tool"
				className="canvas-layout-action"
				title="Detach selected shapes"
				tooltip="Detach selected shapes"
				disabled={selected.shapeIds.length === 0}
				onClick={() => {
					editor.markHistoryStoppingPoint('Detach shapes from constraint layout')
					detachShapesFromConstraintLayout(editor, selected.shapeIds)
				}}
			>
				<TldrawUiButtonIcon icon="ungroup" />
			</TldrawUiToolbarButton>
			<TldrawUiToolbarButton
				type="tool"
				className="canvas-layout-action"
				title="Horizontal layout"
				tooltip="Horizontal layout"
				isActive={container.props.direction === 'horizontal'}
				aria-pressed={container.props.direction === 'horizontal'}
				onClick={() => updateContainer({ direction: 'horizontal' })}
			>
				<TldrawUiButtonIcon icon="stack-horizontal" />
			</TldrawUiToolbarButton>
			<TldrawUiToolbarButton
				type="tool"
				className="canvas-layout-action"
				title="Vertical layout"
				tooltip="Vertical layout"
				isActive={container.props.direction === 'vertical'}
				aria-pressed={container.props.direction === 'vertical'}
				onClick={() => updateContainer({ direction: 'vertical' })}
			>
				<TldrawUiButtonIcon icon="stack-vertical" />
			</TldrawUiToolbarButton>
			<select
				aria-label="Constraint alignment"
				title="Cross-axis alignment"
				value={container.props.align}
				onChange={(event) => updateContainer({ align: event.currentTarget.value as LayoutAlign })}
			>
				<option value="start">Align start</option>
				<option value="center">Align center</option>
				<option value="end">Align end</option>
			</select>
			<select
				aria-label="Constraint justification"
				title="Main-axis distribution"
				value={container.props.justify}
				onChange={(event) => updateContainer({ justify: event.currentTarget.value as LayoutJustify })}
			>
				<option value="start">Justify start</option>
				<option value="center">Justify center</option>
				<option value="end">Justify end</option>
				<option value="space-between">Space between</option>
			</select>
		</TldrawUiToolbar>
	)
})

export const CONSTRAINT_LAYOUT_SHAPE_UTILS = [ConstraintLayoutShapeUtil] as const
export const CONSTRAINT_LAYOUT_BINDING_UTILS = [ConstraintLayoutBindingUtil] as const
export const CONSTRAINT_LAYOUT_ON_MOUNT = mountConstraintLayout
