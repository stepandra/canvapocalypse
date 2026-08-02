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
import { extractTemplateVariables, type WorkflowPort } from '../../shared/workflow'
import { AgentAppAgentsManager } from '../agent/managers/AgentAppAgentsManager'
import type { WorkflowNodeMeta } from './workflowCanvas'
import { WorkflowIcon, WorkflowIconName } from './WorkflowIcons'

export const WORKFLOW_NODE_SHAPE_TYPE = 'workflow-node' as const

declare module '@tldraw/tlschema' {
	export interface TLGlobalShapePropsMap {
		[WORKFLOW_NODE_SHAPE_TYPE]: {
			w: number
			h: number
		}
	}
}

export type WorkflowCardShape = TLShape<typeof WORKFLOW_NODE_SHAPE_TYPE>

export class WorkflowNodeShapeUtil extends BaseBoxShapeUtil<WorkflowCardShape> {
	static override type = WORKFLOW_NODE_SHAPE_TYPE
	static override props = {
		w: T.number,
		h: T.number,
	}

	override getDefaultProps(): WorkflowCardShape['props'] {
		return { w: 300, h: 220 }
	}

	override getGeometry(shape: WorkflowCardShape) {
		return new Rectangle2d({
			width: shape.props.w,
			height: shape.props.h,
			isFilled: true,
		})
	}

	override component(shape: WorkflowCardShape) {
		return <WorkflowNodeCard shape={shape} />
	}

	override getIndicatorPath(shape: WorkflowCardShape) {
		const path = new Path2D()
		path.roundRect(0, 0, shape.props.w, shape.props.h, 10)
		return path
	}

	override getText(shape: WorkflowCardShape) {
		const meta = shape.meta.workflow as unknown as WorkflowNodeMeta | undefined
		return [meta?.title, meta?.description, meta?.config.value, meta?.config.instructions]
			.filter(Boolean)
			.join(' ')
	}
}

function WorkflowNodeCard({ shape }: { shape: WorkflowCardShape }) {
	const editor = useEditor()
	const meta = shape.meta.workflow as unknown as WorkflowNodeMeta
	const title = meta.title || fallbackTitle(meta.kind)
	const description = meta.description || fallbackDescription(meta.kind)
	const icon = iconForMeta(meta)
	const accent = accentForKind(meta.kind)

	const updateConfig = (patch: Record<string, string>) => {
		if (meta.readonly) return
		const latest = editor.getShape(shape.id)
		if (!latest || latest.type !== WORKFLOW_NODE_SHAPE_TYPE) return
		const latestMeta = latest.meta.workflow as unknown as WorkflowNodeMeta
		const next: WorkflowNodeMeta = {
			...latestMeta,
			status: 'idle',
			config: { ...latestMeta.config, ...patch },
		}
		delete next.error
		editor.updateShape({
			id: latest.id,
			type: WORKFLOW_NODE_SHAPE_TYPE,
			meta: { ...latest.meta, workflow: next as any },
		})
	}

	return (
		<HTMLContainer
			className={`workflow-node-card workflow-node-${meta.kind} is-${meta.status}`}
			style={
				{
					width: shape.props.w,
					height: shape.props.h,
					'--workflow-node-accent': accent,
				} as React.CSSProperties
			}
		>
			<PortMarkers ports={meta.ports} />
			<header className="workflow-node-card-header">
				<span className="workflow-node-card-icon">
					<WorkflowIcon name={icon} />
				</span>
				<div>
					<strong>{title}</strong>
					<span>{humanizeKind(meta.kind)}</span>
				</div>
				<span className={`workflow-node-card-status is-${meta.status}`}>
					{meta.readonly && meta.status === 'idle' ? 'READ ONLY' : meta.status.toUpperCase()}
				</span>
			</header>
			<p className="workflow-node-card-description">{description}</p>
			<div
				className="workflow-node-card-body"
				onPointerDown={stopEventPropagation}
				onClick={stopEventPropagation}
				onWheel={stopEventPropagation}
			>
				<NodeControls meta={meta} updateConfig={updateConfig} />
			</div>
			<footer className="workflow-node-card-footer">
				<span>{meta.ports.filter((port) => port.direction === 'input').length} IN</span>
				<span>{meta.ports.filter((port) => port.direction === 'output').length} OUT</span>
				<span>{meta.nodeId}</span>
			</footer>
		</HTMLContainer>
	)
}

