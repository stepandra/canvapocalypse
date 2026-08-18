import { Editor, TLAsset, TLShape, TLShapeId } from 'tldraw'
import { describe, expect, it } from 'vitest'
import { insertWorkbenchEmoji, WORKBENCH_EMOJIS } from './workbenchEmoji'

describe('workbench emoji palette contract', () => {
	it('is a bounded three-by-three set with one custom angry poop', () => {
		expect(WORKBENCH_EMOJIS).toHaveLength(9)
		expect(new Set(WORKBENCH_EMOJIS.map((emoji) => emoji.id)).size).toBe(9)
		const angryPoop = WORKBENCH_EMOJIS.find((emoji) => emoji.id === 'angry-poop')
		expect(angryPoop?.glyph).toBeUndefined()
		expect(angryPoop?.customImageSrc).toMatch(/angry-poop-manga\.png/)
		expect(WORKBENCH_EMOJIS.find((emoji) => emoji.id === 'direction')).toMatchObject({
			label: 'Question',
			glyph: '❓',
		})
		expect(WORKBENCH_EMOJIS.some((emoji) => emoji.glyph === '🧭')).toBe(false)
	})

	it('inserts a normal emoji as one selected native text shape in one undo step', () => {
		const shapes = new Map<TLShapeId, Partial<TLShape>>()
		let historyLabel = ''
		let selected: TLShapeId[] = []
		let runCount = 0
		const editor = {
			getViewportPageBounds: () => ({ center: { x: 600, y: 400 } }),
			markHistoryStoppingPoint: (label: string) => {
				historyLabel = label
			},
			run: (operation: () => void) => {
				runCount += 1
				operation()
			},
			createShape: (shape: Partial<TLShape> & { id: TLShapeId }) => {
				shapes.set(shape.id, shape)
			},
			createAssets: () => {
				throw new Error('text emoji must not create an asset')
			},
			setSelectedShapes: (ids: TLShapeId[]) => {
				selected = ids
			},
		} as unknown as Editor

		const receipt = insertWorkbenchEmoji(editor, 'idea', { instanceId: 'idea-test' })
		const shape = shapes.get(receipt.shapeId)

		expect(runCount).toBe(1)
		expect(historyLabel).toBe('Insert Idea')
		expect(shape?.type).toBe('text')
		expect(shape?.x).toBe(552)
		expect(shape?.y).toBe(364)
		expect(selected).toEqual([receipt.shapeId])
		expect(receipt).toMatchObject({ emojiId: 'idea', undoable: true })
		expect(receipt.assetId).toBeUndefined()
	})

	it('inserts the angry poop as a generated raster-backed native image shape', () => {
		const shapes = new Map<TLShapeId, Partial<TLShape>>()
		const assets: TLAsset[] = []
		const calls: string[] = []
		const editor = {
			getViewportPageBounds: () => ({ center: { x: 600, y: 400 } }),
			markHistoryStoppingPoint: () => {
				calls.push('mark')
			},
			run: (operation: () => void) => {
				calls.push('run')
				operation()
			},
			createShape: (shape: Partial<TLShape> & { id: TLShapeId }) => {
				calls.push('shape')
				shapes.set(shape.id, shape)
			},
			createAssets: (created: TLAsset[]) => {
				calls.push('asset')
				assets.push(...created)
			},
			setSelectedShapes: () => {},
		} as unknown as Editor

		const receipt = insertWorkbenchEmoji(editor, 'angry-poop', {
			instanceId: 'poop-test',
		})
		const shape = shapes.get(receipt.shapeId)

		expect(receipt.assetId).toBeDefined()
		expect(assets).toHaveLength(1)
		expect(calls).toEqual(['asset', 'mark', 'run', 'shape'])
		expect(assets[0]?.type).toBe('image')
		expect(assets[0]?.props.src).toMatch(/angry-poop-manga\.png/)
		if (assets[0]?.type !== 'image') throw new Error('Expected an image asset')
		expect(assets[0].props.mimeType).toBe('image/png')
		expect(shape?.type).toBe('image')
		expect(shape?.x).toBe(552)
		expect(shape?.y).toBe(352)
		expect(shape?.props).toMatchObject({
			assetId: receipt.assetId,
			w: 96,
			h: 96,
		})
	})
})
