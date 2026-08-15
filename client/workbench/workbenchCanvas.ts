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
import { getArchitectureTemplate } from './architecture/architectureTemplates'
import { WorkbenchDomain, WORKBENCH_DOMAIN_PACKS } from './domainPacks'
import { getMlWorkbenchTemplate } from './ml/mlTemplates'
import { getUiuxTemplateBlueprint } from './uiux/uiuxTemplates'
import {
	buildDeliveryTimelineBlueprint,
	buildOpportunityDecisionBlueprint,
	buildProductRoadmapBlueprint,
} from './workbenchBlueprints'

export const WORKBENCH_NATIVE_SHAPE_SCHEMA = 'workbench-native-shape/v1' as const

type WorkbenchNativePrimitive = 'geo' | 'note' | 'text' | 'frame'
type WorkbenchRoute = 'straight' | 'elbow' | 'curved'
type WorkbenchGeo =
	| 'rectangle'
	| 'ellipse'
	| 'diamond'
	| 'hexagon'
	| 'cloud'
	| 'oval'

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
	artifact?: WorkbenchCompactArtifactMeta
	relation?: WorkbenchCompactRelationMeta
}

export type WorkbenchNativeShapePartial =
	| TLCreateShapePartial<TLGeoShape>
	| TLCreateShapePartial<TLNoteShape>
	| TLCreateShapePartial<TLTextShape>
	| TLCreateShapePartial<TLFrameShape>
	| TLCreateShapePartial<TLArrowShape>

export interface WorkbenchTemplateRenderPlan {
	instanceId: string
	pack: WorkbenchDomain
	templateId: string
	title: string
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
}

export interface InsertWorkbenchTemplateOptions {
	instanceId?: string
	today?: string
	pageId?: TLPageId
	point?: { x: number; y: number }
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

function adaptArchitectureTemplate(templateId: string): WorkbenchTemplateSource {
	const template = getArchitectureTemplate(
		templateId as Parameters<typeof getArchitectureTemplate>[0]
	)
	if (!template) throw new Error(`Unknown Architecture template: ${templateId}`)

	const artifacts = new Map(
		template.nodes.map((node) => [node.id, node.meta.workbenchArtifact.artifactId])
	)

	return {
		pack: 'architecture',
		templateId: template.id,
		title: template.title,
		description: template.description,
		bounds: template.canvas,
		nodes: template.nodes.map((node) => ({
			logicalShapeId: node.id,
			artifactRef: node.meta.workbenchArtifact.artifactId,
			artifactRole: node.meta.workbenchArtifact.role,
			artifactStatus: node.meta.workbenchArtifact.status,
			artifactTitle: node.text.split('\n')[0],
			text: node.text,
			geometry: { x: node.x, y: node.y, w: node.w, h: node.h },
			primitive: node.visual.shape,
			visual: {
				geo: node.visual.geo,
				color: node.visual.color,
				fill: normalizeFill(node.visual.fill),
				dash: node.visual.dash,
			},
		})),
		relations: template.relations.map((relation) => ({
			logicalShapeId: relation.id,
			relationRef: relation.meta.workbenchArtifact.artifactId,
			fromLogicalShapeId: relation.from,
			toLogicalShapeId: relation.to,
			fromArtifactRef: artifacts.get(relation.from) ?? relation.from,
			toArtifactRef: artifacts.get(relation.to) ?? relation.to,
			relationType: relation.meta.workbenchArtifact.relation,
			text: relation.text,
			route: 'straight',
			color: relation.visual.color,
			dash: relation.visual.dash,
		})),
	}
}

function adaptMlTemplate(templateId: string): WorkbenchTemplateSource {
	const template = getMlWorkbenchTemplate(
		templateId as Parameters<typeof getMlWorkbenchTemplate>[0]
	)
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
	const template = getUiuxTemplateBlueprint(
		templateId as Parameters<typeof getUiuxTemplateBlueprint>[0]
	)
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
		blueprintId: `wb-${templateId}`,
		startDate: today,
	}
	const template =
		templateId === 'product-roadmap'
			? buildProductRoadmapBlueprint(options)
			: templateId === 'delivery-timeline'
				? buildDeliveryTimelineBlueprint(options)
				: templateId === 'opportunity-decision'
					? buildOpportunityDecisionBlueprint(options)
					: null
	if (!template) throw new Error(`Unknown Product template: ${templateId}`)

