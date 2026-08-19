import { describe, expect, it } from 'vitest'
import {
	buildProductCreativeIdeationPrompt,
	PRODUCT_CREATIVE_IDEATION_METHODS,
} from './productCreativeIdeation'

describe('product creative ideation', () => {
	it('uses explicit selection context and defers every canvas mutation', () => {
		const prompt = buildProductCreativeIdeationPrompt({ selectedShapeCount: 3 })

		expect(prompt).toContain('3 explicitly selected canvas shapes')
		for (const method of PRODUCT_CREATIVE_IDEATION_METHODS) {
			expect(prompt).toContain(method)
		}
		expect(prompt).toContain('exactly five genuinely distinct directions')
		expect(prompt).toContain('Do not insert a template automatically')
		expect(prompt).toContain('user must choose or refine a direction first')
	})

	it('falls back only to the bounded visible area', () => {
		const prompt = buildProductCreativeIdeationPrompt({ selectedShapeCount: 0 })

		expect(prompt).toContain('bounded visible canvas area')
		expect(prompt).toContain('do not inspect or infer anything outside it')
		expect(prompt).not.toContain('whole canvas')
	})
})
