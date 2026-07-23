import { useCallback, useEffect, useMemo, useState } from 'react'
import { TldrawUiTooltip, useEditor, useValue } from 'tldraw'
import { WorkflowNodeKind } from '../../shared/workflow'
import {
	getWorkflowNodeMeta,
	adoptDuplicatedLlmBranch,
	duplicateLlmBranch,
	installCurrentFlow,
	installEditableLlmFlow,
	isWorkflowNode,
	updateWorkflowNode,
	WorkflowNodeShape,
} from './workflowCanvas'
import {
	clearCompatibleConnection,
	CompatibleModel,
	connectCompatibleProvider,
	getCachedCompatibleModels,
	getCompatibleApiKey,
} from './compatibleProvider'
import {
	clearOpenRouterConnection,
	connectOpenRouter,
	formatOpenRouterModelLabel,
	getCachedOpenRouterModels,
	getOpenRouterApiKey,
	OpenRouterModel,
} from './openRouter'
import { runWorkflow, stopWorkflow } from './workflowRuntime'
import { WorkflowIcon, WorkflowIconName } from './WorkflowIcons'

const NODE_TOOLS: Array<{
	toolId: string
	kind: WorkflowNodeKind
	label: string
	icon: WorkflowIconName
}> = [
	{ toolId: 'workflow-input', kind: 'input', label: 'Вход', icon: 'input' },
	{ toolId: 'workflow-trigger', kind: 'trigger', label: 'Событие / триггер', icon: 'trigger' },
	{ toolId: 'workflow-action', kind: 'action', label: 'Действие', icon: 'action' },
	{ toolId: 'workflow-decision', kind: 'decision', label: 'Условие / развилка', icon: 'decision' },
	{
		toolId: 'workflow-openrouter-llm',
		kind: 'llm',
		label: 'OpenRouter LLM',
		icon: 'openrouter',
	},
	{
		toolId: 'workflow-compatible-llm',
		kind: 'llm',
		label: 'OpenAI-compatible Base URL',
		icon: 'base-url',
	},
	{ toolId: 'workflow-human', kind: 'human', label: 'Задача для человека', icon: 'human' },
	{ toolId: 'workflow-data', kind: 'data', label: 'Данные / артефакт', icon: 'data' },
	{ toolId: 'workflow-output', kind: 'output', label: 'Простой результат', icon: 'output' },
	{
		toolId: 'workflow-rich-output',
		kind: 'rich-output',
		label: 'Rich Output: Markdown / JSON',
		icon: 'rich-output',
	},
]

