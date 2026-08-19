import {
	createBindingId,
	createShapeId,
	Editor,
	JsonObject,
	TLArrowBinding,
	TLArrowShape,
	TLBindingCreate,
	TLCreateShapePartial,
	TLDefaultColorStyle,
	TLDefaultDashStyle,
	TLDefaultFillStyle,
	TLFrameShape,
	TLGeoShape,
	TLNoteShape,
	TLPageId,
	TLParentId,
	TLShape,
	TLShapeId,
	TLTextShape,
	toRichText,
} from 'tldraw'
import {
	ARCHITECTURE_BOUNDARY_SHAPE_TYPE,
	ARCHITECTURE_DIAGRAM_SURFACE_SHAPE_TYPE,
	ARCHITECTURE_RELATION_LABEL_SHAPE_TYPE,
	ARCHITECTURE_SERVICE_SHAPE_TYPE,
	type ArchitectureBoundaryKind,
	type ArchitectureBoundaryShape,
	type ArchitectureDiagramSurfaceShape,
	type ArchitectureRelationLabelShape,
	type ArchitectureServiceCategory,
	type ArchitectureServiceShape,
} from './architecture/ArchitectureDiagramShapes'
import { getArchitectureTemplate } from './architecture/architectureTemplates'
import { WorkbenchDomain, WORKBENCH_DOMAIN_PACKS } from './domainPacks'
import { getMlWorkbenchTemplate } from './ml/mlTemplates'
import { getUiuxTemplateBlueprint } from './uiux/uiuxTemplates'
import {
	buildDeliveryTimelineBlueprint,
	buildImpactMapBlueprint,
	buildOpportunitySolutionTreeBlueprint,
	buildOpportunityDecisionBlueprint,
	buildProductRoadmapBlueprint,
	buildServiceBlueprint,
} from './workbenchBlueprints'

export const WORKBENCH_NATIVE_SHAPE_SCHEMA = 'workbench-native-shape/v1' as const

type WorkbenchNativePrimitive =
	| 'geo'
	| 'note'
	| 'text'
	| 'frame'
	| 'architecture-surface'
	| 'architecture-boundary'
	| 'architecture-service'
type WorkbenchRoute = 'straight' | 'elbow' | 'curved'
type WorkbenchGeo = 'rectangle' | 'ellipse' | 'diamond' | 'hexagon' | 'cloud' | 'oval'

interface WorkbenchGeometry {
	x: number
	y: number
	w: number
	h: number
}

interface WorkbenchTemplateNode {
	logicalShapeId: string
	artifactRef: string
	artifactKind?: string
	artifactRole?: string
	artifactStatus?: string
	artifactTitle: string
	text: string
	geometry: WorkbenchGeometry
	primitive: WorkbenchNativePrimitive
	parentLogicalShapeId?: string
	visual: {
		geo?: WorkbenchGeo
		color: TLDefaultColorStyle
		fill: TLDefaultFillStyle
		dash: TLDefaultDashStyle
		textSize?: 's' | 'm' | 'l' | 'xl'
		architectureCategory?: ArchitectureServiceCategory
		architectureBoundaryKind?: ArchitectureBoundaryKind
	}
}

interface WorkbenchTemplateRelation {
	logicalShapeId: string
	relationRef: string
	fromLogicalShapeId: string
	toLogicalShapeId: string
	fromArtifactRef: string
	toArtifactRef: string
	relationType: string
	text: string
	route: WorkbenchRoute
	color: TLDefaultColorStyle
	dash: TLDefaultDashStyle
}

export interface WorkbenchTemplateSource {
	pack: WorkbenchDomain
	templateId: string
	title: string
	description: string
	bounds: {
		w: number
		h: number
	}
	nodes: WorkbenchTemplateNode[]
	relations: WorkbenchTemplateRelation[]
}

export interface WorkbenchCompactArtifactMeta extends JsonObject {
	schema: 'workbench-artifact/v1'
	artifactId: string
	pack: WorkbenchDomain
	kind?: string
	role?: string
	title: string
	status?: string
	templateId: string
}

export interface WorkbenchCompactRelationBindingMeta extends JsonObject {
	artifactId: string
	shapeId: string
}

export interface WorkbenchCompactRelationMeta extends JsonObject {
	schema: 'workbench-relation/v1'
	relationId: string
	pack: WorkbenchDomain
	type: string
	label?: string
	start: WorkbenchCompactRelationBindingMeta
	end: WorkbenchCompactRelationBindingMeta
}

export interface WorkbenchShapeMeta extends JsonObject {
	schema: typeof WORKBENCH_NATIVE_SHAPE_SCHEMA
	instanceId: string
	pack: WorkbenchDomain
	templateId: string
	conversation?: WorkbenchConversationContext
	artifact?: WorkbenchCompactArtifactMeta
	relation?: WorkbenchCompactRelationMeta
}

export interface WorkbenchConversationContext extends JsonObject {
	branchId: string
	branchName: string
	parentBranchId?: string
	parentTurnId?: string
	comparedBranchId?: string
	comparedBranchName?: string
}

