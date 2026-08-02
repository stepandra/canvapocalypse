import { describe, expect, it } from 'vitest'
import { mergeUniqueRegistrations } from './tldraw-desktop-config-dedupe'

describe('mergeUniqueRegistrations', () => {
	it('replaces duplicate shape util types while preserving unrelated host utils', () => {
		class HostGeo {
			static type = 'geo'
		}
		class OldWorkflow {
			static type = 'workflow-node'
		}
		class CurrentWorkflow {
			static type = 'workflow-node'
		}
		class RichOutput {
			static type = 'workflow-rich-output'
		}

		const result = mergeUniqueRegistrations(
			[HostGeo, OldWorkflow, OldWorkflow],
			[CurrentWorkflow, RichOutput],
			'type'
		)

		expect(result).toEqual([HostGeo, CurrentWorkflow, RichOutput])
		expect(result.map((entry) => entry.type)).toEqual([
			'geo',
			'workflow-node',
			'workflow-rich-output',
		])
	})

	it('keeps one copy of each tool id and lets the current implementation win', () => {
		class SelectTool {
			static id = 'select'
		}
		class OldWorkflowTool {
			static id = 'workflow-input'
		}
		class CurrentWorkflowTool {
			static id = 'workflow-input'
		}

		const result = mergeUniqueRegistrations(
			[SelectTool, OldWorkflowTool],
			[CurrentWorkflowTool, CurrentWorkflowTool],
			'id'
		)

		expect(result).toEqual([SelectTool, CurrentWorkflowTool])
		expect(result.map((entry) => entry.id)).toEqual(['select', 'workflow-input'])
	})

	it('deduplicates keyless registrations only by object identity', () => {
		class First {}
		class Second {}

		expect(mergeUniqueRegistrations([First, Second], [First], 'type')).toEqual([
			Second,
			First,
		])
	})
})
