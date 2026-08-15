import {
	CANVAS_EXAMPLE_STORIES,
	getCanvasExampleStory,
	type CanvasExampleStory,
} from './manifest'

export type CanvasExamplesRoute =
	| { kind: 'gallery'; story: CanvasExampleStory }
	| { kind: 'full'; story: CanvasExampleStory }
	| { kind: 'not-found' }

export function getCanvasExamplePath(
	story: Pick<CanvasExampleStory, 'category' | 'id'>,
	full = false
) {
	const path = `/examples/${story.category}/${story.id}`
	return full ? `${path}/full` : path
}

export function getDefaultCanvasExamplePath() {
	return getCanvasExamplePath(CANVAS_EXAMPLE_STORIES[0])
}

export function deriveCanvasExamplesRoute(pathname: string): CanvasExamplesRoute {
	const segments = pathname.split('/').filter(Boolean)
	if (segments.length === 0 || (segments.length === 1 && segments[0] === 'examples')) {
		return { kind: 'gallery', story: CANVAS_EXAMPLE_STORIES[0] }
	}
	if (segments[0] !== 'examples' || (segments.length !== 3 && segments.length !== 4)) {
		return { kind: 'not-found' }
	}
	const story = getCanvasExampleStory(segments[1], segments[2])
	if (!story) return { kind: 'not-found' }
	if (segments.length === 4 && segments[3] !== 'full') return { kind: 'not-found' }
	return { kind: segments.length === 4 ? 'full' : 'gallery', story }
}

export function isCanvasExamplesPath(pathname: string) {
	return pathname === '/examples' || pathname.startsWith('/examples/')
}