	return {
		pack: 'product',
		templateId: template.kind,
		title: template.title,
		description: `${template.title} starter`,
		bounds: template.bounds,
		nodes: template.artifacts.map((item) => ({
			logicalShapeId: item.shapeId,
			artifactRef: item.artifact.artifactId,
			artifactKind: item.artifact.kind,
			artifactStatus: item.artifact.status,
			artifactTitle: item.artifact.title,
			text: item.artifact.title,
			geometry: item.visual.geometry,
			primitive: 'geo',
			visual: {
				geo: item.visual.geometry.geo,
				color:
					COLOR_BY_TONE[item.visual.tone as keyof typeof COLOR_BY_TONE] ?? 'grey',
				fill: item.visual.role === 'lane' ? 'none' : 'semi',
				dash: item.visual.role === 'lane' ? 'dashed' : 'solid',
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
			return adaptArchitectureTemplate(templateId)
		case 'ml':
			return adaptMlTemplate(templateId)
		case 'uiux':
			return adaptUiuxTemplate(templateId)
		case 'product':
			return adaptProductTemplate(templateId, today)
	}
}

function nodeMeta(
	instanceId: string,
	source: WorkbenchTemplateSource,
	node: WorkbenchTemplateNode
): { workbench: WorkbenchShapeMeta } {
	return {
		workbench: {
			schema: WORKBENCH_NATIVE_SHAPE_SCHEMA,
			instanceId,
			pack: source.pack,
			templateId: source.templateId,
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
	endShapeId: TLShapeId
): { workbench: WorkbenchShapeMeta } {
	return {
		workbench: {
			schema: WORKBENCH_NATIVE_SHAPE_SCHEMA,
			instanceId,
			pack: source.pack,
			templateId: source.templateId,
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

function createNodeShape(
	node: WorkbenchTemplateNode,
	id: TLShapeId,
	parentId: TLParentId,
	x: number,
	y: number,
	meta: { workbench: WorkbenchShapeMeta }
): Exclude<WorkbenchNativeShapePartial, TLCreateShapePartial<TLArrowShape>> {
	switch (node.primitive) {
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
					size: 's',
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
					size: 'm',
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
					size: 's',
					font: 'sans',
					align: 'middle',
					verticalAlign: 'middle',
					richText: toRichText(node.text),
				},
				meta,
			}
	}
}

function centerOf(geometry: WorkbenchGeometry, origin: { x: number; y: number }) {
	return {
		x: origin.x + geometry.x + geometry.w / 2,
		y: origin.y + geometry.y + geometry.h / 2,
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
		shapeIdsByLogicalId.set(
			node.logicalShapeId,
			createShapeId(`${instanceId}-node-${index}`)
		)
	})

	const nodeShapes = source.nodes.map((node) => {
		const id = shapeIdsByLogicalId.get(node.logicalShapeId)
		if (!id) throw new Error(`Missing generated id for ${node.logicalShapeId}`)

		const requestedParent = node.parentLogicalShapeId
			? sourceNodes.get(node.parentLogicalShapeId)
			: undefined
		const frameParent =
			requestedParent?.primitive === 'frame' && node.parentLogicalShapeId
				? {
						source: requestedParent,
						id: shapeIdsByLogicalId.get(node.parentLogicalShapeId),
					}
				: undefined
		const parentId = frameParent?.id ?? options.parentId
		const x = frameParent
			? node.geometry.x - frameParent.source.geometry.x
			: origin.x + node.geometry.x
		const y = frameParent
			? node.geometry.y - frameParent.source.geometry.y
			: origin.y + node.geometry.y

		return createNodeShape(node, id, parentId, x, y, nodeMeta(instanceId, source, node))
	})

	const arrowShapes: TLCreateShapePartial<TLArrowShape>[] = []
	const bindings: TLBindingCreate<TLArrowBinding>[] = []

	source.relations.forEach((relation, index) => {
		const startNode = sourceNodes.get(relation.fromLogicalShapeId)
		const endNode = sourceNodes.get(relation.toLogicalShapeId)
		const startShapeId = shapeIdsByLogicalId.get(relation.fromLogicalShapeId)
		const endShapeId = shapeIdsByLogicalId.get(relation.toLogicalShapeId)
		if (!startNode || !endNode || !startShapeId || !endShapeId) {
			throw new Error(`Relation ${relation.relationRef} targets a missing Workbench node`)
		}

		const start = centerOf(startNode.geometry, origin)
		const end = centerOf(endNode.geometry, origin)
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
				dash: relation.dash,
				size: 's',
				arrowheadStart: 'none',
				arrowheadEnd: 'arrow',
				start: { x: 0, y: 0 },
				end: { x: end.x - start.x, y: end.y - start.y },
				bend: relation.route === 'curved' ? 32 : 0,
				richText: toRichText(relation.text),
			},
			meta: relationMeta(instanceId, source, relation, startShapeId, endShapeId),
		})

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

	const shapes: WorkbenchNativeShapePartial[] = [...nodeShapes, ...arrowShapes]
	return {
		instanceId,
		pack: source.pack,
		templateId: source.templateId,
		title: source.title,
		shapes,
		bindings,
		shapeIds: shapes.map((shape) => shape.id).filter((id): id is TLShapeId => Boolean(id)),
		bindingIds: bindings.map((binding) => binding.id).filter((id): id is ReturnType<typeof createBindingId> => Boolean(id)),
	}
}

function createInstanceId(pack: WorkbenchDomain, templateId: string): string {
	const stamp = Date.now().toString(36)
	const nonce = Math.random().toString(36).slice(2, 8)
	return `wb-${safeIdSegment(pack)}-${safeIdSegment(templateId)}-${stamp}-${nonce}`
}

export function insertWorkbenchTemplate(
	editor: Editor,
	pack: WorkbenchDomain,
	templateId: string,
	options: InsertWorkbenchTemplateOptions = {}
): WorkbenchTemplateReceipt {
	const instanceId = options.instanceId ?? createInstanceId(pack, templateId)
	const pageId = options.pageId ?? editor.getCurrentPageId()
	if (!editor.getPage(pageId)) {
		throw new Error(`Workbench insertion page ${pageId} does not exist`)
	}
	const plan = buildWorkbenchTemplateRenderPlan({
		pack,
		templateId,
		instanceId,
		center: options.point ?? editor.getViewportPageBounds().center,
		parentId: pageId,
		today: options.today,
	})

	editor.markHistoryStoppingPoint(`Create ${plan.title}`)
	editor.run(() => {
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

		editor.setSelectedShapes(plan.shapeIds)
	})

	return {
		instanceId: plan.instanceId,
		pack: plan.pack,
		templateId: plan.templateId,
		shapeIds: plan.shapeIds,
		bindingIds: plan.bindingIds,
	}
}
