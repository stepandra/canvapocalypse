import type { Editor, TLShape } from 'tldraw'
import { describe, expect, it, vi } from 'vitest'
import { WorkbenchArtifactsPartDefinition } from '../../shared/schema/PromptPartDefinitions'
import type { AgentRequest } from '../../shared/types/AgentRequest'
import type { AgentHelpers } from '../AgentHelpers'
import type { TldrawAgent } from '../agent/TldrawAgent'
import {
	MAX_WORKBENCH_ARTIFACT_RECORDS,
	summarizeWorkbenchMeta,
	WorkbenchArtifactsPartUtil,
} from './WorkbenchArtifactsPartUtil'

function request(
	routing: AgentRequest['routing'] | null = {
		enabled: true,
		route: 'canvas-edit',
	}
): AgentRequest {
	return {
		agentMessages: ['Inspect the selected workbench artifacts'],
		userMessages: ['Inspect the selected workbench artifacts'],
		bounds: { x: 0, y: 0, w: 100, h: 100 },
		data: [],
		source: 'user',
		contextItems: [],
		...(routing ? { routing } : {}),
	}
}

function shape(id: string, type: string, meta: Record<string, unknown>): TLShape {
	return { id, type, meta } as unknown as TLShape
}

function harness(
	selected: TLShape[],
	pageShapes: TLShape[],
	boundsById: Map<string, { x: number; y: number; w: number; h: number }>
) {
	const editor = {
		getSelectedShapes: vi.fn(() => selected),
		getCurrentPageShapesSorted: vi.fn(() => pageShapes),
		getShapeMaskedPageBounds: vi.fn((candidate: TLShape) => boundsById.get(candidate.id) ?? null),
		getShapePageBounds: vi.fn((candidate: TLShape) => boundsById.get(candidate.id) ?? null),
	} as unknown as Editor
	const agent = { editor } as unknown as TldrawAgent
	const helpers = {
		applyOffsetToBox: (bounds: { x: number; y: number; w: number; h: number }) => ({
			...bounds,
			x: bounds.x + 10.4,
			y: bounds.y - 5.4,
		}),
	} as unknown as AgentHelpers
	return { editor, helpers, util: new WorkbenchArtifactsPartUtil(agent) }
}

