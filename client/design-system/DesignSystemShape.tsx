import { useEffect, useState } from 'react'
import {
	BaseBoxShapeUtil,
	createShapeId,
	Editor,
	HTMLContainer,
	Rectangle2d,
	resizeBox,
	T,
	TLResizeInfo,
	TLShape,
} from 'tldraw'
import type {
	DesignSystemDocumentSummary,
	DesignSystemProjection,
	DesignSystemSnapshot,
	DesignSystemStatus,
} from '../../shared/types/DesignSystem'
import {
	DESIGN_SYSTEM_DOCUMENT_REF_PATTERN,
	DESIGN_SYSTEM_REVISION_PATTERN,
	getDesignSystemSnapshot,
} from './designSystemBridge'

export const DESIGN_SYSTEM_SHAPE_TYPE = 'design-system' as const
const DESIGN_SYSTEM_DEFAULT_WIDTH = 560
const DESIGN_SYSTEM_DEFAULT_HEIGHT = 440
const DESIGN_SYSTEM_MIN_WIDTH = 360
const DESIGN_SYSTEM_MIN_HEIGHT = 300
const DESIGN_SYSTEM_VIEWPORT_MARGIN = 24
const MAX_TITLE_CHARS = 160
const MAX_DRIFT_SUMMARY_CHARS = 240
const VALID_STATUSES = new Set<DesignSystemStatus>([
	'current',
	'drifted',
	'missing',
	'unavailable',
])

declare module '@tldraw/tlschema' {
	export interface TLGlobalShapePropsMap {
		[DESIGN_SYSTEM_SHAPE_TYPE]: {
			w: number
			h: number
		}
	}
}

export type DesignSystemShape = TLShape<typeof DESIGN_SYSTEM_SHAPE_TYPE>

export interface DesignSystemShapeMeta {
	schema: 'canvapocalypse-design-system/v1'
	documentRef: string
	revision: string
	title: string
	status: DesignSystemStatus
	driftSummary?: string
	truncated: boolean
}

export class DesignSystemShapeUtil extends BaseBoxShapeUtil<DesignSystemShape> {
	static override type = DESIGN_SYSTEM_SHAPE_TYPE
	static override props = {
		w: T.number,
		h: T.number,
	}

	override getDefaultProps(): DesignSystemShape['props'] {
		return {
			w: DESIGN_SYSTEM_DEFAULT_WIDTH,
			h: DESIGN_SYSTEM_DEFAULT_HEIGHT,
		}
	}

	override onResize(
		shape: DesignSystemShape,
		info: TLResizeInfo<DesignSystemShape>
	) {
		return resizeBox(shape, info, {
			minWidth: DESIGN_SYSTEM_MIN_WIDTH,
			minHeight: DESIGN_SYSTEM_MIN_HEIGHT,
		})
	}

	override getGeometry(shape: DesignSystemShape) {
		return new Rectangle2d({
			width: shape.props.w,
			height: shape.props.h,
			isFilled: true,
		})
	}

	override component(shape: DesignSystemShape) {
		return <DesignSystemCard shape={shape} />
	}

	override getIndicatorPath(shape: DesignSystemShape) {
		const path = new Path2D()
		path.roundRect(0, 0, shape.props.w, shape.props.h, 16)
		return path
	}

	override getText(shape: DesignSystemShape) {
		const meta = readDesignSystemMeta(shape)
		return meta
			? `${meta.title} DESIGN.md ${meta.status} ${meta.documentRef}`
			: 'Invalid Design System node'
	}
}

export function createDesignSystemMeta(
	document: DesignSystemDocumentSummary | DesignSystemSnapshot
): DesignSystemShapeMeta {
	return {
		schema: 'canvapocalypse-design-system/v1',
		documentRef: document.documentRef,
		revision: document.revision,
		title: document.title.slice(0, MAX_TITLE_CHARS),
		status: document.status,
		...(document.driftSummary
			? {
					driftSummary: document.driftSummary.slice(
						0,
						MAX_DRIFT_SUMMARY_CHARS
					),
				}
			: {}),
		truncated: document.truncated,
	}
}