export type WorkbenchNativeShapePartial =
	| TLCreateShapePartial<TLGeoShape>
	| TLCreateShapePartial<TLNoteShape>
	| TLCreateShapePartial<TLTextShape>
	| TLCreateShapePartial<TLFrameShape>
	| TLCreateShapePartial<TLArrowShape>
	| TLCreateShapePartial<ArchitectureDiagramSurfaceShape>
	| TLCreateShapePartial<ArchitectureBoundaryShape>
	| TLCreateShapePartial<ArchitectureServiceShape>
	| TLCreateShapePartial<ArchitectureRelationLabelShape>

export interface WorkbenchTemplateRenderPlan {
	instanceId: string
	pack: WorkbenchDomain
	templateId: string
	title: string
	bounds: WorkbenchGeometry
	shapes: WorkbenchNativeShapePartial[]
	bindings: TLBindingCreate<TLArrowBinding>[]
	shapeIds: TLShapeId[]
	bindingIds: ReturnType<typeof createBindingId>[]
}

export interface BuildWorkbenchTemplateRenderPlanOptions {
	pack: WorkbenchDomain
	templateId: string
	instanceId: string
	center: { x: number; y: number }
	parentId: TLParentId
	today?: string
	conversation?: WorkbenchConversationContext
	nodeText?: Readonly<Record<string, string>>
}

export interface InsertWorkbenchTemplateOptions {
	instanceId?: string
	today?: string
	pageId?: TLPageId
	point?: { x: number; y: number }
	zoomInset?: number
	conversation?: WorkbenchConversationContext
	nodeText?: Readonly<Record<string, string>>
}

export interface WorkbenchTemplateReceipt {
	instanceId: string
	pack: WorkbenchDomain
	templateId: string
	shapeIds: TLShapeId[]
	bindingIds: ReturnType<typeof createBindingId>[]
}

const COLOR_BY_TONE = {
	neutral: 'grey',
	teal: 'green',
	cyan: 'light-blue',
	violet: 'violet',
	amber: 'orange',
	lime: 'light-green',
	red: 'red',
} as const satisfies Record<string, TLDefaultColorStyle>

function normalizeFill(fill: 'none' | 'tint' | 'background' | 'solid'): TLDefaultFillStyle {
	switch (fill) {
		case 'none':
			return 'none'
		case 'tint':
			return 'semi'
		case 'background':
			return 'fill'
		case 'solid':
			return 'solid'
	}
}

function safeIdSegment(value: string): string {
	const safe = value
		.replace(/^shape:/, '')
		.replace(/[^A-Za-z0-9._-]+/g, '-')
		.replace(/^-+|-+$/g, '')
	return safe || 'item'
}

function assertInstanceId(instanceId: string): string {
	if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(instanceId)) {
		throw new Error(`Invalid Workbench template instance id: ${instanceId}`)
	}
	return instanceId
}

function defaultToday(): string {
	return new Date().toISOString().slice(0, 10)
}

const ARCHITECTURE_CATEGORY_BY_ROLE: Partial<
	Record<string, ArchitectureServiceCategory>
> = {
	actor: 'external',
	system: 'backend',
	component: 'backend',
	container: 'backend',
	'data-store': 'database',
	interface: 'frontend',
	message: 'message',
	'external-system': 'external',
	assumption: 'cloud',
	evidence: 'evidence',
	option: 'cloud',
	decision: 'security',
	adr: 'evidence',
	change: 'cloud',
}

function architectureCategory(
	role: string,
	text: string
): ArchitectureServiceCategory {
	if (role === 'actor' || role === 'external-system') return 'external'
	if (/web application|browser|frontend|user interface/i.test(text)) return 'frontend'
	if (/oauth|auth|identity|security|policy/i.test(text)) return 'security'
	return ARCHITECTURE_CATEGORY_BY_ROLE[role] ?? 'backend'
}

const PRODUCT_KIND_VISUALS: Partial<
	Record<
		string,
		{
			color: TLDefaultColorStyle
			fill: TLDefaultFillStyle
			geo?: WorkbenchGeo
		}
	>
> = {
	outcome: { color: 'green', fill: 'fill', geo: 'oval' },
	opportunity: { color: 'light-blue', fill: 'semi', geo: 'cloud' },
	initiative: { color: 'grey', fill: 'semi', geo: 'rectangle' },
	decision: { color: 'orange', fill: 'fill', geo: 'diamond' },
	assumption: { color: 'yellow', fill: 'semi', geo: 'hexagon' },
	evidence: { color: 'light-green', fill: 'semi', geo: 'rectangle' },
	risk: { color: 'red', fill: 'semi', geo: 'hexagon' },
	milestone: { color: 'green', fill: 'semi', geo: 'diamond' },
}

function productRelationVisual(relationType: string): {
	color: TLDefaultColorStyle
	dash: TLDefaultDashStyle
} {
	switch (relationType) {
		case 'blocks':
			return { color: 'red', dash: 'dashed' }
		case 'decided-by':
			return { color: 'orange', dash: 'solid' }
		case 'validates':
		case 'milestone-of':
			return { color: 'green', dash: 'solid' }
		case 'implements':
			return { color: 'violet', dash: 'solid' }
		case 'informs':
			return { color: 'light-blue', dash: 'dashed' }
		default:
			return { color: 'grey', dash: 'solid' }
	}
}

