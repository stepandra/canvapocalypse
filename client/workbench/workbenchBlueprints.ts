import {
	parseWorkbenchArtifact,
	parseWorkbenchRelation,
	PRODUCT_ARTIFACT_KINDS,
	WorkbenchDateSchema,
	WorkbenchOwnerSchema,
	WorkbenchStableIdSchema,
	WORKBENCH_ARTIFACT_SCHEMA,
	WORKBENCH_RELATION_SCHEMA,
	WORKBENCH_SCHEMA_VERSION,
	type WorkbenchArtifact,
	type WorkbenchArtifactStatus,
	type WorkbenchDate,
	type WorkbenchOwner,
	type WorkbenchReference,
	type WorkbenchRelation,
	type WorkbenchRelationType,
	type WorkbenchShapeId,
} from '../../shared/types/WorkbenchArtifact'

export const WORKBENCH_BLUEPRINT_SCHEMA = 'workbench-blueprint/v1' as const

export type ProductArtifactKind = (typeof PRODUCT_ARTIFACT_KINDS)[number]
export type ProductWorkbenchArtifact = Extract<WorkbenchArtifact, { pack: 'product' }>

export type WorkbenchBlueprintKind =
	| 'product-roadmap'
	| 'delivery-timeline'
	| 'opportunity-decision'
	| 'opportunity-solution-tree'
	| 'impact-map'
	| 'service-blueprint'
export type WorkbenchBlueprintVisualRole = 'lane' | 'bar' | 'milestone' | 'risk' | 'decision'
export type WorkbenchBlueprintTone = 'neutral' | 'teal' | 'cyan' | 'violet' | 'amber' | 'red'

export interface WorkbenchBlueprintGeometry {
	x: number
	y: number
	w: number
	h: number
	geo: 'rectangle' | 'diamond'
}

export interface WorkbenchBlueprintArtifact {
	shapeId: WorkbenchShapeId
	artifact: ProductWorkbenchArtifact
	visual: {
		role: WorkbenchBlueprintVisualRole
		tone: WorkbenchBlueprintTone
		geometry: WorkbenchBlueprintGeometry
	}
}

export interface WorkbenchBlueprintRelation {
	shapeId: WorkbenchShapeId
	relation: WorkbenchRelation
	visual: {
		route: 'straight' | 'elbow'
	}
}

export interface WorkbenchBlueprint {
	schema: typeof WORKBENCH_BLUEPRINT_SCHEMA
	blueprintId: string
	pack: 'product'
	kind: WorkbenchBlueprintKind
	title: string
	bounds: {
		w: number
		h: number
	}
	artifacts: WorkbenchBlueprintArtifact[]
	relations: WorkbenchBlueprintRelation[]
}

export interface WorkbenchBlueprintOptions {
	/** Stable namespace used for artifact, relation, and eventual tldraw shape ids. */
	blueprintId: string
	/** Explicit input keeps this pure builder deterministic and timezone independent. */
	startDate: string
	title?: string
	owner?: WorkbenchOwner
}

interface ArtifactInput {
	key: string
	kind: ProductArtifactKind
	title: string
	summary?: string
	status: WorkbenchArtifactStatus
	startAt?: WorkbenchDate
	dueAt?: WorkbenchDate
	owner?: WorkbenchOwner
	laneKey?: string
	tags?: string[]
	visual: WorkbenchBlueprintArtifact['visual']
}

const DEFAULT_ROADMAP_OWNER: WorkbenchOwner = {
	id: 'team:product',
	type: 'team',
	label: 'Product',
}

const DEFAULT_DELIVERY_OWNER: WorkbenchOwner = {
	id: 'team:delivery',
	type: 'team',
	label: 'Delivery',
}

const DEFAULT_OPPORTUNITY_OWNER: WorkbenchOwner = {
	id: 'team:product-discovery',
	type: 'team',
	label: 'Product Discovery',
}

function artifactId(scope: string, key: string): string {
	return `${scope}:artifact:${key}`
}

function artifactShapeId(scope: string, key: string): WorkbenchShapeId {
	return `shape:${scope}-artifact-${key}` as WorkbenchShapeId
}

function relationShapeId(scope: string, key: string): WorkbenchShapeId {
	return `shape:${scope}-relation-${key}` as WorkbenchShapeId
}

function addDays(date: WorkbenchDate, days: number): WorkbenchDate {
	const [year, month, day] = date.split('-').map(Number)
	const result = new Date(Date.UTC(year, month - 1, day + days))
	return WorkbenchDateSchema.parse(result.toISOString().slice(0, 10))
}

function createArtifact(scope: string, input: ArtifactInput): WorkbenchBlueprintArtifact {
	const refs: WorkbenchReference[] = input.laneKey
		? [
				{
					refId: `${scope}:ref:${input.key}:lane`,
					kind: 'artifact',
					target: artifactId(scope, input.laneKey),
					label: 'Timeline lane',
				},
			]
		: []

	const artifact = parseWorkbenchArtifact({
		schema: WORKBENCH_ARTIFACT_SCHEMA,
		artifactId: artifactId(scope, input.key),
		pack: 'product',
		kind: input.kind,
		title: input.title,
		...(input.summary ? { summary: input.summary } : {}),
		status: input.status,
		...(input.owner ? { owner: input.owner } : {}),
		...(input.startAt ? { startAt: input.startAt } : {}),
		...(input.dueAt ? { dueAt: input.dueAt } : {}),
		refs,
		tags: input.tags ?? [],
		version: WORKBENCH_SCHEMA_VERSION,
	})

	return {
		shapeId: artifactShapeId(scope, input.key),
		artifact: artifact as ProductWorkbenchArtifact,
		visual: input.visual,
	}
}

function createRelation(
	scope: string,
	key: string,
	type: WorkbenchRelationType,
	start: WorkbenchBlueprintArtifact,
	end: WorkbenchBlueprintArtifact,
	label?: string,
	route: WorkbenchBlueprintRelation['visual']['route'] = 'elbow'
): WorkbenchBlueprintRelation {
	return {
		shapeId: relationShapeId(scope, key),
		relation: parseWorkbenchRelation({
			schema: WORKBENCH_RELATION_SCHEMA,
			relationId: `${scope}:relation:${key}`,
			pack: 'product',
			type,
			start: {
				artifactId: start.artifact.artifactId,
				shapeId: start.shapeId,
			},
			end: {
				artifactId: end.artifact.artifactId,
				shapeId: end.shapeId,
			},
			...(label ? { label } : {}),
			version: WORKBENCH_SCHEMA_VERSION,
		}),
		visual: { route },
	}
}