export function readDesignSystemMeta(
	shape: Pick<DesignSystemShape, 'meta'>
): DesignSystemShapeMeta | null {
	const value = shape.meta.designSystem
	if (
		!isRecord(value) ||
		value.schema !== 'canvapocalypse-design-system/v1' ||
		typeof value.documentRef !== 'string' ||
		!DESIGN_SYSTEM_DOCUMENT_REF_PATTERN.test(value.documentRef) ||
		typeof value.revision !== 'string' ||
		!DESIGN_SYSTEM_REVISION_PATTERN.test(value.revision) ||
		typeof value.title !== 'string' ||
		value.title.length === 0 ||
		value.title.length > MAX_TITLE_CHARS ||
		typeof value.status !== 'string' ||
		!VALID_STATUSES.has(value.status as DesignSystemStatus) ||
		typeof value.truncated !== 'boolean' ||
		(value.driftSummary !== undefined &&
			(typeof value.driftSummary !== 'string' ||
				value.driftSummary.length > MAX_DRIFT_SUMMARY_CHARS))
	) {
		return null
	}
	return value as unknown as DesignSystemShapeMeta
}

export function isDesignSystemShape(
	shape: TLShape | null | undefined
): shape is DesignSystemShape {
	return Boolean(
		shape &&
			shape.type === DESIGN_SYSTEM_SHAPE_TYPE &&
			readDesignSystemMeta(shape)
	)
}

export function createDesignSystemShape(
	editor: Editor,
	document: DesignSystemDocumentSummary | DesignSystemSnapshot
) {
	const bounds = editor.getViewportPageBounds()
	const width = Math.max(
		DESIGN_SYSTEM_MIN_WIDTH,
		Math.min(
			DESIGN_SYSTEM_DEFAULT_WIDTH,
			bounds.w - DESIGN_SYSTEM_VIEWPORT_MARGIN * 2
		)
	)
	const height = Math.max(
		DESIGN_SYSTEM_MIN_HEIGHT,
		Math.min(
			DESIGN_SYSTEM_DEFAULT_HEIGHT,
			bounds.h - DESIGN_SYSTEM_VIEWPORT_MARGIN * 2
		)
	)
	const id = createShapeId(
		`design-system-${document.documentRef}-${Date.now()}`
	)
	editor.markHistoryStoppingPoint('Insert Design System')
	editor.createShape<DesignSystemShape>({
		id,
		type: DESIGN_SYSTEM_SHAPE_TYPE,
		x: bounds.x + (bounds.w - width) / 2,
		y: bounds.y + (bounds.h - height) / 2,
		props: { w: width, h: height },
		meta: { designSystem: createDesignSystemMeta(document) as any },
	})
	editor.select(id)
	return id
}

export function replaceDesignSystemDocument(
	editor: Editor,
	shape: DesignSystemShape,
	document: DesignSystemDocumentSummary | DesignSystemSnapshot
) {
	editor.markHistoryStoppingPoint('Change Design System document')
	editor.updateShape<DesignSystemShape>({
		id: shape.id,
		type: DESIGN_SYSTEM_SHAPE_TYPE,
		meta: {
			...shape.meta,
			designSystem: createDesignSystemMeta(document) as any,
		},
	})
	editor.select(shape.id)
}

export function updateDesignSystemSnapshot(
	editor: Editor,
	shape: DesignSystemShape,
	snapshot: DesignSystemSnapshot
) {
	const current = readDesignSystemMeta(shape)
	if (!current || current.documentRef !== snapshot.documentRef) {
		throw new Error('Snapshot does not belong to the selected Design System')
	}
	editor.markHistoryStoppingPoint('Refresh Design System revision')
	editor.updateShape<DesignSystemShape>({
		id: shape.id,
		type: DESIGN_SYSTEM_SHAPE_TYPE,
		meta: {
			...shape.meta,
			designSystem: createDesignSystemMeta({
				...snapshot,
				status: 'current',
				driftSummary: undefined,
			}) as any,
		},
	})
}

