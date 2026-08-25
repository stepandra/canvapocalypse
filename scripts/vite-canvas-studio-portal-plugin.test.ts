import { createHash } from 'node:crypto'
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
	CANVAS_STUDIO_PORTAL_VIRTUAL_ID,
	createCanvasStudioPortalPlugin,
	parsePortalBuildConfig,
	parsePortalManifest,
} from './vite-canvas-studio-portal-plugin.mjs'

const temporaryDirectories: string[] = []

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0)) {
		rmSync(directory, { recursive: true, force: true })
	}
})

function fixtureModule() {
	const directory = mkdtempSync(join(tmpdir(), 'canvas-studio-portal-'))
	temporaryDirectories.push(directory)
	const path = join(directory, 'canonical-kit.js')
	const source = 'export const CANVAS_KIT_CONTRIBUTIONS = []\n'
	writeFileSync(path, source)
	return {
		path,
		sha256: createHash('sha256').update(source).digest('hex'),
	}
}

function loadVirtualModule(manifest?: string, portalBuildConfig?: string) {
	const plugin = createCanvasStudioPortalPlugin(manifest, portalBuildConfig)
	const resolved = plugin.resolveId?.call({} as never, CANVAS_STUDIO_PORTAL_VIRTUAL_ID)
	if (typeof resolved !== 'string') throw new Error('Portal plugin did not resolve its module')
	const loaded = plugin.load?.call({} as never, resolved)
	if (typeof loaded !== 'string') throw new Error('Portal plugin did not load its module')
	return loaded
}

function portalBuildConfig(path: string) {
	return {
		schema: 'canvas.portal-build/v1',
		project: {
			name: 'project',
			pages: [
				{ id: 'workflow', title: 'Workflow' },
				{ id: 'flight-deck', title: 'Flight Deck' },
			],
			kits: {
				workflow: ['grok.workflow'],
				'flight-deck': ['hermes.flight-deck'],
			},
		},
		catalog: {
			version: 1,
			kits: [
				{
					id: 'grok.workflow',
					title: 'Grok workflow',
					kind: 'workflow',
					runtime: 'custom-nodes',
					tags: [],
					presets: [],
				},
				{
					id: 'hermes.flight-deck',
					title: 'Hermes Flight Deck',
					kind: 'profile-harness',
					runtime: 'custom-nodes',
					tags: [],
					presets: [],
				},
			],
		},
		contributions: [path],
		runtime: {
			projectApi: '/__canvas/project',
			sourceApi: '/__canvas/source',
			inventorySha256: 'a'.repeat(64),
			publicUrl: 'https://canvas.example',
			bridges: [
				{
					serviceId: 'grok-config-supervisor',
					kitId: 'grok.workflow',
					routes: [
						{ prefix: '/__canvas-grok-supervisor', stripPrefix: true },
					],
				},
				{
					serviceId: 'hermes-flight-deck-bridge',
					kitId: 'hermes.flight-deck',
					routes: [{ prefix: '/__canvas-hermes', stripPrefix: true }],
				},
			],
		},
	}
}

describe('Canvas Studio locked portal module', () => {
	it('has no eager external contribution in a normal standalone build', () => {
		const source = loadVirtualModule()
		expect(source).toContain('CANVAS_STUDIO_PORTAL_LOCKED = false')
		expect(source).toContain('CANVAS_STUDIO_PORTAL_CONTRIBUTIONS = []')
		expect(source).not.toContain('import ')
		expect(source).not.toMatch(/grok|hermes|botflow/i)
	})

	it('locks one hash-verified canonical absolute module into the generated entry', () => {
		const fixture = fixtureModule()
		const manifest = JSON.stringify([fixture])
		expect(parsePortalManifest(manifest)).toEqual([
			{ path: realpathSync(fixture.path), sha256: fixture.sha256 },
		])
		const source = loadVirtualModule(manifest)
		expect(source).toContain(`from ${JSON.stringify(realpathSync(fixture.path))}`)
		expect(source).toContain('CANVAS_STUDIO_PORTAL_LOCKED = true')
		expect(source).toContain('...contribution0')
	})

	it('validates and embeds canvas.portal-build/v1 runtime bridges without targets', () => {
		const fixture = fixtureModule()
		const config = portalBuildConfig(fixture.path)
		const parsed = parsePortalBuildConfig(JSON.stringify(config))
		expect(parsed.runtime.bridges).toEqual(config.runtime.bridges)
		const source = loadVirtualModule(undefined, JSON.stringify(config))
		expect(source).toContain('CANVAS_STUDIO_PORTAL_LOCKED = true')
		expect(source).toContain(
			'.filter((contribution) => ["grok.workflow","hermes.flight-deck"].includes(contribution.kitId))'
		)
		expect(source).toContain('CANVAS_STUDIO_PORTAL_RUNTIME')
		expect(source).toContain('/__canvas/source')
		expect(source).toContain('/__canvas-grok-supervisor')
		expect(source).toContain('/__canvas-hermes')
		expect(source).not.toContain('127.0.0.1')
		expect(source).not.toContain('healthUrl')
	})

	it.each([
		{
			label: 'proxy target',
			change: (config: ReturnType<typeof portalBuildConfig>) => {
				;(config.runtime.bridges[0].routes[0] as Record<string, unknown>).target =
					'http://127.0.0.1:5187'
			},
		},
		{
			label: 'disabled kit',
			change: (config: ReturnType<typeof portalBuildConfig>) => {
				config.runtime.bridges[0].kitId = 'botflow.telegram-journey'
			},
		},
		{
			label: 'unsafe prefix',
			change: (config: ReturnType<typeof portalBuildConfig>) => {
				config.runtime.bridges[0].routes[0].prefix = 'http://127.0.0.1:5187'
			},
		},
	])('rejects a bridge with a $label', ({ change }) => {
		const fixture = fixtureModule()
		const config = portalBuildConfig(fixture.path)
		change(config)
		expect(() => parsePortalBuildConfig(JSON.stringify(config))).toThrow()
	})

	it('fails before bundling when canonical bytes do not match', () => {
		const fixture = fixtureModule()
		expect(() =>
			parsePortalManifest(
				JSON.stringify([{ path: fixture.path, sha256: '0'.repeat(64) }])
			)
		).toThrow(/hash mismatch/)
	})

	it('rejects empty locked manifests and duplicate canonical paths', () => {
		const fixture = fixtureModule()
		expect(() => parsePortalManifest('[]')).toThrow(/requires at least one/)
		expect(() =>
			parsePortalManifest(JSON.stringify([fixture, fixture]))
		).toThrow(/Duplicate Canvas Studio portal contribution path/)
	})
})
