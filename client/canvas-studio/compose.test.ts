import type {
	Editor,
	TLAnyBindingUtilConstructor,
	TLAnyShapeUtilConstructor,
	TLStateNodeConstructor,
} from 'tldraw'
import { describe, expect, it, vi } from 'vitest'
import { composeCanvasKitContributions } from './compose'
import {
	CANVAS_KIT_RUNTIME_SCHEMA,
	CANVAS_KIT_TLDRAW_VERSION,
	type CanvasKitContribution,
} from './types'

function contribution(
	overrides: Partial<CanvasKitContribution> & Pick<CanvasKitContribution, 'kitId'>
): CanvasKitContribution {
	const tools = overrides.tools ?? []
	return {
		kitId: overrides.kitId,
		runtimeContract: overrides.runtimeContract ?? {
			schema: CANVAS_KIT_RUNTIME_SCHEMA,
			owner: overrides.kitId,
			tldrawVersion: CANVAS_KIT_TLDRAW_VERSION,
			toolPaths: tools.map((tool) => tool.id),
			migrationIds: [],
			schemaIds: [],
			lifecycleIds: overrides.onMount ? [`${overrides.kitId}.mount`] : [],
			bridgeIds: [],
		},
		presetIds: overrides.presetIds ?? [`${overrides.kitId}.preset`],
		shapeUtils: overrides.shapeUtils ?? [],
		bindingUtils: overrides.bindingUtils ?? [],
		tools,
		records: overrides.records,
		agentCapabilities: overrides.agentCapabilities,
		onMount: overrides.onMount,
		insertPreset:
			overrides.insertPreset ??
			((_editor, presetId) => ({
				kitId: overrides.kitId,
				presetId,
				shapeIds: [],
				bindingIds: [],
			})),
	}
}

