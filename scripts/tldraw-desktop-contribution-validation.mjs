const WORKBENCH_CONTRIBUTIONS = [
	{
		kitId: 'workbench.architecture',
		presetIds: [
			'workbench.system-context',
			'workbench.c4-container',
			'workbench.c4-component',
			'workbench.service-data-flow',
			'workbench.decision-graph',
			'workbench.change-radar',
		],
	},
	{
		kitId: 'workbench.ml',
		presetIds: ['workbench.experiment-loop', 'workbench.eval-pipeline', 'workbench.model-delivery'],
	},
	{
		kitId: 'workbench.uiux',
		presetIds: ['workbench.user-flow', 'workbench.wireframe-set', 'workbench.component-anatomy'],
	},
	{
		kitId: 'workbench.product',
		presetIds: [
			'workbench.roadmap',
			'workbench.timeline',
			'workbench.opportunity-map',
			'workbench.opportunity-solution-tree',
			'workbench.impact-map',
			'workbench.service-blueprint',
		],
	},
]
const contributionIdPattern = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/
const CANVAS_KIT_RUNTIME_SCHEMA = 'canvas.kit-runtime/v1'
const CANVAS_KIT_TLDRAW_VERSION = '5.2.5'
const RUNTIME_CONTRACT_KEYS = [
	'schema',
	'owner',
	'tldrawVersion',
	'toolPaths',
	'migrationIds',
	'schemaIds',
	'lifecycleIds',
	'bridgeIds',
].sort()
const RUNTIME_CONTRACT_LIST_KEYS = [
	'toolPaths',
	'migrationIds',
	'schemaIds',
	'lifecycleIds',
	'bridgeIds',
]

export function assertValidCanvapocalypseContributions(externalContributions) {
	assertValidCanvasKitContributions([
		...WORKBENCH_CONTRIBUTIONS.map((contribution) => ({
			...contribution,
			runtimeContract: {
				schema: CANVAS_KIT_RUNTIME_SCHEMA,
				owner: contribution.kitId,
				tldrawVersion: CANVAS_KIT_TLDRAW_VERSION,
				toolPaths: [],
				migrationIds: [],
				schemaIds: [],
				lifecycleIds: [],
				bridgeIds: [],
			},
			shapeUtils: [],
			bindingUtils: [],
			tools: [],
		})),
		...externalContributions,
	])
}

function assertValidCanvasKitContributions(contributions) {
	const kitIds = new Map()
	const presetIds = new Map()
	const shapeIds = new Map()
	const bindingIds = new Map()
	const toolIds = new Map()
	const toolPaths = new Map()
	const recordIds = new Map()
	for (const contribution of contributions) {
		if (!contribution || typeof contribution !== 'object') {
			throw new Error('Canvas Studio contribution must be an object.')
		}
		assertUniqueContributionId(contribution.kitId, 'kit', kitIds, contribution.kitId)
		assertRuntimeContract(contribution, toolPaths)
		if (!Array.isArray(contribution.presetIds)) {
			throw new Error(`Canvas Studio kit ${contribution.kitId} presetIds must be an array.`)
		}
		for (const presetId of contribution.presetIds) {
			assertUniqueContributionId(presetId, 'preset', presetIds, contribution.kitId)
		}
		assertUniqueRegistrations(contribution.shapeUtils, 'type', 'shape', shapeIds, contribution.kitId)
		assertUniqueRegistrations(contribution.bindingUtils, 'type', 'binding', bindingIds, contribution.kitId)
		assertUniqueRegistrations(contribution.tools, 'id', 'tool', toolIds, contribution.kitId)
		if (
			contribution.records !== undefined &&
			(!contribution.records || typeof contribution.records !== 'object' || Array.isArray(contribution.records))
		) {
			throw new Error(`Canvas Studio kit ${contribution.kitId} records must be an object.`)
		}
		for (const [typeName, record] of Object.entries(contribution.records ?? {})) {
			assertUniqueContributionId(typeName, 'record', recordIds, contribution.kitId)
			if (!record || typeof record !== 'object') {
				throw new Error(`Canvas Studio record ${typeName} in ${contribution.kitId} must be an object.`)
			}
		}
	}
}

