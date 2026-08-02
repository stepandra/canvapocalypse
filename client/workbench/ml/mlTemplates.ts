import {
	parseWorkbenchArtifact,
	parseWorkbenchRelation,
	WORKBENCH_ARTIFACT_SCHEMA,
	WORKBENCH_RELATION_SCHEMA,
	WORKBENCH_SCHEMA_VERSION,
	type WorkbenchArtifact,
	type WorkbenchArtifactStatus,
	type WorkbenchRelation,
	type WorkbenchRelationType,
	type WorkbenchShapeId,
} from '../../../shared/types/WorkbenchArtifact'

/**
 * Pure, renderer-independent starter data for native tldraw ML / LLM diagrams.
 *
 * A renderer may turn every node into a normal geo, note, or text shape and
 * every relation into a bound arrow. No template depends on an external canvas
 * provider or a remote icon catalogue.
 */
export const ML_WORKBENCH_TEMPLATE_SCHEMA = 'ml-workbench-template/v1' as const

export const ML_TEMPLATE_IDS = [
	'experiment-loop',
	'evaluation-pipeline',
	'model-delivery-map',
] as const

export type MlTemplateId = (typeof ML_TEMPLATE_IDS)[number]
export type MlWorkbenchArtifact = Extract<WorkbenchArtifact, { pack: 'ml' }>
export type MlArtifactKind = MlWorkbenchArtifact['kind']

export type MlNodeRole =
	| 'research-question'
	| 'dataset'
	| 'experiment'
	| 'training-job'
	| 'candidate-model'
	| 'evaluation'
	| 'scorecard'
	| 'decision'
	| 'risk'
	| 'pipeline'
	| 'package-job'
	| 'serving-model'
	| 'data-contract'

export type MlNativePrimitive = 'geo' | 'note' | 'text'
export type MlGeo = 'rectangle' | 'ellipse' | 'diamond' | 'hexagon'
export type MlColor =
	| 'black'
	| 'grey'
	| 'blue'
	| 'light-blue'
	| 'green'
	| 'light-green'
	| 'orange'
	| 'yellow'
	| 'violet'
	| 'light-violet'
	| 'red'

export interface MlNodeBlueprint {
	shapeId: WorkbenchShapeId
	text: string
	role: MlNodeRole
	geometry: {
		x: number
		y: number
		w: number
		h: number
	}
	visual: {
		primitive: MlNativePrimitive
		geo: MlGeo
		color: MlColor
		fill: 'none' | 'tint' | 'background' | 'solid'
		dash: 'solid' | 'dashed' | 'dotted'
	}
	meta: {
		templateId: MlTemplateId
		workbenchArtifact: MlWorkbenchArtifact
	}
}

export interface MlRelationBlueprint {
	shapeId: WorkbenchShapeId
	text: string
	visual: {
		color: MlColor
		dash: 'solid' | 'dashed' | 'dotted'
		route: 'straight' | 'elbow' | 'curved'
		arrowheadEnd: 'arrow'
	}
	meta: {
		templateId: MlTemplateId
		workbenchRelation: WorkbenchRelation
	}
}

export interface MlTemplateBlueprint {
	schema: typeof ML_WORKBENCH_TEMPLATE_SCHEMA
	id: MlTemplateId
	title: string
	description: string
	canvas: {
		w: number
		h: number
	}
	nodes: MlNodeBlueprint[]
	relations: MlRelationBlueprint[]
}

interface NodeInput {
	key: string
	text: string
	role: MlNodeRole
	kind: MlArtifactKind
	status: WorkbenchArtifactStatus
	summary?: string
	tags?: string[]
	x: number
	y: number
	w: number
	h: number
	primitive?: MlNativePrimitive
	geo?: MlGeo
	color: MlColor
	fill?: MlNodeBlueprint['visual']['fill']
	dash?: MlNodeBlueprint['visual']['dash']
}

function artifactId(templateId: MlTemplateId, key: string): string {
	return `ml:${templateId}:artifact:${key}`
}

function nodeShapeId(templateId: MlTemplateId, key: string): WorkbenchShapeId {
	return `shape:ml-${templateId}-${key}` as WorkbenchShapeId
}

function relationShapeId(templateId: MlTemplateId, key: string): WorkbenchShapeId {
	return `shape:ml-${templateId}-relation-${key}` as WorkbenchShapeId
}

