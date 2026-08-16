import {
	BaseBoxShapeUtil,
	Editor,
	Rectangle2d,
	T,
	TLBaseShape,
	TLShapeId,
	createShapeId,
	createTLStore,
	defaultBindingUtils,
	defaultShapeTools,
	defaultShapeUtils,
	defaultTools,
} from 'tldraw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
	commentRegionBetween,
	createShapeCommentAnchor,
	getCommentTargetShapeAt,
	normalizeCommentRegion,
	resolveCommentAnchorPagePoint,
} from './anchors'
import type { TLCommentAnchor } from './records'

declare module '@tldraw/tlschema' {
	interface TLGlobalShapePropsMap {
		'comment-geometry-test': { w: number; h: number; offsetX: number; offsetY: number }
	}
}

type CommentGeometryTestShape = TLBaseShape<
	'comment-geometry-test',
	{ w: number; h: number; offsetX: number; offsetY: number }
>

class CommentGeometryTestShapeUtil extends BaseBoxShapeUtil<CommentGeometryTestShape> {
	static override type = 'comment-geometry-test' as const
	static override props = {
		w: T.number,
		h: T.number,
		offsetX: T.number,
		offsetY: T.number,
	}

	override getDefaultProps(): CommentGeometryTestShape['props'] {
		return { w: 0, h: 0, offsetX: 0, offsetY: 0 }
	}

	override getGeometry(shape: CommentGeometryTestShape) {
		return new Rectangle2d({
			x: shape.props.offsetX,
			y: shape.props.offsetY,
			width: shape.props.w,
			height: shape.props.h,
			isFilled: true,
		})
	}

	override component() {
		return null
	}

	override getIndicatorPath() {
		return undefined
	}
}

function installMinimalEditorDom() {
	class FakeElement {
		constructor(public ownerDocument: typeof document) {}

		tabIndex = 0
		classList = { add() {}, remove() {} }
		style = {
			setProperty() {},
			removeProperty() {},
			getPropertyValue() {
				return ''
			},
		}

		addEventListener() {}
		removeEventListener() {}
		setAttribute() {}
		removeAttribute() {}
		appendChild() {
			return this
		}
		removeChild() {
			return this
		}
		remove() {}
		focus() {}
		blur() {}
		contains() {
			return true
		}
		getBoundingClientRect() {
			return {
				x: 0,
				y: 0,
				top: 0,
				left: 0,
				width: 1080,
				height: 720,
				bottom: 720,
				right: 1080,
				toJSON: () => ({}),
			}
		}
	}

	const fakeDocument = {
		activeElement: null,
		body: null as unknown as FakeElement,
		documentElement: null as unknown as FakeElement,
		createElement: () => new FakeElement(fakeDocument as unknown as typeof document),
	}
	const body = new FakeElement(fakeDocument as unknown as typeof document)
	fakeDocument.body = body
	fakeDocument.documentElement = body
	vi.stubGlobal('document', fakeDocument)
	const requestAnimationFrame = () => 1
	const cancelAnimationFrame = () => undefined
	vi.stubGlobal('window', {
		devicePixelRatio: 1,
		addEventListener() {},
		removeEventListener() {},
		requestAnimationFrame,
		cancelAnimationFrame,
	})
	vi.stubGlobal('navigator', { userAgent: 'vitest' })
	vi.stubGlobal('requestAnimationFrame', requestAnimationFrame)
	vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrame)
}

class TestEditor extends Editor {
	constructor() {
		const shapeUtils = [...defaultShapeUtils, CommentGeometryTestShapeUtil]
		const bindingUtils = [...defaultBindingUtils]
		super({
			shapeUtils,
			bindingUtils,
			tools: [...defaultTools, ...defaultShapeTools],
			store: createTLStore({ shapeUtils, bindingUtils }),
			getContainer: () => document.createElement('div'),
			initialState: 'select',
		})
	}
}

function expectPoint(
	actual: { x: number; y: number } | null,
	expected: { x: number; y: number },
	tolerance = 0.000001
) {
	expect(actual).not.toBeNull()
	expect(actual!.x).toBeCloseTo(expected.x, Math.max(0, -Math.log10(tolerance)))
	expect(actual!.y).toBeCloseTo(expected.y, Math.max(0, -Math.log10(tolerance)))
}