export function WorkflowOverlay() {
	const editor = useEditor()
	const currentToolId = useValue('workflow current tool', () => editor.getCurrentToolId(), [editor])
	const selectedNode = useValue(
		'selected workflow node',
		() => editor.getSelectedShapes().find(isWorkflowNode) ?? null,
		[editor]
	)
	const [message, setMessage] = useState('READY')
	const [running, setRunning] = useState(false)

	useEffect(() => {
		const stop = editor.store.listen(
			({ changes }) => {
				for (const record of Object.values(changes.added)) {
					if (!isWorkflowNode(record) || getWorkflowNodeMeta(record).kind !== 'llm') continue
					queueMicrotask(() => adoptDuplicatedLlmBranch(editor, record))
				}
			},
			{ scope: 'document', source: 'user' }
		)
		return stop
	}, [editor])

	const selectedWorkflowId = selectedNode ? getWorkflowNodeMeta(selectedNode).workflowId : null
	const runnableWorkflowId = useMemo(() => {
		if (selectedWorkflowId && selectedWorkflowId !== 'current-ml-intern-flow') return selectedWorkflowId
		const candidate = [...editor.getCurrentPageShapes()]
			.reverse()
			.find(
				(shape) =>
					isWorkflowNode(shape) &&
					getWorkflowNodeMeta(shape).mode === 'editable' &&
					getWorkflowNodeMeta(shape).workflowId.startsWith('candidate-')
			)
		return candidate && isWorkflowNode(candidate) ? getWorkflowNodeMeta(candidate).workflowId : null
	}, [editor, selectedWorkflowId, selectedNode])

	const createCurrent = useCallback(() => {
		const result = installCurrentFlow(editor)
		setMessage(result.created ? 'CURRENT FLOW CREATED (READ ONLY)' : 'CURRENT FLOW SELECTED')
	}, [editor])

	const createCandidate = useCallback(() => {
		const result = installEditableLlmFlow(editor)
		setMessage(`NEW FLOW: ${result.workflowId}`)
	}, [editor])

	const play = useCallback(async () => {
		if (!runnableWorkflowId) {
			setMessage('CREATE OR SELECT AN EDITABLE FLOW')
			return
		}
		setRunning(true)
		setMessage('RUNNING LLM WORKFLOW…')
		try {
			await runWorkflow(editor, runnableWorkflowId)
			setMessage('WORKFLOW SUCCEEDED')
		} catch (error) {
			setMessage(error instanceof Error ? `FAILED: ${error.message}` : 'WORKFLOW FAILED')
		} finally {
			setRunning(false)
		}
	}, [editor, runnableWorkflowId])

	const stop = useCallback(() => {
		stopWorkflow(editor)
		setRunning(false)
		setMessage('WORKFLOW CANCELLED')
	}, [editor])
	const statusTone = running
		? 'running'
		: message.includes('SUCCEEDED')
			? 'succeeded'
			: message.startsWith('FAILED')
				? 'failed'
				: message.includes('CANCELLED')
					? 'cancelled'
					: 'idle'

	return (
		<>
			<div
				className="workflow-toolbar"
				role="toolbar"
				aria-label="ML intern workflow tools"
				onPointerDown={(event) => event.stopPropagation()}
				onClick={(event) => event.stopPropagation()}
			>
				<WorkflowToolButton
					icon="map"
					label="Текущий flow — только чтение"
					onClick={createCurrent}
				/>
				<WorkflowToolButton
					icon="new"
					label="Новый INPUT → LLM → OUTPUT"
					onClick={createCandidate}
				/>
				<div className="workflow-toolbar-divider" />
				{NODE_TOOLS.map(({ toolId, label, icon }) => (
					<WorkflowToolButton
						key={toolId}
						icon={icon}
						label={label}
						active={currentToolId === toolId}
						onClick={() => editor.setCurrentTool(toolId)}
					/>
				))}
				<WorkflowToolButton
					icon="link"
					label="Соединить ноды"
					active={currentToolId === 'arrow'}
					onClick={() => editor.setCurrentTool('arrow')}
				/>
				<div className="workflow-toolbar-divider" />
				<WorkflowToolButton
					icon="play"
					label="Запустить workflow"
					active={running}
					onClick={play}
					disabled={running}
				/>
				<WorkflowToolButton icon="stop" label="Остановить" onClick={stop} disabled={!running} />
				<div className={`workflow-toolbar-status is-${statusTone}`} role="status" title={message}>
					<span className="workflow-status-dot" />
					<span className="workflow-sr-only">{message}</span>
				</div>
			</div>
			{selectedNode && <WorkflowInspector key={selectedNode.id} shape={selectedNode} />}
		</>
	)
}

function WorkflowToolButton({
	icon,
	label,
	onClick,
	active = false,
	disabled = false,
}: {
	icon: WorkflowIconName
	label: string
	onClick: () => void
	active?: boolean
	disabled?: boolean
}) {
	return (
		<TldrawUiTooltip content={label} side="right" sideOffset={8} delayDuration={350}>
			<button
				type="button"
				className="workflow-tool-button"
				onClick={onClick}
				disabled={disabled}
				aria-label={label}
				aria-pressed={active}
				data-active={active || undefined}
			>
				<WorkflowIcon name={icon} />
			</button>
		</TldrawUiTooltip>
	)
}