export function updateDesignSystemDrift(
	editor: Editor,
	shape: DesignSystemShape,
	status: DesignSystemStatus,
	driftSummary?: string
) {
	const current = readDesignSystemMeta(shape)
	if (!current) throw new Error('Invalid Design System node')
	const next: DesignSystemShapeMeta = {
		...current,
		status,
		...(driftSummary
			? { driftSummary: driftSummary.slice(0, MAX_DRIFT_SUMMARY_CHARS) }
			: {}),
	}
	if (!driftSummary) delete next.driftSummary
	editor.updateShape<DesignSystemShape>({
		id: shape.id,
		type: DESIGN_SYSTEM_SHAPE_TYPE,
		meta: { ...shape.meta, designSystem: next as any },
	})
}

function DesignSystemCard({ shape }: { shape: DesignSystemShape }) {
	const meta = readDesignSystemMeta(shape)
	const [projection, setProjection] = useState<DesignSystemProjection | null>(
		null
	)
	const [error, setError] = useState<string>()

	useEffect(() => {
		setProjection(null)
		setError(undefined)
		if (!meta) return
		const controller = new AbortController()
		void getDesignSystemSnapshot(
			meta.documentRef,
			meta.revision,
			controller.signal
		).then(
			(snapshot) => setProjection(snapshot.projection),
			(reason) => {
				if (controller.signal.aborted) return
				setError(
					reason instanceof Error
						? reason.message
						: 'Projection unavailable'
				)
			}
		)
		return () => controller.abort()
	}, [meta?.documentRef, meta?.revision])

	if (!meta) {
		return (
			<HTMLContainer
				className="design-system-shape is-invalid"
				style={{ width: shape.props.w, height: shape.props.h }}
			>
				<strong>Invalid Design System reference</strong>
			</HTMLContainer>
		)
	}

	return (
		<HTMLContainer
			className={`design-system-shape is-${meta.status}`}
			style={{ width: shape.props.w, height: shape.props.h }}
		>
			<header className="design-system-shape-header">
				<div>
					<span className="design-system-shape-kicker">DESIGN.md</span>
					<strong>{meta.title}</strong>
				</div>
				<div className="design-system-shape-badges">
					<span>{meta.status.toUpperCase()}</span>
					<span>{meta.revision.slice(7, 15)}</span>
				</div>
			</header>

			{projection ? (
				<div className="design-system-shape-body">
					<section className="design-system-theme">
						<span>THEME &amp; ATMOSPHERE</span>
						<strong>
							{projection.theme ??
								projection.atmosphere[0] ??
								'Not specified'}
						</strong>
						{projection.atmosphere.length > 1 && (
							<small>{projection.atmosphere.slice(1, 4).join(' · ')}</small>
						)}
					</section>
					<section className="design-system-palette">
						<span>PALETTE</span>
						<div>
							{projection.palette.slice(0, 8).map((color) => (
								<i
									key={`${color.role}-${color.hex}`}
									style={{ backgroundColor: color.hex }}
									title={`${color.role}: ${color.hex}`}
								/>
							))}
							{projection.palette.length === 0 && <small>Not specified</small>}
						</div>
					</section>
					<div className="design-system-summary-grid">
						<ProjectionList
							label="TYPE"
							items={projection.typography
								.slice(0, 3)
								.map((item) =>
									[item.role, item.family, item.weight]
										.filter(Boolean)
										.join(' · ')
								)}
						/>
						<ProjectionList
							label="COMPONENTS"
							items={projection.components
								.slice(0, 3)
								.map((item) => item.name)}
						/>
						<ProjectionList
							label="LAYOUT"
							items={projection.layoutPrinciples.slice(0, 3)}
						/>
					</div>
				</div>
			) : (
				<div className="design-system-shape-loading" role="status">
					{error ? 'Projection unavailable — check drift' : 'Loading bounded projection…'}
				</div>
			)}

			<footer className="design-system-shape-footer">
				<span>{projection?.projectId ?? meta.documentRef}</span>
				<strong>{meta.driftSummary ?? 'Source bytes remain host-side'}</strong>
				{(meta.truncated || projection?.truncated) && <small>BOUNDED</small>}
			</footer>
		</HTMLContainer>
	)
}

function ProjectionList({ label, items }: { label: string; items: string[] }) {
	return (
		<section>
			<span>{label}</span>
			{items.length ? (
				<ul>
					{items.map((item, index) => (
						<li key={`${item}-${index}`}>{item}</li>
					))}
				</ul>
			) : (
				<small>Not specified</small>
			)}
		</section>
	)
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value)
}