function parseOptions(
	options: WorkbenchBlueprintOptions,
	defaultOwner: WorkbenchOwner
): {
	scope: string
	startDate: WorkbenchDate
	title?: string
	owner: WorkbenchOwner
} {
	return {
		scope: WorkbenchStableIdSchema.parse(options.blueprintId),
		startDate: WorkbenchDateSchema.parse(options.startDate),
		...(options.title ? { title: options.title.trim() } : {}),
		owner: WorkbenchOwnerSchema.parse(options.owner ?? defaultOwner),
	}
}

function finalizeBlueprint(blueprint: WorkbenchBlueprint): WorkbenchBlueprint {
	const errors = validateWorkbenchBlueprint(blueprint)
	if (errors.length > 0) {
		throw new Error(`Invalid workbench blueprint:\n${errors.join('\n')}`)
	}
	return blueprint
}

export function buildProductRoadmapBlueprint(options: WorkbenchBlueprintOptions): WorkbenchBlueprint {
	const { scope, startDate, owner, title } = parseOptions(options, DEFAULT_ROADMAP_OWNER)
	const through = (days: number) => addDays(startDate, days)
	const artifacts: WorkbenchBlueprintArtifact[] = []
	const add = (input: ArtifactInput) => {
		const artifact = createArtifact(scope, input)
		artifacts.push(artifact)
		return artifact
	}

	const platformLane = add({
		key: 'lane-platform',
		kind: 'timeline-lane',
		title: 'Platform',
		status: 'active',
		owner,
		startAt: startDate,
		dueAt: through(120),
		visual: {
			role: 'lane',
			tone: 'neutral',
			geometry: { x: 40, y: 70, w: 1120, h: 150, geo: 'rectangle' },
		},
	})
	const experienceLane = add({
		key: 'lane-experience',
		kind: 'timeline-lane',
		title: 'Experience',
		status: 'active',
		owner,
		startAt: startDate,
		dueAt: through(120),
		visual: {
			role: 'lane',
			tone: 'neutral',
			geometry: { x: 40, y: 250, w: 1120, h: 150, geo: 'rectangle' },
		},
	})
	const operationsLane = add({
		key: 'lane-operations',
		kind: 'timeline-lane',
		title: 'Operations',
		status: 'active',
		owner,
		startAt: startDate,
		dueAt: through(120),
		visual: {
			role: 'lane',
			tone: 'neutral',
			geometry: { x: 40, y: 430, w: 1120, h: 150, geo: 'rectangle' },
		},
	})

	const foundation = add({
		key: 'foundation',
		kind: 'initiative',
		title: 'Workbench foundation',
		summary: 'Establish the native artifact, relation, and decision-memory contract.',
		status: 'active',
		owner,
		startAt: startDate,
		dueAt: through(28),
		laneKey: 'lane-platform',
		tags: ['foundation'],
		visual: {
			role: 'bar',
			tone: 'teal',
			geometry: { x: 110, y: 118, w: 245, h: 58, geo: 'rectangle' },
		},
	})
	const collaboration = add({
		key: 'collaboration-core',
		kind: 'initiative',
		title: 'AI collaboration core',
		summary: 'Ship bounded inspection, validated mutations, and compact receipts.',
		status: 'planned',
		owner,
		startAt: through(29),
		dueAt: through(63),
		laneKey: 'lane-platform',
		tags: ['agents'],
		visual: {
			role: 'bar',
			tone: 'cyan',
			geometry: { x: 390, y: 118, w: 290, h: 58, geo: 'rectangle' },
		},
	})
	const pilotMilestone = add({
		key: 'pilot-milestone',
		kind: 'milestone',
		title: 'Pilot ready',
		status: 'planned',
		owner,
		startAt: through(70),
		dueAt: through(70),
		laneKey: 'lane-platform',
		visual: {
			role: 'milestone',
			tone: 'violet',
			geometry: { x: 735, y: 120, w: 54, h: 54, geo: 'diamond' },
		},
	})
	const agentExperience = add({
		key: 'agent-experience',
		kind: 'initiative',
		title: 'Agent-assisted creation',
		summary: 'Make template generation and bounded canvas edits legible to people and agents.',
		status: 'active',
		owner,
		startAt: through(7),
		dueAt: through(42),
		laneKey: 'lane-experience',
		tags: ['experience'],
		visual: {
			role: 'bar',
			tone: 'violet',
			geometry: { x: 170, y: 298, w: 310, h: 58, geo: 'rectangle' },
		},
	})
	const packExpansion = add({
		key: 'pack-expansion',
		kind: 'initiative',
		title: 'Domain pack expansion',
		summary: 'Grow architecture, ML, UI/UX, and Product capabilities behind compact manifests.',
		status: 'planned',
		owner,
		startAt: through(50),
		dueAt: through(98),
		laneKey: 'lane-experience',
		tags: ['packs'],
		visual: {
			role: 'bar',
			tone: 'teal',
			geometry: { x: 560, y: 298, w: 330, h: 58, geo: 'rectangle' },
		},
	})
	const scopeDecision = add({
		key: 'scope-decision',
		kind: 'decision',
		title: 'Provider boundary',
		summary: 'Keep native tldraw canonical and hydrate external providers only when selected.',
		status: 'accepted',
		owner,
		startAt: through(43),
		dueAt: through(49),
		laneKey: 'lane-experience',
		visual: {
			role: 'decision',
			tone: 'amber',
			geometry: { x: 940, y: 286, w: 175, h: 82, geo: 'rectangle' },
		},
	})
	const operatingLoop = add({
		key: 'operating-loop',
		kind: 'initiative',
		title: 'Operating loop',
		summary: 'Track milestones, decisions, risks, and receipts without a second source of truth.',
		status: 'planned',
		owner,
		startAt: through(36),
		dueAt: through(84),
		laneKey: 'lane-operations',
		tags: ['operations'],
		visual: {
			role: 'bar',
			tone: 'cyan',
			geometry: { x: 400, y: 478, w: 360, h: 58, geo: 'rectangle' },
		},
	})
	const contextRisk = add({
		key: 'context-risk',
		kind: 'risk',
		title: 'Context budget risk',
		summary: 'Broad schemas or unbounded canvas state can degrade agent decisions.',
		status: 'active',
		owner,
		startAt: through(22),
		dueAt: through(84),
		laneKey: 'lane-operations',
		visual: {
			role: 'risk',
			tone: 'red',
			geometry: { x: 840, y: 466, w: 230, h: 82, geo: 'rectangle' },
		},
	})

	const relations = [
		createRelation(scope, 'collaboration-after-foundation', 'depends-on', collaboration, foundation),
		createRelation(scope, 'pilot-of-collaboration', 'milestone-of', pilotMilestone, collaboration),
		createRelation(scope, 'packs-after-experience', 'depends-on', packExpansion, agentExperience),
		createRelation(scope, 'packs-decided-by-boundary', 'decided-by', packExpansion, scopeDecision),
		createRelation(scope, 'operations-after-core', 'depends-on', operatingLoop, collaboration),
		createRelation(scope, 'context-risk-blocks-operations', 'blocks', contextRisk, operatingLoop),
	]

	return finalizeBlueprint({
		schema: WORKBENCH_BLUEPRINT_SCHEMA,
		blueprintId: scope,
		pack: 'product',
		kind: 'product-roadmap',
		title: title || 'Product Roadmap',
		bounds: { w: 1200, h: 640 },
		artifacts,
		relations,
	})
}

