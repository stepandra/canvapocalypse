import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
	new URL('./tldraw-desktop-grok-config.tsx', import.meta.url),
	'utf8'
)

describe('Grok workflow toolbox', () => {
	it('is a specialized graph palette, not one monolithic config editor', () => {
		expect(source).toContain('Grok workflow')
		expect(source).toContain("{ kind: 'stage', icon: 'action'")
		expect(source).toContain("{ kind: 'agent', icon: 'agent'")
		expect(source).toContain("{ kind: 'persona', icon: 'prompt-template'")
		expect(source).toContain("{ kind: 'capability', icon: 'context'")
		expect(source).toContain("{ kind: 'skill', icon: 'rich-output'")
		expect(source).toContain("{ kind: 'gate', icon: 'decision'")
		expect(source).toContain("{ kind: 'module', icon: 'map'")
		expect(source).toContain('AGENTS_MODELS_PRESETS.map')
		expect(source).toContain("dispatch({ kind: 'apply' })")
		expect(source).toContain("dispatch({ kind: 'play' })")
		expect(source).toContain("dispatch({ kind: 'preflight' })")
		expect(source).toContain('GrokNodeInspector')
		expect(source).toContain('connectFromId')
		expect(source).toContain('Parallel agent')
		expect(source).toContain('Sync config.toml')
		expect(source).toContain('viewBox="0 0 512 509.641"')
		expect(source).toContain('M213.235 306.019l178.976-180.002')
		expect(source).toContain('--grok-stage:#596a7c')
		expect(source).toContain('--grok-agent:#526d65')
		expect(source).toContain('--grok-persona:#816a4c')
		expect(source).not.toContain('#65d8c2')
		expect(source).not.toContain('#8b5cf6')
		expect(source).toContain('getShapeVisibility')
		expect(source).toContain("return 'hidden'")
		expect(source).toContain('<textarea')
		expect(source).toContain("value={meta.capabilityMode || 'all'}")
		expect(source).toContain('select .agents/skills entry')
		expect(source).not.toContain('Rhai source')
	})
})