function assertRuntimeContract(contribution, toolPathOwners) {
	const contract = contribution.runtimeContract
	if (!contract || typeof contract !== 'object' || Array.isArray(contract)) {
		throw new Error(`Canvas Studio kit ${contribution.kitId} is missing runtimeContract`)
	}
	const keys = Object.keys(contract).sort()
	if (
		keys.length !== RUNTIME_CONTRACT_KEYS.length ||
		keys.some((key, index) => key !== RUNTIME_CONTRACT_KEYS[index])
	) {
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
	for (const key of RUNTIME_CONTRACT_LIST_KEYS) {
		const values = contract[key]
		if (!Array.isArray(values)) {
			throw new Error(`Canvas Studio kit ${contribution.kitId} runtimeContract.${key} must be an array`)
		}
		const localIds = new Set()
		for (const value of values) {
			if (typeof value !== 'string' || !value || value.trim() !== value) {
				throw new Error(`Canvas Studio kit ${contribution.kitId} runtimeContract.${key} contains an invalid id`)
			}
			if (localIds.has(value)) {
				throw new Error(`Canvas Studio kit ${contribution.kitId} runtimeContract.${key} contains duplicate id ${value}`)
			}
			localIds.add(value)
		}
	}
	if (typeof contribution.onMount === 'function' && contract.lifecycleIds.length === 0) {
		throw new Error(`Canvas Studio kit ${contribution.kitId} onMount requires a lifecycle id`)
	}
	const declaredPaths = new Set(contract.toolPaths)
	for (const tool of contribution.tools ?? []) {
		for (const path of inferToolPaths(tool)) {
			if (!declaredPaths.has(path)) {
				throw new Error(`Canvas Studio kit ${contribution.kitId} must declare tool path ${path}`)
			}
		}
	}
	for (const path of contract.toolPaths) {
		const existingOwner = toolPathOwners.get(path)
		if (existingOwner) {
			throw new Error(`Duplicate Canvas Studio tool path ${path} in ${existingOwner} and ${contribution.kitId}`)
		}
		toolPathOwners.set(path, contribution.kitId)
	}
}

function inferToolPaths(tool, parentPath, ancestors = new Set()) {
	if (ancestors.has(tool)) {
		throw new Error('Canvas Studio tool state chart contains a recursive constructor cycle')
	}
	const id = tool?.id
	if (typeof id !== 'string' || !id) {
		throw new Error('Canvas Studio tool registration is missing static id')
	}
	const path = parentPath ? `${parentPath}.${id}` : id
	const children = typeof tool.children === 'function' ? tool.children() : []
	if (!Array.isArray(children)) {
		throw new Error(`Canvas Studio tool ${path} children must be an array`)
	}
	const nextAncestors = new Set(ancestors).add(tool)
	return [
		path,
		...children.flatMap((child) => inferToolPaths(child, path, nextAncestors)),
	]
}

function assertUniqueContributionId(value, kind, owners, owner) {
	if (typeof value !== 'string' || !contributionIdPattern.test(value)) {
		throw new Error(`Invalid Canvas Studio ${kind} id: ${value}`)
	}
	const existingOwner = owners.get(value)
	if (existingOwner) {
		if (kind === 'kit') {
			throw new Error(`Duplicate Canvas Studio kit id ${value}`)
		}
		throw new Error(`Duplicate Canvas Studio ${kind} id ${value} in ${existingOwner} and ${owner}`)
	}
	owners.set(value, owner)
}

function assertUniqueRegistrations(registrations, key, kind, owners, owner) {
	if (!Array.isArray(registrations)) {
		throw new Error(`Canvas Studio kit ${owner} ${kind} registrations must be an array.`)
	}
	for (const registration of registrations) {
		const value = registration?.[key]
		if (typeof value !== 'string' || !value) {
			throw new Error(`Canvas Studio ${kind} registration is missing static ${key}`)
		}
		if (!contributionIdPattern.test(value)) {
			throw new Error(`Invalid Canvas Studio ${kind} id: ${value}`)
		}
		const existingOwner = owners.get(value)
		if (existingOwner) {
			throw new Error(`Duplicate Canvas Studio ${kind} id ${value} in ${existingOwner} and ${owner}`)
		}
		owners.set(value, owner)
	}
}