export function buildDeliveryTimelineBlueprint(options: WorkbenchBlueprintOptions): WorkbenchBlueprint {
	const { scope, startDate, owner, title } = parseOptions(options, DEFAULT_DELIVERY_OWNER)
	const through = (days: number) => addDays(startDate, days)
	const artifacts: WorkbenchBlueprintArtifact[] = []
	const add = (input: ArtifactInput) => {
		const artifact = createArtifact(scope, input)
		artifacts.push(artifact)
		return artifact
	}

	for (const lane of [
		{ key: 'lane-plan', title: 'Plan', y: 70 },
		{ key: 'lane-build', title: 'Build', y: 250 },
		{ key: 'lane-release', title: 'Release', y: 430 },
	]) {
		add({
			key: lane.key,
			kind: 'timeline-lane',
			title: lane.title,
			status: 'active',
			owner,
			startAt: startDate,
			dueAt: through(70),
			visual: {
				role: 'lane',
				tone: 'neutral',
				geometry: { x: 40, y: lane.y, w: 1120, h: 150, geo: 'rectangle' },
			},
		})
	}

	const scopeBaseline = add({
		key: 'scope-baseline',
		kind: 'initiative',
		title: 'Scope baseline',
		status: 'active',
		owner,
		startAt: startDate,
		dueAt: through(12),
		laneKey: 'lane-plan',
		visual: {
			role: 'bar',
			tone: 'teal',
			geometry: { x: 100, y: 118, w: 210, h: 58, geo: 'rectangle' },
		},
	})
	const scopeLock = add({
		key: 'scope-lock',
		kind: 'milestone',
		title: 'Scope locked',
		status: 'planned',
		owner,
		startAt: through(14),
		dueAt: through(14),
		laneKey: 'lane-plan',
		visual: {
			role: 'milestone',
			tone: 'violet',
			geometry: { x: 345, y: 120, w: 54, h: 54, geo: 'diamond' },
		},
	})
	const implementation = add({
		key: 'implementation',
		kind: 'initiative',
		title: 'Implementation',
		status: 'planned',
		owner,
		startAt: through(15),
		dueAt: through(40),
		laneKey: 'lane-build',
		visual: {
			role: 'bar',
			tone: 'cyan',
			geometry: { x: 300, y: 298, w: 320, h: 58, geo: 'rectangle' },
		},
	})
	const validation = add({
		key: 'validation',
		kind: 'initiative',
		title: 'Bounded validation',
		status: 'planned',
		owner,
		startAt: through(34),
		dueAt: through(51),
		laneKey: 'lane-build',
		visual: {
			role: 'bar',
			tone: 'violet',
			geometry: { x: 660, y: 298, w: 235, h: 58, geo: 'rectangle' },
		},
	})
	const scheduleRisk = add({
		key: 'schedule-risk',
		kind: 'risk',
		title: 'Integration drift',
		summary: 'Concurrent changes can invalidate the delivery baseline.',
		status: 'active',
		owner,
		startAt: through(20),
		dueAt: through(51),
		laneKey: 'lane-build',
		visual: {
			role: 'risk',
			tone: 'red',
			geometry: { x: 930, y: 286, w: 185, h: 82, geo: 'rectangle' },
		},
	})
	const releaseCandidate = add({
		key: 'release-candidate',
		kind: 'milestone',
		title: 'Release candidate',
		status: 'planned',
		owner,
		startAt: through(52),
		dueAt: through(52),
		laneKey: 'lane-release',
		visual: {
			role: 'milestone',
			tone: 'violet',
			geometry: { x: 690, y: 480, w: 54, h: 54, geo: 'diamond' },
		},
	})
	const goNoGo = add({
		key: 'go-no-go',
		kind: 'decision',
		title: 'Go / no-go',
		status: 'proposed',
		owner,
		startAt: through(53),
		dueAt: through(56),
		laneKey: 'lane-release',
		visual: {
			role: 'decision',
			tone: 'amber',
			geometry: { x: 780, y: 466, w: 165, h: 82, geo: 'rectangle' },
		},
	})
	const stagedRollout = add({
		key: 'staged-rollout',
		kind: 'initiative',
		title: 'Staged rollout',
		status: 'planned',
		owner,
		startAt: through(57),
		dueAt: through(68),
		laneKey: 'lane-release',
		visual: {
			role: 'bar',
			tone: 'teal',
			geometry: { x: 965, y: 478, w: 140, h: 58, geo: 'rectangle' },
		},
	})

	const relations = [
		createRelation(scope, 'baseline-informs-scope-lock', 'informs', scopeBaseline, scopeLock, undefined, 'straight'),
		createRelation(scope, 'scope-lock-informs-implementation', 'informs', scopeLock, implementation, undefined, 'straight'),
		createRelation(scope, 'implementation-informs-validation', 'informs', implementation, validation, undefined, 'straight'),
		createRelation(scope, 'validation-surfaces-drift', 'informs', validation, scheduleRisk, undefined, 'straight'),
		createRelation(scope, 'validation-informs-candidate', 'informs', validation, releaseCandidate, undefined, 'straight'),
		createRelation(scope, 'candidate-informs-go-no-go', 'informs', releaseCandidate, goNoGo, undefined, 'straight'),
		createRelation(scope, 'go-no-go-informs-rollout', 'informs', goNoGo, stagedRollout, undefined, 'straight'),
	]

	return finalizeBlueprint({
		schema: WORKBENCH_BLUEPRINT_SCHEMA,
		blueprintId: scope,
		pack: 'product',
		kind: 'delivery-timeline',
		title: title || 'Delivery Timeline',
		bounds: { w: 1200, h: 640 },
		artifacts,
		relations,
	})
}

