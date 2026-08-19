import type { BoxModel, Editor, TLShape } from 'tldraw'
import type {
	WorkbenchArtifactSummary,
	WorkbenchArtifactsPart,
	WorkbenchConversationSummary,
	WorkbenchRelationSummary,
} from '../../shared/schema/PromptPartDefinitions'
import type { AgentRequest } from '../../shared/types/AgentRequest'
import type { AgentHelpers } from '../AgentHelpers'
import { isIsoflowEmbedShape } from '../isoflow/isoflowProvider'
import { PromptPartUtil, registerPromptPartUtil } from './PromptPartUtil'

export const MAX_WORKBENCH_ARTIFACT_RECORDS = 40

type UnknownRecord = Record<string, unknown>

export const WorkbenchArtifactsPartUtil = registerPromptPartUtil(
	class WorkbenchArtifactsPartUtil extends PromptPartUtil<WorkbenchArtifactsPart> {
		static override type = 'workbenchArtifacts' as const

		override getPart(request: AgentRequest, helpers: AgentHelpers): WorkbenchArtifactsPart {
			const boundary = request.routing?.includeBounds ? 'bounds' : 'selection'

			// This part is part of the routed companion contract. Keeping it empty
			// for legacy requests preserves the pre-routing working-mode prompt.
			if (!request.routing?.enabled) {
				return {
					type: 'workbenchArtifacts',
					boundary,
					records: [],
					truncated: false,
				}
			}

			const sourceShapes =
				boundary === 'bounds'
					? this.editor.getCurrentPageShapesSorted().filter((shape) => {
							const bounds = getPageBounds(this.editor, shape)
							return bounds ? boxesIntersect(bounds, request.bounds) : false
						})
					: this.editor.getSelectedShapes()

			const semanticShapes = sourceShapes
				.filter((shape) => !isIsoflowEmbedShape(shape))
				.flatMap((shape) => {
					const semantic = summarizeWorkbenchMeta(shape.meta)
					const pageBounds = getPageBounds(this.editor, shape)
					return semantic && pageBounds ? [{ shape, semantic, pageBounds }] : []
				})
				.sort((a, b) => (a.shape.id < b.shape.id ? -1 : a.shape.id > b.shape.id ? 1 : 0))

			const records = semanticShapes.slice(0, MAX_WORKBENCH_ARTIFACT_RECORDS).map(({ shape, semantic, pageBounds }) => {
				const offsetBounds = helpers.applyOffsetToBox(toBoxModel(pageBounds))
				return {
					shapeId: shape.id,
					shapeType: shape.type,
					bounds: roundBox(offsetBounds),
					...semantic,
				}
			})

			return {
				type: 'workbenchArtifacts',
				boundary,
				records,
				truncated: semanticShapes.length > MAX_WORKBENCH_ARTIFACT_RECORDS,
			}
		}
	}
)

/**
 * Read only the stable semantic allowlist. No arbitrary shape metadata, linked
 * document bodies, provider payloads, or credential fields cross this seam.
 */
export function summarizeWorkbenchMeta(value: unknown): {
	artifact?: WorkbenchArtifactSummary
	relation?: WorkbenchRelationSummary
	conversation?: WorkbenchConversationSummary
} | null {
	const meta = asRecord(value)
	if (!meta) return null

	const workbench = asRecord(meta.workbench)
	const artifactCandidates = [
		asRecord(workbench?.artifact),
		asRecord(workbench?.workbenchArtifact),
		isArtifactLike(workbench) ? workbench : null,
		asRecord(meta.workbenchArtifact),
	]
	const relationCandidates = [
		asRecord(workbench?.relation),
		asRecord(workbench?.workbenchRelation),
		isRelationLike(workbench) ? workbench : null,
		asRecord(meta.workbenchRelation),
	]

	let artifact: WorkbenchArtifactSummary | undefined
	let relation: WorkbenchRelationSummary | undefined
	const conversation = compactConversation(workbench?.conversation)

	for (const candidate of artifactCandidates) {
		if (!candidate) continue
		if (candidate.artifactType === 'relation') {
			relation ??= compactTransitionalRelation(candidate)
			continue
		}
		artifact ??= compactArtifact(candidate)
		if (artifact) break
	}
	for (const candidate of relationCandidates) {
		if (!candidate) continue
		relation ??= compactRelation(candidate)
		if (relation) break
	}

	return artifact || relation || conversation
		? {
				...(artifact ? { artifact } : {}),
				...(relation ? { relation } : {}),
				...(conversation ? { conversation } : {}),
			}
		: null
}

function compactConversation(value: unknown): WorkbenchConversationSummary | undefined {
	const source = asRecord(value)
	if (!source) return undefined
	const conversation: WorkbenchConversationSummary = {}
	assignString(conversation, 'branchId', source.branchId, 180)
	assignString(conversation, 'branchName', source.branchName, 80)
	assignString(conversation, 'parentBranchId', source.parentBranchId, 180)
	assignString(conversation, 'parentTurnId', source.parentTurnId, 180)
	assignString(conversation, 'comparedBranchId', source.comparedBranchId, 180)
	assignString(conversation, 'comparedBranchName', source.comparedBranchName, 80)
	return Object.keys(conversation).length > 0 ? conversation : undefined
}

