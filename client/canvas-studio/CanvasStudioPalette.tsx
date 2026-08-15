import { useEffect, useMemo, useState } from 'react'
import {
	TldrawUiButton,
	TldrawUiButtonLabel,
	TldrawUiIcon,
	TldrawUiPopover,
	TldrawUiPopoverContent,
	TldrawUiPopoverTrigger,
	TldrawUiToolbarButton,
	useEditor,
	useValue,
} from 'tldraw'
import {
	buildCanvasStudioPaletteModel,
	readEmbeddedCanvasStudioCatalog,
	type CanvasStudioCatalogKitAvailability,
} from './catalog'
import { CANVAPOCALYPSE_CANVAS_KIT_COMPOSITION } from './host'

interface CanvasStudioPaletteProps {
	composition?: typeof CANVAPOCALYPSE_CANVAS_KIT_COMPOSITION
}

function availabilityLabel(availability: CanvasStudioCatalogKitAvailability) {
	switch (availability) {
		case 'available':
			return 'Available'
		case 'unbound':
			return 'Not bound to this page'
		case 'unavailable':
			return 'Kit unavailable in this host'
	}
}

export function CanvasStudioPalette({
	composition = CANVAPOCALYPSE_CANVAS_KIT_COMPOSITION,
}: CanvasStudioPaletteProps) {
	const editor = useEditor()
	const [open, setOpen] = useState(false)
	const [query, setQuery] = useState('')
	const [status, setStatus] = useState<string | null>(null)
	const catalog = readEmbeddedCanvasStudioCatalog()
	const page = useValue(
		'Canvas Studio palette current page',
		() => editor.getCurrentPage(),
		[editor]
	)
	const model = useMemo(
		() => buildCanvasStudioPaletteModel({ catalog, composition, page, query }),
		[catalog, composition, page, query]
	)

	useEffect(() => {
		if (open) setStatus(null)
	}, [catalog, open, page.id])

	const insertPreset = (presetId: string, availability: CanvasStudioCatalogKitAvailability) => {
		if (availability !== 'available') {
			setStatus(availabilityLabel(availability))
			return
		}
		try {
			const receipt = composition.insertPreset(editor, presetId, {
				pageId: page.id,
				point: editor.getViewportPageBounds().center,
			})
			setStatus(
				`Created ${receipt.shapeIds.length} shapes and ${receipt.bindingIds.length} bindings`
			)
		} catch (error) {
			setStatus(error instanceof Error ? error.message : String(error))
		}
	}

	return (
		<TldrawUiPopover
			id="canvas-studio-palette"
			open={open}
			onOpenChange={setOpen}
			className="canvas-studio-popover"
		>
			<TldrawUiPopoverTrigger>
				<TldrawUiToolbarButton
					type="icon"
					className="workbench-rail-trigger canvas-studio-trigger"
					title="Canvas Studio catalog"
					aria-label="Canvas Studio catalog"
					aria-expanded={open}
				>
					<TldrawUiIcon icon="pack" label="" />
				</TldrawUiToolbarButton>
			</TldrawUiPopoverTrigger>
			<TldrawUiPopoverContent
				side="right"
				align="start"
				sideOffset={8}
				collisionPadding={12}
				autoFocusFirstButton={false}
			>
				<section
					className="canvas-studio-palette"
					aria-label="Canvas Studio catalog"
					onPointerDown={(event) => event.stopPropagation()}
					onClick={(event) => event.stopPropagation()}
				>
					<header className="workbench-popover-header">
						<span className="workbench-popover-kicker">CANVAS STUDIO</span>
						<div className="workbench-popover-title">
							<strong>Preset catalog</strong>
							<span>{page.name}</span>
						</div>
						<p>Search the embedded catalog. Insertions use trusted local kit modules.</p>
					</header>

					<label className="canvas-studio-search">
						<TldrawUiIcon icon="pack" label="" small />
						<input
							type="search"
							value={query}
							onChange={(event) => setQuery(event.currentTarget.value)}
							placeholder="Search kits and presets…"
							aria-label="Search Canvas Studio catalog"
						/>
					</label>

					<div className="canvas-studio-results">
						{model.state === 'missing' && (
							<div className="canvas-studio-empty" data-state="unavailable">
								<strong>Catalog unavailable</strong>
								<span>This document has no embedded Canvas Studio catalog.</span>
							</div>
						)}
						{model.state === 'empty' && (
							<div className="canvas-studio-empty">
								<strong>No matching presets</strong>
								<span>Try a kit, preset, or tag.</span>
							</div>
						)}
						{model.kits.map((kit) => (
							<section
								className="canvas-studio-kit"
								data-availability={kit.availability}
								key={kit.id}
							>
								<header>
									<div>
										<strong>{kit.title}</strong>
										<code>{kit.id}</code>
									</div>
									<span>{availabilityLabel(kit.availability)}</span>
								</header>
								<div className="canvas-studio-presets">
									{kit.presets.map((preset) => (
										<TldrawUiButton
											type="menu"
											className="canvas-studio-preset"
											data-availability={preset.availability}
											key={preset.id}
											title={`${preset.title} · ${availabilityLabel(preset.availability)}`}
											aria-disabled={preset.availability !== 'available'}
											onClick={() => insertPreset(preset.id, preset.availability)}
										>
											<TldrawUiButtonLabel>
												<span>{preset.title}</span>
												<code>{preset.id}</code>
											</TldrawUiButtonLabel>
											<TldrawUiIcon
												icon={preset.availability === 'available' ? 'plus' : 'warning-triangle'}
												label=""
												small
											/>
										</TldrawUiButton>
									))}
								</div>
							</section>
						))}
					</div>

					<div className="canvas-studio-status" role="status" aria-live="polite">
						{status ?? 'Preset insertions are one undoable editor transaction.'}
					</div>
				</section>
			</TldrawUiPopoverContent>
		</TldrawUiPopover>
	)
}
