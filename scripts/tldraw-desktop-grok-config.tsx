import React, { useCallback, useState } from 'react'
import {
	stopEventPropagation,
	TldrawUiButton,
	TldrawUiPopover,
	TldrawUiPopoverContent,
	TldrawUiPopoverTrigger,
	TldrawUiTooltip,
	useEditor,
	useValue,
} from 'tldraw'
import {
	AGENTS_MODELS_PRESETS,
	AGENTS_MODELS_SHAPE_TYPE,
	type AgentsModelsMeta,
	type AgentsModelsNodeKind,
	type AgentsModelsShape,
	AgentsModelsShapeUtil,
	isAgentsModelsWorkflowNode,
	requestAgentsModelsAction,
	updateAgentsModelsShapeMeta,
} from '../client/agents-models/AgentsModelsShape'
import {
	WorkflowIcon,
	type WorkflowIconName,
} from '../client/workflow/WorkflowIcons'
import stylesheet from './tldraw-desktop-eval-lab.css?inline'

const TOOLBAR_ID = 'shape:am-toolbar'

type ToolbarAction =
	| {
			kind: 'node'
			nodeKind: AgentsModelsNodeKind
			connectFromId?: string
			source?: 'toolbox' | 'inspector'
	  }
	| { kind: 'preset'; presetId: string }
	| { kind: 'preflight' | 'apply' | 'play' | 'config-sync' }

const GROK_NODE_PALETTE: Array<{
	kind: AgentsModelsNodeKind
	icon: WorkflowIconName
	label: string
}> = [
	{ kind: 'stage', icon: 'action', label: 'Stage' },
	{ kind: 'agent', icon: 'agent', label: 'Agent' },
	{ kind: 'persona', icon: 'prompt-template', label: 'Persona' },
	{ kind: 'capability', icon: 'context', label: 'Capability' },
	{ kind: 'skill', icon: 'rich-output', label: 'Skill' },
	{ kind: 'gate', icon: 'decision', label: 'Gate' },
	{ kind: 'input', icon: 'input', label: 'Input' },
	{ kind: 'artifact', icon: 'data', label: 'Artifact' },
	{ kind: 'result', icon: 'output', label: 'Result' },
	{ kind: 'module', icon: 'map', label: 'Module' },
]

function useGrokDispatch() {
	const editor = useEditor()
	return useCallback(
		(action: ToolbarAction) =>
			requestAgentsModelsAction(editor, {
				...action,
				source:
					action.kind === 'node'
						? action.source ?? 'toolbox'
						: undefined,
			}),
		[editor]
	)
}

function GrokWorkflowToolbox() {
	const dispatchAction = useGrokDispatch()
	const [open, setOpen] = useState(false)
	const [message, setMessage] = useState('Visual graph is the workflow source.')

	const dispatch = useCallback(
		(action: ToolbarAction) => {
			if (!dispatchAction(action)) {
				setMessage('Open the Agents/Models page; its canvas script is not active.')
				return
			}
			setMessage(
				action.kind === 'node'
					? `${action.nodeKind} node requested.`
					: action.kind === 'preset'
						? `${action.presetId} preset requested.`
						: action.kind === 'config-sync'
							? 'Revision-guarded config sync requested.'
							: `${action.kind} requested.`,
			)
		},
		[dispatchAction],
	)

	return (
		<div className="grok-workflow-toolbox">
			<TldrawUiPopover open={open} onOpenChange={setOpen} id="grok-workflow-palette">
				<TldrawUiTooltip content="Grok workflow palette">
					<TldrawUiPopoverTrigger>
						<TldrawUiButton
							type="icon"
							className="grok-workflow-trigger"
							aria-label="Grok workflow palette"
						>
							<GrokMark />
						</TldrawUiButton>
					</TldrawUiPopoverTrigger>
				</TldrawUiTooltip>
				<TldrawUiPopoverContent side="right" align="start" sideOffset={8}>
					<div className="grok-workflow-palette">
						<header>
							<GrokMark />
							<div>
								<strong>Grok workflow</strong>
								<span>Native nodes → validated Rhai</span>
							</div>
						</header>

						<section>
							<label>NODE PALETTE</label>
							<div className="grok-workflow-node-grid">
								{GROK_NODE_PALETTE.map((item) => (
									<NodeButton
										key={item.kind}
										icon={item.icon}
										label={item.label}
										onClick={() =>
											dispatch({ kind: 'node', nodeKind: item.kind })
										}
									/>
								))}
							</div>
						</section>

						<section>
							<label>WORKFLOW PRESETS</label>
							<div className="grok-workflow-preset-grid">
								{AGENTS_MODELS_PRESETS.map((presetId) => (
									<button
										key={presetId}
										type="button"
										onClick={() => dispatch({ kind: 'preset', presetId })}
									>
										{presetId}
									</button>
								))}
							</div>
						</section>

						<section className="grok-workflow-actions">
							<button type="button" onClick={() => dispatch({ kind: 'preflight' })}>
								<WorkflowIcon name="decision" />
								Preflight
							</button>
							<button type="button" onClick={() => dispatch({ kind: 'apply' })}>
								Apply
							</button>
							<button type="button" onClick={() => dispatch({ kind: 'play' })}>
								<WorkflowIcon name="play" />
								Play
							</button>
						</section>
						<button
							type="button"
							className="grok-config-sync"
							onClick={() => dispatch({ kind: 'config-sync' })}
						>
							<WorkflowIcon name="data" />
							Sync config.toml
						</button>
						<footer>{message}</footer>
					</div>
				</TldrawUiPopoverContent>
			</TldrawUiPopover>
		</div>
	)
}

