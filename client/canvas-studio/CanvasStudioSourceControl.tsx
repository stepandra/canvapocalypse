import { useState } from 'react'
import {
	Box,
	createShapeId,
	TldrawUiButton,
	TldrawUiButtonLabel,
	TldrawUiIcon,
	TldrawUiPopover,
	TldrawUiPopoverContent,
	TldrawUiPopoverTrigger,
	TldrawUiToolbarButton,
} from 'tldraw'
import type { TldrawAgentApp } from '../agent/TldrawAgentApp'
import { applyCanvasPortalSource } from './portalSource'

export function CanvasStudioSourceControl({
	app,
	endpoint,
}: {
	app: TldrawAgentApp
	endpoint: string
}) {
	const [open, setOpen] = useState(false)
	const [path, setPath] = useState('diagrams/portal-demo.mmd')
	const [format, setFormat] = useState<'auto' | 'markdown' | 'mermaid' | 'structurizr'>('mermaid')
	const [busy, setBusy] = useState(false)
	const [status, setStatus] = useState('New sources use one bounded area centered on the current viewport.')

	const apply = async () => {
		if (busy) return
		setBusy(true)
		setStatus('Inspecting, compiling, and applying native records…')
		try {
			const receipt = await applyCanvasPortalSource({ app, endpoint, path: path.trim(), format })
			const bounds = Box.Common(receipt.plan.shapeIds.flatMap((id) => {
				const shape = app.editor.getShape(createShapeId(id))
				const shapeBounds = shape && app.editor.getShapePageBounds(shape)
				return shapeBounds ? [shapeBounds] : []
			}))
			if (bounds) {
				app.editor.zoomToBounds(bounds, { inset: 96, animation: { duration: app.editor.options.animationMediumMs } })
			}
			const summary = receipt.plan.summary
			setStatus(`Applied canvas.diagram/v1 · ${summary.create} create · ${summary.update} update · ${summary.delete} delete · ${summary.unchanged} unchanged`)
		} catch (error) {
			setStatus(error instanceof Error ? error.message : String(error))
		} finally {
			setBusy(false)
		}
	}

	return (
		<TldrawUiPopover id="canvas-studio-source" open={open} onOpenChange={setOpen}>
			<TldrawUiPopoverTrigger>
				<TldrawUiToolbarButton
					type="tool"
					className="workbench-rail-trigger canvas-studio-source-trigger"
					title="Canvas source diagrams"
					aria-label="Canvas source diagrams"
					aria-expanded={open}
				>
					<TldrawUiIcon icon="arrow-cycle" label="" />
				</TldrawUiToolbarButton>
			</TldrawUiPopoverTrigger>
			<TldrawUiPopoverContent side="right" align="start" sideOffset={8} collisionPadding={12} autoFocusFirstButton={false}>
				<section
					className="canvas-studio-source"
					aria-label="Canvas source diagrams"
					onPointerDown={(event) => event.stopPropagation()}
					onClick={(event) => event.stopPropagation()}
				>
					<header className="workbench-popover-header">
						<span className="workbench-popover-kicker">CANVAS SOURCE</span>
						<div className="workbench-popover-title">
							<strong>Native diagram import</strong>
							<span>Project-local source</span>
						</div>
						<p>Compile Mermaid, typed Markdown, or Structurizr through Canvas Studio and reconcile stable native shapes.</p>
					</header>
					<label className="canvas-studio-source-field">
						<span>Source path</span>
						<input value={path} onChange={(event) => setPath(event.currentTarget.value)} aria-label="Project-relative source path" />
					</label>
					<label className="canvas-studio-source-field">
						<span>Format</span>
						<select value={format} onChange={(event) => setFormat(event.currentTarget.value as typeof format)} aria-label="Canvas source format">
							<option value="auto">Auto</option>
							<option value="mermaid">Mermaid flowchart</option>
							<option value="markdown">Typed Markdown</option>
							<option value="structurizr">Structurizr DSL</option>
						</select>
					</label>
					<TldrawUiButton type="primary" className="canvas-studio-source-apply" disabled={busy || !path.trim()} onClick={() => void apply()}>
						<TldrawUiButtonLabel>{busy ? 'Applying…' : 'Apply source'}</TldrawUiButtonLabel>
					</TldrawUiButton>
					<div className="canvas-studio-status" role="status" aria-live="polite">{status}</div>
				</section>
			</TldrawUiPopoverContent>
		</TldrawUiPopover>
	)
}