describe('WorkbenchArtifactsPartUtil', () => {
	it('emits deterministic allowlisted semantics for selected native shapes only', () => {
		const canonical = shape('shape:b-canonical', 'geo', {
			workbench: {
				conversation: {
					branchId: 'branch:alternative-b',
					branchName: 'Alternative B',
					parentBranchId: 'branch:main',
					parentTurnId: 'turn:2',
					privateTranscript: 'secret-conversation-transcript',
				},
				artifact: {
					schema: 'workbench-artifact/v1',
					artifactId: 'architecture:core',
					pack: 'architecture',
					kind: 'system',
					title: 'Core system',
					summary: 'Bounded semantic summary',
					status: 'active',
					owner: {
						id: 'team:core',
						type: 'team',
						label: 'Core team',
						email: 'hidden',
					},
					tags: ['system', 'critical'],
					refs: [
						{
							target: 'docs/private-architecture.md',
							body: 'full linked document',
						},
					],
					apiKey: 'secret-canonical-key',
				},
				credentials: { token: 'secret-wrapper-token' },
			},
		})
		const transitional = shape('shape:a-transitional', 'note', {
			workbenchArtifact: {
				schema: 'canvapocalypse-workbench-artifact/v1',
				artifactId: 'decision:adopt',
				pack: 'architecture',
				templateId: 'decision-graph',
				artifactType: 'node',
				role: 'decision',
				status: 'accepted',
				documentRef: 'docs/adr/full-body.md',
				password: 'secret-transition-password',
			},
		})
		const relation = shape('shape:c-relation', 'arrow', {
			workbenchRelation: {
				schema: 'workbench-relation/v1',
				relationId: 'architecture:depends',
				pack: 'architecture',
				type: 'depends-on',
				start: {
					artifactId: 'architecture:one',
					shapeId: 'shape:one',
					extra: 'omit',
				},
				end: { artifactId: 'architecture:two', shapeId: 'shape:two' },
				label: 'depends on',
				credential: 'secret-relation-credential',
			},
		})
		const ordinary = shape('shape:d-ordinary', 'geo', {
			arbitrary: { huge: 'canvas dump' },
		})
		const isoflow = shape('shape:e-isoflow', 'embed', {
			embedProvider: {
				schema: 'canvapocalypse-embed/v1',
				provider: 'autorecruit_isoflow',
				baseUrl: 'http://127.0.0.1:4174',
				projectId: 'secret-project',
				viewId: 'secret-view',
			},
			workbenchArtifact: {
				artifactId: 'must-not-cross',
				pack: 'architecture',
			},
		})
		const unselected = shape('shape:f-unselected', 'geo', {
			workbenchArtifact: { artifactId: 'not-selected', pack: 'product' },
		})
		const selected = [relation, isoflow, canonical, ordinary, transitional]
		const bounds = new Map(
			[...selected, unselected].map((candidate, index) => [
				candidate.id,
				{ x: index + 0.49, y: index + 0.51, w: 50.49, h: 30.51 },
			])
		)
		const { util, helpers } = harness(selected, [...selected, unselected], bounds)

		const part = util.getPart(request(), helpers)

		expect(part.boundary).toBe('selection')
		expect(part.truncated).toBe(false)
		expect(part.records.map(({ shapeId }) => shapeId)).toEqual([
			'shape:a-transitional',
			'shape:b-canonical',
			'shape:c-relation',
		])
		expect(part.records[0]).toMatchObject({
			shapeType: 'note',
			artifact: {
				artifactId: 'decision:adopt',
				pack: 'architecture',
				templateId: 'decision-graph',
				artifactType: 'node',
				role: 'decision',
				status: 'accepted',
			},
		})
		expect(part.records[1]).toMatchObject({
			bounds: { x: 13, y: -3, w: 50, h: 31 },
			conversation: {
				branchId: 'branch:alternative-b',
				branchName: 'Alternative B',
				parentBranchId: 'branch:main',
				parentTurnId: 'turn:2',
			},
			artifact: {
				artifactId: 'architecture:core',
				title: 'Core system',
				owner: { id: 'team:core', type: 'team', label: 'Core team' },
			},
		})
		expect(part.records[2].relation).toEqual({
			schema: 'workbench-relation/v1',
			relationId: 'architecture:depends',
			pack: 'architecture',
			type: 'depends-on',
			start: { artifactId: 'architecture:one', shapeId: 'shape:one' },
			end: { artifactId: 'architecture:two', shapeId: 'shape:two' },
			label: 'depends on',
		})
		const serialized = JSON.stringify(part)
		expect(serialized).not.toContain('secret-')
		expect(serialized).not.toContain('full linked document')
		expect(serialized).not.toContain('docs/')
		expect(serialized).not.toContain('canvas dump')
		expect(serialized).not.toContain('127.0.0.1')
	})

	it('uses only intersecting request bounds and caps records deterministically', () => {
		const inside = Array.from({ length: MAX_WORKBENCH_ARTIFACT_RECORDS + 1 }, (_, index) =>
			shape(`shape:item-${String(index).padStart(2, '0')}`, 'geo', {
				workbench: {
					schema: 'workbench-artifact/v1',
					artifactId: `product:item:${index}`,
					pack: 'product',
					kind: 'initiative',
					title: `Item ${index}`,
				},
			})
		)
		const partial = shape('shape:item-partial', 'geo', {
			workbenchArtifact: {
				artifactId: 'product:partial',
				pack: 'product',
				role: 'milestone',
			},
		})
		const outside = shape('shape:item-outside', 'geo', {
			workbenchArtifact: { artifactId: 'product:outside', pack: 'product' },
		})
		const all = [outside, partial, ...inside].reverse()
		const bounds = new Map<string, { x: number; y: number; w: number; h: number }>()
		for (const candidate of inside) bounds.set(candidate.id, { x: 5, y: 5, w: 10, h: 10 })
		bounds.set(partial.id, { x: 99, y: 40, w: 10, h: 10 })
		bounds.set(outside.id, { x: 101, y: 40, w: 10, h: 10 })
		const { util, helpers } = harness([], all, bounds)

		const part = util.getPart(request({ enabled: true, route: 'canvas-edit', includeBounds: true }), helpers)

		expect(part.boundary).toBe('bounds')
		expect(part.records).toHaveLength(MAX_WORKBENCH_ARTIFACT_RECORDS)
		expect(part.truncated).toBe(true)
		expect(part.records.map(({ shapeId }) => shapeId)).toEqual([...part.records.map(({ shapeId }) => shapeId)].sort())
		expect(part.records.some(({ shapeId }) => shapeId === outside.id)).toBe(false)
	})

	it('keeps the legacy working-mode prompt unchanged when routing is inactive', () => {
		const selected = shape('shape:selected', 'geo', {
			workbenchArtifact: {
				artifactId: 'architecture:selected',
				pack: 'architecture',
			},
		})
		const bounds = new Map([[selected.id, { x: 0, y: 0, w: 20, h: 20 }]])
		const { util, helpers } = harness([selected], [selected], bounds)

		expect(util.getPart(request(null), helpers)).toEqual({
			type: 'workbenchArtifacts',
			boundary: 'selection',
			records: [],
			truncated: false,
		})
	})
})

describe('workbench semantic prompt contract', () => {
	it('recognizes direct canonical meta.workbench relation data', () => {
		expect(
			summarizeWorkbenchMeta({
				workbench: {
					schema: 'workbench-relation/v1',
					relationId: 'ml:validates',
					pack: 'ml',
					type: 'validates',
					start: { artifactId: 'ml:model', shapeId: 'shape:model' },
					end: { artifactId: 'ml:eval', shapeId: 'shape:eval' },
				},
			})
		).toEqual({
			relation: {
				schema: 'workbench-relation/v1',
				relationId: 'ml:validates',
				pack: 'ml',
				type: 'validates',
				start: { artifactId: 'ml:model', shapeId: 'shape:model' },
				end: { artifactId: 'ml:eval', shapeId: 'shape:eval' },
			},
		})
	})

	it('builds model content from the compact records only', () => {
		const content = WorkbenchArtifactsPartDefinition.buildContent?.({
			type: 'workbenchArtifacts',
			boundary: 'selection',
			records: [
				{
					shapeId: 'shape:decision',
					shapeType: 'geo',
					bounds: { x: 1, y: 2, w: 100, h: 80 },
					artifact: {
						artifactId: 'architecture:decision',
						pack: 'architecture',
						kind: 'decision',
						title: 'Adopt bounded context',
					},
				},
			],
			truncated: false,
		})

		expect(content).toHaveLength(2)
		expect(content?.[0]).toContain('native tldraw')
		expect(content?.[0]).toContain('Isoflow embed data')
		expect(content?.[1]).toContain('architecture:decision')
	})
})
