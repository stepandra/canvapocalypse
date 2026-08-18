import { describe, expect, it } from 'vitest'
import { createCanvapocalypseCanvasKitComposition } from '../canvas-studio/host'
import {
	CONSTRAINT_LAYOUT_BINDING_TYPE,
	CONSTRAINT_LAYOUT_SHAPE_TYPE,
	FLEX_LAYOUT_SHAPE_TYPE,
} from './index'
import { readFileSync } from 'node:fs'
import { CANVAS_LAYOUT_KIT_CONTRIBUTION } from './contribution'

describe('Canvas layout kit contribution', () => {
	it('registers both layout models in the default Canvas Studio host', () => {
		const composition = createCanvapocalypseCanvasKitComposition()
		const contribution = composition.getContribution('canvas.layout')

		expect(contribution).toBe(CANVAS_LAYOUT_KIT_CONTRIBUTION)
		expect(composition.shapeUtils.map((shapeUtil) => shapeUtil.type)).toEqual(
			expect.arrayContaining([FLEX_LAYOUT_SHAPE_TYPE, CONSTRAINT_LAYOUT_SHAPE_TYPE])
		)
		expect(composition.bindingUtils.map((bindingUtil) => bindingUtil.type)).toContain(
			CONSTRAINT_LAYOUT_BINDING_TYPE
		)
	})

	it('uses the native frame icon for the layout launcher', () => {
		const source = readFileSync(new URL('./components.tsx', import.meta.url), 'utf8')
		expect(source).toContain('className="canvas-layout-launcher"')
		expect(source).toContain('aria-label="Frame and layout tools"')
		expect(source).toMatch(/aria-label="Frame and layout tools"[\s\S]*?icon="tool-frame"/)
	})
})
