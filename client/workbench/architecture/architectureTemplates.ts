/**
 * Pure, renderer-independent starter data for the Architecture workbench pack.
 *
 * The blueprints intentionally use stable logical ids instead of tldraw record
 * ids. A canvas renderer can derive shape ids, create native geo / note shapes,
 * and bind native arrows without making the template data editor-dependent.
 */

export const ARCHITECTURE_TEMPLATE_IDS = [
	'system-context',
	'c4-container',
	'c4-component',
	'service-data-flow',
	'decision-graph',
	'change-radar',
] as const

export type ArchitectureTemplateId = (typeof ARCHITECTURE_TEMPLATE_IDS)[number]

export const WORKBENCH_ARTIFACT_SCHEMA = 'canvapocalypse-workbench-artifact/v1' as const

export type ArchitectureArtifactRole =
	| 'actor'
	| 'boundary'
	| 'system'
	| 'external-system'
	| 'container'
	| 'data-store'
	| 'interface'
	| 'message'
	| 'decision'
	| 'assumption'
	| 'evidence'
	| 'option'
	| 'adr'
	| 'radar-zone'
	| 'change'
	| 'component'
	| 'relationship'

export type ArchitectureArtifactStatus =
	| 'proposed'
	| 'accepted'
	| 'rejected'
	| 'superseded'
	| 'active'
	| 'verified'
	| 'planned'
	| 'in-progress'
	| 'blocked'

export type ArchitectureRelationKind =
	| 'uses'
	| 'depends-on'
	| 'calls'
	| 'reads'
	| 'writes'
	| 'publishes'
	| 'subscribes'
	| 'informs'
	| 'supports'
	| 'considers'
	| 'conflicts'
	| 'records'
	| 'precedes'
	| 'affects'

export interface ArchitectureArtifactMetadata {
	schema: typeof WORKBENCH_ARTIFACT_SCHEMA
	artifactId: string
	pack: 'architecture'
	templateId: ArchitectureTemplateId
	artifactType: 'node' | 'relation'
	role: ArchitectureArtifactRole
	status?: ArchitectureArtifactStatus
	relation?: ArchitectureRelationKind
	/**
	 * Reserved for a real repo-relative document path or URL. Templates do not
	 * invent document targets; a renderer or inspector may attach one later.
	 */
	documentRef?: string
}

export type ArchitectureGeo = 'rectangle' | 'ellipse' | 'diamond' | 'hexagon' | 'cloud'

export type ArchitectureColor =
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

export interface ArchitectureNodeBlueprint {
	id: string
	text: string
	x: number
	y: number
	w: number
	h: number
	zIndex: number
	containerId?: string
	visual: {
		shape: 'geo' | 'note'
		geo: ArchitectureGeo
		color: ArchitectureColor
		fill: 'none' | 'tint' | 'background' | 'solid'
		dash: 'solid' | 'dashed' | 'dotted' | 'draw'
	}
	meta: {
		workbenchArtifact: ArchitectureArtifactMetadata
	}
}

export interface ArchitectureRelationBlueprint {
	id: string
	from: string
	to: string
	text: string
	visual: {
		color: ArchitectureColor
		dash: 'solid' | 'dashed' | 'dotted' | 'draw'
		arrowheadEnd: 'arrow'
	}
	meta: {
		workbenchArtifact: ArchitectureArtifactMetadata & {
			artifactType: 'relation'
			role: 'relationship'
			relation: ArchitectureRelationKind
		}
	}
}

export interface ArchitectureTemplateBlueprint {
	id: ArchitectureTemplateId
	title: string
	description: string
	canvas: {
		w: number
		h: number
	}
	nodes: readonly ArchitectureNodeBlueprint[]
	relations: readonly ArchitectureRelationBlueprint[]
}

function architectureNode(
	templateId: ArchitectureTemplateId,
	key: string,
	text: string,
	geometry: { x: number; y: number; w: number; h: number },
	role: ArchitectureArtifactRole,
	visual: ArchitectureNodeBlueprint['visual'],
	options: {
		status?: ArchitectureArtifactStatus
		zIndex?: number
		containerId?: string
	} = {}
): ArchitectureNodeBlueprint {
	const id = `${templateId}:${key}`
	return {
		id,
		text,
		...geometry,
		zIndex: options.zIndex ?? 1,
		...(options.containerId ? { containerId: options.containerId } : {}),
		visual,
		meta: {
			workbenchArtifact: {
				schema: WORKBENCH_ARTIFACT_SCHEMA,
				artifactId: id,
				pack: 'architecture',
				templateId,
				artifactType: 'node',
				role,
				...(options.status ? { status: options.status } : {}),
			},
		},
	}
}

