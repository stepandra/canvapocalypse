import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
	EXPERIMENT_CARD_COLLAPSED_HEIGHT,
	EXPERIMENT_CARD_EXPANDED_HEIGHT,
	computeExperimentDeckOrigin,
	computeExperimentCardGrid,
} from './experimentCanvas'

const shapeSource = readFileSync(
	new URL('./ExperimentCardShape.tsx', import.meta.url),
	'utf8'
)
const canvasSource = readFileSync(
	new URL('./experimentCanvas.ts', import.meta.url),
	'utf8'
)

describe('C1-style experiment card', () => {
	it('persists collapse state and changes the physical canvas height', () => {
		expect(shapeSource).toContain('collapsed: T.boolean')
		expect(shapeSource).toContain('Toggle experiment card')
		expect(shapeSource).toContain('EXPERIMENT_CARD_COLLAPSED_HEIGHT')
		expect(shapeSource).toContain('EXPERIMENT_CARD_EXPANDED_HEIGHT')
		expect(shapeSource).toContain('editor.updateShape')
	})

	it('renders an inline schematic and never a remote nature image', () => {
		expect(shapeSource).toContain('<svg')
		expect(shapeSource).toContain('experiment-card-schematic')
		expect(shapeSource).not.toContain('<img')
		expect(shapeSource).not.toMatch(/Unsplash|source\.unsplash|images\.unsplash/i)
	})
})

describe('experiment card grid', () => {
	it('creates cards at page root so frames cannot absorb the deck', () => {
		expect(canvasSource).toContain('parentId: editor.getCurrentPageId()')
	})

	it('places a new deck below existing page content instead of covering it', () => {
		const origin = computeExperimentDeckOrigin(
			{ center: { x: 600, y: 400 } },
			{ x: -200, maxY: 900 }
		)
		expect(origin.x).toBe(-200)
		expect(origin.y).toBeGreaterThan(900)
	})

	it('lays cards out deterministically in three columns', () => {
		const positions = computeExperimentCardGrid(7, { x: 100, y: 200 })
		expect(positions).toHaveLength(7)
		expect(positions.slice(0, 3).map(({ y }) => y)).toEqual([200, 200, 200])
		expect(positions[3].x).toBe(100)
		expect(positions[3].y).toBeGreaterThan(200)
		expect(new Set(positions.map(({ x }) => x))).toHaveLength(3)
	})

	it('uses bounded expanded and collapsed heights', () => {
		expect(EXPERIMENT_CARD_COLLAPSED_HEIGHT).toBeLessThan(100)
		expect(EXPERIMENT_CARD_EXPANDED_HEIGHT).toBeGreaterThan(400)
	})
})
