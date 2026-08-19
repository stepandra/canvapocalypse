import {
	BaseBoxShapeUtil,
	HTMLContainer,
	Rectangle2d,
	T,
	type TLResizeInfo,
	type TLShape,
} from 'tldraw'

export const ARCHITECTURE_DIAGRAM_SURFACE_SHAPE_TYPE =
	'architecture-diagram-surface' as const
export const ARCHITECTURE_BOUNDARY_SHAPE_TYPE = 'architecture-boundary' as const
export const ARCHITECTURE_SERVICE_SHAPE_TYPE = 'architecture-service' as const
export const ARCHITECTURE_RELATION_LABEL_SHAPE_TYPE =
	'architecture-relation-label' as const

export const ARCHITECTURE_SERVICE_CATEGORIES = [
	'frontend',
	'backend',
	'database',
	'cloud',
	'security',
	'message',
	'external',
	'evidence',
] as const

export type ArchitectureServiceCategory =
	(typeof ARCHITECTURE_SERVICE_CATEGORIES)[number]
export type ArchitectureBoundaryKind = 'region' | 'security-group'

declare module '@tldraw/tlschema' {
	export interface TLGlobalShapePropsMap {
		[ARCHITECTURE_DIAGRAM_SURFACE_SHAPE_TYPE]: {
			w: number
			h: number
			title: string
			subtitle: string
		}
		[ARCHITECTURE_BOUNDARY_SHAPE_TYPE]: {
			w: number
			h: number
			kind: ArchitectureBoundaryKind
			label: string
		}
		[ARCHITECTURE_SERVICE_SHAPE_TYPE]: {
			w: number
			h: number
			category: ArchitectureServiceCategory
			role: string
			title: string
			subtitle: string
			details: string[]
		}
		[ARCHITECTURE_RELATION_LABEL_SHAPE_TYPE]: {
			w: number
			h: number
			text: string
		}
	}
}

export type ArchitectureDiagramSurfaceShape = TLShape<
	typeof ARCHITECTURE_DIAGRAM_SURFACE_SHAPE_TYPE
>
export type ArchitectureBoundaryShape = TLShape<
	typeof ARCHITECTURE_BOUNDARY_SHAPE_TYPE
>
export type ArchitectureServiceShape = TLShape<
	typeof ARCHITECTURE_SERVICE_SHAPE_TYPE
>
export type ArchitectureRelationLabelShape = TLShape<
	typeof ARCHITECTURE_RELATION_LABEL_SHAPE_TYPE
>

export const ARCHITECTURE_SERVICE_PALETTE: Readonly<
	Record<
		ArchitectureServiceCategory,
		{ fill: string; stroke: string; label: string }
	>
> = {
	frontend: { fill: 'rgba(8, 51, 68, 0.46)', stroke: '#22d3ee', label: 'FRONTEND' },
	backend: { fill: 'rgba(6, 78, 59, 0.46)', stroke: '#34d399', label: 'BACKEND' },
	database: { fill: 'rgba(76, 29, 149, 0.46)', stroke: '#a78bfa', label: 'DATA' },
	cloud: { fill: 'rgba(120, 53, 15, 0.38)', stroke: '#fbbf24', label: 'CLOUD' },
	security: { fill: 'rgba(136, 19, 55, 0.46)', stroke: '#fb7185', label: 'SECURITY' },
	message: { fill: 'rgba(124, 45, 18, 0.44)', stroke: '#fb923c', label: 'MESSAGE' },
	external: { fill: 'rgba(30, 41, 59, 0.7)', stroke: '#94a3b8', label: 'EXTERNAL' },
	evidence: { fill: 'rgba(20, 83, 45, 0.46)', stroke: '#86efac', label: 'EVIDENCE' },
}

const MONO_FONT =
	"'JetBrains Mono', 'SFMono-Regular', Consolas, 'Liberation Mono', monospace"

function resizeBox<Shape extends ArchitectureDiagramSurfaceShape | ArchitectureBoundaryShape | ArchitectureServiceShape>(
	shape: Shape,
	info: TLResizeInfo<Shape>,
	minimum: { w: number; h: number }
) {
	return {
		props: {
			...shape.props,
			w: Math.max(minimum.w, Math.abs(shape.props.w * info.scaleX)),
			h: Math.max(minimum.h, Math.abs(shape.props.h * info.scaleY)),
		},
	}
}

function roundedIndicator(w: number, h: number, radius: number) {
	const path = new Path2D()
	path.roundRect(0, 0, w, h, radius)
	return path
}

