/**
 * Pure, renderer-independent starter data for the Architecture workbench pack.
 *
 * The blueprints intentionally use stable logical ids instead of tldraw record
 * ids. A canvas renderer can derive shape ids, create native geo / note shapes,
 * and bind native arrows without making the template data editor-dependent.
 */

export const ARCHITECTURE_TEMPLATE_IDS = [
	'system-context',
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
	| 'decision'
	| 'assumption'
	| 'evidence'
	| 'option'
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
	| 'informs'
	| 'supports'
	| 'considers'
	| 'conflicts'
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

export type ArchitectureGeo =
	| 'rectangle'
	| 'ellipse'
	| 'diamond'
	| 'hexagon'
	| 'cloud'

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

export const ARCHITECTURE_TEMPLATES = {
	'system-context': {
		id: 'system-context',
		title: 'System Context',
		description:
			'Editable system boundary, primary actor, core system, and external dependency.',
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
		description:
			'An inspectable decision with assumptions, evidence, and competing options.',
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
		],
	},
	'change-radar': {
		id: 'change-radar',
		title: 'Change Radar',
		description:
			'Now, next, and later change bands connected to the components they affect.',
		canvas: { w: 1440, h: 840 },
		nodes: [
			{
				id: 'change-radar:now-zone',
				text: 'NOW',
				x: 50,
				y: 90,
				w: 390,
				h: 660,
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
				h: 660,
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
				h: 660,
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
				text: 'Instrument critical path\nOwner · evidence · exit signal',
				x: 115,
				y: 190,
				w: 260,
				h: 130,
				zIndex: 1,
				containerId: 'change-radar:now-zone',
				visual: {
					shape: 'note',
					geo: 'rectangle',
					color: 'light-green',
					fill: 'tint',
					dash: 'draw',
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
				text: 'Split write model\nDependency · migration proof',
				x: 555,
				y: 365,
				w: 260,
				h: 130,
				zIndex: 1,
				containerId: 'change-radar:next-zone',
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
				text: 'Retire legacy gateway\nCompatibility · rollback',
				x: 995,
				y: 540,
				w: 260,
				h: 130,
				zIndex: 1,
				containerId: 'change-radar:later-zone',
				visual: {
					shape: 'note',
					geo: 'rectangle',
					color: 'grey',
					fill: 'tint',
					dash: 'draw',
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
				x: 1090,
				y: 185,
				w: 170,
				h: 100,
				zIndex: 2,
				containerId: 'change-radar:later-zone',
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
				id: 'change-radar:instrument-precedes-split',
				from: 'change-radar:instrument-critical-path',
				to: 'change-radar:split-write-model',
				text: 'Precedes',
				visual: {
					color: 'blue',
					dash: 'dashed',
					arrowheadEnd: 'arrow',
				},
				meta: {
					workbenchArtifact: {
						schema: WORKBENCH_ARTIFACT_SCHEMA,
						artifactId: 'change-radar:instrument-precedes-split',
						pack: 'architecture',
						templateId: 'change-radar',
						artifactType: 'relation',
						role: 'relationship',
						relation: 'precedes',
					},
				},
			},
			{
				id: 'change-radar:split-precedes-retire',
				from: 'change-radar:split-write-model',
				to: 'change-radar:retire-legacy-gateway',
				text: 'Precedes',
				visual: {
					color: 'grey',
					dash: 'dashed',
					arrowheadEnd: 'arrow',
				},
				meta: {
					workbenchArtifact: {
						schema: WORKBENCH_ARTIFACT_SCHEMA,
						artifactId: 'change-radar:split-precedes-retire',
						pack: 'architecture',
						templateId: 'change-radar',
						artifactType: 'relation',
						role: 'relationship',
						relation: 'precedes',
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
		],
	},
} as const satisfies Readonly<Record<ArchitectureTemplateId, ArchitectureTemplateBlueprint>>

export function getArchitectureTemplate(
	id: ArchitectureTemplateId
): ArchitectureTemplateBlueprint {
	return ARCHITECTURE_TEMPLATES[id]
}
