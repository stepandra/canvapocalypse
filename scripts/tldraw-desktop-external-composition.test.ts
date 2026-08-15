import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const builderPath = new URL(
	'./build-tldraw-desktop-eval-lab.mjs',
	import.meta.url
)
const temporaryRoots: string[] = []

function fixtureContributionModule({
	kitId,
	presetId,
	shapeType,
	bindingType,
	toolId,
}: {
	kitId: string
	presetId: string
	shapeType: string
	bindingType: string
	toolId: string
}) {
	return `
export class FixtureShape { static type = ${JSON.stringify(shapeType)} }
export class FixtureBinding { static type = ${JSON.stringify(bindingType)} }
export class FixtureTool { static id = ${JSON.stringify(toolId)} }
export const CANVAS_KIT_CONTRIBUTIONS = [{
	kitId: ${JSON.stringify(kitId)},
	presetIds: [${JSON.stringify(presetId)}],
	shapeUtils: [FixtureShape],
	bindingUtils: [FixtureBinding],
	tools: [FixtureTool],
	insertPreset(_editor, requestedPresetId) {
		if (requestedPresetId !== ${JSON.stringify(presetId)}) throw new Error('unroutable fixture preset')
		return {
			kitId: ${JSON.stringify(kitId)},
			presetId: requestedPresetId,
			shapeIds: ['fixture-shape'],
			bindingIds: ['fixture-binding'],
		}
	},
}]
`
}

async function createFixtureRoot() {
	const root = await mkdtemp(join(tmpdir(), 'canvas-studio-composition-'))
	temporaryRoots.push(root)
	await mkdir(join(root, 'modules'), { recursive: true })
	await writeFile(
		join(root, 'modules', 'grok.mjs'),
		fixtureContributionModule({
			kitId: 'grok.agents',
			presetId: 'grok.workflow',
			shapeType: 'agents-models-node',
			bindingType: 'grok-agent-binding',
			toolId: 'workflow-agent',
		})
	)
	await writeFile(
		join(root, 'modules', 'structurizr.mjs'),
		fixtureContributionModule({
			kitId: 'structurizr.c4',
			presetId: 'structurizr.system-context',
			shapeType: 'structurizr-element',
			bindingType: 'structurizr-relationship',
			toolId: 'structurizr-element-tool',
		})
	)
	return root
}

async function buildFixtureConfig(
	root: string,
	moduleNames = ['grok.mjs', 'structurizr.mjs'],
	timeout = 15_000
) {
	const outfile = join(
		process.cwd(),
		'.tldraw-html-mockups',
		'offline-build',
		`fixture-${Date.now()}-${Math.random().toString(36).slice(2)}.js`
	)
	try {
		const contributionArguments = moduleNames.flatMap((moduleName) => [
			'--contribution',
			join(root, 'modules', moduleName),
		])
		await execFileAsync(
			process.execPath,
			[
				fileURLToPath(builderPath),
				'--outfile',
				outfile,
				'--skip-status',
				...contributionArguments,
			],
			{
				cwd: process.cwd(),
				timeout,
				env: {
					...process.env,
					TLDRAW_HTML_MOCKUP_RESIDENT_CAPABILITY: `hr_${'a'.repeat(43)}`,
				},
			}
		)
		return outfile
	} catch (error) {
		await rm(outfile, { force: true })
		throw error
	}
}

afterEach(async () => {
	await Promise.all(
		temporaryRoots.splice(0).map((root) =>
			rm(root, { recursive: true, force: true })
		)
	)
})

