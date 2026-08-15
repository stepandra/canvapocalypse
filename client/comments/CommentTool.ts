import { StateNode, VecModel } from 'tldraw'
import {
	commentRegionBetween,
	createShapeCommentAnchor,
	getCommentTargetShapeAt,
} from './core/anchors'
import { getCommentUiState, openCommentComposer } from './uiState'

export class CommentTool extends StateNode {
	static override id = 'comment'
	static override initial = 'idle'
	static override children() {
		return [CommentIdle, CommentRegionDragging]
	}

	override isLockable = false

	override onEnter() {
		this.editor.setCursor({ type: 'cross', rotation: 0 })
	}

	override onExit() {
		this.editor.setHintingShapes([])
		this.editor.updateInstanceState({ brush: null })
		this.editor.setCursor({ type: 'default', rotation: 0 })
	}

	override onCancel() {
		this.editor.setCurrentTool('select')
	}

	override onInterrupt() {
		this.editor.setCurrentTool('select')
	}
}

class CommentIdle extends StateNode {
	static override id = 'idle'

	override onPointerMove() {
		const mode = getCommentUiState(this.editor).get().mode
		if (mode !== 'shape-precise' && mode !== 'shape-imprecise') return
		const shape = getCommentTargetShapeAt(
			this.editor,
			this.editor.inputs.getCurrentPagePoint()
		)
		this.editor.setHintingShapes(shape ? [shape] : [])
	}

	override onPointerDown() {
		const mode = getCommentUiState(this.editor).get().mode
		const point = this.editor.inputs.getCurrentPagePoint().clone()
		if (mode === 'region') {
			this.parent.transition('region-dragging', { origin: point })
			return
		}
		if (mode === 'point') {
			openCommentComposer(this.editor, { type: 'point', x: point.x, y: point.y })
			this.editor.setCurrentTool('select')
			return
		}
		if (mode === 'shape-precise' || mode === 'shape-imprecise') {
			const shape = getCommentTargetShapeAt(this.editor, point)
			if (!shape) return
			const anchor = createShapeCommentAnchor(
				this.editor,
				shape.id,
				point,
				mode === 'shape-precise'
			)
			if (!anchor) return
			openCommentComposer(this.editor, anchor)
			this.editor.setCurrentTool('select')
		}
	}
}

class CommentRegionDragging extends StateNode {
	static override id = 'region-dragging'
	private origin: VecModel | null = null

	override onEnter({ origin }: { origin: VecModel }) {
		this.origin = origin
		this.updateBrush()
	}

	override onPointerMove() {
		this.updateBrush()
	}

	override onPointerUp() {
		if (!this.origin) return
		const anchor = commentRegionBetween(
			this.origin,
			this.editor.inputs.getCurrentPagePoint()
		)
		this.editor.updateInstanceState({ brush: null })
		if (anchor) openCommentComposer(this.editor, anchor)
		this.editor.setCurrentTool('select')
	}

	private updateBrush() {
		if (!this.origin) return
		const anchor = commentRegionBetween(
			this.origin,
			this.editor.inputs.getCurrentPagePoint()
		)
		if (!anchor) {
			this.editor.updateInstanceState({ brush: null })
			return
		}
		this.editor.updateInstanceState({
			brush: { x: anchor.x, y: anchor.y, w: anchor.w, h: anchor.h },
		})
	}
}