function safeSvgId(id: string) {
	return id.replace(/[^A-Za-z0-9_-]/g, '-')
}

function ArchitectureDiagramSurfaceSvg({
	shape,
}: {
	shape: ArchitectureDiagramSurfaceShape
}) {
	const { w, h, title, subtitle } = shape.props
	const gridId = `${safeSvgId(shape.id)}-architecture-grid`
	const clipId = `${safeSvgId(shape.id)}-architecture-clip`
	const legend = [
		ARCHITECTURE_SERVICE_PALETTE.frontend,
		ARCHITECTURE_SERVICE_PALETTE.backend,
		ARCHITECTURE_SERVICE_PALETTE.database,
		ARCHITECTURE_SERVICE_PALETTE.security,
		ARCHITECTURE_SERVICE_PALETTE.external,
	]

	return (
		<svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
			<defs>
				<pattern id={gridId} width="40" height="40" patternUnits="userSpaceOnUse">
					<path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1e293b" strokeWidth="0.7" />
				</pattern>
				<clipPath id={clipId}>
					<rect x="1" y="1" width={Math.max(0, w - 2)} height={Math.max(0, h - 2)} rx="16" />
				</clipPath>
			</defs>
			<rect x="1" y="1" width={Math.max(0, w - 2)} height={Math.max(0, h - 2)} rx="16" fill="#020617" stroke="#1e293b" strokeWidth="2" />
			<rect x="1" y="1" width={Math.max(0, w - 2)} height={Math.max(0, h - 2)} fill={`url(#${gridId})`} clipPath={`url(#${clipId})`} />
			<circle cx="34" cy="34" r="6" fill="#22d3ee" />
			<text x="56" y="40" fill="#f8fafc" fontFamily={MONO_FONT} fontSize="22" fontWeight="700">
				{title}
			</text>
			<text x="34" y="68" fill="#94a3b8" fontFamily={MONO_FONT} fontSize="12">
				{subtitle}
			</text>
			<line x1="32" y1="86" x2={Math.max(32, w - 32)} y2="86" stroke="#1e293b" strokeWidth="1" />
			<g transform={`translate(34 ${Math.max(102, h - 48)})`}>
				{legend.map((item, index) => (
					<g key={item.label} transform={`translate(${index * 150} 0)`}>
						<rect width="22" height="12" rx="3" fill="#0f172a" stroke={item.stroke} strokeWidth="1.5" />
						<text x="30" y="10" fill="#94a3b8" fontFamily={MONO_FONT} fontSize="9">
							{item.label}
						</text>
					</g>
				))}
			</g>
		</svg>
	)
}

export class ArchitectureDiagramSurfaceShapeUtil extends BaseBoxShapeUtil<ArchitectureDiagramSurfaceShape> {
	static override type = ARCHITECTURE_DIAGRAM_SURFACE_SHAPE_TYPE
	static override props = {
		w: T.number,
		h: T.number,
		title: T.string,
		subtitle: T.string,
	}

	override getDefaultProps(): ArchitectureDiagramSurfaceShape['props'] {
		return { w: 1200, h: 760, title: 'Architecture', subtitle: 'System view' }
	}

	override getGeometry(shape: ArchitectureDiagramSurfaceShape) {
		return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true })
	}

	override onResize(shape: ArchitectureDiagramSurfaceShape, info: TLResizeInfo<ArchitectureDiagramSurfaceShape>) {
		return resizeBox(shape, info, { w: 640, h: 420 })
	}

	override component(shape: ArchitectureDiagramSurfaceShape) {
		return (
			<HTMLContainer style={{ width: shape.props.w, height: shape.props.h }}>
				<ArchitectureDiagramSurfaceSvg shape={shape} />
			</HTMLContainer>
		)
	}

	override toSvg(shape: ArchitectureDiagramSurfaceShape) {
		return <ArchitectureDiagramSurfaceSvg shape={shape} />
	}

	override getIndicatorPath(shape: ArchitectureDiagramSurfaceShape) {
		return roundedIndicator(shape.props.w, shape.props.h, 16)
	}

	override getText(shape: ArchitectureDiagramSurfaceShape) {
		return `${shape.props.title}\n${shape.props.subtitle}`
	}
}

