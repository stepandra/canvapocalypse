import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const shapeSource = readFileSync(
	new URL('./AgentsModelsShape.tsx', import.meta.url),
	'utf8'
)
const scriptSource = readFileSync(
	new URL('../../scripts/agents-models-canvas-script.mjs', import.meta.url),
	'utf8'
)

describe('Agents / Models native workflow surface', () => {
	it('uses one custom shape with real controls for all logical card roles', () => {
		expect(shapeSource).toContain(
			"export const AGENTS_MODELS_SHAPE_TYPE = 'agents-models-node'"
		)
		expect(shapeSource).toContain('<AgentsModelsToolbar')
		expect(shapeSource).toContain('<AgentsModelsCatalog')
		expect(shapeSource).toContain('<AgentsModelsStage')
		expect(shapeSource).toContain('<AgentsModelsSubagent')
		expect(shapeSource.match(/<button/g)?.length).toBeGreaterThanOrEqual(3)
		expect(shapeSource.match(/<select/g)?.length).toBeGreaterThanOrEqual(4)
	})

	it('routes toolbar controls through explicit inspectable requests', () => {
		expect(shapeSource).toContain('actionRequest:')
		expect(shapeSource).toContain("kind: 'preset' | 'apply' | 'play'")
		expect(scriptSource).toContain('const onToolbarActionMaybe = () =>')
		expect(scriptSource).toContain('handledActionRequests.has(request.id)')
		expect(scriptSource).not.toContain('onSelectionMaybeClick')
		expect(scriptSource).not.toContain("selectNone?.()")
	})

	it('materializes logical workflow nodes as native roots', () => {
		expect(scriptSource).toContain('type: AGENTS_MODELS_SHAPE_TYPE')
		expect(scriptSource).toContain(
			'(spec) => spec.kind === "stage" || spec.kind === "subagent"'
		)
		expect(scriptSource).toContain('createArrowBetweenShapes(from, to')
	})
})
