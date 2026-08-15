import type {
	TLEditorSnapshot,
	TLStoreOptions,
	TLStoreSnapshot,
	TLStoreWithStatus,
} from 'tldraw'
import * as tldraw from 'tldraw'

type LocalStoreOptions = {
	persistenceKey?: string
	sessionId?: string
	snapshot?: TLEditorSnapshot | TLStoreSnapshot
} & TLStoreOptions

type UseLocalStore = (options: LocalStoreOptions) => TLStoreWithStatus

// tldraw 5.2.5 ships this hook at runtime but omits it from the public declaration
// bundle. Keep that compatibility seam isolated until the public Tldraw props can
// register custom records while retaining IndexedDB persistence.
const useLocalStore = (tldraw as unknown as { useLocalStore?: UseLocalStore })
	.useLocalStore

if (!useLocalStore) {
	throw new Error('This tldraw build cannot persist Canvas Studio custom records')
}

export const useCanvasStudioLocalStore: UseLocalStore = useLocalStore
