import { Box, Editor, TLShape } from 'tldraw'
import { describe, expect, it } from 'vitest'
import { toSimpleShapeId } from '../types/ids-schema'
import { FocusedShape } from './FocusedShape'
import { convertFocusedShapeToTldrawShape } from './convertFocusedShapeToTldrawShape'

const artifactShapeId = toSimpleShapeId('artifact')

const editor = {
	getCurrentPageId: () => 'page:test',
	getHighestIndexForParent: () => 'a1',
	getShapePageBounds: () => new Box(0, 0, 120, 80),
	getShapeUtil: () => ({
		getDefaultProps: () => ({
			color: 'black',
			dash: 'draw',
			fill: 'none',
			isClosed: false,
			isComplete: true,
			scale: 1,
			segments: [],
			size: 'm',
		}),
	}),
} as unknown as Editor

const focusedShapes: ReadonlyArray<{ name: string; shape: FocusedShape }> = [
	{
		name: 'text',
		shape: {
			_type: 'text',
			anchor: 'top-left',
			color: 'black',
			maxWidth: null,
			note: 'updated note',
			shapeId: artifactShapeId,
			text: 'Updated text',
			x: 10,
			y: 20,
		},
	},
	{
		name: 'line',
		shape: {
			_type: 'line',
			color: 'blue',
			note: 'updated note',
			shapeId: artifactShapeId,
			x1: 10,
			x2: 110,
			y1: 20,
			y2: 80,
		},
	},
	{
		name: 'arrow',
		shape: {
			_type: 'arrow',
			color: 'green',
			fromId: null,
			note: 'updated note',
			shapeId: artifactShapeId,
			text: 'Updates',
			toId: null,
			x1: 10,
			x2: 110,
			y1: 20,
			y2: 80,
		},
	},
	{
		name: 'geo',
		shape: {
			_type: 'rectangle',
			color: 'violet',
			fill: 'tint',
			h: 80,
			note: 'updated note',
			shapeId: artifactShapeId,
			text: 'Architecture artifact',
			w: 120,
			x: 10,
			y: 20,
		},
	},
	{
		name: 'note',
		shape: {
			_type: 'note',
			color: 'yellow',
			note: 'updated note',
			shapeId: artifactShapeId,
			text: 'Decision rationale',
			x: 10,
			y: 20,
		},
	},
	{
		name: 'draw',
		shape: {
			_type: 'draw',
			color: 'grey',
			fill: 'none',
			note: 'updated note',
			shapeId: artifactShapeId,
		},
	},
	{
		name: 'unknown',
		shape: {
			_type: 'unknown',
			note: 'updated note',
			shapeId: artifactShapeId,
			subType: 'custom-card',
			x: 10,
			y: 20,
		},
	},
]

describe('convertFocusedShapeToTldrawShape metadata preservation', () => {
	it.each(focusedShapes)(
		'preserves existing namespaced metadata when updating a $name shape',
		({ shape }) => {
			const workbenchArtifact = {
				schema: 'canvapocalypse-workbench-artifact/v1',
				artifactId: 'decision-graph:decision',
				pack: 'architecture',
				templateId: 'decision-graph',
				artifactType: 'node',
				role: 'decision',
				status: 'proposed',
			}
			const workflow = {
				schema: 'ml-intern-workflow-node/v1',
				nodeId: 'existing-node',
			}
			const defaultShape = {
				type: shape._type === 'unknown' ? 'custom-card' : shape._type,
				meta: {
					note: 'previous note',
					workbenchArtifact,
					workflow,
				},
			} as unknown as Partial<TLShape>

			const result = convertFocusedShapeToTldrawShape(editor, shape, { defaultShape })

			expect(result.shape.meta).toEqual({
				note: 'updated note',
				workbenchArtifact,
				workflow,
			})
		}
	)
})
