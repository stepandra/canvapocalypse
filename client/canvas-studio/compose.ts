import type {
	TLAnyBindingUtilConstructor,
	TLAnyShapeUtilConstructor,
	TLStateNodeConstructor,
} from 'tldraw'
import type {
	CanvasKitComposition,
	CanvasKitContribution,
} from './types'
import {
	CANVAS_KIT_RUNTIME_SCHEMA,
	CANVAS_KIT_TLDRAW_VERSION,
} from './types'

const contributionIdPattern = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/
const runtimeContractKeys = [
	'schema',
	'owner',
	'tldrawVersion',
	'toolPaths',
	'migrationIds',
	'schemaIds',
	'lifecycleIds',
	'bridgeIds',
] as const
const runtimeContractListKeys = [
	'toolPaths',
	'migrationIds',
	'schemaIds',
	'lifecycleIds',
	'bridgeIds',
] as const
const reservedAgentCapabilityIds = new Set([
	'canvas.catalog',
	'canvas.inspect',
	'canvas.shape.basic',
	'canvas.layout',
	'canvas.native-assets',
	'canvas.workflow',
	'canvas.result.read',
])

type Registration =
	| TLAnyShapeUtilConstructor
	| TLAnyBindingUtilConstructor
	| TLStateNodeConstructor

type ToolRegistration = TLStateNodeConstructor & {
	children?: () => readonly ToolRegistration[]
}

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

function inferToolPaths(
	tool: ToolRegistration,
	parentPath: string | undefined,
	paths: string[],
	ancestors: Set<ToolRegistration>
) {
	if (ancestors.has(tool)) {
		throw new Error('Canvas Studio tool state chart contains a recursive constructor cycle')
	}
	const id = registrationId(tool, 'id', 'tool')
	const path = parentPath ? `${parentPath}.${id}` : id
	paths.push(path)
	const nextAncestors = new Set(ancestors).add(tool)
	const children = typeof tool.children === 'function' ? tool.children() : []
	if (!Array.isArray(children)) {
		throw new Error(`Canvas Studio tool ${path} children must be an array`)
	}
	for (const child of children) {
		inferToolPaths(child, path, paths, nextAncestors)
	}
}

function assertRuntimeContract(
	contribution: CanvasKitContribution
) {
	const contract = contribution.runtimeContract
	if (!contract || typeof contract !== 'object' || Array.isArray(contract)) {
		throw new Error(`Canvas Studio kit ${contribution.kitId} is missing runtimeContract`)
	}
	const keys = Object.keys(contract).sort()
	const expectedKeys = [...runtimeContractKeys].sort()
	if (keys.length !== expectedKeys.length || keys.some((key, index) => key !== expectedKeys[index])) {
		throw new Error(`Canvas Studio kit ${contribution.kitId} runtimeContract has an invalid shape`)
	}
	if (contract.schema !== CANVAS_KIT_RUNTIME_SCHEMA) {
		throw new Error(`Canvas Studio kit ${contribution.kitId} must use runtime schema ${CANVAS_KIT_RUNTIME_SCHEMA}`)
	}
	if (contract.owner !== contribution.kitId) {
		throw new Error(`Canvas Studio runtime owner ${contract.owner} must equal kit id ${contribution.kitId}`)
	}
	if (contract.tldrawVersion !== CANVAS_KIT_TLDRAW_VERSION) {
		throw new Error(`Canvas Studio kit ${contribution.kitId} requires tldraw ${CANVAS_KIT_TLDRAW_VERSION}`)
	}
	for (const key of runtimeContractListKeys) {
		const values = contract[key]
		if (!Array.isArray(values)) {
			throw new Error(`Canvas Studio kit ${contribution.kitId} runtimeContract.${key} must be an array`)
		}
		const seen = new Set<string>()
		for (const value of values) {
			if (typeof value !== 'string' || value.trim() !== value || !value) {
				throw new Error(`Canvas Studio kit ${contribution.kitId} runtimeContract.${key} contains an invalid id`)
			}
			if (seen.has(value)) {
				throw new Error(`Canvas Studio kit ${contribution.kitId} runtimeContract.${key} contains duplicate id ${value}`)
			}
			seen.add(value)
		}
	}
	if (contribution.onMount && contract.lifecycleIds.length === 0) {
		throw new Error(`Canvas Studio kit ${contribution.kitId} onMount requires a lifecycle id`)
	}

	const inferredToolPaths: string[] = []
	for (const tool of contribution.tools) {
		inferToolPaths(tool as ToolRegistration, undefined, inferredToolPaths, new Set())
	}
	const declaredToolPaths = new Set(contract.toolPaths)
	for (const path of inferredToolPaths) {
		if (!declaredToolPaths.has(path)) {
			throw new Error(`Canvas Studio kit ${contribution.kitId} must declare tool path ${path}`)
		}
	}
}

