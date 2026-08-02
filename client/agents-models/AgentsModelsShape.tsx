import {
	BaseBoxShapeUtil,
	HTMLContainer,
	Rectangle2d,
	T,
	TLShape,
	stopEventPropagation,
	useEditor,
	useValue,
} from 'tldraw'
import { WorkflowIcon } from '../workflow/WorkflowIcons'

export const AGENTS_MODELS_SHAPE_TYPE = 'agents-models-node' as const

export const AGENTS_MODELS_PRESETS = [
	'single',
	'fanout',
	'reduce',
	'loop',
	'dag',
	'dynamic',
	'mesh',
] as const

type AgentsModelsRole =
	| 'toolbar'
	| 'catalog'
	| 'stage'
	| 'subagent'

type CatalogItem = {
	id: string
	label: string
	value?: string
	status?: 'green' | 'orange' | 'red' | 'grey'
}

type CatalogSection = {
	id: 'models' | 'agents' | 'personas' | 'roles'
	label: string
	items: CatalogItem[]
	hidden?: number
}

type AgentsModelsMeta = {
	domain: 'agents-models'
	role: AgentsModelsRole
	kind?: string
	label?: string
	subtitle?: string
	stageType?: string
	modelSlot?: string
	persona?: string
	modelRef?: string
	roleLabel?: string
	statusColor?: 'green' | 'orange' | 'red' | 'grey'
	inCount?: number
	outCount?: number
	variable?: boolean
	presetId?: string
	unmodified?: boolean
	catalogSections?: CatalogSection[]
	proxyOk?: boolean
	actionRequest?: {
		id: string
		kind: 'preset' | 'apply' | 'play'
		presetId?: string
		requestedAt: number
	}
	actionState?: 'idle' | 'running' | 'succeeded' | 'failed'
	actionMessage?: string
}

declare module '@tldraw/tlschema' {
	export interface TLGlobalShapePropsMap {
		[AGENTS_MODELS_SHAPE_TYPE]: {
			w: number
			h: number
		}
	}
}

export type AgentsModelsShape = TLShape<typeof AGENTS_MODELS_SHAPE_TYPE>

export class AgentsModelsShapeUtil extends BaseBoxShapeUtil<AgentsModelsShape> {
	static override type = AGENTS_MODELS_SHAPE_TYPE
	static override props = {
		w: T.number,
		h: T.number,
	}

	override getDefaultProps(): AgentsModelsShape['props'] {
		return { w: 280, h: 180 }
	}

	override getGeometry(shape: AgentsModelsShape) {
		return new Rectangle2d({
			width: shape.props.w,
			height: shape.props.h,
			isFilled: true,
		})
	}

	override component(shape: AgentsModelsShape) {
		return <AgentsModelsCard shape={shape} />
	}

	override getIndicatorPath(shape: AgentsModelsShape) {
		const path = new Path2D()
		path.roundRect(0, 0, shape.props.w, shape.props.h, 2)
		return path
	}

	override getText(shape: AgentsModelsShape) {
		const meta = shape.meta.am as unknown as AgentsModelsMeta | undefined
		if (!meta) return ''
		return [
			meta.label,
			meta.subtitle,
			meta.stageType,
			meta.modelSlot,
			meta.persona,
			meta.modelRef,
			meta.roleLabel,
		]
			.filter(Boolean)
			.join(' ')
	}
}

function AgentsModelsCard({ shape }: { shape: AgentsModelsShape }) {
	const meta = shape.meta.am as unknown as AgentsModelsMeta
	if (meta.role === 'toolbar') return <AgentsModelsToolbar shape={shape} meta={meta} />
	if (meta.role === 'catalog') return <AgentsModelsCatalog shape={shape} meta={meta} />
	if (meta.role === 'stage') return <AgentsModelsStage shape={shape} meta={meta} />
	return <AgentsModelsSubagent shape={shape} meta={meta} />
}

