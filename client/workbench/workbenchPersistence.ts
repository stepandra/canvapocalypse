export const DEFAULT_CANVAS_PERSISTENCE_KEY = 'tldraw-agent-demo'
export const EVAL_LAB_CANVAS_PERSISTENCE_KEY = 'tldraw-agent-eval-lab-ml-intern-v1'
export const ML_INTERN_WORKBENCH_PERSISTENCE_KEY = 'tldraw-agent-workbench-ml-intern-v2'
const NAMED_CANVAS_PERSISTENCE_PREFIX = 'tldraw-agent-canvas-v1:'

export function resolveCanvasPersistenceKey(search: string) {
	const params = new URLSearchParams(search)
	const canvas = params.get('canvas')?.trim()
	if (canvas === 'eval-lab') return EVAL_LAB_CANVAS_PERSISTENCE_KEY
	if (canvas) return `${NAMED_CANVAS_PERSISTENCE_PREFIX}${encodeURIComponent(canvas)}`
	if (params.get('workflow') === 'ml-intern') return ML_INTERN_WORKBENCH_PERSISTENCE_KEY
	return DEFAULT_CANVAS_PERSISTENCE_KEY
}
