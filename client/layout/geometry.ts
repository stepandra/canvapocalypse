import { clamp } from 'tldraw'

export type LayoutDirection = 'horizontal' | 'vertical'
export type LayoutAlign = 'start' | 'center' | 'end'
export type LayoutJustify = 'start' | 'center' | 'end' | 'space-between'

export interface LayoutSize {
	w: number
	h: number
}

export interface LayoutPoint {
	x: number
	y: number
}

export interface LayoutBox extends LayoutPoint, LayoutSize {}

export interface LayoutSpec {
	direction: LayoutDirection
	align: LayoutAlign
	justify: LayoutJustify
	gap: number
	padding: number
}

export interface LayoutPlan {
	size: LayoutSize
	positions: LayoutPoint[]
}

export const LAYOUT_EPSILON = 0.25

export function nearlyEqual(a: number, b: number, tolerance = LAYOUT_EPSILON) {
	return Math.abs(a - b) <= tolerance
}

export function pointNearlyEqual(
	a: LayoutPoint,
	b: LayoutPoint,
	tolerance = LAYOUT_EPSILON
) {
	return nearlyEqual(a.x, b.x, tolerance) && nearlyEqual(a.y, b.y, tolerance)
}

export function sizeNearlyEqual(
	a: LayoutSize,
	b: LayoutSize,
	tolerance = LAYOUT_EPSILON
) {
	return nearlyEqual(a.w, b.w, tolerance) && nearlyEqual(a.h, b.h, tolerance)
}

export function normalizeLayoutSpec(spec: LayoutSpec): LayoutSpec {
	return {
		...spec,
		gap: Math.max(0, spec.gap),
		padding: Math.max(0, spec.padding),
	}
}

export function minimumLayoutSize(
	sizes: readonly LayoutSize[],
	spec: LayoutSpec,
	emptySize: LayoutSize
): LayoutSize {
	const { direction, gap, padding } = normalizeLayoutSpec(spec)
	if (sizes.length === 0) {
		return {
			w: Math.max(emptySize.w, padding * 2),
			h: Math.max(emptySize.h, padding * 2),
		}
	}

	const totalGap = gap * Math.max(0, sizes.length - 1)
	if (direction === 'horizontal') {
		return {
			w: sizes.reduce((sum, size) => sum + size.w, 0) + totalGap + padding * 2,
			h: Math.max(...sizes.map((size) => size.h)) + padding * 2,
		}
	}

	return {
		w: Math.max(...sizes.map((size) => size.w)) + padding * 2,
		h: sizes.reduce((sum, size) => sum + size.h, 0) + totalGap + padding * 2,
	}
}

export function getMainAxisPositions(
	sizes: readonly number[],
	innerSize: number,
	justify: LayoutJustify,
	gap: number
) {
	if (sizes.length === 0) return []

	const contentSize =
		sizes.reduce((sum, size) => sum + size, 0) + gap * Math.max(0, sizes.length - 1)
	const freeSpace = Math.max(0, innerSize - contentSize)
	let cursor = 0
	let spacing = gap

	if (justify === 'end') cursor = freeSpace
	if (justify === 'center') cursor = freeSpace / 2
	if (justify === 'space-between' && sizes.length > 1) {
		spacing = gap + freeSpace / (sizes.length - 1)
	}

	return sizes.map((size, index) => {
		const position = cursor
		cursor += size + (index < sizes.length - 1 ? spacing : 0)
		return position
	})
}

export function getCrossAxisOffset(
	childSize: number,
	innerSize: number,
	align: LayoutAlign
) {
	const freeSpace = Math.max(0, innerSize - childSize)
	if (align === 'end') return freeSpace
	if (align === 'center') return freeSpace / 2
	return 0
}

export function planLayout(
	sizes: readonly LayoutSize[],
	requestedSize: LayoutSize,
	spec: LayoutSpec,
	emptySize: LayoutSize
): LayoutPlan {
	const normalized = normalizeLayoutSpec(spec)
	const minimum = minimumLayoutSize(sizes, normalized, emptySize)
	const size = {
		w: Math.max(requestedSize.w, minimum.w),
		h: Math.max(requestedSize.h, minimum.h),
	}
	const innerW = Math.max(0, size.w - normalized.padding * 2)
	const innerH = Math.max(0, size.h - normalized.padding * 2)

	if (normalized.direction === 'horizontal') {
		const main = getMainAxisPositions(
			sizes.map((child) => child.w),
			innerW,
			normalized.justify,
			normalized.gap
		)
		return {
			size,
			positions: sizes.map((child, index) => ({
				x: normalized.padding + main[index],
				y:
					normalized.padding +
					getCrossAxisOffset(child.h, innerH, normalized.align),
			})),
		}
	}

	const main = getMainAxisPositions(
		sizes.map((child) => child.h),
		innerH,
		normalized.justify,
		normalized.gap
	)
	return {
		size,
		positions: sizes.map((child, index) => ({
			x:
				normalized.padding +
				getCrossAxisOffset(child.w, innerW, normalized.align),
			y: normalized.padding + main[index],
		})),
	}
}

export function insertionIndexFromPoint(
	point: LayoutPoint,
	boxes: readonly LayoutBox[],
	direction: LayoutDirection
) {
	const coordinate = direction === 'horizontal' ? point.x : point.y
	for (let index = 0; index < boxes.length; index += 1) {
		const box = boxes[index]
		const start = direction === 'horizontal' ? box.x : box.y
		const size = direction === 'horizontal' ? box.w : box.h
		if (coordinate < start + size / 2) return index
	}
	return boxes.length
}

export function clampInsertionIndex(index: number, itemCount: number) {
	return clamp(Math.round(index), 0, itemCount)
}