describe('Canvas Studio kit composition', () => {
	it('mounts in contribution order and disposes once in reverse order', () => {
		const editor = {} as Editor
		const calls: string[] = []
		const firstOnMount = vi.fn((_editor: Editor) => () => calls.push('dispose.alpha'))
		const secondOnMount = vi.fn((_editor: Editor) => () => calls.push('dispose.gamma'))
		const composition = composeCanvasKitContributions([
			contribution({
				kitId: 'kit.alpha',
				onMount: (mountedEditor) => {
					calls.push('mount.alpha')
					return firstOnMount(mountedEditor)
				},
			}),
			contribution({ kitId: 'kit.beta' }),
			contribution({
				kitId: 'kit.gamma',
				onMount: (mountedEditor) => {
					calls.push('mount.gamma')
					return secondOnMount(mountedEditor)
				},
			}),
		])

		const dispose = composition.onMount(editor)
		dispose?.()
		dispose?.()

		expect(firstOnMount).toHaveBeenCalledOnce()
		expect(firstOnMount).toHaveBeenCalledWith(editor)
		expect(secondOnMount).toHaveBeenCalledOnce()
		expect(secondOnMount).toHaveBeenCalledWith(editor)
		expect(calls).toEqual([
			'mount.alpha',
			'mount.gamma',
			'dispose.gamma',
			'dispose.alpha',
		])
	})

	it('disposes every cleanup returned by a live contribution', () => {
		const firstDispose = vi.fn()
		const secondDispose = vi.fn()
		const composition = composeCanvasKitContributions([
			contribution({ kitId: 'kit.alpha', onMount: () => firstDispose }),
			contribution({ kitId: 'kit.beta', onMount: () => undefined }),
			contribution({ kitId: 'kit.gamma', onMount: () => secondDispose }),
		])

		const dispose = composition.onMount({} as Editor)
		dispose?.()

		expect(firstDispose).toHaveBeenCalledOnce()
		expect(secondDispose).toHaveBeenCalledOnce()
	})

	it('unwinds mounted contributions when a later mount fails', () => {
		const dispose = vi.fn()
		const skippedOnMount = vi.fn()
		const composition = composeCanvasKitContributions([
			contribution({ kitId: 'kit.alpha', onMount: () => dispose }),
			contribution({
				kitId: 'kit.beta',
				onMount: () => {
					throw new Error('mount failed')
				},
			}),
			contribution({ kitId: 'kit.gamma', onMount: skippedOnMount }),
		])

		expect(() => composition.onMount({} as Editor)).toThrow('mount failed')
		expect(dispose).toHaveBeenCalledOnce()
		expect(skippedOnMount).not.toHaveBeenCalled()
	})

	it('attempts every cleanup when one contribution disposer fails', () => {
		const firstDispose = vi.fn()
		const failingDispose = vi.fn(() => {
			throw new Error('dispose failed')
		})
		const lastDispose = vi.fn()
		const composition = composeCanvasKitContributions([
			contribution({ kitId: 'kit.alpha', onMount: () => firstDispose }),
			contribution({ kitId: 'kit.beta', onMount: () => failingDispose }),
			contribution({ kitId: 'kit.gamma', onMount: () => lastDispose }),
		])

		const dispose = composition.onMount({} as Editor)

		expect(() => dispose?.()).toThrow('dispose failed')
		expect(firstDispose).toHaveBeenCalledOnce()
		expect(failingDispose).toHaveBeenCalledOnce()
		expect(lastDispose).toHaveBeenCalledOnce()
	})

	it('dispatches only through the statically composed preset owner', () => {
		const insertPreset = vi.fn((_editor: Editor, presetId: string) => ({
			kitId: 'kit.alpha',
			presetId,
			shapeIds: [],
			bindingIds: [],
		}))
		const composition = composeCanvasKitContributions([
			contribution({ kitId: 'kit.alpha', presetIds: ['preset.alpha'], insertPreset }),
		])
		const editor = {} as Editor
		const options = {
			pageId: 'page:test' as import('tldraw').TLPageId,
			point: { x: 120, y: 80 },
		}

		expect(composition.insertPreset(editor, 'preset.alpha', options)).toMatchObject({
			kitId: 'kit.alpha',
			presetId: 'preset.alpha',
		})
		expect(insertPreset).toHaveBeenCalledWith(editor, 'preset.alpha', options)
		expect(() =>
			composition.insertPreset(editor, 'preset.missing', options)
		).toThrow('unavailable in this host')
	})

	it.each([
		{
			label: 'kit',
			contributions: [contribution({ kitId: 'kit.same' }), contribution({ kitId: 'kit.same' })],
			error: /Duplicate Canvas Studio kit id kit.same/,
		},
		{
			label: 'preset',
			contributions: [
				contribution({ kitId: 'kit.one', presetIds: ['preset.same'] }),
				contribution({ kitId: 'kit.two', presetIds: ['preset.same'] }),
			],
			error: /Duplicate Canvas Studio preset id preset.same/,
		},
	])('rejects duplicate $label ids', ({ contributions, error }) => {
		expect(() => composeCanvasKitContributions(contributions)).toThrow(error)
	})

	it('rejects duplicate shape, binding, and tool registration ids', () => {
		class FirstShape { static type = 'shape.same' }
		class SecondShape { static type = 'shape.same' }
		class FirstBinding { static type = 'binding.same' }
		class SecondBinding { static type = 'binding.same' }
		class FirstTool { static id = 'tool.same' }
		class SecondTool { static id = 'tool.same' }
		const first = contribution({
			kitId: 'kit.one',
			shapeUtils: [FirstShape as unknown as TLAnyShapeUtilConstructor],
			bindingUtils: [FirstBinding as unknown as TLAnyBindingUtilConstructor],
			tools: [FirstTool as unknown as TLStateNodeConstructor],
		})

		expect(() =>
			composeCanvasKitContributions([
				first,
				contribution({
					kitId: 'kit.two',
					shapeUtils: [SecondShape as unknown as TLAnyShapeUtilConstructor],
				}),
			])
		).toThrow(/Duplicate Canvas Studio shape id shape.same/)
		expect(() =>
			composeCanvasKitContributions([
				first,
				contribution({
					kitId: 'kit.two',
					bindingUtils: [SecondBinding as unknown as TLAnyBindingUtilConstructor],
				}),
			])
		).toThrow(/Duplicate Canvas Studio binding id binding.same/)
		expect(() =>
			composeCanvasKitContributions([
				first,
				contribution({
					kitId: 'kit.two',
					tools: [SecondTool as unknown as TLStateNodeConstructor],
				}),
			])
		).toThrow(/Duplicate Canvas Studio tool id tool.same/)
	})

	it('requires the exact owner runtime schema and tldraw version', () => {
		const valid = contribution({ kitId: 'kit.valid' })
		const contract = valid.runtimeContract
		const invalidCases = [
			{ label: 'missing', contract: undefined, error: /missing runtimeContract/ },
			{
				label: 'schema',
				contract: { ...contract, schema: 'canvas.kit-runtime/v0' },
				error: /must use runtime schema canvas.kit-runtime\/v1/,
			},
			{
				label: 'owner',
				contract: { ...contract, owner: 'kit.someone-else' },
				error: /must equal kit id kit.valid/,
			},
			{
				label: 'version',
				contract: { ...contract, tldrawVersion: '5.2.4' },
				error: /requires tldraw 5.2.5/,
			},
		]

		for (const invalid of invalidCases) {
			expect(() =>
				composeCanvasKitContributions([
					{
						...valid,
						runtimeContract: invalid.contract,
					} as unknown as CanvasKitContribution,
				])
			).toThrow(invalid.error)
		}
	})

	it('rejects extra contract fields, duplicate inventory ids, and an untracked mount', () => {
		const valid = contribution({ kitId: 'kit.valid' })
		expect(() =>
			composeCanvasKitContributions([
				{
					...valid,
					runtimeContract: { ...valid.runtimeContract, inferredSchemas: [] },
				} as CanvasKitContribution,
			])
		).toThrow(/runtimeContract has an invalid shape/)
		expect(() =>
			composeCanvasKitContributions([
				contribution({
					kitId: 'kit.duplicate',
					runtimeContract: {
						...valid.runtimeContract,
						owner: 'kit.duplicate',
						schemaIds: ['schema/v1', 'schema/v1'],
					},
				}),
			])
		).toThrow(/runtimeContract.schemaIds contains duplicate id schema\/v1/)
		expect(() =>
			composeCanvasKitContributions([
				contribution({
					kitId: 'kit.mount',
					onMount: () => undefined,
					runtimeContract: {
						...valid.runtimeContract,
						owner: 'kit.mount',
					},
				}),
			])
		).toThrow(/onMount requires a lifecycle id/)
	})

	it('validates full recursively traversed tool paths', () => {
		class RegionDragging { static id = 'region-dragging' }
		class CommentIdle { static id = 'idle' }
		class CommentTool {
			static id = 'comment'
			static children() {
				return [CommentIdle, RegionDragging]
			}
		}
		const tools = [CommentTool as unknown as TLStateNodeConstructor]
		const valid = contribution({
			kitId: 'canvas.comment-fixture',
			tools,
			runtimeContract: {
				schema: CANVAS_KIT_RUNTIME_SCHEMA,
				owner: 'canvas.comment-fixture',
				tldrawVersion: CANVAS_KIT_TLDRAW_VERSION,
				toolPaths: ['comment', 'comment.idle', 'comment.region-dragging'],
				migrationIds: [],
				schemaIds: [],
				lifecycleIds: [],
				bridgeIds: [],
			},
		})

		expect(composeCanvasKitContributions([valid]).tools).toEqual(tools)
		expect(() =>
			composeCanvasKitContributions([
				{
					...valid,
					runtimeContract: {
						...valid.runtimeContract,
						toolPaths: ['comment', 'comment.idle'],
					},
				},
			])
		).toThrow(/must declare tool path comment.region-dragging/)
	})

	it('rejects duplicate canonical lifecycle-installed tool paths', () => {
		const first = contribution({
			kitId: 'kit.alpha',
			runtimeContract: {
				schema: CANVAS_KIT_RUNTIME_SCHEMA,
				owner: 'kit.alpha',
				tldrawVersion: CANVAS_KIT_TLDRAW_VERSION,
				toolPaths: ['select.pointing-port'],
				migrationIds: [],
				schemaIds: [],
				lifecycleIds: [],
				bridgeIds: [],
			},
		})
		const second = contribution({
			kitId: 'kit.beta',
			runtimeContract: {
				...first.runtimeContract,
				owner: 'kit.beta',
			},
		})
		expect(() => composeCanvasKitContributions([first, second])).toThrow(
			/Duplicate Canvas Studio tool path select.pointing-port/
		)
	})

	it('mounts and disposes the lifecycle-owned Grok select child exactly once', () => {
		class PointingWorkflowPort { static id = 'pointing_workflow_port' }
		const select = {}
		const editor = {
			getStateDescendant: vi.fn((_path: string) => select),
			setTool: vi.fn((_tool: TLStateNodeConstructor, _parent: object) => undefined),
			removeTool: vi.fn((_tool: TLStateNodeConstructor, _parent: object) => undefined),
		}
		const tool = PointingWorkflowPort as unknown as TLStateNodeConstructor
		const grok = contribution({
			kitId: 'grok.workflow',
			tools: [],
			runtimeContract: {
				schema: CANVAS_KIT_RUNTIME_SCHEMA,
				owner: 'grok.workflow',
				tldrawVersion: CANVAS_KIT_TLDRAW_VERSION,
				toolPaths: ['select.pointing_workflow_port'],
				migrationIds: ['workflow-ports-v5'],
				schemaIds: [
					'grok.workflow/agents-models-node/v1',
					'grok-config-supervisor/v1',
					'grok-config/v1',
				],
				lifecycleIds: ['grok.workflow.mount.select-tool-child'],
				bridgeIds: [],
			},
			onMount: (mountedEditor) => {
				const parent = (mountedEditor as unknown as typeof editor).getStateDescendant(
					'select'
				)
				;(mountedEditor as unknown as typeof editor).setTool(
					tool,
					parent
				)
				return () =>
					(mountedEditor as unknown as typeof editor).removeTool(
						tool,
						parent
					)
			},
		})

		const composition = composeCanvasKitContributions([grok])
		expect(composition.tools).toEqual([])
		const dispose = composition.onMount(editor as unknown as Editor)
		dispose?.()
		dispose?.()

		expect((editor as unknown as typeof editor).setTool).toHaveBeenCalledOnce()
		expect((editor as unknown as typeof editor).removeTool).toHaveBeenCalledOnce()
	})

	it('composes custom records and rejects duplicate type names', () => {
		const firstRecord = {} as import('tldraw').CustomRecordInfo
		const secondRecord = {} as import('tldraw').CustomRecordInfo
		const first = contribution({
			kitId: 'kit.one',
			records: { 'comment-thread': firstRecord },
		})
		const second = contribution({
			kitId: 'kit.two',
			records: { 'comment-thread': secondRecord },
		})

		expect(composeCanvasKitContributions([first]).records).toEqual({
			'comment-thread': firstRecord,
		})
		expect(() => composeCanvasKitContributions([first, second])).toThrow(
			/Duplicate Canvas Studio record id comment-thread in kit.one and kit.two/
		)
	})

	it('rejects duplicate and host-colliding agent capability ids', () => {
		const capability = (kitId: string, id: string) => ({
			descriptor: {
				id,
				version: 1 as const,
				kitId,
				mode: 'mutate' as const,
				summary: 'Insert one bounded preset.',
				contexts: ['selection' as const],
				actionPlan: {
					coordinateSystem: 'absolute-page' as const,
					maxActions: 1,
					actionTypes: ['insertPreset'],
					schema: { type: 'array' },
				},
				effects: {
					recordTypes: ['shape' as const],
					atomic: true as const,
					undoable: true as const,
				},
			},
			execute: vi.fn(() => ({ shapeIds: [], bindingIds: [], summary: 'Done' })),
		})
		expect(() =>
			composeCanvasKitContributions([
				contribution({
					kitId: 'kit.one',
					agentCapabilities: [capability('kit.one', 'canvas.inspect')],
				}),
			])
		).toThrow(/collides with a host capability/)
		expect(() =>
			composeCanvasKitContributions([
				contribution({
					kitId: 'kit.one',
					agentCapabilities: [capability('kit.one', 'kit.shared.insert')],
				}),
				contribution({
					kitId: 'kit.two',
					agentCapabilities: [capability('kit.two', 'kit.shared.insert')],
				}),
			])
		).toThrow(/Duplicate Canvas Studio agent capability id kit.shared.insert/)
	})
})
