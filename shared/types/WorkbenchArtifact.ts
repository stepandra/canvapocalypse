import z from 'zod'

export const WORKBENCH_ARTIFACT_SCHEMA = 'workbench-artifact/v1' as const
export const WORKBENCH_RELATION_SCHEMA = 'workbench-relation/v1' as const
export const WORKBENCH_SCHEMA_VERSION = 1 as const

export const WORKBENCH_PACKS = ['architecture', 'ml', 'uiux', 'product'] as const
export const WorkbenchPackSchema = z.enum(WORKBENCH_PACKS)
export type WorkbenchPack = z.infer<typeof WorkbenchPackSchema>

export const ARCHITECTURE_ARTIFACT_KINDS = [
	'system',
	'service',
	'component',
	'interface',
	'actor',
	'data-store',
	'boundary',
	'decision',
	'assumption',
	'risk',
	'change',
] as const

export const ML_ARTIFACT_KINDS = [
	'dataset',
	'model',
	'experiment',
	'evaluation',
	'pipeline',
	'job',
	'prompt',
	'decision',
	'assumption',
	'risk',
] as const

export const UIUX_ARTIFACT_KINDS = [
	'screen',
	'wireframe',
	'component',
	'user-flow',
	'persona',
	'journey-step',
	'decision',
	'assumption',
	'risk',
] as const

export const PRODUCT_ARTIFACT_KINDS = [
	'timeline-lane',
	'initiative',
	'milestone',
	'opportunity',
	'outcome',
	'release',
	'decision',
	'assumption',
	'risk',
] as const

export const WorkbenchArtifactKindSchema = z.enum([
	...ARCHITECTURE_ARTIFACT_KINDS,
	...ML_ARTIFACT_KINDS,
	...UIUX_ARTIFACT_KINDS,
	...PRODUCT_ARTIFACT_KINDS,
])
export type WorkbenchArtifactKind = z.infer<typeof WorkbenchArtifactKindSchema>

export const WORKBENCH_ARTIFACT_STATUSES = [
	'draft',
	'proposed',
	'planned',
	'active',
	'blocked',
	'ready',
	'approved',
	'accepted',
	'rejected',
	'done',
	'cancelled',
	'superseded',
] as const
export const WorkbenchArtifactStatusSchema = z.enum(WORKBENCH_ARTIFACT_STATUSES)
export type WorkbenchArtifactStatus = z.infer<typeof WorkbenchArtifactStatusSchema>

/**
 * Opaque, stable ids are deliberately narrower than labels and document refs.
 * They are suitable for metadata identity, but are not filesystem paths.
 */
export const WorkbenchStableIdSchema = z
	.string()
	.trim()
	.min(3)
	.max(180)
	.regex(
		/^[a-z0-9](?:[a-z0-9._:/-]*[a-z0-9])?$/,
		'Stable ids must use lowercase letters, digits, ".", "_", ":", "/", or "-"'
	)
export type WorkbenchStableId = z.infer<typeof WorkbenchStableIdSchema>

export const WorkbenchShapeIdSchema = z
	.string()
	.trim()
	.max(220)
	.regex(
		/^shape:[A-Za-z0-9_-][A-Za-z0-9._:/-]*$/,
		'Workbench shape ids must be valid tldraw shape ids'
	)
export type WorkbenchShapeId = z.infer<typeof WorkbenchShapeIdSchema>

function isCalendarDate(value: string): boolean {
	const [year, month, day] = value.split('-').map(Number)
	const candidate = new Date(Date.UTC(year, month - 1, day))
	return (
		candidate.getUTCFullYear() === year &&
		candidate.getUTCMonth() === month - 1 &&
		candidate.getUTCDate() === day
	)
}

export const WorkbenchDateSchema = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/, 'Dates must use YYYY-MM-DD')
	.refine(isCalendarDate, 'Date must be a real calendar date')
export type WorkbenchDate = z.infer<typeof WorkbenchDateSchema>

export const WorkbenchOwnerSchema = z
	.object({
		id: WorkbenchStableIdSchema,
		type: z.enum(['person', 'team', 'agent']),
		label: z.string().trim().min(1).max(120).optional(),
	})
	.strict()
export type WorkbenchOwner = z.infer<typeof WorkbenchOwnerSchema>

export const WORKBENCH_REFERENCE_KINDS = [
	'artifact',
	'decision',
	'document',
	'source',
	'external',
	'run',
	'receipt',
] as const
export const WorkbenchReferenceSchema = z
	.object({
		refId: WorkbenchStableIdSchema,
		kind: z.enum(WORKBENCH_REFERENCE_KINDS),
		target: z.string().trim().min(1).max(2048),
		label: z.string().trim().min(1).max(160).optional(),
	})
	.strict()
export type WorkbenchReference = z.infer<typeof WorkbenchReferenceSchema>

