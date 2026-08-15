import type { Editor, SharedStyle, StyleProp, TLBinding, TLShape } from 'tldraw'

export interface InspectorSharedStyle {
	id: string
	value: string
}

export interface CanvasInspectorState {
	selectedShapes: TLShape[]
	selectedShape: TLShape | null
	bindings: TLBinding[]
	sharedStyles: InspectorSharedStyle[]
}

export function readCanvasInspectorState(editor: Editor): CanvasInspectorState {
	const selectedShapes = editor.getSelectedShapes()
	const selectedShape = selectedShapes.length === 1 ? selectedShapes[0] : null
	return {
		selectedShapes,
		selectedShape,
		bindings: selectedShape ? editor.getBindingsInvolvingShape(selectedShape.id) : [],
		sharedStyles:
			selectedShapes.length > 1
				? Array.from(editor.getSharedStyles().entries()).map(([style, value]) => ({
						id: style.id.replace('tldraw:', ''),
						value: formatSharedStyle(value),
					}))
				: [],
	}
}

function formatSharedStyle(value: SharedStyle<unknown>) {
	if (value.type === 'mixed') return '(mixed)'
	if (value.type === 'shared') return formatInspectorValue(value.value)
	return String(value)
}

export function formatInspectorValue(value: unknown): string {
	if (value === null || value === undefined) return String(value)
	if (typeof value === 'string') return value
	if (typeof value === 'object') {
		if (Array.isArray(value)) return `Array(${value.length})`
		return JSON.stringify(value, null, 2)
	}
	return String(value)
}

export function sortInspectorEntries(record: object) {
	return Object.entries(record).sort(([left], [right]) => left.localeCompare(right))
}

export type InspectorStyleProp = StyleProp<unknown>
