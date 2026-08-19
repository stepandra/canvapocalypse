import type { PluginAPI } from '@ampcode/plugin'
import { fileURLToPath } from 'node:url'
import {
	createAmpTldrawCompanionClient,
	resolveProjectCanvasTarget,
	startWorkbenchBridge,
} from '../../scripts/amp-tldraw-companion-runtime.mjs'
import { loadOrCreateHtmlMockupResidentCapability } from '../../scripts/html-mockup-resident-capability.mjs'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const client = createAmpTldrawCompanionClient({
	startBridge: () => startWorkbenchBridge({
		residentCapability: loadOrCreateHtmlMockupResidentCapability({ cwd: repoRoot }),
	}),
})

function render(value: unknown) {
	return JSON.stringify(value, null, 2)
}

export default function tldrawOfflineWorkbenchPlugin(amp: PluginAPI) {
	amp.registerTool({
		name: 'tldraw_capabilities',
		description:
			'Discover the compact native-tldraw capability manifest for this Amp workspace\'s sole .canvas/*.tldraw document. Call this before describe or execute. Fails closed when the project target is missing, ambiguous, or not open.',
		inputSchema: {
			type: 'object',
			properties: {},
			additionalProperties: false,
		},
		async execute() {
			if (!amp.system.workspaceRoot) {
				throw new Error('tldraw project routing requires an Amp workspace')
			}
			const canvasTarget = await resolveProjectCanvasTarget({
				workspaceRoot: amp.helpers.filePathFromURI(amp.system.workspaceRoot),
			})
			return render(await client.capabilities(canvasTarget))
		},
	})

	amp.registerTool({
		name: 'tldraw_describe_capability',
		description:
			'Hydrate the bounded input and AgentAction schema for exactly one capability from a current tldraw manifest.',
		inputSchema: {
			type: 'object',
			properties: {
				manifestId: { type: 'string', description: 'Manifest returned by tldraw_capabilities.' },
				capabilityId: {
					type: 'string',
					description: 'One capability id from that manifest.',
				},
			},
			required: ['manifestId', 'capabilityId'],
			additionalProperties: false,
		},
		async execute(input: Record<string, unknown>) {
			return render(await client.describe(input))
		},
	})

	amp.registerTool({
		name: 'tldraw_execute',
		description:
			'Inspect, semantically read, or mutate one explicit native-tldraw selection/area. Inspect first, then pass its contextRef with the hydrated capability’s bounded query/action plan. Waits for and returns the local canvas receipt.',
		inputSchema: {
			type: 'object',
			properties: {
				manifestId: { type: 'string' },
				capabilityId: { type: 'string' },
				context: { enum: ['selection', 'selection-or-area'] },
				contextRef: {
					type: 'string',
					description:
						'Required for mutation and custom semantic reads; returned by a succeeded canvas.inspect receipt.',
				},
				idempotencyKey: {
					type: 'string',
					description: 'Stable retry key for this exact bounded operation.',
				},
				actions: {
					type: 'array',
					maxItems: 24,
					description:
						'Required for mutation and custom semantic reads, omitted for base inspection. Must match the hydrated capability schema.',
					items: { type: 'object' },
				},
			},
			required: ['manifestId', 'capabilityId', 'context'],
			additionalProperties: false,
		},
		async execute(input: Record<string, unknown>) {
			return render(await client.execute(input))
		},
	})
}
