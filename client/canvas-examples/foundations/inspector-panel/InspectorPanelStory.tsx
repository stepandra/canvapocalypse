import { useCallback, useState } from 'react'
import {
	createShapeId,
	EditorProvider,
	Tldraw,
	toRichText,
	useEditor,
	useValue,
	type Editor,
	type TLBinding,
} from 'tldraw'
import { formatInspectorValue, readCanvasInspectorState, sortInspectorEntries } from './inspectorState'

const firstShapeId = createShapeId('canvas-examples-inspector-first')
const secondShapeId = createShapeId('canvas-examples-inspector-second')
const arrowId = createShapeId('canvas-examples-inspector-arrow')

export default function InspectorPanelStory() {
	const [editor, setEditor] = useState<Editor | null>(null)
	const initialize = useCallback((nextEditor: Editor) => {
		setEditor(nextEditor)
		if (nextEditor.getCurrentPageShapeIds().size > 0) return
		nextEditor.run(
			() => {
				nextEditor.createShapes([
					{
						id: firstShapeId,
						type: 'geo',
						x: 140,
						y: 220,
						props: {
							geo: 'rectangle',
							w: 180,
							h: 100,
							fill: 'semi',
							color: 'blue',
							richText: toRichText('Select a shape'),
						},
					},
					{
						id: secondShapeId,
						type: 'geo',
						x: 470,
						y: 320,
						props: {
							geo: 'ellipse',
							w: 170,
							h: 100,
							fill: 'solid',
							color: 'orange',
							richText: toRichText('Inspect bindings'),
						},
					},
					{
						id: arrowId,
						type: 'arrow',
						x: 230,
						y: 270,
						props: { start: { x: 0, y: 0 }, end: { x: 325, y: 100 }, arrowheadEnd: 'arrow' },
					},
				])
				nextEditor.createBindings([
					{
						type: 'arrow',
						fromId: arrowId,
						toId: firstShapeId,
						props: {
							terminal: 'start',
							normalizedAnchor: { x: 0.5, y: 0.5 },
							isExact: false,
							isPrecise: false,
							snap: 'none',
						},
					},
					{
						type: 'arrow',
						fromId: arrowId,
						toId: secondShapeId,
						props: {
							terminal: 'end',
							normalizedAnchor: { x: 0.5, y: 0.5 },
							isExact: false,
							isPrecise: false,
							snap: 'none',
						},
					},
				])
				nextEditor.select(firstShapeId)
			},
			{ history: 'ignore' }
		)
		nextEditor.zoomToFit({ animation: { duration: 0 } })
	}, [])

	return (
		<div className="canvas-example-story canvas-example-inspector-story">
			<div className="canvas-example-inspector-story__canvas">
				<Tldraw onMount={initialize} />
			</div>
			{editor && (
				<EditorProvider editor={editor}>
					<InspectorPanel />
				</EditorProvider>
			)}
		</div>
	)
}

export function InspectorPanel() {
	const editor = useEditor()
	const state = useValue('canvas example inspector state', () => readCanvasInspectorState(editor), [editor])

	return (
		<aside className="canvas-example-inspector" aria-label="Inspector panel">
			<header>
				<span>Live editor signals</span>
				<h1>Inspector</h1>
			</header>
			{state.selectedShapes.length === 0 && <p className="canvas-example-inspector__empty">No shape selected</p>}
			{state.selectedShapes.length > 1 && (
				<>
					<p className="canvas-example-inspector__count">{state.selectedShapes.length} shapes selected</p>
					<InspectorSection title="Shared styles">
						{state.sharedStyles.map((style) => (
							<InspectorRow key={style.id} name={style.id} value={style.value} />
						))}
					</InspectorSection>
				</>
			)}
			{state.selectedShape && (
				<>
					<InspectorSection title="Shape">
						{sortInspectorEntries(state.selectedShape)
							.filter(([key]) => key !== 'props')
							.map(([key, value]) => (
								<InspectorRow key={key} name={key} value={value} />
							))}
					</InspectorSection>
					<InspectorSection title="Props">
						{sortInspectorEntries(state.selectedShape.props).map(([key, value]) => (
							<InspectorRow key={key} name={key} value={value} />
						))}
					</InspectorSection>
					<InspectorSection title={`Bindings (${state.bindings.length})`}>
						{state.bindings.length === 0 ? (
							<p className="canvas-example-inspector__empty">No bindings</p>
						) : (
							state.bindings.map((binding) => (
								<BindingCard
									key={binding.id}
									binding={binding}
									selectedShapeId={state.selectedShape!.id}
								/>
							))
						)}
					</InspectorSection>
				</>
			)}
		</aside>
	)
}

function InspectorSection({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<section>
			<h2>{title}</h2>
			{children}
		</section>
	)
}

function InspectorRow({ name, value }: { name: string; value: unknown }) {
	const formatted = formatInspectorValue(value)
	return (
		<div className="canvas-example-inspector__row">
			<dt>{name}</dt>
			<dd title={formatted}>{formatted}</dd>
		</div>
	)
}

function BindingCard({ binding, selectedShapeId }: { binding: TLBinding; selectedShapeId: string }) {
	const editor = useEditor()
	const otherShapeId = binding.fromId === selectedShapeId ? binding.toId : binding.fromId
	const otherShape = useValue(
		`canvas example binding target ${binding.id}`,
		() => editor.getShape(otherShapeId),
		[editor, otherShapeId]
	)
	return (
		<article className="canvas-example-inspector__binding">
			<strong>{binding.type}</strong>
			<span>{binding.fromId === selectedShapeId ? 'from selection' : 'to selection'}</span>
			<code>{otherShape?.type ?? otherShapeId}</code>
		</article>
	)
}
