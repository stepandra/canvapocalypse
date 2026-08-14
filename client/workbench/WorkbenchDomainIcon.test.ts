import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { WorkbenchDomainIcon } from './WorkbenchDomainIcon'

describe('workbench domain icons', () => {
	it('renders ML as a connected model graph at toolbar size', () => {
		const markup = renderToStaticMarkup(
			createElement(WorkbenchDomainIcon, { name: 'ml' })
		)

		expect(markup).toContain('data-domain-icon="ml"')
		expect(markup.match(/<circle/g)).toHaveLength(5)
		expect(markup).toContain('stroke-width="1.8"')
	})

	it('renders UI/UX as a structured screen rather than a bare frame corner', () => {
		const markup = renderToStaticMarkup(
			createElement(WorkbenchDomainIcon, { name: 'uiux' })
		)

		expect(markup).toContain('data-domain-icon="uiux"')
		expect(markup).toContain('<rect')
		expect(markup).toContain('M2.5 8h19M8 8v12.5')
		expect(markup).not.toContain('tool-frame')
	})
})
