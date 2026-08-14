import {
	BaseBoxShapeUtil,
	HTMLContainer,
	Rectangle2d,
	stopEventPropagation,
	T,
	TLResizeInfo,
	TLShape,
	useEditor,
} from 'tldraw'
import type { CSSProperties } from 'react'
import {
	getLeadExperiment,
	LEAD_EXPERIMENT_CATALOG_VERSION,
	type LeadAcquisitionExperiment,
} from './experimentCatalog'
import {
	EXPERIMENT_CARD_COLLAPSED_HEIGHT,
	EXPERIMENT_CARD_EXPANDED_HEIGHT,
	EXPERIMENT_CARD_MIN_WIDTH,
} from './experimentCardConstants'

// Adapted from thesysdev/canvas-with-c1's MIT-licensed custom shape pattern:
// a width-resizable tldraw HTMLContainer whose content controls its height.
export const EXPERIMENT_CARD_SHAPE_TYPE = 'c1-experiment-card' as const

declare module '@tldraw/tlschema' {
	export interface TLGlobalShapePropsMap {
		[EXPERIMENT_CARD_SHAPE_TYPE]: {
			w: number
			h: number
			experimentId: string
			collapsed: boolean
		}
	}
}

export type ExperimentCardShape = TLShape<typeof EXPERIMENT_CARD_SHAPE_TYPE>

export class ExperimentCardShapeUtil extends BaseBoxShapeUtil<ExperimentCardShape> {
	static override type = EXPERIMENT_CARD_SHAPE_TYPE
	static override props = {
		w: T.number,
		h: T.number,
		experimentId: T.string,
		collapsed: T.boolean,
	}

	override getDefaultProps(): ExperimentCardShape['props'] {
		return {
			w: EXPERIMENT_CARD_MIN_WIDTH,
			h: EXPERIMENT_CARD_EXPANDED_HEIGHT,
			experimentId: 'intent-search-sweep',
			collapsed: false,
		}
	}

	override getGeometry(shape: ExperimentCardShape) {
		return new Rectangle2d({
			width: shape.props.w,
			height: shape.props.h,
			isFilled: true,
		})
	}

	override onResize(shape: ExperimentCardShape, info: TLResizeInfo<ExperimentCardShape>) {
		return {
			props: {
				...shape.props,
				w: Math.max(EXPERIMENT_CARD_MIN_WIDTH, Math.abs(shape.props.w * info.scaleX)),
				h: shape.props.collapsed
					? EXPERIMENT_CARD_COLLAPSED_HEIGHT
					: EXPERIMENT_CARD_EXPANDED_HEIGHT,
			},
		}
	}

	override component(shape: ExperimentCardShape) {
		return <ExperimentCard shape={shape} />
	}

	override getIndicatorPath(shape: ExperimentCardShape) {
		const path = new Path2D()
		path.roundRect(0, 0, shape.props.w, shape.props.h, 2)
		return path
	}

	override getText(shape: ExperimentCardShape) {
		const experiment = getLeadExperiment(shape.props.experimentId)
		return experiment
			? [experiment.title, experiment.subtitle, experiment.hypothesis, experiment.method].join(' ')
			: shape.props.experimentId
	}
}