function AgentsModelsToolbar({
	shape,
	meta,
}: {
	shape: AgentsModelsShape
	meta: AgentsModelsMeta
}) {
	const editor = useEditor()
	const request = (
		kind: 'preset' | 'apply' | 'play',
		presetId?: string
	) => {
		const latest = editor.getShape(shape.id)
		if (!latest || latest.type !== AGENTS_MODELS_SHAPE_TYPE) return
		const latestMeta = latest.meta.am as unknown as AgentsModelsMeta
		const requestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
		editor.updateShape({
			id: latest.id,
			type: AGENTS_MODELS_SHAPE_TYPE,
			meta: {
				...latest.meta,
				am: {
					...latestMeta,
					actionRequest: {
						id: requestId,
						kind,
						...(presetId ? { presetId } : {}),
						requestedAt: Date.now(),
					},
					actionState: 'running',
					actionMessage:
						kind === 'preset'
							? `Materializing ${presetId}`
							: kind === 'apply'
								? 'Compiling workflow'
								: 'Preparing launch receipt',
				},
			},
		})
	}

	return (
		<HTMLContainer
			className="agents-models-card agents-models-toolbar"
			style={{ width: shape.props.w, height: shape.props.h }}
		>
			<CardHeader
				icon="agent"
				title="Agents / Models"
				subtitle="Grok Build configurator"
				status={meta.actionState ?? 'idle'}
			/>
			<div
				className="agents-models-toolbar-body"
				onPointerDown={stopEventPropagation}
				onClick={stopEventPropagation}
				onWheel={stopEventPropagation}
			>
				<section>
					<span className="agents-models-kicker">WORKFLOW PRESET</span>
					<div className="agents-models-preset-grid">
						{AGENTS_MODELS_PRESETS.map((preset) => (
							<button
								key={preset}
								type="button"
								onClick={() => request('preset', preset)}
								disabled={meta.actionState === 'running'}
							>
								<span>{preset}</span>
								<small>{presetHint(preset)}</small>
							</button>
						))}
					</div>
				</section>
				<section className="agents-models-toolbar-actions">
					<button
						type="button"
						className="is-primary"
						onClick={() => request('apply')}
						disabled={meta.actionState === 'running'}
					>
						APPLY
					</button>
					<button
						type="button"
						onClick={() => request('play')}
						disabled={meta.actionState === 'running'}
					>
						PLAY
					</button>
				</section>
				<div className="agents-models-receipt" data-state={meta.actionState ?? 'idle'}>
					<span>LAST RECEIPT</span>
					<strong>{meta.actionMessage || 'Choose a preset to begin.'}</strong>
				</div>
			</div>
			<CardFooter left="7 PRESETS" right="REVISION-GUARDED SAVE" />
		</HTMLContainer>
	)
}

function AgentsModelsCatalog({
	shape,
	meta,
}: {
	shape: AgentsModelsShape
	meta: AgentsModelsMeta
}) {
	const sections = meta.catalogSections ?? []
	return (
		<HTMLContainer
			className="agents-models-card agents-models-catalog"
			style={{ width: shape.props.w, height: shape.props.h }}
		>
			<CardHeader
				icon="data"
				title="Live catalog"
				subtitle="Local proxy + Grok config"
				status={meta.proxyOk === true ? 'succeeded' : meta.proxyOk === false ? 'failed' : 'idle'}
			/>
			<div className="agents-models-catalog-body">
				{sections.length ? (
					sections.map((section) => (
						<section key={section.id}>
							<header>
								<span>{section.label}</span>
								<small>{section.items.length + (section.hidden ?? 0)}</small>
							</header>
							<div>
								{section.items.map((item) => (
									<div className="agents-models-catalog-row" key={item.id}>
										<span
											className={`agents-models-status-dot is-${item.status ?? 'grey'}`}
										/>
										<strong>{item.label}</strong>
										<small>{item.value}</small>
									</div>
								))}
								{Boolean(section.hidden) && (
									<div className="agents-models-catalog-more">
										+{section.hidden} more
									</div>
								)}
							</div>
						</section>
					))
				) : (
					<div className="agents-models-catalog-empty">Catalog bridge is syncing…</div>
				)}
			</div>
			<CardFooter
				left={meta.proxyOk === true ? 'PROXY ONLINE' : 'PROXY UNAVAILABLE'}
				right="COMPACT VIEW"
			/>
		</HTMLContainer>
	)
}

