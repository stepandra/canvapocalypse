import { lazy, Suspense, useMemo } from 'react'
import type { CanvasExampleStory } from './manifest'

export function CanvasExampleStorySurface({ story }: { story: CanvasExampleStory }) {
	const Story = useMemo(() => lazy(story.load), [story])
	return (
		<Suspense fallback={<CanvasExampleLoading title={story.title} />}>
			<Story />
		</Suspense>
	)
}

function CanvasExampleLoading({ title }: { title: string }) {
	return (
		<div className="canvas-example-loading" role="status" aria-live="polite">
			<span className="canvas-example-loading__dot" />
			<span>Loading {title}…</span>
		</div>
	)
}
