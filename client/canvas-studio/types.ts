import type {
	BoxModel,
	CustomRecordInfo,
	Editor,
	JsonObject,
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

export type CanvasAgentContextPolicy = 'selection' | 'selection-or-area'

/** Serializable contract hydrated on demand by an external canvas companion. */
export interface CanvasAgentCapabilityDescriptor {
	id: string
	version: 1
	kitId: string
	mode: 'read' | 'mutate'
	summary: string
	contexts: readonly CanvasAgentContextPolicy[]
	actionPlan: {
		coordinateSystem: 'absolute-page'
		maxActions: number
		actionTypes: readonly string[]
		schema: JsonObject
	}
	effects: {
		recordTypes: readonly ('shape' | 'binding')[]
		atomic: true
		undoable: boolean
	}
}

export interface CanvasAgentCapabilityExecutionContext {
	pageId: TLPageId
	boundary: 'selection' | 'area'
	bounds: BoxModel
	shapeIds: readonly TLShapeId[]
	contextRef: string
}

export interface CanvasAgentCapabilityExecutionReceipt {
	shapeIds: readonly TLShapeId[]
	bindingIds: readonly TLBindingId[]
	summary: string
	result?: JsonObject
}

/**
 * Trusted runtime executor paired with its serializable discovery descriptor.
 * ShapeUtil presence alone never grants semantic mutation authority.
 */
export interface CanvasKitAgentCapability {
	readonly descriptor: CanvasAgentCapabilityDescriptor
	execute(
		editor: Editor,
		actions: readonly unknown[],
		context: CanvasAgentCapabilityExecutionContext
	): CanvasAgentCapabilityExecutionReceipt
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
	/** Custom document records that must be registered before this kit can mount. */
	readonly records?: Readonly<Record<string, CustomRecordInfo>>
	readonly agentCapabilities?: readonly CanvasKitAgentCapability[]
	onMount?(editor: Editor): void | (() => void)
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
	readonly records: Readonly<Record<string, CustomRecordInfo>>
	readonly agentCapabilities: readonly CanvasKitAgentCapability[]
	onMount(editor: Editor): void | (() => void)
	getContribution(kitId: string): CanvasKitContribution | undefined
	getPresetContribution(presetId: string): CanvasKitContribution | undefined
	getAgentCapability(capabilityId: string): CanvasKitAgentCapability | undefined
	insertPreset(
		editor: Editor,
		presetId: string,
		options: CanvasPresetInsertOptions
	): CanvasPresetInsertReceipt
}
