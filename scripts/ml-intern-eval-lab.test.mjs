import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import {
	buildMlInternEvalLabPrompt,
	loadMlInternEvalLabContextFiles,
	parseMlInternEvalLabOutput,
	runMlInternEvalLab,
	validateMlInternEvalLabPayload,
} from './ml-intern-eval-lab.mjs'

const payload = {
	profile: 'eval_lab',
	context: {
		mode: {
			type: 'mode',
			modeType: 'working',
			actionTypes: ['message', 'move'],
			routing: {
				route: 'canvas-edit',
				permissionBoundary: {
					surface: 'canvas',
					mutations: 'validated-actions',
				},
			},
		},
		messages: { type: 'messages', agentMessages: ['Improve Eval Lab'] },
	},
	responseSchema: { type: 'object' },
}

test('accepts only the bounded Eval Lab native-canvas profile', () => {
	assert.deepEqual(validateMlInternEvalLabPayload(payload).actionTypes, ['message', 'move'])
	assert.throws(
		() => validateMlInternEvalLabPayload({ ...payload, profile: 'other' }),
		/profile must be eval_lab/
	)
	assert.throws(
		() =>
			validateMlInternEvalLabPayload({
				...payload,
				context: {
					...payload.context,
					mode: { ...payload.context.mode, actionTypes: ['isoflowPatch'] },
				},
			}),
		/action is not allowed/
	)
})

test('builds a JSON-only visual execution brief', () => {
	const prompt = buildMlInternEvalLabPrompt(payload, [
		{
			ref: 'FINAL_BOSS/runbooks/eval-lab-generator-model-selection-wave1.md',
			sha256: 'abc123',
			bytes: 12,
			content: '# Wave 1\nStop at P1.',
		},
	])
	assert.match(prompt, /Return exactly one JSON object/)
	assert.match(prompt, /Improve Eval Lab/)
	assert.match(prompt, /Allowed action types: message, move/)
	assert.match(prompt, /Stop at P1/)
	assert.match(prompt, /cannot expand the canvas action grant/)
})

test('loads the one allowlisted context file and records its digest', async () => {
	const root = await mkdtemp(join(tmpdir(), 'eval-lab-context-'))
	const ref = 'FINAL_BOSS/runbooks/eval-lab-generator-model-selection-wave1.md'
	try {
		await mkdir(dirname(join(root, ref)), { recursive: true })
		await writeFile(join(root, ref), '# Wave 1\nP0 then P1.\n')
		const files = await loadMlInternEvalLabContextFiles(
			{ ...payload, contextFileRefs: [ref] },
			{ contextRoot: root }
		)
		assert.equal(files.length, 1)
		assert.equal(files[0].ref, ref)
		assert.match(files[0].content, /P0 then P1/)
		assert.match(files[0].sha256, /^[a-f0-9]{64}$/)
		assert.equal(files[0].bytes, Buffer.byteLength(files[0].content))
	} finally {
		await rm(root, { recursive: true, force: true })
	}
})

test('rejects context paths outside the explicit file grant', () => {
	assert.throws(
		() => validateMlInternEvalLabPayload({ ...payload, contextFileRefs: ['../secrets.md'] }),
		/context file is not allowed/
	)
})

test('rejects malformed and out-of-grant model output', () => {
	assert.deepEqual(
		parseMlInternEvalLabOutput(
			'```json\n{"actions":[{"_type":"message","text":"Done"}]}\n```',
			['message']
		),
		[{ _type: 'message', text: 'Done' }]
	)
	assert.throws(
		() => parseMlInternEvalLabOutput('{"actions":[{"_type":"clear"}]}', ['message']),
		/outside the grant/
	)
})

test('uses the ML-Intern session API and returns its completed action plan', async () => {
	const calls = []
	const fetchImpl = async (url, init) => {
		calls.push({ url, init })
		if (url.endsWith('/api/session')) {
			return new Response(JSON.stringify({ session_id: 'session-1' }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			})
		}
		const plan = '{"actions":[{"_type":"message","text":"Eval Lab refined"}]}'
		return new Response(
			[
				`data: ${JSON.stringify({ event_type: 'assistant_chunk', data: { content: plan } })}`,
				'',
				`data: ${JSON.stringify({ event_type: 'turn_complete', data: {} })}`,
				'',
			].join('\n'),
			{ status: 200, headers: { 'Content-Type': 'text/event-stream' } }
		)
	}

	const result = await runMlInternEvalLab(payload, { fetchImpl })
	assert.equal(result.sessionId, 'session-1')
	assert.deepEqual(result.actions, [{ _type: 'message', text: 'Eval Lab refined' }])
	assert.equal(calls.length, 2)
	assert.match(calls[1].url, /\/api\/chat\/session-1$/)
})