function WorkflowInspector({ shape }: { shape: WorkflowNodeShape }) {
	const editor = useEditor()
	const meta = getWorkflowNodeMeta(shape)
	const [apiKey, setApiKey] = useState(getOpenRouterApiKey)
	const [models, setModels] = useState<OpenRouterModel[]>(getCachedOpenRouterModels)
	const [connectionStatus, setConnectionStatus] = useState(
		models.length ? `${models.length} MODELS` : 'NOT CONNECTED'
	)
	const [connecting, setConnecting] = useState(false)
	const initialBaseUrl = meta.config.baseUrl ?? 'http://127.0.0.1:11434/v1'
	const [compatibleBaseUrl, setCompatibleBaseUrl] = useState(initialBaseUrl)
	const [compatibleApiKey, setCompatibleApiKey] = useState(() =>
		getCompatibleApiKey(initialBaseUrl)
	)
	const [compatibleModels, setCompatibleModels] = useState<CompatibleModel[]>(() =>
		getCachedCompatibleModels(initialBaseUrl)
	)
	const [compatibleStatus, setCompatibleStatus] = useState(
		compatibleModels.length ? `${compatibleModels.length} MODELS` : 'NOT CONNECTED'
	)
	const [compatibleConnecting, setCompatibleConnecting] = useState(false)
	const updateConfigValues = (patch: Record<string, string>) => {
		if (meta.readonly) return
		updateWorkflowNode(editor, shape, {
			status: 'idle',
			error: undefined,
			config: { ...meta.config, ...patch },
		})
	}
	const updateConfig = (key: string, value: string) => updateConfigValues({ [key]: value })
	const provider =
		meta.config.provider ??
		(meta.config.model?.startsWith('amp-') ? 'amp' : meta.config.model?.includes('/') ? 'openrouter' : 'builtin')
	const loadOpenRouterModels = async (candidateKey = apiKey) => {
		setConnecting(true)
		setConnectionStatus('CONNECTING…')
		try {
			const nextModels = await connectOpenRouter(candidateKey)
			setApiKey(candidateKey.trim())
			setModels(nextModels)
			setConnectionStatus(`${nextModels.length} MODELS`)
			if (provider === 'openrouter' && !nextModels.some((model) => model.id === meta.config.model)) {
				updateConfig('model', nextModels[0].id)
			}
		} catch (error) {
			setConnectionStatus(error instanceof Error ? error.message : 'OPENROUTER CONNECTION FAILED')
		} finally {
			setConnecting(false)
		}
	}
	const disconnectOpenRouter = () => {
		clearOpenRouterConnection()
		setApiKey('')
		setModels([])
		setConnectionStatus('NOT CONNECTED')
	}
	const loadCompatibleModels = async () => {
		setCompatibleConnecting(true)
		setCompatibleStatus('CONNECTING…')
		try {
			const nextModels = await connectCompatibleProvider(compatibleBaseUrl, compatibleApiKey)
			setCompatibleModels(nextModels)
			setCompatibleStatus(`${nextModels.length} MODELS`)
			updateConfigValues({
				provider: 'compatible',
				baseUrl: compatibleBaseUrl.trim().replace(/\/+$/, ''),
				model: nextModels.some((model) => model.id === meta.config.model)
					? meta.config.model
					: nextModels[0].id,
			})
		} catch (error) {
			setCompatibleStatus(
				error instanceof Error ? error.message : 'OPENAI-COMPATIBLE CONNECTION FAILED'
			)
		} finally {
			setCompatibleConnecting(false)
		}
	}
	const disconnectCompatible = () => {
		clearCompatibleConnection(compatibleBaseUrl)
		setCompatibleApiKey('')
		setCompatibleModels([])
		setCompatibleStatus('NOT CONNECTED')
	}

	return (
		<div
			className="workflow-inspector"
			onPointerDown={(event) => event.stopPropagation()}
			onClick={(event) => event.stopPropagation()}
		>
			<header>
				<span>{meta.kind.toUpperCase()}</span>
				<small>{meta.readonly ? 'READ ONLY' : meta.status.toUpperCase()}</small>
			</header>
			{meta.kind === 'input' && (
				<label>
					INPUT VALUE
					<textarea
						value={meta.config.value ?? ''}
						disabled={meta.readonly}
						onChange={(event) => updateConfig('value', event.currentTarget.value)}
					/>
				</label>
			)}
			{meta.kind === 'llm' && (
				<>
					<label>
						INSTRUCTIONS
						<textarea
							value={meta.config.instructions ?? ''}
							disabled={meta.readonly}
							onChange={(event) => updateConfig('instructions', event.currentTarget.value)}
						/>
					</label>
					<label>
						PROVIDER
						<select
							value={provider}
							disabled={meta.readonly}
							onChange={(event) => {
								const nextProvider = event.currentTarget.value
								updateConfigValues({
									provider: nextProvider,
									model:
										nextProvider === 'amp'
											? 'amp-rush'
											: nextProvider === 'builtin'
												? 'claude-sonnet-4-5'
												: nextProvider === 'openrouter'
													? models[0]?.id ?? ''
													: compatibleModels[0]?.id ?? '',
									...(nextProvider === 'compatible'
										? { baseUrl: compatibleBaseUrl }
										: {}),
								})
							}}
						>
							<option value="amp">Local Amp</option>
							<option value="openrouter">OpenRouter</option>
							<option value="compatible">OpenAI-compatible Base URL</option>
							<option value="builtin">Built-in API provider</option>
						</select>
					</label>
					{provider === 'amp' && (
						<label>
							MODEL
							<select
								value={meta.config.model ?? 'amp-rush'}
								disabled={meta.readonly}
								onChange={(event) => updateConfig('model', event.currentTarget.value)}
							>
							<option value="amp-rush">Amp Rush (local coding-agent bridge)</option>
							<option value="amp-deep">Amp Deep (local coding-agent bridge)</option>
							</select>
						</label>
					)}
					{provider === 'builtin' && (
						<label>
							MODEL
							<select
								value={meta.config.model ?? 'claude-sonnet-4-5'}
								disabled={meta.readonly}
								onChange={(event) => updateConfig('model', event.currentTarget.value)}
							>
							<option value="claude-sonnet-4-5">Claude Sonnet 4.5</option>
							<option value="claude-opus-4-5">Claude Opus 4.5</option>
							<option value="gemini-3-flash-preview">Gemini 3 Flash</option>
							<option value="gpt-5.2-2025-12-11">GPT-5.2</option>
						</select>
						</label>
					)}
					{provider === 'openrouter' && (
						<div className="workflow-openrouter">
							<label>
								OPENROUTER API KEY
								<input
									type="password"
									value={apiKey}
									placeholder="sk-or-v1-…"
									autoComplete="off"
									spellCheck={false}
									disabled={meta.readonly || connecting}
									onChange={(event) => setApiKey(event.currentTarget.value)}
									onPaste={(event) => {
										const pasted = event.clipboardData.getData('text').trim()
										if (pasted) void loadOpenRouterModels(pasted)
									}}
									onKeyDown={(event) => {
										if (event.key === 'Enter') void loadOpenRouterModels()
									}}
								/>
							</label>
							<div className="workflow-openrouter-actions">
								<button
									type="button"
									onClick={() => void loadOpenRouterModels()}
									disabled={meta.readonly || connecting || !apiKey.trim()}
								>
									{connecting ? 'CONNECTING…' : 'CONNECT + LOAD MODELS'}
								</button>
								<button
									type="button"
									onClick={disconnectOpenRouter}
									disabled={meta.readonly || (!apiKey && !models.length)}
								>
									CLEAR
								</button>
							</div>
							<small className={connectionStatus.includes('MODELS') ? 'is-connected' : ''}>
								{connectionStatus}
							</small>
							<small>Key stays in sessionStorage for this tab only.</small>
							<label>
								OPENROUTER MODEL
								<select
									value={meta.config.model ?? ''}
									disabled={meta.readonly || !models.length}
									onChange={(event) => updateConfig('model', event.currentTarget.value)}
								>
									{!models.length && <option value="">Connect to load models</option>}
									{models.map((model) => (
										<option key={model.id} value={model.id}>
											{formatOpenRouterModelLabel(model)}
										</option>
									))}
								</select>
							</label>
						</div>
					)}
					{provider === 'compatible' && (
						<div className="workflow-compatible">
							<label>
								BASE URL
								<input
									type="url"
									value={compatibleBaseUrl}
									placeholder="http://127.0.0.1:11434/v1"
									spellCheck={false}
									disabled={meta.readonly || compatibleConnecting}
									onChange={(event) => {
										const nextBaseUrl = event.currentTarget.value
										setCompatibleBaseUrl(nextBaseUrl)
										setCompatibleApiKey(getCompatibleApiKey(nextBaseUrl))
										setCompatibleModels(getCachedCompatibleModels(nextBaseUrl))
										updateConfig('baseUrl', nextBaseUrl)
									}}
								/>
							</label>
							<label>
								API KEY <span>(OPTIONAL FOR LOCAL SERVERS)</span>
								<input
									type="password"
									value={compatibleApiKey}
									placeholder="Bearer token"
									autoComplete="off"
									spellCheck={false}
									disabled={meta.readonly || compatibleConnecting}
									onChange={(event) => setCompatibleApiKey(event.currentTarget.value)}
									onKeyDown={(event) => {
										if (event.key === 'Enter') void loadCompatibleModels()
									}}
								/>
							</label>
							<div className="workflow-openrouter-actions">
								<button
									type="button"
									onClick={() => void loadCompatibleModels()}
									disabled={meta.readonly || compatibleConnecting || !compatibleBaseUrl.trim()}
								>
									{compatibleConnecting ? 'CONNECTING…' : 'CONNECT + LOAD MODELS'}
								</button>
								<button
									type="button"
									onClick={disconnectCompatible}
									disabled={
										meta.readonly || (!compatibleApiKey && !compatibleModels.length)
									}
								>
									CLEAR
								</button>
							</div>
							<small className={compatibleStatus.includes('MODELS') ? 'is-connected' : ''}>
								{compatibleStatus}
							</small>
							<small>Key stays in sessionStorage; Base URL and model stay on the node.</small>
							<label>
								MODEL ID
								<input
									list={`compatible-models-${shape.id}`}
									value={meta.config.model ?? ''}
									placeholder="e.g. llama3.2"
									disabled={meta.readonly}
									onChange={(event) => updateConfig('model', event.currentTarget.value)}
								/>
								<datalist id={`compatible-models-${shape.id}`}>
									{compatibleModels.map((model) => (
										<option key={model.id} value={model.id}>
											{model.name}
										</option>
									))}
								</datalist>
							</label>
						</div>
					)}
					<button
						type="button"
						className="workflow-duplicate-branch"
						disabled={meta.readonly}
						onClick={() => duplicateLlmBranch(editor, shape)}
					>
						DUPLICATE AS PARALLEL MODEL
					</button>
				</>
			)}
			{meta.kind === 'output' && (
				<label>
					OUTPUT
					<textarea value={meta.config.value ?? ''} readOnly />
				</label>
			)}
			{meta.kind === 'rich-output' && (
				<div className="workflow-rich-output-inspector">
					<strong>INTERACTIVE CANVAS OUTPUT</strong>
					<p>Resize the rectangle, expand JSON branches, or switch between saved runs inside it.</p>
					<small>
						{meta.config.latestRunId
							? `LATEST RUN ${meta.config.latestRunId.slice(0, 8)}`
							: 'NO SAVED RUN YET'}
					</small>
				</div>
			)}
			{meta.error && <div className="workflow-inspector-error">{meta.error}</div>}
		</div>
	)
}
