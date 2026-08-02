import type {
	ChatHistoryActionItem,
	ChatHistoryItem,
} from '../../shared/types/ChatHistoryItem'
import type { TLRecord } from 'tldraw'
import { describe, expect, it } from 'vitest'
import { getCompletedNativeTldrawMutationActions } from './nativeMutationEvidence'

function action(
	type: string,
	complete = true,
	hasRecordDiff = true
): ChatHistoryActionItem {
	const changedShape = {
		id: 'shape:changed',
		typeName: 'shape',
		type: 'geo',
	} as unknown as TLRecord
	return {
		type: 'action',
		action: {
			_type: type,
			complete,
			time: 1,
		} as unknown as ChatHistoryActionItem['action'],
		diff: {
			added: hasRecordDiff
				? ({ [changedShape.id]: changedShape } as ChatHistoryActionItem['diff']['added'])
				: {},
			updated: {},
			removed: {},
		},
		acceptance: 'pending',
	}
}

describe('native mutation evidence', () => {
	it('returns only completed allowlisted mutations after the request boundary', () => {
		const history = [
			action('create'),
			{ type: 'continuation', data: [] },
			action('think'),
			action('update', false),
			action('move'),
			action('isoflowPatch'),
		] as ChatHistoryItem[]

		expect(getCompletedNativeTldrawMutationActions(history, 1)).toEqual(['move'])
	})

	it('returns no evidence for messages or non-mutating actions', () => {
		expect(getCompletedNativeTldrawMutationActions([action('message')], 0)).toEqual([])
	})

	it('does not treat a completed action with an empty record diff as mutation evidence', () => {
		expect(getCompletedNativeTldrawMutationActions([action('move', true, false)], 0)).toEqual(
			[]
		)
	})
})
