import { useState } from 'react'
import {
	stopEventPropagation,
	TldrawUiButton,
	TldrawUiButtonIcon,
	TldrawUiPopover,
	TldrawUiPopoverContent,
	TldrawUiPopoverTrigger,
	TldrawUiTooltip,
	useEditor,
} from 'tldraw'
import { ConstraintLayoutControls, createConstraintLayout } from './binding'
import { createFlexLayout, FlexLayoutControls } from './flex'
import './layoutControls.css'

function LayoutCreationControls() {
	const editor = useEditor()
	const [open, setOpen] = useState(false)
	return (
		<div
			className="canvas-layout-launcher"
			onPointerDown={stopEventPropagation}
			onClick={(event) => event.stopPropagation()}
		>
			<TldrawUiPopover id="canvas-layout-tools" open={open} onOpenChange={setOpen}>
				<TldrawUiTooltip
					content="Frame and layout tools"
					side="right"
					sideOffset={8}
					delayDuration={350}
				>
					<TldrawUiPopoverTrigger>
						<TldrawUiButton
							type="tool"
							className="workbench-rail-trigger canvas-layout-trigger"
							isActive={open}
							aria-label="Frame and layout tools"
							aria-expanded={open}
						>
							<TldrawUiButtonIcon icon="tool-frame" />
						</TldrawUiButton>
					</TldrawUiPopoverTrigger>
				</TldrawUiTooltip>
				<TldrawUiPopoverContent
					side="right"
					align="start"
					sideOffset={8}
					collisionPadding={8}
				>
					<div className="canvas-layout-create-menu" role="menu" aria-label="Create layout">
						<TldrawUiButton
							type="menu"
							title="Create a parent-owned flex layout"
							onClick={() => {
								createFlexLayout(editor)
								setOpen(false)
							}}
						>
							<TldrawUiButtonIcon icon="stack-horizontal" small />
							<span>New flex layout</span>
						</TldrawUiButton>
						<TldrawUiButton
							type="menu"
							title="Create a binding-owned constraint layout"
							onClick={() => {
								createConstraintLayout(editor)
								setOpen(false)
							}}
						>
							<TldrawUiButtonIcon icon="group" small />
							<span>New constraint layout</span>
						</TldrawUiButton>
					</div>
				</TldrawUiPopoverContent>
			</TldrawUiPopover>
		</div>
	)
}

export function CanvasLayoutControls() {
	return <LayoutCreationControls />
}

export function CanvasLayoutSelectionControls() {
	return (
		<>
			<FlexLayoutControls />
			<ConstraintLayoutControls />
		</>
	)
}

export const CANVAS_LAYOUT_COMPONENTS = {
	InFrontOfTheCanvas: CanvasLayoutControls,
} as const
