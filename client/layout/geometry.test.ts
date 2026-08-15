import { describe, expect, it } from 'vitest'
import {
	getMainAxisPositions,
	insertionIndexFromPoint,
	minimumLayoutSize,
	planLayout,
} from './geometry'

describe('layout geometry', () => {
	it('computes deterministic horizontal and vertical minimum sizes', () => {
		expect(
			minimumLayoutSize(
				[
					{ w: 80, h: 40 },
					{ w: 120, h: 70 },
				],
				{ direction: 'horizontal', align: 'center', justify: 'start', gap: 10, padding: 20 },
				{ w: 120, h: 96 }
			)
		).toEqual({ w: 250, h: 110 })
		expect(
			minimumLayoutSize(
				[
					{ w: 80, h: 40 },
					{ w: 120, h: 70 },
				],
				{ direction: 'vertical', align: 'end', justify: 'start', gap: 10, padding: 20 },
				{ w: 120, h: 96 }
			)
		).toEqual({ w: 160, h: 160 })
	})

	it('handles empty, one-item, and mixed-size layouts', () => {
		expect(
			planLayout(
				[],
				{ w: 1, h: 1 },
				{ direction: 'horizontal', align: 'center', justify: 'space-between', gap: 16, padding: 24 },
				{ w: 120, h: 96 }
			)
		).toEqual({ size: { w: 120, h: 96 }, positions: [] })

		const one = planLayout(
			[{ w: 40, h: 20 }],
			{ w: 200, h: 100 },
			{ direction: 'horizontal', align: 'center', justify: 'space-between', gap: 16, padding: 10 },
			{ w: 120, h: 96 }
		)
		expect(one.positions).toEqual([{ x: 10, y: 40 }])

		const mixed = planLayout(
			[
				{ w: 40, h: 20 },
				{ w: 80, h: 60 },
			],
			{ w: 220, h: 120 },
			{ direction: 'horizontal', align: 'end', justify: 'space-between', gap: 10, padding: 10 },
			{ w: 120, h: 96 }
		)
		expect(mixed.positions).toEqual([
			{ x: 10, y: 90 },
			{ x: 130, y: 50 },
		])
	})

	it('places before, between, and after using item midpoints', () => {
		const boxes = [
			{ x: 10, y: 10, w: 40, h: 20 },
			{ x: 70, y: 10, w: 80, h: 20 },
		]
		expect(insertionIndexFromPoint({ x: 20, y: 0 }, boxes, 'horizontal')).toBe(0)
		expect(insertionIndexFromPoint({ x: 60, y: 0 }, boxes, 'horizontal')).toBe(1)
		expect(insertionIndexFromPoint({ x: 200, y: 0 }, boxes, 'horizontal')).toBe(2)
	})

	it('keeps space-between stable for a single item and never emits negative free space', () => {
		expect(getMainAxisPositions([20], 100, 'space-between', 16)).toEqual([0])
		expect(getMainAxisPositions([80, 80], 100, 'center', 16)).toEqual([0, 96])
	})
})
