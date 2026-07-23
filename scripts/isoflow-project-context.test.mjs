import assert from 'node:assert/strict'
import { mkdir, mkdtemp, realpath, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { resolveIsoflowProjectContext } from './isoflow-project-context.mjs'

test('resolves projectRoot from the selected workspace', async () => {
	const root = await mkdtemp(join(tmpdir(), 'isoflow-project-context-'))
	const studioRoot = join(root, 'isoflow-studio')
	const projectRoot = join(root, 'source-project')
	await mkdir(join(studioRoot, 'workspaces'), { recursive: true })
	await mkdir(projectRoot)
	await writeFile(
		join(studioRoot, 'workspaces', 'demo.json'),
		JSON.stringify({ projectId: 'demo', projectRoot: '../source-project' })
	)

	const context = await resolveIsoflowProjectContext({ projectId: 'demo', studioRoot })

	assert.equal(context.projectId, 'demo')
	assert.equal(context.projectRoot, await realpath(projectRoot))
})

test('rejects a browser-supplied traversal projectId', async () => {
	await assert.rejects(
		resolveIsoflowProjectContext({
			projectId: '../../private',
			studioRoot: '/unused',
		}),
		(error) => error.statusCode === 400
	)
})

test('rejects an unknown allowlisted workspace', async () => {
	const root = await mkdtemp(join(tmpdir(), 'isoflow-project-context-'))
	await mkdir(join(root, 'workspaces'), { recursive: true })

	await assert.rejects(
		resolveIsoflowProjectContext({
			projectId: 'missing',
			studioRoot: root,
		}),
		(error) => error.statusCode === 404
	)
})