export function buildOpportunityDecisionBlueprint(options: WorkbenchBlueprintOptions): WorkbenchBlueprint {
	const { scope, startDate, owner, title } = parseOptions(options, DEFAULT_OPPORTUNITY_OWNER)
	const through = (days: number) => addDays(startDate, days)
	const artifacts: WorkbenchBlueprintArtifact[] = []
	const add = (input: ArtifactInput) => {
		const artifact = createArtifact(scope, input)
		artifacts.push(artifact)
		return artifact
	}

	const activationOpportunity = add({
		key: 'opportunity-activation',
		kind: 'opportunity',
		title: 'Option A · First value',
		summary: 'Help a new team move from an empty canvas to a useful plan in one session.',
		status: 'proposed',
		owner,
		startAt: startDate,
		dueAt: through(14),
		tags: ['opportunity', 'activation'],
		visual: {
			role: 'bar',
			tone: 'teal',
			geometry: { x: 50, y: 70, w: 260, h: 104, geo: 'rectangle' },
		},
	})
	const collaborationOpportunity = add({
		key: 'opportunity-collaboration',
		kind: 'opportunity',
		title: 'Option B · Inspectable decisions',
		summary: 'Keep rationale, evidence, and agent mutations visible beside the work.',
		status: 'proposed',
		owner,
		startAt: startDate,
		dueAt: through(14),
		tags: ['opportunity', 'collaboration'],
		visual: {
			role: 'bar',
			tone: 'cyan',
			geometry: { x: 50, y: 245, w: 260, h: 104, geo: 'rectangle' },
		},
	})
	const continuityOpportunity = add({
		key: 'opportunity-continuity',
		kind: 'opportunity',
		title: 'Option C · Planning continuity',
		summary: 'Let teams resume a roadmap or decision cycle without reconstructing context.',
		status: 'proposed',
		owner,
		startAt: startDate,
		dueAt: through(14),
		tags: ['opportunity', 'continuity'],
		visual: {
			role: 'bar',
			tone: 'violet',
			geometry: { x: 50, y: 420, w: 260, h: 104, geo: 'rectangle' },
		},
	})

	const userValueCriterion = add({
		key: 'criterion-user-value',
		kind: 'assumption',
		title: 'Evidence · activation interviews',
		summary: 'Prefer the option that removes the largest recurring planning friction.',
		status: 'active',
		owner,
		startAt: through(7),
		dueAt: through(21),
		tags: ['decision-criterion', 'user-value'],
		visual: {
			role: 'bar',
			tone: 'neutral',
			geometry: { x: 380, y: 95, w: 225, h: 90, geo: 'rectangle' },
		},
	})
	const evidenceCriterion = add({
		key: 'criterion-evidence',
		kind: 'assumption',
		title: 'Evidence · decision audit',
		summary: 'Require observable usage evidence and a measurable target outcome.',
		status: 'active',
		owner,
		startAt: through(7),
		dueAt: through(21),
		tags: ['decision-criterion', 'evidence'],
		visual: {
			role: 'bar',
			tone: 'neutral',
			geometry: { x: 380, y: 255, w: 225, h: 90, geo: 'rectangle' },
		},
	})
	const feasibilityCriterion = add({
		key: 'criterion-feasibility',
		kind: 'assumption',
		title: 'Evidence · return sessions',
		summary: 'Prefer a reversible slice that fits the current capability and context budgets.',
		status: 'active',
		owner,
		startAt: through(7),
		dueAt: through(21),
		tags: ['decision-criterion', 'feasibility'],
		visual: {
			role: 'bar',
			tone: 'neutral',
			geometry: { x: 380, y: 415, w: 225, h: 90, geo: 'rectangle' },
		},
	})

	const decision = add({
		key: 'decision-priority',
		kind: 'decision',
		title: 'Choose product bet',
		summary: 'Record the selected opportunity, rejected alternatives, and review trigger.',
		status: 'proposed',
		owner,
		startAt: through(22),
		dueAt: through(28),
		tags: ['decision-gate'],
		visual: {
			role: 'decision',
			tone: 'amber',
			geometry: { x: 675, y: 220, w: 205, h: 130, geo: 'rectangle' },
		},
	})
	const outcome = add({
		key: 'outcome-adoption',
		kind: 'outcome',
		title: 'Repeatable weekly adoption',
		summary: 'Teams create, revise, and resume one useful planning artifact each week.',
		status: 'planned',
		owner,
		startAt: through(29),
		dueAt: through(70),
		tags: ['target-outcome', 'adoption'],
		visual: {
			role: 'milestone',
			tone: 'teal',
			geometry: { x: 965, y: 145, w: 210, h: 110, geo: 'diamond' },
		},
	})
	const evidenceRisk = add({
		key: 'risk-proxy-metric',
		kind: 'risk',
		title: 'Proxy metric risk',
		summary: 'Template creation may rise without improving repeated product decisions.',
		status: 'active',
		owner,
		startAt: through(29),
		dueAt: through(70),
		tags: ['measurement-risk'],
		visual: {
			role: 'risk',
			tone: 'red',
			geometry: { x: 965, y: 345, w: 210, h: 110, geo: 'rectangle' },
		},
	})

	const relations = [
		createRelation(scope, 'activation-informs-user-value', 'informs', activationOpportunity, userValueCriterion),
		createRelation(scope, 'collaboration-informs-evidence', 'informs', collaborationOpportunity, evidenceCriterion),
		createRelation(scope, 'continuity-informs-feasibility', 'informs', continuityOpportunity, feasibilityCriterion),
		createRelation(scope, 'user-value-informs-decision', 'informs', userValueCriterion, decision),
		createRelation(scope, 'evidence-informs-decision', 'informs', evidenceCriterion, decision),
		createRelation(scope, 'feasibility-informs-decision', 'informs', feasibilityCriterion, decision),
		createRelation(scope, 'decision-implements-outcome', 'implements', decision, outcome),
		createRelation(scope, 'proxy-risk-blocks-outcome', 'blocks', evidenceRisk, outcome),
	]

	return finalizeBlueprint({
		schema: WORKBENCH_BLUEPRINT_SCHEMA,
		blueprintId: scope,
		pack: 'product',
		kind: 'opportunity-decision',
		title: title || 'Opportunity Decision',
		bounds: { w: 1225, h: 600 },
		artifacts,
		relations,
	})
}

