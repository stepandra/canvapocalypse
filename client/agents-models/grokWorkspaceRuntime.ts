import { Box, type Editor } from 'tldraw'
import agentsModelsDocumentScript from '../../scripts/agents-models-canvas-script.mjs'
import { resolveCanvasRuntimePageMode } from '../canvas-studio/runtimeCapabilityCatalog'
import { installGrokCanvasBridge } from './grokBridgeClient'

const WORKFLOW_NODE_ROLES = new Set([
	'stage',
	'agent',
	'persona',
	'subagent',
	'capability',
	'skill',
	'gate',
	'input',
	'artifact',
	'result',
	'module',
])

type GrokDocumentRuntime = {
	cleanup(): void
	_materializePreset(presetId: string): Promise<void>
}

function isGrokWorkspacePage(editor: Editor) {
	return resolveCanvasRuntimePageMode(editor.getCurrentPage()) === 'agents-models'
}

function frameGrokWorkspace(editor: Editor) {
	const bounds = Box.Common(
		editor.getCurrentPageShapes().flatMap((shape) => {
			const meta = shape.meta as {
				am?: { hiddenControl?: boolean; role?: string }
			}
			if (!meta.am || meta.am.hiddenControl || meta.am.role === 'arrow') return []
			const shapeBounds = editor.getShapePageBounds(shape)
			return shapeBounds ? [shapeBounds] : []
		})
	)
	if (!bounds) return
	editor.zoomToBounds(bounds, {
		inset: 72,
		animation: { duration: editor.options.animationMediumMs },
	})
}

/**
 * Activates the complete Grok document runtime only while its dedicated page
 * is current. The canvas furniture and workflow records persist normally;
 * polling and action listeners are stopped as soon as the operator leaves.
 */
export function mountGrokWorkspaceRuntime(editor: Editor) {
	let runtime: GrokDocumentRuntime | null = null
	let runtimePageId: string | null = null
	let starting = false
	let disposed = false

	const stopRuntime = () => {
		runtime?.cleanup()
		runtime = null
		runtimePageId = null
	}

	const syncRuntime = () => {
		if (disposed || starting) return
		if (!isGrokWorkspacePage(editor)) {
			stopRuntime()
			return
		}

		const pageId = editor.getCurrentPageId()
		if (runtime && runtimePageId === pageId) return
		stopRuntime()
		starting = true
		void installGrokCanvasBridge()
			.catch(() => undefined)
			.then(() => {
				if (
					disposed ||
					!isGrokWorkspacePage(editor) ||
					editor.getCurrentPageId() !== pageId
				) {
					return
				}
				const hasWorkflow = editor.getCurrentPageShapes().some((shape) =>
					WORKFLOW_NODE_ROLES.has(
						String((shape.meta as { am?: { role?: string } }).am?.role ?? '')
					)
				)
				runtime = agentsModelsDocumentScript({ editor }) as GrokDocumentRuntime
				runtimePageId = pageId

				if (!hasWorkflow) {
					void runtime._materializePreset('fanout').finally(() => {
						if (!disposed && editor.getCurrentPageId() === pageId) {
							frameGrokWorkspace(editor)
						}
					})
				} else {
					requestAnimationFrame(() => {
						if (!disposed && editor.getCurrentPageId() === pageId) {
							frameGrokWorkspace(editor)
						}
					})
				}
			})
			.finally(() => {
				starting = false
			})
	}

	const unlisten = editor.store.listen(syncRuntime, {
		scope: 'all',
		source: 'all',
	})
	syncRuntime()

	return () => {
		disposed = true
		unlisten()
		stopRuntime()
	}
}
