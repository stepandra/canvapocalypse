import {
	parseWorkbenchArtifact,
	parseWorkbenchRelation,
	UIUX_ARTIFACT_KINDS,
	WorkbenchShapeIdSchema,
	WORKBENCH_ARTIFACT_SCHEMA,
	WORKBENCH_RELATION_SCHEMA,
	WORKBENCH_SCHEMA_VERSION,
	type WorkbenchArtifact,
	type WorkbenchArtifactStatus,
	type WorkbenchRelation,
	type WorkbenchRelationType,
	type WorkbenchShapeId,
} from '../../../shared/types/WorkbenchArtifact'

export const UIUX_BLUEPRINT_SCHEMA = 'workbench-uiux-blueprint/v1' as const

export const UIUX_TEMPLATE_IDS = [
	'user-flow',
	'wireframe-screen-set',
	'component-anatomy',
] as const

export type UiuxTemplateId = (typeof UIUX_TEMPLATE_IDS)[number]
export type UiuxArtifactKind = (typeof UIUX_ARTIFACT_KINDS)[number]
export type UiuxWorkbenchArtifact = Extract<WorkbenchArtifact, { pack: 'uiux' }>

export type UiuxNativePrimitive = 'frame' | 'geo' | 'text' | 'note'
export type UiuxPrimitiveRole =
	| 'screen'
	| 'region'
	| 'content'
	| 'control'
	| 'annotation'
	| 'decision'
	| 'state'
export type UiuxPrimitiveTone = 'neutral' | 'teal' | 'cyan' | 'violet' | 'amber' | 'lime'
export type UiuxGeoKind = 'rectangle' | 'ellipse' | 'diamond' | 'pill'

export interface UiuxBlueprintGeometry {
	/** Blueprint/world coordinates; adapters convert these to frame-local coordinates on insertion. */
	x: number
	y: number
	w: number
	h: number
}

export interface UiuxBlueprintArtifact {
	shapeId: WorkbenchShapeId
	parentShapeId?: WorkbenchShapeId
	text: string
	artifact: UiuxWorkbenchArtifact
	visual: {
		primitive: UiuxNativePrimitive
		role: UiuxPrimitiveRole
		tone: UiuxPrimitiveTone
		geometry: UiuxBlueprintGeometry
		geo?: UiuxGeoKind
	}
}

export interface UiuxBlueprintRelation {
	shapeId: WorkbenchShapeId
	relation: WorkbenchRelation
	visual: {
		route: 'straight' | 'elbow'
	}
}

/**
 * Renderer-independent data for native tldraw shapes.
 *
 * Frames, geo shapes, text, and notes remain editable after insertion. Semantic
 * relations are emitted separately so an adapter can create native arrows and
 * bindings without storing a second diagram model or introducing custom shapes.
 */
export interface UiuxTemplateBlueprint {
	schema: typeof UIUX_BLUEPRINT_SCHEMA
	blueprintId: string
	pack: 'uiux'
	kind: UiuxTemplateId
	title: string
	description: string
	bounds: {
		w: number
		h: number
	}
	artifacts: UiuxBlueprintArtifact[]
	relations: UiuxBlueprintRelation[]
}

interface ArtifactInput {
	key: string
	kind: UiuxArtifactKind
	title: string
	text: string
	summary?: string
	status?: WorkbenchArtifactStatus
	tags?: string[]
	parent?: UiuxBlueprintArtifact
	visual: UiuxBlueprintArtifact['visual']
}

function artifactId(templateId: UiuxTemplateId, key: string): string {
	return `uiux:${templateId}:${key}`
}

function artifactShapeId(templateId: UiuxTemplateId, key: string): WorkbenchShapeId {
	return WorkbenchShapeIdSchema.parse(`shape:uiux-${templateId}-${key}`)
}

function relationShapeId(templateId: UiuxTemplateId, key: string): WorkbenchShapeId {
	return WorkbenchShapeIdSchema.parse(`shape:uiux-${templateId}-relation-${key}`)
}