function addDiagramPresentation(source: WorkbenchTemplateSource): WorkbenchTemplateSource {
	if (source.pack !== 'architecture' && source.pack !== 'product') return source

	if (source.pack === 'architecture') {
		const contentOffsetY = 104
		const footerHeight = 72
		const bounds = {
			w: source.bounds.w,
			h: source.bounds.h + contentOffsetY + footerHeight,
		}
		const surfaceId = `presentation:${source.pack}:${source.templateId}:surface`
		return {
			...source,
			bounds,
			nodes: [
				{
					logicalShapeId: surfaceId,
					artifactRef: surfaceId,
					artifactKind: 'diagram-surface',
					artifactRole: 'heading',
					artifactTitle: source.title,
					text: `${source.title}\n${source.description}`,
					geometry: { x: 0, y: 0, ...bounds },
					primitive: 'architecture-surface',
					visual: {
						color: 'black',
						fill: 'solid',
						dash: 'solid',
					},
				},
				...source.nodes.map((node) => ({
					...node,
					geometry: { ...node.geometry, y: node.geometry.y + contentOffsetY },
				})),
			],
		}
	}

	const contentOffsetY = 88
	const presentationPrefix = `presentation:${source.pack}:${source.templateId}`
	const presentationNodes: WorkbenchTemplateNode[] = [
		{
			logicalShapeId: `${presentationPrefix}:title`,
			artifactRef: `${presentationPrefix}:title`,
			artifactKind: 'diagram-title',
			artifactRole: 'heading',
			artifactTitle: source.title,
			text: source.title,
			geometry: { x: 0, y: 0, w: source.bounds.w, h: 40 },
			primitive: 'text',
			visual: {
				color: 'black',
				fill: 'none',
				dash: 'solid',
				textSize: 'xl',
			},
		},
		{
			logicalShapeId: `${presentationPrefix}:description`,
			artifactRef: `${presentationPrefix}:description`,
			artifactKind: 'diagram-context',
			artifactRole: 'annotation',
			artifactTitle: source.description,
			text: source.description,
			geometry: { x: 0, y: 46, w: source.bounds.w, h: 32 },
			primitive: 'text',
			visual: {
				color: 'grey',
				fill: 'none',
				dash: 'solid',
				textSize: 'm',
			},
		},
		...(source.pack === 'product' &&
		source.templateId === 'product-roadmap'
			? ['Now', 'Next', 'Later'].map<WorkbenchTemplateNode>((label, index) => ({
					logicalShapeId: `${presentationPrefix}:phase:${index}`,
					artifactRef: `${presentationPrefix}:phase:${index}`,
					artifactKind: 'diagram-phase',
					artifactRole: 'annotation',
					artifactTitle: label,
					text: label,
					geometry: { x: 120 + index * 360, y: 112, w: 200, h: 28 },
					primitive: 'text',
					visual: {
						color: 'grey',
						fill: 'none',
						dash: 'solid',
						textSize: 's',
					},
				}))
			: []),
	]

	return {
		...source,
		bounds: { w: source.bounds.w, h: source.bounds.h + contentOffsetY + 24 },
		nodes: [
			...presentationNodes,
			...source.nodes.map((node) => ({
				...node,
				geometry: { ...node.geometry, y: node.geometry.y + contentOffsetY },
			})),
		],
	}
}

function adaptArchitectureTemplate(templateId: string): WorkbenchTemplateSource {
	const template = getArchitectureTemplate(templateId as Parameters<typeof getArchitectureTemplate>[0])
	if (!template) throw new Error(`Unknown Architecture template: ${templateId}`)

	const artifacts = new Map(template.nodes.map((node) => [node.id, node.meta.workbenchArtifact.artifactId]))

	return {
		pack: 'architecture',
		templateId: template.id,
		title: template.title,
		description: template.description,
		bounds: template.canvas,
		nodes: template.nodes.map((node) => {
			const role = node.meta.workbenchArtifact.role
			const isBoundary = role === 'boundary' || role === 'radar-zone'
			const isSecurityBoundary = /trusted|security/i.test(node.text)
			return {
				logicalShapeId: node.id,
				artifactRef: node.meta.workbenchArtifact.artifactId,
				artifactRole: role,
				artifactStatus: node.meta.workbenchArtifact.status,
				artifactTitle: node.text.split('\n')[0],
				text: node.text,
				geometry: { x: node.x, y: node.y, w: node.w, h: node.h },
				primitive: isBoundary
					? 'architecture-boundary'
					: 'architecture-service',
				...(node.containerId ? { parentLogicalShapeId: node.containerId } : {}),
				visual: {
					geo: node.visual.geo,
					color: node.visual.color,
					fill: normalizeFill(node.visual.fill),
					dash: node.visual.dash,
					textSize: role === 'system' || role === 'change' ? ('m' as const) : ('s' as const),
					architectureCategory: architectureCategory(role, node.text),
					architectureBoundaryKind: isSecurityBoundary
						? 'security-group'
						: 'region',
				},
			}
		}),
		relations: template.relations.map((relation) => ({
			logicalShapeId: relation.id,
			relationRef: relation.meta.workbenchArtifact.artifactId,
			fromLogicalShapeId: relation.from,
			toLogicalShapeId: relation.to,
			fromArtifactRef: artifacts.get(relation.from) ?? relation.from,
			toArtifactRef: artifacts.get(relation.to) ?? relation.to,
			relationType: relation.meta.workbenchArtifact.relation,
			text: relation.text,
			route:
				template.id === 'decision-graph'
					? 'curved'
					: template.id === 'change-radar'
						? 'straight'
						: 'elbow',
			color: relation.visual.color,
			dash: relation.visual.dash,
		})),
	}
}

