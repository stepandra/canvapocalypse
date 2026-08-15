import { useCallback, useEffect, useState } from 'react'

const navigationEvent = 'canvas-examples:navigate'

export function navigateCanvasExamples(href: string, replace = false) {
	if (replace) window.history.replaceState({}, '', href)
	else window.history.pushState({}, '', href)
	window.dispatchEvent(new Event(navigationEvent))
}

export function useCanvasExamplesLocation() {
	const [location, setLocation] = useState(() => ({
		pathname: window.location.pathname,
		search: window.location.search,
	}))

	useEffect(() => {
		const update = () =>
			setLocation({ pathname: window.location.pathname, search: window.location.search })
		window.addEventListener('popstate', update)
		window.addEventListener(navigationEvent, update)
		return () => {
			window.removeEventListener('popstate', update)
			window.removeEventListener(navigationEvent, update)
		}
	}, [])

	return location
}

export function useCanvasExamplesLink() {
	return useCallback((event: React.MouseEvent<HTMLAnchorElement>) => {
		if (
			event.defaultPrevented ||
			event.button !== 0 ||
			event.metaKey ||
			event.ctrlKey ||
			event.shiftKey ||
			event.altKey ||
			event.currentTarget.target === '_blank'
		) {
			return
		}
		const href = event.currentTarget.getAttribute('href')
		if (!href || !href.startsWith('/')) return
		event.preventDefault()
		navigateCanvasExamples(href)
	}, [])
}
