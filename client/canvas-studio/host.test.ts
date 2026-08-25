import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
	CANVAPOCALYPSE_CANVAS_KIT_COMPOSITION,
	createCanvapocalypseCanvasKitComposition,
	createCanvapocalypseOfflineCanvasKitComposition,
} from './host'
import type { CanvasKitContribution } from './types'

const hostSource = readFileSync(new URL('./host.ts', import.meta.url), 'utf8')

function externalContribution(kitId: string): CanvasKitContribution {
	return {
		kitId,
		runtimeContract: {
			schema: 'canvas.kit-runtime/v1',
			owner: kitId,
			tldrawVersion: '5.2.5',
			toolPaths: [],
			migrationIds: [],
			schemaIds: [`${kitId}/v1`],
			lifecycleIds: [],
			bridgeIds: [],
		},
		presetIds: [],
		shapeUtils: [],
		bindingUtils: [],
		tools: [],
		insertPreset: () => {
			throw new Error('Fixture has no presets')
		},
	}
}

describe('Canvas Studio host owner boundaries', () => {
	it('does not import or select a stale external default', () => {
		expect(hostSource).not.toMatch(
			/vendor|CANVAPOCALYPSE_EXTERNAL|from ['"].*externalContributions/
		)
		expect(
			CANVAPOCALYPSE_CANVAS_KIT_COMPOSITION.contributions.map(
				(contribution) => contribution.kitId
			)
		).toEqual([
			'workbench.architecture',
			'workbench.ml',
			'workbench.uiux',
			'workbench.product',
			'canvas.comments',
			'canvas.layout',
			'canvas.markdown',
		])
		expect(CANVAPOCALYPSE_CANVAS_KIT_COMPOSITION.shapeUtils).not.toEqual(
			expect.arrayContaining([expect.objectContaining({ type: 'agents-models-node' })])
		)
	})

	it('composes only explicitly caller-supplied canonical externals', () => {
		const external = externalContribution('owner.canonical')
		const composition = createCanvapocalypseCanvasKitComposition([external])
		expect(composition.contributions.at(-1)).toBe(external)
		expect(composition.getContribution('owner.canonical')).toBe(external)
	})

	it('retains comment records in browser composition and omits them explicitly Offline', () => {
		expect(Object.keys(CANVAPOCALYPSE_CANVAS_KIT_COMPOSITION.records).sort()).toEqual([
			'comment',
			'comment-reaction',
			'comment-thread',
		])
		const offline = createCanvapocalypseOfflineCanvasKitComposition()
		expect(offline.getContribution('canvas.comments')).toBeUndefined()
		expect(offline.records).toEqual({})
	})
})
