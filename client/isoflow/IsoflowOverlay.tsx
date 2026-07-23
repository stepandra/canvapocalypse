import { useCallback, useEffect, useState } from 'react'
import { TLEmbedShape, TldrawUiTooltip, useEditor, useValue } from 'tldraw'
import {
	connectOpenRouter,
	formatOpenRouterModelLabel,
	getCachedOpenRouterModels,
	getOpenRouterApiKey,
	OpenRouterModel,
} from '../workflow/openRouter'
import {
	applyIsoflowCreateViewAction,
	applyIsoflowPatchAction,
} from './isoflowAgentActions'
import {
	IsoflowAgentProvider,
	runIsoflowAgent,
} from './isoflowAgentConsole'
import { getIsoflowHealth, getIsoflowView, IsoflowCompactView } from './isoflowBridge'
import {
	createIsoflowEmbed,
	ISOFLOW_ORIGIN,
	ISOFLOW_PROJECTS,
	isIsoflowEmbedShape,
	readIsoflowEmbedMeta,
	updateIsoflowEmbedView,
} from './isoflowProvider'

export function IsoflowOverlay() {
	const editor = useEditor()
	const selected = useValue(
		'selected Isoflow embed',
		() => editor.getSelectedShapes().find(isIsoflowEmbedShape) ?? null,
		[editor]
	)
	const [pickerOpen, setPickerOpen] = useState(false)
	const [status, setStatus] = useState('ISOFLOW')
	const [creating, setCreating] = useState(false)

	const createProject = useCallback(
		async (projectId: string, preferredViewId?: string) => {
			setCreating(true)
			setStatus('CONNECTING…')
			try {
				const view = await getIsoflowView(ISOFLOW_ORIGIN, projectId, preferredViewId)
				createIsoflowEmbed(editor, {
					projectId,
					viewId: view.view.id,
				})
				setStatus(`r${view.revision}`)
				setPickerOpen(false)
			} catch (error) {
				setStatus(error instanceof Error ? error.message : 'ISOFLOW OFFLINE')
			} finally {
				setCreating(false)
			}
		},
		[editor]
	)

	useEffect(() => {
		let cancelled = false
		const refreshHealth = () =>
			getIsoflowHealth(ISOFLOW_ORIGIN)
				.then(() => {
					if (!cancelled) setStatus((value) => (value.startsWith('r') ? value : 'BRIDGE ONLINE'))
				})
				.catch(() => {
					if (!cancelled) setStatus('BRIDGE OFFLINE')
				})
		refreshHealth()
		const timer = window.setInterval(refreshHealth, 3000)
		return () => {
			cancelled = true
			window.clearInterval(timer)
		}
	}, [])

	return (
		<>
			<div
				className="isoflow-provider-toolbar"
				onPointerDown={(event) => event.stopPropagation()}
				onClick={(event) => event.stopPropagation()}
			>
				<TldrawUiTooltip content="Isoflow embeds" side="right" sideOffset={8} delayDuration={350}>
					<button
						type="button"
						className="workflow-tool-button isoflow-provider-button"
						aria-label="Isoflow embeds"
						aria-expanded={pickerOpen}
						data-active={pickerOpen || selected ? true : undefined}
						onClick={() => setPickerOpen((value) => !value)}
					>
						<IsoflowMark />
					</button>
				</TldrawUiTooltip>
				<span className="workflow-sr-only" role="status">
					{status}
				</span>
			</div>
			{pickerOpen && (
				<div
					className="isoflow-provider-picker"
					onPointerDown={(event) => event.stopPropagation()}
					onClick={(event) => event.stopPropagation()}
				>
					<div className="isoflow-picker-kicker">EMBED PROVIDER</div>
					<div className="isoflow-picker-title">
						<span>Isoflow</span>
						<small>{status}</small>
					</div>
					<div className="isoflow-picker-section">SOURCE DIAGRAMS</div>
					{ISOFLOW_PROJECTS.map((project) => (
						<button
							type="button"
							key={project.id}
							disabled={creating}
							onClick={() =>
								createProject(
									project.id,
									'preferredViewId' in project ? project.preferredViewId : undefined
								)
							}
						>
							<strong>{project.label}</strong>
							<span>{project.description}</span>
						</button>
					))}
				</div>
			)}
			{selected && <IsoflowInspector key={selected.id} shape={selected} />}
		</>
	)
}

function IsoflowInspector({ shape }: { shape: TLEmbedShape }) {
	const editor = useEditor()
	const meta = readIsoflowEmbedMeta(shape)!
	const [view, setView] = useState<IsoflowCompactView | null>(null)
	const [status, setStatus] = useState('LOADING')

	useEffect(() => {
		let cancelled = false
		const refresh = () =>
			getIsoflowView(meta.baseUrl, meta.projectId, meta.viewId)
				.then((next) => {
					if (cancelled) return
					setView(next)
					setStatus(`BRIDGE r${next.revision}`)
				})
				.catch((error) => {
					if (!cancelled) setStatus(error instanceof Error ? error.message : 'BRIDGE OFFLINE')
				})
		refresh()
		const timer = window.setInterval(refresh, 1500)
		return () => {
			cancelled = true
			window.clearInterval(timer)
		}
	}, [meta.baseUrl, meta.projectId, meta.viewId])

	return (
		<div
			className="isoflow-inspector"
			onPointerDown={(event) => event.stopPropagation()}
			onClick={(event) => event.stopPropagation()}
		>
			<div className="isoflow-inspector-head">
				<span>
					<IsoflowMark /> ISOFLOW
				</span>
				<small>{status}</small>
			</div>
			<label>
				<span>PROJECT</span>
				<input value={meta.projectId} readOnly />
			</label>
			<label>
				<span>VIEW</span>
				<select
					value={meta.viewId}
					onChange={(event) => updateIsoflowEmbedView(editor, shape, event.target.value)}
				>
					{(view?.views ?? [{ id: meta.viewId, name: meta.viewId }]).map((candidate) => (
						<option key={candidate.id} value={candidate.id}>
							{candidate.name}
						</option>
					))}
				</select>
			</label>
			<div className="isoflow-inspector-metrics">
				<span>
					<strong>{view?.items.length ?? '—'}</strong> NODES
				</span>
				<span>
					<strong>{view?.view.connectors.length ?? '—'}</strong> LINKS
				</span>
				<span>
					<strong>{view?.revision ?? '—'}</strong> REV
				</span>
			</div>
			<p>Select this embed before chatting. The sidebar agent receives this view only.</p>
			{view && <IsoflowAgentControls shape={shape} view={view} />}
		</div>
	)
}

