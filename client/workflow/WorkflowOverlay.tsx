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
import { installLeadAcquisitionExperimentCards } from '../experiments/experimentCanvas'
import {
	configureLlmModelSet,
	getWorkflowNodeMeta,
	adoptDuplicatedLlmBranch,
	duplicateLlmBranch,
	installCurrentFlow,
	installEditableLlmFlow,
	installMlflowWorkflow,
	installPromptExperimentWorkflow,
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

const builtinModels = [
	{ value: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
	{ value: 'claude-opus-4-5', label: 'Claude Opus 4.5' },
	{ value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash' },
	{ value: 'gpt-5.2-2025-12-11', label: 'GPT-5.2' },
]

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

	const createPromptExperiment = useCallback(() => {
		const result = installPromptExperimentWorkflow(editor)
		setMessage(`PROMPT EXPERIMENT: ${result.workflowId}`)
		setPaletteOpen(false)
	}, [editor])

	const createLeadExperiments = useCallback(() => {
		const result = installLeadAcquisitionExperimentCards(editor)
		setMessage(`LEAD EXPERIMENTS: ${result.count} CARDS`)
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
						side="bottom"
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
						side="bottom"
						align="center"
						sideOffset={8}
						collisionPadding={8}
					>
						<TldrawUiToolbar
							className="workflow-toolbar"
							label={profile.label}
							orientation="horizontal"
							tooltipSide="bottom"
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
										icon="experiment"
										label="Prompt Experiment Lab"
										onClick={createPromptExperiment}
									/>
									<WorkflowToolButton
										icon="experiment"
										label="Lead Acquisition Experiment Cards"
										onClick={createLeadExperiments}
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
	const [experimentModelSearch, setExperimentModelSearch] = useState('')
	const provider =
		meta.config.provider ??
		(meta.config.model?.includes('/') ? 'openrouter' : 'builtin')
	const currentProviderModels = useMemo(() => {
		switch (provider) {
			case 'openrouter':
				return models.map((model) => ({ value: model.id, label: formatOpenRouterModelLabel(model) }))
			case 'compatible':
				return compatibleModels.map((model) => ({ value: model.id, label: model.name || model.id }))
			default:
				return builtinModels
		}
	}, [provider, models, compatibleModels])
	const filteredExperimentModels = useMemo(() => {
		const query = experimentModelSearch.trim().toLowerCase()
		if (!query) return currentProviderModels
		return currentProviderModels.filter(
			(model) =>
				model.value.toLowerCase().includes(query) ||
				model.label.toLowerCase().includes(query)
		)
	}, [currentProviderModels, experimentModelSearch])
	const [selectedExperimentModels, setSelectedExperimentModels] = useState<string[]>([])
	useEffect(() => {
		setSelectedExperimentModels((previous) => {
			const available = new Set(currentProviderModels.map((model) => model.value))
			const kept = previous.filter((id) => available.has(id))
			const currentModel = meta.config.model ?? ''
			if (!kept.includes(currentModel) && available.has(currentModel)) return [...kept, currentModel]
			return kept
		})
	}, [currentProviderModels, meta.config.model])
	const experimentSampleConfig = useMemo(
		() => ({
			sampleCount: Math.max(1, Math.min(100, Number(meta.config.sampleCount ?? 1))),
			sampleConcurrency: Math.max(1, Math.min(8, Number(meta.config.sampleConcurrency ?? 1))),
			temperature: Math.max(0, Math.min(2, Number(meta.config.temperature ?? 0.7))),
			maxTokens: Math.max(256, Math.min(8192, Number(meta.config.maxTokens ?? 2048))),
			samplingSeed: meta.config.samplingSeed ? Number(meta.config.samplingSeed) : null,
		}),
		[
			meta.config.sampleCount,
			meta.config.sampleConcurrency,
			meta.config.temperature,
			meta.config.maxTokens,
			meta.config.samplingSeed,
		]
	)
	const applyModelSet = useCallback(() => {
		if (selectedExperimentModels.length === 0) return
		const result = configureLlmModelSet(
			editor,
			shape,
			selectedExperimentModels.map((model) => ({
				provider,
				model,
				...(provider === 'compatible' ? { baseUrl: compatibleBaseUrl } : {}),
			}))
		)
		for (const branchId of result.branchIds) {
			const branch = editor.getShape(branchId)
			if (!branch || !isWorkflowNode(branch)) continue
			const branchMeta = getWorkflowNodeMeta(branch)
			updateWorkflowNode(editor, branch, {
				status: 'idle',
				error: undefined,
				config: {
					...branchMeta.config,
					sampleCount: String(experimentSampleConfig.sampleCount),
					sampleConcurrency: String(experimentSampleConfig.sampleConcurrency),
					temperature: String(experimentSampleConfig.temperature),
					maxTokens: String(experimentSampleConfig.maxTokens),
					...(experimentSampleConfig.samplingSeed != null
						? { samplingSeed: String(experimentSampleConfig.samplingSeed) }
						: {}),
				},
			})
		}
	}, [
		editor,
		shape,
		selectedExperimentModels,
		provider,
		compatibleBaseUrl,
		experimentSampleConfig,
	])
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
							options={builtinModels}
							onValueChange={(value) => updateConfig('model', value)}
						/>
					)}
					{provider === 'openrouter' && (
						<div className="workflow-provider-connection">
							<label>
								OPENROUTER API KEY
								<input
									type="password"
									value={apiKey}
									autoComplete="off"
									disabled={meta.readonly || connecting}
									onChange={(event) => setApiKey(event.currentTarget.value)}
								/>
							</label>
							<div className="workflow-provider-actions">
								<TldrawUiButton
									type="primary"
									disabled={meta.readonly || connecting || !apiKey.trim()}
									onClick={() => void loadOpenRouterModels()}
								>
									{connecting ? 'CONNECTING…' : 'CONNECT + LOAD MODELS'}
								</TldrawUiButton>
								<TldrawUiButton type="low" onClick={disconnectOpenRouter} disabled={meta.readonly}>
									CLEAR
								</TldrawUiButton>
							</div>
							<small>{connectionStatus}</small>
							{models.length > 0 && (
								<WorkflowSelect
									id={`workflow-openrouter-model-${shape.id}`}
									label="MODEL"
									value={meta.config.model ?? models[0].id}
									disabled={meta.readonly}
									options={models.map((model) => ({ value: model.id, label: formatOpenRouterModelLabel(model) }))}
									onValueChange={(value) => updateConfig('model', value)}
								/>
							)}
						</div>
					)}
					{provider === 'compatible' && (
						<div className="workflow-provider-connection">
							<label>
								BASE URL
								<input
									type="url"
									value={compatibleBaseUrl}
									disabled={meta.readonly || compatibleConnecting}
									onChange={(event) => setCompatibleBaseUrl(event.currentTarget.value)}
								/>
							</label>
							<label>
								API KEY <span>(OPTIONAL)</span>
								<input
									type="password"
									value={compatibleApiKey}
									autoComplete="off"
									disabled={meta.readonly || compatibleConnecting}
									onChange={(event) => setCompatibleApiKey(event.currentTarget.value)}
								/>
							</label>
							<div className="workflow-provider-actions">
								<TldrawUiButton
									type="primary"
									disabled={meta.readonly || compatibleConnecting || !compatibleBaseUrl.trim()}
									onClick={() => void loadCompatibleModels()}
								>
									{compatibleConnecting ? 'CONNECTING…' : 'CONNECT + LOAD MODELS'}
								</TldrawUiButton>
								<TldrawUiButton type="low" onClick={disconnectCompatible} disabled={meta.readonly}>
									CLEAR
								</TldrawUiButton>
							</div>
							<small>{compatibleStatus}</small>
							{compatibleModels.length > 0 && (
								<WorkflowSelect
									id={`workflow-compatible-model-${shape.id}`}
									label="MODEL"
									value={meta.config.model ?? compatibleModels[0].id}
									disabled={meta.readonly}
									options={compatibleModels.map((model) => ({ value: model.id, label: model.name || model.id }))}
									onValueChange={(value) => updateConfig('model', value)}
								/>
							)}
						</div>
					)}
					<div className="workflow-experiment-controls">
						<span>PROMPT EXPERIMENT LAB</span>
						<div className="workflow-experiment-numeric">
							<label>
								SAMPLES / MODEL
								<input
									type="number"
									min={1}
									max={100}
									value={experimentSampleConfig.sampleCount}
									disabled={meta.readonly}
									onChange={(event) =>
										updateConfig('sampleCount', String(Math.max(1, Math.min(100, Number(event.currentTarget.value)))))
									}
								/>
							</label>
							<label>
								PARALLEL / MODEL
								<input
									type="number"
									min={1}
									max={8}
									value={experimentSampleConfig.sampleConcurrency}
									disabled={meta.readonly}
									onChange={(event) =>
										updateConfig('sampleConcurrency', String(Math.max(1, Math.min(8, Number(event.currentTarget.value)))))
									}
								/>
							</label>
							<label>
								TEMPERATURE
								<input
									type="number"
									min={0}
									max={2}
									step={0.1}
									value={experimentSampleConfig.temperature}
									disabled={meta.readonly}
									onChange={(event) =>
										updateConfig('temperature', String(Math.max(0, Math.min(2, Number(event.currentTarget.value)))))
									}
								/>
							</label>
							<label>
								MAX TOKENS
								<input
									type="number"
									min={256}
									max={8192}
									value={experimentSampleConfig.maxTokens}
									disabled={meta.readonly}
									onChange={(event) =>
										updateConfig('maxTokens', String(Math.max(256, Math.min(8192, Number(event.currentTarget.value)))))
									}
								/>
							</label>
							<label>
								SEED BASE <span>(OPTIONAL)</span>
								<input
									type="number"
									value={experimentSampleConfig.samplingSeed ?? ''}
									placeholder="random"
									disabled={meta.readonly}
									onChange={(event) => {
										const value = event.currentTarget.value.trim()
										updateConfig(
											'samplingSeed',
											value === '' ? '' : String(Number(value))
										)
									}}
								/>
							</label>
						</div>
						<div className="workflow-experiment-search">
							<span>MODEL SET</span>
							<input
								type="text"
								value={experimentModelSearch}
								placeholder="Search models…"
								disabled={meta.readonly}
								onChange={(event) =>
									setExperimentModelSearch(event.currentTarget.value)
								}
							/>
						</div>
						{filteredExperimentModels.length ? (
							<div className="workflow-experiment-model-list">
								{filteredExperimentModels.map((model) => {
									const isSelected =
										selectedExperimentModels.includes(model.value)
									return (
										<label key={model.value}>
											<input
												type="checkbox"
												checked={isSelected}
												disabled={meta.readonly}
												onChange={(event) => {
													setSelectedExperimentModels(
														(event.currentTarget.checked
															? [...selectedExperimentModels, model.value]
															: selectedExperimentModels.filter(
																	(id) => id !== model.value
															)
													).sort()
													)
												}}
											/>
											<span>{model.label}</span>
											<small>{model.value}</small>
										</label>
									)
								})}
							</div>
						) : (
							<div className="workflow-experiment-empty">
								No models match your search.
							</div>
						)}
						<TldrawUiButton
							type="primary"
							className="workflow-experiment-apply"
							disabled={
								meta.readonly || selectedExperimentModels.length === 0
							}
							onClick={applyModelSet}
						>
							APPLY MODEL SET
						</TldrawUiButton>
					</div>
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
