import { useCallback, useEffect, useState } from 'react'
import {
	TldrawUiButton,
	TldrawUiButtonIcon,
	TldrawUiPopover,
	TldrawUiPopoverContent,
	TldrawUiPopoverTrigger,
	TldrawUiTooltip,
	useEditor,
	useValue,
} from 'tldraw'
import type {
	StitchDeviceType,
	StitchProjectSummary,
	StitchProviderReference,
} from '../../shared/types/Stitch'
import {
	getDesignSystemSnapshot,
} from '../design-system/designSystemBridge'
import {
	isDesignSystemShape,
	readDesignSystemMeta,
} from '../design-system/DesignSystemShape'
import { getHtmlMockupSnapshot } from '../html-mockup/htmlMockupBridge'
import {
	createLocalHtmlMockupShape,
	isLocalHtmlMockupShape,
	readLocalHtmlMockupMeta,
	replaceLocalHtmlMockupDocument,
} from '../html-mockup/LocalHtmlMockupShape'
import {
	createStitchProject,
	editStitchScreen,
	generateStitchScreen,
	getStitchStatus,
	listStitchProjects,
} from './stitchBridge'

const DEVICE_OPTIONS: ReadonlyArray<{
	value: StitchDeviceType
	label: string
}> = [
	{ value: 'DESKTOP', label: 'Desktop' },
	{ value: 'MOBILE', label: 'Mobile' },
	{ value: 'TABLET', label: 'Tablet' },
	{ value: 'AGNOSTIC', label: 'Agnostic' },
]