function AgentsModelsStage({
	shape,
	meta,
}: {
	shape: AgentsModelsShape
	meta: AgentsModelsMeta
}) {
	const editor = useEditor()
	const options = useCatalogOptions(editor)
	const update = (patch: Partial<AgentsModelsMeta>) => updateShapeMeta(editor, shape, patch)
	return (
		<HTMLContainer
			className="agents-models-card agents-models-stage"
			style={{ width: shape.props.w, height: shape.props.h }}
		>
			<PortMarkers inCount={meta.inCount} outCount={meta.outCount} />
			<CardHeader
				icon="action"
				title={meta.label || 'STAGE'}
				subtitle={meta.stageType || meta.subtitle || 'task'}
				status="idle"
			/>
			<div
				className="agents-models-node-fields"
				onPointerDown={stopEventPropagation}
				onClick={stopEventPropagation}
				onWheel={stopEventPropagation}
			>
				<label>
					<span>MODEL SLOT</span>
					<select
						value={meta.modelSlot || 'default'}
						onChange={(event) => update({ modelSlot: event.currentTarget.value })}
					>
						<option value="default">default</option>
						{options.models.map((item) => (
							<option key={item.id} value={item.id}>
								{item.label}
							</option>
						))}
					</select>
				</label>
				<label>
					<span>PERSONA</span>
					<select
						value={meta.persona || ''}
						onChange={(event) => update({ persona: event.currentTarget.value })}
					>
						<option value="">none</option>
						{options.personas.map((item) => (
							<option key={item.id} value={item.id}>
								{item.label}
							</option>
						))}
					</select>
				</label>
			</div>
			<CardFooter
				left={`${meta.inCount ?? 0} IN`}
				right={`${meta.outCount ?? 0} OUT`}
			/>
		</HTMLContainer>
	)
}

function AgentsModelsSubagent({
	shape,
	meta,
}: {
	shape: AgentsModelsShape
	meta: AgentsModelsMeta
}) {
	const editor = useEditor()
	const options = useCatalogOptions(editor)
	const update = (patch: Partial<AgentsModelsMeta>) => updateShapeMeta(editor, shape, patch)
	return (
		<HTMLContainer
			className={`agents-models-card agents-models-subagent${meta.variable ? ' is-variable' : ''}`}
			style={{ width: shape.props.w, height: shape.props.h }}
		>
			<PortMarkers inCount={meta.inCount} outCount={meta.outCount} />
			<CardHeader
				icon="agent"
				title={meta.label || 'worker'}
				subtitle={meta.roleLabel || 'WORKER'}
				status={statusState(meta.statusColor)}
			/>
			<div
				className="agents-models-node-fields"
				onPointerDown={stopEventPropagation}
				onClick={stopEventPropagation}
				onWheel={stopEventPropagation}
			>
				<label>
					<span>AGENT</span>
					<select
						value={meta.label || ''}
						onChange={(event) => update({ label: event.currentTarget.value })}
					>
						<option value={meta.label || 'worker'}>{meta.label || 'worker'}</option>
						{options.agents
							.filter((item) => item.id !== meta.label)
							.map((item) => (
								<option key={item.id} value={item.id}>
									{item.label}
								</option>
							))}
					</select>
				</label>
				<label>
					<span>MODEL</span>
					<select
						value={meta.modelRef || ''}
						onChange={(event) => update({ modelRef: event.currentTarget.value })}
					>
						<option value="">agent default</option>
						{options.models.map((item) => (
							<option key={item.id} value={item.id}>
								{item.label}
							</option>
						))}
					</select>
				</label>
			</div>
			<CardFooter
				left={`${meta.inCount ?? 0} IN`}
				right={`${meta.outCount ?? 0} OUT`}
			/>
		</HTMLContainer>
	)
}

