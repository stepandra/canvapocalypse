import type { CanvasExampleStory } from './manifest'

const ignoredTerms = new Set(['a', 'the'])

export function getCanvasExampleSearchTerms(value: string) {
	return value
		.trim()
		.toLowerCase()
		.split(/\s+/)
		.filter((term) => term.length > 0 && !ignoredTerms.has(term))
}

export function matchesCanvasExampleSearch(
	story: Pick<CanvasExampleStory, 'title' | 'keywords'>,
	query: string
) {
	const terms = getCanvasExampleSearchTerms(query)
	if (terms.length === 0) return true

	const title = story.title.toLowerCase()
	const keywords = story.keywords.map((keyword) => keyword.toLowerCase())
	return terms.every(
		(term) => title.includes(term) || keywords.some((keyword) => keyword.includes(term))
	)
}

export function searchCanvasExamples(
	stories: readonly CanvasExampleStory[],
	query: string
) {
	return stories.filter((story) => matchesCanvasExampleSearch(story, query))
}
