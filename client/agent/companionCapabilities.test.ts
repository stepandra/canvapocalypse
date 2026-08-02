import { describe, expect, it } from 'vitest'
import {
	getAdvertisedCompanionCapabilities,
	getCompanionActionTypes,
	isCompanionCapabilityAvailable,
} from './companionCapabilities'

describe('companion capability registry', () => {
	it('advertises compact native canvas capabilities without Isoflow packs', () => {
		const capabilities = getAdvertisedCompanionCapabilities('canvas-edit')

		expect(capabilities).toEqual([
			expect.objectContaining({
				id: 'core.respond',
				summary: expect.any(String),
			}),
			expect.objectContaining({
				id: 'canvas.inspect-selection',
				summary: expect.any(String),
			}),
			expect.objectContaining({
				id: 'canvas.edit-shapes',
				summary: expect.any(String),
			}),
			expect.objectContaining({
				id: 'canvas.layout',
				summary: expect.any(String),
			}),
		])
		expect(capabilities.every(({ id }) => !id.startsWith('isoflow.'))).toBe(true)
		expect(capabilities.every(({ id }) => !id.startsWith('html.'))).toBe(true)
	})

	it('advertises Local HTML Mockup capabilities only for a selected native canvas surface', () => {
		expect(
			getAdvertisedCompanionCapabilities('canvas-edit', {
				selectedHtmlMockupCount: 1,
			}).map(({ id }) => id)
		).toEqual([
			'core.respond',
			'canvas.inspect-selection',
			'canvas.edit-shapes',
			'canvas.layout',
			'html.inspect-component',
			'html.create-variant',
		])
		expect(
			getAdvertisedCompanionCapabilities('isoflow-edit', {
				selectedHtmlMockupCount: 1,
			}).every(({ id }) => !id.startsWith('html.'))
		).toBe(true)
	})

	it('advertises Design System inspection only for one selected UI/UX node', () => {
		expect(
			getAdvertisedCompanionCapabilities('canvas-edit', {
				selectedDesignSystemCount: 1,
				domainPack: 'uiux',
			}).map(({ id }) => id)
		).toContain('design.inspect-selected-system')
		expect(
			getAdvertisedCompanionCapabilities('canvas-edit', {
				selectedDesignSystemCount: 1,
				domainPack: 'product',
			}).every(({ id }) => !id.startsWith('design.'))
		).toBe(true)
		expect(
			getAdvertisedCompanionCapabilities('isoflow-edit', {
				selectedDesignSystemCount: 1,
				domainPack: 'uiux',
			}).every(({ id }) => !id.startsWith('design.'))
		).toBe(true)
	})

	it('hydrates only the action schemas selected from the host-owned route pack', () => {
		expect(
			getCompanionActionTypes('canvas-edit', [
				'core.respond',
				'canvas.inspect-selection',
				'canvas.edit-shapes',
			])
		).toEqual(['message', 'think', 'create', 'delete', 'update', 'label', 'move', 'unknown'])

		expect(getCompanionActionTypes('canvas-edit', ['core.respond', 'canvas.layout'])).toEqual([
			'message',
			'think',
			'place',
			'bringToFront',
			'sendToBack',
			'rotate',
			'resize',
			'align',
			'distribute',
			'stack',
			'unknown',
		])

		expect(
			getCompanionActionTypes('canvas-edit', [
				'core.respond',
				'html.inspect-component',
				'html.create-variant',
			])
		).toEqual(['message', 'think', 'htmlMockupInspect', 'htmlMockupCreateVariant', 'unknown'])
	})

	it('rejects cross-surface hydration even when the capability ID is known', () => {
		expect(isCompanionCapabilityAvailable('canvas-edit', 'isoflow.patch')).toBe(false)
		expect(() => getCompanionActionTypes('canvas-edit', ['core.respond', 'isoflow.patch'])).toThrow(
			'Capability isoflow.patch is not available on the canvas-edit route'
		)
	})
})
