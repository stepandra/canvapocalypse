import { createShapeId, type Editor, type TLShapeId } from 'tldraw'
import {
	EXPERIMENT_CARD_COLLAPSED_HEIGHT,
	EXPERIMENT_CARD_COLUMN_GAP,
	EXPERIMENT_CARD_COLUMNS,
	EXPERIMENT_CARD_EXPANDED_HEIGHT,
	EXPERIMENT_CARD_MIN_WIDTH,
	EXPERIMENT_CARD_ROW_GAP,
} from './experimentCardConstants'
import { EXPERIMENT_CARD_SHAPE_TYPE } from './ExperimentCardShape'
import {
	LEAD_ACQUISITION_EXPERIMENTS,
	LEAD_EXPERIMENT_CATALOG_VERSION,
} from './experimentCatalog'

export {
	EXPERIMENT_CARD_COLLAPSED_HEIGHT,
	EXPERIMENT_CARD_EXPANDED_HEIGHT,
	EXPERIMENT_CARD_MIN_WIDTH,
}

export interface ExperimentCardPosition {
	x: number
	y: number
}

export function computeExperimentDeckOrigin(
	viewport: { center: { x: number; y: number } },
	existingBounds: { x: number; maxY: number } | null
): ExperimentCardPosition {
	const deckWidth =
		EXPERIMENT_CARD_COLUMNS * EXPERIMENT_CARD_MIN_WIDTH +
		(EXPERIMENT_CARD_COLUMNS - 1) * EXPERIMENT_CARD_COLUMN_GAP
	return existingBounds
		? { x: existingBounds.x, y: existingBounds.maxY + 180 }
		: {
				x: viewport.center.x - deckWidth / 2,
				y: viewport.center.y - EXPERIMENT_CARD_EXPANDED_HEIGHT / 2,
			}
}

export function computeExperimentCardGrid(
	count: number,
	origin: ExperimentCardPosition
): ExperimentCardPosition[] {
	return Array.from({ length: Math.max(0, count) }, (_, index) => ({
		x:
			origin.x +
			(index % EXPERIMENT_CARD_COLUMNS) *
				(EXPERIMENT_CARD_MIN_WIDTH + EXPERIMENT_CARD_COLUMN_GAP),
		y:
			origin.y +
			Math.floor(index / EXPERIMENT_CARD_COLUMNS) *
				(EXPERIMENT_CARD_EXPANDED_HEIGHT + EXPERIMENT_CARD_ROW_GAP),
	}))
}

export interface InstallLeadExperimentCardsResult {
	shapeIds: TLShapeId[]
	count: number
	catalogVersion: typeof LEAD_EXPERIMENT_CATALOG_VERSION
}

export function installLeadAcquisitionExperimentCards(
	editor: Editor
): InstallLeadExperimentCardsResult {
	const viewport = editor.getViewportPageBounds()
	const origin = computeExperimentDeckOrigin(
		viewport,
		editor.getCurrentPageBounds() ?? null
	)
	const positions = computeExperimentCardGrid(
		LEAD_ACQUISITION_EXPERIMENTS.length,
		origin
	)
	const shapeIds = LEAD_ACQUISITION_EXPERIMENTS.map(() => createShapeId())

	editor.markHistoryStoppingPoint('Create lead acquisition experiment cards')
	editor.createShapes(
		LEAD_ACQUISITION_EXPERIMENTS.map((experiment, index) => ({
			id: shapeIds[index],
			type: EXPERIMENT_CARD_SHAPE_TYPE,
			parentId: editor.getCurrentPageId(),
			x: positions[index].x,
			y: positions[index].y,
			props: {
				w: EXPERIMENT_CARD_MIN_WIDTH,
				h: EXPERIMENT_CARD_EXPANDED_HEIGHT,
				experimentId: experiment.id,
				collapsed: false,
			},
			meta: {
				experiment: {
					schema: LEAD_EXPERIMENT_CATALOG_VERSION,
					experimentId: experiment.id,
					sequence: experiment.sequence,
					phase: experiment.phase,
				},
			},
		}))
	)
	editor.setSelectedShapes(shapeIds)
	editor.zoomToSelection({ animation: { duration: 240 } })

	return {
		shapeIds,
		count: shapeIds.length,
		catalogVersion: LEAD_EXPERIMENT_CATALOG_VERSION,
	}
}
