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

async function buildFixtureConfig(root: string) {
	const outfile = join(
		process.cwd(),
		'.tldraw-html-mockups',
		'offline-build',
		`fixture-${Date.now()}-${Math.random().toString(36).slice(2)}.js`
	)
	try {
		await execFileAsync(
			process.execPath,
			[
				fileURLToPath(builderPath),
				'--outfile',
				outfile,
				'--skip-status',
				'--contribution',
				join(root, 'modules', 'grok.mjs'),
				'--contribution',
				join(root, 'modules', 'structurizr.mjs'),
			],
			{
				cwd: process.cwd(),
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

	it('rejects duplicate contribution registration ids before writing a config', async () => {
		const root = await createFixtureRoot()
		await writeFile(
			join(root, 'modules', 'structurizr.mjs'),
			fixtureContributionModule({
				kitId: 'structurizr.c4',
				presetId: 'structurizr.system-context',
				shapeType: 'agents-models-node',
				bindingType: 'structurizr-relationship',
				toolId: 'structurizr-element-tool',
			})
		)

		const buildDirectory = join(
			process.cwd(),
			'.tldraw-html-mockups',
			'offline-build'
		)
		const before = new Set(await readdir(buildDirectory).catch(() => []))
		await expect(buildFixtureConfig(root)).rejects.toThrow(
			/Duplicate Canvas Studio shape id agents-models-node/
		)
		const added = (await readdir(buildDirectory).catch(() => [])).filter(
			(entry) => !before.has(entry) && entry.startsWith('fixture-')
		)
		expect(added).toEqual([])
	})
})
