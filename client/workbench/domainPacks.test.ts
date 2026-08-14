import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
	DEFAULT_WORKBENCH_DOMAIN,
	resolveWorkbenchDomain,
	resolveWorkbenchDomainPack,
	WORKBENCH_DOMAIN_PACKS,
} from './domainPacks'
import { readWorkbenchDomainSelection } from './workbenchState'

describe('workbench domain packs', () => {
	it('falls back deterministically for an unknown or missing pack', () => {
		expect(resolveWorkbenchDomain(undefined)).toBe(DEFAULT_WORKBENCH_DOMAIN)
		expect(resolveWorkbenchDomain('unknown-pack')).toBe(DEFAULT_WORKBENCH_DOMAIN)
		expect(resolveWorkbenchDomainPack('unknown-pack')).toBe(
			WORKBENCH_DOMAIN_PACKS[DEFAULT_WORKBENCH_DOMAIN]
		)
	})

	it('gates polling overlays to their relevant packs', () => {
		expect(WORKBENCH_DOMAIN_PACKS.architecture.overlays).toEqual({
			workflow: false,
			isoflow: true,
			htmlMockup: false,
			designSystem: false,
			stitch: false,
			mlIntern: false,
			terminalSession: true,
		})
		expect(WORKBENCH_DOMAIN_PACKS.ml.overlays).toEqual({
			workflow: true,
			isoflow: false,
			htmlMockup: false,
			designSystem: false,
			stitch: false,
			mlIntern: true,
			terminalSession: false,
		})
		expect(WORKBENCH_DOMAIN_PACKS.uiux.overlays).toEqual({
			workflow: false,
			isoflow: false,
			htmlMockup: true,
			designSystem: true,
			stitch: true,
			mlIntern: false,
			terminalSession: false,
		})
		expect(WORKBENCH_DOMAIN_PACKS.product.overlays).toEqual({
			workflow: true,
			isoflow: false,
			htmlMockup: false,
			designSystem: false,
			stitch: false,
			mlIntern: false,
			terminalSession: false,
		})
	})

	it('keeps Architecture advisory instead of implying an Isoflow route', () => {
		const architecture = resolveWorkbenchDomainPack('architecture')

		expect(architecture.defaultSurface).toBe('native-tldraw')
		expect(architecture.agentRoute).toBe('auto')
		expect(architecture.overlays.isoflow).toBe(true)
	})

	it('allows an explicit valid fallback without accepting arbitrary values', () => {
		expect(resolveWorkbenchDomain('invalid', 'ml')).toBe('ml')
		expect(resolveWorkbenchDomainPack(null, 'product').id).toBe('product')
	})

	it('preserves the legacy ML-Intern entry points unless pack is explicit', () => {
		const storedArchitecture = {
			getItem: () => 'architecture',
			setItem: () => undefined,
		}

		expect(
			readWorkbenchDomainSelection('?workflow=ml-intern', storedArchitecture)
		).toBe('ml')
		expect(readWorkbenchDomainSelection('?canvas=eval-lab', storedArchitecture)).toBe(
			'ml'
		)
		expect(
			readWorkbenchDomainSelection(
				'?workflow=ml-intern&pack=uiux',
				storedArchitecture
			)
		).toBe('uiux')
	})

	it('migrates old query and storage aliases to canonical domains', () => {
		expect(readWorkbenchDomainSelection('?pack=ml-llm', null)).toBe('ml')
		expect(readWorkbenchDomainSelection('?pack=ui-ux', null)).toBe('uiux')
		expect(readWorkbenchDomainSelection('?pack=product-pm', null)).toBe('product')
		expect(
			readWorkbenchDomainSelection('', {
				getItem: () => 'product-pm',
				setItem: () => undefined,
			})
		).toBe('product')
	})

	it('exposes exactly three native starter templates per canonical pack', () => {
		for (const pack of Object.values(WORKBENCH_DOMAIN_PACKS)) {
			expect(pack.templates).toHaveLength(3)
			expect(new Set(pack.templates.map((template) => template.id)).size).toBe(3)
			expect(pack.icon).toBeTruthy()
			expect('shortLabel' in pack).toBe(false)
			for (const template of pack.templates) {
				expect(template.icon).toBeTruthy()
			}
		}
	})

	it('uses semantic domain glyphs instead of letter badges', () => {
		expect(
			Object.fromEntries(
				Object.entries(WORKBENCH_DOMAIN_PACKS).map(([id, pack]) => [
					id,
					pack.icon,
				])
			)
		).toEqual({
			architecture: 'architecture',
			ml: 'ml',
			uiux: 'uiux',
			product: 'product',
		})
	})

	it('restores pointer interaction for the in-front-of-canvas shell and palette', () => {
		const css = readFileSync(new URL('./workbench.css', import.meta.url), 'utf8')
		for (const selector of [
			'workbench-pack-switcher',
			'workbench-pack-options',
			'workbench-pack-option',
			'workbench-template-control',
			'workbench-template-trigger',
			'workbench-template-palette',
			'workbench-template-option',
		]) {
			expect(css).toMatch(
				new RegExp(`\\.${selector}\\s*\\{[^}]*pointer-events:\\s*auto`, 's')
			)
		}
	})
})