function NodeControls({
	meta,
	updateConfig,
}: {
	meta: WorkflowNodeMeta
	updateConfig: (patch: Record<string, string>) => void
}) {
	if (meta.kind === 'input') {
		if (meta.readonly) {
			return (
				<div className="workflow-node-summary">
					<div>
						<span>SOURCE</span>
						<strong>Terminal ML-Intern tool</strong>
					</div>
					<div>
						<span>STATE</span>
						<strong>{meta.config.value || 'Waiting for request'}</strong>
					</div>
				</div>
			)
		}
		return (
			<textarea
				className="workflow-primary-editor"
				aria-label="Workflow input value"
				value={meta.config.value ?? ''}
				placeholder="Type workflow input…"
				onChange={(event) => updateConfig({ value: event.currentTarget.value })}
			/>
		)
	}

	if (meta.kind === 'llm') {
		const provider =
			meta.config.provider ??
			(meta.config.model?.includes('/') ? 'openrouter' : 'builtin')
		return (
			<>
				<div className="workflow-node-fields-row">
					<label className="workflow-node-field">
						<span>PROVIDER</span>
						<select
							aria-label="LLM provider"
							value={provider}
							disabled={meta.readonly}
							onChange={(event) => updateConfig({ provider: event.currentTarget.value })}
						>
							<option value="builtin">Built-in</option>
							<option value="openrouter">OpenRouter</option>
							<option value="compatible">Base URL</option>
						</select>
					</label>
					<label className="workflow-node-field">
						<span>MODEL</span>
						<input
							aria-label="LLM model"
							value={meta.config.model ?? ''}
							disabled={meta.readonly}
							placeholder="Select model"
							onChange={(event) => updateConfig({ model: event.currentTarget.value })}
						/>
					</label>
				</div>
				<label className="workflow-node-field is-grow">
					<span>INSTRUCTIONS</span>
					<textarea
						aria-label="LLM instructions"
						value={meta.config.instructions ?? ''}
						disabled={meta.readonly}
						placeholder="What should this model do?"
						onChange={(event) => updateConfig({ instructions: event.currentTarget.value })}
					/>
				</label>
			</>
		)
	}

	if (meta.kind === 'prompt-template') {
		const variables = extractTemplateVariables(meta.config.template ?? '')
		return (
			<>
				<textarea
					className="workflow-primary-editor"
					aria-label="Prompt template"
					value={meta.config.template ?? ''}
					disabled={meta.readonly}
					placeholder="Write the prompt here. Use {input} for upstream text…"
					onChange={(event) => updateConfig({ template: event.currentTarget.value })}
				/>
				<div className="workflow-template-bindings" aria-label="Template variables">
					{variables.length ? (
						variables.slice(0, 2).map((variable) => {
							const receivesInput =
								variable === (meta.config.inputVariable || 'input') || variable === 'input'
							return (
								<label key={variable}>
									<span>{variable}</span>
									<input
										aria-label={`Template variable ${variable}`}
										value={receivesInput ? 'Receiving input' : meta.config[`var:${variable}`] ?? ''}
										disabled={meta.readonly || receivesInput}
										placeholder="Type a value…"
										onChange={(event) =>
											updateConfig({ [`var:${variable}`]: event.currentTarget.value })
										}
									/>
								</label>
							)
						})
					) : (
						<em>Use {'{input}'} to bind upstream text</em>
					)}
				</div>
			</>
		)
	}

	if (meta.kind.startsWith('mlflow-')) {
		return <MlflowNodeControls meta={meta} updateConfig={updateConfig} />
	}

	if (meta.kind === 'context') {
		return <ContextNodeControls />
	}

	if (meta.kind === 'agent') {
		return (
			<>
				<div className="workflow-agent-provider">
					<span>AGENT</span>
					<strong>{meta.config.agentProvider === 'amp' ? 'Amp' : meta.config.agentProvider || 'Amp'}</strong>
					<small>Owns planning + validated actions</small>
				</div>
				<label className="workflow-node-field is-grow">
					<span>INSTRUCTIONS</span>
					<textarea
						aria-label="Agent instructions"
						value={meta.config.instructions ?? ''}
						disabled={meta.readonly}
						placeholder="What should this agent do?"
						onChange={(event) => updateConfig({ instructions: event.currentTarget.value })}
					/>
				</label>
			</>
		)
	}

	if (meta.kind === 'decision') {
		return (
			<label className="workflow-node-field is-grow">
				<span>CONDITION</span>
				<textarea
					aria-label="Decision condition"
					value={meta.config.condition ?? meta.config.value ?? ''}
					disabled={meta.readonly}
					placeholder="Define the branch condition…"
					onChange={(event) => updateConfig({ condition: event.currentTarget.value })}
				/>
			</label>
		)
	}

	if (meta.kind === 'trigger' || meta.kind === 'human') {
		return (
			<label className="workflow-node-field is-grow">
				<span>{meta.kind === 'trigger' ? 'EVENT' : 'TASK'}</span>
				<textarea
					aria-label={meta.kind === 'trigger' ? 'Trigger event' : 'Human task'}
					value={meta.config.value ?? ''}
					disabled={meta.readonly}
					placeholder={meta.kind === 'trigger' ? 'Describe the event…' : 'Describe the approval task…'}
					onChange={(event) => updateConfig({ value: event.currentTarget.value })}
				/>
			</label>
		)
	}

	const rows = detailRows(meta)
	return (
		<div className="workflow-node-summary">
			{rows.map(([label, value]) => (
				<div key={label}>
					<span>{label}</span>
					<strong>{value}</strong>
				</div>
			))}
		</div>
	)
}