function IsoflowAgentControls({
	shape,
	view,
}: {
	shape: TLEmbedShape
	view: IsoflowCompactView
}) {
	const editor = useEditor()
	const [provider, setProvider] = useState<IsoflowAgentProvider>('amp-medium')
	const [models, setModels] = useState<OpenRouterModel[]>(() =>
		getCachedOpenRouterModels().filter(isGrokModel)
	)
	const [model, setModel] = useState(() => models[0]?.id ?? '')
	const [prompt, setPrompt] = useState('')
	const [status, setStatus] = useState('Ready')
	const [running, setRunning] = useState(false)

	const chooseProvider = async (next: IsoflowAgentProvider) => {
		setProvider(next)
		setStatus('Ready')
		if (next !== 'openrouter') return
		try {
			const key = getOpenRouterApiKey()
			if (!key) throw new Error('Connect OpenRouter in an LLM node first')
			const nextModels = (models.length ? models : await connectOpenRouter(key)).filter(isGrokModel)
			if (!nextModels.length) throw new Error('OpenRouter returned no Grok text models')
			setModels(nextModels)
			setModel((current) =>
				nextModels.some((candidate) => candidate.id === current) ? current : nextModels[0].id
			)
		} catch (error) {
			setStatus(error instanceof Error ? error.message : 'OpenRouter unavailable')
		}
	}

	const run = async () => {
		if (!prompt.trim() || running) return
		setRunning(true)
		setStatus('Thinking…')
		try {
			const result = await runIsoflowAgent({
				provider,
				model,
				apiKey: provider === 'openrouter' ? getOpenRouterApiKey() : undefined,
				userPrompt: prompt,
				view,
			})
			let applied = 0
			for (const action of result.actions) {
				if (action.projectId && action.projectId !== view.projectId) {
					throw new Error(`Agent targeted another project: ${action.projectId}`)
				}
				if (action._type === 'isoflowPatch') {
					await applyIsoflowPatchAction(shape, action, `canvapocalypse-console:${provider}`)
				} else {
					await applyIsoflowCreateViewAction(
						editor,
						shape,
						action,
						`canvapocalypse-console:${provider}`
					)
				}
				applied++
			}
			setStatus(`${result.message}${applied ? ` · ${applied} action${applied === 1 ? '' : 's'}` : ''}`)
		} catch (error) {
			setStatus(error instanceof Error ? error.message : 'Agent run failed')
		} finally {
			setRunning(false)
		}
	}

	return (
		<details className="isoflow-agent-controls">
			<summary>AMP / GROK CONTROL</summary>
			<label>
				<span>MODEL</span>
				<select
					value={provider}
					disabled={running}
					onChange={(event) =>
						void chooseProvider(event.target.value as IsoflowAgentProvider)
					}
				>
					<option value="amp-low">Amp Low</option>
					<option value="amp-medium">Amp Medium</option>
					<option value="amp-high">Amp High</option>
					<option value="amp-ultra">Amp Ultra</option>
					<option value="openrouter">Grok via OpenRouter</option>
				</select>
			</label>
			{provider === 'openrouter' && (
				<label>
					<span>GROK</span>
					<select value={model} onChange={(event) => setModel(event.target.value)}>
						{models.map((candidate) => (
							<option key={candidate.id} value={candidate.id}>
								{formatOpenRouterModelLabel(candidate)}
							</option>
						))}
					</select>
				</label>
			)}
			<textarea
				value={prompt}
				disabled={running}
				placeholder="Ask about this view or tell the model what to change…"
				onChange={(event) => setPrompt(event.target.value)}
			/>
			<div className="isoflow-agent-run">
				<small>{status}</small>
				<button type="button" disabled={running || !prompt.trim()} onClick={() => void run()}>
					{running ? 'RUNNING…' : 'RUN'}
				</button>
			</div>
		</details>
	)
}

function isGrokModel(model: OpenRouterModel) {
	return model.id.toLowerCase().includes('grok')
}

function IsoflowMark() {
	return (
		<svg viewBox="0 0 24 24" aria-hidden="true">
			<path
				d="m4 7.2 8-4.4 8 4.4-8 4.5-8-4.5Zm0 5.1 8 4.5 8-4.5M4 17.4l8 4.4 8-4.4"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.8"
				strokeLinejoin="round"
			/>
			<circle cx="4" cy="12.3" r="1.4" fill="currentColor" />
			<circle cx="20" cy="12.3" r="1.4" fill="currentColor" />
		</svg>
	)
}