function adaptMlTemplate(templateId: string): WorkbenchTemplateSource {
	const template = getMlWorkbenchTemplate(templateId as Parameters<typeof getMlWorkbenchTemplate>[0])
	if (!template) throw new Error(`Unknown ML template: ${templateId}`)

	return {
		pack: 'ml',
		templateId: template.id,
		title: template.title,
		description: template.description,
		bounds: template.canvas,
		nodes: template.nodes.map((node) => ({
			logicalShapeId: node.shapeId,
			artifactRef: node.meta.workbenchArtifact.artifactId,
			artifactKind: node.meta.workbenchArtifact.kind,
			artifactStatus: node.meta.workbenchArtifact.status,
			artifactTitle: node.meta.workbenchArtifact.title,
			text: node.text,
			geometry: node.geometry,
			primitive: node.visual.primitive,
			visual: {
				geo: node.visual.geo,
				color: node.visual.color,
				fill: normalizeFill(node.visual.fill),
				dash: node.visual.dash,
			},
		})),
		relations: template.relations.map((relation) => ({
			logicalShapeId: relation.shapeId,
			relationRef: relation.meta.workbenchRelation.relationId,
			fromLogicalShapeId: relation.meta.workbenchRelation.start.shapeId,
			toLogicalShapeId: relation.meta.workbenchRelation.end.shapeId,
			fromArtifactRef: relation.meta.workbenchRelation.start.artifactId,
			toArtifactRef: relation.meta.workbenchRelation.end.artifactId,
			relationType: relation.meta.workbenchRelation.type,
			text: relation.text,
			route: relation.visual.route,
			color: relation.visual.color,
			dash: relation.visual.dash,
		})),
	}
}

function adaptUiuxTemplate(templateId: string): WorkbenchTemplateSource {
	const template = getUiuxTemplateBlueprint(templateId as Parameters<typeof getUiuxTemplateBlueprint>[0])
	if (!template) throw new Error(`Unknown UI/UX template: ${templateId}`)

	return {
		pack: 'uiux',
		templateId: template.kind,
		title: template.title,
		description: template.description,
		bounds: template.bounds,
		nodes: template.artifacts.map((item) => ({
			logicalShapeId: item.shapeId,
			artifactRef: item.artifact.artifactId,
			artifactKind: item.artifact.kind,
			artifactStatus: item.artifact.status,
			artifactTitle: item.artifact.title,
			text: item.text,
			geometry: item.visual.geometry,
			primitive: item.visual.primitive,
			...(item.parentShapeId ? { parentLogicalShapeId: item.parentShapeId } : {}),
			visual: {
				geo: item.visual.geo === 'pill' ? 'oval' : item.visual.geo,
				color: COLOR_BY_TONE[item.visual.tone],
				fill: item.visual.primitive === 'text' || item.visual.primitive === 'frame' ? 'none' : 'semi',
				dash: 'solid',
			},
		})),
		relations: template.relations.map((item) => ({
			logicalShapeId: item.shapeId,
			relationRef: item.relation.relationId,
			fromLogicalShapeId: item.relation.start.shapeId,
			toLogicalShapeId: item.relation.end.shapeId,
			fromArtifactRef: item.relation.start.artifactId,
			toArtifactRef: item.relation.end.artifactId,
			relationType: item.relation.type,
			text: item.relation.label ?? '',
			route: item.visual.route,
			color: 'grey',
			dash: 'solid',
		})),
	}
}

