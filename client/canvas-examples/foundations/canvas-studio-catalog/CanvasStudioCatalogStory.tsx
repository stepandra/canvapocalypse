import { useCallback, useMemo, useState } from 'react'
import { Tldraw, useEditor, type Editor, type TLComponents } from 'tldraw'
import {
	buildCanvasStudioPaletteModel,
	CANVAPOCALYPSE_CANVAS_KIT_COMPOSITION,
	type CanvasPresetInsertReceipt,
	type CanvasStudioCatalog,
} from '../../../canvas-studio'

export const CANVAS_STUDIO_CATALOG_STORY_CATALOG = {
	version: 1,
	kits: [
		{
			id: 'workbench.architecture',
			title: 'Architecture pack',
			kind: 'workbench-pack',
			runtime: 'pack-templates',
			tags: ['architecture'],
			presets: [
				{ id: 'workbench.system-context', title: 'System context', tags: ['c4'] },
				{ id: 'workbench.decision-graph', title: 'Decision graph', tags: ['adr'] },
				{ id: 'workbench.change-radar', title: 'Change radar', tags: ['radar'] },
			],
		},
		{
			id: 'grok.workflow',
			title: 'Grok workflow',
			kind: 'workflow',
			runtime: 'custom-nodes',
			presets: [{ id: 'grok.single', title: 'Single agent' }],
		},
	],
	pages: { architecture: ['workbench.architecture'] },
} as const satisfies CanvasStudioCatalog

export default function CanvasStudioCatalogStory() {
	const initialize = useCallback((editor: Editor) => {
		editor.updatePage({
			id: editor.getCurrentPageId(),
			name: 'Architecture',
			meta: { lens: 'architecture' },
		})
	}, [])

	return (
		<div className="canvas-example-story canvas-studio-story">
			<Tldraw
				onMount={initialize}
				components={components}
				shapeUtils={[...CANVAPOCALYPSE_CANVAS_KIT_COMPOSITION.shapeUtils]}
				bindingUtils={[...CANVAPOCALYPSE_CANVAS_KIT_COMPOSITION.bindingUtils]}
			/>
		</div>
	)
}

const components: TLComponents = {
	InFrontOfTheCanvas: CanvasStudioCatalogControls,
}

function CanvasStudioCatalogControls() {
	const editor = useEditor()
	const [query, setQuery] = useState('system')
	const [receipt, setReceipt] = useState<CanvasPresetInsertReceipt | null>(null)
	const [undoConfirmed, setUndoConfirmed] = useState(false)
	const page = editor.getCurrentPage()
	const model = useMemo(
		() =>
			buildCanvasStudioPaletteModel({
				catalog: CANVAS_STUDIO_CATALOG_STORY_CATALOG,
				composition: CANVAPOCALYPSE_CANVAS_KIT_COMPOSITION,
				page,
				query,
			}),
		[page, query]
	)
	const presets = model.kits.flatMap((kit) => kit.presets)

	const insert = (presetId: string) => {
		const next = CANVAPOCALYPSE_CANVAS_KIT_COMPOSITION.insertPreset(
			editor,
			presetId,
			{
				pageId: page.id,
				point: { x: 900, y: 620 },
			}
		)
		setReceipt(next)
		setUndoConfirmed(false)
		editor.zoomToFit({ animation: { duration: 0 } })
	}
	const undo = () => {
		if (!receipt) return
		editor.undo()
		setUndoConfirmed(
			receipt.shapeIds.every((shapeId) => !editor.getShape(shapeId)) &&
				receipt.bindingIds.every((bindingId) => !editor.getBinding(bindingId))
		)
	}

	return (
		<div className="canvas-studio-story-panel">
			<span className="canvas-example-story-card__eyebrow">Static kit dispatch</span>
			<h1>Canvas Studio preset catalog</h1>
			<p>Search the serialized catalog, then insert real native Workbench records.</p>
			<input
				type="search"
				value={query}
				onChange={(event) => setQuery(event.currentTarget.value)}
				aria-label="Search story catalog"
			/>
			<div className="canvas-studio-story-results" role="list">
				{presets.map((preset) => (
					<button
						type="button"
						key={preset.id}
						disabled={preset.availability !== 'available'}
						onClick={() => insert(preset.id)}
					>
						<strong>{preset.title}</strong>
						<code>{preset.id}</code>
					</button>
				))}
			</div>
			<div className="canvas-studio-story-receipt" role="status" aria-live="polite">
				{receipt ? (
					<>
						<strong>
							{receipt.shapeIds.length} shapes · {receipt.bindingIds.length} bindings
						</strong>
						<button type="button" onClick={undo}>Undo insertion</button>
					</>
				) : (
					<span>Select the matching preset.</span>
				)}
				{undoConfirmed && <b>One-step undo confirmed</b>}
			</div>
		</div>
	)
}
