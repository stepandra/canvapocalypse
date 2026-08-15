import type { CanvasExampleStory } from './manifest'

export function StoryInfo({ story, onClose }: { story: CanvasExampleStory; onClose: () => void }) {
	return (
		<div className="canvas-example-info-backdrop" onMouseDown={onClose}>
			<aside
				className="canvas-example-info"
				role="dialog"
				aria-modal="true"
				aria-labelledby="canvas-example-info-title"
				onMouseDown={(event) => event.stopPropagation()}
			>
				<header className="canvas-example-info__header">
					<div>
						<span className="canvas-example-info__eyebrow">Story information</span>
						<h2 id="canvas-example-info-title">{story.title}</h2>
					</div>
					<button type="button" onClick={onClose} aria-label="Close Info">
						×
					</button>
				</header>

				<p className="canvas-example-info__description">{story.description}</p>
				<InfoSection title="Source">
					<div className="canvas-example-info__source">
						<strong>{story.source.label}</strong>
						<code>{story.source.path}</code>
						{story.source.href && (
							<a href={story.source.href} target="_blank" rel="noreferrer">
								Open purpose reference
							</a>
						)}
					</div>
				</InfoSection>
				<InfoSection title="Runtime requirements">
					<ChipList values={story.runtimeRequirements} />
				</InfoSection>
				<InfoSection title="Contributions">
					<InfoSubsection title="Kits" values={story.contributions.kits} />
					<InfoSubsection title="Runtime" values={story.contributions.runtime} />
				</InfoSection>
				<InfoSection title="Canvas types">
					<InfoSubsection title="Shapes" values={story.shapeTypes} empty="None" />
					<InfoSubsection title="Bindings" values={story.bindingTypes} empty="None" />
					<InfoSubsection title="Tools" values={story.toolTypes} empty="None" />
				</InfoSection>
				<InfoSection title="Required services">
					<ChipList values={story.requiredServiceIds} empty="None — runs locally" />
				</InfoSection>
			</aside>
		</div>
	)
}

function InfoSection({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<section className="canvas-example-info__section">
			<h3>{title}</h3>
			{children}
		</section>
	)
}

function InfoSubsection({
	title,
	values,
	empty,
}: {
	title: string
	values: readonly string[]
	empty?: string
}) {
	return (
		<div className="canvas-example-info__subsection">
			<h4>{title}</h4>
			<ChipList values={values} empty={empty} />
		</div>
	)
}

function ChipList({ values, empty = 'None' }: { values: readonly string[]; empty?: string }) {
	if (values.length === 0) return <p className="canvas-example-info__empty">{empty}</p>
	return (
		<ul className="canvas-example-info__chips">
			{values.map((value) => (
				<li key={value}>{value}</li>
			))}
		</ul>
	)
}
