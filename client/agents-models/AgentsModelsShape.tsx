import {
	BaseBoxShapeUtil,
	HTMLContainer,
	Rectangle2d,
	T,
	TLShape,
	createShapeId,
	resizeBox,
	stopEventPropagation,
	useEditor,
	useValue,
} from 'tldraw'
import { useMemo, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { Editor, TLResizeInfo } from 'tldraw'
import { WorkflowIcon, type WorkflowIconName } from '../workflow/WorkflowIcons'

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

export type AgentsModelsRole =
	| 'toolbar'
	| 'catalog'
	| 'stage'
	| 'agent'
	| 'persona'
	| 'subagent'
	| 'capability'
	| 'skill'
	| 'gate'
	| 'input'
	| 'artifact'
	| 'result'
	| 'module'

export type AgentsModelsNodeKind = Exclude<
	AgentsModelsRole,
	'toolbar' | 'catalog' | 'subagent'
>

type CatalogItem = {
	id: string
	label: string
	value?: string
	status?: 'green' | 'orange' | 'red' | 'grey'
}

type CatalogSection = {
	id: 'models' | 'agents' | 'personas' | 'roles' | 'skills' | 'modules'
	label: string
	items: CatalogItem[]
	hidden?: number
}

type MaterializableCatalogSection = CatalogSection & {
	id: 'agents' | 'personas' | 'skills' | 'modules'
}

export type AgentsModelsMeta = {
	domain: 'agents-models'
	role: AgentsModelsRole
	kind?: string
	label?: string
	subtitle?: string
	stageType?: string
	modelSlot?: string
	persona?: string
	agentRef?: string
	modelRef?: string
	capabilityMode?: 'all' | 'read-only' | 'read-write' | 'execute'
	toolRefsText?: string
	skillRef?: string
	gateOperator?: 'not-empty' | 'contains' | 'equals'
	gateValue?: string
	gateOnFalse?: 'stop' | 'skip'
	retryCount?: number
	timeoutSeconds?: number
	errorRoute?: string
	dataValue?: string
	artifactRef?: string
	resultLabel?: string
	moduleRef?: string
	moduleVersion?: string
	moduleParams?: string
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
		kind: 'preset' | 'node' | 'preflight' | 'apply' | 'play' | 'config-sync'
		presetId?: string
		nodeKind?: AgentsModelsNodeKind
		connectFromId?: string
		catalogItemId?: string
		catalogItemLabel?: string
		catalogItemValue?: string
		dropPoint?: { x: number; y: number }
		source?: 'toolbox' | 'inspector' | 'catalog'
		requestedAt: number
	}
	actionState?: 'idle' | 'running' | 'succeeded' | 'failed'
	actionMessage?: string
	hiddenControl?: boolean
	uiVersion?: string
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

export function isAgentsModelsWorkflowNode(
	shape: TLShape | undefined | null
): shape is AgentsModelsShape {
	if (!shape || shape.type !== AGENTS_MODELS_SHAPE_TYPE) return false
	const role = (shape.meta?.am as unknown as AgentsModelsMeta | undefined)?.role
	return Boolean(
		role &&
			[
				'stage',
				'agent',
				'persona',
				'subagent',
				'capability',
				'skill',
				'gate',
				'input',
				'artifact',
				'result',
				'module',
			].includes(role)
	)
}

export class AgentsModelsShapeUtil extends BaseBoxShapeUtil<AgentsModelsShape> {
	static override type = AGENTS_MODELS_SHAPE_TYPE
	static override props = {
		w: T.number,
		h: T.number,
	}

	override getDefaultProps(): AgentsModelsShape['props'] {
		return { w: 280, h: 190 }
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

	override onResize(
		shape: AgentsModelsShape,
		info: TLResizeInfo<AgentsModelsShape>
	) {
		const role = (shape.meta?.am as unknown as AgentsModelsMeta | undefined)?.role
		const proposedWidth = Math.abs(shape.props.w * info.scaleX)
		const minHeight =
			role === 'catalog'
				? 340
				: role === 'stage'
					? 166
					: role &&
						  ['capability', 'skill', 'gate', 'input', 'artifact', 'result', 'module'].includes(
								role
						  )
						? 214
					: proposedWidth < 260
						? 226
						: 184
		return resizeBox(shape, info, {
			minWidth: role === 'catalog' ? 300 : 210,
			minHeight,
		})
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
			meta.capabilityMode,
			meta.toolRefsText,
			meta.skillRef,
			meta.gateOperator,
			meta.gateValue,
			meta.dataValue,
			meta.artifactRef,
			meta.resultLabel,
			meta.moduleRef,
			meta.moduleVersion,
			meta.moduleParams,
			meta.roleLabel,
		]
			.filter(Boolean)
			.join(' ')
	}
}

function AgentsModelsCard({ shape }: { shape: AgentsModelsShape }) {
	const meta = shape.meta.am as unknown as AgentsModelsMeta
	if (meta.hiddenControl) return <HTMLContainer style={{ display: 'none' }} />
	if (meta.role === 'toolbar') return <AgentsModelsToolbar shape={shape} meta={meta} />
	if (meta.role === 'catalog') return <AgentsModelsCatalog shape={shape} meta={meta} />
	if (meta.role === 'stage') return <AgentsModelsStage shape={shape} meta={meta} />
	if (meta.role === 'persona') return <AgentsModelsPersona shape={shape} meta={meta} />
	if (
		['capability', 'skill', 'gate', 'input', 'artifact', 'result', 'module'].includes(
			meta.role
		)
	) {
		return <AgentsModelsExtendedNode shape={shape} meta={meta} />
	}
	return <AgentsModelsAgent shape={shape} meta={meta} />
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
		kind: 'preset' | 'node' | 'preflight' | 'apply' | 'play',
		value?: string
	) => {
		requestAgentsModelsAction(editor, {
			kind,
			...(kind === 'preset' && value ? { presetId: value } : {}),
			...(kind === 'node' && value
				? { nodeKind: value as AgentsModelsNodeKind }
				: {}),
			source: 'toolbox',
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
				<section>
					<span className="agents-models-kicker">NODE PALETTE</span>
					<div className="agents-models-node-palette">
						{(
							[
								'stage',
								'agent',
								'persona',
								'capability',
								'skill',
								'gate',
								'input',
								'artifact',
								'result',
								'module',
							] as const
						).map((kind) => (
							<button
								key={kind}
								type="button"
								onClick={() => request('node', kind)}
								disabled={meta.actionState === 'running'}
							>
								<WorkflowIcon
									name={extendedNodePresentation(kind).icon}
								/>
								<span>{kind}</span>
							</button>
						))}
					</div>
				</section>
				<section className="agents-models-toolbar-actions">
					<button
						type="button"
						onClick={() => request('preflight')}
						disabled={meta.actionState === 'running'}
					>
						PREFLIGHT
					</button>
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
	const editor = useEditor()
	const sections = meta.catalogSections ?? []
	const catalogCount = sections.reduce(
		(total, section) => total + section.items.length,
		0
	)
	const [query, setQuery] = useState('')
	const [draggingId, setDraggingId] = useState<string | null>(null)
	const visibleSections = useMemo(() => {
		const normalized = query.trim().toLocaleLowerCase()
		return sections
			.filter(
				(section): section is MaterializableCatalogSection =>
					section.id === 'agents' ||
					section.id === 'personas' ||
					section.id === 'skills' ||
					section.id === 'modules'
			)
			.map((section) => ({
				...section,
				items: normalized
					? section.items.filter((item) =>
							`${item.label} ${item.value ?? ''}`
								.toLocaleLowerCase()
								.includes(normalized)
						)
					: section.items,
			}))
	}, [query, sections])

	const beginDrag = (
		event: ReactPointerEvent<HTMLButtonElement>,
		sectionId: 'agents' | 'personas' | 'skills' | 'modules',
		item: CatalogItem
	) => {
		if (event.button !== 0) return
		event.preventDefault()
		event.stopPropagation()
		const start = { x: event.clientX, y: event.clientY }
		const view = event.currentTarget.ownerDocument.defaultView
		if (!view) return
		let didDrag = false
		const onMove = (moveEvent: PointerEvent) => {
			const distance = Math.hypot(
				moveEvent.clientX - start.x,
				moveEvent.clientY - start.y
			)
			if (distance < 6) return
			didDrag = true
			setDraggingId(item.id)
		}
		const onUp = (upEvent: PointerEvent) => {
			view.removeEventListener('pointermove', onMove)
			view.removeEventListener('pointerup', onUp)
			view.removeEventListener('pointercancel', onCancel)
			setDraggingId(null)
			if (!didDrag) return
			const pagePoint = editor.screenToPage({
				x: upEvent.clientX,
				y: upEvent.clientY,
			})
			const catalogBounds = editor.getShapePageBounds(shape.id)
			const droppedInside =
				catalogBounds &&
				pagePoint.x >= catalogBounds.minX &&
				pagePoint.x <= catalogBounds.maxX &&
				pagePoint.y >= catalogBounds.minY &&
				pagePoint.y <= catalogBounds.maxY
			if (droppedInside) return
			requestAgentsModelsAction(editor, {
				kind: 'node',
				nodeKind:
					sectionId === 'agents'
						? 'agent'
						: sectionId === 'personas'
							? 'persona'
							: sectionId === 'skills'
								? 'skill'
								: 'module',
				catalogItemId: item.id,
				catalogItemLabel: item.label,
				catalogItemValue: item.value,
				dropPoint: { x: pagePoint.x, y: pagePoint.y },
				source: 'catalog',
			})
		}
		const onCancel = () => {
			view.removeEventListener('pointermove', onMove)
			view.removeEventListener('pointerup', onUp)
			view.removeEventListener('pointercancel', onCancel)
			setDraggingId(null)
		}
		view.addEventListener('pointermove', onMove)
		view.addEventListener('pointerup', onUp)
		view.addEventListener('pointercancel', onCancel)
	}

	return (
		<HTMLContainer
			className="workflow-node-card agents-models-catalog-node"
			style={{ width: shape.props.w, height: shape.props.h }}
		>
			<WorkflowCardHeader
				icon="data"
				title="Agents & personas"
				subtitle="DRAG FROM CATALOG"
				status={
					catalogCount > 0
						? 'READY'
						: meta.proxyOk === false
							? 'STALE'
							: 'SYNCING'
				}
			/>
			<div
				className="agents-models-catalog-search"
				onPointerDown={stopEventPropagation}
				onClick={stopEventPropagation}
			>
				<input
					value={query}
					onChange={(event) => setQuery(event.currentTarget.value)}
					placeholder="Filter agents and personas…"
					aria-label="Filter agents and personas"
				/>
			</div>
			<div
				className="agents-models-catalog-body"
				onPointerDown={stopEventPropagation}
				onClick={stopEventPropagation}
				onWheel={stopEventPropagation}
			>
				{visibleSections.some((section) => section.items.length) ? (
					visibleSections.map((section) => (
						<section key={section.id}>
							<header>
								<span>{section.label}</span>
								<small>{section.items.length}</small>
							</header>
							<div>
								{section.items.map((item) => (
									<button
										type="button"
										className={`agents-models-catalog-row${
											draggingId === item.id ? ' is-dragging' : ''
										}`}
										key={item.id}
										onPointerDown={(event) =>
											beginDrag(event, section.id, item)
										}
										title={`Drag ${item.label} onto the canvas`}
									>
										<span
											className={`agents-models-status-dot is-${item.status ?? 'grey'}`}
										/>
										<strong>{item.label}</strong>
										<small>{item.value}</small>
										<span className="agents-models-catalog-drag-handle">⋮⋮</span>
									</button>
								))}
							</div>
						</section>
					))
				) : (
					<div className="agents-models-catalog-empty">
						{query ? 'No matching entries.' : 'Catalog bridge is syncing…'}
					</div>
				)}
			</div>
			<WorkflowCardFooter
				inCount={0}
				outCount={visibleSections.reduce(
					(total, section) => total + section.items.length,
					0
				)}
				right="drag to create"
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
	const update = (patch: Partial<AgentsModelsMeta>) =>
		updateAgentsModelsShapeMeta(editor, shape, patch)
	return (
		<HTMLContainer
			className={`workflow-node-card agents-models-workflow-node agents-models-stage${
				shape.props.w < 260 ? ' is-compact-width' : ''
			}${shape.props.h <= 190 ? ' is-compact-height' : ''}`}
			style={{ width: shape.props.w, height: shape.props.h }}
		>
			<PortMarkers inCount={meta.inCount} outCount={meta.outCount} />
			<WorkflowCardHeader
				icon="action"
				title={meta.label || 'STAGE'}
				subtitle={meta.stageType || meta.subtitle || 'task'}
			/>
			<p className="workflow-node-card-description">
				Controls execution order and the bounded context passed forward.
			</p>
			<div
				className="workflow-node-card-body agents-models-workflow-fields"
				onPointerDown={stopEventPropagation}
				onClick={stopEventPropagation}
				onWheel={stopEventPropagation}
			>
				<label className="workflow-node-field">
					<span>CONTROL</span>
					<select
						value={meta.stageType || 'single'}
						onChange={(event) => update({ stageType: event.currentTarget.value })}
					>
						<option value="single">single</option>
						<option value="foreach">foreach</option>
						<option value="reduce">reduce</option>
						<option value="loop">loop</option>
						<option value="dag">dag</option>
						<option value="dynamic">dynamic</option>
						<option value="mesh">mesh</option>
					</select>
				</label>
			</div>
			<WorkflowCardFooter
				inCount={meta.inCount}
				outCount={meta.outCount}
				right="stage"
			/>
		</HTMLContainer>
	)
}

function AgentsModelsAgent({
	shape,
	meta,
}: {
	shape: AgentsModelsShape
	meta: AgentsModelsMeta
}) {
	const editor = useEditor()
	const options = useCatalogOptions(editor)
	const update = (patch: Partial<AgentsModelsMeta>) =>
		updateAgentsModelsShapeMeta(editor, shape, patch)
	return (
		<HTMLContainer
			className={`workflow-node-card agents-models-workflow-node agents-models-subagent${
				meta.variable ? ' is-variable' : ''
			}${shape.props.w < 260 ? ' is-compact-width' : ''}${
				shape.props.h <= 190 ? ' is-compact-height' : ''
			}`}
			style={{ width: shape.props.w, height: shape.props.h }}
		>
			<PortMarkers inCount={meta.inCount} outCount={meta.outCount} />
			<WorkflowCardHeader
				icon="agent"
				title={meta.label || 'worker'}
				subtitle={meta.roleLabel || 'WORKER'}
			/>
			<p className="workflow-node-card-description">
				Runs one bounded task using the selected Grok agent and model.
			</p>
			<div
				className="workflow-node-card-body agents-models-workflow-fields is-responsive-fields"
				onPointerDown={stopEventPropagation}
				onClick={stopEventPropagation}
				onWheel={stopEventPropagation}
			>
				<label className="workflow-node-field">
					<span>AGENT</span>
					<select
						value={meta.agentRef || ''}
						onChange={(event) =>
							update({
								agentRef: event.currentTarget.value,
								label: event.currentTarget.value || meta.label || 'agent',
							})
						}
					>
						<option value="">default agent</option>
						{options.agents
							.map((item) => (
								<option key={item.id} value={item.id}>
									{item.label}
								</option>
							))}
					</select>
				</label>
				<label className="workflow-node-field">
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
			<WorkflowCardFooter
				inCount={meta.inCount}
				outCount={meta.outCount}
				right={meta.variable ? 'parallel slot' : 'agent'}
			/>
		</HTMLContainer>
	)
}

function AgentsModelsPersona({
	shape,
	meta,
}: {
	shape: AgentsModelsShape
	meta: AgentsModelsMeta
}) {
	const editor = useEditor()
	const options = useCatalogOptions(editor)
	const update = (patch: Partial<AgentsModelsMeta>) =>
		updateAgentsModelsShapeMeta(editor, shape, patch)
	return (
		<HTMLContainer
			className={`workflow-node-card agents-models-workflow-node agents-models-persona${
				shape.props.w < 260 ? ' is-compact-width' : ''
			}${shape.props.h <= 190 ? ' is-compact-height' : ''}`}
			style={{ width: shape.props.w, height: shape.props.h }}
		>
			<PortMarkers inCount={meta.inCount} outCount={meta.outCount} />
			<WorkflowCardHeader
				icon="prompt-template"
				title={meta.persona || meta.label || 'persona'}
				subtitle="BEHAVIOR OVERLAY"
			/>
			<p className="workflow-node-card-description">
				Adds reusable behavioral instructions without changing graph control.
			</p>
			<div
				className="workflow-node-card-body agents-models-workflow-fields is-responsive-fields"
				onPointerDown={stopEventPropagation}
				onClick={stopEventPropagation}
				onWheel={stopEventPropagation}
			>
				<label className="workflow-node-field">
					<span>PERSONA</span>
					<select
						value={meta.persona || ''}
						onChange={(event) =>
							update({
								persona: event.currentTarget.value,
								label: event.currentTarget.value || 'persona',
							})
						}
					>
						<option value="">select persona</option>
						{options.personas.map((item) => (
							<option key={item.id} value={item.id}>
								{item.label}
							</option>
						))}
					</select>
				</label>
				<label className="workflow-node-field">
					<span>MODEL OVERRIDE</span>
					<select
						value={meta.modelRef || ''}
						onChange={(event) => update({ modelRef: event.currentTarget.value })}
					>
						<option value="">persona default</option>
						{options.models.map((item) => (
							<option key={item.id} value={item.id}>
								{item.label}
							</option>
						))}
					</select>
				</label>
			</div>
			<WorkflowCardFooter
				inCount={meta.inCount}
				outCount={meta.outCount}
				right="persona"
			/>
		</HTMLContainer>
	)
}

function AgentsModelsExtendedNode({
	shape,
	meta,
}: {
	shape: AgentsModelsShape
	meta: AgentsModelsMeta
}) {
	const editor = useEditor()
	const options = useCatalogOptions(editor)
	const role = meta.role as Extract<
		AgentsModelsRole,
		'capability' | 'skill' | 'gate' | 'input' | 'artifact' | 'result' | 'module'
	>
	const presentation = extendedNodePresentation(role)
	const update = (patch: Partial<AgentsModelsMeta>) =>
		updateAgentsModelsShapeMeta(editor, shape, patch)

	return (
		<HTMLContainer
			className={`workflow-node-card agents-models-workflow-node agents-models-${role}${
				shape.props.w < 260 ? ' is-compact-width' : ''
			}`}
			style={{ width: shape.props.w, height: shape.props.h }}
		>
			<PortMarkers inCount={meta.inCount} outCount={meta.outCount} />
			<WorkflowCardHeader
				icon={presentation.icon}
				title={meta.label || presentation.label}
				subtitle={presentation.subtitle}
			/>
			<p className="workflow-node-card-description">{presentation.description}</p>
			<div
				className="workflow-node-card-body agents-models-workflow-fields is-responsive-fields"
				onPointerDown={stopEventPropagation}
				onClick={stopEventPropagation}
				onWheel={stopEventPropagation}
			>
				{role === 'capability' && (
					<>
						<label className="workflow-node-field">
							<span>MODE</span>
							<select
								value={meta.capabilityMode || 'all'}
								onChange={(event) =>
									update({
										capabilityMode: event.currentTarget
											.value as AgentsModelsMeta['capabilityMode'],
									})
								}
							>
								<option value="all">all · default</option>
								<option value="read-only">read-only</option>
								<option value="read-write">read-write</option>
								<option value="execute">execute</option>
							</select>
						</label>
						<label className="workflow-node-field">
							<span>TOOL IDS · OPTIONAL</span>
							<input
								value={meta.toolRefsText || ''}
								placeholder="comma-separated adapter refs"
								onChange={(event) =>
									update({ toolRefsText: event.currentTarget.value })
								}
							/>
						</label>
					</>
				)}
				{role === 'skill' && (
					<label className="workflow-node-field is-grow">
						<span>PROJECT SKILL</span>
						<select
							value={meta.skillRef || ''}
							onChange={(event) =>
								update({
									skillRef: event.currentTarget.value,
									label:
										options.skills.find(
											(item) => item.id === event.currentTarget.value
										)?.label || 'Skill',
								})
							}
						>
							<option value="">select .agents/skills entry</option>
							{options.skills.map((item) => (
								<option key={item.id} value={item.id}>
									{item.label}
								</option>
							))}
						</select>
					</label>
				)}
				{role === 'gate' && (
					<>
						<label className="workflow-node-field">
							<span>CONDITION</span>
							<select
								value={meta.gateOperator || 'not-empty'}
								onChange={(event) =>
									update({
										gateOperator: event.currentTarget
											.value as AgentsModelsMeta['gateOperator'],
									})
								}
							>
								<option value="not-empty">not empty</option>
								<option value="contains">contains</option>
								<option value="equals">equals</option>
							</select>
						</label>
						<label className="workflow-node-field">
							<span>VALUE</span>
							<input
								value={meta.gateValue || ''}
								disabled={(meta.gateOperator || 'not-empty') === 'not-empty'}
								onChange={(event) => update({ gateValue: event.currentTarget.value })}
							/>
						</label>
						<label className="workflow-node-field">
							<span>ON FALSE</span>
							<select
								value={meta.gateOnFalse || 'stop'}
								onChange={(event) =>
									update({
										gateOnFalse: event.currentTarget
											.value as AgentsModelsMeta['gateOnFalse'],
									})
								}
							>
								<option value="stop">stop</option>
								<option value="skip">skip</option>
							</select>
						</label>
					</>
				)}
				{role === 'input' && (
					<label className="workflow-node-field is-grow">
						<span>BOUNDED INPUT</span>
						<textarea
							value={meta.dataValue || ''}
							maxLength={4000}
							onChange={(event) => update({ dataValue: event.currentTarget.value })}
						/>
					</label>
				)}
				{role === 'artifact' && (
					<label className="workflow-node-field is-grow">
						<span>ARTIFACT REFERENCE</span>
						<input
							value={meta.artifactRef || ''}
							placeholder="artifact://… or project-relative id"
							onChange={(event) => update({ artifactRef: event.currentTarget.value })}
						/>
					</label>
				)}
				{role === 'result' && (
					<label className="workflow-node-field is-grow">
						<span>RESULT LABEL</span>
						<input
							value={meta.resultLabel || ''}
							placeholder="workflow-result"
							onChange={(event) => update({ resultLabel: event.currentTarget.value })}
						/>
					</label>
				)}
				{role === 'module' && (
					<>
						<label className="workflow-node-field">
							<span>MODULE</span>
							<select
								value={meta.moduleRef || ''}
								onChange={(event) => {
									const selected = options.modules.find(
										(item) => item.id === event.currentTarget.value
									)
									update({
										moduleRef: event.currentTarget.value,
										moduleVersion: selected?.value || '',
										label: selected?.label || 'Module',
									})
								}}
							>
								<option value="">select project module</option>
								{options.modules.map((item) => (
									<option key={item.id} value={item.id}>
										{item.label} {item.value ? `· ${item.value}` : ''}
									</option>
								))}
							</select>
						</label>
						<label className="workflow-node-field">
							<span>VERSION</span>
							<input
								value={meta.moduleVersion || ''}
								onChange={(event) =>
									update({ moduleVersion: event.currentTarget.value })
								}
							/>
						</label>
						<label className="workflow-node-field is-grow">
							<span>PARAMS · JSON</span>
							<textarea
								value={meta.moduleParams || '{}'}
								maxLength={4000}
								onChange={(event) =>
									update({ moduleParams: event.currentTarget.value })
								}
							/>
						</label>
					</>
				)}
			</div>
			<WorkflowCardFooter
				inCount={meta.inCount}
				outCount={meta.outCount}
				right={role}
			/>
		</HTMLContainer>
	)
}

function extendedNodePresentation(role: AgentsModelsNodeKind): {
	icon: WorkflowIconName
	label: string
	subtitle: string
	description: string
} {
	if (role === 'stage') {
		return {
			icon: 'action',
			label: 'Stage',
			subtitle: 'CONTROL FLOW',
			description: 'Controls execution order and bounded context.',
		}
	}
	if (role === 'agent') {
		return {
			icon: 'agent',
			label: 'Agent',
			subtitle: 'WORKER',
			description: 'Runs one bounded task.',
		}
	}
	if (role === 'persona') {
		return {
			icon: 'prompt-template',
			label: 'Persona',
			subtitle: 'BEHAVIOR OVERLAY',
			description: 'Adds reusable behavioral instructions.',
		}
	}
	if (role === 'capability') {
		return {
			icon: 'context',
			label: 'Capabilities',
			subtitle: 'PERMISSION POLICY',
			description: 'Sets the attached Agent capability mode; defaults to all.',
		}
	}
	if (role === 'skill') {
		return {
			icon: 'rich-output',
			label: 'Skill',
			subtitle: 'PROJECT INSTRUCTION',
			description: 'References one compact project-local skill.',
		}
	}
	if (role === 'gate') {
		return {
			icon: 'decision',
			label: 'Gate',
			subtitle: 'CONDITION',
			description: 'Validates one Stage transition before continuing.',
		}
	}
	if (role === 'input') {
		return {
			icon: 'input',
			label: 'Input',
			subtitle: 'DATA BOUNDARY',
			description: 'Supplies bounded literal input to one Stage.',
		}
	}
	if (role === 'artifact') {
		return {
			icon: 'data',
			label: 'Artifact',
			subtitle: 'REFERENCE',
			description: 'Passes a compact artifact reference, never its contents.',
		}
	}
	if (role === 'result') {
		return {
			icon: 'output',
			label: 'Result',
			subtitle: 'OUTPUT BOUNDARY',
			description: 'Selects one Stage as the workflow result.',
		}
	}
	return {
		icon: 'map',
		label: 'Module',
		subtitle: 'VERSIONED SUBGRAPH',
		description: 'Expands a versioned project-local subgraph definition.',
	}
}

function WorkflowCardHeader({
	icon,
	title,
	subtitle,
	status = 'READY',
}: {
	icon: WorkflowIconName
	title: string
	subtitle: string
	status?: string
}) {
	return (
		<header className="workflow-node-card-header">
			<span className="workflow-node-card-icon">
				<WorkflowIcon name={icon} />
			</span>
			<div>
				<strong>{title}</strong>
				<span>{subtitle}</span>
			</div>
			<span className="workflow-node-card-status">{status}</span>
		</header>
	)
}

function WorkflowCardFooter({
	inCount = 0,
	outCount = 0,
	right,
}: {
	inCount?: number
	outCount?: number
	right: string
}) {
	return (
		<footer className="workflow-node-card-footer">
			<span>{inCount} IN</span>
			<span>{outCount} OUT</span>
			<span>{right}</span>
		</footer>
	)
}

function CardHeader({
	icon,
	title,
	subtitle,
	status,
}: {
	icon: WorkflowIconName
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
			{inCount > 0 && <span className="workflow-node-port is-input" title={`${inCount} inputs`} />}
			{outCount > 0 && (
				<span className="workflow-node-port is-output" title={`${outCount} outputs`} />
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
				skills: sections.find((section) => section.id === 'skills')?.items ?? [],
				modules: sections.find((section) => section.id === 'modules')?.items ?? [],
			}
		},
		[editor]
	)
}

export function updateAgentsModelsShapeMeta(
	editor: Editor,
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

export function requestAgentsModelsAction(
	editor: Editor,
	action: Omit<NonNullable<AgentsModelsMeta['actionRequest']>, 'id' | 'requestedAt'>
) {
	const toolbar = editor.getShape(createShapeId('am-toolbar'))
	if (!toolbar || toolbar.type !== AGENTS_MODELS_SHAPE_TYPE) return false
	const latestMeta = toolbar.meta.am as unknown as AgentsModelsMeta
	const actionMessage =
		action.kind === 'preset'
			? `Materializing ${action.presetId}`
			: action.kind === 'node'
				? action.source === 'catalog'
					? `Creating ${action.catalogItemLabel || action.nodeKind}`
					: `Adding ${action.nodeKind}`
				: action.kind === 'apply'
					? 'Compiling workflow'
					: action.kind === 'preflight'
						? 'Validating workflow graph'
					: action.kind === 'config-sync'
						? 'Syncing config.toml'
						: 'Preparing launch receipt'
	editor.updateShape({
		id: toolbar.id,
		type: AGENTS_MODELS_SHAPE_TYPE,
		meta: {
			...toolbar.meta,
			am: {
				...latestMeta,
				actionRequest: {
					id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
					...action,
					requestedAt: Date.now(),
				},
				actionState: 'running',
				actionMessage,
			},
		},
	})
	return true
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
