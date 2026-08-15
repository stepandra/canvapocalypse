import type { ComponentType } from 'react'

export const STORY_CATEGORIES = [
	'getting-started',
	'shapes-bindings',
	'tools-overlays',
	'inspectors',
	'bridges',
	'documents',
	'regression',
] as const

export type StoryCategory = (typeof STORY_CATEGORIES)[number]

export const STORY_CATEGORY_LABELS: Record<StoryCategory, string> = {
	'getting-started': 'Getting started',
	'shapes-bindings': 'Shapes & bindings',
	'tools-overlays': 'Tools & overlays',
	inspectors: 'Inspectors',
	bridges: 'Bridges',
	documents: 'Documents',
	regression: 'Regression',
}

export interface CanvasExampleStory {
	id: string
	category: StoryCategory
	title: string
	description: string
	keywords: readonly string[]
	source: {
		label: string
		path: string
		href?: string
	}
	runtimeRequirements: readonly string[]
	contributions: {
		kits: readonly string[]
		runtime: readonly string[]
	}
	shapeTypes: readonly string[]
	bindingTypes: readonly string[]
	toolTypes: readonly string[]
	requiredServiceIds: readonly string[]
	load: () => Promise<{ default: ComponentType }>
}

const storyIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const runtimeIdPattern = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/
const categories = new Set<string>(STORY_CATEGORIES)

function assertNonEmpty(value: string, field: string) {
	if (!value.trim()) throw new Error(`Canvas example ${field} must not be empty`)
}

function assertStringList(values: readonly string[], field: string, allowEmpty = false) {
	if (!allowEmpty && values.length === 0) {
		throw new Error(`Canvas example ${field} must include at least one value`)
	}
	const normalized = new Set<string>()
	for (const value of values) {
		assertNonEmpty(value, field)
		const key = value.trim().toLowerCase()
		if (normalized.has(key)) {
			throw new Error(`Canvas example ${field} contains duplicate value "${value}"`)
		}
		normalized.add(key)
	}
}

export function validateCanvasExampleManifest(
	stories: readonly CanvasExampleStory[]
): readonly CanvasExampleStory[] {
	if (stories.length === 0) throw new Error('Canvas examples manifest must not be empty')

	const routeKeys = new Set<string>()
	for (const story of stories) {
		if (!categories.has(story.category)) {
			throw new Error(`Unknown canvas example category "${story.category}"`)
		}
		if (!storyIdPattern.test(story.id)) {
			throw new Error(`Invalid canvas example id "${story.id}"`)
		}
		const routeKey = `${story.category}/${story.id}`
		if (routeKeys.has(routeKey)) {
			throw new Error(`Duplicate canvas example route "${routeKey}"`)
		}
		routeKeys.add(routeKey)

		assertNonEmpty(story.title, 'title')
		assertNonEmpty(story.description, 'description')
		assertNonEmpty(story.source.label, 'source label')
		assertNonEmpty(story.source.path, 'source path')
		if (!story.source.path.startsWith('client/canvas-examples/')) {
			throw new Error(`Canvas example source must stay under client/canvas-examples: ${story.source.path}`)
		}
		assertStringList(story.keywords, 'keywords')
		assertStringList(story.runtimeRequirements, 'runtime requirements')
		assertStringList(story.contributions.kits, 'kit contributions')
		assertStringList(story.contributions.runtime, 'runtime contributions')
		assertStringList(story.shapeTypes, 'shape types', true)
		assertStringList(story.bindingTypes, 'binding types', true)
		assertStringList(story.toolTypes, 'tool types', true)
		assertStringList(story.requiredServiceIds, 'required service ids', true)
		for (const id of [
			...story.shapeTypes,
			...story.bindingTypes,
			...story.toolTypes,
			...story.requiredServiceIds,
		]) {
			if (!runtimeIdPattern.test(id)) {
				throw new Error(`Invalid canvas example runtime id "${id}"`)
			}
		}
	}

	return stories
}

const stories = [
	{
		id: 'add-connected-shape',
		category: 'shapes-bindings',
		title: 'Add connected shape',
		description:
			'Adds a geo shape and a bound arrow to the current selection in one native editor transaction and one undo step.',
		keywords: ['arrow', 'binding', 'connected', 'transaction', 'undo'],
		source: {
			label: 'ConnectedShapeStory.tsx',
			path: 'client/canvas-examples/foundations/connected-shape/ConnectedShapeStory.tsx',
			href: 'https://tldraw.dev/examples/create-arrow',
		},
		runtimeRequirements: ['Browser DOM', 'tldraw editor runtime'],
		contributions: {
			kits: ['Canvas Examples foundations'],
			runtime: ['Native geo and arrow records', 'Native arrow bindings', 'Editor history'],
		},
		shapeTypes: ['geo', 'arrow'],
		bindingTypes: ['arrow'],
		toolTypes: ['select'],
		requiredServiceIds: [],
		load: () => import('../foundations/connected-shape/ConnectedShapeStory'),
	},
	{
		id: 'inspector-panel',
		category: 'inspectors',
		title: 'Inspector panel',
		description:
			'Renders selection, shape properties, shared styles, and native bindings from live editor signals outside the canvas.',
		keywords: ['bindings', 'editorprovider', 'panel', 'selection', 'signals', 'usevalue'],
		source: {
			label: 'InspectorPanelStory.tsx',
			path: 'client/canvas-examples/foundations/inspector-panel/InspectorPanelStory.tsx',
			href: 'https://tldraw.dev/examples/inspector-panel',
		},
		runtimeRequirements: ['Browser DOM', 'React', 'tldraw editor runtime'],
		contributions: {
			kits: ['Canvas Examples foundations'],
			runtime: ['EditorProvider', 'useValue selection signal', 'Binding inspection'],
		},
		shapeTypes: ['geo', 'arrow'],
		bindingTypes: ['arrow'],
		toolTypes: ['select'],
		requiredServiceIds: [],
		load: () => import('../foundations/inspector-panel/InspectorPanelStory'),
	},
] as const satisfies readonly CanvasExampleStory[]

export const CANVAS_EXAMPLE_STORIES = validateCanvasExampleManifest(stories)

export function getCanvasExampleStory(category: string, id: string) {
	return CANVAS_EXAMPLE_STORIES.find(
		(story) => story.category === category && story.id === id
	)
}