function adaptProductTemplate(templateId: string, today: string): WorkbenchTemplateSource {
	const options = {
		blueprintId:
			templateId === 'opportunity-solution-tree'
				? 'ost'
				: templateId === 'service-blueprint'
					? 'journey-blueprint'
					: templateId,
		startDate: today,
	}
	const template =
		templateId === 'product-roadmap'
			? buildProductRoadmapBlueprint(options)
			: templateId === 'delivery-timeline'
				? buildDeliveryTimelineBlueprint(options)
				: templateId === 'opportunity-decision'
					? buildOpportunityDecisionBlueprint(options)
					: templateId === 'opportunity-solution-tree'
						? buildOpportunitySolutionTreeBlueprint(options)
						: templateId === 'impact-map'
							? buildImpactMapBlueprint(options)
							: templateId === 'service-blueprint'
								? buildServiceBlueprint(options)
								: null
	if (!template) throw new Error(`Unknown Product template: ${templateId}`)
	const logicalShapeIdByArtifactId = new Map(template.artifacts.map((item) => [item.artifact.artifactId, item.shapeId]))
	const isTimeline =
		template.kind === 'product-roadmap' || template.kind === 'delivery-timeline'
	const visibleRelations = template.kind === 'product-roadmap'
		? template.relations.filter((item) =>
				['blocks', 'decided-by'].includes(item.relation.type)
			)
		: template.relations
	const description = WORKBENCH_DOMAIN_PACKS.product.templates.find(
		(candidate) => candidate.id === templateId
	)?.description

	return {
		pack: 'product',
		templateId: template.kind,
		title: template.title,
		description: description ?? `${template.title} starter`,
		bounds: template.bounds,
		nodes: template.artifacts.map((item) => {
			const laneRef = item.artifact.refs.find(
				(reference) => reference.kind === 'artifact' && reference.label === 'Timeline lane'
			)
			const parentLogicalShapeId = laneRef ? logicalShapeIdByArtifactId.get(laneRef.target) : undefined
			const semanticVisual =
				isTimeline && item.visual.role === 'milestone'
					? ({ color: 'green', fill: 'semi', geo: 'oval' } as const)
					: item.artifact.kind === 'initiative' && item.artifact.status === 'active'
					? ({
							color: 'light-blue',
							fill: 'semi',
							geo: 'rectangle',
						} as const)
					: PRODUCT_KIND_VISUALS[item.artifact.kind]
			const geometry =
				isTimeline && item.visual.role === 'bar'
					? {
							...item.visual.geometry,
							y: item.visual.geometry.y - 7,
							h: Math.max(item.visual.geometry.h, 72),
						}
					: isTimeline && item.visual.role === 'milestone'
						? {
								...item.visual.geometry,
								x:
									item.visual.geometry.x -
									(Math.max(item.visual.geometry.w, 112) - item.visual.geometry.w) / 2,
								y:
									item.visual.geometry.y -
									(Math.max(item.visual.geometry.h, 64) - item.visual.geometry.h) / 2,
								w: Math.max(item.visual.geometry.w, 112),
								h: Math.max(item.visual.geometry.h, 64),
							}
						: item.visual.geometry
			return {
				logicalShapeId: item.shapeId,
				artifactRef: item.artifact.artifactId,
				artifactKind: item.artifact.kind,
				artifactStatus: item.artifact.status,
				artifactTitle: item.artifact.title,
				text:
					isTimeline && item.visual.role === 'milestone'
						? item.artifact.title.split(' ')[0]
						: item.artifact.title,
				geometry,
				primitive: item.visual.role === 'lane' ? 'frame' : 'geo',
				...(parentLogicalShapeId ? { parentLogicalShapeId } : {}),
				visual: {
					geo: semanticVisual?.geo ?? item.visual.geometry.geo,
					color:
						semanticVisual?.color ??
						COLOR_BY_TONE[item.visual.tone as keyof typeof COLOR_BY_TONE] ??
						'grey',
					fill:
						item.visual.role === 'lane'
							? 'none'
							: (semanticVisual?.fill ?? 'semi'),
					dash: item.visual.role === 'lane' ? 'dashed' : 'solid',
					textSize:
						item.visual.role === 'lane' || item.visual.role === 'milestone'
							? ('s' as const)
							: ('m' as const),
				},
			}
		}),
		relations: visibleRelations.map((item) => {
			const visual =
				template.kind === 'delivery-timeline'
					? ({ color: 'grey', dash: 'solid' } as const)
					: productRelationVisual(item.relation.type)
			return {
				logicalShapeId: item.shapeId,
				relationRef: item.relation.relationId,
				fromLogicalShapeId: item.relation.start.shapeId,
				toLogicalShapeId: item.relation.end.shapeId,
				fromArtifactRef: item.relation.start.artifactId,
				toArtifactRef: item.relation.end.artifactId,
				relationType: item.relation.type,
				text: item.relation.label ?? '',
				route: item.visual.route,
				color: visual.color,
				dash: visual.dash,
			}
		}),
	}
}

export function getWorkbenchTemplateSource(
	pack: WorkbenchDomain,
	templateId: string,
	today = defaultToday()
): WorkbenchTemplateSource {
	const packTemplates = WORKBENCH_DOMAIN_PACKS[pack].templates
	if (!packTemplates.some((template) => template.id === templateId)) {
		throw new Error(`Template ${templateId} does not belong to ${pack}`)
	}

	switch (pack) {
		case 'architecture':
			return addDiagramPresentation(adaptArchitectureTemplate(templateId))
		case 'ml':
			return addDiagramPresentation(adaptMlTemplate(templateId))
		case 'uiux':
			return addDiagramPresentation(adaptUiuxTemplate(templateId))
		case 'product':
			return addDiagramPresentation(adaptProductTemplate(templateId, today))
	}
}