export function buildOpportunitySolutionTreeBlueprint(options: WorkbenchBlueprintOptions): WorkbenchBlueprint {
	const { scope, startDate, owner, title } = parseOptions(options, DEFAULT_OPPORTUNITY_OWNER)
	const artifacts: WorkbenchBlueprintArtifact[] = []
	const add = (input: ArtifactInput) => {
		const artifact = createArtifact(scope, input)
		artifacts.push(artifact)
		return artifact
	}

	const outcome = add({
		key: 'desired-outcome',
		kind: 'outcome',
		title: 'Increase weekly activated teams',
		summary: 'A measurable customer outcome, not a feature output.',
		status: 'active',
		owner,
		startAt: startDate,
		tags: ['desired-outcome', 'metric'],
		visual: {
			role: 'milestone',
			tone: 'teal',
			geometry: { x: 490, y: 35, w: 300, h: 115, geo: 'diamond' },
		},
	})
	const firstValue = add({
		key: 'first-value',
		kind: 'opportunity',
		title: 'Reach first value faster',
		summary: 'New teams need a useful artifact in their first session.',
		status: 'proposed',
		owner,
		startAt: startDate,
		tags: ['opportunity'],
		visual: {
			role: 'bar',
			tone: 'cyan',
			geometry: { x: 70, y: 220, w: 270, h: 110, geo: 'rectangle' },
		},
	})
	const confidence = add({
		key: 'confidence',
		kind: 'opportunity',
		title: 'Increase decision confidence',
		summary: 'Teams need evidence and rationale beside each decision.',
		status: 'proposed',
		owner,
		startAt: startDate,
		tags: ['opportunity'],
		visual: {
			role: 'bar',
			tone: 'violet',
			geometry: { x: 505, y: 220, w: 270, h: 110, geo: 'rectangle' },
		},
	})
	const continuity = add({
		key: 'continuity',
		kind: 'opportunity',
		title: 'Resume without reconstruction',
		summary: 'Teams lose momentum when context must be rebuilt.',
		status: 'proposed',
		owner,
		startAt: startDate,
		tags: ['opportunity'],
		visual: {
			role: 'bar',
			tone: 'amber',
			geometry: { x: 940, y: 220, w: 270, h: 110, geo: 'rectangle' },
		},
	})
	const guidedStarter = add({
		key: 'guided-starter',
		kind: 'initiative',
		title: 'Guided native starter',
		status: 'planned',
		owner,
		tags: ['solution'],
		visual: {
			role: 'bar',
			tone: 'cyan',
			geometry: { x: 35, y: 425, w: 220, h: 90, geo: 'rectangle' },
		},
	})
	const intentPrompt = add({
		key: 'intent-prompt',
		kind: 'initiative',
		title: 'Intent-first prompt',
		status: 'planned',
		owner,
		tags: ['solution'],
		visual: {
			role: 'bar',
			tone: 'cyan',
			geometry: { x: 285, y: 425, w: 220, h: 90, geo: 'rectangle' },
		},
	})
	const evidencePanel = add({
		key: 'evidence-panel',
		kind: 'initiative',
		title: 'Evidence + rationale panel',
		status: 'planned',
		owner,
		tags: ['solution'],
		visual: {
			role: 'bar',
			tone: 'violet',
			geometry: { x: 530, y: 425, w: 220, h: 90, geo: 'rectangle' },
		},
	})
	const branchAlternatives = add({
		key: 'branch-alternatives',
		kind: 'initiative',
		title: 'Branch alternatives',
		status: 'planned',
		owner,
		tags: ['solution'],
		visual: {
			role: 'bar',
			tone: 'violet',
			geometry: { x: 780, y: 425, w: 220, h: 90, geo: 'rectangle' },
		},
	})
	const durableSnapshot = add({
		key: 'durable-snapshot',
		kind: 'initiative',
		title: 'Durable canvas snapshot',
		status: 'planned',
		owner,
		tags: ['solution'],
		visual: {
			role: 'bar',
			tone: 'amber',
			geometry: { x: 1025, y: 425, w: 220, h: 90, geo: 'rectangle' },
		},
	})
	const experiment = add({
		key: 'activation-experiment',
		kind: 'assumption',
		title: 'Experiment: first-value cohort',
		summary: 'Compare completion and week-two return for guided vs blank starts.',
		status: 'planned',
		owner,
		tags: ['experiment', 'evidence'],
		visual: {
			role: 'decision',
			tone: 'teal',
			geometry: { x: 410, y: 620, w: 460, h: 95, geo: 'rectangle' },
		},
	})

	return finalizeBlueprint({
		schema: WORKBENCH_BLUEPRINT_SCHEMA,
		blueprintId: scope,
		pack: 'product',
		kind: 'opportunity-solution-tree',
		title: title || 'Opportunity Solution Tree',
		bounds: { w: 1280, h: 760 },
		artifacts,
		relations: [
			createRelation(scope, 'outcome-contains-first-value', 'contains', outcome, firstValue, undefined, 'straight'),
			createRelation(scope, 'outcome-contains-confidence', 'contains', outcome, confidence, undefined, 'straight'),
			createRelation(scope, 'outcome-contains-continuity', 'contains', outcome, continuity, undefined, 'straight'),
			createRelation(
				scope,
				'first-value-contains-starter',
				'contains',
				firstValue,
				guidedStarter,
				undefined,
				'straight'
			),
			createRelation(scope, 'first-value-contains-prompt', 'contains', firstValue, intentPrompt, undefined, 'straight'),
			createRelation(
				scope,
				'confidence-contains-evidence',
				'contains',
				confidence,
				evidencePanel,
				undefined,
				'straight'
			),
			createRelation(
				scope,
				'confidence-contains-branches',
				'contains',
				confidence,
				branchAlternatives,
				undefined,
				'straight'
			),
			createRelation(
				scope,
				'continuity-contains-snapshot',
				'contains',
				continuity,
				durableSnapshot,
				undefined,
				'straight'
			),
			createRelation(
				scope,
				'experiment-validates-starter',
				'validates',
				experiment,
				guidedStarter,
				undefined,
				'straight'
			),
			createRelation(
				scope,
				'experiment-validates-branches',
				'validates',
				experiment,
				branchAlternatives,
				undefined,
				'straight'
			),
		],
	})
}