function createNode(templateId: MlTemplateId, input: NodeInput): MlNodeBlueprint {
	const artifact = parseWorkbenchArtifact({
		schema: WORKBENCH_ARTIFACT_SCHEMA,
		artifactId: artifactId(templateId, input.key),
		pack: 'ml',
		kind: input.kind,
		title: input.text.split('\n')[0],
		...(input.summary ? { summary: input.summary } : {}),
		status: input.status,
		refs: [],
		tags: input.tags ?? [],
		version: WORKBENCH_SCHEMA_VERSION,
	})

	return {
		shapeId: nodeShapeId(templateId, input.key),
		text: input.text,
		role: input.role,
		geometry: {
			x: input.x,
			y: input.y,
			w: input.w,
			h: input.h,
		},
		visual: {
			primitive: input.primitive ?? 'geo',
			geo: input.geo ?? 'rectangle',
			color: input.color,
			fill: input.fill ?? 'tint',
			dash: input.dash ?? 'solid',
		},
		meta: {
			templateId,
			workbenchArtifact: artifact as MlWorkbenchArtifact,
		},
	}
}

function createRelation(
	templateId: MlTemplateId,
	key: string,
	type: WorkbenchRelationType,
	start: MlNodeBlueprint,
	end: MlNodeBlueprint,
	text: string,
	options: Partial<MlRelationBlueprint['visual']> = {}
): MlRelationBlueprint {
	return {
		shapeId: relationShapeId(templateId, key),
		text,
		visual: {
			color: options.color ?? 'grey',
			dash: options.dash ?? 'solid',
			route: options.route ?? 'elbow',
			arrowheadEnd: 'arrow',
		},
		meta: {
			templateId,
			workbenchRelation: parseWorkbenchRelation({
				schema: WORKBENCH_RELATION_SCHEMA,
				relationId: `ml:${templateId}:relation:${key}`,
				pack: 'ml',
				type,
				start: {
					artifactId: start.meta.workbenchArtifact.artifactId,
					shapeId: start.shapeId,
				},
				end: {
					artifactId: end.meta.workbenchArtifact.artifactId,
					shapeId: end.shapeId,
				},
				label: text,
				version: WORKBENCH_SCHEMA_VERSION,
			}),
		},
	}
}

function buildExperimentLoop(): MlTemplateBlueprint {
	const templateId = 'experiment-loop'
	const nodes: MlNodeBlueprint[] = []
	const add = (input: NodeInput) => {
		const node = createNode(templateId, input)
		nodes.push(node)
		return node
	}

	const question = add({
		key: 'research-question',
		text: 'Research question\nWhat measurable claim are we testing?',
		role: 'research-question',
		kind: 'assumption',
		status: 'proposed',
		x: 430,
		y: 35,
		w: 390,
		h: 105,
		primitive: 'text',
		geo: 'rectangle',
		color: 'black',
		fill: 'none',
	})
	const dataset = add({
		key: 'dataset-slice',
		text: 'Dataset slice\nVersioned inputs + provenance',
		role: 'dataset',
		kind: 'dataset',
		status: 'ready',
		x: 40,
		y: 240,
		w: 230,
		h: 135,
		color: 'light-blue',
		geo: 'ellipse',
		tags: ['versioned', 'bounded'],
	})
	const experiment = add({
		key: 'experiment-plan',
		text: 'Experiment plan\nHypothesis, variables, budget',
		role: 'experiment',
		kind: 'experiment',
		status: 'planned',
		x: 325,
		y: 220,
		w: 245,
		h: 155,
		color: 'violet',
		geo: 'hexagon',
	})
	const trainingJob = add({
		key: 'training-job',
		text: 'Training job\nConfig + bounded compute',
		role: 'training-job',
		kind: 'job',
		status: 'planned',
		x: 625,
		y: 220,
		w: 225,
		h: 155,
		color: 'orange',
	})
	const candidate = add({
		key: 'candidate-model',
		text: 'Candidate model\nWeights + model card',
		role: 'candidate-model',
		kind: 'model',
		status: 'draft',
		x: 925,
		y: 240,
		w: 235,
		h: 135,
		color: 'violet',
		geo: 'ellipse',
	})
	const evaluation = add({
		key: 'evaluation',
		text: 'Evaluation\nMetrics, slices, regressions',
		role: 'evaluation',
		kind: 'evaluation',
		status: 'planned',
		x: 760,
		y: 505,
		w: 250,
		h: 140,
		color: 'light-blue',
	})
	const decision = add({
		key: 'decision',
		text: 'Decision\nIterate, stop, or promote',
		role: 'decision',
		kind: 'decision',
		status: 'proposed',
		x: 375,
		y: 515,
		w: 270,
		h: 125,
		primitive: 'note',
		geo: 'diamond',
		color: 'yellow',
	})

	return {
		schema: ML_WORKBENCH_TEMPLATE_SCHEMA,
		id: templateId,
		title: 'Experiment Loop',
		description:
			'An editable hypothesis-to-evidence loop with explicit data, compute, evaluation, and decision artifacts.',
		canvas: { w: 1240, h: 720 },
		nodes,
		relations: [
			createRelation(templateId, 'question-informs-plan', 'informs', question, experiment, 'Frames'),
			createRelation(templateId, 'data-informs-plan', 'informs', dataset, experiment, 'Constrains', {
				color: 'light-blue',
			}),
			createRelation(templateId, 'plan-contains-job', 'contains', experiment, trainingJob, 'Runs'),
			createRelation(templateId, 'job-implements-model', 'implements', trainingJob, candidate, 'Produces', {
				color: 'violet',
			}),
			createRelation(templateId, 'model-informs-evaluation', 'informs', candidate, evaluation, 'Evaluate', {
				color: 'light-blue',
				route: 'curved',
			}),
			createRelation(templateId, 'evaluation-informs-decision', 'informs', evaluation, decision, 'Evidence', {
				color: 'light-blue',
			}),
			createRelation(templateId, 'decision-informs-next-loop', 'informs', decision, experiment, 'Next iteration', {
				color: 'green',
				dash: 'dashed',
				route: 'curved',
			}),
		],
	}
}