export function StitchOverlay({ docked = false }: { docked?: boolean }) {
	const editor = useEditor()
	const selection = useValue(
		'selected Stitch or Design System context',
		() => {
			const shapes = editor.getSelectedShapes()
			if (shapes.length !== 1) {
				return { stitchShape: null, designSystemShape: null }
			}
			const shape = shapes[0]
			const htmlMeta = isLocalHtmlMockupShape(shape)
				? readLocalHtmlMockupMeta(shape)
				: null
			return {
				stitchShape:
					isLocalHtmlMockupShape(shape) &&
					htmlMeta?.provider?.schema === 'canvapocalypse-stitch-ref/v1'
						? shape
						: null,
				designSystemShape: isDesignSystemShape(shape) ? shape : null,
			}
		},
		[editor]
	)
	const [open, setOpen] = useState(false)
	const [configured, setConfigured] = useState<boolean | null>(null)
	const [projects, setProjects] = useState<StitchProjectSummary[]>([])
	const [projectRef, setProjectRef] = useState('')
	const [projectTitle, setProjectTitle] = useState('')
	const [prompt, setPrompt] = useState('')
	const [deviceType, setDeviceType] =
		useState<StitchDeviceType>('DESKTOP')
	const [status, setStatus] = useState('STITCH')
	const [busy, setBusy] = useState(false)

	const loadProvider = useCallback(async () => {
		setBusy(true)
		setStatus('CONNECTING…')
		try {
			const providerStatus = await getStitchStatus()
			setConfigured(providerStatus.configured)
			if (!providerStatus.configured) {
				setProjects([])
				setStatus('KEY REQUIRED')
				return
			}
			const next = await listStitchProjects()
			setProjects(next)
			const selectedMeta = selection.stitchShape
				? readLocalHtmlMockupMeta(selection.stitchShape)
				: null
			const preferred = selectedMeta?.provider?.projectRef
			setProjectRef((current) =>
				next.some((project) => project.projectRef === preferred)
					? preferred!
					: next.some((project) => project.projectRef === current)
						? current
						: (next[0]?.projectRef ?? '')
			)
			setStatus(`${next.length} PROJECTS`)
		} catch (error) {
			setStatus(error instanceof Error ? error.message : 'BRIDGE OFFLINE')
		} finally {
			setBusy(false)
		}
	}, [selection.stitchShape])

	useEffect(() => {
		if (open) void loadProvider()
	}, [loadProvider, open])

	const createProject = async () => {
		setBusy(true)
		setStatus('CREATING…')
		try {
			const result = await createStitchProject({
				title: projectTitle,
				idempotencyKey: createIdempotencyKey('project'),
			})
			setProjects((current) => [
				result.project,
				...current.filter(
					(project) => project.projectRef !== result.project.projectRef
				),
			])
			setProjectRef(result.project.projectRef)
			setProjectTitle('')
			setStatus('PROJECT READY')
		} catch (error) {
			setStatus(error instanceof Error ? error.message : 'CREATE FAILED')
		} finally {
			setBusy(false)
		}
	}

	const runOperation = async () => {
		const stitchShape = selection.stitchShape
		const stitchMeta = stitchShape
			? readLocalHtmlMockupMeta(stitchShape)
			: null
		const provider = stitchMeta?.provider
		const activeProjectRef = provider?.projectRef ?? projectRef
		if (!activeProjectRef || !prompt.trim()) {
			setStatus('PROJECT + PROMPT REQUIRED')
			return
		}
		setBusy(true)
		setStatus(provider ? 'EDITING…' : 'GENERATING…')
		try {
			let designSystem
			if (selection.designSystemShape) {
				const designMeta = readDesignSystemMeta(
					selection.designSystemShape
				)
				if (designMeta) {
					const snapshot = await getDesignSystemSnapshot(
						designMeta.documentRef,
						designMeta.revision
					)
					designSystem = snapshot.projection
				}
			}

			const result =
				provider && stitchMeta
					? await editStitchScreen({
							screenRef: provider.screenRef,
							prompt: prompt.trim(),
							deviceType,
							idempotencyKey: createIdempotencyKey('edit'),
							expectedRevision: stitchMeta.revision,
						})
					: await generateStitchScreen({
							projectRef: activeProjectRef,
							prompt: prompt.trim(),
							deviceType,
							idempotencyKey: createIdempotencyKey('generate'),
							...(designSystem ? { designSystem } : {}),
						})
			const snapshot = await getHtmlMockupSnapshot(
				result.document.documentRef
			)
			const providerRef: StitchProviderReference = {
				schema: 'canvapocalypse-stitch-ref/v1',
				projectRef: result.project.projectRef,
				screenRef: result.screen.screenRef,
			}
			const latest = stitchShape ? editor.getShape(stitchShape.id) : null
			if (latest && isLocalHtmlMockupShape(latest)) {
				replaceLocalHtmlMockupDocument(
					editor,
					latest,
					snapshot,
					providerRef
				)
			} else {
				createLocalHtmlMockupShape(editor, snapshot, providerRef)
			}
			setPrompt('')
			setStatus(`${result.receipt.operation.toUpperCase()} · SAVED`)
			setOpen(false)
			editor.menus.clearOpenMenus()
		} catch (error) {
			setStatus(error instanceof Error ? error.message : 'STITCH FAILED')
		} finally {
			setBusy(false)
		}
	}

	const isEdit = Boolean(selection.stitchShape)
	const hasDesignSystem = Boolean(selection.designSystemShape)

	return (
		<>
			<div
				className={`stitch-provider-toolbar${docked ? ' is-docked' : ''}`}
				onPointerDown={(event) => event.stopPropagation()}
				onClick={(event) => event.stopPropagation()}
			>
				<TldrawUiPopover
					id="stitch-provider-picker"
					open={open}
					onOpenChange={setOpen}
				>
					<TldrawUiTooltip
						content="Google Stitch"
						side="right"
						sideOffset={8}
						delayDuration={350}
					>
						<TldrawUiPopoverTrigger>
							<TldrawUiButton
								type="tool"
								className="stitch-provider-button"
								aria-label="Google Stitch"
								aria-expanded={open}
								isActive={open || isEdit}
							>
								<TldrawUiButtonIcon icon="spline-cubic" />
								{docked && (
									<span className="uiux-provider-label">Stitch</span>
								)}
							</TldrawUiButton>
						</TldrawUiPopoverTrigger>
					</TldrawUiTooltip>
					<TldrawUiPopoverContent
						side="bottom"
						align="start"
						sideOffset={8}
						collisionPadding={8}
					>
						<div
							className="stitch-provider-picker"
							onPointerDown={(event) => event.stopPropagation()}
							onClick={(event) => event.stopPropagation()}
						>
							<div className="stitch-picker-kicker">UI/UX PROVIDER</div>
							<div className="stitch-picker-title">
								<span>Google Stitch</span>
								<small>{status}</small>
							</div>
							<p className="stitch-picker-boundary">
								SDK and credentials stay in the loopback bridge. The
								canvas receives only a managed Local HTML artifact.
							</p>
							{configured === false ? (
								<div className="stitch-provider-empty">
									Configure Stitch credentials in the bridge environment,
									then restart the bridge.
								</div>
							) : (
								<>
									<label className="stitch-provider-field">
										<span>PROJECT</span>
										<select
											value={
												isEdit
													? (readLocalHtmlMockupMeta(
															selection.stitchShape!
														)?.provider?.projectRef ?? '')
													: projectRef
											}
											disabled={busy || isEdit}
											onChange={(event) =>
												setProjectRef(event.currentTarget.value)
											}
										>
											<option value="">Select a Stitch project</option>
											{projects.map((project) => (
												<option
													key={project.projectRef}
													value={project.projectRef}
												>
													{project.title}
												</option>
											))}
										</select>
									</label>
									{!isEdit && (
										<div className="stitch-create-project">
											<input
												value={projectTitle}
												maxLength={160}
												placeholder="New project title"
												disabled={busy}
												onChange={(event) =>
													setProjectTitle(event.currentTarget.value)
												}
											/>
											<TldrawUiButton
												type="normal"
												disabled={busy || !projectTitle.trim()}
												onClick={createProject}
											>
												<TldrawUiButtonIcon icon="plus" small />
												Create
											</TldrawUiButton>
										</div>
									)}
									<label className="stitch-provider-field">
										<span>{isEdit ? 'EDIT INSTRUCTION' : 'SCREEN PROMPT'}</span>
										<textarea
											value={prompt}
											maxLength={12_000}
											rows={5}
											placeholder={
												isEdit
													? 'Describe the selected screen change…'
													: 'Describe the UI screen to generate…'
											}
											disabled={busy}
											onChange={(event) =>
												setPrompt(event.currentTarget.value)
											}
										/>
									</label>
									<div className="stitch-provider-actions">
										<select
											value={deviceType}
											disabled={busy}
											aria-label="Stitch device type"
											onChange={(event) =>
												setDeviceType(
													event.currentTarget.value as StitchDeviceType
												)
											}
										>
											{DEVICE_OPTIONS.map((option) => (
												<option key={option.value} value={option.value}>
													{option.label}
												</option>
											))}
										</select>
										<TldrawUiButton
											type="normal"
											className="stitch-provider-run"
											disabled={
												busy ||
												!prompt.trim() ||
												(!isEdit && !projectRef)
											}
											onClick={runOperation}
										>
											{isEdit ? 'Edit selected screen' : 'Generate screen'}
										</TldrawUiButton>
									</div>
									{hasDesignSystem && !isEdit && (
										<div className="stitch-context-badge">
											DESIGN.md constraints attached
										</div>
									)}
								</>
							)}
						</div>
					</TldrawUiPopoverContent>
				</TldrawUiPopover>
			</div>
			<span
				className="workflow-sr-only"
				role="status"
				aria-live="polite"
				aria-atomic="true"
			>
				{status}
			</span>
		</>
	)
}

function createIdempotencyKey(operation: string): string {
	const suffix =
		globalThis.crypto?.randomUUID?.() ??
		`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
	return `stitch:${operation}:${suffix}`.slice(0, 128)
}
