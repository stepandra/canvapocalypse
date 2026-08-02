import { Editor, TLEmbedShape } from 'tldraw'
import { IsoflowCreateViewAction, IsoflowPatchAction } from '../../shared/schema/AgentActionSchemas'
import { IsoflowPatchOperation, getIsoflowState, patchIsoflow } from './isoflowBridge'
import { findIsoflowEmbed, readIsoflowEmbedMeta } from './isoflowProvider'

const MAX_PREVIEW_OPERATIONS = 100
const MAX_NORMALIZED_OPERATION_CHARS = 2_000
const MAX_INTENT_CHARS = 500
const MAX_NORMALIZED_PROPOSAL_CHARS = 20_000
const MAX_NORMALIZED_CONFIRMATION_CHARS = 24_000
const ISOFLOW_PREVIEW_EVENT = 'canvapocalypse:isoflow-mutation-preview'

export type IsoflowAgentMutationAction = IsoflowPatchAction | IsoflowCreateViewAction

export interface IsoflowMutationPreview {
	projectId: string
	selectedViewId: string
	baseRevision: number
	expectedRevision: number
	digest: string
	operations: IsoflowPatchOperation[]
	operationTypes: string[]
	affectedIds: string[]
	summaries: Array<{
		kind: IsoflowAgentMutationAction['_type']
		intent: string
		operationCount: number
	}>
}

export interface IsoflowMutationProposal {
	shapeId: string
	message: string
	preview: IsoflowMutationPreview
}

interface SelectedIsoflowMutationTarget {
	shapeId: string
	baseUrl: string
	projectId: string
	selectedViewId: string
	baseRevision: number
}

export async function previewIsoflowAgentActions(
	shape: TLEmbedShape,
	actions: IsoflowAgentMutationAction[],
	actor: string,
	signal?: AbortSignal
): Promise<IsoflowMutationPreview> {
	const meta = readIsoflowEmbedMeta(shape)
	if (!meta) throw new Error('Isoflow embed metadata is missing')
	if (actions.length === 0) throw new Error('Isoflow proposal has no actions')

	const operations: IsoflowPatchOperation[] = []
	const summaries: IsoflowMutationPreview['summaries'] = []

	for (const action of actions) {
		if (action.projectId && action.projectId !== meta.projectId) {
			throw new Error(`Agent targeted another project: ${action.projectId}`)
		}
		if (action._type === 'isoflowCreateView') {
			throw new Error(
				'Isoflow create-view proposals are outside the explicitly selected-view contract'
			)
		}
		const next = structuredClone(action.operations)
		assertSelectedViewOperations(next, meta.viewId)
		assertReadableIntent(action.intent)
		operations.push(...next)
		summaries.push({
			kind: action._type,
			intent: action.intent,
			operationCount: next.length,
		})
	}

	if (operations.length > MAX_PREVIEW_OPERATIONS) {
		throw new Error(`Isoflow proposal exceeds ${MAX_PREVIEW_OPERATIONS} operations`)
	}
	const normalizedOperations = deepFreeze(operations)
	const normalizedSummaries = deepFreeze(summaries)
	const operationTypes = deepFreeze([
		...new Set(normalizedOperations.map((operation) => operation.op)),
	])
	const affectedIds = deepFreeze(collectAffectedIds(normalizedOperations))
	assertNormalizedOperationBounds(normalizedOperations)
	assertNormalizedEnvelopeBounds(
		{
			projectId: meta.projectId,
			selectedViewId: meta.viewId,
			operations: normalizedOperations,
			summaries: normalizedSummaries,
		},
		MAX_NORMALIZED_PROPOSAL_CHARS,
		'proposal'
	)
	assertNormalizedEnvelopeBounds(
		{
			projectId: meta.projectId,
			selectedViewId: meta.viewId,
			baseRevision: Number.MIN_SAFE_INTEGER,
			expectedRevision: Number.MIN_SAFE_INTEGER,
			digest: '0'.repeat(64),
			operations: normalizedOperations,
			operationTypes,
			affectedIds,
			summaries: normalizedSummaries,
		},
		MAX_NORMALIZED_CONFIRMATION_CHARS,
		'confirmation'
	)

	const state = await getIsoflowState(meta.baseUrl, meta.projectId, signal)
	const result = await patchIsoflow(meta.baseUrl, meta.projectId, {
		baseRevision: state.revision,
		operations: normalizedOperations,
		actor,
		dryRun: true,
		signal,
	})
	const base = {
		projectId: meta.projectId,
		selectedViewId: meta.viewId,
		baseRevision: state.revision,
		expectedRevision: result.revision,
		operations: normalizedOperations,
		operationTypes,
		affectedIds,
		summaries: normalizedSummaries,
	}
	const digest = await digestPreview(base)
	const confirmed = deepFreeze({
		...base,
		digest,
	})
	assertNormalizedEnvelopeBounds(confirmed, MAX_NORMALIZED_CONFIRMATION_CHARS, 'confirmation')
	return confirmed
}