function ArchitectureBoundarySvg({ shape }: { shape: ArchitectureBoundaryShape }) {
	const { w, h, kind, label } = shape.props
	const security = kind === 'security-group'
	const stroke = security ? '#fb7185' : '#fbbf24'
	const fill = security ? 'rgba(136, 19, 55, 0.06)' : 'rgba(251, 191, 36, 0.05)'

	return (
		<svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
			<rect
				x="1"
				y="1"
				width={Math.max(0, w - 2)}
				height={Math.max(0, h - 2)}
				rx={security ? 8 : 12}
				fill={fill}
				stroke={stroke}
				strokeWidth="1.5"
				strokeDasharray={security ? '5 5' : '8 4'}
			/>
			<rect x="14" y="10" width={Math.min(Math.max(96, label.length * 7.2 + 18), Math.max(96, w - 28))} height="24" rx="4" fill="#0f172a" />
			<text x="23" y="27" fill={stroke} fontFamily={MONO_FONT} fontSize="10" fontWeight="600">
				{label.toUpperCase()}
			</text>
		</svg>
	)
}

export class ArchitectureBoundaryShapeUtil extends BaseBoxShapeUtil<ArchitectureBoundaryShape> {
	static override type = ARCHITECTURE_BOUNDARY_SHAPE_TYPE
	static override props = {
		w: T.number,
		h: T.number,
		kind: T.literalEnum('region', 'security-group'),
		label: T.string,
	}

	override getDefaultProps(): ArchitectureBoundaryShape['props'] {
		return { w: 640, h: 420, kind: 'region', label: 'SYSTEM BOUNDARY' }
	}

	override getGeometry(shape: ArchitectureBoundaryShape) {
		return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true })
	}

	override onResize(shape: ArchitectureBoundaryShape, info: TLResizeInfo<ArchitectureBoundaryShape>) {
		return resizeBox(shape, info, { w: 180, h: 120 })
	}

	override component(shape: ArchitectureBoundaryShape) {
		return (
			<HTMLContainer style={{ width: shape.props.w, height: shape.props.h }}>
				<ArchitectureBoundarySvg shape={shape} />
			</HTMLContainer>
		)
	}

	override toSvg(shape: ArchitectureBoundaryShape) {
		return <ArchitectureBoundarySvg shape={shape} />
	}

	override getIndicatorPath(shape: ArchitectureBoundaryShape) {
		return roundedIndicator(shape.props.w, shape.props.h, shape.props.kind === 'security-group' ? 8 : 12)
	}

	override getText(shape: ArchitectureBoundaryShape) {
		return shape.props.label
	}
}

function wrappedTitleLines(title: string, width: number) {
	const words = title.trim().split(/\s+/).filter(Boolean)
	const maxCharacters = Math.max(12, Math.floor((width - 28) / 8.2))
	const lines: string[] = []
	for (const word of words) {
		const current = lines.at(-1)
		if (!current || `${current} ${word}`.length > maxCharacters) lines.push(word)
		else lines[lines.length - 1] = `${current} ${word}`
	}
	if (lines.length > 2) {
		lines[1] = `${lines.slice(1).join(' ').slice(0, maxCharacters - 1).trim()}…`
		return lines.slice(0, 2)
	}
	return lines.length ? lines : ['Untitled service']
}

function ArchitectureServiceSvg({ shape }: { shape: ArchitectureServiceShape }) {
	const { w, h, category, role, title, subtitle, details } = shape.props
	const palette = ARCHITECTURE_SERVICE_PALETTE[category]
	const titleLines = wrappedTitleLines(title, w)
	const titleStart = titleLines.length === 1 ? h / 2 - (subtitle || details.length ? 6 : -4) : h / 2 - 16
	const detailLines = [subtitle, ...details].filter(Boolean).slice(0, 2)

	return (
		<svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
			<rect x="1" y="1" width={Math.max(0, w - 2)} height={Math.max(0, h - 2)} rx="7" fill="#0f172a" />
			<rect x="1" y="1" width={Math.max(0, w - 2)} height={Math.max(0, h - 2)} rx="7" fill={palette.fill} stroke={palette.stroke} strokeWidth="1.5" />
			<text x="12" y="18" fill={palette.stroke} fontFamily={MONO_FONT} fontSize="8" fontWeight="600" letterSpacing="0.8">
				{role.toUpperCase()}
			</text>
			<text x={w / 2} y={titleStart} fill="#f8fafc" fontFamily={MONO_FONT} fontSize="12" fontWeight="600" textAnchor="middle">
				{titleLines.map((line, index) => (
					<tspan key={`${line}-${index}`} x={w / 2} dy={index === 0 ? 0 : 16}>
						{line}
					</tspan>
				))}
			</text>
			{detailLines.map((line, index) => (
				<text key={`${line}-${index}`} x={w / 2} y={titleStart + titleLines.length * 16 + 8 + index * 13} fill="#94a3b8" fontFamily={MONO_FONT} fontSize="9" textAnchor="middle">
					{line.length > 42 ? `${line.slice(0, 41)}…` : line}
				</text>
			))}
		</svg>
	)
}