function GrokNodeInspector() {
	const editor = useEditor()
	const dispatch = useGrokDispatch()
	const state = useValue(
		'grok selected workflow node',
		() => {
			const shape = editor.getSelectedShapes().find(isAgentsModelsWorkflowNode)
			if (!shape) return null
			const catalog = editor
				.getCurrentPageShapes()
				.find(
					(candidate) =>
						(candidate.meta?.am as unknown as AgentsModelsMeta | undefined)?.role ===
						'catalog'
				)
			const sections =
				(catalog?.meta?.am as unknown as AgentsModelsMeta | undefined)?.catalogSections ??
				[]
			const connected = connectedWorkflowNodeIds(editor, shape.id)
			const parentStage =
				(shape.meta.am as unknown as AgentsModelsMeta).role === 'stage'
					? shape.id
					: connected
							.map((id) => editor.getShape(id))
							.find(
								(candidate) =>
									(candidate?.meta?.am as unknown as AgentsModelsMeta | undefined)
										?.role === 'stage'
							)?.id ??
						connected
							.flatMap((id) => connectedWorkflowNodeIds(editor, id))
							.map((id) => editor.getShape(id))
							.find(
								(candidate) =>
									(candidate?.meta?.am as unknown as AgentsModelsMeta | undefined)
										?.role === 'stage'
							)?.id
				const toolbar = editor.getShape(TOOLBAR_ID as AgentsModelsShape['id'])
			const receipt = toolbar?.meta?.am as unknown as AgentsModelsMeta | undefined
			return {
				shape,
				meta: shape.meta.am as unknown as AgentsModelsMeta,
				models: sections.find((section) => section.id === 'models')?.items ?? [],
				agents: sections.find((section) => section.id === 'agents')?.items ?? [],
				personas: sections.find((section) => section.id === 'personas')?.items ?? [],
				skills: sections.find((section) => section.id === 'skills')?.items ?? [],
				modules: sections.find((section) => section.id === 'modules')?.items ?? [],
				parentStageId: parentStage ? String(parentStage) : undefined,
				stageAgentCount: parentStage
					? connectedWorkflowNodeIds(editor, parentStage).filter((id) => {
							const role = (
								editor.getShape(id)?.meta?.am as unknown as
									| AgentsModelsMeta
									| undefined
							)?.role
							return role === 'agent' || role === 'subagent'
						}).length
					: 0,
				receipt: receipt?.actionMessage ?? 'Graph changes are inspectable and undoable.',
				receiptState: receipt?.actionState ?? 'idle',
			}
		},
		[editor]
	)
	if (!state) return null

	const { shape, meta } = state
	const patch = (value: Partial<AgentsModelsMeta>) =>
		updateAgentsModelsShapeMeta(editor, shape, value)
	const connect = (nodeKind: AgentsModelsNodeKind, fromId?: string) => {
		if (!fromId) return
		dispatch({
			kind: 'node',
			nodeKind,
			connectFromId: fromId,
			source: 'inspector',
		})
	}
	const role = (meta.role === 'subagent' ? 'agent' : meta.role) as AgentsModelsNodeKind
	const presentation = grokNodePresentation(role)

	return (
		<div
			className={`grok-node-inspector is-${role}`}
			onPointerDown={stopEventPropagation}
			onClick={stopEventPropagation}
			onWheel={stopEventPropagation}
		>
			<header>
				<span className="grok-node-inspector-icon">
					<WorkflowIcon name={presentation.icon} />
				</span>
				<div>
					<strong>{meta.label || role}</strong>
					<span>{role} · selected</span>
				</div>
				<span className="grok-node-inspector-ready">READY</span>
			</header>
			<div className="grok-node-inspector-fields">
				<label>
					<span>LABEL</span>
					<input
						value={meta.label || ''}
						onChange={(event) => patch({ label: event.currentTarget.value })}
					/>
				</label>
				{role === 'stage' && (
					<label>
						<span>CONTROL</span>
						<select
							value={meta.stageType || 'single'}
							onChange={(event) => patch({ stageType: event.currentTarget.value })}
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
				)}
				{role === 'agent' && (
					<>
						<label>
							<span>AGENT</span>
							<select
								value={meta.agentRef || ''}
								onChange={(event) =>
									patch({
										agentRef: event.currentTarget.value,
										label: event.currentTarget.value || meta.label || 'agent',
									})
								}
							>
								<option value="">default agent</option>
								{state.agents.map((item) => (
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
								onChange={(event) => patch({ modelRef: event.currentTarget.value })}
							>
								<option value="">agent default</option>
								{state.models.map((item) => (
									<option key={item.id} value={item.id}>
										{item.label}
									</option>
								))}
							</select>
						</label>
					</>
				)}
				{role === 'persona' && (
					<>
						<label>
							<span>PERSONA</span>
							<select
								value={meta.persona || ''}
								onChange={(event) =>
									patch({
										persona: event.currentTarget.value,
										label: event.currentTarget.value || 'persona',
									})
								}
							>
								<option value="">select persona</option>
								{state.personas.map((item) => (
									<option key={item.id} value={item.id}>
										{item.label}
									</option>
								))}
							</select>
						</label>
						<label>
							<span>MODEL OVERRIDE</span>
							<select
								value={meta.modelRef || ''}
								onChange={(event) => patch({ modelRef: event.currentTarget.value })}
							>
								<option value="">persona default</option>
								{state.models.map((item) => (
									<option key={item.id} value={item.id}>
										{item.label}
									</option>
								))}
							</select>
						</label>
					</>
				)}
				{role === 'capability' && (
					<>
						<label>
							<span>MODE</span>
							<select
								value={meta.capabilityMode || 'all'}
								onChange={(event) =>
									patch({
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
						<label className="is-wide">
							<span>TOOL IDS · ADVISORY</span>
							<input
								value={meta.toolRefsText || ''}
								placeholder="optional, comma separated"
								onChange={(event) =>
									patch({ toolRefsText: event.currentTarget.value })
								}
							/>
						</label>
					</>
				)}
				{role === 'skill' && (
					<label className="is-wide">
						<span>PROJECT SKILL</span>
						<select
							value={meta.skillRef || ''}
							onChange={(event) =>
								patch({
									skillRef: event.currentTarget.value,
									label:
										state.skills.find(
											(item) => item.id === event.currentTarget.value
										)?.label ||
										meta.label ||
										'Skill',
								})
							}
						>
							<option value="">select .agents/skills entry</option>
							{state.skills.map((item) => (
								<option key={item.id} value={item.id}>
									{item.label}
								</option>
							))}
						</select>
					</label>
				)}
				{role === 'gate' && (
					<>
						<label>
							<span>CONDITION</span>
							<select
								value={meta.gateOperator || 'not-empty'}
								onChange={(event) =>
									patch({
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
						<label>
							<span>VALUE</span>
							<input
								value={meta.gateValue || ''}
								disabled={(meta.gateOperator || 'not-empty') === 'not-empty'}
								onChange={(event) => patch({ gateValue: event.currentTarget.value })}
							/>
						</label>
						<label>
							<span>ON FALSE</span>
							<select
								value={meta.gateOnFalse || 'stop'}
								onChange={(event) =>
									patch({
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
					<label className="is-wide">
						<span>BOUNDED INPUT</span>
						<textarea
							value={meta.dataValue || ''}
							maxLength={4000}
							onChange={(event) => patch({ dataValue: event.currentTarget.value })}
						/>
					</label>
				)}
				{role === 'artifact' && (
					<label className="is-wide">
						<span>ARTIFACT REFERENCE</span>
						<input
							value={meta.artifactRef || ''}
							placeholder="project-relative path or compact id"
							onChange={(event) => patch({ artifactRef: event.currentTarget.value })}
						/>
					</label>
				)}
				{role === 'result' && (
					<label className="is-wide">
						<span>RESULT LABEL</span>
						<input
							value={meta.resultLabel || ''}
							onChange={(event) => patch({ resultLabel: event.currentTarget.value })}
						/>
					</label>
				)}
				{role === 'module' && (
					<>
						<label>
							<span>MODULE</span>
							<select
								value={meta.moduleRef || ''}
								onChange={(event) => {
									const selected = state.modules.find(
										(item) => item.id === event.currentTarget.value
									)
									patch({
										moduleRef: event.currentTarget.value,
										moduleVersion: selected?.value || '',
										label: selected?.label || meta.label || 'Module',
									})
								}}
							>
								<option value="">select module</option>
								{state.modules.map((item) => (
									<option key={item.id} value={item.id}>
										{item.label}
									</option>
								))}
							</select>
						</label>
						<label>
							<span>VERSION</span>
							<input
								value={meta.moduleVersion || ''}
								onChange={(event) =>
									patch({ moduleVersion: event.currentTarget.value })
								}
							/>
						</label>
						<label>
							<span>PARAMS JSON</span>
							<input
								value={meta.moduleParams || '{}'}
								onChange={(event) =>
									patch({ moduleParams: event.currentTarget.value })
								}
							/>
						</label>
					</>
				)}
			</div>
			<section className="grok-node-continuations">
				<span>CONTINUE WITH</span>
				<div>
					{role === 'stage' && (
						<>
							<ContinuationButton
								icon="action"
								label="Next stage"
								onClick={() => connect('stage', shape.id)}
							/>
							<ContinuationButton
								icon="agent"
								label={state.stageAgentCount > 0 ? 'Parallel agent' : 'Attach agent'}
								onClick={() => connect('agent', shape.id)}
							/>
							<ContinuationButton
								icon="decision"
								label="Gate"
								onClick={() => connect('gate', shape.id)}
							/>
							<ContinuationButton
								icon="input"
								label="Input"
								onClick={() => connect('input', shape.id)}
							/>
							<ContinuationButton
								icon="data"
								label="Artifact"
								onClick={() => connect('artifact', shape.id)}
							/>
							<ContinuationButton
								icon="output"
								label="Result"
								onClick={() => connect('result', shape.id)}
							/>
						</>
					)}
					{role === 'agent' && (
						<>
							<ContinuationButton
								icon="prompt-template"
								label="Persona"
								onClick={() => connect('persona', shape.id)}
							/>
							<ContinuationButton
								icon="context"
								label="Capabilities"
								onClick={() => connect('capability', shape.id)}
							/>
							<ContinuationButton
								icon="rich-output"
								label="Skill"
								onClick={() => connect('skill', shape.id)}
							/>
						</>
					)}
					{role === 'gate' && (
						<ContinuationButton
							icon="action"
							label="Next stage"
							onClick={() => connect('stage', shape.id)}
						/>
					)}
					{role === 'module' && (
						<ContinuationButton
							icon="action"
							label="Next stage"
							onClick={() => connect('stage', shape.id)}
						/>
					)}
				</div>
			</section>
			<footer data-state={state.receiptState}>
				<span>{state.receipt}</span>
				<button type="button" onClick={() => dispatch({ kind: 'config-sync' })}>
					Sync config.toml
				</button>
			</footer>
		</div>
	)
}

function connectedWorkflowNodeIds(
	editor: ReturnType<typeof useEditor>,
	shapeId: AgentsModelsShape['id']
): AgentsModelsShape['id'][] {
	const bindings = (editor.store.allRecords() as Array<Record<string, any>>).filter(
		(record) =>
			record.typeName === 'binding' &&
			record.type === 'arrow' &&
			(record.props?.terminal === 'start' || record.props?.terminal === 'end')
	)
	const arrowIds = new Set(
		bindings.filter((binding) => binding.toId === shapeId).map((binding) => binding.fromId)
	)
	return [
		...new Set(
			bindings
				.filter((binding) => arrowIds.has(binding.fromId) && binding.toId !== shapeId)
					.map((binding) => String(binding.toId) as AgentsModelsShape['id'])
		),
	]
}

function NodeButton({
	icon,
	label,
	onClick,
}: {
	icon: WorkflowIconName
	label: string
	onClick: () => void
}) {
	return (
		<button type="button" onClick={onClick}>
			<WorkflowIcon name={icon} />
			<span>{label}</span>
		</button>
	)
}

function ContinuationButton({
	icon,
	label,
	onClick,
}: {
	icon: WorkflowIconName
	label: string
	onClick: () => void
}) {
	return (
		<button type="button" onClick={onClick}>
			<WorkflowIcon name={icon} />
			{label}
		</button>
	)
}

function grokNodePresentation(role: AgentsModelsNodeKind): {
	icon: WorkflowIconName
	label: string
} {
	return (
		GROK_NODE_PALETTE.find((item) => item.kind === role) ?? {
			icon: 'action',
			label: role,
		}
	)
}

function GrokMark() {
	return (
		<svg
			viewBox="0 0 512 509.641"
			aria-hidden="true"
			shapeRendering="geometricPrecision"
		>
			<path
				d="M115.612 0h280.776C459.975 0 512 52.026 512 115.612v278.416c0 63.587-52.025 115.613-115.612 115.613H115.612C52.026 509.641 0 457.615 0 394.028V115.612C0 52.026 52.026 0 115.612 0z"
				fill="#000"
			/>
			<path
				d="M213.235 306.019l178.976-180.002v.169l51.695-51.763c-.924 1.32-1.86 2.605-2.785 3.89-39.281 54.164-58.46 80.649-43.07 146.922l-.09-.101c10.61 45.11-.744 95.137-37.398 131.836-46.216 46.306-120.167 56.611-181.063 14.928l42.462-19.675c38.863 15.278 81.392 8.57 111.947-22.03 30.566-30.6 37.432-75.159 22.065-112.252-2.92-7.025-11.67-8.795-17.792-4.263l-124.947 92.341zm-25.786 22.437l-.033.034L68.094 435.217c7.565-10.429 16.957-20.294 26.327-30.149 26.428-27.803 52.653-55.359 36.654-94.302-21.422-52.112-8.952-113.177 30.724-152.898 41.243-41.254 101.98-51.661 152.706-30.758 11.23 4.172 21.016 10.114 28.638 15.639l-42.359 19.584c-39.44-16.563-84.629-5.299-112.207 22.313-37.298 37.308-44.84 102.003-1.128 143.81z"
				fill="#fff"
			/>
		</svg>
	)
}

export function GrokToolboxLayer() {
	return (
		<>
			<style>{`${stylesheet as unknown as string}\n${toolboxStyles}`}</style>
			<GrokWorkflowToolbox />
			<GrokNodeInspector />
		</>
	)
}

export default function ({ config }: { config: any }) {
	const Previous = config.components?.InFrontOfTheCanvas
	const previousShapeVisibility = config.getShapeVisibility
	function InFrontOfTheCanvas() {
		return (
			<>
				{Previous && <Previous />}
				<GrokToolboxLayer />
			</>
		)
	}
	return {
		...config,
		shapeUtils: [...(config.shapeUtils ?? []), AgentsModelsShapeUtil],
		getShapeVisibility: (shape: any, editor: any) => {
			if (
				(shape.meta?.am as unknown as AgentsModelsMeta | undefined)?.hiddenControl
			) {
				return 'hidden'
			}
			return previousShapeVisibility?.(shape, editor) ?? 'inherit'
		},
		components: {
			...config.components,
			InFrontOfTheCanvas,
		},
	}
}

const toolboxStyles = `
.grok-workflow-toolbox{position:absolute;left:12px;top:76px;z-index:310;pointer-events:auto}
.grok-workflow-trigger{width:44px!important;height:44px!important;padding:7px!important;color:var(--tl-color-text-2)!important}
.grok-workflow-trigger svg{width:30px;height:30px}
.grok-workflow-palette{--grok-stage:#596a7c;--grok-agent:#526d65;--grok-persona:#816a4c;--grok-action:#526d65;width:320px;max-height:min(760px,calc(100vh - 100px));overflow:auto;padding:10px;color:var(--tl-color-text-1);background:var(--tl-color-panel)}
.grok-workflow-palette *{box-sizing:border-box}
.grok-workflow-palette header{display:flex;align-items:center;gap:9px;padding:2px 2px 10px;border-bottom:1px solid var(--tl-color-divider)}
.grok-workflow-palette header svg{width:30px;height:30px}
.grok-workflow-palette header strong,.grok-workflow-palette header span{display:block}
.grok-workflow-palette header strong{font-size:13px}
.grok-workflow-palette header span,.grok-workflow-palette label,.grok-workflow-palette footer{color:var(--tl-color-text-3);font-size:9px}
.grok-workflow-palette section{display:grid;gap:7px;padding-top:11px}
.grok-workflow-palette label{font:700 9px/1.2 "SFMono-Regular",Consolas,monospace;letter-spacing:.07em}
.grok-workflow-node-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
.grok-workflow-node-grid button,.grok-workflow-preset-grid button,.grok-workflow-actions button{border:1px solid var(--tl-color-divider);border-radius:7px;background:var(--tl-color-background);color:var(--tl-color-text-1);cursor:pointer}
.grok-workflow-node-grid button{display:grid;place-items:center;gap:5px;min-height:62px;padding:7px;font-size:10px;font-weight:650}
.grok-workflow-node-grid svg{width:20px;height:20px}
.grok-workflow-node-grid button:nth-child(1) svg{color:var(--grok-stage)}
.grok-workflow-node-grid button:nth-child(2) svg{color:var(--grok-agent)}
.grok-workflow-node-grid button:nth-child(3) svg{color:var(--grok-persona)}
.grok-workflow-preset-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:5px}
.grok-workflow-preset-grid button{min-height:29px;padding:5px;font:650 9px/1 "SFMono-Regular",Consolas,monospace;text-transform:uppercase}
.grok-workflow-actions{grid-template-columns:repeat(3,1fr)}
.grok-workflow-actions button{display:flex;align-items:center;justify-content:center;gap:6px;min-height:34px;font-size:10px;font-weight:700}
.grok-workflow-actions button:first-child{border-color:var(--grok-action);color:var(--grok-action)}
.grok-workflow-actions svg{width:13px;height:13px}
.grok-config-sync{display:flex;align-items:center;justify-content:center;gap:7px;width:100%;min-height:34px;margin-top:7px;border:1px solid var(--tl-color-divider);border-radius:7px;background:var(--tl-color-background);color:var(--tl-color-text-1);cursor:pointer;font-size:10px;font-weight:700}
.grok-config-sync svg{width:14px;height:14px;color:var(--grok-action)}
.grok-workflow-palette button:hover{background:var(--tl-color-low)}
.grok-workflow-palette footer{margin-top:10px;padding:8px;border-left:2px solid var(--grok-action);background:var(--tl-color-low);line-height:1.4}
.grok-node-inspector{--grok-node-accent:#526d65;position:absolute;z-index:309;top:68px;left:50%;width:min(620px,calc(100vw - 300px));overflow:hidden;transform:translateX(-50%);border:1px solid var(--tl-color-divider);border-top:3px solid var(--grok-node-accent);border-radius:10px;background:var(--tl-color-panel);box-shadow:var(--tl-shadow-3);color:var(--tl-color-text-1);pointer-events:auto}
.grok-node-inspector.is-stage{--grok-node-accent:#596a7c}
.grok-node-inspector.is-persona{--grok-node-accent:#816a4c}
.grok-node-inspector>header{display:grid;grid-template-columns:34px minmax(0,1fr) auto;align-items:center;gap:9px;min-height:48px;padding:7px 10px;border-bottom:1px solid var(--tl-color-divider);background:var(--tl-color-muted-1)}
.grok-node-inspector-icon{display:grid;place-items:center;width:30px;height:30px;border-radius:7px;background:var(--tl-color-muted-2);color:var(--grok-node-accent)}
.grok-node-inspector-icon svg{width:18px;height:18px}
.grok-node-inspector header strong,.grok-node-inspector header div>span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.grok-node-inspector header strong{font-size:12px}
.grok-node-inspector header div>span,.grok-node-inspector-ready,.grok-node-inspector-fields label>span,.grok-node-continuations>span{color:var(--tl-color-text-3);font:650 8px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.05em;text-transform:uppercase}
.grok-node-inspector-ready{padding:5px 7px;border-radius:999px;background:var(--tl-color-muted-2)}
.grok-node-inspector-fields{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;padding:9px 10px}
.grok-node-inspector-fields label{display:grid;gap:4px;min-width:0}
.grok-node-inspector-fields label.is-wide{grid-column:span 2}
.grok-node-inspector-fields :is(input,select,textarea){width:100%;height:30px;padding:0 8px;border:1px solid var(--tl-color-divider);border-radius:6px;outline:none;background:var(--tl-color-muted-1);color:var(--tl-color-text-1);font:550 10px/1.2 var(--tl-font-sans)}
.grok-node-inspector-fields textarea{min-height:48px;resize:vertical;padding-block:7px}
.grok-node-inspector-fields :is(input,select,textarea):focus{border-color:var(--grok-node-accent);box-shadow:0 0 0 2px color-mix(in srgb,var(--grok-node-accent) 14%,transparent)}
.grok-node-continuations{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:10px;padding:0 10px 9px}
.grok-node-continuations>div{display:flex;flex-wrap:wrap;gap:6px;min-width:0}
.grok-node-continuations button{display:flex;align-items:center;justify-content:center;gap:6px;min-height:30px;padding:0 10px;border:1px solid var(--tl-color-divider);border-radius:6px;background:var(--tl-color-background);color:var(--tl-color-text-1);cursor:pointer;font-size:10px;font-weight:650}
.grok-node-continuations button:hover{border-color:var(--grok-node-accent);background:var(--tl-color-muted-1)}
.grok-node-continuations button:disabled{cursor:default;opacity:.4}
.grok-node-continuations svg{width:14px;height:14px;color:var(--grok-node-accent)}
.grok-node-inspector>footer{display:flex;align-items:center;gap:10px;min-height:38px;padding:6px 10px;border-top:1px solid var(--tl-color-divider);background:var(--tl-color-muted-1)}
.grok-node-inspector>footer span{min-width:0;flex:1;overflow:hidden;color:var(--tl-color-text-3);font-size:9px;text-overflow:ellipsis;white-space:nowrap}
.grok-node-inspector>footer[data-state="failed"] span{color:var(--tl-color-danger)}
.grok-node-inspector>footer[data-state="succeeded"] span{color:var(--tl-color-success)}
.grok-node-inspector>footer button{min-height:27px;padding:0 9px;border:1px solid color-mix(in srgb,var(--grok-node-accent) 50%,var(--tl-color-divider));border-radius:6px;background:var(--tl-color-panel);color:var(--grok-node-accent);cursor:pointer;font-size:9px;font-weight:700}
@media(max-width:820px){.grok-node-inspector{left:74px;width:calc(100vw - 92px);transform:none}.grok-node-inspector-fields{grid-template-columns:1fr 1fr}.grok-node-continuations{grid-template-columns:1fr}.grok-node-continuations>div{overflow:auto}}
`