function buildEvaluationPipeline(): MlTemplateBlueprint {
	const templateId = 'evaluation-pipeline'
	const nodes: MlNodeBlueprint[] = []
	const add = (input: NodeInput) => {
		const node = createNode(templateId, input)
		nodes.push(node)
		return node
	}

	const candidate = add({
		key: 'candidate-model',
		text: 'Candidate model\nImmutable revision',
		role: 'candidate-model',
		kind: 'model',
		status: 'ready',
		x: 35,
		y: 135,
		w: 225,
		h: 125,
		color: 'violet',
		geo: 'ellipse',
	})
	const dataset = add({
		key: 'evaluation-dataset',
		text: 'Evaluation dataset\nGolden cases + slices',
		role: 'dataset',
		kind: 'dataset',
		status: 'ready',
		x: 35,
		y: 405,
		w: 225,
		h: 125,
		color: 'light-blue',
		geo: 'ellipse',
	})
	const pipeline = add({
		key: 'evaluation-pipeline',
		text: 'Evaluation pipeline\nReproducible harness',
		role: 'pipeline',
		kind: 'pipeline',
		status: 'active',
		x: 340,
		y: 255,
		w: 245,
		h: 150,
		color: 'blue',
		geo: 'hexagon',
	})
	const evaluation = add({
		key: 'evaluation-run',
		text: 'Evaluation run\nQuality, safety, latency, cost',
		role: 'evaluation',
		kind: 'evaluation',
		status: 'planned',
		x: 665,
		y: 255,
		w: 260,
		h: 150,
		color: 'light-blue',
	})
	const scorecard = add({
		key: 'scorecard',
		text: 'Scorecard\nThresholds + deltas',
		role: 'scorecard',
		kind: 'evaluation',
		status: 'draft',
		x: 1005,
		y: 255,
		w: 225,
		h: 150,
		color: 'green',
	})
	const decision = add({
		key: 'promotion-decision',
		text: 'Promotion decision\nApprove, reject, or investigate',
		role: 'decision',
		kind: 'decision',
		status: 'proposed',
		x: 1310,
		y: 255,
		w: 250,
		h: 150,
		color: 'yellow',
		geo: 'diamond',
	})
	const risk = add({
		key: 'evaluation-risk',
		text: 'Risk / blind spot\nMissing slice, leakage, or weak rubric',
		role: 'risk',
		kind: 'risk',
		status: 'active',
		x: 1000,
		y: 535,
		w: 285,
		h: 120,
		primitive: 'note',
		geo: 'rectangle',
		color: 'red',
		fill: 'tint',
	})

	return {
		schema: ML_WORKBENCH_TEMPLATE_SCHEMA,
		id: templateId,
		title: 'Evaluation Pipeline',
		description:
			'A two-input evaluation path that keeps evidence, blind spots, thresholds, and promotion authority explicit.',
		canvas: { w: 1620, h: 720 },
		nodes,
		relations: [
			createRelation(templateId, 'model-informs-pipeline', 'informs', candidate, pipeline, 'Candidate', {
				color: 'violet',
			}),
			createRelation(templateId, 'data-informs-pipeline', 'informs', dataset, pipeline, 'Cases', {
				color: 'light-blue',
			}),
			createRelation(templateId, 'pipeline-contains-run', 'contains', pipeline, evaluation, 'Executes'),
			createRelation(templateId, 'run-informs-scorecard', 'informs', evaluation, scorecard, 'Measures', {
				color: 'light-blue',
			}),
			createRelation(templateId, 'scorecard-validates-model', 'validates', scorecard, candidate, 'Validates', {
				color: 'green',
				dash: 'dashed',
				route: 'curved',
			}),
			createRelation(templateId, 'scorecard-informs-decision', 'informs', scorecard, decision, 'Evidence', {
				color: 'green',
			}),
			createRelation(templateId, 'risk-informs-decision', 'informs', risk, decision, 'Caveat', {
				color: 'red',
				dash: 'dotted',
			}),
		],
	}
}