function architectureRelation(
	templateId: ArchitectureTemplateId,
	key: string,
	fromKey: string,
	toKey: string,
	text: string,
	relation: ArchitectureRelationKind,
	visual: ArchitectureRelationBlueprint['visual']
): ArchitectureRelationBlueprint {
	const id = `${templateId}:${key}`
	return {
		id,
		from: `${templateId}:${fromKey}`,
		to: `${templateId}:${toKey}`,
		text,
		visual,
		meta: {
			workbenchArtifact: {
				schema: WORKBENCH_ARTIFACT_SCHEMA,
				artifactId: id,
				pack: 'architecture',
				templateId,
				artifactType: 'relation',
				role: 'relationship',
				relation,
			},
		},
	}
}

export const ARCHITECTURE_TEMPLATES = {
	'system-context': {
		id: 'system-context',
		title: 'System Context',
		description: 'Editable system boundary, primary actor, core system, and external dependency.',
		canvas: { w: 1280, h: 720 },
		nodes: [
			{
				id: 'system-context:product-boundary',
				text: 'Product boundary',
				x: 330,
				y: 120,
				w: 500,
				h: 480,
				zIndex: 0,
				visual: {
					shape: 'geo',
					geo: 'rectangle',
					color: 'grey',
					fill: 'none',
					dash: 'dashed',
				},
				meta: {
					workbenchArtifact: {
						schema: WORKBENCH_ARTIFACT_SCHEMA,
						artifactId: 'system-context:product-boundary',
						pack: 'architecture',
						templateId: 'system-context',
						artifactType: 'node',
						role: 'boundary',
						status: 'active',
					},
				},
			},
			{
				id: 'system-context:primary-actor',
				text: 'Primary user',
				x: 60,
				y: 285,
				w: 190,
				h: 120,
				zIndex: 1,
				visual: {
					shape: 'geo',
					geo: 'ellipse',
					color: 'blue',
					fill: 'tint',
					dash: 'solid',
				},
				meta: {
					workbenchArtifact: {
						schema: WORKBENCH_ARTIFACT_SCHEMA,
						artifactId: 'system-context:primary-actor',
						pack: 'architecture',
						templateId: 'system-context',
						artifactType: 'node',
						role: 'actor',
						status: 'active',
					},
				},
			},
			{
				id: 'system-context:core-system',
				text: 'Core system\nPrimary responsibility',
				x: 455,
				y: 260,
				w: 250,
				h: 170,
				zIndex: 2,
				containerId: 'system-context:product-boundary',
				visual: {
					shape: 'geo',
					geo: 'rectangle',
					color: 'green',
					fill: 'tint',
					dash: 'solid',
				},
				meta: {
					workbenchArtifact: {
						schema: WORKBENCH_ARTIFACT_SCHEMA,
						artifactId: 'system-context:core-system',
						pack: 'architecture',
						templateId: 'system-context',
						artifactType: 'node',
						role: 'system',
						status: 'active',
					},
				},
			},
			{
				id: 'system-context:external-system',
				text: 'External system\nDependency or collaborator',
				x: 940,
				y: 270,
				w: 270,
				h: 150,
				zIndex: 1,
				visual: {
					shape: 'geo',
					geo: 'cloud',
					color: 'violet',
					fill: 'background',
					dash: 'solid',
				},
				meta: {
					workbenchArtifact: {
						schema: WORKBENCH_ARTIFACT_SCHEMA,
						artifactId: 'system-context:external-system',
						pack: 'architecture',
						templateId: 'system-context',
						artifactType: 'node',
						role: 'external-system',
						status: 'active',
					},
				},
			},
		],
		relations: [
			{
				id: 'system-context:actor-uses-system',
				from: 'system-context:primary-actor',
				to: 'system-context:core-system',
				text: 'Uses',
				visual: {
					color: 'blue',
					dash: 'solid',
					arrowheadEnd: 'arrow',
				},
				meta: {
					workbenchArtifact: {
						schema: WORKBENCH_ARTIFACT_SCHEMA,
						artifactId: 'system-context:actor-uses-system',
						pack: 'architecture',
						templateId: 'system-context',
						artifactType: 'relation',
						role: 'relationship',
						relation: 'uses',
					},
				},
			},
			{
				id: 'system-context:system-depends-on-external',
				from: 'system-context:core-system',
				to: 'system-context:external-system',
				text: 'Depends on',
				visual: {
					color: 'violet',
					dash: 'solid',
					arrowheadEnd: 'arrow',
				},
				meta: {
					workbenchArtifact: {
						schema: WORKBENCH_ARTIFACT_SCHEMA,
						artifactId: 'system-context:system-depends-on-external',
						pack: 'architecture',
						templateId: 'system-context',
						artifactType: 'relation',
						role: 'relationship',
						relation: 'depends-on',
					},
				},
			},
		],
	},
	'decision-graph': {
		id: 'decision-graph',
		title: 'Decision Graph',
		description: 'An inspectable decision with assumptions, evidence, and competing options.',
		canvas: { w: 1360, h: 820 },
		nodes: [
			{
				id: 'decision-graph:assumption',
				text: 'Assumption\nWhat must be true?',
				x: 70,
				y: 110,
				w: 250,
				h: 150,
				zIndex: 1,
				visual: {
					shape: 'note',
					geo: 'rectangle',
					color: 'yellow',
					fill: 'tint',
					dash: 'draw',
				},
				meta: {
					workbenchArtifact: {
						schema: WORKBENCH_ARTIFACT_SCHEMA,
						artifactId: 'decision-graph:assumption',
						pack: 'architecture',
						templateId: 'decision-graph',
						artifactType: 'node',
						role: 'assumption',
						status: 'active',
					},
				},
			},
			{
				id: 'decision-graph:evidence',
				text: 'Evidence\nWhat have we observed?',
				x: 70,
				y: 530,
				w: 250,
				h: 150,
				zIndex: 1,
				visual: {
					shape: 'note',
					geo: 'rectangle',
					color: 'light-blue',
					fill: 'tint',
					dash: 'draw',
				},
				meta: {
					workbenchArtifact: {
						schema: WORKBENCH_ARTIFACT_SCHEMA,
						artifactId: 'decision-graph:evidence',
						pack: 'architecture',
						templateId: 'decision-graph',
						artifactType: 'node',
						role: 'evidence',
						status: 'verified',
					},
				},
			},
			{
				id: 'decision-graph:decision',
				text: 'Decision under review\nState the choice and why it matters',
				x: 500,
				y: 310,
				w: 340,
				h: 190,
				zIndex: 2,
				visual: {
					shape: 'geo',
					geo: 'diamond',
					color: 'green',
					fill: 'tint',
					dash: 'solid',
				},
				meta: {
					workbenchArtifact: {
						schema: WORKBENCH_ARTIFACT_SCHEMA,
						artifactId: 'decision-graph:decision',
						pack: 'architecture',
						templateId: 'decision-graph',
						artifactType: 'node',
						role: 'decision',
						status: 'proposed',
					},
				},
			},
			{
				id: 'decision-graph:option-a',
				text: 'Option A\nBenefits, costs, and risks',
				x: 1010,
				y: 120,
				w: 270,
				h: 150,
				zIndex: 1,
				visual: {
					shape: 'geo',
					geo: 'hexagon',
					color: 'violet',
					fill: 'background',
					dash: 'solid',
				},
				meta: {
					workbenchArtifact: {
						schema: WORKBENCH_ARTIFACT_SCHEMA,
						artifactId: 'decision-graph:option-a',
						pack: 'architecture',
						templateId: 'decision-graph',
						artifactType: 'node',
						role: 'option',
						status: 'proposed',
					},
				},
			},
			{
				id: 'decision-graph:option-b',
				text: 'Option B\nBenefits, costs, and risks',
				x: 1010,
				y: 540,
				w: 270,
				h: 150,
				zIndex: 1,
				visual: {
					shape: 'geo',
					geo: 'hexagon',
					color: 'orange',
					fill: 'background',
					dash: 'solid',
				},
				meta: {
					workbenchArtifact: {
						schema: WORKBENCH_ARTIFACT_SCHEMA,
						artifactId: 'decision-graph:option-b',
						pack: 'architecture',
						templateId: 'decision-graph',
						artifactType: 'node',
						role: 'option',
						status: 'proposed',
					},
				},
			},
			architectureNode(
				'decision-graph',
				'adr-outcome',
				'ADR outcome\nChoice · rationale · consequences · review trigger',
				{ x: 500, y: 650, w: 340, h: 120 },
				'adr',
				{
					shape: 'geo',
					geo: 'rectangle',
					color: 'light-green',
					fill: 'tint',
					dash: 'solid',
				},
				{ status: 'proposed', zIndex: 2 }
			),
		],
		relations: [
			{
				id: 'decision-graph:assumption-informs-decision',
				from: 'decision-graph:assumption',
				to: 'decision-graph:decision',
				text: 'Informs',
				visual: {
					color: 'yellow',
					dash: 'dashed',
					arrowheadEnd: 'arrow',
				},
				meta: {
					workbenchArtifact: {
						schema: WORKBENCH_ARTIFACT_SCHEMA,
						artifactId: 'decision-graph:assumption-informs-decision',
						pack: 'architecture',
						templateId: 'decision-graph',
						artifactType: 'relation',
						role: 'relationship',
						relation: 'informs',
					},
				},
			},
			{
				id: 'decision-graph:evidence-supports-decision',
				from: 'decision-graph:evidence',
				to: 'decision-graph:decision',
				text: 'Supports',
				visual: {
					color: 'blue',
					dash: 'solid',
					arrowheadEnd: 'arrow',
				},
				meta: {
					workbenchArtifact: {
						schema: WORKBENCH_ARTIFACT_SCHEMA,
						artifactId: 'decision-graph:evidence-supports-decision',
						pack: 'architecture',
						templateId: 'decision-graph',
						artifactType: 'relation',
						role: 'relationship',
						relation: 'supports',
					},
				},
			},
			{
				id: 'decision-graph:decision-considers-option-a',
				from: 'decision-graph:decision',
				to: 'decision-graph:option-a',
				text: 'Considers',
				visual: {
					color: 'violet',
					dash: 'solid',
					arrowheadEnd: 'arrow',
				},
				meta: {
					workbenchArtifact: {
						schema: WORKBENCH_ARTIFACT_SCHEMA,
						artifactId: 'decision-graph:decision-considers-option-a',
						pack: 'architecture',
						templateId: 'decision-graph',
						artifactType: 'relation',
						role: 'relationship',
						relation: 'considers',
					},
				},
			},
			{
				id: 'decision-graph:decision-considers-option-b',
				from: 'decision-graph:decision',
				to: 'decision-graph:option-b',
				text: 'Considers',
				visual: {
					color: 'orange',
					dash: 'solid',
					arrowheadEnd: 'arrow',
				},
				meta: {
					workbenchArtifact: {
						schema: WORKBENCH_ARTIFACT_SCHEMA,
						artifactId: 'decision-graph:decision-considers-option-b',
						pack: 'architecture',
						templateId: 'decision-graph',
						artifactType: 'relation',
						role: 'relationship',
						relation: 'considers',
					},
				},
			},
			{
				id: 'decision-graph:options-conflict',
				from: 'decision-graph:option-a',
				to: 'decision-graph:option-b',
				text: 'Trade-off',
				visual: {
					color: 'grey',
					dash: 'dotted',
					arrowheadEnd: 'arrow',
				},
				meta: {
					workbenchArtifact: {
						schema: WORKBENCH_ARTIFACT_SCHEMA,
						artifactId: 'decision-graph:options-conflict',
						pack: 'architecture',
						templateId: 'decision-graph',
						artifactType: 'relation',
						role: 'relationship',
						relation: 'conflicts',
					},
				},
			},
			architectureRelation('decision-graph', 'decision-records-adr', 'decision', 'adr-outcome', 'Records', 'records', {
				color: 'green',
				dash: 'solid',
				arrowheadEnd: 'arrow',
			}),
		],
	},
	'change-radar': {
		id: 'change-radar',
		title: 'Change Radar',
		description: 'Now, next, and later change bands converge on the component they affect.',
		canvas: { w: 1440, h: 840 },
		nodes: [
			{
				id: 'change-radar:now-zone',
				text: 'NOW',
				x: 50,
				y: 90,
				w: 390,
				h: 500,
				zIndex: 0,
				visual: {
					shape: 'geo',
					geo: 'rectangle',
					color: 'green',
					fill: 'background',
					dash: 'dashed',
				},
				meta: {
					workbenchArtifact: {
						schema: WORKBENCH_ARTIFACT_SCHEMA,
						artifactId: 'change-radar:now-zone',
						pack: 'architecture',
						templateId: 'change-radar',
						artifactType: 'node',
						role: 'radar-zone',
						status: 'in-progress',
					},
				},
			},
			{
				id: 'change-radar:next-zone',
				text: 'NEXT',
				x: 490,
				y: 90,
				w: 390,
				h: 500,
				zIndex: 0,
				visual: {
					shape: 'geo',
					geo: 'rectangle',
					color: 'blue',
					fill: 'background',
					dash: 'dashed',
				},
				meta: {
					workbenchArtifact: {
						schema: WORKBENCH_ARTIFACT_SCHEMA,
						artifactId: 'change-radar:next-zone',
						pack: 'architecture',
						templateId: 'change-radar',
						artifactType: 'node',
						role: 'radar-zone',
						status: 'planned',
					},
				},
			},
			{
				id: 'change-radar:later-zone',
				text: 'LATER',
				x: 930,
				y: 90,
				w: 390,
				h: 500,
				zIndex: 0,
				visual: {
					shape: 'geo',
					geo: 'rectangle',
					color: 'grey',
					fill: 'none',
					dash: 'dashed',
				},
				meta: {
					workbenchArtifact: {
						schema: WORKBENCH_ARTIFACT_SCHEMA,
						artifactId: 'change-radar:later-zone',
						pack: 'architecture',
						templateId: 'change-radar',
						artifactType: 'node',
						role: 'radar-zone',
						status: 'planned',
					},
				},
			},
			{
				id: 'change-radar:instrument-critical-path',
				text: 'Instrument critical path\nEvidence + exit signal',
				x: 115,
				y: 235,
				w: 260,
				h: 140,
				zIndex: 1,
				containerId: 'change-radar:now-zone',
				visual: {
					shape: 'geo',
					geo: 'rectangle',
					color: 'light-green',
					fill: 'tint',
					dash: 'solid',
				},
				meta: {
					workbenchArtifact: {
						schema: WORKBENCH_ARTIFACT_SCHEMA,
						artifactId: 'change-radar:instrument-critical-path',
						pack: 'architecture',
						templateId: 'change-radar',
						artifactType: 'node',
						role: 'change',
						status: 'in-progress',
					},
				},
			},
			{
				id: 'change-radar:split-write-model',
				text: 'Split write model\nMigration proof',
				x: 555,
				y: 235,
				w: 260,
				h: 140,
				zIndex: 1,
				containerId: 'change-radar:next-zone',
				visual: {
					shape: 'geo',
					geo: 'rectangle',
					color: 'light-blue',
					fill: 'tint',
					dash: 'solid',
				},
				meta: {
					workbenchArtifact: {
						schema: WORKBENCH_ARTIFACT_SCHEMA,
						artifactId: 'change-radar:split-write-model',
						pack: 'architecture',
						templateId: 'change-radar',
						artifactType: 'node',
						role: 'change',
						status: 'planned',
					},
				},
			},
			{
				id: 'change-radar:retire-legacy-gateway',
				text: 'Retire legacy gateway\nRollback ready',
				x: 995,
				y: 235,
				w: 260,
				h: 140,
				zIndex: 1,
				containerId: 'change-radar:later-zone',
				visual: {
					shape: 'geo',
					geo: 'rectangle',
					color: 'grey',
					fill: 'tint',
					dash: 'solid',
				},
				meta: {
					workbenchArtifact: {
						schema: WORKBENCH_ARTIFACT_SCHEMA,
						artifactId: 'change-radar:retire-legacy-gateway',
						pack: 'architecture',
						templateId: 'change-radar',
						artifactType: 'node',
						role: 'change',
						status: 'planned',
					},
				},
			},
			{
				id: 'change-radar:core-api',
				text: 'Affected component\nCore API',
				x: 635,
				y: 640,
				w: 170,
				h: 100,
				zIndex: 2,
				visual: {
					shape: 'geo',
					geo: 'rectangle',
					color: 'violet',
					fill: 'tint',
					dash: 'solid',
				},
				meta: {
					workbenchArtifact: {
						schema: WORKBENCH_ARTIFACT_SCHEMA,
						artifactId: 'change-radar:core-api',
						pack: 'architecture',
						templateId: 'change-radar',
						artifactType: 'node',
						role: 'component',
						status: 'active',
					},
				},
			},
		],
		relations: [
			{
				id: 'change-radar:instrument-affects-core-api',
				from: 'change-radar:instrument-critical-path',
				to: 'change-radar:core-api',
				text: 'Affects',
				visual: {
					color: 'green',
					dash: 'solid',
					arrowheadEnd: 'arrow',
				},
				meta: {
					workbenchArtifact: {
						schema: WORKBENCH_ARTIFACT_SCHEMA,
						artifactId: 'change-radar:instrument-affects-core-api',
						pack: 'architecture',
						templateId: 'change-radar',
						artifactType: 'relation',
						role: 'relationship',
						relation: 'affects',
					},
				},
			},
			{
				id: 'change-radar:split-affects-core-api',
				from: 'change-radar:split-write-model',
				to: 'change-radar:core-api',
				text: 'Affects',
				visual: {
					color: 'violet',
					dash: 'solid',
					arrowheadEnd: 'arrow',
				},
				meta: {
					workbenchArtifact: {
						schema: WORKBENCH_ARTIFACT_SCHEMA,
						artifactId: 'change-radar:split-affects-core-api',
						pack: 'architecture',
						templateId: 'change-radar',
						artifactType: 'relation',
						role: 'relationship',
						relation: 'affects',
					},
				},
			},
			{
				id: 'change-radar:retire-affects-core-api',
				from: 'change-radar:retire-legacy-gateway',
				to: 'change-radar:core-api',
				text: 'Affects',
				visual: {
					color: 'grey',
					dash: 'solid',
					arrowheadEnd: 'arrow',
				},
				meta: {
					workbenchArtifact: {
						schema: WORKBENCH_ARTIFACT_SCHEMA,
						artifactId: 'change-radar:retire-affects-core-api',
						pack: 'architecture',
						templateId: 'change-radar',
						artifactType: 'relation',
						role: 'relationship',
						relation: 'affects',
					},
				},
			},
		],
	},
	'c4-container': {
		id: 'c4-container',
		title: 'C4 Container',
		description: 'Native C4 container view with actors, deployable services, data stores, and external dependencies.',
		canvas: { w: 1500, h: 820 },
		nodes: [
			architectureNode(
				'c4-container',
				'system-boundary',
				'SYSTEM · Product platform',
				{ x: 260, y: 60, w: 980, h: 700 },
				'boundary',
				{ shape: 'geo', geo: 'rectangle', color: 'grey', fill: 'none', dash: 'dashed' },
				{ status: 'active', zIndex: 0 }
			),
			architectureNode(
				'c4-container',
				'user',
				'Customer\nUses the product',
				{ x: 30, y: 315, w: 175, h: 125 },
				'actor',
				{ shape: 'geo', geo: 'ellipse', color: 'blue', fill: 'tint', dash: 'solid' },
				{ status: 'active' }
			),
			architectureNode(
				'c4-container',
				'web-app',
				'Web application\n[Container: browser]',
				{ x: 340, y: 180, w: 245, h: 135 },
				'container',
				{ shape: 'geo', geo: 'rectangle', color: 'light-blue', fill: 'tint', dash: 'solid' },
				{ status: 'active', containerId: 'c4-container:system-boundary' }
			),
			architectureNode(
				'c4-container',
				'api',
				'Application API\n[Container: service]',
				{ x: 695, y: 180, w: 245, h: 135 },
				'container',
				{ shape: 'geo', geo: 'hexagon', color: 'green', fill: 'tint', dash: 'solid' },
				{ status: 'active', containerId: 'c4-container:system-boundary' }
			),
			architectureNode(
				'c4-container',
				'worker',
				'Background worker\n[Container: process]',
				{ x: 695, y: 500, w: 245, h: 135 },
				'container',
				{ shape: 'geo', geo: 'hexagon', color: 'violet', fill: 'tint', dash: 'solid' },
				{ status: 'active', containerId: 'c4-container:system-boundary' }
			),
			architectureNode(
				'c4-container',
				'database',
				'Primary database\n[Container: data store]',
				{ x: 1010, y: 335, w: 180, h: 140 },
				'data-store',
				{ shape: 'geo', geo: 'ellipse', color: 'orange', fill: 'background', dash: 'solid' },
				{ status: 'active', containerId: 'c4-container:system-boundary' }
			),
			architectureNode(
				'c4-container',
				'external-provider',
				'External provider\nIdentity · payment · data',
				{ x: 1300, y: 175, w: 175, h: 150 },
				'external-system',
				{ shape: 'geo', geo: 'cloud', color: 'grey', fill: 'background', dash: 'solid' },
				{ status: 'active' }
			),
		],
		relations: [
			architectureRelation('c4-container', 'user-uses-web', 'user', 'web-app', 'Uses', 'uses', {
				color: 'blue',
				dash: 'solid',
				arrowheadEnd: 'arrow',
			}),
			architectureRelation('c4-container', 'web-calls-api', 'web-app', 'api', 'HTTPS', 'calls', {
				color: 'green',
				dash: 'solid',
				arrowheadEnd: 'arrow',
			}),
			architectureRelation('c4-container', 'api-writes-db', 'api', 'database', 'SQL', 'writes', {
				color: 'orange',
				dash: 'solid',
				arrowheadEnd: 'arrow',
			}),
			architectureRelation('c4-container', 'api-calls-worker', 'api', 'worker', 'Schedules', 'calls', {
				color: 'violet',
				dash: 'dashed',
				arrowheadEnd: 'arrow',
			}),
			architectureRelation('c4-container', 'worker-reads-db', 'worker', 'database', 'Reads', 'reads', {
				color: 'orange',
				dash: 'solid',
				arrowheadEnd: 'arrow',
			}),
			architectureRelation('c4-container', 'api-calls-provider', 'api', 'external-provider', 'API', 'depends-on', {
				color: 'grey',
				dash: 'dashed',
				arrowheadEnd: 'arrow',
			}),
		],
	},
	'c4-component': {
		id: 'c4-component',
		title: 'C4 Component',
		description: 'Component-level decomposition of one container with responsibilities and explicit dependencies.',
		canvas: { w: 1480, h: 820 },
		nodes: [
			architectureNode(
				'c4-component',
				'container-boundary',
				'CONTAINER · Application API',
				{ x: 180, y: 55, w: 1080, h: 710 },
				'boundary',
				{ shape: 'geo', geo: 'rectangle', color: 'grey', fill: 'none', dash: 'dashed' },
				{ status: 'active', zIndex: 0 }
			),
			architectureNode(
				'c4-component',
				'client',
				'Web application\n[External container]',
				{ x: 20, y: 300, w: 150, h: 125 },
				'container',
				{ shape: 'geo', geo: 'rectangle', color: 'light-blue', fill: 'background', dash: 'solid' },
				{ status: 'active' }
			),
			architectureNode(
				'c4-component',
				'controller',
				'Request controller\nProtocol + validation',
				{ x: 260, y: 285, w: 210, h: 135 },
				'interface',
				{ shape: 'geo', geo: 'hexagon', color: 'blue', fill: 'tint', dash: 'solid' },
				{ status: 'active', containerId: 'c4-component:container-boundary' }
			),
			architectureNode(
				'c4-component',
				'application-service',
				'Application service\nUse-case orchestration',
				{ x: 550, y: 155, w: 230, h: 140 },
				'component',
				{ shape: 'geo', geo: 'rectangle', color: 'green', fill: 'tint', dash: 'solid' },
				{ status: 'active', containerId: 'c4-component:container-boundary' }
			),
			architectureNode(
				'c4-component',
				'policy',
				'Domain policy\nBusiness invariants',
				{ x: 550, y: 465, w: 230, h: 140 },
				'component',
				{ shape: 'geo', geo: 'diamond', color: 'violet', fill: 'tint', dash: 'solid' },
				{ status: 'active', containerId: 'c4-component:container-boundary' }
			),
			architectureNode(
				'c4-component',
				'repository',
				'Repository adapter\nPersistence boundary',
				{ x: 885, y: 285, w: 220, h: 140 },
				'component',
				{ shape: 'geo', geo: 'rectangle', color: 'orange', fill: 'tint', dash: 'solid' },
				{ status: 'active', containerId: 'c4-component:container-boundary' }
			),
			architectureNode(
				'c4-component',
				'database',
				'Primary database',
				{ x: 1300, y: 300, w: 150, h: 125 },
				'data-store',
				{ shape: 'geo', geo: 'ellipse', color: 'orange', fill: 'background', dash: 'solid' },
				{ status: 'active' }
			),
		],
		relations: [
			architectureRelation('c4-component', 'client-calls-controller', 'client', 'controller', 'API call', 'calls', {
				color: 'blue',
				dash: 'solid',
				arrowheadEnd: 'arrow',
			}),
			architectureRelation(
				'c4-component',
				'controller-calls-service',
				'controller',
				'application-service',
				'Invokes',
				'calls',
				{
					color: 'green',
					dash: 'solid',
					arrowheadEnd: 'arrow',
				}
			),
			architectureRelation('c4-component', 'service-uses-policy', 'application-service', 'policy', 'Enforces', 'uses', {
				color: 'violet',
				dash: 'solid',
				arrowheadEnd: 'arrow',
			}),
			architectureRelation(
				'c4-component',
				'service-calls-repository',
				'application-service',
				'repository',
				'Loads / saves',
				'calls',
				{
					color: 'orange',
					dash: 'solid',
					arrowheadEnd: 'arrow',
				}
			),
			architectureRelation('c4-component', 'repository-writes-db', 'repository', 'database', 'SQL', 'writes', {
				color: 'orange',
				dash: 'solid',
				arrowheadEnd: 'arrow',
			}),
		],
	},
	'service-data-flow': {
		id: 'service-data-flow',
		title: 'Service / Data Flow',
		description: 'Synchronous requests and asynchronous data movement across services, stores, and consumers.',
		canvas: { w: 1480, h: 820 },
		nodes: [
			architectureNode(
				'service-data-flow',
				'core-boundary',
				'TRUSTED CORE',
				{ x: 500, y: 45, w: 650, h: 710 },
				'boundary',
				{ shape: 'geo', geo: 'rectangle', color: 'grey', fill: 'none', dash: 'dashed' },
				{ status: 'active', zIndex: 0 }
			),
			architectureNode(
				'service-data-flow',
				'client',
				'Client',
				{ x: 30, y: 330, w: 155, h: 110 },
				'actor',
				{ shape: 'geo', geo: 'ellipse', color: 'blue', fill: 'tint', dash: 'solid' },
				{ status: 'active' }
			),
			architectureNode(
				'service-data-flow',
				'gateway',
				'API gateway\nAuth · routing',
				{ x: 250, y: 315, w: 200, h: 140 },
				'interface',
				{ shape: 'geo', geo: 'hexagon', color: 'light-blue', fill: 'tint', dash: 'solid' },
				{ status: 'active' }
			),
			architectureNode(
				'service-data-flow',
				'command-service',
				'Command service\nValidate + transact',
				{ x: 540, y: 140, w: 225, h: 145 },
				'component',
				{ shape: 'geo', geo: 'rectangle', color: 'green', fill: 'tint', dash: 'solid' },
				{ status: 'active', containerId: 'service-data-flow:core-boundary' }
			),
			architectureNode(
				'service-data-flow',
				'event-bus',
				'Domain event topic\n[Message broker]',
				{ x: 880, y: 315, w: 210, h: 140 },
				'message',
				{ shape: 'geo', geo: 'hexagon', color: 'violet', fill: 'background', dash: 'solid' },
				{ status: 'active', containerId: 'service-data-flow:core-boundary' }
			),
			architectureNode(
				'service-data-flow',
				'query-service',
				'Query service\nRead models',
				{ x: 540, y: 510, w: 225, h: 145 },
				'component',
				{ shape: 'geo', geo: 'rectangle', color: 'light-green', fill: 'tint', dash: 'solid' },
				{ status: 'active', containerId: 'service-data-flow:core-boundary' }
			),
			architectureNode(
				'service-data-flow',
				'primary-db',
				'Operational store\n[PostgreSQL]',
				{ x: 880, y: 90, w: 210, h: 125 },
				'data-store',
				{ shape: 'geo', geo: 'ellipse', color: 'orange', fill: 'background', dash: 'solid' },
				{ status: 'active', containerId: 'service-data-flow:core-boundary' }
			),
			architectureNode(
				'service-data-flow',
				'read-store',
				'Read model\n[Projection store]',
				{ x: 880, y: 580, w: 210, h: 125 },
				'data-store',
				{ shape: 'geo', geo: 'ellipse', color: 'light-green', fill: 'background', dash: 'solid' },
				{ status: 'active', containerId: 'service-data-flow:core-boundary' }
			),
			architectureNode(
				'service-data-flow',
				'analytics',
				'EXTERNAL · Analytics\nWarehouse + metrics',
				{ x: 1210, y: 315, w: 230, h: 140 },
				'external-system',
				{ shape: 'geo', geo: 'cloud', color: 'grey', fill: 'background', dash: 'solid' },
				{ status: 'active' }
			),
		],
		relations: [
			architectureRelation('service-data-flow', 'client-calls-gateway', 'client', 'gateway', 'HTTPS', 'calls', {
				color: 'blue',
				dash: 'solid',
				arrowheadEnd: 'arrow',
			}),
			architectureRelation('service-data-flow', 'gateway-calls-command', 'gateway', 'command-service', 'Cmd', 'calls', {
				color: 'green',
				dash: 'solid',
				arrowheadEnd: 'arrow',
			}),
			architectureRelation('service-data-flow', 'gateway-calls-query', 'gateway', 'query-service', 'Query', 'calls', {
				color: 'light-green',
				dash: 'solid',
				arrowheadEnd: 'arrow',
			}),
			architectureRelation(
				'service-data-flow',
				'command-writes-db',
				'command-service',
				'primary-db',
				'Writes',
				'writes',
				{
					color: 'orange',
					dash: 'solid',
					arrowheadEnd: 'arrow',
				}
			),
			architectureRelation(
				'service-data-flow',
				'command-publishes-event',
				'command-service',
				'event-bus',
				'Emits',
				'publishes',
				{
					color: 'violet',
					dash: 'dashed',
					arrowheadEnd: 'arrow',
				}
			),
			architectureRelation(
				'service-data-flow',
				'query-subscribes-event',
				'event-bus',
				'query-service',
				'Syncs',
				'subscribes',
				{
					color: 'violet',
					dash: 'dashed',
					arrowheadEnd: 'arrow',
				}
			),
			architectureRelation('service-data-flow', 'query-reads-model', 'query-service', 'read-store', 'Reads', 'reads', {
				color: 'light-green',
				dash: 'solid',
				arrowheadEnd: 'arrow',
			}),
			architectureRelation(
				'service-data-flow',
				'analytics-subscribes-event',
				'event-bus',
				'analytics',
				'Events',
				'subscribes',
				{
					color: 'grey',
					dash: 'dashed',
					arrowheadEnd: 'arrow',
				}
			),
		],
	},
} as const satisfies Readonly<Record<ArchitectureTemplateId, ArchitectureTemplateBlueprint>>

export function getArchitectureTemplate(id: ArchitectureTemplateId): ArchitectureTemplateBlueprint {
	return ARCHITECTURE_TEMPLATES[id]
}
