import { describe, expect, it } from 'vitest'
import type { Editor, TLEmbedShape } from 'tldraw'
import {
	ISOFLOW_ORIGIN,
	assertAllowedIsoflowBaseUrl,
	buildIsoflowUrl,
	findIsoflowEmbed,
	fromIsoflowEmbedUrl,
	toIsoflowEmbedUrl,
} from './isoflowProvider'

describe('Isoflow embed provider', () => {
	it('round-trips source and embed URLs without losing project or view', () => {
		const source = buildIsoflowUrl('autorecruit-contours', 'vi_must_network')
		const embedded = toIsoflowEmbedUrl(source)
		expect(embedded).toContain('project=autorecruit-contours')
		expect(embedded).toContain('view=vi_must_network')
		expect(embedded).toContain('embed=1')
		expect(fromIsoflowEmbedUrl(embedded!)).toBe(source)
	})

	it('accepts only the local Isoflow bridge hosts', () => {
		expect(assertAllowedIsoflowBaseUrl(ISOFLOW_ORIGIN)).toBe(ISOFLOW_ORIGIN)
		expect(assertAllowedIsoflowBaseUrl('http://localhost:4174/')).toBe(
			'http://localhost:4174'
		)
		expect(() => assertAllowedIsoflowBaseUrl('https://example.com')).toThrow(
			'Isoflow host is not allowed'
		)
		expect(toIsoflowEmbedUrl('https://example.com/?project=nope')).toBeUndefined()
	})

	it('resolves exactly one explicitly selected embed and never falls back to the page', () => {
		const selected = makeIsoflowShape('shape:selected', 'selected-project', 'selected-view')
		const unselected = makeIsoflowShape('shape:page', 'page-project', 'page-view')
		const editor = {
			getSelectedShapes: () => [selected],
			getCurrentPageShapes: () => [selected, unselected],
		} as unknown as Editor

		expect(findIsoflowEmbed(editor)).toMatchObject({
			shape: { id: 'shape:selected' },
			meta: { projectId: 'selected-project', viewId: 'selected-view' },
		})
		expect(findIsoflowEmbed(editor, 'page-project')).toBeNull()

		const nothingSelected = {
			getSelectedShapes: () => [],
			getCurrentPageShapes: () => [unselected],
		} as unknown as Editor
		expect(findIsoflowEmbed(nothingSelected, 'page-project')).toBeNull()
	})

	it('rejects ambiguous multi-selection instead of choosing one embed', () => {
		const first = makeIsoflowShape('shape:first', 'project', 'view-one')
		const second = makeIsoflowShape('shape:second', 'project', 'view-two')
		const editor = {
			getSelectedShapes: () => [first, second],
			getCurrentPageShapes: () => [first, second],
		} as unknown as Editor

		expect(findIsoflowEmbed(editor, 'project')).toBeNull()
	})
})

function makeIsoflowShape(id: string, projectId: string, viewId: string) {
	return {
		id,
		type: 'embed',
		meta: {
			embedProvider: {
				schema: 'canvapocalypse-embed/v1',
				provider: 'autorecruit_isoflow',
				baseUrl: ISOFLOW_ORIGIN,
				projectId,
				viewId,
			},
		},
	} as unknown as TLEmbedShape
}