function precisePagePoint(editor: Editor, shapeId: TLShapeId, x: number, y: number) {
	const shape = editor.getShape(shapeId)!
	const bounds = editor.getShapeGeometry(shape).bounds
	return editor.getShapePageTransform(shape).applyToPoint({
		x: bounds.x + bounds.w * x,
		y: bounds.y + bounds.h * y,
	})
}

describe('comment anchors', () => {
	let editor: TestEditor

	beforeEach(() => {
		installMinimalEditorDom()
		editor = new TestEditor()
	})

	afterEach(() => {
		editor.dispose()
		vi.unstubAllGlobals()
	})

	it('resolves point anchors and rejects page anchors', () => {
		const point: TLCommentAnchor = { type: 'point', x: -15, y: 42 }
		expect(resolveCommentAnchorPagePoint(editor, point)).toEqual({ x: -15, y: 42 })
		expect(resolveCommentAnchorPagePoint(editor, { type: 'page' })).toBeNull()
	})

	it.each([
		['bottom-right', { x: 10, y: 20 }, { x: 40, y: 60 }, 10, 20, 30, 40, 1, 1],
		['bottom-left', { x: 40, y: 20 }, { x: 10, y: 60 }, 10, 20, 30, 40, 0, 1],
		['top-right', { x: 10, y: 60 }, { x: 40, y: 20 }, 10, 20, 30, 40, 1, 0],
		['top-left', { x: 40, y: 60 }, { x: 10, y: 20 }, 10, 20, 30, 40, 0, 0],
	] as const)(
		'constructs a positive %s drag region whose pin matches the release corner',
		(_name, origin, current, x, y, w, h, pinX, pinY) => {
			const region = commentRegionBetween(origin, current)
			expect(region).toEqual({ type: 'region', x, y, w, h, pinX, pinY })
			expectPoint(resolveCommentAnchorPagePoint(editor, region!), current)
		}
	)

	it('normalizes flipped regions, flips supplied pins, and defaults the pin to bottom-right', () => {
		expect(
			normalizeCommentRegion({
				type: 'region',
				x: 50,
				y: 70,
				w: -30,
				h: -40,
				pinX: 0.25,
				pinY: 0.75,
			})
		).toEqual({ type: 'region', x: 20, y: 30, w: 30, h: 40, pinX: 0.75, pinY: 0.25 })

		const defaultPin: TLCommentAnchor = { type: 'region', x: 1, y: 2, w: 3, h: 4 }
		expect(resolveCommentAnchorPagePoint(editor, defaultPin)).toEqual({ x: 4, y: 6 })
	})

	it('returns null for zero-width or zero-height regions', () => {
		expect(normalizeCommentRegion({ type: 'region', x: 0, y: 0, w: 0, h: 10 })).toBeNull()
		expect(normalizeCommentRegion({ type: 'region', x: 0, y: 0, w: 10, h: 0 })).toBeNull()
		expect(commentRegionBetween({ x: 0, y: 0 }, { x: 0, y: 10 })).toBeNull()
		expect(commentRegionBetween({ x: 0, y: 0 }, { x: 10, y: 0 })).toBeNull()
		expect(commentRegionBetween({ x: 0, y: 0 }, { x: 0, y: 0 })).toBeNull()
	})

	it('uses offset geometry bounds and clamps shape-local coordinates', () => {
		const shapeId = createShapeId('offset-bounds')
		editor.createShape({
			id: shapeId,
			type: 'comment-geometry-test',
			x: 100,
			y: 200,
			props: { w: 120, h: 80, offsetX: 20, offsetY: 30 },
		})

		const precise = createShapeCommentAnchor(editor, shapeId, { x: 150, y: 250 }, true)
		expect(precise?.x).toBeCloseTo(0.25)
		expect(precise?.y).toBeCloseTo(0.25)
		expectPoint(resolveCommentAnchorPagePoint(editor, precise!), { x: 150, y: 250 })

		expect(createShapeCommentAnchor(editor, shapeId, { x: 50, y: 400 }, true)).toEqual({
			type: 'shape',
			shapeId,
			x: 0,
			y: 1,
			isPrecise: true,
		})

		const imprecise = { ...precise!, isPrecise: false }
		expectPoint(resolveCommentAnchorPagePoint(editor, imprecise), { x: 240, y: 230 })
	})

	it('keeps a precise anchor object stable while live projection follows move, resize, and rotation', () => {
		const shapeId = createShapeId('precise')
		editor.createShape({
			id: shapeId,
			type: 'geo',
			x: 100,
			y: 200,
			props: { w: 120, h: 80, fill: 'solid' },
		})
		const local = { x: 0.25, y: 0.75 }
		const anchor = createShapeCommentAnchor(
			editor,
			shapeId,
			precisePagePoint(editor, shapeId, local.x, local.y),
			true
		)!
		const storedAnchor = { ...anchor }

		expectPoint(resolveCommentAnchorPagePoint(editor, anchor), precisePagePoint(editor, shapeId, 0.25, 0.75))

		editor.updateShape({ id: shapeId, type: 'geo', x: 250, y: 75 })
		expectPoint(resolveCommentAnchorPagePoint(editor, anchor), precisePagePoint(editor, shapeId, 0.25, 0.75))

		editor.resizeShape(shapeId, { x: 1.5, y: 0.5 })
		expectPoint(resolveCommentAnchorPagePoint(editor, anchor), precisePagePoint(editor, shapeId, 0.25, 0.75))

		editor.rotateShapesBy([shapeId], Math.PI / 2)
		expectPoint(resolveCommentAnchorPagePoint(editor, anchor), precisePagePoint(editor, shapeId, 0.25, 0.75))
		expect(anchor).toEqual(storedAnchor)
	})

	it('renders imprecise shape anchors at local top-right without changing stored x/y', () => {
		const shapeId = createShapeId('imprecise')
		editor.createShape({
			id: shapeId,
			type: 'geo',
			x: 40,
			y: 60,
			rotation: Math.PI / 6,
			props: { w: 200, h: 100, fill: 'solid' },
		})
		const anchor = createShapeCommentAnchor(
			editor,
			shapeId,
			precisePagePoint(editor, shapeId, 0.3, 0.8),
			false
		)!
		const storedAnchor = { ...anchor }

		expect(anchor.isPrecise).toBe(false)
		expect(anchor.x).toBeCloseTo(0.3)
		expect(anchor.y).toBeCloseTo(0.8)
		expectPoint(resolveCommentAnchorPagePoint(editor, anchor), precisePagePoint(editor, shapeId, 1, 0))

		editor.updateShape({ id: shapeId, type: 'geo', x: 180, y: 120 })
		editor.resizeShape(shapeId, { x: 0.5, y: 1.5 })
		editor.rotateShapesBy([shapeId], Math.PI / 3)
		expectPoint(resolveCommentAnchorPagePoint(editor, anchor), precisePagePoint(editor, shapeId, 1, 0))
		expect(anchor).toEqual(storedAnchor)
	})

	it('returns null for missing and degenerate shape targets', () => {
		const missingId = createShapeId('missing')
		const missingAnchor: TLCommentAnchor = {
			type: 'shape',
			shapeId: missingId,
			x: 0.5,
			y: 0.5,
			isPrecise: true,
		}
		expect(createShapeCommentAnchor(editor, missingId, { x: 0, y: 0 }, true)).toBeNull()
		expect(resolveCommentAnchorPagePoint(editor, missingAnchor)).toBeNull()

		const degenerateId = createShapeId('degenerate')
		editor.createShape({ id: degenerateId, type: 'comment-geometry-test' })
		expect(createShapeCommentAnchor(editor, degenerateId, { x: 0, y: 0 }, true)).toBeNull()
		expect(
			resolveCommentAnchorPagePoint(editor, {
				type: 'shape',
				shapeId: degenerateId,
				x: 0.5,
				y: 0.5,
				isPrecise: true,
			})
		).toBeNull()
	})

	it('hit-tests shape interiors, frame interiors, and the editor margin at the current zoom', () => {
		const geoId = createShapeId('target-geo')
		const frameId = createShapeId('target-frame')
		editor.createShapes([
			{
				id: geoId,
				type: 'geo',
				x: 100,
				y: 100,
				props: { w: 100, h: 100, fill: 'solid' },
			},
			{ id: frameId, type: 'frame', x: 300, y: 100, props: { w: 150, h: 120 } },
		])

		expect(getCommentTargetShapeAt(editor, { x: 150, y: 150 })?.id).toBe(geoId)
		expect(getCommentTargetShapeAt(editor, { x: 350, y: 150 })?.id).toBe(frameId)

		editor.setCamera({ x: 0, y: 0, z: 2 })
		expect(getCommentTargetShapeAt(editor, { x: 203, y: 150 })?.id).toBe(geoId)
		expect(getCommentTargetShapeAt(editor, { x: 205, y: 150 })).toBeUndefined()
	})
})