describe('tldraw Offline external Canvas Kit composition', () => {
	it('statically composes two modules into the config and palette route table', async () => {
		const root = await createFixtureRoot()
		const outfile = await buildFixtureConfig(root)
		const bundle = await readFile(outfile, 'utf8')
		await rm(outfile, { force: true })

		for (const id of [
			'grok.agents',
			'grok.workflow',
			'structurizr.c4',
			'structurizr.system-context',
			'agents-models-node',
			'grok-agent-binding',
			'workflow-agent',
			'structurizr-element',
			'structurizr-relationship',
			'structurizr-element-tool',
		]) {
			expect(bundle).toContain(id)
		}
		expect(bundle).toContain('Canvas Studio preset')
		expect(bundle).toContain('unroutable fixture preset')
		expect(bundle).toContain('fixture-shape')
		expect(bundle).toContain('fixture-binding')
		expect(bundle).toContain('canvas-studio-palette')
		expect(bundle).not.toContain('import(')
	})

	it('preflights an externalized timer module outside a dependency tree and exits promptly', async () => {
		const root = await createFixtureRoot()
		await writeFile(
			join(root, 'modules', 'timer.js'),
			`import { createShapeId } from 'tldraw'
import { TLDOCUMENT_ID } from '@tldraw/tlschema'
import { createRoot } from 'react-dom/client'
setInterval(() => {}, 60_000)
class TimerShape {
	static type = 'timer-shape'
	static sharedRuntimeProof = [TLDOCUMENT_ID, createRoot]
}
export const CANVAS_KIT_CONTRIBUTIONS = [{
	kitId: 'timer.kit',
	presetIds: ['timer.preset'],
	shapeUtils: [TimerShape],
	bindingUtils: [],
	tools: [],
	insertPreset() {
		return { kitId: 'timer.kit', presetId: 'timer.preset', shapeIds: [createShapeId('timer')], bindingIds: [] }
	},
}]
`
		)
		expect((await readdir(root)).sort()).toEqual(['modules'])
		await expect(readdir(join(root, 'node_modules'))).rejects.toMatchObject({
			code: 'ENOENT',
		})
		expect((await readdir(join(root, 'modules'))).sort()).toEqual([
			'grok.mjs',
			'structurizr.mjs',
			'timer.js',
		])

		const startedAt = Date.now()
		const outfile = await buildFixtureConfig(root, ['timer.js'], 10_000)
		const elapsedMs = Date.now() - startedAt
		const bundle = await readFile(outfile, 'utf8')
		await rm(outfile, { force: true })

		expect(elapsedMs).toBeLessThan(10_000)
		expect(bundle).toContain('timer.kit')
		expect(bundle).toContain('timer-shape')
		expect(bundle).toMatch(/from\s*["']@tldraw\/tlschema["']/)
		expect(bundle).toMatch(/from\s*["']react-dom\/client["']/)
	}, 15_000)

	it.each([
		{
			label: 'kit',
			duplicate: { kitId: 'grok.agents' },
			error: /Duplicate Canvas Studio kit id grok\.agents/,
		},
		{
			label: 'preset',
			duplicate: { presetId: 'grok.workflow' },
			error: /Duplicate Canvas Studio preset id grok\.workflow/,
		},
		{
			label: 'shape registration',
			duplicate: { shapeType: 'agents-models-node' },
			error: /Duplicate Canvas Studio shape id agents-models-node/,
		},
		{
			label: 'binding registration',
			duplicate: { bindingType: 'grok-agent-binding' },
			error: /Duplicate Canvas Studio binding id grok-agent-binding/,
		},
		{
			label: 'tool registration',
			duplicate: { toolId: 'workflow-agent' },
			error: /Duplicate Canvas Studio tool id workflow-agent/,
		},
	])('rejects duplicate $label ids before writing a config', async ({ duplicate, error }) => {
		const root = await createFixtureRoot()
		await writeFile(
			join(root, 'modules', 'structurizr.mjs'),
			fixtureContributionModule({
				kitId: duplicate.kitId ?? 'structurizr.c4',
				presetId: duplicate.presetId ?? 'structurizr.system-context',
				shapeType: duplicate.shapeType ?? 'structurizr-element',
				bindingType:
					duplicate.bindingType ?? 'structurizr-relationship',
				toolId: duplicate.toolId ?? 'structurizr-element-tool',
			})
		)

		const buildDirectory = join(
			process.cwd(),
			'.tldraw-html-mockups',
			'offline-build'
		)
		const before = new Set(await readdir(buildDirectory).catch(() => []))
		await expect(buildFixtureConfig(root)).rejects.toThrow(error)
		const added = (await readdir(buildDirectory).catch(() => [])).filter(
			(entry) => !before.has(entry) && entry.startsWith('fixture-')
		)
		expect(added).toEqual([])
	})
})
