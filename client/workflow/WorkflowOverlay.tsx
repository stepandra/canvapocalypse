import { useCallback, useEffect, useMemo, useState } from 'react'
import {
	createShapeId,
	Editor,
	TldrawUiButton,
	TldrawUiInput,
	TldrawUiPopover,
	TldrawUiPopoverContent,
	TldrawUiPopoverTrigger,
	TldrawUiSelect,
	TldrawUiSelectContent,
	TldrawUiSelectItem,
	TldrawUiSelectTrigger,
	TldrawUiSelectValue,
	TldrawUiToolbar,
	TldrawUiToolbarButton,
	TldrawUiTooltip,
	toRichText,
	useEditor,
	useValue,
} from 'tldraw'
import {
	ProductArtifactPaletteTool,
	WorkbenchPaletteTool,
	WorkbenchToolProfile,
} from '../workbench/workbenchToolProfiles'
import {
	getWorkflowNodeMeta,
	adoptDuplicatedLlmBranch,
	duplicateLlmBranch,
	installCurrentFlow,
	installEditableLlmFlow,
	installMlflowWorkflow,
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

const PRODUCT_PALETTE_TEMPLATE_ID = 'product-planning-palette'

function insertProductArtifact(
	editor: Editor,
	tool: ProductArtifactPaletteTool
): void {
	const shapeId = createShapeId()
	const nonce = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
	const instanceId = `wb-product-${tool.id}-${nonce}`
	const center = editor.getViewportPageBounds().center

	editor.markHistoryStoppingPoint(`Create ${tool.label}`)
	editor.createShape({
		id: shapeId,
		type: 'geo',
		x: center.x - tool.shape.w / 2,
		y: center.y - tool.shape.h / 2,
		props: {
			geo: tool.shape.geo,
			w: tool.shape.w,
			h: tool.shape.h,
			color: tool.shape.color,
			labelColor: 'black',
			fill: tool.shape.fill,
			dash: tool.shape.dash,
			size: 's',
			font: 'sans',
			align: 'middle',
			verticalAlign: 'middle',
			richText: toRichText(tool.label),
		},
		meta: {
			workbench: {
				schema: 'workbench-native-shape/v1',
				instanceId,
				pack: 'product',
				templateId: PRODUCT_PALETTE_TEMPLATE_ID,
				artifact: {
					schema: 'workbench-artifact/v1',
					artifactId: `product:palette:${tool.id}:${nonce}`,
					pack: 'product',
					kind: tool.kind,
					...(tool.artifactRole ? { role: tool.artifactRole } : {}),
					title: tool.label,
					status: tool.status,
					templateId: PRODUCT_PALETTE_TEMPLATE_ID,
				},
			},
		},
	})
	editor.setSelectedShapes([shapeId])
}

export function WorkflowOverlay({
	profile,
}: {
	profile: WorkbenchToolProfile
}) {
	const editor = useEditor()
	const currentToolId = useValue(
		'workflow current tool',
		() => editor.getCurrentToolId(),
		[editor]
	)
	const selectedNode = useValue(
		'selected workflow node',
		() => editor.getSelectedShapes().find(isWorkflowNode) ?? null,
		[editor]
	)
	const [message, setMessage] = useState('READY')
	const [running, setRunning] = useState(false)
	const [paletteOpen, setPaletteOpen] = useState(false)

	useEffect(() => {
		if (profile.mode !== 'workflow') return
		const stop = editor.store.listen(
			({ changes }) => {
				for (const record of Object.values(changes.added)) {
					if (
						!isWorkflowNode(record) ||
						getWorkflowNodeMeta(record).kind !== 'llm'
					)
						continue
					queueMicrotask(() => adoptDuplicatedLlmBranch(editor, record))
				}
			},
			{ scope: 'document', source: 'user' }
		)
		return stop
	}, [editor, profile.mode])

	const selectedWorkflowId = selectedNode
		? getWorkflowNodeMeta(selectedNode).workflowId
		: null
	const runnableWorkflowId = useMemo(() => {
		if (selectedWorkflowId && selectedWorkflowId !== 'current-ml-intern-flow')
			return selectedWorkflowId
		const candidate = [...editor.getCurrentPageShapes()]
			.reverse()
			.find(
				(shape) =>
					isWorkflowNode(shape) &&
					getWorkflowNodeMeta(shape).mode === 'editable' &&
					getWorkflowNodeMeta(shape).workflowId.startsWith('candidate-')
			)
		return candidate && isWorkflowNode(candidate)
			? getWorkflowNodeMeta(candidate).workflowId
			: null
	}, [editor, selectedWorkflowId, selectedNode])

	const createCurrent = useCallback(() => {
		const result = installCurrentFlow(editor)
		setMessage(
			result.created
				? 'CURRENT FLOW CREATED (READ ONLY)'
				: 'CURRENT FLOW SELECTED'
		)
		setPaletteOpen(false)
	}, [editor])

	const createCandidate = useCallback(() => {
		const result = installEditableLlmFlow(editor)
		setMessage(`NEW FLOW: ${result.workflowId}`)
		setPaletteOpen(false)
	}, [editor])

	const createMlflow = useCallback(() => {
		const result = installMlflowWorkflow(editor)
		setMessage(`MLFLOW FLOW: ${result.workflowId}`)
		setPaletteOpen(false)
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
			setMessage(
				error instanceof Error ? `FAILED: ${error.message}` : 'WORKFLOW FAILED'
			)
		} finally {
			setRunning(false)
		}
	}, [editor, runnableWorkflowId])

	const stop = useCallback(() => {
		stopWorkflow(editor)
		setRunning(false)
		setMessage('WORKFLOW CANCELLED')
	}, [editor])
	const activatePaletteTool = useCallback(
		(tool: WorkbenchPaletteTool) => {
			switch (tool.action) {
				case 'select-workflow-tool':
					editor.setCurrentTool(tool.toolId)
					setPaletteOpen(false)
					return
				case 'select-native-tool':
					editor.setCurrentTool(tool.toolId)
					setMessage('DRAW DEPENDENCY')
					setPaletteOpen(false)
					return
				case 'insert-product-artifact':
					insertProductArtifact(editor, tool)
					setMessage(`${tool.label.toUpperCase()} CREATED`)
					setPaletteOpen(false)
					return
			}
		},
		[editor]
	)
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
				className={`workflow-palette${paletteOpen ? ' is-open' : ''}`}
				onPointerDown={(event) => event.stopPropagation()}
				onClick={(event) => event.stopPropagation()}
			>
				<TldrawUiPopover
					id={`workflow-palette-${profile.id}`}
					open={paletteOpen}
					onOpenChange={setPaletteOpen}
				>
					<TldrawUiTooltip
						content={profile.label}
						side="right"
						sideOffset={8}
						delayDuration={350}
					>
						<TldrawUiPopoverTrigger>
							<TldrawUiButton
								type="tool"
								className="workflow-palette-toggle"
								isActive={paletteOpen}
								aria-label={profile.label}
								aria-expanded={paletteOpen}
								title={message}
							>
								<WorkflowIcon name={profile.mode === 'workflow' ? 'new' : 'map'} />
								<span
									className={`workflow-status-dot is-${statusTone}`}
									aria-hidden="true"
								/>
							</TldrawUiButton>
						</TldrawUiPopoverTrigger>
					</TldrawUiTooltip>
					<TldrawUiPopoverContent
						side="right"
						align="start"
						sideOffset={8}
						collisionPadding={8}
					>
						<TldrawUiToolbar
							className="workflow-toolbar"
							label={profile.label}
							orientation="grid"
							tooltipSide="right"
						>
							{profile.mode === 'workflow' && (
								<>
									<WorkflowToolButton
										icon="map"
										label="Текущий flow — только чтение"
										onClick={createCurrent}
									/>
									<WorkflowToolButton
										icon="new"
										label="Новый TEXT → PROMPT → LLM → OUTPUT"
										onClick={createCandidate}
									/>
									<WorkflowToolButton
										icon="mlflow-experiment"
										label="Новый MLflow evaluation flow"
										onClick={createMlflow}
									/>
									<div className="workflow-toolbar-divider" />
								</>
							)}
							{profile.tools.map((tool) => (
								<WorkflowToolButton
									key={tool.id}
									icon={tool.icon}
									label={tool.label}
									active={
										(tool.action === 'select-workflow-tool' ||
											tool.action === 'select-native-tool') &&
										currentToolId === tool.toolId
									}
									onClick={() => activatePaletteTool(tool)}
								/>
							))}
							{profile.mode === 'workflow' && (
								<>
									<WorkflowToolButton
										icon="link"
										label="Соединить ноды"
										active={currentToolId === 'arrow'}
										onClick={() => {
											editor.setCurrentTool('arrow')
											setPaletteOpen(false)
										}}
									/>
									<div className="workflow-toolbar-divider" />
									<WorkflowToolButton
										icon="play"
										label="Запустить workflow"
										active={running}
										onClick={play}
										disabled={running}
									/>
									<WorkflowToolButton
										icon="stop"
										label="Остановить"
										onClick={stop}
										disabled={!running}
									/>
									<div
										className={`workflow-toolbar-status is-${statusTone}`}
										role="status"
										title={message}
									>
										<span className="workflow-status-dot" />
										<span className="workflow-sr-only">{message}</span>
									</div>
								</>
							)}
						</TldrawUiToolbar>
					</TldrawUiPopoverContent>
				</TldrawUiPopover>
			</div>
			{profile.mode === 'workflow' && selectedNode && (
				<WorkflowInspector key={selectedNode.id} shape={selectedNode} />
			)}
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
		<TldrawUiToolbarButton
			type="tool"
			className="workflow-tool-button"
			title={label}
			tooltip={label}
			onClick={onClick}
			disabled={disabled}
			isActive={active}
			aria-pressed={active}
		>
			<WorkflowIcon name={icon} />
		</TldrawUiToolbarButton>
	)
}

