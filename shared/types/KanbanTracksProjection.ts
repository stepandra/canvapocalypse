import { z } from 'zod'

export const KANBAN_TRACKS_PROJECTION_SCHEMA =
	'kanban-tracks-projection/v1' as const

const KanbanTrackTaskCountsSchema = z
	.object({
		backlog: z.number().int().nonnegative(),
		inProgress: z.number().int().nonnegative(),
		review: z.number().int().nonnegative(),
		accepted: z.number().int().nonnegative(),
	})
	.strict()

const KanbanTrackProgressSchema = z
	.object({
		acceptedWeight: z.number().nonnegative(),
		totalWeight: z.number().nonnegative(),
		percent: z.number().min(0).max(100).nullable(),
		basis: z.enum(['weighted', 'count', 'scope_unset']),
	})
	.strict()

const KanbanTrackTaskRefSchema = z
	.object({
		taskId: z.string().min(1),
		title: z.string().min(1),
		status: z.enum(['backlog', 'in_progress', 'review', 'accepted']),
		weight: z.number().positive(),
		blockedByCount: z.number().int().nonnegative(),
	})
	.strict()

const KanbanMilestoneProjectionSchema = z
	.object({
		milestoneId: z.string().min(1),
		title: z.string().min(1),
		definitionOfDone: z.string().min(1).optional(),
		state: z.enum(['planned', 'active', 'accepted', 'archived']),
		order: z.number().int().nonnegative(),
		scopeRevision: z.number().int().nonnegative(),
		counts: KanbanTrackTaskCountsSchema,
		progress: KanbanTrackProgressSchema,
		tasks: z.array(KanbanTrackTaskRefSchema),
	})
	.strict()

const KanbanTrackProjectionSchema = z
	.object({
		trackId: z.string().min(1),
		name: z.string().min(1),
		description: z.string().min(1).optional(),
		order: z.number().int().nonnegative(),
		archived: z.boolean(),
		activeMilestoneId: z.string().min(1).nullable(),
		counts: KanbanTrackTaskCountsSchema,
		progress: KanbanTrackProgressSchema,
		milestones: z.array(KanbanMilestoneProjectionSchema),
	})
	.strict()

export const KanbanTracksProjectionSchema = z
	.object({
		schema: z.literal(KANBAN_TRACKS_PROJECTION_SCHEMA),
		projectRef: z.string().min(1),
		revision: z.number().int().nonnegative(),
		generatedAt: z.number().int().nonnegative(),
		tracks: z.array(KanbanTrackProjectionSchema),
		unassigned: z
			.object({
				counts: KanbanTrackTaskCountsSchema,
				tasks: z.array(KanbanTrackTaskRefSchema),
			})
			.strict(),
		crossTrackDependencies: z.array(
			z
				.object({
					dependentTaskId: z.string().min(1),
					prerequisiteTaskId: z.string().min(1),
					dependentTrackId: z.string().min(1),
					prerequisiteTrackId: z.string().min(1),
				})
				.strict()
		),
	})
	.strict()

export type KanbanTracksProjection = z.infer<
	typeof KanbanTracksProjectionSchema
>
export type KanbanTrackProjection = z.infer<
	typeof KanbanTrackProjectionSchema
>
export type KanbanMilestoneProjection = z.infer<
	typeof KanbanMilestoneProjectionSchema
>

export const KanbanTrackProjectsSchema = z
	.object({
		schema: z.literal('kanban-track-projects/v1'),
		currentProjectRef: z.string().nullable(),
		projects: z.array(
			z
				.object({
					projectRef: z.string().min(1),
					name: z.string().min(1),
					taskCounts: z
						.object({
							backlog: z.number().int().nonnegative(),
							in_progress: z.number().int().nonnegative(),
							review: z.number().int().nonnegative(),
							trash: z.number().int().nonnegative(),
						})
						.strict(),
				})
				.strict()
		),
	})
	.strict()

export type KanbanTrackProjects = z.infer<typeof KanbanTrackProjectsSchema>
