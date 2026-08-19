import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
	CanvasExamplesTestEditor,
	installCanvasExamplesTestDom,
} from '../canvas-examples/foundations/testEditor'
import { ensureWorkbenchModePages, WORKBENCH_PAGE_DEFINITIONS } from './workbenchPages'

describe('Workbench page-per-mode setup', () => {
	let editor: CanvasExamplesTestEditor
	let cleanupDom: () => void

	beforeEach(() => {
		cleanupDom = installCanvasExamplesTestDom()
		editor = new CanvasExamplesTestEditor()
	})

	afterEach(() => {
		editor.dispose()
		cleanupDom()
	})

	it('preserves the stock page as Freeform and defaults a fresh document to Architecture', () => {
		const originalPageId = editor.getCurrentPageId()
		ensureWorkbenchModePages(editor)

		expect(editor.getPage(originalPageId)).toMatchObject({
			name: 'Freeform',
			meta: { lens: 'freeform' },
		})
		expect(editor.getPages()).toHaveLength(WORKBENCH_PAGE_DEFINITIONS.length)
		expect(editor.getCurrentPage()).toMatchObject({
			name: 'Architecture',
			meta: { lens: 'architecture' },
		})
		expect(
			editor.getPages().map((page) => [page.name, page.meta?.lens])
		).toEqual(
			expect.arrayContaining([
				['Workflow', 'workflow'],
				['Botflow', 'botflow'],
				['Flight Deck', 'flight-deck'],
			])
		)
	})

	it('selects a requested page and remains idempotent', () => {
		ensureWorkbenchModePages(editor, 'product')
		const pageIds = editor.getPages().map((page) => page.id)
		expect(editor.getCurrentPage()).toMatchObject({
			name: 'Product/PM',
			meta: { lens: 'product' },
		})

		ensureWorkbenchModePages(editor, 'product')
		expect(editor.getPages().map((page) => page.id)).toEqual(pageIds)
	})

	it('can open the dedicated Grok workspace directly', () => {
		ensureWorkbenchModePages(editor, 'agents-models')

		expect(editor.getCurrentPage()).toMatchObject({
			name: 'Agents/Models',
			meta: { lens: 'agents-models' },
		})
	})
})
