import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
	CanvasExamplesTestEditor,
	installCanvasExamplesTestDom,
} from '../canvas-examples/foundations/testEditor'
import { AgentsModelsShapeUtil as LegacyAgentsModelsShapeUtil } from '../agents-models/AgentsModelsShape'
import { buildCanvasStudioPaletteModel } from './catalog'
import { composeCanvasKitContributions } from './compose'
import { CANVAPOCALYPSE_DEFAULT_CANVAS_STUDIO_CATALOG } from './defaultCatalog'
import { CANVAPOCALYPSE_EXTERNAL_CANVAS_KIT_CONTRIBUTIONS } from './externalContributions'
import { CANVAPOCALYPSE_CANVAS_KIT_COMPOSITION } from './host'

const externalComposition = composeCanvasKitContributions(
	CANVAPOCALYPSE_EXTERNAL_CANVAS_KIT_CONTRIBUTIONS
)
const hostStyles = readFileSync(
	new URL('../../scripts/tldraw-desktop-eval-lab.css', import.meta.url),
	'utf8'
)
const paletteSource = readFileSync(new URL('./CanvasStudioPalette.tsx', import.meta.url), 'utf8')

describe('cross-repository Canvas Studio contributions', () => {
	it('registers the exact Grok and Hermes custom records without a type collision', () => {
		const grok = externalComposition.getContribution('grok.workflow')
		const hermes = externalComposition.getContribution('hermes.flight-deck')
		const agentsModelsRegistrations =
			CANVAPOCALYPSE_CANVAS_KIT_COMPOSITION.shapeUtils.filter(
				(shapeUtil) => shapeUtil.type === 'agents-models-node'
			)

		expect(grok?.shapeUtils.map((shapeUtil) => shapeUtil.type)).toEqual([
			'agents-models-node',
			'workflow-connection',
			'workflow-junction',
		])
		expect(grok?.bindingUtils.map((bindingUtil) => bindingUtil.type)).toEqual([
			'workflow-port',
			'workflow-junction',
			'workflow-layout',
		])
		expect(hermes?.shapeUtils.map((shapeUtil) => shapeUtil.type)).toEqual([
			'hermes-prompt-layer',
			'hermes-chat-branch',
			'hermes-flight-capability',
			'hermes-config-node',
		])
		expect(agentsModelsRegistrations).toEqual([
			grok?.shapeUtils.find((shapeUtil) => shapeUtil.type === 'agents-models-node'),
		])
		expect(agentsModelsRegistrations[0]).not.toBe(LegacyAgentsModelsShapeUtil)
	})

	it('registers the Grok port gesture and keeps the Botflow lifecycle live', () => {
		const botflow = externalComposition.getContribution('botflow.telegram-journey')

		expect(externalComposition.tools.map((tool) => tool.id)).toContain(
			'pointing_workflow_port'
		)
		expect(botflow?.presetIds).toEqual([
			'botflow.support',
			'botflow.lovi-v1',
			'botflow.lovi-beta',
			'botflow.lovi-alert',
		])
		expect(botflow?.onMount).toEqual(expect.any(Function))
	})

	it('gives the Grok workflow native ports, unfilled wires, compact fields, and visible-bounds framing', () => {
		expect(hostStyles).toMatch(
			/\.workflow-native-port\s*\{[^}]*position:\s*absolute;[^}]*width:\s*12px;[^}]*height:\s*12px;/s
		)
		expect(hostStyles).toMatch(
			/\.workflow-native-connection\s*>\s*path\s*\{[^}]*fill:\s*none;[^}]*stroke:\s*currentColor;[^}]*stroke-width:\s*2\.25;/s
		)
		expect(hostStyles).toMatch(
			/\.agents-models-workflow-node\.is-compact-height[\s\S]*?\.agents-models-workflow-fields\.is-responsive-fields\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/s
		)
		expect(paletteSource).toContain('Box.Common(')
		expect(paletteSource).toContain('.am?.hiddenControl')
		expect(paletteSource).toContain('editor.zoomToBounds(visibleBounds')
	})

	it.each([
		['workflow', 'Workflow', 'grok.workflow', 'grok.trusted-ml-release'],
		['botflow', 'Botflow', 'botflow.telegram-journey', 'botflow.support'],
		['flight-deck', 'Flight Deck', 'hermes.flight-deck', 'hermes.profile-canvas'],
	])(
		'exposes the %s page preset through the real web catalog and composition',
		(lens, name, kitId, presetId) => {
			const model = buildCanvasStudioPaletteModel({
				catalog: CANVAPOCALYPSE_DEFAULT_CANVAS_STUDIO_CATALOG,
				composition: CANVAPOCALYPSE_CANVAS_KIT_COMPOSITION,
				page: { name, meta: { lens } },
			})
			const kit = model.kits.find((candidate) => candidate.id === kitId)

			expect(kit?.availability).toBe('available')
			expect(kit?.presets.find((preset) => preset.id === presetId)?.availability).toBe(
				'available'
			)
		}
	)
})

describe('cross-repository preset insertion', () => {
	let editor: CanvasExamplesTestEditor
	let cleanupDom: () => void
	let dispose: (() => void) | undefined

	beforeEach(() => {
		cleanupDom = installCanvasExamplesTestDom()
		editor = new CanvasExamplesTestEditor({
			tools: [...externalComposition.tools],
			shapeUtils: [...externalComposition.shapeUtils],
			bindingUtils: [...externalComposition.bindingUtils],
		})
		dispose = externalComposition.onMount(editor) ?? undefined
	})

	afterEach(() => {
		dispose?.()
		editor.dispose()
		cleanupDom()
	})

	it.each([
		['grok.trusted-ml-release', 'grok.workflow'],
		['hermes.profile-canvas', 'hermes.flight-deck'],
		['botflow.support', 'botflow.telegram-journey'],
	])('inserts the real %s preset into the host editor', (presetId, kitId) => {
		const receipt = externalComposition.insertPreset(editor, presetId, {
			pageId: editor.getCurrentPageId(),
			point: { x: 800, y: 500 },
		})

		expect(receipt.kitId).toBe(kitId)
		expect(receipt.shapeIds.length).toBeGreaterThan(0)
		for (const shapeId of receipt.shapeIds) {
			expect(editor.getShape(shapeId)).toBeDefined()
		}
		for (const bindingId of receipt.bindingIds) {
			expect(editor.getBinding(bindingId)).toBeDefined()
		}
	})
})
