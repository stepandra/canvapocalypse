import { useEffect, useMemo, useState } from 'react'
import { CanvasExampleStorySurface } from './CanvasExampleStorySurface'
import {
	CANVAS_EXAMPLE_STORIES,
	STORY_CATEGORIES,
	STORY_CATEGORY_LABELS,
	type CanvasExampleStory,
} from './manifest'
import { useCanvasExamplesLink } from './navigation'
import { getCanvasExamplePath } from './routes'
import { searchCanvasExamples } from './search'
import { StoryInfo } from './StoryInfo'

export function CanvasExamplesGallery({ story }: { story: CanvasExampleStory }) {
	const [query, setQuery] = useState(() => new URLSearchParams(window.location.search).get('filter') ?? '')
	const [infoOpen, setInfoOpen] = useState(false)
	const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
	const handleLink = useCanvasExamplesLink()
	const filteredStories = useMemo(
		() => searchCanvasExamples(CANVAS_EXAMPLE_STORIES, query),
		[query]
	)

	useEffect(() => {
		setInfoOpen(false)
		setMobileMenuOpen(false)
	}, [story])
	useEffect(() => {
		const search = new URLSearchParams(window.location.search)
		if (query) search.set('filter', query)
		else search.delete('filter')
		const next = `${window.location.pathname}${search.size ? `?${search}` : ''}`
		window.history.replaceState({}, '', next)
	}, [query])
	useEffect(() => {
		if (!infoOpen) return
		const close = (event: KeyboardEvent) => {
			if (event.key === 'Escape') setInfoOpen(false)
		}
		window.addEventListener('keydown', close)
		return () => window.removeEventListener('keydown', close)
	}, [infoOpen])

	return (
		<div className="canvas-examples-gallery">
			<nav
				className="canvas-examples-sidebar"
				data-mobile-open={mobileMenuOpen}
				aria-label="Canvas Examples"
			>
				<header className="canvas-examples-sidebar__header">
					<a href="/examples" onClick={handleLink} aria-label="Canvas Examples home">
						<CanvasExamplesMark />
						<span>Canvas Examples</span>
					</a>
					<a
						href={getCanvasExamplePath(story, true)}
						onClick={handleLink}
						className="canvas-examples-icon-button"
						aria-label="Collapse sidebar"
						title="View standalone story"
					>
						<CollapseIcon />
					</a>
				</header>

				<div className="canvas-examples-search">
					<SearchIcon />
					<input
						type="search"
						value={query}
						onChange={(event) => setQuery(event.currentTarget.value)}
						placeholder="Search stories…"
						aria-label="Search Canvas Examples"
					/>
					{query && (
						<button type="button" onClick={() => setQuery('')} aria-label="Clear search">
							×
						</button>
					)}
				</div>

				<div className="canvas-examples-sidebar__rule" />
				<div className="canvas-examples-sidebar__stories">
					{STORY_CATEGORIES.map((category) => {
						const stories = filteredStories.filter((candidate) => candidate.category === category)
						if (stories.length === 0) return null
						return (
							<section className="canvas-examples-category" key={category}>
								<h2>{STORY_CATEGORY_LABELS[category]}</h2>
								<ul>
									{stories.map((candidate) => (
										<li key={candidate.id} data-active={candidate === story}>
											<a href={getCanvasExamplePath(candidate)} onClick={handleLink}>
												{candidate.title}
											</a>
											{candidate === story && (
												<div className="canvas-examples-story-actions">
													<button
														type="button"
														onClick={() => setInfoOpen(true)}
														aria-label="Info"
														title="Story information"
													>
														<InfoIcon />
													</button>
													<a
														href={getCanvasExamplePath(candidate, true)}
														onClick={handleLink}
														aria-label="Standalone"
														title="View standalone story"
													>
														<StandaloneIcon />
													</a>
												</div>
											)}
										</li>
									))}
								</ul>
							</section>
						)
					})}
					{filteredStories.length === 0 && (
						<div className="canvas-examples-search-empty">
							<p>No stories found</p>
							<button type="button" onClick={() => setQuery('')}>
								Clear search
							</button>
						</div>
					)}
				</div>
			</nav>

			<main className="canvas-examples-content">
				<div className="canvas-examples-mobile-bar">
					<button
						type="button"
						onClick={() => setMobileMenuOpen((open) => !open)}
						aria-expanded={mobileMenuOpen}
						aria-label="Browse Canvas Examples"
					>
						<CanvasExamplesMark />
						<span>{story.title}</span>
					</button>
					<button type="button" onClick={() => setInfoOpen(true)} aria-label="Info">
						<InfoIcon />
					</button>
					<a href={getCanvasExamplePath(story, true)} onClick={handleLink} aria-label="Standalone">
						<StandaloneIcon />
					</a>
				</div>
				<CanvasExampleStorySurface story={story} />
			</main>

			{mobileMenuOpen && (
				<button
					type="button"
					className="canvas-examples-mobile-backdrop"
					onClick={() => setMobileMenuOpen(false)}
					aria-label="Close Canvas Examples navigation"
				/>
			)}
			{infoOpen && <StoryInfo story={story} onClose={() => setInfoOpen(false)} />}
		</div>
	)
}

function CanvasExamplesMark() {
	return (
		<svg aria-hidden="true" viewBox="0 0 28 28">
			<rect x="2" y="2" width="24" height="24" rx="7" />
			<path d="M8 10.5h12M8 14h7M8 17.5h10" />
		</svg>
	)
}

function SearchIcon() {
	return (
		<svg aria-hidden="true" viewBox="0 0 20 20">
			<circle cx="8.5" cy="8.5" r="5.5" />
			<path d="m13 13 4 4" />
		</svg>
	)
}

function InfoIcon() {
	return (
		<svg aria-hidden="true" viewBox="0 0 20 20">
			<circle cx="10" cy="10" r="7" />
			<path d="M10 9v5M10 6.25v.5" />
		</svg>
	)
}

function StandaloneIcon() {
	return (
		<svg aria-hidden="true" viewBox="0 0 20 20">
			<path d="M7 4H4v12h12v-3M10 4h6v6M9 11l7-7" />
		</svg>
	)
}

function CollapseIcon() {
	return (
		<svg aria-hidden="true" viewBox="0 0 20 20">
			<path d="M5 3.5h10v13H5zM9 3.5v13M7 8l-2 2 2 2" />
		</svg>
	)
}
