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