export function buildImpactMapBlueprint(options: WorkbenchBlueprintOptions): WorkbenchBlueprint {
	const { scope, startDate, owner, title } = parseOptions(options, DEFAULT_OPPORTUNITY_OWNER)
	const artifacts: WorkbenchBlueprintArtifact[] = []
	const add = (input: ArtifactInput) => {
		const artifact = createArtifact(scope, input)
		artifacts.push(artifact)
		return artifact
	}
	const lanes = [
		{ key: 'lane-why', title: 'WHY · Goal', x: 20 },
		{ key: 'lane-who', title: 'WHO · Actors', x: 340 },
		{ key: 'lane-how', title: 'HOW · Impacts', x: 660 },
		{ key: 'lane-what', title: 'WHAT · Deliverables', x: 980 },
	].map((lane) =>
		add({
			key: lane.key,
			kind: 'timeline-lane',
			title: lane.title,
			status: 'active',
			owner,
			startAt: startDate,
			visual: {
				role: 'lane',
				tone: 'neutral',
				geometry: { x: lane.x, y: 35, w: 300, h: 560, geo: 'rectangle' },
			},
		})
	)
	const goal = add({
		key: 'goal',
		kind: 'outcome',
		title: 'Reduce planning cycle time 30%',
		status: 'active',
		owner,
		laneKey: 'lane-why',
		tags: ['goal', 'metric'],
		visual: {
			role: 'milestone',
			tone: 'teal',
			geometry: { x: 65, y: 275, w: 210, h: 125, geo: 'diamond' },
		},
	})
	const productTeam = add({
		key: 'product-team',
		kind: 'opportunity',
		title: 'Product team',
		status: 'active',
		owner,
		laneKey: 'lane-who',
		tags: ['actor'],
		visual: {
			role: 'bar',
			tone: 'cyan',
			geometry: { x: 385, y: 165, w: 210, h: 100, geo: 'rectangle' },
		},
	})
	const architect = add({
		key: 'architect',
		kind: 'opportunity',
		title: 'Architect / tech lead',
		status: 'active',
		owner,
		laneKey: 'lane-who',
		tags: ['actor'],
		visual: {
			role: 'bar',
			tone: 'violet',
			geometry: { x: 385, y: 430, w: 210, h: 100, geo: 'rectangle' },
		},
	})
	const compareEarlier = add({
		key: 'compare-earlier',
		kind: 'outcome',
		title: 'Compare alternatives earlier',
		status: 'proposed',
		owner,
		laneKey: 'lane-how',
		tags: ['impact'],
		visual: {
			role: 'bar',
			tone: 'cyan',
			geometry: { x: 705, y: 145, w: 210, h: 100, geo: 'rectangle' },
		},
	})
	const preserveRationale = add({
		key: 'preserve-rationale',
		kind: 'outcome',
		title: 'Preserve rationale in context',
		status: 'proposed',
		owner,
		laneKey: 'lane-how',
		tags: ['impact'],
		visual: {
			role: 'bar',
			tone: 'violet',
			geometry: { x: 705, y: 300, w: 210, h: 100, geo: 'rectangle' },
		},
	})
	const boundChanges = add({
		key: 'bound-changes',
		kind: 'outcome',
		title: 'Bound risky canvas changes',
		status: 'proposed',
		owner,
		laneKey: 'lane-how',
		tags: ['impact'],
		visual: {
			role: 'bar',
			tone: 'amber',
			geometry: { x: 705, y: 455, w: 210, h: 100, geo: 'rectangle' },
		},
	})
	const branchCompare = add({
		key: 'branch-compare',
		kind: 'initiative',
		title: 'Branch comparison graph',
		status: 'planned',
		owner,
		laneKey: 'lane-what',
		tags: ['deliverable'],
		visual: {
			role: 'bar',
			tone: 'cyan',
			geometry: { x: 1025, y: 130, w: 210, h: 90, geo: 'rectangle' },
		},
	})
	const adrOutcome = add({
		key: 'adr-outcome',
		kind: 'decision',
		title: 'ADR-style outcome',
		status: 'planned',
		owner,
		laneKey: 'lane-what',
		tags: ['deliverable'],
		visual: {
			role: 'decision',
			tone: 'violet',
			geometry: { x: 1025, y: 290, w: 210, h: 100, geo: 'rectangle' },
		},
	})
	const scopedMutation = add({
		key: 'scoped-mutation',
		kind: 'initiative',
		title: 'Scoped mutation receipt',
		status: 'planned',
		owner,
		laneKey: 'lane-what',
		tags: ['deliverable'],
		visual: {
			role: 'bar',
			tone: 'amber',
			geometry: { x: 1025, y: 465, w: 210, h: 90, geo: 'rectangle' },
		},
	})

	return finalizeBlueprint({
		schema: WORKBENCH_BLUEPRINT_SCHEMA,
		blueprintId: scope,
		pack: 'product',
		kind: 'impact-map',
		title: title || 'Impact Map',
		bounds: { w: 1300, h: 630 },
		artifacts,
		relations: [
			createRelation(scope, 'goal-contains-product-team', 'contains', goal, productTeam, undefined, 'straight'),
			createRelation(scope, 'goal-contains-architect', 'contains', goal, architect, undefined, 'straight'),
			createRelation(
				scope,
				'product-team-informs-compare',
				'informs',
				productTeam,
				compareEarlier,
				undefined,
				'straight'
			),
			createRelation(
				scope,
				'product-team-informs-rationale',
				'informs',
				productTeam,
				preserveRationale,
				undefined,
				'straight'
			),
			createRelation(
				scope,
				'architect-informs-rationale',
				'informs',
				architect,
				preserveRationale,
				undefined,
				'straight'
			),
			createRelation(scope, 'architect-informs-bounds', 'informs', architect, boundChanges, undefined, 'straight'),
			createRelation(
				scope,
				'compare-implements-branch',
				'implements',
				compareEarlier,
				branchCompare,
				undefined,
				'straight'
			),
			createRelation(
				scope,
				'rationale-implements-adr',
				'implements',
				preserveRationale,
				adrOutcome,
				undefined,
				'straight'
			),
			createRelation(
				scope,
				'bounds-implements-receipt',
				'implements',
				boundChanges,
				scopedMutation,
				undefined,
				'straight'
			),
		],
	})
}

