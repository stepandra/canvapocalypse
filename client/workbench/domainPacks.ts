import type { WorkbenchToolProfileId } from './workbenchToolProfiles'

export const WORKBENCH_DOMAINS = [
	'architecture',
	'ml',
	'uiux',
	'product',
] as const

export type WorkbenchDomain = (typeof WORKBENCH_DOMAINS)[number]

export interface WorkbenchTemplateSummary {
	id: string
	label: string
	description: string
}

export interface WorkbenchDomainPack {
	id: WorkbenchDomain
	label: string
	shortLabel: string
	description: string
	tone: 'teal' | 'violet' | 'cyan' | 'amber'
	/**
	 * Domain packs only choose visible workbench UI. Request routing still happens
	 * per prompt and selection, so selecting Architecture never selects Isoflow as
	 * a mutation surface.
	 */
	agentRoute: 'auto'
	defaultSurface: 'native-tldraw'
	toolProfile: WorkbenchToolProfileId | null
	overlays: {
		/** @deprecated Visible canvas tools are selected by toolProfile. */
		workflow: boolean
		isoflow: boolean
		htmlMockup: boolean
		mlIntern: boolean
		terminalSession: boolean
	}
	templates: readonly WorkbenchTemplateSummary[]
}

export const DEFAULT_WORKBENCH_DOMAIN: WorkbenchDomain = 'architecture'

export const WORKBENCH_DOMAIN_PACKS: Readonly<
	Record<WorkbenchDomain, WorkbenchDomainPack>
> = {
	architecture: {
		id: 'architecture',
		label: 'Architecture',
		shortLabel: 'ARCH',
		description:
			'System design on the native canvas, with explicit Isoflow embeds when needed.',
		tone: 'teal',
		agentRoute: 'auto',
		defaultSurface: 'native-tldraw',
		toolProfile: null,
		overlays: {
			workflow: false,
			isoflow: true,
			htmlMockup: false,
			mlIntern: false,
			terminalSession: true,
		},
		templates: [
			{
				id: 'system-context',
				label: 'System Context',
				description:
					'Actors, system boundary, core responsibility, and external dependency.',
			},
			{
				id: 'decision-graph',
				label: 'Decision Graph',
				description:
					'Assumptions, evidence, options, and an inspectable decision.',
			},
			{
				id: 'change-radar',
				label: 'Change Radar',
				description:
					'Now, next, and later changes connected to affected components.',
			},
		],
	},
	ml: {
		id: 'ml',
		label: 'ML / LLM',
		shortLabel: 'ML',
		description:
			'ML workflows and the terminal-primary ML-Intern canvas bridge.',
		tone: 'violet',
		agentRoute: 'auto',
		defaultSurface: 'native-tldraw',
		toolProfile: 'ml-workflow',
		overlays: {
			workflow: true,
			isoflow: false,
			htmlMockup: false,
			mlIntern: true,
			terminalSession: false,
		},
		templates: [
			{
				id: 'experiment-loop',
				label: 'Experiment Loop',
				description:
					'Hypothesis, data, training, evaluation, and iteration decision.',
			},
			{
				id: 'evaluation-pipeline',
				label: 'Evaluation Pipeline',
				description:
					'Candidates and test data through scorecards and promotion authority.',
			},
			{
				id: 'model-delivery-map',
				label: 'Model Delivery Map',
				description:
					'Evidence gate, packaging, bounded rollout, runtime, and rollback risk.',
			},
		],
	},
	uiux: {
		id: 'uiux',
		label: 'UI / UX',
		shortLabel: 'UI',
		description:
			'Native tldraw for flows, wireframes, annotations, and bounded AI context.',
		tone: 'cyan',
		agentRoute: 'auto',
		defaultSurface: 'native-tldraw',
		toolProfile: null,
		overlays: {
			workflow: false,
			isoflow: false,
			htmlMockup: true,
			mlIntern: false,
			terminalSession: false,
		},
		templates: [
			{
				id: 'user-flow',
				label: 'User Flow',
				description:
					'Editable screens, decisions, controls, and observable user states.',
			},
			{
				id: 'wireframe-screen-set',
				label: 'Wireframe Set',
				description:
					'A compact multi-screen flow built from native frames and controls.',
			},
			{
				id: 'component-anatomy',
				label: 'Component Anatomy',
				description:
					'Content hierarchy, state semantics, and accessibility annotations.',
			},
		],
	},
	product: {
		id: 'product',
		label: 'Product / PM',
		shortLabel: 'PM',
		description:
			'Reusable workflow nodes for planning, decisions, artifacts, and human gates.',
		tone: 'amber',
		agentRoute: 'auto',
		defaultSurface: 'native-tldraw',
		toolProfile: 'product-planning',
		overlays: {
			workflow: true,
			isoflow: false,
			htmlMockup: false,
			mlIntern: false,
			terminalSession: false,
		},
		templates: [
			{
				id: 'product-roadmap',
				label: 'Product Roadmap',
				description:
					'Lanes, initiatives, milestones, decisions, and delivery risk.',
			},
			{
				id: 'delivery-timeline',
				label: 'Delivery Timeline',
				description:
					'Sequenced implementation, validation, release, and go/no-go gates.',
			},
			{
				id: 'opportunity-decision',
				label: 'Opportunity Decision',
				description:
					'Opportunity, intended outcome, options, evidence, and a decision gate.',
			},
		],
	},
}

export function isWorkbenchDomain(value: unknown): value is WorkbenchDomain {
	return (
		typeof value === 'string' &&
		WORKBENCH_DOMAINS.includes(value as WorkbenchDomain)
	)
}

export function resolveWorkbenchDomain(
	value: unknown,
	fallback: WorkbenchDomain = DEFAULT_WORKBENCH_DOMAIN
): WorkbenchDomain {
	if (isWorkbenchDomain(value)) return value
	return isWorkbenchDomain(fallback) ? fallback : DEFAULT_WORKBENCH_DOMAIN
}

export function resolveWorkbenchDomainPack(
	value: unknown,
	fallback: WorkbenchDomain = DEFAULT_WORKBENCH_DOMAIN
): WorkbenchDomainPack {
	return WORKBENCH_DOMAIN_PACKS[resolveWorkbenchDomain(value, fallback)]
}
