import { describe, expect, it } from 'vitest'
import {
	CANVAS_EXAMPLE_STORIES,
	STORY_CATEGORIES,
	type CanvasExampleStory,
	validateCanvasExampleManifest,
} from './manifest'
import { deriveCanvasExamplesRoute, getCanvasExamplePath } from './routes'
import { searchCanvasExamples } from './search'

const story = CANVAS_EXAMPLE_STORIES[0]

function cloneStory(overrides: Partial<CanvasExampleStory> = {}): CanvasExampleStory {
	return {
		...story,
		keywords: [...story.keywords],
		runtimeRequirements: [...story.runtimeRequirements],
		contributions: {
			kits: [...story.contributions.kits],
			runtime: [...story.contributions.runtime],
		},
		shapeTypes: [...story.shapeTypes],
		bindingTypes: [...story.bindingTypes],
		toolTypes: [...story.toolTypes],
		requiredServiceIds: [...story.requiredServiceIds],
		...overrides,
	}
}

describe('Canvas Examples manifest', () => {
	it('accepts every supported category and rejects invalid ids, categories, and duplicate routes', () => {
		expect(STORY_CATEGORIES).toEqual([
			'getting-started',
			'shapes-bindings',
			'tools-overlays',
			'inspectors',
			'bridges',
			'documents',
			'regression',
		])
		expect(validateCanvasExampleManifest(CANVAS_EXAMPLE_STORIES)).toBe(CANVAS_EXAMPLE_STORIES)
		expect(() => validateCanvasExampleManifest([cloneStory({ id: 'Bad Id' })])).toThrow(
			'Invalid canvas example id'
		)
		expect(() =>
			validateCanvasExampleManifest([
				cloneStory({ category: 'unknown' as CanvasExampleStory['category'] }),
			])
		).toThrow('Unknown canvas example category')
		expect(() => validateCanvasExampleManifest([cloneStory(), cloneStory()])).toThrow(
			'Duplicate canvas example route'
		)
	})

	it('requires source, runtime, contribution, and canvas type metadata', () => {
		for (const registered of CANVAS_EXAMPLE_STORIES) {
			expect(registered.description).not.toBe('')
			expect(registered.source.path).toMatch(/^client\/canvas-examples\//)
			expect(registered.runtimeRequirements.length).toBeGreaterThan(0)
			expect(registered.contributions.kits.length).toBeGreaterThan(0)
			expect(registered.contributions.runtime.length).toBeGreaterThan(0)
			expect(Array.isArray(registered.shapeTypes)).toBe(true)
			expect(Array.isArray(registered.bindingTypes)).toBe(true)
			expect(Array.isArray(registered.toolTypes)).toBe(true)
			expect(Array.isArray(registered.requiredServiceIds)).toBe(true)
		}
	})
})

describe('Canvas Examples search', () => {
	it('matches case-insensitive title and keyword terms and requires every meaningful term', () => {
		expect(searchCanvasExamples(CANVAS_EXAMPLE_STORIES, 'CONNECTED')).toEqual([
			CANVAS_EXAMPLE_STORIES[0],
		])
		expect(searchCanvasExamples(CANVAS_EXAMPLE_STORIES, 'signals binding')).toEqual([
			CANVAS_EXAMPLE_STORIES[2],
		])
		expect(searchCanvasExamples(CANVAS_EXAMPLE_STORIES, 'the panel')).toEqual([
			CANVAS_EXAMPLE_STORIES[2],
		])
		expect(searchCanvasExamples(CANVAS_EXAMPLE_STORIES, 'missing')).toEqual([])
	})
})

describe('Canvas Examples routes', () => {
	it('derives gallery, full, and not-found routes from registered metadata', () => {
		const galleryPath = getCanvasExamplePath(story)
		const fullPath = getCanvasExamplePath(story, true)
		expect(deriveCanvasExamplesRoute(galleryPath)).toEqual({ kind: 'gallery', story })
		expect(deriveCanvasExamplesRoute(fullPath)).toEqual({ kind: 'full', story })
		expect(deriveCanvasExamplesRoute('/examples/nope/nope')).toEqual({ kind: 'not-found' })
		expect(deriveCanvasExamplesRoute('/examples/shapes-bindings/add-connected-shape/extra')).toEqual({
			kind: 'not-found',
		})
	})

	it('uses the exact same lazy story registration for gallery and /full routes', () => {
		const gallery = deriveCanvasExamplesRoute(getCanvasExamplePath(story))
		const full = deriveCanvasExamplesRoute(getCanvasExamplePath(story, true))
		if (gallery.kind === 'not-found' || full.kind === 'not-found') throw new Error('story route missing')
		expect(gallery.story).toBe(full.story)
		expect(gallery.story.load).toBe(full.story.load)
	})
})