function rejectDuplicateToolPaths(
	contributions: readonly CanvasKitContribution[]
) {
	const owners = new Map<string, string>()
	for (const contribution of contributions) {
		for (const path of contribution.runtimeContract.toolPaths) {
			const existingOwner = owners.get(path)
			if (existingOwner) {
				throw new Error(
					`Duplicate Canvas Studio tool path ${path} in ${existingOwner} and ${contribution.kitId}`
				)
			}
			owners.set(path, contribution.kitId)
		}
	}
}

export function composeCanvasKitContributions(
	contributions: readonly CanvasKitContribution[]
): CanvasKitComposition {
	const byKitId = new Map<string, CanvasKitContribution>()
	const byPresetId = new Map<string, CanvasKitContribution>()
	const byAgentCapabilityId = new Map<string, NonNullable<CanvasKitContribution['agentCapabilities']>[number]>()
	const recordOwners = new Map<string, string>()
	const records: Record<
		string,
		NonNullable<CanvasKitContribution['records']>[string]
	> = {}

	for (const contribution of contributions) {
		assertContributionId(contribution.kitId, 'kit')
		if (byKitId.has(contribution.kitId)) {
			throw new Error(`Duplicate Canvas Studio kit id ${contribution.kitId}`)
		}
		byKitId.set(contribution.kitId, contribution)
		assertRuntimeContract(contribution)

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

		for (const [typeName, record] of Object.entries(contribution.records ?? {})) {
			assertContributionId(typeName, 'record')
			const existingOwner = recordOwners.get(typeName)
			if (existingOwner) {
				throw new Error(
					`Duplicate Canvas Studio record id ${typeName} in ${existingOwner} and ${contribution.kitId}`
				)
			}
			recordOwners.set(typeName, contribution.kitId)
			records[typeName] = record
		}

		for (const capability of contribution.agentCapabilities ?? []) {
			const descriptor = capability.descriptor
			assertContributionId(descriptor.id, 'agent capability')
			if (reservedAgentCapabilityIds.has(descriptor.id)) {
				throw new Error(
					`Canvas Studio agent capability ${descriptor.id} collides with a host capability`
				)
			}
			if (descriptor.kitId !== contribution.kitId) {
				throw new Error(
					`Canvas Studio agent capability ${descriptor.id} must belong to ${contribution.kitId}`
				)
			}
			if (byAgentCapabilityId.has(descriptor.id)) {
				throw new Error(`Duplicate Canvas Studio agent capability id ${descriptor.id}`)
			}
			if (
				descriptor.version !== 1 ||
				!descriptor.summary.trim() ||
				descriptor.contexts.length === 0 ||
				descriptor.actionPlan.maxActions < 1 ||
				descriptor.actionPlan.maxActions > 24 ||
				descriptor.actionPlan.actionTypes.length === 0 ||
				descriptor.effects.atomic !== true ||
				(descriptor.mode === 'mutate' && descriptor.effects.undoable !== true) ||
				(descriptor.mode === 'read' &&
					(descriptor.effects.undoable !== false ||
						descriptor.effects.recordTypes.length !== 0))
			) {
				throw new Error(`Canvas Studio agent capability ${descriptor.id} has an invalid contract`)
			}
			byAgentCapabilityId.set(descriptor.id, capability)
		}
	}

	rejectDuplicateRegistrationIds(contributions, 'shapeUtils', 'type', 'shape')
	rejectDuplicateRegistrationIds(contributions, 'bindingUtils', 'type', 'binding')
	rejectDuplicateRegistrationIds(contributions, 'tools', 'id', 'tool')
	rejectDuplicateToolPaths(contributions)

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
	const agentCapabilities = stableContributions.flatMap((contribution) => [
		...(contribution.agentCapabilities ?? []),
	])

	return {
		contributions: stableContributions,
		shapeUtils,
		bindingUtils,
		tools,
		records,
		agentCapabilities,
		onMount(editor) {
			const disposers: Array<() => void> = []
			let disposed = false
			const dispose = () => {
				if (disposed) return
				disposed = true
				let firstError: unknown
				let failed = false
				for (let index = disposers.length - 1; index >= 0; index -= 1) {
					try {
						disposers[index]()
					} catch (error) {
						if (!failed) firstError = error
						failed = true
					}
				}
				if (failed) throw firstError
			}
			try {
				for (const contribution of stableContributions) {
					const contributionDispose = contribution.onMount?.(editor)
					if (contributionDispose) disposers.push(contributionDispose)
				}
			} catch (error) {
				try {
					dispose()
				} catch {
					// Preserve the mount error after attempting every collected cleanup.
				}
				throw error
			}
			if (disposers.length === 0) return
			return dispose
		},
		getContribution: (kitId) => byKitId.get(kitId),
		getPresetContribution: (presetId) => byPresetId.get(presetId),
		getAgentCapability: (capabilityId) => byAgentCapabilityId.get(capabilityId),
		insertPreset(editor, presetId, options) {
			const contribution = byPresetId.get(presetId)
			if (!contribution) {
				throw new Error(`Canvas Studio preset ${presetId} is unavailable in this host`)
			}
			return contribution.insertPreset(editor, presetId, options)
		},
	}
}
