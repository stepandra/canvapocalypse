import { describe, expect, it } from 'vitest'
import {
	LEAD_ACQUISITION_EXPERIMENTS,
	LEAD_EXPERIMENT_CATALOG_VERSION,
	getLeadExperiment,
} from './experimentCatalog'

describe('lead acquisition experiment catalog', () => {
	it('contains the full proposed acquisition loop as versioned experiments', () => {
		expect(LEAD_EXPERIMENT_CATALOG_VERSION).toBe('lead-acquisition/v1')
		expect(LEAD_ACQUISITION_EXPERIMENTS.map((experiment) => experiment.id)).toEqual([
			'intent-search-sweep',
			'marketplace-demand-scan',
			'indirect-signal-mining',
			'persona-panel-calibration',
			'qualification-rubric',
			'taskbrief-inbound',
			'public-reply',
			'permissioned-direct-contact',
			'referral-intro',
			'message-framing-ab',
			'secure-channel-handoff',
			'close-offer-calibration',
		])
	})

	it('gives every experiment a schematic rather than a photo dependency', () => {
		for (const experiment of LEAD_ACQUISITION_EXPERIMENTS) {
			expect(experiment.schematic.nodes.length).toBeGreaterThanOrEqual(3)
			expect(experiment.schematic.edges.length).toBeGreaterThanOrEqual(2)
			expect(experiment.hypothesis).not.toHaveLength(0)
			expect(experiment.method).not.toHaveLength(0)
			expect(experiment.successMetric).not.toHaveLength(0)
			expect(experiment.guardrail).not.toHaveLength(0)
			expect(JSON.stringify(experiment)).not.toMatch(/https?:\/\/|unsplash|photo/i)
		}
	})

	it('resolves catalog entries by stable id', () => {
		expect(getLeadExperiment('secure-channel-handoff')?.phase).toBe('HANDOFF')
		expect(getLeadExperiment('missing')).toBeUndefined()
	})
})
