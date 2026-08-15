import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const builder = readFileSync(
	new URL('./build-canvas-studio-kit-bundle.mjs', import.meta.url),
	'utf8'
)
const offlineConfigFactory = readFileSync(
	new URL('./tldraw-desktop-eval-lab-config-factory.tsx', import.meta.url),
	'utf8'
)
const offlineBuilder = readFileSync(
	new URL('./build-tldraw-desktop-eval-lab.mjs', import.meta.url),
	'utf8'
)

describe('Canvas Studio kit export boundary', () => {
	it('bundles the public module without host paths and externalizes shared runtimes', () => {
		expect(builder).toContain("client/canvas-studio/index.ts")
		expect(builder).toContain("external: ['react', 'react/*', 'react-dom', 'react-dom/*', 'tldraw']")
		expect(builder).not.toContain('/Users/')
	})

	it('wires one supplied composition into registrations and palette dispatch', () => {
		expect(offlineConfigFactory).toContain('...composition.shapeUtils')
		expect(offlineConfigFactory).toContain('composition.bindingUtils')
		expect(offlineConfigFactory).toContain('...composition.tools')
		expect(offlineConfigFactory).toContain(
			'<WorkbenchShell app={app} canvasKitComposition={composition} />'
		)
	})

	it('builds a static wrapper from repeatable trusted local contribution modules', () => {
		expect(offlineBuilder).toContain("readArguments('--contribution')")
		expect(offlineBuilder).toContain('CANVAS_KIT_CONTRIBUTIONS as contribution')
		expect(offlineBuilder).toContain(
			'createCanvapocalypseCanvasKitComposition(externalContributions)'
		)
		expect(offlineBuilder).toContain('await import(moduleUrl.href)')
		expect(offlineBuilder).not.toContain('/Users/')
	})
})
