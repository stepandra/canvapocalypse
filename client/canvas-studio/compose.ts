import type {
	TLAnyBindingUtilConstructor,
	TLAnyShapeUtilConstructor,
	TLStateNodeConstructor,
} from 'tldraw'
import type {
	CanvasKitComposition,
	CanvasKitContribution,
} from './types'

const contributionIdPattern = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/

type Registration =
	| TLAnyShapeUtilConstructor
	| TLAnyBindingUtilConstructor
	| TLStateNodeConstructor

function assertContributionId(value: string, kind: string) {
	if (!contributionIdPattern.test(value)) {
		throw new Error(`Invalid Canvas Studio ${kind} id: ${value}`)
	}
}

function registrationId(
	registration: Registration,
	key: 'type' | 'id',
	kind: string
): string {
	const value = (registration as unknown as Record<'type' | 'id', unknown>)[key]
	if (typeof value !== 'string' || !value) {
		throw new Error(`Canvas Studio ${kind} registration is missing static ${key}`)
	}
	assertContributionId(value, kind)
	return value
}

function rejectDuplicateRegistrationIds(
	contributions: readonly CanvasKitContribution[],
	field: 'shapeUtils' | 'bindingUtils' | 'tools',
	key: 'type' | 'id',
	kind: string
) {
	const owners = new Map<string, string>()
	for (const contribution of contributions) {
		for (const registration of contribution[field]) {
			const id = registrationId(registration, key, kind)
			const existingOwner = owners.get(id)
			if (existingOwner) {
				throw new Error(
					`Duplicate Canvas Studio ${kind} id ${id} in ${existingOwner} and ${contribution.kitId}`
				)
			}
			owners.set(id, contribution.kitId)
		}
	}
}

export function composeCanvasKitContributions(
	contributions: readonly CanvasKitContribution[]
): CanvasKitComposition {
	const byKitId = new Map<string, CanvasKitContribution>()
	const byPresetId = new Map<string, CanvasKitContribution>()

	for (const contribution of contributions) {
		assertContributionId(contribution.kitId, 'kit')
		if (byKitId.has(contribution.kitId)) {
			throw new Error(`Duplicate Canvas Studio kit id ${contribution.kitId}`)
		}
		byKitId.set(contribution.kitId, contribution)

		const localPresetIds = new Set<string>()
		for (const presetId of contribution.presetIds) {
			assertContributionId(presetId, 'preset')
			if (localPresetIds.has(presetId) || byPresetId.has(presetId)) {
				const owner = byPresetId.get(presetId)?.kitId ?? contribution.kitId
				throw new Error(
					`Duplicate Canvas Studio preset id ${presetId} in ${owner} and ${contribution.kitId}`
				)
			}
			localPresetIds.add(presetId)
			byPresetId.set(presetId, contribution)
		}
	}

	rejectDuplicateRegistrationIds(contributions, 'shapeUtils', 'type', 'shape')
	rejectDuplicateRegistrationIds(contributions, 'bindingUtils', 'type', 'binding')
	rejectDuplicateRegistrationIds(contributions, 'tools', 'id', 'tool')

	const stableContributions = [...contributions]
	const shapeUtils = stableContributions.flatMap((contribution) => [
		...contribution.shapeUtils,
	])
	const bindingUtils = stableContributions.flatMap((contribution) => [
		...contribution.bindingUtils,
	])
	const tools = stableContributions.flatMap((contribution) => [
		...contribution.tools,
	])

	return {
		contributions: stableContributions,
		shapeUtils,
		bindingUtils,
		tools,
		getContribution: (kitId) => byKitId.get(kitId),
		getPresetContribution: (presetId) => byPresetId.get(presetId),
		insertPreset(editor, presetId, options) {
			const contribution = byPresetId.get(presetId)
			if (!contribution) {
				throw new Error(`Canvas Studio preset ${presetId} is unavailable in this host`)
			}
			return contribution.insertPreset(editor, presetId, options)
		},
	}
}