export function buildServiceBlueprint(options: WorkbenchBlueprintOptions): WorkbenchBlueprint {
	const { scope, startDate, owner, title } = parseOptions(options, DEFAULT_OPPORTUNITY_OWNER)
	const artifacts: WorkbenchBlueprintArtifact[] = []
	const add = (input: ArtifactInput) => {
		const artifact = createArtifact(scope, input)
		artifacts.push(artifact)
		return artifact
	}
	for (const lane of [
		{ key: 'lane-customer', title: 'CUSTOMER', y: 55 },
		{
			key: 'lane-frontstage',
			title: 'FRONTSTAGE',
			y: 220,
		},
		{ key: 'lane-backstage', title: 'BACKSTAGE', y: 385 },
		{ key: 'lane-support', title: 'SUPPORT', y: 550 },
	]) {
		add({
			key: lane.key,
			kind: 'timeline-lane',
			title: lane.title,
			status: 'active',
			owner,
			startAt: startDate,
			visual: {
				role: 'lane',
				tone: 'neutral',
				geometry: { x: 35, y: lane.y, w: 1250, h: 135, geo: 'rectangle' },
			},
		})
	}
	const discover = add({
		key: 'discover',
		kind: 'milestone',
		title: 'Discover',
		status: 'active',
		owner,
		laneKey: 'lane-customer',
		tags: ['journey-step'],
		visual: {
			role: 'milestone',
			tone: 'cyan',
			geometry: { x: 105, y: 95, w: 160, h: 72, geo: 'rectangle' },
		},
	})
	const decide = add({
		key: 'decide',
		kind: 'milestone',
		title: 'Decide',
		status: 'planned',
		owner,
		laneKey: 'lane-customer',
		tags: ['journey-step'],
		visual: {
			role: 'milestone',
			tone: 'violet',
			geometry: { x: 445, y: 95, w: 160, h: 72, geo: 'rectangle' },
		},
	})
	const act = add({
		key: 'act',
		kind: 'milestone',
		title: 'Act',
		status: 'planned',
		owner,
		laneKey: 'lane-customer',
		tags: ['journey-step'],
		visual: {
			role: 'milestone',
			tone: 'teal',
			geometry: { x: 785, y: 95, w: 160, h: 72, geo: 'rectangle' },
		},
	})
	const learn = add({
		key: 'learn',
		kind: 'milestone',
		title: 'Learn',
		status: 'planned',
		owner,
		laneKey: 'lane-customer',
		tags: ['journey-step'],
		visual: {
			role: 'milestone',
			tone: 'amber',
			geometry: { x: 1120, y: 95, w: 120, h: 72, geo: 'rectangle' },
		},
	})
	const starter = add({
		key: 'starter',
		kind: 'initiative',
		title: 'Choose a visual starter',
		status: 'active',
		owner,
		laneKey: 'lane-frontstage',
		tags: ['touchpoint'],
		visual: {
			role: 'bar',
			tone: 'cyan',
			geometry: { x: 75, y: 260, w: 220, h: 72, geo: 'rectangle' },
		},
	})
	const compare = add({
		key: 'compare',
		kind: 'initiative',
		title: 'Compare branch alternatives',
		status: 'planned',
		owner,
		laneKey: 'lane-frontstage',
		tags: ['touchpoint'],
		visual: {
			role: 'bar',
			tone: 'violet',
			geometry: { x: 415, y: 260, w: 220, h: 72, geo: 'rectangle' },
		},
	})
	const receipt = add({
		key: 'receipt',
		kind: 'initiative',
		title: 'Review change receipt',
		status: 'planned',
		owner,
		laneKey: 'lane-frontstage',
		tags: ['touchpoint'],
		visual: {
			role: 'bar',
			tone: 'teal',
			geometry: { x: 755, y: 260, w: 220, h: 72, geo: 'rectangle' },
		},
	})
	const agent = add({
		key: 'agent',
		kind: 'initiative',
		title: 'Bounded agent context',
		status: 'active',
		owner,
		laneKey: 'lane-backstage',
		tags: ['backstage'],
		visual: {
			role: 'bar',
			tone: 'cyan',
			geometry: { x: 75, y: 425, w: 220, h: 72, geo: 'rectangle' },
		},
	})
	const decisionGraph = add({
		key: 'decision-graph',
		kind: 'decision',
		title: 'Decision + ADR',
		status: 'planned',
		owner,
		laneKey: 'lane-backstage',
		tags: ['backstage'],
		visual: {
			role: 'decision',
			tone: 'violet',
			geometry: { x: 415, y: 425, w: 220, h: 72, geo: 'rectangle' },
		},
	})
	const executor = add({
		key: 'executor',
		kind: 'initiative',
		title: 'Validated canvas executor',
		status: 'planned',
		owner,
		laneKey: 'lane-backstage',
		tags: ['backstage'],
		visual: {
			role: 'bar',
			tone: 'teal',
			geometry: { x: 755, y: 425, w: 220, h: 72, geo: 'rectangle' },
		},
	})
	const memory = add({
		key: 'memory',
		kind: 'assumption',
		title: 'Artifact metadata + branch lineage',
		status: 'active',
		owner,
		laneKey: 'lane-support',
		tags: ['support-process'],
		visual: {
			role: 'bar',
			tone: 'amber',
			geometry: { x: 385, y: 590, w: 280, h: 72, geo: 'rectangle' },
		},
	})
	const measures = add({
		key: 'measures',
		kind: 'outcome',
		title: 'Activation + confidence',
		status: 'planned',
		owner,
		laneKey: 'lane-support',
		tags: ['evidence'],
		visual: {
			role: 'milestone',
			tone: 'teal',
			geometry: { x: 1040, y: 590, w: 240, h: 72, geo: 'rectangle' },
		},
	})

	return finalizeBlueprint({
		schema: WORKBENCH_BLUEPRINT_SCHEMA,
		blueprintId: scope,
		pack: 'product',
		kind: 'service-blueprint',
		title: title || 'User Journey / Service Blueprint',
		bounds: { w: 1320, h: 730 },
		artifacts,
		relations: [
			createRelation(scope, 'starter-supports-discover', 'implements', starter, discover),
			createRelation(scope, 'compare-supports-decide', 'implements', compare, decide),
			createRelation(scope, 'receipt-supports-act', 'implements', receipt, act),
			createRelation(scope, 'agent-supports-starter', 'implements', agent, starter),
			createRelation(scope, 'graph-supports-compare', 'implements', decisionGraph, compare),
			createRelation(scope, 'executor-supports-receipt', 'implements', executor, receipt),
			createRelation(scope, 'memory-informs-graph', 'informs', memory, decisionGraph),
			createRelation(scope, 'measures-validate-learn', 'validates', measures, learn),
		],
	})
}

