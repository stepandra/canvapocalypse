import { describe, expect, it } from 'vitest'
import { WORKBENCH_DOMAIN_PACKS } from './domainPacks'
import { getWorkbenchTemplatePreviewScene } from './WorkbenchTemplatePreview'

describe('WorkbenchTemplatePreview', () => {
	it.each(['architecture', 'product'] as const)(
		'provides a bounded, template-specific %s preview',
		(domain) => {
			const scenes = WORKBENCH_DOMAIN_PACKS[domain].templates.map((template) => ({
				id: template.id,
				scene: getWorkbenchTemplatePreviewScene(template.id),
			}))

			expect(new Set(scenes.map(({ scene }) => JSON.stringify(scene))).size).toBe(
				scenes.length
			)
			for (const { scene } of scenes) {
				expect(scene.nodes.length).toBeGreaterThanOrEqual(4)
				for (const node of scene.nodes) {
					expect(node.x).toBeGreaterThanOrEqual(0)
					expect(node.y).toBeGreaterThanOrEqual(0)
					expect(node.x + node.w).toBeLessThanOrEqual(100)
					expect(node.y + node.h).toBeLessThanOrEqual(46)
				}
			}
		}
	)

	it('keeps a generic native-diagram preview for other packs', () => {
		expect(getWorkbenchTemplatePreviewScene('not-registered')).toMatchObject({
			nodes: expect.arrayContaining([
				expect.objectContaining({ tone: 'primary' }),
			]),
			edges: expect.any(Array),
		})
	})
})
