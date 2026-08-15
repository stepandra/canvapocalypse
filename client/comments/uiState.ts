import { Atom, Editor, atom } from 'tldraw'
import { TLCommentAnchor, TLCommentThreadId } from './core/records'

export type CommentAnchorMode =
	| 'point'
	| 'shape-precise'
	| 'shape-imprecise'
	| 'region'
	| 'page'

export interface CommentUiState {
	mode: CommentAnchorMode
	composerAnchor: TLCommentAnchor | null
	selectedThreadId: TLCommentThreadId | null
}

const states = new WeakMap<Editor, Atom<CommentUiState>>()

export function getCommentUiState(editor: Editor) {
	let state = states.get(editor)
	if (!state) {
		state = atom<CommentUiState>('canvas comments ui', {
			mode: 'point',
			composerAnchor: null,
			selectedThreadId: null,
		})
		states.set(editor, state)
	}
	return state
}

export function beginCommentPlacement(editor: Editor, mode: CommentAnchorMode) {
	const state = getCommentUiState(editor)
	state.update((current) => ({
		...current,
		mode,
		composerAnchor: mode === 'page' ? { type: 'page' } : null,
		selectedThreadId: null,
	}))
	if (mode === 'page') editor.setCurrentTool('select')
	else editor.setCurrentTool('comment')
}

export function openCommentComposer(editor: Editor, anchor: TLCommentAnchor) {
	getCommentUiState(editor).update((current) => ({
		...current,
		composerAnchor: anchor,
		selectedThreadId: null,
	}))
}

export function closeCommentComposer(editor: Editor) {
	getCommentUiState(editor).update((current) => ({
		...current,
		composerAnchor: null,
	}))
}

export function selectCommentThread(
	editor: Editor,
	threadId: TLCommentThreadId | null
) {
	getCommentUiState(editor).update((current) => ({
		...current,
		composerAnchor: null,
		selectedThreadId: threadId,
	}))
}
