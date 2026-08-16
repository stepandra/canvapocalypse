import { stopEventPropagation, useEditor } from 'tldraw'
import { ConstraintLayoutControls, createConstraintLayout } from './binding'
import { createFlexLayout, FlexLayoutControls } from './flex'

function LayoutCreationControls() {
	const editor = useEditor()
	return (
		<div
			onPointerDown={stopEventPropagation}
			style={{
				position: 'absolute',
				left: '50%',
				top: 12,
				transform: 'translateX(-50%)',
				display: 'flex',
				gap: 6,
				padding: 8,
				borderRadius: 10,
				background: 'var(--tl-color-panel, #fff)',
				border: '1px solid var(--tl-color-muted-1, #cbd5e1)',
				boxShadow: '0 4px 16px rgb(15 23 42 / 16%)',
				pointerEvents: 'all',
			}}
		>
			<button type="button" onClick={() => createFlexLayout(editor)}>New flex layout</button>
			<button type="button" onClick={() => createConstraintLayout(editor)}>New constraint layout</button>
		</div>
	)
}

export function CanvasLayoutControls() {
	return (
		<>
			<LayoutCreationControls />
			<FlexLayoutControls />
			<ConstraintLayoutControls />
		</>
	)
}

export const CANVAS_LAYOUT_COMPONENTS = {
	InFrontOfTheCanvas: CanvasLayoutControls,
} as const