function CardHeader({
	icon,
	title,
	subtitle,
	status,
}: {
	icon: 'agent' | 'action' | 'data'
	title: string
	subtitle: string
	status: 'idle' | 'running' | 'succeeded' | 'failed'
}) {
	return (
		<header className="agents-models-card-header">
			<span className="agents-models-card-icon">
				<WorkflowIcon name={icon} />
			</span>
			<div>
				<strong>{title}</strong>
				<span>{subtitle}</span>
			</div>
			<span className={`agents-models-status-dot is-${statusColor(status)}`} />
		</header>
	)
}

function CardFooter({ left, right }: { left: string; right: string }) {
	return (
		<footer className="agents-models-card-footer">
			<span>{left}</span>
			<span>{right}</span>
		</footer>
	)
}

function PortMarkers({
	inCount = 0,
	outCount = 0,
}: {
	inCount?: number
	outCount?: number
}) {
	return (
		<>
			{inCount > 0 && <span className="agents-models-port is-input" title={`${inCount} inputs`} />}
			{outCount > 0 && (
				<span className="agents-models-port is-output" title={`${outCount} outputs`} />
			)}
		</>
	)
}

function useCatalogOptions(editor: ReturnType<typeof useEditor>) {
	return useValue(
		'agents models live catalog options',
		() => {
				const catalog = editor
					.getCurrentPageShapes()
					.find(
						(candidate) =>
							(candidate.meta?.am as unknown as AgentsModelsMeta | undefined)
								?.role === 'catalog'
					)
			const meta = catalog?.meta?.am as unknown as AgentsModelsMeta | undefined
			const sections = meta?.catalogSections ?? []
			return {
				models: sections.find((section) => section.id === 'models')?.items ?? [],
				agents: sections.find((section) => section.id === 'agents')?.items ?? [],
				personas: sections.find((section) => section.id === 'personas')?.items ?? [],
			}
		},
		[editor]
	)
}

function updateShapeMeta(
	editor: ReturnType<typeof useEditor>,
	shape: AgentsModelsShape,
	patch: Partial<AgentsModelsMeta>
) {
	const latest = editor.getShape(shape.id)
	if (!latest || latest.type !== AGENTS_MODELS_SHAPE_TYPE) return
	const latestMeta = latest.meta.am as unknown as AgentsModelsMeta
	editor.updateShape({
		id: latest.id,
		type: AGENTS_MODELS_SHAPE_TYPE,
		meta: {
			...latest.meta,
			am: {
				...latestMeta,
				...patch,
				unmodified: false,
			},
		},
	})
}

function presetHint(preset: string) {
	if (preset === 'single') return 'one worker'
	if (preset === 'fanout') return 'parallel workers'
	if (preset === 'reduce') return 'fan-in'
	if (preset === 'loop') return 'retry cycle'
	if (preset === 'dag') return 'ordered graph'
	if (preset === 'dynamic') return 'planner loop'
	return 'peer mesh'
}

function statusState(color?: AgentsModelsMeta['statusColor']) {
	if (color === 'green') return 'succeeded' as const
	if (color === 'red') return 'failed' as const
	return 'idle' as const
}

function statusColor(status: 'idle' | 'running' | 'succeeded' | 'failed') {
	if (status === 'running') return 'orange'
	if (status === 'succeeded') return 'green'
	if (status === 'failed') return 'red'
	return 'grey'
}
