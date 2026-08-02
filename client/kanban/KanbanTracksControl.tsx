import { useCallback, useEffect, useMemo, useState } from 'react'
import {
	TldrawUiButton,
	TldrawUiButtonIcon,
	TldrawUiButtonLabel,
	TldrawUiDropdownMenuContent,
	TldrawUiDropdownMenuRoot,
	TldrawUiDropdownMenuTrigger,
	TldrawUiToolbarButton,
	useEditor,
} from 'tldraw'
import {
	DEFAULT_KANBAN_RUNTIME_ORIGIN,
	KanbanTracksProvider,
} from './KanbanTracksProvider'
import { syncKanbanTracksProjection } from './kanbanTracksCanvas'

const RUNTIME_ORIGIN_STORAGE_KEY =
	'canvapocalypse:kanban-tracks-runtime-origin'

function readRuntimeOrigin() {
	try {
		return (
			window.localStorage.getItem(RUNTIME_ORIGIN_STORAGE_KEY) ??
			DEFAULT_KANBAN_RUNTIME_ORIGIN
		)
	} catch {
		return DEFAULT_KANBAN_RUNTIME_ORIGIN
	}
}

export function KanbanTracksControl() {
	const editor = useEditor()
	const [runtimeOrigin, setRuntimeOrigin] = useState(readRuntimeOrigin)
	const [projects, setProjects] = useState<
		Awaited<ReturnType<KanbanTracksProvider['listProjects']>>['projects']
	>([])
	const [currentProjectRef, setCurrentProjectRef] = useState<string | null>(
		null
	)
	const [status, setStatus] = useState('Connect to Kanban')
	const [busy, setBusy] = useState(false)
	const provider = useMemo(
		() => new KanbanTracksProvider(runtimeOrigin),
		[runtimeOrigin]
	)

	useEffect(() => {
		try {
			window.localStorage.setItem(
				RUNTIME_ORIGIN_STORAGE_KEY,
				runtimeOrigin
			)
		} catch {
			// Persistence is optional; the live provider remains usable.
		}
	}, [runtimeOrigin])

	const connect = useCallback(async () => {
		setBusy(true)
		setStatus('Connecting…')
		try {
			const listing = await provider.listProjects()
			setProjects(listing.projects)
			setCurrentProjectRef(listing.currentProjectRef)
			setStatus(
				listing.projects.length > 0
					? `${listing.projects.length} projects`
					: 'No Kanban projects'
			)
		} catch (error) {
			setProjects([])
			setStatus(error instanceof Error ? error.message : String(error))
		} finally {
			setBusy(false)
		}
	}, [provider])

	const syncProject = useCallback(
		async (projectRef: string, name: string) => {
			setBusy(true)
			setStatus(`Reading ${name}…`)
			try {
				const projection = await provider.inspectTracks(projectRef)
				const receipt = syncKanbanTracksProjection(editor, projection)
				setCurrentProjectRef(projectRef)
				setStatus(
					`r${receipt.revision}: ${receipt.createdIds.length} new, ${receipt.updatedIds.length} refreshed`
				)
			} catch (error) {
				setStatus(error instanceof Error ? error.message : String(error))
			} finally {
				setBusy(false)
			}
		},
		[editor, provider]
	)

	return (
		<TldrawUiDropdownMenuRoot id="kanban-tracks-provider">
			<TldrawUiDropdownMenuTrigger>
				<TldrawUiToolbarButton
					type="icon"
					className="kanban-tracks-trigger"
					title="Import or refresh the read-only Kanban track projection"
				>
					<TldrawUiButtonIcon icon="pack" small />
					<TldrawUiButtonLabel>Kanban Tracks</TldrawUiButtonLabel>
				</TldrawUiToolbarButton>
			</TldrawUiDropdownMenuTrigger>
			<TldrawUiDropdownMenuContent
				className="kanban-tracks-panel"
				side="bottom"
				align="end"
				sideOffset={8}
				collisionPadding={8}
			>
				<header>
					<strong>Kanban Tracks</strong>
					<span>Read-only lanes and milestones</span>
				</header>
				<label>
					<span>Runtime URL</span>
					<input
						value={runtimeOrigin}
						onChange={(event) => setRuntimeOrigin(event.target.value)}
						onClick={(event) => event.stopPropagation()}
						onKeyDown={(event) => event.stopPropagation()}
						spellCheck={false}
						aria-label="Kanban runtime URL"
					/>
				</label>
				<TldrawUiButton
					type="normal"
					className="kanban-tracks-connect"
					disabled={busy}
					onClick={connect}
				>
					<TldrawUiButtonLabel>
						{projects.length > 0 ? 'Reload projects' : 'Connect'}
					</TldrawUiButtonLabel>
				</TldrawUiButton>
				<div className="kanban-tracks-projects">
					{projects.map((project) => (
						<button
							key={project.projectRef}
							type="button"
							disabled={busy}
							data-current={project.projectRef === currentProjectRef}
							onClick={() =>
								void syncProject(project.projectRef, project.name)
							}
						>
							<span>
								<strong>{project.name}</strong>
								<small>
									{project.taskCounts.in_progress} running ·{' '}
									{project.taskCounts.review} review ·{' '}
									{project.taskCounts.trash} accepted
								</small>
							</span>
							<b>Import / refresh</b>
						</button>
					))}
				</div>
				<p role="status" aria-live="polite" title={status}>
					{status}
				</p>
			</TldrawUiDropdownMenuContent>
		</TldrawUiDropdownMenuRoot>
	)
}
