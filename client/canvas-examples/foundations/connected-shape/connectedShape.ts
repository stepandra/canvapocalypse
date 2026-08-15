import {
	createShapeId,
	type Editor,
	type TLArrowBinding,
	type TLArrowShape,
	type TLGeoShape,
	type TLShapeId,
	uniqueId,
} from 'tldraw'

export interface AddConnectedShapeOptions {
	shapeId?: TLShapeId
	arrowId?: TLShapeId
}

export interface AddConnectedShapeResult {
	sourceShapeId: TLShapeId
	shapeId: TLShapeId
	arrowId: TLShapeId
}

export function addConnectedShape(
	editor: Editor,
	sourceShapeId: TLShapeId,
	options: AddConnectedShapeOptions = {}
): AddConnectedShapeResult {
	const source = editor.getShape(sourceShapeId)
	const sourceBounds = editor.getShapePageBounds(sourceShapeId)
	if (!source || !sourceBounds) throw new Error(`Source shape ${sourceShapeId} was not found`)

	const shapeId = options.shapeId ?? createShapeId(`connected-${uniqueId()}`)
	const arrowId = options.arrowId ?? createShapeId(`connector-${uniqueId()}`)
	const targetX = sourceBounds.maxX + 180
	const targetY = sourceBounds.midY - 50
	const arrowX = sourceBounds.midX
	const arrowY = sourceBounds.midY

	editor.markHistoryStoppingPoint('Add connected shape')
	editor.run(() => {
		editor.createShapes<TLGeoShape | TLArrowShape>([
			{
				id: shapeId,
				type: 'geo',
				x: targetX,
				y: targetY,
				props: {
					geo: 'rectangle',
					w: 180,
					h: 100,
					color: 'blue',
					fill: 'semi',
				},
			},
			{
				id: arrowId,
				type: 'arrow',
				x: arrowX,
				y: arrowY,
				props: {
					start: { x: 0, y: 0 },
					end: { x: targetX + 90 - arrowX, y: targetY + 50 - arrowY },
					arrowheadEnd: 'arrow',
				},
			},
		])
		editor.createBindings<TLArrowBinding>([
			{
				type: 'arrow',
				fromId: arrowId,
				toId: sourceShapeId,
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
				toId: shapeId,
				props: {
					terminal: 'end',
					normalizedAnchor: { x: 0.5, y: 0.5 },
					isExact: false,
					isPrecise: false,
					snap: 'none',
				},
			},
		])
		editor.select(shapeId)
	})

	return { sourceShapeId, shapeId, arrowId }
}
