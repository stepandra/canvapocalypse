import { Atom, atom, Editor, StateNode } from 'tldraw'
import {
	insertWorkbenchEmoji,
	type WorkbenchEmojiId,
	WORKBENCH_EMOJIS,
} from './workbenchEmoji'

const DEFAULT_EMOJI_ID: WorkbenchEmojiId = 'idea'
const emojiStampStates = new WeakMap<Editor, Atom<WorkbenchEmojiId>>()

export function getEmojiStampState(editor: Editor) {
	let state = emojiStampStates.get(editor)
	if (!state) {
		state = atom<WorkbenchEmojiId>('workbench emoji stamp', DEFAULT_EMOJI_ID)
		emojiStampStates.set(editor, state)
	}
	return state
}

export function activateEmojiStamp(editor: Editor, emojiId: WorkbenchEmojiId) {
	if (!WORKBENCH_EMOJIS.some((definition) => definition.id === emojiId)) {
		throw new Error(`Unknown workbench emoji: ${emojiId}`)
	}
	getEmojiStampState(editor).set(emojiId)
	editor.setCurrentTool(EmojiStampTool.id)
}

export class EmojiStampTool extends StateNode {
	static override id = 'emoji-stamp'

	override isLockable = false

	override onEnter() {
		this.editor.setCursor({ type: 'cross', rotation: 0 })
	}

	override onExit() {
		this.editor.setCursor({ type: 'default', rotation: 0 })
	}

	override onPointerDown() {
		insertWorkbenchEmoji(this.editor, getEmojiStampState(this.editor).get(), {
			point: this.editor.inputs.getCurrentPagePoint(),
		})
	}

	override onCancel() {
		this.editor.setCurrentTool('select')
	}

	override onInterrupt() {
		this.editor.setCurrentTool('select')
	}
}
