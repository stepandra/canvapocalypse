import { describe, expect, it } from 'vitest'
import {
	DEFAULT_CANVAS_PERSISTENCE_KEY,
	EVAL_LAB_CANVAS_PERSISTENCE_KEY,
	ML_INTERN_WORKBENCH_PERSISTENCE_KEY,
	resolveCanvasPersistenceKey,
} from './workbenchPersistence'

describe('workbench canvas persistence namespace', () => {
	it('keeps the generic canvas in its existing namespace', () => {
		expect(resolveCanvasPersistenceKey('')).toBe(DEFAULT_CANVAS_PERSISTENCE_KEY)
		expect(resolveCanvasPersistenceKey('?pack=architecture')).toBe(
			DEFAULT_CANVAS_PERSISTENCE_KEY
		)
	})

	it('isolates the ML-Intern workbench bootstrap from the generic canvas', () => {
		expect(resolveCanvasPersistenceKey('?workflow=ml-intern')).toBe(
			ML_INTERN_WORKBENCH_PERSISTENCE_KEY
		)
		expect(resolveCanvasPersistenceKey('?workflow=ml-intern&pack=uiux')).toBe(
			ML_INTERN_WORKBENCH_PERSISTENCE_KEY
		)
	})

	it('preserves the dedicated Eval Lab document when both legacy entry points are present', () => {
		expect(resolveCanvasPersistenceKey('?canvas=eval-lab')).toBe(
			EVAL_LAB_CANVAS_PERSISTENCE_KEY
		)
		expect(resolveCanvasPersistenceKey('?canvas=eval-lab&workflow=ml-intern')).toBe(
			EVAL_LAB_CANVAS_PERSISTENCE_KEY
		)
	})

	it('isolates named project canvases by URL slug', () => {
		expect(resolveCanvasPersistenceKey('?canvas=work-project')).toBe(
			'tldraw-agent-canvas-v1:work-project'
		)
		expect(resolveCanvasPersistenceKey('?canvas=client%20discovery')).toBe(
			'tldraw-agent-canvas-v1:client%20discovery'
		)
		expect(resolveCanvasPersistenceKey('?canvas=work-project&workflow=ml-intern')).toBe(
			'tldraw-agent-canvas-v1:work-project'
		)
		expect(resolveCanvasPersistenceKey('?canvas=%20%20')).toBe(
			DEFAULT_CANVAS_PERSISTENCE_KEY
		)
	})
})