function nodeMeta(
	instanceId: string,
	source: WorkbenchTemplateSource,
	node: WorkbenchTemplateNode,
	conversation?: WorkbenchConversationContext
): { workbench: WorkbenchShapeMeta } {
	return {
		workbench: {
			schema: WORKBENCH_NATIVE_SHAPE_SCHEMA,
			instanceId,
			pack: source.pack,
			templateId: source.templateId,
			...(conversation ? { conversation } : {}),
			artifact: {
				schema: 'workbench-artifact/v1',
				artifactId: node.artifactRef,
				pack: source.pack,
				...(node.artifactKind ? { kind: node.artifactKind } : {}),
				...(node.artifactRole ? { role: node.artifactRole } : {}),
				title: node.artifactTitle,
				...(node.artifactStatus ? { status: node.artifactStatus } : {}),
				templateId: source.templateId,
			},
		},
	}
}

function relationMeta(
	instanceId: string,
	source: WorkbenchTemplateSource,
	relation: WorkbenchTemplateRelation,
	startShapeId: TLShapeId,
	endShapeId: TLShapeId,
	conversation?: WorkbenchConversationContext
): { workbench: WorkbenchShapeMeta } {
	return {
		workbench: {
			schema: WORKBENCH_NATIVE_SHAPE_SCHEMA,
			instanceId,
			pack: source.pack,
			templateId: source.templateId,
			...(conversation ? { conversation } : {}),
			relation: {
				schema: 'workbench-relation/v1',
				relationId: relation.relationRef,
				pack: source.pack,
				type: relation.relationType,
				start: {
					artifactId: relation.fromArtifactRef,
					shapeId: startShapeId,
				},
				end: {
					artifactId: relation.toArtifactRef,
					shapeId: endShapeId,
				},
			},
		},
	}
}

function relationLabelMeta(
	instanceId: string,
	source: WorkbenchTemplateSource,
	relation: WorkbenchTemplateRelation,
	conversation?: WorkbenchConversationContext
): { workbench: WorkbenchShapeMeta } {
	return {
		workbench: {
			schema: WORKBENCH_NATIVE_SHAPE_SCHEMA,
			instanceId,
			pack: source.pack,
			templateId: source.templateId,
			...(conversation ? { conversation } : {}),
			artifact: {
				schema: 'workbench-artifact/v1',
				artifactId: `${relation.relationRef}:label`,
				pack: source.pack,
				kind: 'relation-label',
				role: 'annotation',
				title: relation.text,
				templateId: source.templateId,
			},
		},
	}
}

function createNodeShape(
	node: WorkbenchTemplateNode,
	id: TLShapeId,
	parentId: TLParentId,
	x: number,
	y: number,
	meta: { workbench: WorkbenchShapeMeta }
): Exclude<WorkbenchNativeShapePartial, TLCreateShapePartial<TLArrowShape>> {
	const [title = node.artifactTitle, subtitle = '', ...details] = node.text
		.split('\n')
		.map((line) => line.trim())
	switch (node.primitive) {
		case 'architecture-surface':
			return {
				id,
				type: ARCHITECTURE_DIAGRAM_SURFACE_SHAPE_TYPE,
				parentId,
				x,
				y,
				props: {
					w: node.geometry.w,
					h: node.geometry.h,
					title,
					subtitle,
				},
				meta,
			}
		case 'architecture-boundary':
			return {
				id,
				type: ARCHITECTURE_BOUNDARY_SHAPE_TYPE,
				parentId,
				x,
				y,
				props: {
					w: node.geometry.w,
					h: node.geometry.h,
					kind: node.visual.architectureBoundaryKind ?? 'region',
					label: [title, subtitle, ...details].filter(Boolean).join(' · '),
				},
				meta,
			}
		case 'architecture-service':
			return {
				id,
				type: ARCHITECTURE_SERVICE_SHAPE_TYPE,
				parentId,
				x,
				y,
				props: {
					w: node.geometry.w,
					h: node.geometry.h,
					category: node.visual.architectureCategory ?? 'backend',
					role: node.artifactRole ?? node.artifactKind ?? 'service',
					title,
					subtitle,
					details,
				},
				meta,
			}
		case 'frame':
			return {
				id,
				type: 'frame',
				parentId,
				x,
				y,
				props: {
					w: node.geometry.w,
					h: node.geometry.h,
					name: node.text,
					color: node.visual.color,
				},
				meta,
			}
		case 'note': {
			const scale = Math.max(0.45, Math.min(node.geometry.w, node.geometry.h) / 200)
			const renderedSize = 200 * scale
			return {
				id,
				type: 'note',
				parentId,
				x: x + (node.geometry.w - renderedSize) / 2,
				y: y + (node.geometry.h - renderedSize) / 2,
				props: {
					color: node.visual.color,
					labelColor: 'black',
					size: node.visual.textSize ?? 's',
					font: 'sans',
					align: 'middle',
					verticalAlign: 'middle',
					richText: toRichText(node.text),
					scale,
				},
				meta,
			}
		}
		case 'text':
			return {
				id,
				type: 'text',
				parentId,
				x,
				y,
				props: {
					color: node.visual.color,
					size: node.visual.textSize ?? 'm',
					font: 'sans',
					textAlign: 'start',
					w: node.geometry.w,
					richText: toRichText(node.text),
					autoSize: false,
				},
				meta,
			}
		case 'geo':
			return {
				id,
				type: 'geo',
				parentId,
				x,
				y,
				props: {
					geo: node.visual.geo ?? 'rectangle',
					w: node.geometry.w,
					h: node.geometry.h,
					color: node.visual.color,
					labelColor: 'black',
					fill: node.visual.fill,
					dash: node.visual.dash,
					size: node.visual.textSize ?? 's',
					font: 'sans',
					align: 'middle',
					verticalAlign: 'middle',
					richText: toRichText(node.text),
				},
				meta,
			}
	}
}

