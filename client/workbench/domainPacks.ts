import type { TLUiIconType } from 'tldraw'
import type { WorkbenchDomainIconName } from './WorkbenchDomainIcon'
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
	icon: TLUiIconType
}

export interface WorkbenchDomainPack {
	id: WorkbenchDomain
	label: string
	icon: WorkbenchDomainIconName
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
		designSystem: boolean
		stitch: boolean
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
		icon: 'architecture',
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
			designSystem: false,
			stitch: false,
			mlIntern: false,
			terminalSession: true,
		},
		templates: [
			{
				id: 'system-context',
				label: 'System Context',
				icon: 'group',
				description:
					'Actors, system boundary, core responsibility, and external dependency.',
			},
			{
				id: 'decision-graph',
				label: 'Decision Graph',
				icon: 'geo-diamond',
				description:
					'Assumptions, evidence, options, and an inspectable decision.',
			},
			{
				id: 'change-radar',
				label: 'Change Radar',
				icon: 'arrow-cycle',
				description:
					'Now, next, and later changes connected to affected components.',
			},
		],
	},
	ml: {
		id: 'ml',
		label: 'ML / LLM',
		icon: 'ml',
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
			designSystem: false,
			stitch: false,
			mlIntern: true,
			terminalSession: false,
		},
		templates: [
			{
				id: 'experiment-loop',
				label: 'Experiment Loop',
				icon: 'arrow-cycle',
				description:
					'Hypothesis, data, training, evaluation, and iteration decision.',
			},
			{
				id: 'evaluation-pipeline',
				label: 'Evaluation Pipeline',
				icon: 'geo-check-box',
				description:
					'Candidates and test data through scorecards and promotion authority.',
			},
			{
				id: 'model-delivery-map',
				label: 'Model Delivery Map',
				icon: 'share-1',
				description:
					'Evidence gate, packaging, bounded rollout, runtime, and rollback risk.',
			},
		],
	},
	uiux: {
		id: 'uiux',
		label: 'UI / UX',
		icon: 'uiux',
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
			designSystem: true,
			stitch: true,
			mlIntern: false,
			terminalSession: false,
		},
		templates: [
			{
				id: 'user-flow',
				label: 'User Flow',
				icon: 'spline-cubic',
				description:
					'Editable screens, decisions, controls, and observable user states.',
			},
			{
				id: 'wireframe-screen-set',
				label: 'Wireframe Set',
				icon: 'tool-frame',
				description:
					'A compact multi-screen flow built from native frames and controls.',
			},
			{
				id: 'component-anatomy',
				label: 'Component Anatomy',
				icon: 'corners',
				description:
					'Content hierarchy, state semantics, and accessibility annotations.',
			},
		],
	},
	product: {
		id: 'product',
		label: 'Product / PM',
		icon: 'product',
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
			designSystem: false,
			stitch: false,
			mlIntern: false,
			terminalSession: false,
		},
		templates: [
			{
				id: 'product-roadmap',
				label: 'Product Roadmap',
				icon: 'stack-horizontal',
				description:
					'Lanes, initiatives, milestones, decisions, and delivery risk.',
			},
			{
				id: 'delivery-timeline',
				label: 'Delivery Timeline',
				icon: 'arrow-arc',
				description:
					'Sequenced implementation, validation, release, and go/no-go gates.',
			},
			{
				id: 'opportunity-decision',
				label: 'Opportunity Decision',
				icon: 'geo-diamond',
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
