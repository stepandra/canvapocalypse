import { describe, expect, it } from 'vitest'
import {
	ISOFLOW_ORIGIN,
	assertAllowedIsoflowBaseUrl,
	buildIsoflowUrl,
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
})
