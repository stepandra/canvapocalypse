import type {
	Editor,
	TLAnyBindingUtilConstructor,
	TLAnyShapeUtilConstructor,
	TLStateNodeConstructor,
} from 'tldraw'
import { describe, expect, it, vi } from 'vitest'
import { composeCanvasKitContributions } from './compose'
import type { CanvasKitContribution } from './types'

function contribution(
	overrides: Partial<CanvasKitContribution> & Pick<CanvasKitContribution, 'kitId'>
): CanvasKitContribution {
	return {
		kitId: overrides.kitId,
		presetIds: overrides.presetIds ?? [`${overrides.kitId}.preset`],
		shapeUtils: overrides.shapeUtils ?? [],
		bindingUtils: overrides.bindingUtils ?? [],
		tools: overrides.tools ?? [],
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
	it('mounts every live contribution once for an editor mount', () => {
		const editor = {} as Editor
		const firstOnMount = vi.fn()
		const secondOnMount = vi.fn()
		const composition = composeCanvasKitContributions([
			contribution({ kitId: 'kit.alpha', onMount: firstOnMount }),
			contribution({ kitId: 'kit.beta' }),
			contribution({ kitId: 'kit.gamma', onMount: secondOnMount }),
		])

		composition.onMount(editor)

		expect(firstOnMount).toHaveBeenCalledOnce()
		expect(firstOnMount).toHaveBeenCalledWith(editor)
		expect(secondOnMount).toHaveBeenCalledOnce()
		expect(secondOnMount).toHaveBeenCalledWith(editor)
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
})
