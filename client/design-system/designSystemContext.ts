import type { Editor } from 'tldraw'
import type { DesignSystemContext } from '../../shared/types/DesignSystem'
import { getDesignSystemSnapshot } from './designSystemBridge'
import {
	isDesignSystemShape,
	readDesignSystemMeta,
} from './DesignSystemShape'

/**
 * Read-only, exact-selection context seam for agent integrations. The provider
 * response is revision-bound and capped by designSystemBridge; authority is
 * rechecked after the await before any context leaves this function.
 */
export async function getSelectedDesignSystemContext(
	editor: Editor,
	signal?: AbortSignal
): Promise<DesignSystemContext> {
	const selectedShapes = editor.getSelectedShapes()
	if (
		selectedShapes.length !== 1 ||
		!isDesignSystemShape(selectedShapes[0])
	) {
		throw new Error(
			'Select exactly one Design System node before inspecting DESIGN.md'
		)
	}
	const selected = selectedShapes[0]
	const meta = readDesignSystemMeta(selected)!
	const snapshot = await getDesignSystemSnapshot(
		meta.documentRef,
		meta.revision,
		signal
	)
	const currentShapes = editor.getSelectedShapes()
	const current = currentShapes.length === 1 ? currentShapes[0] : null
	if (!isDesignSystemShape(current) || current.id !== selected.id) {
		throw new Error(
			'Design System selection changed while context was being inspected'
		)
	}
	const currentMeta = readDesignSystemMeta(current)!
	if (
		currentMeta.documentRef !== meta.documentRef ||
		currentMeta.revision !== meta.revision
	) {
		throw new Error(
			'Design System revision changed while context was being inspected'
		)
	}
	return {
		shapeId: selected.id,
		documentRef: snapshot.documentRef,
		revision: snapshot.revision,
		title: snapshot.title,
		status: snapshot.status,
		projection: snapshot.projection,
	}
}
