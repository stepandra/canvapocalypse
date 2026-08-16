import type { Editor, TLShape, TLShapeId, VecLike } from 'tldraw'
import type { TLCommentAnchor } from './records'

type CommentRegionAnchor = Extract<TLCommentAnchor, { type: 'region' }>
type CommentShapeAnchor = Extract<TLCommentAnchor, { type: 'shape' }>

function clampNormalized(value: number) {
	return Math.max(0, Math.min(1, value))
}

/** Returns null when either region dimension is zero. */
export function normalizeCommentRegion(anchor: CommentRegionAnchor): CommentRegionAnchor | null {
	if (anchor.w === 0 || anchor.h === 0) return null

	const normalized = { ...anchor }
	if (normalized.w < 0) {
		normalized.x += normalized.w
		normalized.w = -normalized.w
		normalized.pinX = 1 - (normalized.pinX ?? 1)
	}
	if (normalized.h < 0) {
		normalized.y += normalized.h
		normalized.h = -normalized.h
		normalized.pinY = 1 - (normalized.pinY ?? 1)
	}
	return normalized
}

export function commentRegionBetween(
	origin: VecLike,
	current: VecLike
): CommentRegionAnchor | null {
	return normalizeCommentRegion({
		type: 'region',
		x: origin.x,
		y: origin.y,
		w: current.x - origin.x,
		h: current.y - origin.y,
		pinX: 1,
		pinY: 1,
	})
}

export function createShapeCommentAnchor(
	editor: Editor,
	shapeId: TLShapeId,
	pagePoint: VecLike,
	isPrecise: boolean
): CommentShapeAnchor | null {
	const shape = editor.getShape(shapeId)
	if (!shape) return null

	const bounds = editor.getShapeGeometry(shape).bounds
	if (bounds.w <= 0 || bounds.h <= 0) return null

	const localPoint = editor.getPointInShapeSpace(shape, pagePoint)
	return {
		type: 'shape',
		shapeId,
		x: clampNormalized((localPoint.x - bounds.x) / bounds.w),
		y: clampNormalized((localPoint.y - bounds.y) / bounds.h),
		isPrecise,
	}
}

export function resolveCommentAnchorPagePoint(
	editor: Editor,
	anchor: TLCommentAnchor
): VecLike | null {
	switch (anchor.type) {
		case 'point':
			return { x: anchor.x, y: anchor.y }
		case 'region': {
			const region = normalizeCommentRegion(anchor)
			if (!region) return null
			return {
				x: region.x + region.w * (region.pinX ?? 1),
				y: region.y + region.h * (region.pinY ?? 1),
			}
		}
		case 'shape': {
			const shape = editor.getShape(anchor.shapeId)
			if (!shape) return null

			const bounds = editor.getShapeGeometry(shape).bounds
			if (bounds.w <= 0 || bounds.h <= 0) return null

			const x = anchor.isPrecise ? anchor.x : 1
			const y = anchor.isPrecise ? anchor.y : 0
			return editor.getShapePageTransform(shape).applyToPoint({
				x: bounds.x + bounds.w * x,
				y: bounds.y + bounds.h * y,
			})
		}
		case 'page':
			return null
	}
}

export function getCommentTargetShapeAt(editor: Editor, pagePoint: VecLike): TLShape | undefined {
	return editor.getShapeAtPoint(pagePoint, {
		hitInside: true,
		hitFrameInside: true,
		margin: editor.options.hitTestMargin / editor.getZoomLevel(),
	})
}
