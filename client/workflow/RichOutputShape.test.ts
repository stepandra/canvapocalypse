import { describe, expect, it } from 'vitest'
import { parseOutputPresentation } from './RichOutputShape'

describe('parseOutputPresentation', () => {
	it('unwraps fenced and recursively stringified JSON', () => {
		expect(
			parseOutputPresentation(
				'```json\n"{\\"summary\\":\\"ok\\",\\"nested\\":{\\"items\\":[1,2]}}"\n```'
			)
		).toEqual({
			kind: 'json',
			value: { summary: 'ok', nested: { items: [1, 2] } },
		})
	})

	it('keeps non-JSON model output as Markdown', () => {
		expect(parseOutputPresentation('# Result\n\n- one\n- two')).toEqual({
			kind: 'markdown',
			value: '# Result\n\n- one\n- two',
		})
	})
})

describe('buildWorkflowRunJsonlFilename', () => {
	it('produces a safe deterministic filename with run id prefix', async () => {
		const mod = await import('./RichOutputShape')
		expect(mod.buildWorkflowRunJsonlFilename('wf-1', 'run-2026-08-09_abc123', 'rich-out')).toBe(
			'wf-1_run-2026-08-09_abc123_rich-out.jsonl'
		)
	})

	it('sanitizes unsafe filename characters', async () => {
		const mod = await import('./RichOutputShape')
		expect(mod.buildWorkflowRunJsonlFilename('wf/one', 'run:bad', 'node name')).toBe(
			'wf-one_run-bad_node-name.jsonl'
		)
	})
})
