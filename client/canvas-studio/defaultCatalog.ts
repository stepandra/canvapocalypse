import type { CanvasStudioCatalog } from './catalog'

const SHARED_KITS = ['canvas.comments', 'canvas.layout', 'canvas.markdown'] as const

/**
 * Catalog metadata for the standalone Canvapocalypse web host. Native tldraw
 * Offline documents replace this with their project-scoped embedded catalog.
 */
export const CANVAPOCALYPSE_DEFAULT_CANVAS_STUDIO_CATALOG: CanvasStudioCatalog = {
	version: 1,
	host: {
		id: 'canvapocalypse-web',
		kind: 'canvapocalypse-workbench',
	},
	kits: [
		{
			id: 'botflow.telegram-journey',
			title: 'Telegram journey',
			kind: 'compiler',
			runtime: 'document-script',
			defaultPage: 'Botflow',
			tags: ['telegram', 'dsl', 'phones', 'botflow'],
			presets: [
				{ id: 'botflow.support', title: 'Support ticket', tags: ['support', 'tickets'] },
				{ id: 'botflow.lovi-v1', title: 'Lovi v1 research lab', tags: ['lovi', 'research'] },
				{ id: 'botflow.lovi-beta', title: 'Lovi beta · 8 states', tags: ['lovi', 'presets', 'limits'] },
				{ id: 'botflow.lovi-alert', title: 'Lovi · Threshold alert v4', tags: ['lovi', 'alert', 'scheduler'] },
			],
		},
		{
			id: 'grok.workflow',
			title: 'Grok workflow',
			kind: 'executable-workflow',
			runtime: 'custom-nodes',
			defaultPage: 'Workflow',
			tags: ['grok', 'rhai', 'stage', 'agent', 'gate'],
			presets: [
				{
					id: 'grok.trusted-ml-release',
					title: 'Trusted ML release',
					tags: ['ml', 'gate', 'evidence'],
				},
			],
		},
		{
			id: 'hermes.flight-deck',
			title: 'Hermes Flight Deck',
			kind: 'profile-harness',
			runtime: 'custom-nodes',
			defaultPage: 'Flight Deck',
			tags: ['hermes', 'profile', 'prompt', 'debug'],
			presets: [
				{
					id: 'hermes.profile-canvas',
					title: 'Packed Flight Deck document',
					tags: ['hermes', 'document'],
				},
			],
		},
		{
			id: 'workbench.architecture',
			title: 'Architecture pack',
			kind: 'workbench-pack',
			runtime: 'pack-templates',
			defaultPage: 'Architecture',
			tags: ['architecture', 'amp', 'isoflow'],
			presets: [
				{ id: 'workbench.system-context', title: 'System context', tags: ['c4'] },
				{ id: 'workbench.c4-container', title: 'C4 container', tags: ['c4', 'container'] },
				{ id: 'workbench.c4-component', title: 'C4 component', tags: ['c4', 'component'] },
				{ id: 'workbench.service-data-flow', title: 'Service / data flow', tags: ['service', 'data-flow'] },
				{ id: 'workbench.decision-graph', title: 'Decision graph', tags: ['adr'] },
				{ id: 'workbench.change-radar', title: 'Change radar', tags: ['radar'] },
			],
		},
		{
			id: 'workbench.ml',
			title: 'ML / LLM pack',
			kind: 'workbench-pack',
			runtime: 'pack-templates',
			defaultPage: 'ML/LLM',
			tags: ['ml', 'eval', 'experiment'],
			presets: [
				{ id: 'workbench.experiment-loop', title: 'Experiment loop', tags: ['ml'] },
				{ id: 'workbench.eval-pipeline', title: 'Evaluation pipeline', tags: ['eval'] },
				{ id: 'workbench.model-delivery', title: 'Model delivery map', tags: ['mlops'] },
			],
		},
		{
			id: 'workbench.uiux',
			title: 'UI / UX pack',
			kind: 'workbench-pack',
			runtime: 'pack-templates',
			defaultPage: 'UI/UX',
			tags: ['ui', 'ux', 'wireframe'],
			presets: [
				{ id: 'workbench.user-flow', title: 'User flow', tags: ['flow'] },
				{ id: 'workbench.wireframe-set', title: 'Wireframe screen set', tags: ['wireframe'] },
				{ id: 'workbench.component-anatomy', title: 'Component anatomy', tags: ['ui'] },
			],
		},
		{
			id: 'workbench.product',
			title: 'Product / PM pack',
			kind: 'workbench-pack',
			runtime: 'pack-templates',
			defaultPage: 'Product/PM',
			tags: ['product', 'roadmap', 'ost'],
			presets: [
				{ id: 'workbench.roadmap', title: 'Product roadmap', tags: ['roadmap'] },
				{ id: 'workbench.timeline', title: 'Delivery timeline', tags: ['timeline'] },
				{ id: 'workbench.opportunity-map', title: 'Opportunity decision', tags: ['decision'] },
				{ id: 'workbench.opportunity-solution-tree', title: 'Opportunity solution tree', tags: ['ost', 'discovery'] },
				{ id: 'workbench.impact-map', title: 'Impact map', tags: ['impact', 'outcome'] },
				{ id: 'workbench.service-blueprint', title: 'Journey / service blueprint', tags: ['journey', 'service-blueprint'] },
			],
		},
		{
			id: 'canvas.comments',
			title: 'Canvas comments',
			kind: 'canvas-native',
			runtime: 'custom-records',
			tags: ['comments', 'review'],
			presets: [],
		},
		{
			id: 'canvas.layout',
			title: 'Canvas layout',
			kind: 'canvas-native',
			runtime: 'custom-shapes',
			tags: ['layout', 'flex', 'constraints'],
			presets: [],
		},
		{
			id: 'canvas.markdown',
			title: 'Markdown documents',
			kind: 'canvas-native',
			runtime: 'custom-shapes',
			tags: ['markdown', 'context', 'vault'],
			presets: [],
		},
	],
	pages: {
		architecture: ['workbench.architecture', ...SHARED_KITS],
		ml: ['workbench.ml', ...SHARED_KITS],
		uiux: ['workbench.uiux', ...SHARED_KITS],
		product: ['workbench.product', ...SHARED_KITS],
		'agents-models': ['grok.workflow', ...SHARED_KITS],
		workflow: ['grok.workflow', ...SHARED_KITS],
		botflow: ['botflow.telegram-journey', ...SHARED_KITS],
		'flight-deck': ['hermes.flight-deck', ...SHARED_KITS],
		freeform: [],
	},
}

export function installDefaultCanvasStudioCatalog(target: typeof globalThis = globalThis) {
	const catalogTarget = target as typeof globalThis & {
		__CANVAS_STUDIO_CATALOG__?: unknown
	}
	if (catalogTarget.__CANVAS_STUDIO_CATALOG__ === undefined) {
		catalogTarget.__CANVAS_STUDIO_CATALOG__ =
			CANVAPOCALYPSE_DEFAULT_CANVAS_STUDIO_CATALOG
	}
}
