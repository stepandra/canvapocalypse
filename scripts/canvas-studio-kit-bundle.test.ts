import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const builder = readFileSync(
	new URL('./build-canvas-studio-kit-bundle.mjs', import.meta.url),
	'utf8'
)
const offlineConfig = readFileSync(
	new URL('./tldraw-desktop-eval-lab-config.tsx', import.meta.url),
	'utf8'
)

describe('Canvas Studio kit export boundary', () => {
	it('bundles the public module without host paths and externalizes shared runtimes', () => {
		expect(builder).toContain("client/canvas-studio/index.ts")
		expect(builder).toContain("external: ['react', 'react/*', 'react-dom', 'react-dom/*', 'tldraw']")
		expect(builder).not.toContain('/Users/')
	})

	it('wires contribution registrations into the Offline config', () => {
		expect(offlineConfig).toContain('CANVAPOCALYPSE_CANVAS_KIT_COMPOSITION.shapeUtils')
		expect(offlineConfig).toContain('CANVAPOCALYPSE_CANVAS_KIT_COMPOSITION.bindingUtils')
		expect(offlineConfig).toContain('CANVAPOCALYPSE_CANVAS_KIT_COMPOSITION.tools')
	})
})
