import type { ContextItem } from '../../shared/types/ContextItem'
import { describe, expect, it } from 'vitest'
import {
	buildWorkbenchAgentInput,
	isWorkbenchCanvasMutationRequest,
	WorkbenchAgentRequestError,
} from './workbenchAgentRequest'

const viewport = { x: 120, y: 80, w: 960, h: 640 }

describe('workbench agent request builder', () => {
	it('keeps selection requests bounded without opting into viewport context', () => {
		const contextItems = [
			{ type: 'point', point: { x: 1, y: 2 }, source: 'user' },
		] satisfies ContextItem[]

		const input = buildWorkbenchAgentInput({
			message: '  Explain the selected decision  ',
			domainPack: 'architecture',
			contextMode: 'selection',
			selectedShapeCount: 1,
			viewportBounds: viewport,
			contextItems,
		})

		expect(input).toEqual({
			agentMessages: ['Explain the selected decision'],
			userMessages: ['Explain the selected decision'],
			source: 'user',
			contextItems,
			routing: {
				enabled: true,
				route: 'auto',
				domainPack: 'architecture',
				maxHistoryItems: 6,
			},
		})
		expect(input).not.toHaveProperty('bounds')
		expect(input.routing).not.toHaveProperty('includeBounds')
	})

	it('fails closed for a mutation with no selection', () => {
		expect(() =>
			buildWorkbenchAgentInput({
				message: 'Create a system context diagram',
				domainPack: 'architecture',
				contextMode: 'selection',
				selectedShapeCount: 0,
				viewportBounds: viewport,
				contextItems: [],
			})
		).toThrowError(
			expect.objectContaining<Partial<WorkbenchAgentRequestError>>({
				code: 'selection-required',
			})
		)
	})

	it('allows a no-selection inquiry without broad canvas context', () => {
		const input = buildWorkbenchAgentInput({
			message: 'How should I create a decision graph?',
			domainPack: 'architecture',
			contextMode: 'selection',
			selectedShapeCount: 0,
			viewportBounds: viewport,
			contextItems: [],
		})

		expect(input.routing).toMatchObject({
			enabled: true,
			route: 'auto',
			domainPack: 'architecture',
		})
		expect(input).not.toHaveProperty('bounds')
	})

	it('includes one bounded viewport only after explicit visible-area choice', () => {
		const input = buildWorkbenchAgentInput({
			message: 'Create a wireframe screen set here',
			domainPack: 'uiux',
			contextMode: 'visible-area',
			selectedShapeCount: 0,
			viewportBounds: viewport,
			contextItems: [],
		})

		expect(input.bounds).toEqual(viewport)
		expect(input.bounds).not.toBe(viewport)
		expect(input.routing).toEqual({
			enabled: true,
			route: 'auto',
			domainPack: 'uiux',
			maxHistoryItems: 6,
			includeBounds: true,
		})
	})

	it('rejects a non-finite or empty visible area', () => {
		expect(() =>
			buildWorkbenchAgentInput({
				message: 'Draw a roadmap',
				domainPack: 'product',
				contextMode: 'visible-area',
				selectedShapeCount: 0,
				viewportBounds: { x: 0, y: 0, w: Number.NaN, h: 300 },
				contextItems: [],
			})
		).toThrowError(
			expect.objectContaining<Partial<WorkbenchAgentRequestError>>({
				code: 'invalid-visible-area',
			})
		)
	})

	it('caps current context items and never carries an unbounded history request', () => {
		const contextItems = Array.from({ length: 15 }, (_, index) => ({
			type: 'point' as const,
			point: { x: index, y: index },
			source: 'user' as const,
		}))

		const input = buildWorkbenchAgentInput({
			message: 'Review the selected artifacts',
			domainPack: 'ml',
			contextMode: 'selection',
			selectedShapeCount: 2,
			contextItems,
		})

		expect(input.contextItems).toHaveLength(12)
		expect(input.routing?.maxHistoryItems).toBeLessThanOrEqual(6)
	})

	it.each([
		['Create a roadmap', true],
		['Build a system diagram', true],
		['Generate a component map', true],
		['Построй диаграмму системы', true],
		['Нарисуй вайрфрейм', true],
		['How should I create a roadmap?', false],
		['Почему нужно изменить эту систему?', false],
		['Review the current decision', false],
	] as const)('classifies %s deterministically', (message, expected) => {
		expect(isWorkbenchCanvasMutationRequest(message)).toBe(expected)
	})
})