export function buildWorkbenchTemplateRenderPlan(
	options: BuildWorkbenchTemplateRenderPlanOptions
): WorkbenchTemplateRenderPlan {
	const instanceId = assertInstanceId(options.instanceId)
	const source = getWorkbenchTemplateSource(options.pack, options.templateId, options.today)
	const origin = {
		x: options.center.x - source.bounds.w / 2,
		y: options.center.y - source.bounds.h / 2,
	}
	const sourceNodes = new Map(source.nodes.map((node) => [node.logicalShapeId, node]))
	const shapeIdsByLogicalId = new Map<string, TLShapeId>()

	source.nodes.forEach((node, index) => {
		shapeIdsByLogicalId.set(node.logicalShapeId, createShapeId(`${instanceId}-node-${index}`))
	})

	const nodeShapes = source.nodes.map((sourceNode) => {
		const id = shapeIdsByLogicalId.get(sourceNode.logicalShapeId)
		if (!id) throw new Error(`Missing generated id for ${sourceNode.logicalShapeId}`)
		const replacementText = options.nodeText?.[sourceNode.logicalShapeId]?.trim()
		const node = replacementText
			? {
					...sourceNode,
					text: replacementText,
					artifactTitle: replacementText.split('\n')[0],
				}
			: sourceNode

		const requestedParent = node.parentLogicalShapeId ? sourceNodes.get(node.parentLogicalShapeId) : undefined
		const frameParent =
			requestedParent?.primitive === 'frame' && node.parentLogicalShapeId
				? {
						source: requestedParent,
						id: shapeIdsByLogicalId.get(node.parentLogicalShapeId),
					}
				: undefined
		const parentId = frameParent?.id ?? options.parentId
		const x = frameParent ? node.geometry.x - frameParent.source.geometry.x : origin.x + node.geometry.x
		const y = frameParent ? node.geometry.y - frameParent.source.geometry.y : origin.y + node.geometry.y

		return createNodeShape(node, id, parentId, x, y, nodeMeta(instanceId, source, node, options.conversation))
	})

	const arrowShapes: TLCreateShapePartial<TLArrowShape>[] = []
	const relationLabelShapes: TLCreateShapePartial<ArchitectureRelationLabelShape>[] = []
	const bindings: TLBindingCreate<TLArrowBinding>[] = []

	source.relations.forEach((relation, index) => {
		const startNode = sourceNodes.get(relation.fromLogicalShapeId)
		const endNode = sourceNodes.get(relation.toLogicalShapeId)
		const startShapeId = shapeIdsByLogicalId.get(relation.fromLogicalShapeId)
		const endShapeId = shapeIdsByLogicalId.get(relation.toLogicalShapeId)
		if (!startNode || !endNode || !startShapeId || !endShapeId) {
			throw new Error(`Relation ${relation.relationRef} targets a missing Workbench node`)
		}

		const start = {
			x: origin.x + startNode.geometry.x + startNode.geometry.w / 2,
			y: origin.y + startNode.geometry.y + startNode.geometry.h / 2,
		}
		const end = {
			x: origin.x + endNode.geometry.x + endNode.geometry.w / 2,
			y: origin.y + endNode.geometry.y + endNode.geometry.h / 2,
		}
		const arrowId = createShapeId(`${instanceId}-relation-${index}`)
		arrowShapes.push({
			id: arrowId,
			type: 'arrow',
			parentId: options.parentId,
			x: start.x,
			y: start.y,
			props: {
				kind: relation.route === 'elbow' ? 'elbow' : 'arc',
				color: relation.color,
				labelColor: source.pack === 'architecture' ? 'grey' : 'black',
				dash: relation.dash,
				size: 's',
				font: source.pack === 'architecture' ? 'mono' : 'sans',
				arrowheadStart: 'none',
				arrowheadEnd: 'arrow',
				start: { x: 0, y: 0 },
				end: { x: end.x - start.x, y: end.y - start.y },
				bend: relation.route === 'curved' ? 32 : 0,
				richText: toRichText(source.pack === 'architecture' ? '' : relation.text),
			},
			meta: relationMeta(instanceId, source, relation, startShapeId, endShapeId, options.conversation),
		})
		if (source.pack === 'architecture' && relation.text) {
			const width = Math.max(44, Math.min(180, relation.text.length * 7 + 18))
			const height = 24
			relationLabelShapes.push({
				id: createShapeId(`${instanceId}-relation-label-${index}`),
				type: ARCHITECTURE_RELATION_LABEL_SHAPE_TYPE,
				parentId: options.parentId,
				x: (start.x + end.x) / 2 - width / 2,
				y: (start.y + end.y) / 2 - height / 2,
				props: {
					w: width,
					h: height,
					text: relation.text,
				},
				meta: relationLabelMeta(instanceId, source, relation, options.conversation),
			})
		}

		for (const [terminal, toId] of [
			['start', startShapeId],
			['end', endShapeId],
		] as const) {
			bindings.push({
				id: createBindingId(`${instanceId}-binding-${index}-${terminal}`),
				type: 'arrow',
				fromId: arrowId,
				toId,
				props: {
					terminal,
					normalizedAnchor: { x: 0.5, y: 0.5 },
					isExact: false,
					isPrecise: false,
					snap: 'none',
				},
			})
		}
	})

	const surfaceShapes = nodeShapes.filter(
		(shape) => shape.type === ARCHITECTURE_DIAGRAM_SURFACE_SHAPE_TYPE
	)
	const backgroundShapes = nodeShapes.filter(
		(shape) =>
			shape.type === 'frame' || shape.type === ARCHITECTURE_BOUNDARY_SHAPE_TYPE
	)
	const foregroundNodeShapes = nodeShapes.filter(
		(shape) =>
			shape.type !== ARCHITECTURE_DIAGRAM_SURFACE_SHAPE_TYPE &&
			shape.type !== ARCHITECTURE_BOUNDARY_SHAPE_TYPE &&
			shape.type !== 'frame'
	)
	const shapes: WorkbenchNativeShapePartial[] = [
		...surfaceShapes,
		...backgroundShapes,
		...arrowShapes,
		...relationLabelShapes,
		...foregroundNodeShapes,
	]
	return {
		instanceId,
		pack: source.pack,
		templateId: source.templateId,
		title: source.title,
		bounds: { x: origin.x, y: origin.y, w: source.bounds.w, h: source.bounds.h },
		shapes,
		bindings,
		shapeIds: shapes.map((shape) => shape.id).filter((id): id is TLShapeId => Boolean(id)),
		bindingIds: bindings
			.map((binding) => binding.id)
			.filter((id): id is ReturnType<typeof createBindingId> => Boolean(id)),
	}
}