function buildModelDeliveryMap(): MlTemplateBlueprint {
	const templateId = 'model-delivery-map'
	const nodes: MlNodeBlueprint[] = []
	const add = (input: NodeInput) => {
		const node = createNode(templateId, input)
		nodes.push(node)
		return node
	}

	const approvedModel = add({
		key: 'approved-model',
		text: 'Approved model\nSigned revision + model card',
		role: 'candidate-model',
		kind: 'model',
		status: 'approved',
		x: 35,
		y: 230,
		w: 235,
		h: 140,
		color: 'violet',
		geo: 'ellipse',
	})
	const releaseGate = add({
		key: 'release-gate',
		text: 'Release gate\nEvidence meets policy',
		role: 'evaluation',
		kind: 'evaluation',
		status: 'ready',
		x: 335,
		y: 230,
		w: 225,
		h: 140,
		color: 'green',
		geo: 'diamond',
	})
	const packaging = add({
		key: 'packaging-pipeline',
		text: 'Packaging pipeline\nRuntime contract + provenance',
		role: 'pipeline',
		kind: 'pipeline',
		status: 'active',
		x: 625,
		y: 220,
		w: 250,
		h: 160,
		color: 'blue',
		geo: 'hexagon',
	})
	const deliveryJob = add({
		key: 'delivery-job',
		text: 'Delivery job\nStaged rollout + rollback',
		role: 'package-job',
		kind: 'job',
		status: 'planned',
		x: 955,
		y: 230,
		w: 235,
		h: 140,
		color: 'orange',
	})
	const servingModel = add({
		key: 'serving-model',
		text: 'Serving model\nObserved runtime revision',
		role: 'serving-model',
		kind: 'model',
		status: 'planned',
		x: 1270,
		y: 230,
		w: 235,
		h: 140,
		color: 'violet',
		geo: 'ellipse',
	})
	const dataContract = add({
		key: 'data-contract',
		text: 'Data contract\nFeatures, privacy, retention',
		role: 'data-contract',
		kind: 'dataset',
		status: 'active',
		x: 625,
		y: 500,
		w: 265,
		h: 125,
		color: 'light-blue',
	})
	const rolloutRisk = add({
		key: 'rollout-risk',
		text: 'Rollout risk\nDrift, capacity, or rollback trigger',
		role: 'risk',
		kind: 'risk',
		status: 'active',
		x: 965,
		y: 500,
		w: 280,
		h: 125,
		primitive: 'note',
		geo: 'rectangle',
		color: 'red',
	})

	return {
		schema: ML_WORKBENCH_TEMPLATE_SCHEMA,
		id: templateId,
		title: 'Model Delivery Map',
		description:
			'A release-oriented model path with an evidence gate, reproducible package, bounded rollout, runtime identity, and rollback risk.',
		canvas: { w: 1560, h: 700 },
		nodes,
		relations: [
			createRelation(templateId, 'model-validates-at-gate', 'validates', releaseGate, approvedModel, 'Verified', {
				color: 'green',
				dash: 'dashed',
				route: 'curved',
			}),
			createRelation(templateId, 'model-informs-packaging', 'informs', approvedModel, packaging, 'Revision', {
				color: 'violet',
			}),
			createRelation(templateId, 'gate-blocks-delivery', 'blocks', releaseGate, deliveryJob, 'Must pass', {
				color: 'green',
			}),
			createRelation(templateId, 'packaging-implements-delivery', 'implements', packaging, deliveryJob, 'Package'),
			createRelation(templateId, 'delivery-implements-serving', 'implements', deliveryJob, servingModel, 'Roll out', {
				color: 'orange',
			}),
			createRelation(templateId, 'data-informs-packaging', 'informs', dataContract, packaging, 'Contract', {
				color: 'light-blue',
			}),
			createRelation(templateId, 'risk-informs-delivery', 'informs', rolloutRisk, deliveryJob, 'Guardrail', {
				color: 'red',
				dash: 'dotted',
			}),
		],
	}
}

