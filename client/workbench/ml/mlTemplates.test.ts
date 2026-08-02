import { describe, expect, it } from 'vitest'
import {
	parseWorkbenchArtifact,
	parseWorkbenchRelation,
	WORKBENCH_ARTIFACT_SCHEMA,
	WORKBENCH_RELATION_SCHEMA,
} from '../../../shared/types/WorkbenchArtifact'
import {
	getMlWorkbenchTemplate,
	ML_TEMPLATE_IDS,
	ML_WORKBENCH_TEMPLATES,
	ML_WORKBENCH_TEMPLATE_SCHEMA,
	validateMlWorkbenchTemplate,
} from './mlTemplates'

describe('native ML / LLM workbench templates', () => {
	it('exposes exactly three deterministic starter blueprints', () => {
		expect(ML_TEMPLATE_IDS).toEqual([
			'experiment-loop',
			'evaluation-pipeline',
			'model-delivery-map',
		])
		expect(Object.keys(ML_WORKBENCH_TEMPLATES)).toEqual(ML_TEMPLATE_IDS)

		for (const templateId of ML_TEMPLATE_IDS) {
			const template = getMlWorkbenchTemplate(templateId)
			expect(template).toBe(ML_WORKBENCH_TEMPLATES[templateId])
			expect(template.schema).toBe(ML_WORKBENCH_TEMPLATE_SCHEMA)
			expect(structuredClone(template)).toEqual(template)
			expect(JSON.stringify(getMlWorkbenchTemplate(templateId))).toBe(JSON.stringify(template))
		}
	})

	it('uses schema-valid ML artifacts with stable ids, roles, kinds, and statuses', () => {
		for (const template of Object.values(ML_WORKBENCH_TEMPLATES)) {
			expect(validateMlWorkbenchTemplate(template)).toEqual([])

			for (const node of template.nodes) {
				const artifact = parseWorkbenchArtifact(node.meta.workbenchArtifact)
				expect(artifact).toMatchObject({
					schema: WORKBENCH_ARTIFACT_SCHEMA,
					pack: 'ml',
				})
				expect(node.meta.templateId).toBe(template.id)
				expect(node.shapeId).toMatch(/^shape:ml-/)
				expect(node.role.length).toBeGreaterThan(0)
				expect(artifact.kind.length).toBeGreaterThan(0)
				expect(artifact.status.length).toBeGreaterThan(0)
			}
		}
	})

	it('prepares every semantic relation for a real bound arrow', () => {
		for (const template of Object.values(ML_WORKBENCH_TEMPLATES)) {
			const nodesByArtifactId = new Map(
				template.nodes.map((node) => [node.meta.workbenchArtifact.artifactId, node])
			)

			for (const arrow of template.relations) {
				const relation = parseWorkbenchRelation(arrow.meta.workbenchRelation)
				expect(relation.schema).toBe(WORKBENCH_RELATION_SCHEMA)
				expect(relation.pack).toBe('ml')

				const startNode = nodesByArtifactId.get(relation.start.artifactId)
				const endNode = nodesByArtifactId.get(relation.end.artifactId)
				expect(startNode?.shapeId).toBe(relation.start.shapeId)
				expect(endNode?.shapeId).toBe(relation.end.shapeId)
				expect(startNode).not.toBe(endNode)
				expect(arrow.visual.arrowheadEnd).toBe('arrow')
			}
		}
	})

	it('keeps each layout legible and semantically distinct', () => {
		const experiment = ML_WORKBENCH_TEMPLATES['experiment-loop']
		expect(experiment.nodes.map((node) => node.role)).toEqual(
			expect.arrayContaining([
				'research-question',
				'dataset',
				'experiment',
				'training-job',
				'candidate-model',
				'evaluation',
				'decision',
			])
		)
		expect(
			experiment.relations.some(
				(relation) =>
					relation.meta.workbenchRelation.end.artifactId ===
					'ml:experiment-loop:artifact:experiment-plan'
			)
		).toBe(true)

		const evaluation = ML_WORKBENCH_TEMPLATES['evaluation-pipeline']
		expect(evaluation.nodes.filter((node) => node.role === 'dataset')).toHaveLength(1)
		expect(evaluation.nodes.some((node) => node.role === 'scorecard')).toBe(true)
		expect(evaluation.nodes.some((node) => node.role === 'risk')).toBe(true)

		const delivery = ML_WORKBENCH_TEMPLATES['model-delivery-map']
		expect(delivery.nodes.map((node) => node.role)).toEqual(
			expect.arrayContaining([
				'candidate-model',
				'evaluation',
				'pipeline',
				'package-job',
				'serving-model',
				'data-contract',
				'risk',
			])
		)
		expect(
			delivery.nodes.find((node) => node.role === 'serving-model')?.meta.workbenchArtifact
				.status
		).toBe('planned')
	})

	it('uses only native editable primitives and no Isoflow, image, embed, or vendor surface', () => {
		for (const template of Object.values(ML_WORKBENCH_TEMPLATES)) {
			for (const node of template.nodes) {
				expect(['geo', 'note', 'text']).toContain(node.visual.primitive)
			}
		}

		const serialized = JSON.stringify(ML_WORKBENCH_TEMPLATES)
		expect(serialized).not.toMatch(
			/isoflow|embedProvider|projectId|viewId|bridge|image|assetUrl|hugging ?face|openai|anthropic|google|kubernetes|docker/i
		)
	})
})
