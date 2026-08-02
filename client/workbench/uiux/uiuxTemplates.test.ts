import { describe, expect, it } from 'vitest'
import {
	WorkbenchArtifactSchema,
	WorkbenchRelationSchema,
	WorkbenchShapeIdSchema,
	WorkbenchStableIdSchema,
} from '../../../shared/types/WorkbenchArtifact'
import {
	buildUiuxTemplateBlueprint,
	getUiuxTemplateBlueprint,
	UIUX_TEMPLATE_IDS,
	UIUX_TEMPLATES,
	validateUiuxTemplateBlueprint,
	type UiuxNativePrimitive,
} from './uiuxTemplates'

describe('UI/UX native template blueprints', () => {
	it('exposes the three stable templates and builds deterministic data', () => {
		expect(UIUX_TEMPLATE_IDS).toEqual([
			'user-flow',
			'wireframe-screen-set',
			'component-anatomy',
		])
		expect(Object.keys(UIUX_TEMPLATES)).toEqual(UIUX_TEMPLATE_IDS)

		for (const templateId of UIUX_TEMPLATE_IDS) {
			const first = buildUiuxTemplateBlueprint(templateId)
			const second = buildUiuxTemplateBlueprint(templateId)

			expect(first).toEqual(second)
			expect(JSON.stringify(first)).toBe(JSON.stringify(second))
			expect(structuredClone(first)).toEqual(first)
			expect(getUiuxTemplateBlueprint(templateId)).toEqual(first)
		}
	})

	it('uses valid, unique stable ids and native editable primitives only', () => {
		const allowed = new Set<UiuxNativePrimitive>(['frame', 'geo', 'text', 'note'])

		for (const templateId of UIUX_TEMPLATE_IDS) {
			const blueprint = buildUiuxTemplateBlueprint(templateId)
			const artifactIds = new Set<string>()
			const shapeIds = new Set<string>()

			expect(WorkbenchStableIdSchema.safeParse(blueprint.blueprintId).success).toBe(true)
			expect(validateUiuxTemplateBlueprint(blueprint)).toEqual([])

			for (const item of blueprint.artifacts) {
				expect(WorkbenchArtifactSchema.safeParse(item.artifact).success).toBe(true)
				expect(WorkbenchShapeIdSchema.safeParse(item.shapeId).success).toBe(true)
				expect(artifactIds.has(item.artifact.artifactId)).toBe(false)
				expect(shapeIds.has(item.shapeId)).toBe(false)
				artifactIds.add(item.artifact.artifactId)
				shapeIds.add(item.shapeId)

				expect(item.artifact.pack).toBe('uiux')
				expect(item.artifact.artifactId.startsWith(`uiux:${templateId}:`)).toBe(true)
				expect(allowed.has(item.visual.primitive)).toBe(true)
				expect(item.text.trim().length).toBeGreaterThan(0)

				const { x, y, w, h } = item.visual.geometry
				expect(x).toBeGreaterThanOrEqual(0)
				expect(y).toBeGreaterThanOrEqual(0)
				expect(w).toBeGreaterThan(0)
				expect(h).toBeGreaterThan(0)
				expect(x + w).toBeLessThanOrEqual(blueprint.bounds.w)
				expect(y + h).toBeLessThanOrEqual(blueprint.bounds.h)
			}

			for (const item of blueprint.artifacts) {
				if (!item.parentShapeId) continue
				const parent = blueprint.artifacts.find(
					(candidate) => candidate.shapeId === item.parentShapeId
				)
				expect(parent?.visual.primitive).toBe('frame')

				const childBounds = item.visual.geometry
				const parentBounds = parent!.visual.geometry
				expect(childBounds.x).toBeGreaterThanOrEqual(parentBounds.x)
				expect(childBounds.y).toBeGreaterThanOrEqual(parentBounds.y)
				expect(childBounds.x + childBounds.w).toBeLessThanOrEqual(
					parentBounds.x + parentBounds.w
				)
				expect(childBounds.y + childBounds.h).toBeLessThanOrEqual(
					parentBounds.y + parentBounds.h
				)
			}
		}
	})

	it('binds every semantic relation to two existing artifact endpoints', () => {
		for (const templateId of UIUX_TEMPLATE_IDS) {
			const blueprint = buildUiuxTemplateBlueprint(templateId)
			const byArtifactId = new Map(
				blueprint.artifacts.map((item) => [item.artifact.artifactId, item])
			)
			const relationIds = new Set<string>()
			const relationShapeIds = new Set<string>()

			for (const item of blueprint.relations) {
				expect(WorkbenchRelationSchema.safeParse(item.relation).success).toBe(true)
				expect(WorkbenchShapeIdSchema.safeParse(item.shapeId).success).toBe(true)
				expect(relationIds.has(item.relation.relationId)).toBe(false)
				expect(relationShapeIds.has(item.shapeId)).toBe(false)
				relationIds.add(item.relation.relationId)
				relationShapeIds.add(item.shapeId)

				const start = byArtifactId.get(item.relation.start.artifactId)
				const end = byArtifactId.get(item.relation.end.artifactId)
				expect(start?.shapeId).toBe(item.relation.start.shapeId)
				expect(end?.shapeId).toBe(item.relation.end.shapeId)
				expect(item.relation.start.artifactId).not.toBe(item.relation.end.artifactId)
				expect(item.relation.pack).toBe('uiux')
			}
		}
	})

	it('contains no image, embed, bookmark, or video shape primitives', () => {
		for (const templateId of UIUX_TEMPLATE_IDS) {
			const blueprint = buildUiuxTemplateBlueprint(templateId)
			const primitives = blueprint.artifacts.map((item) => item.visual.primitive)
			const serialized = JSON.stringify(blueprint)

			expect(primitives).not.toContain('image')
			expect(primitives).not.toContain('embed')
			expect(primitives).not.toContain('bookmark')
			expect(primitives).not.toContain('video')
			expect(serialized).not.toMatch(/"primitive":"(?:image|embed|bookmark|video)"/)
		}
	})

	it('covers the intended UI/UX semantics without a custom shape engine', () => {
		const userFlow = buildUiuxTemplateBlueprint('user-flow')
		const screenSet = buildUiuxTemplateBlueprint('wireframe-screen-set')
		const anatomy = buildUiuxTemplateBlueprint('component-anatomy')

		expect(userFlow.artifacts.some((item) => item.artifact.kind === 'persona')).toBe(true)
		expect(userFlow.artifacts.some((item) => item.artifact.kind === 'decision')).toBe(true)
		expect(userFlow.artifacts.filter((item) => item.artifact.kind === 'screen').length).toBe(3)

		expect(screenSet.artifacts.filter((item) => item.visual.primitive === 'frame').length).toBe(3)
		expect(screenSet.artifacts.some((item) => item.artifact.kind === 'assumption')).toBe(true)

		expect(anatomy.artifacts.some((item) => item.artifact.kind === 'component')).toBe(true)
		expect(anatomy.artifacts.some((item) => item.artifact.kind === 'risk')).toBe(true)
		expect(anatomy.relations.some((item) => item.relation.type === 'validates')).toBe(true)
	})
})