export const ML_WORKBENCH_TEMPLATES: Readonly<Record<MlTemplateId, MlTemplateBlueprint>> = {
	'experiment-loop': buildExperimentLoop(),
	'evaluation-pipeline': buildEvaluationPipeline(),
	'model-delivery-map': buildModelDeliveryMap(),
}

export function getMlWorkbenchTemplate(templateId: MlTemplateId): MlTemplateBlueprint {
	return ML_WORKBENCH_TEMPLATES[templateId]
}

/**
 * Cross-record checks that the shared artifact schemas cannot express alone.
 * The renderer can run this before creating any tldraw records.
 */
export function validateMlWorkbenchTemplate(template: MlTemplateBlueprint): string[] {
	const errors: string[] = []
	const shapeIds = new Set<string>()
	const artifactIds = new Set<string>()

	if (template.schema !== ML_WORKBENCH_TEMPLATE_SCHEMA) {
		errors.push(`Unexpected template schema: ${template.schema}`)
	}
	if (template.nodes.length === 0) errors.push('Template has no nodes')

	for (const node of template.nodes) {
		const artifact = node.meta.workbenchArtifact
		if (shapeIds.has(node.shapeId)) errors.push(`Duplicate shape id: ${node.shapeId}`)
		if (artifactIds.has(artifact.artifactId)) {
			errors.push(`Duplicate artifact id: ${artifact.artifactId}`)
		}
		shapeIds.add(node.shapeId)
		artifactIds.add(artifact.artifactId)

		if (node.meta.templateId !== template.id) {
			errors.push(`Node ${node.shapeId} belongs to ${node.meta.templateId}`)
		}
		if (artifact.pack !== 'ml') errors.push(`Node ${node.shapeId} is not an ML artifact`)
		if (node.geometry.x < 0 || node.geometry.y < 0) {
			errors.push(`Node ${node.shapeId} starts outside the canvas`)
		}
		if (
			node.geometry.x + node.geometry.w > template.canvas.w ||
			node.geometry.y + node.geometry.h > template.canvas.h
		) {
			errors.push(`Node ${node.shapeId} exceeds the canvas`)
		}
	}

	for (const relation of template.relations) {
		const semantic = relation.meta.workbenchRelation
		if (shapeIds.has(relation.shapeId)) {
			errors.push(`Duplicate shape id: ${relation.shapeId}`)
		}
		shapeIds.add(relation.shapeId)
		if (relation.meta.templateId !== template.id) {
			errors.push(`Relation ${relation.shapeId} belongs to ${relation.meta.templateId}`)
		}
		if (!artifactIds.has(semantic.start.artifactId)) {
			errors.push(`Missing start artifact: ${semantic.start.artifactId}`)
		}
		if (!artifactIds.has(semantic.end.artifactId)) {
			errors.push(`Missing end artifact: ${semantic.end.artifactId}`)
		}
		const startShapeExists = template.nodes.some(
			(node) =>
				node.shapeId === semantic.start.shapeId &&
				node.meta.workbenchArtifact.artifactId === semantic.start.artifactId
		)
		const endShapeExists = template.nodes.some(
			(node) =>
				node.shapeId === semantic.end.shapeId &&
				node.meta.workbenchArtifact.artifactId === semantic.end.artifactId
		)
		if (!startShapeExists) errors.push(`Missing start binding: ${semantic.start.shapeId}`)
		if (!endShapeExists) errors.push(`Missing end binding: ${semantic.end.shapeId}`)
	}

	return errors
}
