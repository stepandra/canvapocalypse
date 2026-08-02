import { PageRecordType } from 'tldraw'
import { describe, expect, it } from 'vitest'
import { KanbanTracksProjectionSchema } from '../../shared/types/KanbanTracksProjection'
import {
	buildKanbanTracksRenderPlan,
	readKanbanTrackBinding,
} from './kanbanTracksCanvas'

const projection = KanbanTracksProjectionSchema.parse({
	schema: 'kanban-tracks-projection/v1',
	projectRef: 'project-a',
	revision: 7,
	generatedAt: 100,
	tracks: [
		{
			trackId: 'ml',
			name: 'ML / LLM',
			order: 0,
			archived: false,
			activeMilestoneId: 'ml-v1',
			counts: {
				backlog: 1,
				inProgress: 0,
				review: 0,
				accepted: 1,
			},
			progress: {
				acceptedWeight: 1,
				totalWeight: 4,
				percent: 25,
				basis: 'weighted',
			},
			milestones: [
				{
					milestoneId: 'ml-v1',
					title: 'Candidate v1',
					state: 'active',
					order: 0,
					scopeRevision: 3,
					counts: {
						backlog: 1,
						inProgress: 0,
						review: 0,
						accepted: 1,
					},
					progress: {
						acceptedWeight: 1,
						totalWeight: 4,
						percent: 25,
						basis: 'weighted',
					},
					tasks: [],
				},
			],
		},
		{
			trackId: 'backend',
			name: 'Backend',
			order: 1,
			archived: false,
			activeMilestoneId: 'backend-v1',
			counts: {
				backlog: 0,
				inProgress: 1,
				review: 0,
				accepted: 0,
			},
			progress: {
				acceptedWeight: 0,
				totalWeight: 1,
				percent: 0,
				basis: 'count',
			},
			milestones: [
				{
					milestoneId: 'backend-v1',
					title: 'Inference API',
					state: 'active',
					order: 0,
					scopeRevision: 2,
					counts: {
						backlog: 0,
						inProgress: 1,
						review: 0,
						accepted: 0,
					},
					progress: {
						acceptedWeight: 0,
						totalWeight: 1,
						percent: 0,
						basis: 'count',
					},
					tasks: [],
				},
			],
		},
	],
	unassigned: {
		counts: { backlog: 1, inProgress: 0, review: 0, accepted: 0 },
		tasks: [
			{
				taskId: 'triage',
				title: 'Triage',
				status: 'backlog',
				weight: 1,
				blockedByCount: 0,
			},
		],
	},
	crossTrackDependencies: [
		{
			dependentTaskId: 'ml-train',
			prerequisiteTaskId: 'backend-api',
			dependentTrackId: 'ml',
			prerequisiteTrackId: 'backend',
		},
	],
})

describe('Kanban Tracks canvas plan', () => {
	it('creates stable native lanes, milestones, unassigned scope, and bound blockers', () => {
		const first = buildKanbanTracksRenderPlan(
			projection,
			{ x: 800, y: 600 },
			PageRecordType.createId('page')
		)
		const second = buildKanbanTracksRenderPlan(
			projection,
			{ x: 800, y: 600 },
			PageRecordType.createId('page')
		)

		expect(second.shapeIds).toEqual(first.shapeIds)
		expect(new Set(first.shapeIds).size).toBe(first.shapeIds.length)
		expect(first.bindings).toHaveLength(2)
		expect(
			first.bindings
				.map((binding) => binding.props?.terminal)
				.filter(Boolean)
				.sort()
		).toEqual(['end', 'start'])
		expect(first.shapes.filter((shape) => shape.type === 'frame')).toHaveLength(
			3
		)
		expect(first.shapes.filter((shape) => shape.type === 'geo')).toHaveLength(
			2
		)
		const lane = first.shapes.find((shape) => shape.type === 'frame')
		expect(lane?.meta).toMatchObject({
			kanbanTrack: {
				schema: 'kanban-track-ref/v1',
				projectRef: 'project-a',
				snapshotRevision: '7',
				state: 'current',
			},
		})
	})

	it('does not place task cards on the zoomed-out projection', () => {
		const plan = buildKanbanTracksRenderPlan(
			projection,
			{ x: 800, y: 600 },
			PageRecordType.createId('page')
		)
		const serialized = JSON.stringify(plan.shapes)
		expect(serialized).not.toContain('ml-train')
		expect(serialized).not.toContain('backend-api')
	})

	it('rejects unrelated shape metadata as a provider binding', () => {
		expect(
			readKanbanTrackBinding({
				type: 'geo',
				meta: { kanbanTrack: { schema: 'other/v1' } },
			} as never)
		).toBeNull()
	})
})
