import assert from 'node:assert/strict'
import { mkdtemp, readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
	WORKBENCH_SUPERVISOR_LAUNCH_AGENT_LABEL,
	installWorkbenchSupervisorLaunchAgent,
	renderWorkbenchSupervisorLaunchAgent,
	uninstallWorkbenchSupervisorLaunchAgent,
} from './install-workbench-bridge-supervisor.mjs'

test('default LaunchAgent resolves Node through its controlled PATH instead of a versioned Cellar path', () => {
	const plist = renderWorkbenchSupervisorLaunchAgent({
		scriptPath: '/tmp/supervisor.mjs',
		workingDirectory: '/tmp',
		pathValue: '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin',
	})
	assert.match(
		plist,
		/<key>ProgramArguments<\/key>\s*<array>\s*<string>\/usr\/bin\/env<\/string>\s*<string>node<\/string>\s*<string>\/tmp\/supervisor\.mjs<\/string>/,
	)
	assert.doesNotMatch(plist, /Cellar\/node/)
})

test('LaunchAgent plist uses absolute fixed program arguments and no persistent log sink', () => {
	const plist = renderWorkbenchSupervisorLaunchAgent({
		nodePath: '/opt/example/node',
		scriptPath: '/tmp/a&b/supervisor.mjs',
		workingDirectory: '/tmp/a&b',
		pathValue: '/opt/example:/usr/bin:/bin',
	})
	assert.match(
		plist,
		new RegExp(`<string>${WORKBENCH_SUPERVISOR_LAUNCH_AGENT_LABEL}</string>`),
	)
	assert.match(plist, /<string>\/opt\/example\/node<\/string>/)
	assert.match(plist, /<string>\/tmp\/a&amp;b\/supervisor\.mjs<\/string>/)
	assert.match(plist, /<key>RunAtLoad<\/key>\s*<true\/>/)
	assert.match(plist, /<key>KeepAlive<\/key>\s*<true\/>/)
	assert.equal((plist.match(/<string>\/dev\/null<\/string>/g) ?? []).length, 2)
	assert.doesNotMatch(plist, /resident-capability|x-tldraw-html-capability|hr_/)
})

test('installer writes a private plist and calls launchctl only for the current user domain', async () => {
	const root = await mkdtemp(join(tmpdir(), 'workbench-supervisor-install-'))
	const calls = []
	const launchctl = async (arguments_, options) => {
		calls.push({ arguments_, options })
	}
	const result = await installWorkbenchSupervisorLaunchAgent({
		allowNonDarwin: true,
		homeDirectory: root,
		uid: 4242,
		nodePath: '/opt/example/node',
		scriptPath: '/opt/example/workbench-bridge-supervisor.mjs',
		workingDirectory: '/opt/example/repo',
		launchctl,
	})
	const plist = await readFile(result.plistPath, 'utf8')
	assert.match(plist, /<string>\/opt\/example\/node<\/string>/)
	assert.equal((await stat(result.plistPath)).mode & 0o777, 0o600)
	assert.deepEqual(calls, [
		{
			arguments_: ['bootout', 'gui/4242', result.plistPath],
			options: { allowFailure: true },
		},
		{
			arguments_: ['bootstrap', 'gui/4242', result.plistPath],
			options: undefined,
		},
		{
			arguments_: [
				'enable',
				`gui/4242/${WORKBENCH_SUPERVISOR_LAUNCH_AGENT_LABEL}`,
			],
			options: undefined,
		},
		{
			arguments_: [
				'kickstart',
				'-k',
				`gui/4242/${WORKBENCH_SUPERVISOR_LAUNCH_AGENT_LABEL}`,
			],
			options: undefined,
		},
	])

	await uninstallWorkbenchSupervisorLaunchAgent({
		allowNonDarwin: true,
		homeDirectory: root,
		uid: 4242,
		launchctl,
	})
	await assert.rejects(() => stat(result.plistPath), { code: 'ENOENT' })
	assert.deepEqual(calls.at(-1), {
		arguments_: ['bootout', 'gui/4242', result.plistPath],
		options: { allowFailure: true },
	})
})
