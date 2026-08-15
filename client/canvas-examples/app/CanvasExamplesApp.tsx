import { useEffect } from 'react'
import { CanvasExampleStorySurface } from './CanvasExampleStorySurface'
import { CanvasExamplesGallery } from './CanvasExamplesGallery'
import { navigateCanvasExamples, useCanvasExamplesLocation } from './navigation'
import { deriveCanvasExamplesRoute, getDefaultCanvasExamplePath } from './routes'

export function CanvasExamplesApp() {
	const location = useCanvasExamplesLocation()
	const route = deriveCanvasExamplesRoute(location.pathname)

	useEffect(() => {
		if (location.pathname === '/examples' || location.pathname === '/examples/') {
			navigateCanvasExamples(`${getDefaultCanvasExamplePath()}${location.search}`, true)
		}
	}, [location.pathname, location.search])

	if (route.kind === 'not-found') {
		return (
			<main className="canvas-examples-not-found">
				<span>404</span>
				<h1>Canvas story not found</h1>
				<p>The requested category or story id is not registered in the manifest.</p>
				<a href={getDefaultCanvasExamplePath()}>Open the first story</a>
			</main>
		)
	}

	if (route.kind === 'full') {
		return (
			<main className="canvas-example-full" data-story-id={route.story.id}>
				<CanvasExampleStorySurface story={route.story} />
			</main>
		)
	}

	return <CanvasExamplesGallery story={route.story} />
}
