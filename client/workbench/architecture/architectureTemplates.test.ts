import { describe, expect, it } from 'vitest'
import {
	ARCHITECTURE_TEMPLATE_IDS,
	ARCHITECTURE_TEMPLATES,
	getArchitectureTemplate,
	WORKBENCH_ARTIFACT_SCHEMA,
} from './architectureTemplates'

describe('architecture templates', () => {
	it('exposes the three deterministic native architecture starters', () => {
		expect(ARCHITECTURE_TEMPLATE_IDS).toEqual([
			'system-context',
			'decision-graph',
			'change-radar',
		])

		for (const id of ARCHITECTURE_TEMPLATE_IDS) {
			const template = getArchitectureTemplate(id)
			expect(template).toBe(ARCHITECTURE_TEMPLATES[id])
			expect(structuredClone(template)).toEqual(template)
			expect(JSON.stringify(getArchitectureTemplate(id))).toBe(JSON.stringify(template))
		}
	})

	it('uses stable unique artifact ids and valid native relationship endpoints', () => {
		for (const template of Object.values(ARCHITECTURE_TEMPLATES)) {
			const nodeIds = new Set(template.nodes.map((node) => node.id))
			const allIds = [
				...template.nodes.map((node) => node.id),
				...template.relations.map((relation) => relation.id),
			]

			expect(nodeIds.size).toBe(template.nodes.length)
			expect(new Set(allIds).size).toBe(allIds.length)

			for (const node of template.nodes) {
				expect(node.meta.workbenchArtifact).toMatchObject({
					schema: WORKBENCH_ARTIFACT_SCHEMA,
					artifactId: node.id,
					pack: 'architecture',
					templateId: template.id,
					artifactType: 'node',
				})
				expect(node.x).toBeGreaterThanOrEqual(0)
				expect(node.y).toBeGreaterThanOrEqual(0)
				expect(node.x + node.w).toBeLessThanOrEqual(template.canvas.w)
				expect(node.y + node.h).toBeLessThanOrEqual(template.canvas.h)
				if ('containerId' in node && node.containerId) {
					expect(nodeIds.has(node.containerId)).toBe(true)
				}
			}

			for (const relation of template.relations) {
				expect(nodeIds.has(relation.from)).toBe(true)
				expect(nodeIds.has(relation.to)).toBe(true)
				expect(relation.meta.workbenchArtifact).toMatchObject({
					schema: WORKBENCH_ARTIFACT_SCHEMA,
					artifactId: relation.id,
					pack: 'architecture',
					templateId: template.id,
					artifactType: 'relation',
					role: 'relationship',
				})
			}
		}
	})

	it('gives each starter the semantic roles needed for its review loop', () => {
		const systemRoles = ARCHITECTURE_TEMPLATES['system-context'].nodes.map(
			(node) => node.meta.workbenchArtifact.role
		)
		expect(systemRoles).toEqual(
			expect.arrayContaining(['actor', 'boundary', 'system', 'external-system'])
		)

		const decisionNodes = ARCHITECTURE_TEMPLATES['decision-graph'].nodes
		expect(decisionNodes.map((node) => node.meta.workbenchArtifact.role)).toEqual(
			expect.arrayContaining(['decision', 'assumption', 'evidence', 'option'])
		)
		expect(
			decisionNodes.find((node) => node.meta.workbenchArtifact.role === 'decision')?.meta
				.workbenchArtifact.status
		).toBe('proposed')

		const radarNodes = ARCHITECTURE_TEMPLATES['change-radar'].nodes
		expect(
			radarNodes.filter((node) => node.meta.workbenchArtifact.role === 'radar-zone')
		).toHaveLength(3)
		expect(
			radarNodes
				.filter((node) => node.meta.workbenchArtifact.role === 'change')
				.map((node) => node.meta.workbenchArtifact.status)
		).toEqual(expect.arrayContaining(['in-progress', 'planned']))
	})

	it('contains no implicit Isoflow surface, project, view, bridge, or action contract', () => {
		const serialized = JSON.stringify(ARCHITECTURE_TEMPLATES)
		expect(serialized).not.toMatch(
			/isoflow|embedProvider|projectId|viewId|bridge|isoflowPatch|isoflowSearch/i
		)
	})
})
