import { useCallback } from 'react'
import {
	createShapeId,
	Tldraw,
	toRichText,
	useEditor,
	useValue,
	type Editor,
	type TLComponents,
} from 'tldraw'
import { addConnectedShape } from './connectedShape'

const anchorId = createShapeId('canvas-examples-connected-anchor')

export default function ConnectedShapeStory() {
	const initialize = useCallback((editor: Editor) => {
		if (editor.getCurrentPageShapeIds().size > 0) return
		editor.createShape({
			id: anchorId,
			type: 'geo',
			x: 180,
			y: 240,
			props: {
				geo: 'rectangle',
				w: 190,
				h: 110,
				color: 'grey',
				fill: 'semi',
				richText: toRichText('Select me'),
			},
		})
		editor.select(anchorId)
		editor.zoomToFit({ animation: { duration: 0 } })
	}, [])

	return (
		<div className="canvas-example-story canvas-example-connected-shape">
			<Tldraw onMount={initialize} components={components} />
		</div>
	)
}

const components: TLComponents = {
	InFrontOfTheCanvas: ConnectedShapeControls,
}

function ConnectedShapeControls() {
	return (
		<div className="canvas-example-story-card">
			<span className="canvas-example-story-card__eyebrow">Atomic editor transaction</span>
			<h1>Add connected shape</h1>
			<p>Select any shape, then add a new shape with a native arrow and two bindings.</p>
			<ConnectedShapeButton />
			<small>Undo once to remove the shape, arrow, and bindings together.</small>
		</div>
	)
}

function ConnectedShapeButton() {
	const editor = useEditor()
	const selected = useValue('connected shape source selection', () => editor.getOnlySelectedShape(), [editor])
	return (
		<button
			type="button"
			className="canvas-example-primary-button"
			disabled={!selected}
			onClick={() => selected && addConnectedShape(editor, selected.id)}
		>
			Add connected shape
		</button>
	)
}
