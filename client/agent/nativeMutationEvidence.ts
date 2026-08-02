import { isRecordsDiffEmpty } from 'tldraw'
import type { ChatHistoryItem } from '../../shared/types/ChatHistoryItem'

const NATIVE_TLDRAW_MUTATION_ACTION_TYPES = new Set([
	'add-detail',
	'align',
	'bringToFront',
	'clear',
	'create',
	'delete',
	'distribute',
	'label',
	'move',
	'pen',
	'place',
	'resize',
	'rotate',
	'sendToBack',
	'stack',
	'update',
])

/**
 * Return only completed, allowlisted native tldraw mutations appended after a
 * request began. Model messages, thoughts, incomplete actions, and provider
 * actions are not mutation evidence.
 */
export function getCompletedNativeTldrawMutationActions(
	history: readonly ChatHistoryItem[],
	startIndex: number
) {
	return history.slice(startIndex).flatMap((item) => {
		if (
			item.type !== 'action' ||
			!item.action.complete ||
			isRecordsDiffEmpty(item.diff)
		) {
			return []
		}
		const actionType = item.action._type
		return NATIVE_TLDRAW_MUTATION_ACTION_TYPES.has(actionType) ? [actionType] : []
	})
}
