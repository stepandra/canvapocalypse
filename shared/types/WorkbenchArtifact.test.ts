import { createShapeId } from 'tldraw'
import { describe, expect, it } from 'vitest'
import {
	isWorkbenchArtifact,
	parseWorkbenchArtifact,
	parseWorkbenchRelation,
	WORKBENCH_ARTIFACT_SCHEMA,
	WORKBENCH_RELATION_SCHEMA,
} from './WorkbenchArtifact'

const baseArtifact = {
	schema: WORKBENCH_ARTIFACT_SCHEMA,
	artifactId: 'workbench:test:artifact',
	title: 'Test artifact',
	status: 'active',
	refs: [],
	tags: [],
	version: 1,
} as const

describe('WorkbenchArtifactSchema', () => {
	it('supports native artifacts from all four domain packs', () => {
		const fixtures = [
			{ pack: 'architecture', kind: 'service' },
			{ pack: 'ml', kind: 'model' },
			{ pack: 'uiux', kind: 'screen' },
			{ pack: 'product', kind: 'initiative' },
		] as const

		for (const fixture of fixtures) {
			expect(
				parseWorkbenchArtifact({
					...baseArtifact,
					...fixture,
				})
			).toMatchObject(fixture)
		}
	})

	it('retains bounded owners, dates, and stable artifact/document refs', () => {
		const artifact = parseWorkbenchArtifact({
			...baseArtifact,
			pack: 'product',
			kind: 'milestone',
			owner: { id: 'team:delivery', type: 'team', label: 'Delivery' },
			startAt: '2026-07-01',
			dueAt: '2026-07-31',
			refs: [
				{
					refId: 'workbench:test:decision-ref',
					kind: 'decision',
					target: 'workbench:decision:ship',
				},
				{
					refId: 'workbench:test:document-ref',
					kind: 'document',
					target: 'docs/decisions/ship.md',
				},
			],
		})

		expect(artifact.owner?.id).toBe('team:delivery')
		expect(artifact.refs.map((reference) => reference.kind)).toEqual(['decision', 'document'])
		expect(isWorkbenchArtifact(artifact)).toBe(true)
	})

	it('rejects pack/kind drift, invalid dates, duplicate refs, and unstable ids', () => {
		expect(() =>
			parseWorkbenchArtifact({
				...baseArtifact,
				pack: 'ml',
				kind: 'initiative',
			})
		).toThrow()

		expect(() =>
			parseWorkbenchArtifact({
				...baseArtifact,
				pack: 'product',
				kind: 'initiative',
				startAt: '2026-08-10',
				dueAt: '2026-08-01',
			})
		).toThrow(/dueAt/)

		expect(() =>
			parseWorkbenchArtifact({
				...baseArtifact,
				pack: 'product',
				kind: 'initiative',
				refs: [
					{ refId: 'ref:same', kind: 'source', target: 'one' },
					{ refId: 'ref:same', kind: 'source', target: 'two' },
				],
			})
		).toThrow(/Duplicate reference id/)

		expect(() =>
			parseWorkbenchArtifact({
				...baseArtifact,
				artifactId: 'Not stable',
				pack: 'product',
				kind: 'initiative',
			})
		).toThrow(/Stable ids/)
	})
})

describe('WorkbenchRelationSchema', () => {
	it('captures the semantic relation and both native bound-arrow endpoints', () => {
		const generatedStartId = createShapeId()
		const generatedEndId = createShapeId()
		const relation = parseWorkbenchRelation({
			schema: WORKBENCH_RELATION_SCHEMA,
			relationId: 'workbench:test:depends-on',
			pack: 'product',
			type: 'depends-on',
			start: {
				artifactId: 'workbench:test:later',
				shapeId: generatedStartId,
			},
			end: {
				artifactId: 'workbench:test:first',
				shapeId: generatedEndId,
			},
			version: 1,
		})

		expect(relation).toMatchObject({
			type: 'depends-on',
			start: { artifactId: 'workbench:test:later', shapeId: generatedStartId },
			end: { artifactId: 'workbench:test:first', shapeId: generatedEndId },
		})
		expect(() =>
			parseWorkbenchRelation({
				...relation,
				start: { ...relation.start, shapeId: 'shape:-valid-trailing-' },
				end: { ...relation.end, shapeId: 'shape:_valid_trailing_' },
			})
		).not.toThrow()
	})

	it('rejects self-relations and non-shape binding ids', () => {
		expect(() =>
			parseWorkbenchRelation({
				schema: WORKBENCH_RELATION_SCHEMA,
				relationId: 'workbench:test:self',
				pack: 'product',
				type: 'blocks',
				start: {
					artifactId: 'workbench:test:same',
					shapeId: 'shape:workbench-test-same',
				},
				end: {
					artifactId: 'workbench:test:same',
					shapeId: 'shape:workbench-test-same',
				},
				version: 1,
			})
		).toThrow(/cannot connect an artifact to itself/)

		expect(() =>
			parseWorkbenchRelation({
				schema: WORKBENCH_RELATION_SCHEMA,
				relationId: 'workbench:test:bad-shape',
				pack: 'product',
				type: 'informs',
				start: {
					artifactId: 'workbench:test:one',
					shapeId: 'not-a-shape',
				},
				end: {
					artifactId: 'workbench:test:two',
					shapeId: 'shape:workbench-test-two',
				},
				version: 1,
			})
		).toThrow(/shape ids/)
	})
})