function WorkflowSelect({
	id,
	label,
	value,
	options,
	disabled,
	onValueChange,
}: {
	id: string
	label: string
	value: string
	options: Array<{ value: string; label: string }>
	disabled?: boolean
	onValueChange: (value: string) => void
}) {
	const selectedLabel =
		options.find((option) => option.value === value)?.label ?? value
	return (
		<div className="workflow-inspector-field">
			<span>{label}</span>
			<TldrawUiSelect
				id={id}
				value={value}
				disabled={disabled}
				aria-label={label}
				onValueChange={onValueChange}
			>
				<TldrawUiSelectTrigger>
					<TldrawUiSelectValue placeholder={`Select ${label.toLowerCase()}`}>
						{selectedLabel}
					</TldrawUiSelectValue>
				</TldrawUiSelectTrigger>
				<TldrawUiSelectContent>
					{options.map((option) => (
						<TldrawUiSelectItem
							key={option.value || 'empty'}
							value={option.value}
							label={option.label}
						/>
					))}
				</TldrawUiSelectContent>
			</TldrawUiSelect>
		</div>
	)
}

function WorkflowInspector({ shape }: { shape: WorkflowNodeShape }) {
	const editor = useEditor()
	const meta = getWorkflowNodeMeta(shape)
	const [apiKey, setApiKey] = useState(getOpenRouterApiKey)
	const [models, setModels] = useState<OpenRouterModel[]>(
		getCachedOpenRouterModels
	)
	const [connectionStatus, setConnectionStatus] = useState(
		models.length ? `${models.length} MODELS` : 'NOT CONNECTED'
	)
	const [connecting, setConnecting] = useState(false)
	const initialBaseUrl = meta.config.baseUrl ?? 'http://127.0.0.1:11434/v1'
	const [compatibleBaseUrl, setCompatibleBaseUrl] = useState(initialBaseUrl)
	const [compatibleApiKey, setCompatibleApiKey] = useState(() =>
		getCompatibleApiKey(initialBaseUrl)
	)
	const [compatibleModels, setCompatibleModels] = useState<CompatibleModel[]>(
		() => getCachedCompatibleModels(initialBaseUrl)
	)
	const [compatibleStatus, setCompatibleStatus] = useState(
		compatibleModels.length
			? `${compatibleModels.length} MODELS`
			: 'NOT CONNECTED'
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
	const updateConfig = (key: string, value: string) =>
		updateConfigValues({ [key]: value })
	const provider =
		meta.config.provider ??
		(meta.config.model?.includes('/') ? 'openrouter' : 'builtin')
	const loadOpenRouterModels = async (candidateKey = apiKey) => {
		setConnecting(true)
		setConnectionStatus('CONNECTING…')
		try {
			const nextModels = await connectOpenRouter(candidateKey)
			setApiKey(candidateKey.trim())
			setModels(nextModels)
			setConnectionStatus(`${nextModels.length} MODELS`)
			if (
				provider === 'openrouter' &&
				!nextModels.some((model) => model.id === meta.config.model)
			) {
				updateConfig('model', nextModels[0].id)
			}
		} catch (error) {
			setConnectionStatus(
				error instanceof Error ? error.message : 'OPENROUTER CONNECTION FAILED'
			)
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
			const nextModels = await connectCompatibleProvider(
				compatibleBaseUrl,
				compatibleApiKey
			)
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
				error instanceof Error
					? error.message
					: 'OPENAI-COMPATIBLE CONNECTION FAILED'
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
			className="tlui-menu workflow-inspector"
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
						onChange={(event) =>
							updateConfig('value', event.currentTarget.value)
						}
					/>
				</label>
			)}
			{meta.kind === 'prompt-template' && (
				<>
					<label>
						TEMPLATE
						<textarea
							value={meta.config.template ?? ''}
							disabled={meta.readonly}
							onChange={(event) =>
								updateConfig('template', event.currentTarget.value)
							}
						/>
					</label>
					<div className="workflow-inspector-field">
						<span>INPUT VARIABLE</span>
						<TldrawUiInput
							value={meta.config.inputVariable ?? 'input'}
							disabled={meta.readonly}
							aria-label="Prompt input variable"
							onValueChange={(value) => updateConfig('inputVariable', value)}
						/>
					</div>
				</>
			)}
			{meta.kind === 'llm' && (
				<>
					<label>
						INSTRUCTIONS
						<textarea
							value={meta.config.instructions ?? ''}
							disabled={meta.readonly}
							onChange={(event) =>
								updateConfig('instructions', event.currentTarget.value)
							}
						/>
					</label>
					<WorkflowSelect
						id={`workflow-provider-${shape.id}`}
						label="PROVIDER"
						value={provider}
						disabled={meta.readonly}
						options={[
							{ value: 'openrouter', label: 'OpenRouter' },
							{ value: 'compatible', label: 'OpenAI-compatible Base URL' },
							{ value: 'builtin', label: 'Built-in API provider' },
						]}
						onValueChange={(nextProvider) => {
							updateConfigValues({
								provider: nextProvider,
								model:
									nextProvider === 'builtin'
										? 'claude-sonnet-4-5'
										: nextProvider === 'openrouter'
											? (models[0]?.id ?? '')
											: (compatibleModels[0]?.id ?? ''),
								...(nextProvider === 'compatible'
									? { baseUrl: compatibleBaseUrl }
									: {}),
							})
						}}
					/>
					{provider === 'builtin' && (
						<WorkflowSelect
							id={`workflow-builtin-model-${shape.id}`}
							label="MODEL"
							value={meta.config.model ?? 'claude-sonnet-4-5'}
							disabled={meta.readonly}
							options={[
								{ value: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
								{ value: 'claude-opus-4-5', label: 'Claude Opus 4.5' },
								{ value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash' },
								{ value: 'gpt-5.2-2025-12-11', label: 'GPT-5.2' },
							]}
							onValueChange={(value) => updateConfig('model', value)}
						/>
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
								<TldrawUiButton
									type="primary"
									onClick={() => void loadOpenRouterModels()}
									disabled={meta.readonly || connecting || !apiKey.trim()}
								>
									{connecting ? 'CONNECTING…' : 'CONNECT + LOAD MODELS'}
								</TldrawUiButton>
								<TldrawUiButton
									type="normal"
									onClick={disconnectOpenRouter}
									disabled={meta.readonly || (!apiKey && !models.length)}
								>
									CLEAR
								</TldrawUiButton>
							</div>
							<small
								className={
									connectionStatus.includes('MODELS') ? 'is-connected' : ''
								}
							>
								{connectionStatus}
							</small>
							<small>Key stays in sessionStorage for this tab only.</small>
							{models.length ? (
								<WorkflowSelect
									id={`workflow-openrouter-model-${shape.id}`}
									label="OPENROUTER MODEL"
									value={meta.config.model ?? models[0].id}
									disabled={meta.readonly}
									options={models.map((model) => ({
										value: model.id,
										label: formatOpenRouterModelLabel(model),
									}))}
									onValueChange={(value) => updateConfig('model', value)}
								/>
							) : (
								<div className="workflow-inspector-field">
									<span>OPENROUTER MODEL</span>
									<TldrawUiInput
										value="Connect to load models"
										disabled
										aria-label="OpenRouter model"
									/>
								</div>
							)}
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
									onChange={(event) =>
										setCompatibleApiKey(event.currentTarget.value)
									}
									onKeyDown={(event) => {
										if (event.key === 'Enter') void loadCompatibleModels()
									}}
								/>
							</label>
							<div className="workflow-openrouter-actions">
								<TldrawUiButton
									type="primary"
									onClick={() => void loadCompatibleModels()}
									disabled={
										meta.readonly ||
										compatibleConnecting ||
										!compatibleBaseUrl.trim()
									}
								>
									{compatibleConnecting
										? 'CONNECTING…'
										: 'CONNECT + LOAD MODELS'}
								</TldrawUiButton>
								<TldrawUiButton
									type="normal"
									onClick={disconnectCompatible}
									disabled={
										meta.readonly ||
										(!compatibleApiKey && !compatibleModels.length)
									}
								>
									CLEAR
								</TldrawUiButton>
							</div>
							<small
								className={
									compatibleStatus.includes('MODELS') ? 'is-connected' : ''
								}
							>
								{compatibleStatus}
							</small>
							<small>
								Key stays in sessionStorage; Base URL and model stay on the
								node.
							</small>
							<label>
								MODEL ID
								<input
									list={`compatible-models-${shape.id}`}
									value={meta.config.model ?? ''}
									placeholder="e.g. llama3.2"
									disabled={meta.readonly}
									onChange={(event) =>
										updateConfig('model', event.currentTarget.value)
									}
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
					<TldrawUiButton
						type="low"
						className="workflow-duplicate-branch"
						disabled={meta.readonly}
						onClick={() => duplicateLlmBranch(editor, shape)}
					>
						DUPLICATE AS PARALLEL MODEL
					</TldrawUiButton>
				</>
			)}
			{meta.kind === 'agent' && (
				<>
					<WorkflowSelect
						id={`workflow-agent-provider-${shape.id}`}
						label="AGENT PROVIDER"
						value={meta.config.agentProvider ?? 'amp'}
						disabled={meta.readonly}
						options={[{ value: 'amp', label: 'Amp' }]}
						onValueChange={(value) => updateConfig('agentProvider', value)}
					/>
					<label>
						INSTRUCTIONS
						<textarea
							value={meta.config.instructions ?? ''}
							disabled={meta.readonly}
							onChange={(event) =>
								updateConfig('instructions', event.currentTarget.value)
							}
						/>
					</label>
				</>
			)}
			{meta.kind === 'context' && (
				<div className="workflow-rich-output-inspector">
					<strong>BOUNDED CANVAS CONTEXT</strong>
					<p>
						Use the buttons inside the node to pick explicit shapes or one
						target area.
					</p>
				</div>
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
					<p>
						Resize the rectangle, expand JSON branches, or switch between saved
						runs inside it.
					</p>
					<small>
						{meta.config.latestRunId
							? `LATEST RUN ${meta.config.latestRunId.slice(0, 8)}`
							: 'NO SAVED RUN YET'}
					</small>
				</div>
			)}
			{meta.error && (
				<div className="workflow-inspector-error">{meta.error}</div>
			)}
		</div>
	)
}
