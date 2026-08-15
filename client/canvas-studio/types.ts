import type {
	Editor,
	TLAnyBindingUtilConstructor,
	TLAnyShapeUtilConstructor,
	TLBindingId,
	TLPageId,
	TLShapeId,
	TLStateNodeConstructor,
} from 'tldraw'

export interface CanvasPresetInsertOptions {
	pageId: TLPageId
	/** Page-space center for the inserted preset. */
	point: { x: number; y: number }
}

export interface CanvasPresetInsertReceipt {
	kitId: string
	presetId: string
	shapeIds: TLShapeId[]
	bindingIds: TLBindingId[]
}

/**
 * Structural host contract implemented by trusted local kit modules.
 *
 * External kit owners may implement this interface without importing any
 * Canvapocalypse runtime code. Shared React and tldraw stay composer-owned.
 */
export interface CanvasKitContribution {
	readonly kitId: string
	readonly presetIds: readonly string[]
	readonly shapeUtils: readonly TLAnyShapeUtilConstructor[]
	readonly bindingUtils: readonly TLAnyBindingUtilConstructor[]
	readonly tools: readonly TLStateNodeConstructor[]
	insertPreset(
		editor: Editor,
		presetId: string,
		options: CanvasPresetInsertOptions
	): CanvasPresetInsertReceipt
}

export interface CanvasKitComposition {
	readonly contributions: readonly CanvasKitContribution[]
	readonly shapeUtils: readonly TLAnyShapeUtilConstructor[]
	readonly bindingUtils: readonly TLAnyBindingUtilConstructor[]
	readonly tools: readonly TLStateNodeConstructor[]
	getContribution(kitId: string): CanvasKitContribution | undefined
	getPresetContribution(presetId: string): CanvasKitContribution | undefined
	insertPreset(
		editor: Editor,
		presetId: string,
		options: CanvasPresetInsertOptions
	): CanvasPresetInsertReceipt
}