export function publishIsoflowMutationProposal(proposal: IsoflowMutationProposal) {
	if (typeof window === 'undefined') return
	assertDisplayableProposal(proposal)
	window.dispatchEvent(new CustomEvent(ISOFLOW_PREVIEW_EVENT, { detail: proposal }))
}

export function subscribeToIsoflowMutationProposals(
	shapeId: string,
	listener: (proposal: IsoflowMutationProposal) => void
) {
	const handle = (event: Event) => {
		const proposal = (event as CustomEvent<IsoflowMutationProposal>).detail
		if (proposal?.shapeId !== shapeId) return
		try {
			assertDisplayableProposal(proposal)
		} catch {
			return
		}
		listener(proposal)
	}
	window.addEventListener(ISOFLOW_PREVIEW_EVENT, handle)
	return () => window.removeEventListener(ISOFLOW_PREVIEW_EVENT, handle)
}

export async function applyIsoflowMutationPreview(
	editor: Editor,
	shape: TLEmbedShape,
	preview: IsoflowMutationPreview,
	confirmationDigest: string,
	actor: string
) {
	const confirmed = deepFreeze(structuredClone(preview))
	const selectedShapeId = shape.id
	const initialMeta = requireSelectedTarget(editor, selectedShapeId, confirmed)
	const selectedTarget = deepFreeze({
		shapeId: selectedShapeId,
		baseUrl: initialMeta.baseUrl,
		projectId: confirmed.projectId,
		selectedViewId: confirmed.selectedViewId,
		baseRevision: confirmed.baseRevision,
	})
	assertSelectedViewOperations(confirmed.operations, confirmed.selectedViewId)
	assertNormalizedOperationBounds(confirmed.operations)
	assertNormalizedEnvelopeBounds(confirmed, MAX_NORMALIZED_CONFIRMATION_CHARS, 'confirmation')
	if (confirmationDigest !== confirmed.digest) {
		throw new Error('Isoflow confirmation does not match the preview')
	}
	const actualDigest = await digestPreview({
		projectId: confirmed.projectId,
		selectedViewId: confirmed.selectedViewId,
		baseRevision: confirmed.baseRevision,
		expectedRevision: confirmed.expectedRevision,
		operations: confirmed.operations,
		operationTypes: confirmed.operationTypes,
		affectedIds: confirmed.affectedIds,
		summaries: confirmed.summaries,
	})
	if (actualDigest !== confirmed.digest) {
		throw new Error('Isoflow preview changed after confirmation')
	}

	assertConfirmedTarget(confirmed, selectedTarget)
	requireSelectedTarget(editor, selectedTarget.shapeId, selectedTarget)
	const result = await patchIsoflow(selectedTarget.baseUrl, selectedTarget.projectId, {
		baseRevision: selectedTarget.baseRevision,
		operations: confirmed.operations,
		actor,
		idempotencyKey: `canvapocalypse:${confirmed.digest}`,
	})
	return result
}

function assertDisplayableProposal(proposal: IsoflowMutationProposal) {
	assertReadableIntent(proposal.message)
	assertSelectedViewOperations(proposal.preview.operations, proposal.preview.selectedViewId)
	assertNormalizedOperationBounds(proposal.preview.operations)
	assertNormalizedEnvelopeBounds(
		proposal.preview,
		MAX_NORMALIZED_CONFIRMATION_CHARS,
		'confirmation'
	)
}

