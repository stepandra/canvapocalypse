import { Editor, PageRecordType } from 'tldraw'
import type { WorkbenchDomain } from './domainPacks'

export const WORKBENCH_PAGE_DEFINITIONS = [
	{ mode: 'architecture', title: 'Architecture' },
	{ mode: 'ml', title: 'ML/LLM' },
	{ mode: 'uiux', title: 'UI/UX' },
	{ mode: 'product', title: 'Product/PM' },
	{ mode: 'agents-models', title: 'Agents/Models' },
	{ mode: 'workflow', title: 'Workflow' },
	{ mode: 'botflow', title: 'Botflow' },
	{ mode: 'flight-deck', title: 'Flight Deck' },
	{ mode: 'freeform', title: 'Freeform' },
] as const

export type WorkbenchPageMode = (typeof WORKBENCH_PAGE_DEFINITIONS)[number]['mode']

function normalizedPageKey(value: string) {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
}

function pageMode(page: ReturnType<Editor['getCurrentPage']>) {
	const lens =
		page.meta && typeof page.meta.lens === 'string' ? page.meta.lens : page.name
	const key = normalizedPageKey(lens)
	return WORKBENCH_PAGE_DEFINITIONS.find(
		(definition) =>
			normalizedPageKey(definition.mode) === key ||
			normalizedPageKey(definition.title) === key
	)?.mode
}

export function getWorkbenchPageMode(editor: Editor) {
	return pageMode(editor.getCurrentPage())
}

/**
 * Materialize the page-per-mode workbench contract without deleting user
 * pages. A lone stock "Page 1" becomes Freeform so existing content remains
 * available while Architecture can be the default focused mode.
 */
export function ensureWorkbenchModePages(
	editor: Editor,
	requestedMode?: WorkbenchDomain | WorkbenchPageMode
) {
	const pagesBefore = editor.getPages()
	const recognizedBefore = pagesBefore.filter((page) => pageMode(page))
	const wasFreshDocument = recognizedBefore.length === 0
	editor.run(
		() => {
			if (
				pagesBefore.length === 1 &&
				wasFreshDocument &&
				/^Page(?:\s+1)?$/i.test(pagesBefore[0].name)
			) {
				editor.updatePage({
					id: pagesBefore[0].id,
					name: 'Freeform',
					meta: { ...pagesBefore[0].meta, lens: 'freeform' },
				})
			}

			for (const definition of WORKBENCH_PAGE_DEFINITIONS) {
				let page = editor.getPages().find(
					(candidate) =>
						pageMode(candidate) === definition.mode ||
						candidate.name === definition.title
				)
				if (!page) {
					const id = PageRecordType.createId(
						`canvapocalypse-${definition.mode}`
					)
					editor.createPage({
						id,
						name: definition.title,
						meta: { lens: definition.mode },
					})
					page = editor.getPage(id)
				}
				if (page && page.meta?.lens !== definition.mode) {
					editor.updatePage({
						id: page.id,
						meta: { ...page.meta, lens: definition.mode },
					})
				}
			}
		},
		{ history: 'ignore' }
	)

	const currentMode = pageMode(editor.getCurrentPage())
	const targetMode = requestedMode ?? (wasFreshDocument ? 'architecture' : currentMode)
	const target = editor.getPages().find((page) => pageMode(page) === targetMode)
	if (target && target.id !== editor.getCurrentPageId()) {
		editor.setCurrentPage(target.id)
	}
}
