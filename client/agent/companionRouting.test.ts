import { describe, expect, it } from 'vitest'
import { buildResponseSchema } from '../../shared/schema/buildResponseSchema'
import type { AgentRequest } from '../../shared/types/AgentRequest'
import type { AgentModeDefinition } from '../modes/AgentModeDefinitions'
import { buildCompanionRoutePlan } from './companionRouting'

const workingMode: AgentModeDefinition = {
	type: 'working',
	active: true,
	parts: [
		'mode',
		'messages',
		'isoflowContext',
		'screenshot',
		'blurryShapes',
		'peripheralShapes',
		'workbenchArtifacts',
		'chatHistory',
	],
	actions: [
		'message',
		'create',
		'update',
		'isoflowSearch',
		'isoflowPatch',
		'isoflowCreateView',
		'unknown',
	],
}

function request(
	message: string,
	routing: AgentRequest['routing'] | null = { enabled: true, route: 'auto' }
): AgentRequest {
	return {
		agentMessages: [message],
		userMessages: [message],
		bounds: { x: 10, y: 20, w: 300, h: 200 },
		data: [],
		source: 'user',
		contextItems: [],
		...(routing ? { routing } : {}),
	}
}

describe('context-efficient companion routing', () => {
	it('keeps an ordinary canvas edit free of Isoflow context and heavyweight schemas', () => {
		const plan = buildCompanionRoutePlan(
			request('Move the selected box and rename it'),
			{
				selectedShapeCount: 1,
				selectedIsoflowEmbedCount: 0,
				historyLength: 20,
			},
			workingMode
		)

		expect(plan.route).toBe('canvas-edit')
		expect(plan.partTypes).toContain('selectedShapes')
		expect(plan.partTypes).toContain('workbenchArtifacts')
		expect(plan.partTypes).not.toContain('blurryShapes')
		expect(plan.partTypes).not.toContain('isoflowContext')
		expect(plan.partTypes).not.toContain('htmlMockupContext')
		expect(plan.partTypes).not.toContain('designSystemContext')
		expect(plan.partTypes).not.toContain('screenshot')
		expect(plan.actionTypes).not.toContain('isoflowSearch')
		expect(plan.actionTypes).not.toContain('isoflowPatch')
		expect(plan.actionTypes).not.toContain('isoflowCreateView')
		expect(plan.actionTypes).not.toContain('htmlMockupInspect')
		expect(plan.actionTypes).not.toContain('htmlMockupCreateVariant')
		expect(JSON.stringify(buildResponseSchema(plan.actionTypes, 'working'))).not.toContain(
			'isoflow'
		)
		expect(JSON.stringify(buildResponseSchema(plan.actionTypes, 'working'))).not.toContain(
			'htmlMockup'
		)
		expect(plan.metadata?.contextBudget.maxHistoryItems).toBe(8)
		expect(plan.metadata?.contextBudget.maxViewportShapes).toBe(64)
		expect(plan.metadata?.historyRef).toBe('agent-history:20:8')
		expect(plan.metadata?.capabilityManifestVersion).toBe(1)
		expect(plan.metadata?.capabilities.map(({ id }) => id)).toEqual([
			'core.respond',
			'canvas.inspect-selection',
			'canvas.edit-shapes',
			'canvas.layout',
		])
		expect(plan.metadata?.hydratedCapabilities).toEqual([
			'core.respond',
			'canvas.inspect-selection',
			'canvas.edit-shapes',
		])
	})

	it('adds the bounded Design System projection only for one selected UI/UX node', () => {
		const plan = buildCompanionRoutePlan(
			request('Restyle the selected card using this design system', {
				enabled: true,
				route: 'canvas-edit',
				domainPack: 'uiux',
			}),
			{
				selectedShapeCount: 1,
				selectedIsoflowEmbedCount: 0,
				selectedDesignSystemCount: 1,
			},
			workingMode
		)

		expect(plan.route).toBe('canvas-edit')
		expect(plan.partTypes).toContain('designSystemContext')
		expect(plan.partTypes).not.toContain('isoflowContext')
		expect(plan.metadata?.capabilities.map(({ id }) => id)).toContain(
			'design.inspect-selected-system'
		)
		expect(plan.metadata?.hydratedCapabilities).toContain(
			'design.inspect-selected-system'
		)
		expect(JSON.stringify(buildResponseSchema(plan.actionTypes, 'working'))).not.toContain(
			'designSystem'
		)
	})

	it('does not expose Design System context outside exact UI/UX selection authority', () => {
		for (const domainPack of ['ml', 'product'] as const) {
			const plan = buildCompanionRoutePlan(
				request('Restyle the selected card', {
					enabled: true,
					route: 'canvas-edit',
					domainPack,
				}),
				{
					selectedShapeCount: 1,
					selectedIsoflowEmbedCount: 0,
					selectedDesignSystemCount: 1,
				},
				workingMode
			)

			expect(plan.partTypes).not.toContain('designSystemContext')
			expect(
				plan.metadata?.capabilities.every(({ id }) => !id.startsWith('design.'))
			).toBe(true)
			expect(
				plan.metadata?.hydratedCapabilities.every(
					(id) => !id.startsWith('design.')
				)
			).toBe(true)
		}

		const mixedSelection = buildCompanionRoutePlan(
			request('Restyle the selected card', {
				enabled: true,
				route: 'canvas-edit',
				domainPack: 'uiux',
			}),
			{
				selectedShapeCount: 2,
				selectedIsoflowEmbedCount: 0,
				selectedDesignSystemCount: 1,
			},
			workingMode
		)
		expect(mixedSelection.partTypes).not.toContain('designSystemContext')
		expect(
			mixedSelection.metadata?.capabilities.every(
				({ id }) => !id.startsWith('design.')
			)
		).toBe(true)
	})

	it('hydrates bounded HTML inspection without the variant schema for inspect-only canvas intent', () => {
		const plan = buildCompanionRoutePlan(
			request('Inspect the selected component', {
				enabled: true,
				route: 'canvas-edit',
			}),
			{
				selectedShapeCount: 1,
				selectedIsoflowEmbedCount: 0,
				selectedHtmlMockupCount: 1,
			},
			workingMode
		)

		expect(plan.route).toBe('canvas-edit')
		expect(plan.partTypes).toContain('htmlMockupContext')
		expect(plan.partTypes).not.toContain('isoflowContext')
		expect(plan.metadata?.capabilities.map(({ id }) => id)).toContain(
			'html.inspect-component'
		)
		expect(plan.metadata?.capabilities.map(({ id }) => id)).toContain('html.create-variant')
		expect(plan.metadata?.hydratedCapabilities).toContain('html.inspect-component')
		expect(plan.metadata?.hydratedCapabilities).not.toContain('html.create-variant')
		expect(plan.actionTypes).toContain('htmlMockupInspect')
		expect(plan.actionTypes).not.toContain('htmlMockupCreateVariant')
		expect(JSON.stringify(buildResponseSchema(plan.actionTypes, 'working'))).not.toContain(
			'replacementHtml'
		)
	})

	it('hydrates the revision-guarded HTML variant schema only for edit or design intent', () => {
		const plan = buildCompanionRoutePlan(
			request('Create a variant for the selected HTML mockup'),
			{
				selectedShapeCount: 1,
				selectedIsoflowEmbedCount: 0,
				selectedHtmlMockupCount: 1,
			},
			workingMode
		)

		expect(plan.route).toBe('canvas-edit')
		expect(plan.metadata?.hydratedCapabilities).toContain('html.inspect-component')
		expect(plan.metadata?.hydratedCapabilities).toContain('html.create-variant')
		expect(plan.actionTypes).toContain('htmlMockupInspect')
		expect(plan.actionTypes).toContain('htmlMockupCreateVariant')
		const schema = JSON.stringify(buildResponseSchema(plan.actionTypes, 'working'))
		expect(schema).toContain('expectedRevision')
		expect(schema).toContain('replacementHtml')
	})

	it('includes selected HTML semantic context for inquiry without hydrating HTML actions', () => {
		const plan = buildCompanionRoutePlan(
			request('What design does the selected component use?'),
			{
				selectedShapeCount: 1,
				selectedIsoflowEmbedCount: 0,
				selectedHtmlMockupCount: 1,
			},
			workingMode
		)

		expect(plan.route).toBe('inquiry')
		expect(plan.partTypes).toContain('htmlMockupContext')
		expect(plan.actionTypes).not.toContain('htmlMockupInspect')
		expect(plan.actionTypes).not.toContain('htmlMockupCreateVariant')
		expect(plan.metadata?.capabilities.every(({ id }) => !id.startsWith('html.'))).toBe(true)
	})

	it.each([
		'Build a system diagram',
		'Generate a component map',
		'Построй архитектурную диаграмму',
	])('routes generative canvas language as an edit: %s', (message) => {
		const plan = buildCompanionRoutePlan(
			request(message),
			{ selectedShapeCount: 1, selectedIsoflowEmbedCount: 0 },
			workingMode
		)

		expect(plan.route).toBe('canvas-edit')
		expect(plan.actionTypes).toContain('create')
		expect(plan.partTypes).not.toContain('isoflowContext')
	})

	it('includes bounded nearby shapes and viewport parts only when explicitly requested', () => {
		const plan = buildCompanionRoutePlan(
			request('Move the selected box', {
				enabled: true,
				route: 'canvas-edit',
				includeBounds: true,
			}),
			{ selectedShapeCount: 1, selectedIsoflowEmbedCount: 0 },
			workingMode
		)

		expect(plan.partTypes).toContain('selectedShapes')
		expect(plan.partTypes).toContain('workbenchArtifacts')
		expect(plan.partTypes).toContain('blurryShapes')
		expect(plan.partTypes).toContain('screenshot')
		expect(plan.partTypes).toContain('userViewportBounds')
		expect(plan.partTypes).toContain('agentViewportBounds')
	})

	it('gives a selected Isoflow request only its compact context and bridge capabilities', () => {
		const plan = buildCompanionRoutePlan(
			request('Update this DevSecOps infrastructure contour in Isoflow'),
			{ selectedShapeCount: 1, selectedIsoflowEmbedCount: 1, historyLength: 2 },
			workingMode
		)

		expect(plan.route).toBe('isoflow-edit')
		expect(plan.partTypes).toContain('isoflowContext')
		expect(plan.partTypes).not.toContain('workbenchArtifacts')
		expect(plan.partTypes).not.toContain('htmlMockupContext')
		expect(plan.partTypes).not.toContain('screenshot')
		expect(plan.partTypes).not.toContain('blurryShapes')
		expect(plan.partTypes).not.toContain('peripheralShapes')
		expect(plan.actionTypes).toEqual([
			'message',
			'think',
			'isoflowSearch',
			'isoflowPatch',
			'unknown',
		])
		expect(plan.metadata?.capabilities.every(({ id }) => !id.startsWith('html.'))).toBe(true)
		expect(plan.metadata).toMatchObject({
			capabilityManifestVersion: 1,
			contextBudget: {
				maxIsoflowEmbeds: 1,
				maxIsoflowItems: 32,
				maxIsoflowConnectors: 48,
			},
			permissionBoundary: {
				surface: 'isoflow',
				mutations: 'revision-guarded-transactions',
				credentials: 'external-only',
			},
		})
		expect(plan.metadata?.capabilities.map(({ id }) => id)).toEqual([
			'core.respond',
			'isoflow.inspect-selected-view',
			'isoflow.search',
			'isoflow.patch',
			'isoflow.create-view',
		])
		expect(plan.metadata?.hydratedCapabilities).toEqual([
			'core.respond',
			'isoflow.inspect-selected-view',
			'isoflow.search',
			'isoflow.patch',
		])
	})

	it('keeps selected Local HTML Mockup context and actions out of the Isoflow route', () => {
		const plan = buildCompanionRoutePlan(
			request('Update this DevSecOps infrastructure contour in Isoflow'),
			{
				selectedShapeCount: 2,
				selectedIsoflowEmbedCount: 1,
				selectedHtmlMockupCount: 1,
			},
			workingMode
		)

		expect(plan.route).toBe('isoflow-edit')
		expect(plan.partTypes).toContain('isoflowContext')
		expect(plan.partTypes).not.toContain('htmlMockupContext')
		expect(plan.actionTypes).not.toContain('htmlMockupInspect')
		expect(plan.actionTypes).not.toContain('htmlMockupCreateVariant')
		expect(plan.metadata?.capabilities.every(({ id }) => !id.startsWith('html.'))).toBe(true)
	})

	it('does not grant HTML context or capabilities for a mixed canvas selection', () => {
		const plan = buildCompanionRoutePlan(
			request('Redesign the selected HTML component', {
				enabled: true,
				route: 'canvas-edit',
			}),
			{
				selectedShapeCount: 2,
				selectedIsoflowEmbedCount: 0,
				selectedHtmlMockupCount: 1,
			},
			workingMode
		)

		expect(plan.route).toBe('canvas-edit')
		expect(plan.partTypes).not.toContain('htmlMockupContext')
		expect(plan.actionTypes).not.toContain('htmlMockupInspect')
		expect(plan.actionTypes).not.toContain('htmlMockupCreateVariant')
		expect(plan.metadata?.capabilities.every(({ id }) => !id.startsWith('html.'))).toBe(true)
		expect(plan.metadata?.hydratedCapabilities.every((id) => !id.startsWith('html.'))).toBe(
			true
		)
	})

	it('hydrates the dedicated Isoflow view-creation capability without the patch schema', () => {
		const plan = buildCompanionRoutePlan(
			request('Create a new deployment diagram view in Isoflow'),
			{ selectedShapeCount: 1, selectedIsoflowEmbedCount: 1, historyLength: 1 },
			workingMode
		)

		expect(plan.route).toBe('isoflow-edit')
		expect(plan.actionTypes).toContain('isoflowSearch')
		expect(plan.actionTypes).toContain('isoflowCreateView')
		expect(plan.actionTypes).not.toContain('isoflowPatch')
		expect(plan.metadata?.hydratedCapabilities).toContain('isoflow.create-view')
		expect(plan.metadata?.hydratedCapabilities).not.toContain('isoflow.patch')
	})

	it('keeps ML and MLOps diagram work on native tldraw even when an Isoflow embed is selected', () => {
		const plan = buildCompanionRoutePlan(
			request('Create an MLOps Hugging Face evaluation widget for the ML-Intern workflow', {
				enabled: true,
				route: 'isoflow-edit',
			}),
			{ selectedShapeCount: 1, selectedIsoflowEmbedCount: 1, historyLength: 4 },
			workingMode
		)

		expect(plan.route).toBe('canvas-edit')
		expect(plan.partTypes).toContain('selectedShapes')
		expect(plan.partTypes).toContain('workbenchArtifacts')
		expect(plan.partTypes).not.toContain('isoflowContext')
		expect(plan.actionTypes).not.toContain('isoflowSearch')
		expect(plan.actionTypes).not.toContain('isoflowPatch')
		expect(plan.actionTypes).not.toContain('isoflowCreateView')
		expect(plan.metadata?.capabilities.every(({ id }) => !id.startsWith('isoflow.'))).toBe(true)
	})

	it('includes selected semantic artifacts for a generic inquiry without broad canvas context', () => {
		const plan = buildCompanionRoutePlan(
			request('What decision does the selected artifact represent?'),
			{ selectedShapeCount: 1, selectedIsoflowEmbedCount: 0 },
			workingMode
		)

		expect(plan.route).toBe('inquiry')
		expect(plan.partTypes).toContain('selectedShapes')
		expect(plan.partTypes).toContain('workbenchArtifacts')
		expect(plan.partTypes).not.toContain('blurryShapes')
		expect(plan.partTypes).not.toContain('screenshot')
		expect(plan.partTypes).not.toContain('isoflowContext')
	})

	it.each(['architecture', 'ml', 'uiux', 'product'] as const)(
		'carries the canonical %s domain pack while keeping generic work on native tldraw',
		(domainPack) => {
			const plan = buildCompanionRoutePlan(
				request('Create the requested companion diagram', {
					enabled: true,
					route: 'isoflow-edit',
					domainPack,
				}),
				{ selectedShapeCount: 1, selectedIsoflowEmbedCount: 1 },
				workingMode
			)

			expect(plan.route).toBe('canvas-edit')
			expect(plan.metadata?.domainPack).toBe(domainPack)
			expect(plan.metadata?.capabilities.every(({ id }) => !id.startsWith('isoflow.'))).toBe(true)
		}
	)

	it('allows an explicit infrastructure request to target a selected Isoflow embed', () => {
		const plan = buildCompanionRoutePlan(
			request('Update this DevSecOps infrastructure view in Isoflow', {
				enabled: true,
				route: 'isoflow-edit',
				domainPack: 'architecture',
			}),
			{ selectedShapeCount: 1, selectedIsoflowEmbedCount: 1 },
			workingMode
		)

		expect(plan.route).toBe('isoflow-edit')
		expect(plan.metadata?.domainPack).toBe('architecture')
		expect(plan.metadata?.capabilities.map(({ id }) => id)).toContain('isoflow.search')
	})

	it('keeps the ML domain pack native even when infrastructure language is present', () => {
		const plan = buildCompanionRoutePlan(
			request('Update this MLOps deployment infrastructure diagram', {
				enabled: true,
				route: 'isoflow-edit',
				domainPack: 'ml',
			}),
			{ selectedShapeCount: 1, selectedIsoflowEmbedCount: 1 },
			workingMode
		)

		expect(plan.route).toBe('canvas-edit')
		expect(plan.metadata?.domainPack).toBe('ml')
		expect(plan.metadata?.capabilities.every(({ id }) => !id.startsWith('isoflow.'))).toBe(true)
	})

	it('advertises layout compactly but hydrates its schemas only for an extended request', () => {
		const basePlan = buildCompanionRoutePlan(
			request('Move the selected box'),
			{ selectedShapeCount: 1, selectedIsoflowEmbedCount: 0 },
			workingMode
		)
		const extendedPlan = buildCompanionRoutePlan(
			request('Move the selected box', {
				enabled: true,
				route: 'canvas-edit',
				capabilityTier: 'extended',
			}),
			{ selectedShapeCount: 1, selectedIsoflowEmbedCount: 0 },
			workingMode
		)

		expect(basePlan.metadata?.capabilities.map(({ id }) => id)).toContain('canvas.layout')
		expect(basePlan.metadata?.hydratedCapabilities).not.toContain('canvas.layout')
		expect(basePlan.actionTypes).not.toContain('align')
		expect(extendedPlan.metadata?.hydratedCapabilities).toContain('canvas.layout')
		expect(extendedPlan.actionTypes).toContain('align')
	})

	it('preserves the full legacy mode when routing is not active', () => {
		const plan = buildCompanionRoutePlan(
			request('Move the box', null),
			{ selectedShapeCount: 1, selectedIsoflowEmbedCount: 0 },
			workingMode
		)

		expect(plan.active).toBe(false)
		expect(plan.partTypes).toEqual(workingMode.active ? workingMode.parts : [])
		expect(plan.actionTypes).toEqual(workingMode.active ? workingMode.actions : [])
	})
})
