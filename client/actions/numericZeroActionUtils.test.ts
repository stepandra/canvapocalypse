import { describe, expect, it, vi } from 'vitest'
import type {
	ResizeAction,
	RotateAction,
} from '../../shared/schema/AgentActionSchemas'
import { toSimpleShapeId } from '../../shared/types/ids-schema'
import type { Streaming } from '../../shared/types/Streaming'
import type { AgentHelpers } from '../AgentHelpers'
import type { TldrawAgent } from '../agent/TldrawAgent'
import { ResizeActionUtil } from './ResizeActionUtil'
import { RotateActionUtil } from './RotateActionUtil'

function harness() {
	const editor = {
		resizeShape: vi.fn(),
		rotateShapesBy: vi.fn(),
	}
	const helpers = {
		removeOffsetFromVec: vi.fn((point: { x: number; y: number }) => point),
	} as unknown as AgentHelpers
	const agent = { editor } as unknown as TldrawAgent
	return { agent, editor, helpers }
}

describe('numeric zero action values', () => {
	it('applies resize when scale or origin coordinates are zero', () => {
		const { agent, editor, helpers } = harness()
		const util = new ResizeActionUtil(agent)
		const action: Streaming<ResizeAction> = {
			_type: 'resize',
			complete: true,
			intent: 'Collapse on the x axis from the page origin',
			originX: 0,
			originY: 0,
			scaleX: 0,
			scaleY: 1,
			shapeIds: [toSimpleShapeId('node-1')],
			time: 0,
		}

		util.applyAction(action, helpers)

		expect(editor.resizeShape).toHaveBeenCalledWith(
			'shape:node-1',
			{ x: 0, y: 1 },
			{ scaleOrigin: { x: 0, y: 0 } }
		)
	})

	it('applies rotate when degrees or origin coordinates are zero', () => {
		const { agent, editor, helpers } = harness()
		const util = new RotateActionUtil(agent)
		const action: Streaming<RotateAction> = {
			_type: 'rotate',
			centerY: 0,
			complete: true,
			degrees: 0,
			intent: 'Keep the current angle around the page origin',
			originX: 0,
			originY: 0,
			shapeIds: [toSimpleShapeId('node-1')],
			time: 0,
		}

		util.applyAction(action, helpers)

		expect(editor.rotateShapesBy).toHaveBeenCalledWith(
			['shape:node-1'],
			0,
			{ center: { x: 0, y: 0 } }
		)
	})
})