function createInstanceId(pack: WorkbenchDomain, templateId: string): string {
	const stamp = Date.now().toString(36)
	const nonce = Math.random().toString(36).slice(2, 8)
	return `wb-${safeIdSegment(pack)}-${safeIdSegment(templateId)}-${stamp}-${nonce}`
}

function prepareWorkbenchTemplate(
	editor: Editor,
	pack: WorkbenchDomain,
	templateId: string,
	options: InsertWorkbenchTemplateOptions
) {
	const instanceId = options.instanceId ?? createInstanceId(pack, templateId)
	const pageId = options.pageId ?? editor.getCurrentPageId()
	if (!editor.getPage(pageId)) {
		throw new Error(`Workbench insertion page ${pageId} does not exist`)
	}
	return buildWorkbenchTemplateRenderPlan({
		pack,
		templateId,
		instanceId,
		center: options.point ?? editor.getViewportPageBounds().center,
		parentId: pageId,
		today: options.today,
		conversation: options.conversation,
		nodeText: options.nodeText,
	})
}

function applyWorkbenchTemplatePlan(editor: Editor, plan: WorkbenchTemplateRenderPlan) {
	editor.createShapes(plan.shapes as TLCreateShapePartial<TLShape>[])
	for (const shapeId of plan.shapeIds) {
		if (!editor.getShape(shapeId)) {
			throw new Error(`Workbench insertion skipped shape ${shapeId}`)
		}
	}

	editor.createBindings(plan.bindings)
	for (const bindingId of plan.bindingIds) {
		if (!editor.getBinding(bindingId)) {
			throw new Error(`Workbench insertion skipped binding ${bindingId}`)
		}
	}
}

function receiptFromPlan(plan: WorkbenchTemplateRenderPlan): WorkbenchTemplateReceipt {
	return {
		instanceId: plan.instanceId,
		pack: plan.pack,
		templateId: plan.templateId,
		shapeIds: plan.shapeIds,
		bindingIds: plan.bindingIds,
	}
}

/**
 * Apply a Workbench preset without history marks, selection, or camera effects.
 * Trusted headless dispatchers must wrap this in their own validated transaction.
 */
export function applyWorkbenchTemplate(
	editor: Editor,
	pack: WorkbenchDomain,
	templateId: string,
	options: InsertWorkbenchTemplateOptions = {}
): WorkbenchTemplateReceipt {
	const plan = prepareWorkbenchTemplate(editor, pack, templateId, options)
	applyWorkbenchTemplatePlan(editor, plan)
	return receiptFromPlan(plan)
}

export function insertWorkbenchTemplate(
	editor: Editor,
	pack: WorkbenchDomain,
	templateId: string,
	options: InsertWorkbenchTemplateOptions = {}
): WorkbenchTemplateReceipt {
	const plan = prepareWorkbenchTemplate(editor, pack, templateId, options)

	editor.markHistoryStoppingPoint(`Create ${plan.title}`)
	editor.run(() => {
		applyWorkbenchTemplatePlan(editor, plan)
		editor.setSelectedShapes(plan.shapeIds)
	})
	editor.zoomToBounds(plan.bounds, {
		inset: options.zoomInset ?? 240,
		animation: { duration: editor.options.animationMediumMs },
	})

	return receiptFromPlan(plan)
}
