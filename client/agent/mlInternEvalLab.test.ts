import { describe, expect, it } from 'vitest'
import type { AgentPrompt } from '../../shared/types/AgentPrompt'
import {
	buildMlInternEvalLabRequest,
	EVAL_LAB_WAVE1_CONTEXT_REF,
	ML_INTERN_CONTEXT_FILE_DATA_TYPE,
	parseMlInternEvalLabAction,
} from './mlInternEvalLab'

const prompt = {
	modelName: { type: 'modelName', modelName: 'ml-intern-eval-lab' },
	mode: {
		type: 'mode',
		modeType: 'working',
		partTypes: ['mode', 'messages', 'blurryShapes'],
		actionTypes: ['message', 'move', 'unknown'],
		routing: {
			route: 'canvas-edit',
			contextBudget: {
				maxContextItems: 12,
				maxContinuationData: 8,
				maxHistoryItems: 4,
				maxSelectedShapes: 24,
				maxViewportShapes: 64,
				maxIsoflowEmbeds: 1,
				maxIsoflowItems: 32,
				maxIsoflowConnectors: 48,
			},
			capabilities: ['message', 'move', 'unknown'],
			permissionBoundary: {
				surface: 'canvas',
				mutations: 'validated-actions',
				credentials: 'external-only',
			},
		},
	},
	messages: { type: 'messages', agentMessages: ['Improve Eval Lab'], requestSource: 'user' },
	blurryShapes: { type: 'blurryShapes', shapes: [] },
	data: {
		type: 'data',
		data: [{ type: ML_INTERN_CONTEXT_FILE_DATA_TYPE, ref: EVAL_LAB_WAVE1_CONTEXT_REF }],
	},
	screenshot: { type: 'screenshot', screenshot: 'data:image/png;base64,secret-large-image' },
	isoflowContext: { type: 'isoflowContext', embeds: [] },
} as unknown as AgentPrompt

describe('ML-Intern Eval Lab adapter', () => {
	it('sends only the bounded native-canvas context and schema', () => {
		const request = buildMlInternEvalLabRequest(prompt)

		expect(request.profile).toBe('eval_lab')
		expect(request.context).toHaveProperty('blurryShapes')
		expect(request.context).not.toHaveProperty('screenshot')
		expect(request.context).not.toHaveProperty('isoflowContext')
		expect(request.contextFileRefs).toEqual([EVAL_LAB_WAVE1_CONTEXT_REF])
		expect(JSON.stringify(request.responseSchema)).toContain('move')
	})

	it('accepts a complete action covered by the route grant', () => {
		expect(
			parseMlInternEvalLabAction(
				{
					_type: 'move',
					intent: 'Improve hierarchy',
					anchor: 'center',
					shapeId: 'shape:hero',
					x: 100,
					y: 120,
					complete: true,
					time: 42,
				},
				prompt
			)
		).toMatchObject({ _type: 'move', complete: true, time: 42 })
	})

	it('rejects malformed and out-of-grant actions before canvas mutation', () => {
		expect(() =>
			parseMlInternEvalLabAction(
				{ _type: 'clear', complete: true, time: 1 },
				prompt
			)
		).toThrow('outside the Eval Lab grant')
		expect(() =>
			parseMlInternEvalLabAction(
				{ _type: 'move', shapeId: 'shape:hero', complete: true, time: 1 },
				prompt
			)
		).toThrow('invalid move action')
	})
})
