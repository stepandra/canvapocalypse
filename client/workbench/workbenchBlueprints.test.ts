import { describe, expect, it } from 'vitest'
import {
	buildDeliveryTimelineBlueprint,
	buildOpportunityDecisionBlueprint,
	buildProductRoadmapBlueprint,
	validateWorkbenchBlueprint,
	type WorkbenchBlueprint,
} from './workbenchBlueprints'

function expectCompleteProductSemantics(blueprint: WorkbenchBlueprint) {
	const kinds = new Set(blueprint.artifacts.map((item) => item.artifact.kind))
	const roles = new Set(blueprint.artifacts.map((item) => item.visual.role))

	expect([...kinds]).toEqual(
		expect.arrayContaining(['timeline-lane', 'initiative', 'milestone', 'risk', 'decision'])
	)
	expect([...roles]).toEqual(
		expect.arrayContaining(['lane', 'bar', 'milestone', 'risk', 'decision'])
	)
	expect(blueprint.relations.length).toBeGreaterThan(0)
	expect(validateWorkbenchBlueprint(blueprint)).toEqual([])
}

function expectBoundRelationsMatchArtifacts(blueprint: WorkbenchBlueprint) {
	const shapeIdByArtifactId = new Map(
		blueprint.artifacts.map((item) => [item.artifact.artifactId, item.shapeId])
	)

	for (const { relation } of blueprint.relations) {
		expect(relation.start.shapeId).toBe(shapeIdByArtifactId.get(relation.start.artifactId))
		expect(relation.end.shapeId).toBe(shapeIdByArtifactId.get(relation.end.artifactId))
		expect(relation.start.shapeId).not.toBe(relation.end.shapeId)
	}
}