function MlflowNodeControls({
	meta,
	updateConfig,
}: {
	meta: WorkflowNodeMeta
	updateConfig: (patch: Record<string, string>) => void
}) {
	const fields =
		meta.kind === 'mlflow-experiment'
			? [
					['EXPERIMENT', 'experimentName', 'autorecruit-eval-lab'],
					['TRACKING', 'trackingAlias', 'local-mlflow'],
				]
			: meta.kind === 'mlflow-run'
				? [
						['RUN NAME', 'runName', 'candidate-run'],
						['MODE', 'runMode', 'create-or-resume'],
					]
				: meta.kind === 'mlflow-evaluation'
					? [
							['DATASET REF', 'datasetRef', 'selected dataset artifact'],
							['EVALUATOR', 'evaluator', 'default'],
						]
					: [
							['MODEL NAME', 'modelName', 'autorecruit-candidate'],
							['ALIAS', 'modelAlias', 'candidate'],
						]

	return (
		<>
			<div className="workflow-mlflow-boundary">
				<strong>MLflow reference</strong>
				<span>Terminal ML‑Intern executes; canvas stores compact refs only.</span>
			</div>
			<div className="workflow-node-fields-row">
				{fields.map(([label, key, placeholder]) => (
					<label className="workflow-node-field" key={key}>
						<span>{label}</span>
						<input
							aria-label={`MLflow ${label.toLowerCase()}`}
							value={meta.config[key] ?? ''}
							disabled={meta.readonly}
							placeholder={placeholder}
							onChange={(event) =>
								updateConfig({ [key]: event.currentTarget.value })
							}
						/>
					</label>
				))}
			</div>
		</>
	)
}

function ContextNodeControls() {
	const editor = useEditor()
	const contextCount = useValue(
		'workflow context item count',
		() => AgentAppAgentsManager.getAgent(editor)?.context.getItems().length ?? 0,
		[editor]
	)
	const clear = () => AgentAppAgentsManager.getAgent(editor)?.context.clear()

	return (
		<div className="workflow-context-controls">
			<div className="workflow-context-state">
				<strong>{contextCount}</strong>
				<span>{contextCount === 1 ? 'CONTEXT ITEM' : 'CONTEXT ITEMS'}</span>
			</div>
			<div>
				<button type="button" onClick={() => editor.setCurrentTool('target-shape')}>
					PICK SHAPES
				</button>
				<button type="button" onClick={() => editor.setCurrentTool('target-area')}>
					PICK AREA
				</button>
				<button type="button" className="is-quiet" onClick={clear} disabled={!contextCount}>
					CLEAR
				</button>
			</div>
		</div>
	)
}

function PortMarkers({ ports }: { ports: WorkflowPort[] }) {
	const grouped = {
		input: ports.filter((port) => port.direction === 'input'),
		output: ports.filter((port) => port.direction === 'output'),
	}
	return (
		<>
			{(['input', 'output'] as const).map((direction) =>
				grouped[direction].map((port, index) => (
					<span
						key={`${direction}-${port.id}`}
						className={`workflow-node-port is-${direction} is-${port.valueType}`}
						style={{ top: `${50 + (index - (grouped[direction].length - 1) / 2) * 20}%` }}
						title={`${port.id}: ${port.valueType} ${direction}`}
						aria-label={`${port.id} ${direction} port`}
					>
						<span>{port.id}</span>
					</span>
				))
			)}
		</>
	)
}