function requireSelectedTarget(
	editor: Editor,
	shapeId: string,
	target: {
		projectId: string
		selectedViewId: string
		baseUrl?: string
	}
) {
	const selected = findIsoflowEmbed(editor)
	if (!selected || selected.shape.id !== shapeId) {
		throw new Error('Select exactly one matching Isoflow embed before confirming its proposal')
	}
	if (
		selected.meta.projectId !== target.projectId ||
		selected.meta.viewId !== target.selectedViewId ||
		(target.baseUrl !== undefined && selected.meta.baseUrl !== target.baseUrl)
	) {
		throw new Error('Isoflow target changed after preview; create a fresh preview')
	}
	return selected.meta
}

function assertConfirmedTarget(
	preview: Pick<IsoflowMutationPreview, 'projectId' | 'selectedViewId' | 'baseRevision'>,
	target: Pick<SelectedIsoflowMutationTarget, 'projectId' | 'selectedViewId' | 'baseRevision'>
) {
	if (
		preview.projectId !== target.projectId ||
		preview.selectedViewId !== target.selectedViewId ||
		preview.baseRevision !== target.baseRevision
	) {
		throw new Error('Isoflow target changed after preview; create a fresh preview')
	}
}

function assertSelectedViewOperations(operations: IsoflowPatchOperation[], selectedViewId: string) {
	for (const operation of operations) {
		switch (operation.op) {
			case 'update_view':
			case 'move_item':
			case 'connect':
			case 'update_connector':
			case 'disconnect':
			case 'add_rectangle':
			case 'update_rectangle':
			case 'remove_rectangle':
			case 'add_text_box':
			case 'update_text_box':
			case 'remove_text_box':
				if (operation.viewId !== selectedViewId) {
					throw new Error(
						`Cross-view Isoflow operation ${operation.op} targets ${operation.viewId}; selected view is ${selectedViewId}`
					)
				}
				break
			default:
				throw new Error(
					`Isoflow operation ${operation.op} is outside the explicitly selected-view contract`
				)
		}
	}
}

function assertReadableIntent(intent: string) {
	if (intent.length > MAX_INTENT_CHARS) {
		throw new Error(`Isoflow intent exceeds ${MAX_INTENT_CHARS} characters`)
	}
}

function assertNormalizedOperationBounds(operations: IsoflowPatchOperation[]) {
	for (const operation of operations) {
		const normalized = formatIsoflowOperation(operation)
		if (normalized.length > MAX_NORMALIZED_OPERATION_CHARS) {
			throw new Error(
				`Isoflow operation ${operation.op} exceeds ${MAX_NORMALIZED_OPERATION_CHARS} normalized characters`
			)
		}
	}
}

function assertNormalizedEnvelopeBounds(
	value: unknown,
	maxChars: number,
	kind: 'proposal' | 'confirmation'
) {
	if (stableStringify(value).length > maxChars) {
		throw new Error(`Isoflow ${kind} exceeds ${maxChars} normalized characters`)
	}
}

export function formatIsoflowOperation(operation: IsoflowPatchOperation) {
	return stableStringify(operation)
}

function collectAffectedIds(operations: IsoflowPatchOperation[]) {
	const ids = new Set<string>()
	for (const operation of operations) {
		for (const key of [
			'viewId',
			'itemId',
			'connectorId',
			'rectangleId',
			'textBoxId',
			'colorId',
			'from',
			'to',
			'newViewId',
		] as const) {
			const value = key in operation ? operation[key as keyof typeof operation] : undefined
			if (typeof value === 'string') ids.add(value)
		}
		if ('item' in operation && operation.item && typeof operation.item.id === 'string') {
			ids.add(operation.item.id)
		}
		if ('view' in operation && operation.view && typeof operation.view.id === 'string') {
			ids.add(operation.view.id)
		}
	}
	return [...ids]
}

async function digestPreview(value: Omit<IsoflowMutationPreview, 'digest'>) {
	const bytes = new TextEncoder().encode(stableStringify(value))
	const hash = await globalThis.crypto.subtle.digest('SHA-256', bytes)
	return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function stableStringify(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
	if (value && typeof value === 'object') {
		return `{${Object.keys(value)
			.filter((key) => (value as Record<string, unknown>)[key] !== undefined)
			.sort()
			.map(
				(key) =>
					`${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`
			)
			.join(',')}}`
	}
	return JSON.stringify(value) ?? 'null'
}

function deepFreeze<T>(value: T): T {
	if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
	for (const child of Object.values(value)) deepFreeze(child)
	return Object.freeze(value)
}
