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

export function assertValidCanvapocalypseContributions(externalContributions) {
	assertValidCanvasKitContributions([
		...WORKBENCH_CONTRIBUTIONS.map((contribution) => ({
			...contribution,
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
	const recordIds = new Map()
	for (const contribution of contributions) {
		if (!contribution || typeof contribution !== 'object') {
			throw new Error('Canvas Studio contribution must be an object.')
		}
		assertUniqueContributionId(contribution.kitId, 'kit', kitIds, contribution.kitId)
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