export function detailRows(meta: Pick<WorkflowNodeMeta, 'kind' | 'config' | 'readonly'>) {
	if (meta.kind === 'action') {
		return [
			['OPERATION', meta.config.operation || meta.config.value || 'Validated canvas action'],
			['MODE', meta.readonly ? 'Inspect only' : 'Editable operation'],
		] as const
	}
	if (meta.kind === 'context') {
		return [
			['SCOPE', 'Explicit shapes or bounded area'],
			['MODE', 'Interactive selection'],
		] as const
	}
	if (meta.kind === 'agent') {
		return [
			['AGENT', meta.config.agentProvider || 'Amp'],
			['BOUNDARY', 'Validated canvas actions'],
		] as const
	}
	if (meta.kind === 'data') {
		return [
			['ARTIFACT', meta.config.value || meta.config.source || 'Workflow data'],
			['FORMAT', meta.config.format || 'Auto-detect'],
		] as const
	}
	if (meta.kind === 'output') {
		return [
			['RESULT', meta.config.value || 'Canvas mutation receipt'],
			['PERSISTENCE', 'Saved in workflow history'],
		] as const
	}
	return [
		['CONFIGURATION', meta.config.value || 'Select the node to configure'],
		['EXECUTION', meta.readonly ? 'Read only' : 'Ready'],
	] as const
}

function iconForMeta(meta: WorkflowNodeMeta): WorkflowIconName {
	if (meta.kind !== 'llm') return meta.kind
	if (meta.config.provider === 'openrouter') return 'openrouter'
	if (meta.config.provider === 'compatible') return 'base-url'
	return 'llm'
}

function humanizeKind(kind: WorkflowNodeMeta['kind']) {
	if (kind === 'llm') return 'Language model'
	if (kind === 'agent') return 'Agent'
	if (kind === 'context') return 'Bounded context'
	if (kind === 'prompt-template') return 'Prompt template'
	if (kind === 'rich-output') return 'Rendered result'
	if (kind === 'mlflow-experiment') return 'MLflow experiment'
	if (kind === 'mlflow-run') return 'MLflow run'
	if (kind === 'mlflow-evaluation') return 'MLflow evaluation'
	if (kind === 'mlflow-model') return 'MLflow model'
	return kind.charAt(0).toUpperCase() + kind.slice(1)
}

function fallbackTitle(kind: WorkflowNodeMeta['kind']) {
	if (kind === 'llm') return 'LLM'
	if (kind === 'agent') return 'AGENT'
	if (kind === 'context') return 'CONTEXT'
	if (kind === 'prompt-template') return 'PROMPT TEMPLATE'
	if (kind.startsWith('mlflow-')) return kind.replace('-', ' ').toUpperCase()
	return kind.replace('-', ' ').toUpperCase()
}

function fallbackDescription(kind: WorkflowNodeMeta['kind']) {
	if (kind === 'llm') return 'Run a language model with a selected provider.'
	if (kind === 'agent') return 'Run a planning agent with bounded tools and context.'
	if (kind === 'context') return 'Choose explicit shapes or one bounded canvas area.'
	if (kind === 'input') return 'Provide a value to the workflow.'
	if (kind === 'prompt-template') return 'Compose a reusable prompt with dynamic variables.'
	if (kind === 'output') return 'Inspect the resulting workflow value.'
	if (kind.startsWith('mlflow-')) {
		return 'A native workflow reference consumed by terminal ML-Intern tools.'
	}
	return `Configure this ${kind.replace('-', ' ')} step.`
}

function accentForKind(kind: WorkflowNodeMeta['kind']) {
	if (kind === 'input') return '#3b82f6'
	if (kind === 'llm') return '#8b5cf6'
	if (kind === 'agent') return '#0f9f86'
	if (kind === 'context') return '#2563eb'
	if (kind === 'prompt-template') return '#7c3aed'
	if (kind === 'action') return '#0f9f86'
	if (kind === 'decision') return '#d97706'
	if (kind === 'trigger') return '#ea580c'
	if (kind === 'human') return '#16a34a'
	if (kind === 'data') return '#0891b2'
	if (kind === 'mlflow-experiment') return '#0891b2'
	if (kind === 'mlflow-run') return '#7c3aed'
	if (kind === 'mlflow-evaluation') return '#ea580c'
	if (kind === 'mlflow-model') return '#16a34a'
	return '#64748b'
}
