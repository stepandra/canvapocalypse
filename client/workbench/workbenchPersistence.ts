export const DEFAULT_CANVAS_PERSISTENCE_KEY = 'tldraw-agent-demo'
export const EVAL_LAB_CANVAS_PERSISTENCE_KEY = 'tldraw-agent-eval-lab-ml-intern-v1'
export const ML_INTERN_WORKBENCH_PERSISTENCE_KEY = 'tldraw-agent-workbench-ml-intern-v2'

export function resolveCanvasPersistenceKey(search: string) {
	const params = new URLSearchParams(search)
	if (params.get('canvas') === 'eval-lab') return EVAL_LAB_CANVAS_PERSISTENCE_KEY
	if (params.get('workflow') === 'ml-intern') return ML_INTERN_WORKBENCH_PERSISTENCE_KEY
	return DEFAULT_CANVAS_PERSISTENCE_KEY
}