export function validateWorkbenchBlueprint(blueprint: WorkbenchBlueprint): string[] {
	const errors: string[] = []
	const artifactsById = new Map<string, WorkbenchBlueprintArtifact>()
	const artifactsByShapeId = new Map<string, WorkbenchBlueprintArtifact>()
	const relationIds = new Set<string>()
	const relationShapeIds = new Set<string>()

	if (blueprint.schema !== WORKBENCH_BLUEPRINT_SCHEMA) {
		errors.push(`Unsupported blueprint schema ${blueprint.schema}`)
	}
	if (blueprint.pack !== 'product') errors.push(`Unsupported blueprint pack ${blueprint.pack}`)
	if (!(blueprint.bounds.w > 0) || !(blueprint.bounds.h > 0)) {
		errors.push('Blueprint bounds must be positive')
	}

	for (const item of blueprint.artifacts) {
		const parsed = parseWorkbenchArtifactSafely(item.artifact)
		if (parsed) errors.push(`Artifact ${item.artifact.artifactId}: ${parsed}`)
		if (item.artifact.pack !== blueprint.pack) {
			errors.push(`Artifact ${item.artifact.artifactId} belongs to pack ${item.artifact.pack}`)
		}
		if (artifactsById.has(item.artifact.artifactId)) {
			errors.push(`Duplicate artifact id ${item.artifact.artifactId}`)
		}
		if (artifactsByShapeId.has(item.shapeId)) {
			errors.push(`Duplicate artifact shape id ${item.shapeId}`)
		}
		artifactsById.set(item.artifact.artifactId, item)
		artifactsByShapeId.set(item.shapeId, item)

		const geometry = item.visual.geometry
		if (
			![geometry.x, geometry.y, geometry.w, geometry.h].every(Number.isFinite) ||
			geometry.w <= 0 ||
			geometry.h <= 0
		) {
			errors.push(`Artifact ${item.artifact.artifactId} has invalid geometry`)
		}
	}

	for (const item of blueprint.relations) {
		const parsed = parseWorkbenchRelationSafely(item.relation)
		if (parsed) errors.push(`Relation ${item.relation.relationId}: ${parsed}`)
		if (item.relation.pack !== blueprint.pack) {
			errors.push(`Relation ${item.relation.relationId} belongs to pack ${item.relation.pack}`)
		}
		if (relationIds.has(item.relation.relationId)) {
			errors.push(`Duplicate relation id ${item.relation.relationId}`)
		}
		if (relationShapeIds.has(item.shapeId) || artifactsByShapeId.has(item.shapeId)) {
			errors.push(`Duplicate relation shape id ${item.shapeId}`)
		}
		relationIds.add(item.relation.relationId)
		relationShapeIds.add(item.shapeId)

		for (const [terminal, binding] of [
			['start', item.relation.start],
			['end', item.relation.end],
		] as const) {
			const artifact = artifactsById.get(binding.artifactId)
			if (!artifact) {
				errors.push(`Relation ${item.relation.relationId} ${terminal} targets missing artifact ${binding.artifactId}`)
			} else if (artifact.shapeId !== binding.shapeId) {
				errors.push(
					`Relation ${item.relation.relationId} ${terminal} binding does not match artifact shape ${artifact.shapeId}`
				)
			}
		}
	}

	for (const item of blueprint.artifacts) {
		for (const reference of item.artifact.refs) {
			if (reference.kind === 'artifact' && !artifactsById.has(reference.target)) {
				errors.push(`Artifact ${item.artifact.artifactId} references missing artifact ${reference.target}`)
			}
		}
	}

	return errors
}

function parseWorkbenchArtifactSafely(value: unknown): string | null {
	try {
		parseWorkbenchArtifact(value)
		return null
	} catch (error) {
		return error instanceof Error ? error.message : String(error)
	}
}

function parseWorkbenchRelationSafely(value: unknown): string | null {
	try {
		parseWorkbenchRelation(value)
		return null
	} catch (error) {
		return error instanceof Error ? error.message : String(error)
	}
}