export class ArchitectureServiceShapeUtil extends BaseBoxShapeUtil<ArchitectureServiceShape> {
	static override type = ARCHITECTURE_SERVICE_SHAPE_TYPE
	static override props = {
		w: T.number,
		h: T.number,
		category: T.literalEnum(...ARCHITECTURE_SERVICE_CATEGORIES),
		role: T.string,
		title: T.string,
		subtitle: T.string,
		details: T.arrayOf(T.string),
	}

	override getDefaultProps(): ArchitectureServiceShape['props'] {
		return {
			w: 220,
			h: 110,
			category: 'backend',
			role: 'service',
			title: 'Application service',
			subtitle: 'Primary responsibility',
			details: [],
		}
	}

	override getGeometry(shape: ArchitectureServiceShape) {
		return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true })
	}

	override onResize(shape: ArchitectureServiceShape, info: TLResizeInfo<ArchitectureServiceShape>) {
		return resizeBox(shape, info, { w: 120, h: 72 })
	}

	override component(shape: ArchitectureServiceShape) {
		return (
			<HTMLContainer style={{ width: shape.props.w, height: shape.props.h }}>
				<ArchitectureServiceSvg shape={shape} />
			</HTMLContainer>
		)
	}

	override toSvg(shape: ArchitectureServiceShape) {
		return <ArchitectureServiceSvg shape={shape} />
	}

	override getIndicatorPath(shape: ArchitectureServiceShape) {
		return roundedIndicator(shape.props.w, shape.props.h, 7)
	}

	override getText(shape: ArchitectureServiceShape) {
		return [shape.props.title, shape.props.subtitle, ...shape.props.details].filter(Boolean).join('\n')
	}
}

function ArchitectureRelationLabelSvg({
	shape,
}: {
	shape: ArchitectureRelationLabelShape
}) {
	const { w, h, text } = shape.props
	return (
		<svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
			<rect
				x="0.5"
				y="0.5"
				width={Math.max(0, w - 1)}
				height={Math.max(0, h - 1)}
				rx="4"
				fill="rgba(15, 23, 42, 0.94)"
				stroke="#334155"
				strokeWidth="1"
			/>
			<text
				x={w / 2}
				y={h / 2 + 3.5}
				fill="#cbd5e1"
				fontFamily={MONO_FONT}
				fontSize="10"
				fontWeight="500"
				textAnchor="middle"
			>
				{text}
			</text>
		</svg>
	)
}

export class ArchitectureRelationLabelShapeUtil extends BaseBoxShapeUtil<ArchitectureRelationLabelShape> {
	static override type = ARCHITECTURE_RELATION_LABEL_SHAPE_TYPE
	static override props = {
		w: T.number,
		h: T.number,
		text: T.string,
	}

	override getDefaultProps(): ArchitectureRelationLabelShape['props'] {
		return { w: 64, h: 24, text: 'USES' }
	}

	override getGeometry(shape: ArchitectureRelationLabelShape) {
		return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true })
	}

	override onResize(shape: ArchitectureRelationLabelShape) {
		return { props: shape.props }
	}

	override component(shape: ArchitectureRelationLabelShape) {
		return (
			<HTMLContainer style={{ width: shape.props.w, height: shape.props.h }}>
				<ArchitectureRelationLabelSvg shape={shape} />
			</HTMLContainer>
		)
	}

	override toSvg(shape: ArchitectureRelationLabelShape) {
		return <ArchitectureRelationLabelSvg shape={shape} />
	}

	override getIndicatorPath(shape: ArchitectureRelationLabelShape) {
		return roundedIndicator(shape.props.w, shape.props.h, 4)
	}

	override getText(shape: ArchitectureRelationLabelShape) {
		return shape.props.text
	}
}

export const ARCHITECTURE_DIAGRAM_SHAPE_UTILS = [
	ArchitectureDiagramSurfaceShapeUtil,
	ArchitectureBoundaryShapeUtil,
	ArchitectureServiceShapeUtil,
	ArchitectureRelationLabelShapeUtil,
] as const