function compactArtifact(value: UnknownRecord): WorkbenchArtifactSummary | undefined {
	if (!isArtifactLike(value)) return undefined

	const artifact: WorkbenchArtifactSummary = {}
	assignString(artifact, 'schema', value.schema, 80)
	assignString(artifact, 'artifactId', value.artifactId, 180)
	assignString(artifact, 'pack', value.pack, 32)
	assignString(artifact, 'kind', value.kind, 64)
	assignString(artifact, 'title', value.title, 240)
	assignString(artifact, 'summary', value.summary, 480)
	assignString(artifact, 'status', value.status, 48)
	assignString(artifact, 'startAt', value.startAt, 10)
	assignString(artifact, 'dueAt', value.dueAt, 10)
	assignString(artifact, 'completedAt', value.completedAt, 10)
	assignString(artifact, 'templateId', value.templateId, 96)
	assignString(artifact, 'artifactType', value.artifactType, 32)
	assignString(artifact, 'role', value.role, 64)
	assignString(artifact, 'relation', value.relation, 64)

	const owner = compactOwner(value.owner)
	if (owner) artifact.owner = owner

	if (Array.isArray(value.tags)) {
		const tags = value.tags
			.filter((tag): tag is string => typeof tag === 'string')
			.map((tag) => compactString(tag, 48))
			.filter((tag): tag is string => Boolean(tag))
			.slice(0, 8)
		if (tags.length > 0) artifact.tags = tags
	}

	return Object.keys(artifact).length > 0 ? artifact : undefined
}

function compactRelation(value: UnknownRecord): WorkbenchRelationSummary | undefined {
	if (!isRelationLike(value)) return undefined

	const relation: WorkbenchRelationSummary = {}
	assignString(relation, 'schema', value.schema, 80)
	assignString(relation, 'relationId', value.relationId, 180)
	assignString(relation, 'pack', value.pack, 32)
	assignString(relation, 'type', value.type, 64)
	assignString(relation, 'label', value.label, 160)

	const start = compactRelationBinding(value.start)
	const end = compactRelationBinding(value.end)
	if (start) relation.start = start
	if (end) relation.end = end

	return Object.keys(relation).length > 0 ? relation : undefined
}

function compactTransitionalRelation(value: UnknownRecord): WorkbenchRelationSummary | undefined {
	const relation: WorkbenchRelationSummary = {}
	assignString(relation, 'schema', value.schema, 80)
	assignString(relation, 'relationId', value.artifactId, 180)
	assignString(relation, 'pack', value.pack, 32)
	assignString(relation, 'type', value.relation, 64)
	assignString(relation, 'label', value.title, 160)
	return Object.keys(relation).length > 0 ? relation : undefined
}

function compactOwner(value: unknown): WorkbenchArtifactSummary['owner'] | undefined {
	const source = asRecord(value)
	if (!source) return undefined
	const owner: NonNullable<WorkbenchArtifactSummary['owner']> = {}
	assignString(owner, 'id', source.id, 180)
	assignString(owner, 'type', source.type, 32)
	assignString(owner, 'label', source.label, 120)
	return Object.keys(owner).length > 0 ? owner : undefined
}

function compactRelationBinding(value: unknown): WorkbenchRelationSummary['start'] | undefined {
	const source = asRecord(value)
	if (!source) return undefined
	const binding: NonNullable<WorkbenchRelationSummary['start']> = {}
	assignString(binding, 'artifactId', source.artifactId, 180)
	assignString(binding, 'shapeId', source.shapeId, 220)
	return Object.keys(binding).length > 0 ? binding : undefined
}

function isArtifactLike(value: UnknownRecord | null): value is UnknownRecord {
	if (!value) return false
	return (
		typeof value.artifactId === 'string' ||
		(typeof value.schema === 'string' && value.schema.toLowerCase().includes('artifact'))
	)
}

function isRelationLike(value: UnknownRecord | null): value is UnknownRecord {
	if (!value) return false
	return (
		typeof value.relationId === 'string' ||
		(typeof value.schema === 'string' && value.schema.toLowerCase().includes('relation'))
	)
}

function assignString<T extends object, K extends keyof T>(target: T, key: K, value: unknown, maxLength: number) {
	const compact = compactString(value, maxLength)
	if (compact) target[key] = compact as T[K]
}

function compactString(value: unknown, maxLength: number): string | undefined {
	if (typeof value !== 'string') return undefined
	const trimmed = value.trim()
	if (!trimmed) return undefined
	return trimmed.slice(0, maxLength)
}

function asRecord(value: unknown): UnknownRecord | null {
	return value && typeof value === 'object' && !Array.isArray(value) ? (value as UnknownRecord) : null
}

function getPageBounds(editor: Editor, shape: TLShape): BoxModel | null {
	return editor.getShapeMaskedPageBounds(shape) ?? editor.getShapePageBounds(shape) ?? null
}

function toBoxModel(bounds: BoxModel): BoxModel {
	return { x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h }
}

function roundBox(bounds: BoxModel): BoxModel {
	return {
		x: Math.round(bounds.x),
		y: Math.round(bounds.y),
		w: Math.round(bounds.w),
		h: Math.round(bounds.h),
	}
}

function boxesIntersect(a: BoxModel, b: BoxModel): boolean {
	const aMinX = Math.min(a.x, a.x + a.w)
	const aMaxX = Math.max(a.x, a.x + a.w)
	const aMinY = Math.min(a.y, a.y + a.h)
	const aMaxY = Math.max(a.y, a.y + a.h)
	const bMinX = Math.min(b.x, b.x + b.w)
	const bMaxX = Math.max(b.x, b.x + b.w)
	const bMinY = Math.min(b.y, b.y + b.h)
	const bMaxY = Math.max(b.y, b.y + b.h)
	return aMinX <= bMaxX && aMaxX >= bMinX && aMinY <= bMaxY && aMaxY >= bMinY
}