function ExperimentCard({ shape }: { shape: ExperimentCardShape }) {
	const editor = useEditor()
	const experiment = getLeadExperiment(shape.props.experimentId)

	if (!experiment) {
		return (
			<HTMLContainer className="experiment-card-shell is-missing">
				<strong>UNKNOWN EXPERIMENT</strong>
				<code>{shape.props.experimentId}</code>
			</HTMLContainer>
		)
	}

	const toggleCollapsed = () => {
		const latest = editor.getShape(shape.id)
		if (!latest || latest.type !== EXPERIMENT_CARD_SHAPE_TYPE) return
		const collapsed = !latest.props.collapsed
		editor.updateShape({
			id: latest.id,
			type: EXPERIMENT_CARD_SHAPE_TYPE,
			props: {
				...latest.props,
				collapsed,
				h: collapsed
					? EXPERIMENT_CARD_COLLAPSED_HEIGHT
					: EXPERIMENT_CARD_EXPANDED_HEIGHT,
			},
		})
	}

	return (
		<HTMLContainer
			className={`experiment-card-shell phase-${experiment.phase.toLowerCase()} ${
				shape.props.collapsed ? 'is-collapsed' : 'is-expanded'
			}`}
			style={
				{
					width: shape.props.w,
					height: shape.props.h,
					'--experiment-accent': phaseColor(experiment.phase),
				} as CSSProperties
			}
		>
			<header className="experiment-card-header">
				<div className="experiment-card-heading">
					<span className="experiment-card-dot" />
					<div>
						<span>{String(experiment.sequence).padStart(2, '0')} · {experiment.phase}</span>
						<strong>{experiment.title}</strong>
					</div>
				</div>
				<button
					type="button"
					className="experiment-card-collapse"
					aria-label="Toggle experiment card"
					aria-expanded={!shape.props.collapsed}
					onPointerDown={stopEventPropagation}
					onClick={(event) => {
						stopEventPropagation(event)
						toggleCollapsed()
					}}
				>
					<span>{shape.props.collapsed ? 'EXPAND' : 'COLLAPSE'}</span>
					<svg viewBox="0 0 16 16" aria-hidden="true">
						<path d={shape.props.collapsed ? 'M4 6l4 4 4-4' : 'M4 10l4-4 4 4'} />
					</svg>
				</button>
			</header>

			{!shape.props.collapsed && (
				<div
					className="experiment-card-content"
					onPointerDown={stopEventPropagation}
					onClick={stopEventPropagation}
					onWheel={stopEventPropagation}
				>
					<p className="experiment-card-subtitle">{experiment.subtitle}</p>
					<ExperimentSchematic experiment={experiment} shapeId={shape.id} />
					<section className="experiment-card-section">
						<span>HYPOTHESIS</span>
						<p>{experiment.hypothesis}</p>
					</section>
					<section className="experiment-card-section">
						<span>METHOD</span>
						<p>{experiment.method}</p>
					</section>
					<div className="experiment-card-outcomes">
						<section>
							<span>SUCCESS SIGNAL</span>
							<p>{experiment.successMetric}</p>
						</section>
						<section>
							<span>GUARDRAIL</span>
							<p>{experiment.guardrail}</p>
						</section>
					</div>
					<footer className="experiment-card-footer">
						<span>{LEAD_EXPERIMENT_CATALOG_VERSION}</span>
						<span>C1 CANVAS PATTERN · INLINE SCHEMATIC</span>
					</footer>
				</div>
			)}
		</HTMLContainer>
	)
}

function ExperimentSchematic({
	experiment,
	shapeId,
}: {
	experiment: LeadAcquisitionExperiment
	shapeId: string
}) {
	const nodes = new Map(experiment.schematic.nodes.map((node) => [node.id, node]))
	const markerId = `experiment-arrow-${shapeId.replace(/[^a-zA-Z0-9_-]/g, '-')}`

	return (
		<svg
			className="experiment-card-schematic"
			viewBox="0 0 420 160"
			role="img"
			aria-label={`${experiment.title} schematic`}
		>
			<defs>
				<marker id={markerId} markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
					<path d="M0,0 L6,3 L0,6 Z" className="experiment-card-arrow-head" />
				</marker>
			</defs>
			<rect className="experiment-card-schematic-bg" x="0.5" y="0.5" width="419" height="159" rx="2" />
			{experiment.schematic.edges.map((edge) => {
				const from = nodes.get(edge.from)
				const to = nodes.get(edge.to)
				if (!from || !to) return null
				return (
					<path
						key={`${edge.from}-${edge.to}`}
						className="experiment-card-edge"
						d={`M ${from.x + 39} ${from.y} C ${from.x + 56} ${from.y}, ${to.x - 56} ${to.y}, ${to.x - 39} ${to.y}`}
						markerEnd={`url(#${markerId})`}
					/>
				)
			})}
			{experiment.schematic.nodes.map((node) => (
				<g key={node.id} className={`experiment-card-node tone-${node.tone}`}>
					<rect x={node.x - 39} y={node.y - 16} width="78" height="32" rx="2" />
					<circle cx={node.x - 28} cy={node.y} r="3" />
					<text x={node.x + 4} y={node.y + 3} textAnchor="middle">{node.label}</text>
				</g>
			))}
		</svg>
	)
}

function phaseColor(phase: LeadAcquisitionExperiment['phase']) {
	switch (phase) {
		case 'DISCOVER': return '#22d3ee'
		case 'QUALIFY': return '#a78bfa'
		case 'ACQUIRE': return '#fbbf24'
		case 'ENGAGE': return '#60a5fa'
		case 'HANDOFF': return '#34d399'
		case 'CLOSE': return '#fb7185'
	}
}