const artifactCommonShape = {
	schema: z.literal(WORKBENCH_ARTIFACT_SCHEMA),
	artifactId: WorkbenchStableIdSchema,
	title: z.string().trim().min(1).max(240),
	summary: z.string().trim().min(1).max(2_000).optional(),
	status: WorkbenchArtifactStatusSchema,
	owner: WorkbenchOwnerSchema.optional(),
	startAt: WorkbenchDateSchema.optional(),
	dueAt: WorkbenchDateSchema.optional(),
	completedAt: WorkbenchDateSchema.optional(),
	refs: z.array(WorkbenchReferenceSchema).max(24).default([]),
	tags: z.array(z.string().trim().min(1).max(48)).max(16).default([]),
	version: z.literal(WORKBENCH_SCHEMA_VERSION),
} as const

const WorkbenchArtifactBaseSchema = z.discriminatedUnion('pack', [
	z
		.object({
			...artifactCommonShape,
			pack: z.literal('architecture'),
			kind: z.enum(ARCHITECTURE_ARTIFACT_KINDS),
		})
		.strict(),
	z
		.object({
			...artifactCommonShape,
			pack: z.literal('ml'),
			kind: z.enum(ML_ARTIFACT_KINDS),
		})
		.strict(),
	z
		.object({
			...artifactCommonShape,
			pack: z.literal('uiux'),
			kind: z.enum(UIUX_ARTIFACT_KINDS),
		})
		.strict(),
	z
		.object({
			...artifactCommonShape,
			pack: z.literal('product'),
			kind: z.enum(PRODUCT_ARTIFACT_KINDS),
		})
		.strict(),
])

export const WorkbenchArtifactSchema = WorkbenchArtifactBaseSchema.superRefine((artifact, ctx) => {
	if (artifact.startAt && artifact.dueAt && artifact.startAt > artifact.dueAt) {
		ctx.addIssue({
			code: 'custom',
			path: ['dueAt'],
			message: 'dueAt cannot be earlier than startAt',
		})
	}
	if (artifact.startAt && artifact.completedAt && artifact.startAt > artifact.completedAt) {
		ctx.addIssue({
			code: 'custom',
			path: ['completedAt'],
			message: 'completedAt cannot be earlier than startAt',
		})
	}

	const refIds = new Set<string>()
	for (const [index, reference] of artifact.refs.entries()) {
		if (refIds.has(reference.refId)) {
			ctx.addIssue({
				code: 'custom',
				path: ['refs', index, 'refId'],
				message: `Duplicate reference id ${reference.refId}`,
			})
		}
		refIds.add(reference.refId)
	}
})
export type WorkbenchArtifact = z.infer<typeof WorkbenchArtifactSchema>

export const WORKBENCH_RELATION_TYPES = [
	'depends-on',
	'blocks',
	'informs',
	'decided-by',
	'milestone-of',
	'contains',
	'implements',
	'validates',
] as const
export const WorkbenchRelationTypeSchema = z.enum(WORKBENCH_RELATION_TYPES)
export type WorkbenchRelationType = z.infer<typeof WorkbenchRelationTypeSchema>

export const WorkbenchRelationBindingSchema = z
	.object({
		artifactId: WorkbenchStableIdSchema,
		shapeId: WorkbenchShapeIdSchema,
	})
	.strict()
export type WorkbenchRelationBinding = z.infer<typeof WorkbenchRelationBindingSchema>

/**
 * Metadata stored on a meaningful arrow. The real tldraw binding records remain
 * authoritative for geometry; these endpoints make the semantic relationship
 * compactly inspectable and transactionally verifiable.
 */
export const WorkbenchRelationSchema = z
	.object({
		schema: z.literal(WORKBENCH_RELATION_SCHEMA),
		relationId: WorkbenchStableIdSchema,
		pack: WorkbenchPackSchema,
		type: WorkbenchRelationTypeSchema,
		start: WorkbenchRelationBindingSchema,
		end: WorkbenchRelationBindingSchema,
		label: z.string().trim().min(1).max(160).optional(),
		version: z.literal(WORKBENCH_SCHEMA_VERSION),
	})
	.strict()
	.superRefine((relation, ctx) => {
		if (relation.start.artifactId === relation.end.artifactId) {
			ctx.addIssue({
				code: 'custom',
				path: ['end', 'artifactId'],
				message: 'Workbench relations cannot connect an artifact to itself',
			})
		}
		if (relation.start.shapeId === relation.end.shapeId) {
			ctx.addIssue({
				code: 'custom',
				path: ['end', 'shapeId'],
				message: 'Workbench relation bindings must target two different shapes',
			})
		}
	})
export type WorkbenchRelation = z.infer<typeof WorkbenchRelationSchema>

export function parseWorkbenchArtifact(value: unknown): WorkbenchArtifact {
	return WorkbenchArtifactSchema.parse(value)
}

export function parseWorkbenchRelation(value: unknown): WorkbenchRelation {
	return WorkbenchRelationSchema.parse(value)
}

export function isWorkbenchArtifact(value: unknown): value is WorkbenchArtifact {
	return WorkbenchArtifactSchema.safeParse(value).success
}

export function isWorkbenchRelation(value: unknown): value is WorkbenchRelation {
	return WorkbenchRelationSchema.safeParse(value).success
}
