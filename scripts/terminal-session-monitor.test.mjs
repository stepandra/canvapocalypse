import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { test } from 'node:test'
import {
	inspectTerminalSession,
	resolveExactZellijSession,
	ZELLIJ_LIST_SESSIONS_ARGV,
} from './terminal-session-monitor.mjs'

function fakeSpawn(stdout, exitCode = 0, calls = []) {
	return (bin, argv, options) => {
		calls.push({ bin, argv, options })
		const child = new EventEmitter()
		child.stdout = new PassThrough()
		child.stderr = new PassThrough()
		child.kill = () => {}
		queueMicrotask(() => {
			child.stdout.end(stdout)
			child.stderr.end()
			child.emit('close', exitCode)
		})
		return child
	}
}

test('status inspection uses one non-mutating fixed Zellij argv with shell disabled', async () => {
	const calls = []
	const result = await inspectTerminalSession({
		role: 'architecture',
		env: { TLDRAW_ZELLIJ_ARCHITECT_SESSION: 'private-architect-session' },
		spawnImpl: fakeSpawn('private-architect-session\n', 0, calls),
		now: Date.parse('2026-07-27T00:00:00.000Z'),
	})

	assert.equal(result.state, 'available')
	assert.match(result.sessionRef, /^zj_[a-f0-9]{24}$/)
	assert.deepEqual(calls, [
		{
			bin: 'zellij',
			argv: [...ZELLIJ_LIST_SESSIONS_ARGV],
			options: {
				shell: false,
				stdio: ['ignore', 'pipe', 'pipe'],
			},
		},
	])
	assert.equal(JSON.stringify(result).includes('private-architect-session'), false)
	assert.equal(JSON.stringify(result).includes('command'), false)
})

test('unconfigured, missing, and duplicate role targets fail closed without exposing names', async () => {
	const unconfigured = await inspectTerminalSession({
		role: 'ml',
		env: {},
		spawnImpl: fakeSpawn('/private/project-a\nsensitive-pane-title\n'),
	})
	const missing = await inspectTerminalSession({
		role: 'ml',
		env: { TLDRAW_ZELLIJ_ML_SESSION: 'expected-private-target' },
		spawnImpl: fakeSpawn('other-private-target\n'),
	})
	const duplicate = await inspectTerminalSession({
		role: 'ml',
		env: { TLDRAW_ZELLIJ_ML_SESSION: 'duplicate-private-target' },
		spawnImpl: fakeSpawn('duplicate-private-target\nduplicate-private-target\n'),
	})

	assert.equal(unconfigured.state, 'unconfigured')
	assert.equal(missing.state, 'missing')
	assert.equal(duplicate.state, 'ambiguous')
	assert.equal('sessionRef' in unconfigured, false)
	assert.equal('sessionRef' in missing, false)
	assert.equal('sessionRef' in duplicate, false)
	assert.equal(JSON.stringify(unconfigured).includes('/private/project-a'), false)
	assert.equal(JSON.stringify(unconfigured).includes('sensitive-pane-title'), false)
	assert.equal(JSON.stringify(missing).includes('other-private-target'), false)
	assert.equal(JSON.stringify(duplicate).includes('duplicate-private-target'), false)
})

test('an opaque ref binds subsequent status checks to one exact existing session', async () => {
	const initial = await inspectTerminalSession({
		role: 'architecture',
		env: { TLDRAW_ZELLIJ_ARCHITECT_SESSION: 'architect' },
		spawnImpl: fakeSpawn('architect\n'),
	})
	const exact = await inspectTerminalSession({
		role: 'architecture',
		sessionRef: initial.sessionRef,
		env: { TLDRAW_ZELLIJ_ARCHITECT_SESSION: 'architect' },
		spawnImpl: fakeSpawn('other\narchitect\n'),
	})
	const stale = await inspectTerminalSession({
		role: 'architecture',
		sessionRef: initial.sessionRef,
		env: { TLDRAW_ZELLIJ_ARCHITECT_SESSION: 'architect' },
		spawnImpl: fakeSpawn('other\n'),
	})

	assert.equal(exact.state, 'available')
	assert.equal(exact.sessionRef, initial.sessionRef)
	assert.equal(stale.state, 'missing')
})

test('opaque refs are role-bound and never activate an unconfigured role', async () => {
	const initial = await inspectTerminalSession({
		role: 'architecture',
		env: { TLDRAW_ZELLIJ_ARCHITECT_SESSION: 'shared-private-name' },
		spawnImpl: fakeSpawn('shared-private-name\n'),
	})
	const unconfigured = await inspectTerminalSession({
		role: 'ml',
		sessionRef: initial.sessionRef,
		env: {},
		spawnImpl: fakeSpawn('shared-private-name\n'),
	})
	const configuredDifferentRole = await inspectTerminalSession({
		role: 'ml',
		sessionRef: initial.sessionRef,
		env: { TLDRAW_ZELLIJ_ML_SESSION: 'shared-private-name' },
		spawnImpl: fakeSpawn('shared-private-name\n'),
	})

	assert.equal(unconfigured.state, 'unconfigured')
	assert.equal('sessionRef' in unconfigured, false)
	assert.equal(configuredDifferentRole.state, 'missing')
	assert.equal('sessionRef' in configuredDifferentRole, false)
})

test('configured role target disambiguates multiple sessions without exposing its name', async () => {
	const result = await inspectTerminalSession({
		role: 'ml',
		env: { TLDRAW_ZELLIJ_ML_SESSION: 'ml-intern-private' },
		spawnImpl: fakeSpawn('architect\nml-intern-private\n'),
	})

	assert.equal(result.state, 'available')
	assert.equal(JSON.stringify(result).includes('ml-intern-private'), false)
})

test('duplicate exact targets remain ambiguous', () => {
	assert.deepEqual(
		resolveExactZellijSession({
			sessions: ['same', 'same'],
			configuredSessionName: 'same',
			role: 'architecture',
		}),
		{ state: 'ambiguous' }
	)
})