function createArtifact(
	templateId: UiuxTemplateId,
	input: ArtifactInput
): UiuxBlueprintArtifact {
	const artifact = parseWorkbenchArtifact({
		schema: WORKBENCH_ARTIFACT_SCHEMA,
		artifactId: artifactId(templateId, input.key),
		pack: 'uiux',
		kind: input.kind,
		title: input.title,
		...(input.summary ? { summary: input.summary } : {}),
		status: input.status ?? 'draft',
		refs: [],
		tags: input.tags ?? [],
		version: WORKBENCH_SCHEMA_VERSION,
	})

	if (artifact.pack !== 'uiux') {
		throw new Error(`Expected UI/UX artifact, received ${artifact.pack}`)
	}

	return {
		shapeId: artifactShapeId(templateId, input.key),
		...(input.parent ? { parentShapeId: input.parent.shapeId } : {}),
		text: input.text,
		artifact,
		visual: input.visual,
	}
}

function createRelation(
	templateId: UiuxTemplateId,
	key: string,
	type: WorkbenchRelationType,
	start: UiuxBlueprintArtifact,
	end: UiuxBlueprintArtifact,
	label?: string,
	route: UiuxBlueprintRelation['visual']['route'] = 'elbow'
): UiuxBlueprintRelation {
	return {
		shapeId: relationShapeId(templateId, key),
		relation: parseWorkbenchRelation({
			schema: WORKBENCH_RELATION_SCHEMA,
			relationId: `uiux:${templateId}:relation:${key}`,
			pack: 'uiux',
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

function finalizeBlueprint(blueprint: UiuxTemplateBlueprint): UiuxTemplateBlueprint {
	const errors = validateUiuxTemplateBlueprint(blueprint)
	if (errors.length > 0) {
		throw new Error(`Invalid UI/UX blueprint:\n${errors.join('\n')}`)
	}
	return blueprint
}

function buildUserFlowBlueprint(): UiuxTemplateBlueprint {
	const templateId = 'user-flow'
	const artifacts: UiuxBlueprintArtifact[] = []
	const add = (input: ArtifactInput) => {
		const artifact = createArtifact(templateId, input)
		artifacts.push(artifact)
		return artifact
	}

	const entry = add({
		key: 'entry',
		kind: 'persona',
		title: 'Entry actor',
		text: 'Visitor\nNeeds a fast answer',
		summary: 'The person and intent that begin this bounded flow.',
		visual: {
			primitive: 'note',
			role: 'annotation',
			tone: 'amber',
			geometry: { x: 40, y: 310, w: 190, h: 120 },
		},
	})
	const browseScreen = add({
		key: 'browse-screen',
		kind: 'screen',
		title: 'Browse',
		text: 'Browse',
		visual: {
			primitive: 'frame',
			role: 'screen',
			tone: 'neutral',
			geometry: { x: 290, y: 120, w: 280, h: 520 },
		},
	})
	const browseTitle = add({
		key: 'browse-title',
		kind: 'component',
		title: 'Browse heading',
		text: 'Find a candidate',
		parent: browseScreen,
		visual: {
			primitive: 'text',
			role: 'content',
			tone: 'neutral',
			geometry: { x: 320, y: 165, w: 220, h: 42 },
		},
	})
	const browseQuery = add({
		key: 'browse-query',
		kind: 'component',
		title: 'Search field',
		text: 'Role, skill, or location',
		parent: browseScreen,
		visual: {
			primitive: 'geo',
			role: 'control',
			tone: 'cyan',
			geometry: { x: 320, y: 240, w: 220, h: 56 },
			geo: 'rectangle',
		},
	})
	const browseResult = add({
		key: 'browse-result',
		kind: 'journey-step',
		title: 'Candidate result',
		text: 'Candidate summary\nFit signals · evidence',
		parent: browseScreen,
		visual: {
			primitive: 'geo',
			role: 'content',
			tone: 'teal',
			geometry: { x: 320, y: 340, w: 220, h: 140 },
			geo: 'rectangle',
		},
	})
	const chooseResult = add({
		key: 'choose-result',
		kind: 'decision',
		title: 'Open candidate?',
		text: 'Open\ncandidate?',
		status: 'proposed',
		visual: {
			primitive: 'geo',
			role: 'decision',
			tone: 'violet',
			geometry: { x: 630, y: 315, w: 130, h: 130 },
			geo: 'diamond',
		},
	})
	const detailScreen = add({
		key: 'detail-screen',
		kind: 'screen',
		title: 'Candidate detail',
		text: 'Candidate detail',
		visual: {
			primitive: 'frame',
			role: 'screen',
			tone: 'neutral',
			geometry: { x: 820, y: 120, w: 280, h: 520 },
		},
	})
	const detailTitle = add({
		key: 'detail-title',
		kind: 'component',
		title: 'Candidate heading',
		text: 'Candidate profile',
		parent: detailScreen,
		visual: {
			primitive: 'text',
			role: 'content',
			tone: 'neutral',
			geometry: { x: 850, y: 165, w: 220, h: 42 },
		},
	})
	const evidencePanel = add({
		key: 'evidence-panel',
		kind: 'component',
		title: 'Evidence panel',
		text: 'Evidence\nStrengths · risks · sources',
		parent: detailScreen,
		visual: {
			primitive: 'geo',
			role: 'content',
			tone: 'cyan',
			geometry: { x: 850, y: 250, w: 220, h: 180 },
			geo: 'rectangle',
		},
	})
	const detailAction = add({
		key: 'detail-action',
		kind: 'journey-step',
		title: 'Approve action',
		text: 'Approve for review',
		parent: detailScreen,
		visual: {
			primitive: 'geo',
			role: 'control',
			tone: 'lime',
			geometry: { x: 850, y: 500, w: 220, h: 56 },
			geo: 'pill',
		},
	})
	const successScreen = add({
		key: 'success-screen',
		kind: 'screen',
		title: 'Confirmation',
		text: 'Confirmation',
		visual: {
			primitive: 'frame',
			role: 'screen',
			tone: 'neutral',
			geometry: { x: 1160, y: 230, w: 240, h: 300 },
		},
	})
	const successState = add({
		key: 'success-state',
		kind: 'journey-step',
		title: 'Queued for review',
		text: 'Queued for review\nReceipt is available',
		status: 'ready',
		parent: successScreen,
		visual: {
			primitive: 'note',
			role: 'state',
			tone: 'lime',
			geometry: { x: 1190, y: 320, w: 180, h: 110 },
		},
	})

	const relations = [
		createRelation(templateId, 'entry-to-browse', 'informs', entry, browseScreen, 'Starts flow'),
		createRelation(templateId, 'browse-contains-title', 'contains', browseScreen, browseTitle),
		createRelation(templateId, 'browse-contains-query', 'contains', browseScreen, browseQuery),
		createRelation(templateId, 'browse-contains-result', 'contains', browseScreen, browseResult),
		createRelation(
			templateId,
			'result-to-decision',
			'informs',
			browseResult,
			chooseResult,
			'Candidate selected'
		),
		createRelation(
			templateId,
			'decision-to-detail',
			'informs',
			chooseResult,
			detailScreen,
			'Open'
		),
		createRelation(templateId, 'detail-contains-title', 'contains', detailScreen, detailTitle),
		createRelation(
			templateId,
			'detail-contains-evidence',
			'contains',
			detailScreen,
			evidencePanel
		),
		createRelation(templateId, 'detail-contains-action', 'contains', detailScreen, detailAction),
		createRelation(
			templateId,
			'action-to-success',
			'validates',
			detailAction,
			successScreen,
			'Confirmed'
		),
		createRelation(templateId, 'success-contains-state', 'contains', successScreen, successState),
	]

	return finalizeBlueprint({
		schema: UIUX_BLUEPRINT_SCHEMA,
		blueprintId: `uiux:${templateId}`,
		pack: 'uiux',
		kind: templateId,
		title: 'User Flow',
		description: 'A bounded happy-path flow with screens, a decision, and an inspectable outcome.',
		bounds: { w: 1440, h: 760 },
		artifacts,
		relations,
	})
}

function buildWireframeScreenSetBlueprint(): UiuxTemplateBlueprint {
	const templateId = 'wireframe-screen-set'
	const artifacts: UiuxBlueprintArtifact[] = []
	const add = (input: ArtifactInput) => {
		const artifact = createArtifact(templateId, input)
		artifacts.push(artifact)
		return artifact
	}

	const desktop = add({
		key: 'desktop-screen',
		kind: 'wireframe',
		title: 'Desktop screen',
		text: 'Desktop · Candidate workspace',
		visual: {
			primitive: 'frame',
			role: 'screen',
			tone: 'neutral',
			geometry: { x: 40, y: 90, w: 940, h: 700 },
		},
	})
	const desktopNav = add({
		key: 'desktop-nav',
		kind: 'component',
		title: 'Desktop navigation',
		text: 'Navigation\n\nInbox\nCandidates\nReviews\nSettings',
		parent: desktop,
		visual: {
			primitive: 'geo',
			role: 'region',
			tone: 'teal',
			geometry: { x: 70, y: 135, w: 200, h: 610 },
			geo: 'rectangle',
		},
	})
	const desktopHeader = add({
		key: 'desktop-header',
		kind: 'component',
		title: 'Desktop header',
		text: 'Candidate workspace                 Filters',
		parent: desktop,
		visual: {
			primitive: 'geo',
			role: 'region',
			tone: 'neutral',
			geometry: { x: 300, y: 135, w: 640, h: 84 },
			geo: 'rectangle',
		},
	})
	const desktopContent = add({
		key: 'desktop-content',
		kind: 'component',
		title: 'Desktop content region',
		text: 'Results',
		parent: desktop,
		visual: {
			primitive: 'frame',
			role: 'region',
			tone: 'neutral',
			geometry: { x: 300, y: 250, w: 640, h: 495 },
		},
	})
	const filterField = add({
		key: 'filter-field',
		kind: 'component',
		title: 'Filter field',
		text: 'Search candidates',
		parent: desktopContent,
		visual: {
			primitive: 'geo',
			role: 'control',
			tone: 'cyan',
			geometry: { x: 330, y: 300, w: 360, h: 52 },
			geo: 'rectangle',
		},
	})
	const resultCard = add({
		key: 'result-card',
		kind: 'component',
		title: 'Candidate card',
		text: 'Candidate name\nRole · score · evidence\n\nSummary of the strongest matching signals.',
		parent: desktopContent,
		visual: {
			primitive: 'geo',
			role: 'content',
			tone: 'violet',
			geometry: { x: 330, y: 395, w: 570, h: 190 },
			geo: 'rectangle',
		},
	})
	const desktopAction = add({
		key: 'desktop-action',
		kind: 'component',
		title: 'Desktop primary action',
		text: 'Review candidate',
		parent: desktopContent,
		visual: {
			primitive: 'geo',
			role: 'control',
			tone: 'lime',
			geometry: { x: 690, y: 635, w: 210, h: 54 },
			geo: 'pill',
		},
	})
	const responsiveAssumption = add({
		key: 'responsive-assumption',
		kind: 'assumption',
		title: 'Responsive priority',
		text: 'Assumption\nPreserve evidence and the primary action on narrow screens.',
		status: 'proposed',
		visual: {
			primitive: 'note',
			role: 'annotation',
			tone: 'amber',
			geometry: { x: 1050, y: 20, w: 390, h: 90 },
		},
	})
	const mobile = add({
		key: 'mobile-screen',
		kind: 'wireframe',
		title: 'Mobile screen',
		text: 'Mobile · Candidate workspace',
		visual: {
			primitive: 'frame',
			role: 'screen',
			tone: 'neutral',
			geometry: { x: 1060, y: 140, w: 380, h: 650 },
		},
	})
	const mobileHeader = add({
		key: 'mobile-header',
		kind: 'component',
		title: 'Mobile header',
		text: 'Candidates          Menu',
		parent: mobile,
		visual: {
			primitive: 'geo',
			role: 'region',
			tone: 'teal',
			geometry: { x: 1090, y: 185, w: 320, h: 70 },
			geo: 'rectangle',
		},
	})
	const mobileCard = add({
		key: 'mobile-card',
		kind: 'component',
		title: 'Mobile candidate card',
		text: 'Candidate name\nRole · score\nEvidence summary',
		parent: mobile,
		visual: {
			primitive: 'geo',
			role: 'content',
			tone: 'violet',
			geometry: { x: 1090, y: 305, w: 320, h: 230 },
			geo: 'rectangle',
		},
	})
	const mobileAction = add({
		key: 'mobile-action',
		kind: 'component',
		title: 'Mobile primary action',
		text: 'Review candidate',
		parent: mobile,
		visual: {
			primitive: 'geo',
			role: 'control',
			tone: 'lime',
			geometry: { x: 1090, y: 610, w: 320, h: 58 },
			geo: 'pill',
		},
	})

	const relations = [
		createRelation(templateId, 'desktop-contains-nav', 'contains', desktop, desktopNav),
		createRelation(templateId, 'desktop-contains-header', 'contains', desktop, desktopHeader),
		createRelation(templateId, 'desktop-contains-content', 'contains', desktop, desktopContent),
		createRelation(templateId, 'content-contains-filter', 'contains', desktopContent, filterField),
		createRelation(templateId, 'content-contains-card', 'contains', desktopContent, resultCard),
		createRelation(templateId, 'content-contains-action', 'contains', desktopContent, desktopAction),
		createRelation(
			templateId,
			'desktop-informs-mobile',
			'informs',
			desktop,
			mobile,
			'Responsive counterpart'
		),
		createRelation(
			templateId,
			'assumption-informs-mobile',
			'informs',
			responsiveAssumption,
			mobile
		),
		createRelation(templateId, 'mobile-contains-header', 'contains', mobile, mobileHeader),
		createRelation(templateId, 'mobile-contains-card', 'contains', mobile, mobileCard),
		createRelation(templateId, 'mobile-contains-action', 'contains', mobile, mobileAction),
	]

	return finalizeBlueprint({
		schema: UIUX_BLUEPRINT_SCHEMA,
		blueprintId: `uiux:${templateId}`,
		pack: 'uiux',
		kind: templateId,
		title: 'Wireframe Screen Set',
		description:
			'Editable desktop and mobile screen frames with reusable regions, controls, and responsive intent.',
		bounds: { w: 1500, h: 840 },
		artifacts,
		relations,
	})
}

function buildComponentAnatomyBlueprint(): UiuxTemplateBlueprint {
	const templateId = 'component-anatomy'
	const artifacts: UiuxBlueprintArtifact[] = []
	const add = (input: ArtifactInput) => {
		const artifact = createArtifact(templateId, input)
		artifacts.push(artifact)
		return artifact
	}

	const component = add({
		key: 'component-shell',
		kind: 'component',
		title: 'Candidate review card',
		text: 'Candidate review card',
		visual: {
			primitive: 'frame',
			role: 'region',
			tone: 'neutral',
			geometry: { x: 380, y: 120, w: 560, h: 540 },
		},
	})
	const heading = add({
		key: 'heading',
		kind: 'component',
		title: 'Heading',
		text: 'Candidate name',
		parent: component,
		visual: {
			primitive: 'text',
			role: 'content',
			tone: 'neutral',
			geometry: { x: 420, y: 170, w: 360, h: 48 },
		},
	})
	const metadata = add({
		key: 'metadata',
		kind: 'component',
		title: 'Metadata',
		text: 'Role · stage · evaluation status',
		parent: component,
		visual: {
			primitive: 'text',
			role: 'content',
			tone: 'cyan',
			geometry: { x: 420, y: 230, w: 430, h: 36 },
		},
	})
	const score = add({
		key: 'score',
		kind: 'component',
		title: 'Score badge',
		text: '86',
		parent: component,
		visual: {
			primitive: 'geo',
			role: 'state',
			tone: 'lime',
			geometry: { x: 810, y: 165, w: 82, h: 82 },
			geo: 'ellipse',
		},
	})
	const evidence = add({
		key: 'evidence',
		kind: 'component',
		title: 'Evidence summary',
		text: 'Evidence summary\n\nStrong matches, uncertainties, and source references.',
		parent: component,
		visual: {
			primitive: 'geo',
			role: 'content',
			tone: 'violet',
			geometry: { x: 420, y: 305, w: 470, h: 170 },
			geo: 'rectangle',
		},
	})
	const action = add({
		key: 'primary-action',
		kind: 'component',
		title: 'Primary action',
		text: 'Approve for review',
		parent: component,
		visual: {
			primitive: 'geo',
			role: 'control',
			tone: 'teal',
			geometry: { x: 650, y: 535, w: 240, h: 58 },
			geo: 'pill',
		},
	})
	const anatomyNote = add({
		key: 'anatomy-note',
		kind: 'assumption',
		title: 'Content hierarchy',
		text: 'Content hierarchy\nIdentity first, evidence second, action last.',
		status: 'proposed',
		visual: {
			primitive: 'note',
			role: 'annotation',
			tone: 'amber',
			geometry: { x: 50, y: 190, w: 250, h: 120 },
		},
	})
	const stateNote = add({
		key: 'state-note',
		kind: 'decision',
		title: 'State contract',
		text: 'State contract\nDraft · ready · approved · blocked',
		status: 'proposed',
		visual: {
			primitive: 'note',
			role: 'annotation',
			tone: 'cyan',
			geometry: { x: 1020, y: 190, w: 250, h: 120 },
		},
	})
	const accessibilityNote = add({
		key: 'accessibility-note',
		kind: 'risk',
		title: 'Accessibility checks',
		text: 'Check focus order, clear state labels, and non-color status cues.',
		status: 'active',
		visual: {
			primitive: 'note',
			role: 'annotation',
			tone: 'violet',
			geometry: { x: 500, y: 690, w: 360, h: 90 },
		},
	})

	const relations = [
		createRelation(templateId, 'shell-contains-heading', 'contains', component, heading),
		createRelation(templateId, 'shell-contains-metadata', 'contains', component, metadata),
		createRelation(templateId, 'shell-contains-score', 'contains', component, score),
		createRelation(templateId, 'shell-contains-evidence', 'contains', component, evidence),
		createRelation(templateId, 'shell-contains-action', 'contains', component, action),
		createRelation(
			templateId,
			'hierarchy-informs-component',
			'informs',
			anatomyNote,
			component
		),
		createRelation(templateId, 'state-informs-score', 'informs', stateNote, score),
		createRelation(
			templateId,
			'accessibility-validates-action',
			'validates',
			accessibilityNote,
			action
		),
	]

	return finalizeBlueprint({
		schema: UIUX_BLUEPRINT_SCHEMA,
		blueprintId: `uiux:${templateId}`,
		pack: 'uiux',
		kind: templateId,
		title: 'Component Anatomy',
		description:
			'An editable component breakdown with content hierarchy, state semantics, and accessibility intent.',
		bounds: { w: 1320, h: 800 },
		artifacts,
		relations,
	})
}

const UIUX_TEMPLATE_BUILDERS: Record<UiuxTemplateId, () => UiuxTemplateBlueprint> = {
	'user-flow': buildUserFlowBlueprint,
	'wireframe-screen-set': buildWireframeScreenSetBlueprint,
	'component-anatomy': buildComponentAnatomyBlueprint,
}

export function buildUiuxTemplateBlueprint(templateId: UiuxTemplateId): UiuxTemplateBlueprint {
	return UIUX_TEMPLATE_BUILDERS[templateId]()
}

export const UIUX_TEMPLATES: Readonly<Record<UiuxTemplateId, UiuxTemplateBlueprint>> = {
	'user-flow': buildUserFlowBlueprint(),
	'wireframe-screen-set': buildWireframeScreenSetBlueprint(),
	'component-anatomy': buildComponentAnatomyBlueprint(),
}

export function getUiuxTemplateBlueprint(templateId: UiuxTemplateId): UiuxTemplateBlueprint {
	return UIUX_TEMPLATES[templateId]
}

export function validateUiuxTemplateBlueprint(blueprint: UiuxTemplateBlueprint): string[] {
	const errors: string[] = []
	const artifactsById = new Map<string, UiuxBlueprintArtifact>()
	const artifactsByShapeId = new Map<string, UiuxBlueprintArtifact>()
	const relationIds = new Set<string>()
	const relationShapeIds = new Set<string>()
	const allowedPrimitives = new Set<UiuxNativePrimitive>(['frame', 'geo', 'text', 'note'])

	if (blueprint.schema !== UIUX_BLUEPRINT_SCHEMA) {
		errors.push(`Unsupported blueprint schema ${blueprint.schema}`)
	}
	if (blueprint.pack !== 'uiux') errors.push(`Unsupported blueprint pack ${blueprint.pack}`)
	if (!(blueprint.bounds.w > 0) || !(blueprint.bounds.h > 0)) {
		errors.push('Blueprint bounds must be positive')
	}

	for (const item of blueprint.artifacts) {
		const parsed = parseWorkbenchArtifact(item.artifact)
		if (parsed.pack !== blueprint.pack) {
			errors.push(`Artifact ${parsed.artifactId} belongs to pack ${parsed.pack}`)
		}
		if (artifactsById.has(parsed.artifactId)) {
			errors.push(`Duplicate artifact id ${parsed.artifactId}`)
		}
		if (artifactsByShapeId.has(item.shapeId)) {
			errors.push(`Duplicate artifact shape id ${item.shapeId}`)
		}
		artifactsById.set(parsed.artifactId, item)
		artifactsByShapeId.set(item.shapeId, item)

		if (!allowedPrimitives.has(item.visual.primitive)) {
			errors.push(`Unsupported primitive ${item.visual.primitive}`)
		}
		if (item.visual.primitive === 'geo' && !item.visual.geo) {
			errors.push(`Geo artifact ${parsed.artifactId} must declare a geo kind`)
		}
		if (item.visual.primitive !== 'geo' && item.visual.geo) {
			errors.push(`Only geo artifacts may declare a geo kind: ${parsed.artifactId}`)
		}

		const { x, y, w, h } = item.visual.geometry
		if (!(w > 0) || !(h > 0)) {
			errors.push(`Artifact ${parsed.artifactId} must have positive dimensions`)
		}
		if (x < 0 || y < 0 || x + w > blueprint.bounds.w || y + h > blueprint.bounds.h) {
			errors.push(`Artifact ${parsed.artifactId} is outside blueprint bounds`)
		}
	}

	for (const item of blueprint.artifacts) {
		if (!item.parentShapeId) continue
		const parent = artifactsByShapeId.get(item.parentShapeId)
		if (!parent) {
			errors.push(`Artifact ${item.artifact.artifactId} references missing parent ${item.parentShapeId}`)
			continue
		}
		if (parent.visual.primitive !== 'frame') {
			errors.push(`Artifact ${item.artifact.artifactId} parent must be a frame`)
		}
	}

	for (const item of blueprint.relations) {
		const relation = parseWorkbenchRelation(item.relation)
		if (relation.pack !== blueprint.pack) {
			errors.push(`Relation ${relation.relationId} belongs to pack ${relation.pack}`)
		}
		if (relationIds.has(relation.relationId)) {
			errors.push(`Duplicate relation id ${relation.relationId}`)
		}
		if (relationShapeIds.has(item.shapeId) || artifactsByShapeId.has(item.shapeId)) {
			errors.push(`Duplicate relation shape id ${item.shapeId}`)
		}
		relationIds.add(relation.relationId)
		relationShapeIds.add(item.shapeId)

		for (const [endpointName, endpoint] of [
			['start', relation.start],
			['end', relation.end],
		] as const) {
			const artifact = artifactsById.get(endpoint.artifactId)
			if (!artifact) {
				errors.push(`Relation ${relation.relationId} has missing ${endpointName} artifact`)
			} else if (artifact.shapeId !== endpoint.shapeId) {
				errors.push(`Relation ${relation.relationId} has mismatched ${endpointName} shape`)
			}
		}
	}

	return errors
}
