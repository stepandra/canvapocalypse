import type { PluginAPI } from '@ampcode/plugin'
import { createAmpTldrawCompanionClient } from '../../scripts/amp-tldraw-companion-runtime.mjs'

const client = createAmpTldrawCompanionClient()

function render(value: unknown) {
	return JSON.stringify(value, null, 2)
}

export default function tldrawOfflineWorkbenchPlugin(amp: PluginAPI) {
	amp.registerTool({
		name: 'tldraw_capabilities',
		description:
			'Discover the compact native-tldraw capability manifest for the one active local canvas. Call this before describe or execute. Fails closed when zero or multiple canvases are active.',
		inputSchema: {
			type: 'object',
			properties: {},
			additionalProperties: false,
		},
		async execute() {
			return render(await client.capabilities())
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
			'Inspect or mutate one explicit native-tldraw selection/area. Inspect first, then pass its contextRef with a bounded plan of complete validated AgentAction objects in absolute page coordinates. Waits for and returns the local canvas receipt.',
		inputSchema: {
			type: 'object',
			properties: {
				manifestId: { type: 'string' },
				capabilityId: { type: 'string' },
				context: { enum: ['selection', 'selection-or-area'] },
				contextRef: {
					type: 'string',
					description: 'Required for mutation; returned by a succeeded canvas.inspect receipt.',
				},
				idempotencyKey: {
					type: 'string',
					description: 'Stable retry key for this exact bounded operation.',
				},
				actions: {
					type: 'array',
					maxItems: 24,
					description:
						'Required for mutation, omitted for inspection. Must match the hydrated capability schema.',
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

	amp.logger.log(
		'tldraw offline workbench loaded: existing Amp threads can inspect and mutate one bounded local canvas'
	)
}