describe('buildProductRoadmapBlueprint', () => {
	it('builds a deterministic native roadmap with lanes, bars, decisions, risks, and bindings', () => {
		const options = {
			blueprintId: 'product-roadmap-test',
			startDate: '2026-07-01',
		}
		const first = buildProductRoadmapBlueprint(options)
		const second = buildProductRoadmapBlueprint(options)

		expect(second).toEqual(first)
		expect(first.kind).toBe('product-roadmap')
		expect(first.artifacts.filter((item) => item.artifact.kind === 'timeline-lane')).toHaveLength(3)
		expectCompleteProductSemantics(first)
		expectBoundRelationsMatchArtifacts(first)
	})

	it('keeps initiative dates ordered and attaches them to stable lane artifact refs', () => {
		const blueprint = buildProductRoadmapBlueprint({
			blueprintId: 'product-roadmap-dates',
			startDate: '2026-12-20',
		})
		const initiatives = blueprint.artifacts.filter(
			(item) => item.artifact.kind === 'initiative'
		)

		for (const { artifact } of initiatives) {
			expect(artifact.startAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
			expect(artifact.dueAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
			expect(artifact.startAt! <= artifact.dueAt!).toBe(true)
			expect(artifact.refs.some((reference) => reference.kind === 'artifact')).toBe(true)
		}

		expect(initiatives.some((item) => item.artifact.startAt!.startsWith('2027-'))).toBe(true)
	})
})

describe('buildDeliveryTimelineBlueprint', () => {
	it('builds a deterministic delivery timeline with validated semantic dependencies', () => {
		const options = {
			blueprintId: 'delivery-timeline-test',
			startDate: '2026-07-01',
			owner: { id: 'team:launch', type: 'team' as const, label: 'Launch' },
		}
		const first = buildDeliveryTimelineBlueprint(options)
		const second = buildDeliveryTimelineBlueprint(options)

		expect(second).toEqual(first)
		expect(first.kind).toBe('delivery-timeline')
		expect(first.artifacts.every((item) => item.artifact.owner?.id === 'team:launch')).toBe(true)
		expectCompleteProductSemantics(first)
		expectBoundRelationsMatchArtifacts(first)
		expect(first.relations.map((item) => item.relation.type)).toEqual(
			expect.arrayContaining(['depends-on', 'blocks', 'decided-by', 'milestone-of'])
		)
	})

	it('fails closed on unstable namespaces and impossible calendar dates', () => {
		expect(() =>
			buildDeliveryTimelineBlueprint({
				blueprintId: 'Not stable',
				startDate: '2026-07-01',
			})
		).toThrow(/Stable ids/)

		expect(() =>
			buildDeliveryTimelineBlueprint({
				blueprintId: 'delivery-invalid-date',
				startDate: '2026-02-30',
			})
		).toThrow(/real calendar date/)
	})
})

describe('buildOpportunityDecisionBlueprint', () => {
	it('builds a deterministic native opportunity-to-outcome decision graph', () => {
		const options = {
			blueprintId: 'opportunity-decision-test',
			startDate: '2026-07-01',
		}
		const first = buildOpportunityDecisionBlueprint(options)
		const second = buildOpportunityDecisionBlueprint(options)

		expect(second).toEqual(first)
		expect(first.kind).toBe('opportunity-decision')
		expect(first.pack).toBe('product')
		expect(first.artifacts.every((item) => item.artifact.pack === 'product')).toBe(true)
		expect(
			first.artifacts.filter((item) => item.artifact.kind === 'opportunity')
		).toHaveLength(3)
		expect(
			first.artifacts.filter((item) =>
				item.artifact.tags.includes('decision-criterion')
			)
		).toHaveLength(3)
		expect(first.artifacts.filter((item) => item.artifact.kind === 'decision')).toHaveLength(1)
		expect(first.artifacts.filter((item) => item.artifact.kind === 'outcome')).toHaveLength(1)
		expect(first.artifacts.filter((item) => item.artifact.kind === 'risk')).toHaveLength(1)
		expect(first.relations.map((item) => item.relation.type)).toEqual(
			expect.arrayContaining(['informs', 'decided-by', 'implements', 'blocks'])
		)
		expect(validateWorkbenchBlueprint(first)).toEqual([])
		expectBoundRelationsMatchArtifacts(first)
	})

	it('connects opportunities through explicit criteria and a decision to the outcome', () => {
		const blueprint = buildOpportunityDecisionBlueprint({
			blueprintId: 'opportunity-decision-chain',
			startDate: '2026-07-01',
			owner: { id: 'team:discovery', type: 'team', label: 'Discovery' },
		})
		const artifactsById = new Map(
			blueprint.artifacts.map((item) => [item.artifact.artifactId, item])
		)
		const decisions = blueprint.artifacts.filter(
			(item) => item.artifact.kind === 'decision'
		)
		const outcomes = blueprint.artifacts.filter((item) => item.artifact.kind === 'outcome')
		const criteria = blueprint.artifacts.filter((item) =>
			item.artifact.tags.includes('decision-criterion')
		)

		expect(decisions).toHaveLength(1)
		expect(outcomes).toHaveLength(1)
		expect(criteria).toHaveLength(3)
		expect(blueprint.artifacts.every((item) => item.artifact.owner?.id === 'team:discovery')).toBe(
			true
		)

		const decision = decisions[0]
		const outcome = outcomes[0]
		expect(
			blueprint.relations.filter(
				(item) =>
					item.relation.type === 'informs' &&
					criteria.some(
						(criterion) => criterion.artifact.artifactId === item.relation.start.artifactId
					) &&
					item.relation.end.artifactId === decision.artifact.artifactId
			)
		).toHaveLength(3)
		expect(
			blueprint.relations.some(
				(item) =>
					item.relation.type === 'implements' &&
					item.relation.start.artifactId === decision.artifact.artifactId &&
					item.relation.end.artifactId === outcome.artifact.artifactId
			)
		).toBe(true)
		expect(
			blueprint.relations.every(
				(item) =>
					artifactsById.has(item.relation.start.artifactId) &&
					artifactsById.has(item.relation.end.artifactId)
			)
		).toBe(true)
	})
})
