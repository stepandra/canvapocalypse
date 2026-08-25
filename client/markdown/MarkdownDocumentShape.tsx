import Markdown from 'react-markdown'
import {
	BaseBoxShapeUtil,
	createShapePropsMigrationIds,
	createShapePropsMigrationSequence,
	createShapeId,
	type Editor,
	HTMLContainer,
	Rectangle2d,
	stopEventPropagation,
	T,
	type TLResizeInfo,
	type TLShape,
	useEditor,
} from 'tldraw'
import {
	createMarkdownDocumentInput,
	deriveMarkdownTitle,
	MARKDOWN_DOCUMENT_CONTRACT_SCHEMA,
	MARKDOWN_DOCUMENT_REF_PATTERN,
	MARKDOWN_DOCUMENT_REVISION_PATTERN,
	extractMarkdownLinkRefs,
	markdownDocumentBody,
	markdownDocumentRevision,
	MAX_MARKDOWN_DOCUMENT_BYTES,
	truncateUtf8,
	type MarkdownDocumentInput,
} from './markdownDocumentContract'

export {
	createMarkdownDocumentInput,
	deriveMarkdownTitle,
	markdownDocumentBody,
	markdownDocumentRevision,
	MAX_MARKDOWN_DOCUMENT_BYTES,
} from './markdownDocumentContract'

export const MARKDOWN_DOCUMENT_SHAPE_TYPE = 'markdown-document' as const
export const MARKDOWN_DOCUMENT_COLLAPSED_HEIGHT = 68
export const MARKDOWN_DOCUMENT_DEFAULT_HEIGHT = 460
export const MARKDOWN_DOCUMENT_DEFAULT_WIDTH = 520
export const MARKDOWN_DOCUMENT_MIN_HEIGHT = 240
export const MARKDOWN_DOCUMENT_MIN_WIDTH = 320

declare module '@tldraw/tlschema' {
	export interface TLGlobalShapePropsMap {
		[MARKDOWN_DOCUMENT_SHAPE_TYPE]: {
			schema: typeof MARKDOWN_DOCUMENT_CONTRACT_SCHEMA
			documentRef: string
			revision: string
			bytes: number
			w: number
			h: number
			expandedH: number
			title: string
			markdown: string
			sourceName: string
			sourceKind: 'file' | 'pasted' | 'edited'
			links: string[]
			collapsed: boolean
		}
	}
}

export type MarkdownDocumentShape = TLShape<typeof MARKDOWN_DOCUMENT_SHAPE_TYPE>

export interface MarkdownDocumentAgentContext extends MarkdownDocumentInput {
	shapeId: MarkdownDocumentShape['id']
	truncated: boolean
}

const MarkdownDocumentVersions = createShapePropsMigrationIds(
	MARKDOWN_DOCUMENT_SHAPE_TYPE,
	{ AddRevisionedSource: 1 }
)
export const MARKDOWN_DOCUMENT_MIGRATION_ID =
	MarkdownDocumentVersions.AddRevisionedSource

export const markdownDocumentShapeMigrations = createShapePropsMigrationSequence({
	sequence: [
		{
			id: MarkdownDocumentVersions.AddRevisionedSource,
			up: (props: Record<string, unknown>) => {
				const markdown = typeof props.markdown === 'string' ? props.markdown : ''
				const revision = markdownDocumentRevision(markdown)
				props.schema = MARKDOWN_DOCUMENT_CONTRACT_SCHEMA
				props.documentRef = `markdown-${revision.slice(7, 39)}`
				props.revision = revision
				props.bytes = new TextEncoder().encode(markdown).byteLength
				props.sourceKind = typeof props.sourceName === 'string' && props.sourceName
					? 'file'
					: 'pasted'
				props.links = extractMarkdownLinkRefs(markdown)
			},
			down: (props: Record<string, unknown>) => {
				delete props.schema
				delete props.documentRef
				delete props.revision
				delete props.bytes
				delete props.sourceKind
				delete props.links
			},
		},
	],
})

export class MarkdownDocumentShapeUtil extends BaseBoxShapeUtil<MarkdownDocumentShape> {
	static override type = MARKDOWN_DOCUMENT_SHAPE_TYPE
	static override props = {
		schema: T.literal(MARKDOWN_DOCUMENT_CONTRACT_SCHEMA),
		documentRef: T.string,
		revision: T.string,
		bytes: T.number,
		w: T.number,
		h: T.number,
		expandedH: T.number,
		title: T.string,
		markdown: T.string,
		sourceName: T.string,
		sourceKind: T.literalEnum('file', 'pasted', 'edited'),
		links: T.arrayOf(T.string),
		collapsed: T.boolean,
	}
	static override migrations = markdownDocumentShapeMigrations

	override getDefaultProps(): MarkdownDocumentShape['props'] {
		const input = createMarkdownDocumentInput('', '')
		return {
			...input,
			w: MARKDOWN_DOCUMENT_DEFAULT_WIDTH,
			h: MARKDOWN_DOCUMENT_COLLAPSED_HEIGHT,
			expandedH: MARKDOWN_DOCUMENT_DEFAULT_HEIGHT,
			collapsed: true,
		}
	}

	override getGeometry(shape: MarkdownDocumentShape) {
		return new Rectangle2d({
			width: shape.props.w,
			height: shape.props.h,
			isFilled: true,
		})
	}

	override onResize(
		shape: MarkdownDocumentShape,
		info: TLResizeInfo<MarkdownDocumentShape>
	) {
		const w = Math.max(
			MARKDOWN_DOCUMENT_MIN_WIDTH,
			Math.abs(shape.props.w * info.scaleX)
		)
		const h = shape.props.collapsed
			? MARKDOWN_DOCUMENT_COLLAPSED_HEIGHT
			: Math.max(
					MARKDOWN_DOCUMENT_MIN_HEIGHT,
					Math.abs(shape.props.h * info.scaleY)
				)
		return {
			props: {
				...shape.props,
				w,
				h,
				expandedH: shape.props.collapsed ? shape.props.expandedH : h,
			},
		}
	}

	override component(shape: MarkdownDocumentShape) {
		return <MarkdownDocumentCard shape={shape} />
	}

	override getIndicatorPath(shape: MarkdownDocumentShape) {
		const path = new Path2D()
		path.roundRect(0, 0, shape.props.w, shape.props.h, 10)
		return path
	}

	override getText(shape: MarkdownDocumentShape) {
		return shape.props.title
	}
}

function MarkdownDocumentCard({ shape }: { shape: MarkdownDocumentShape }) {
	const editor = useEditor()
	const toggleCollapsed = () => {
		const latest = editor.getShape(shape.id)
		if (!isMarkdownDocumentShape(latest)) return
		const collapsed = !latest.props.collapsed
		editor.markHistoryStoppingPoint(
			collapsed ? 'Collapse Markdown document' : 'Expand Markdown document'
		)
		editor.updateShape<MarkdownDocumentShape>({
			id: latest.id,
			type: MARKDOWN_DOCUMENT_SHAPE_TYPE,
			props: {
				...latest.props,
				collapsed,
				h: collapsed
					? MARKDOWN_DOCUMENT_COLLAPSED_HEIGHT
					: Math.max(MARKDOWN_DOCUMENT_MIN_HEIGHT, latest.props.expandedH),
				expandedH: collapsed ? latest.props.h : latest.props.expandedH,
			},
		})
	}

	return (
		<HTMLContainer
			className={`markdown-document-shell ${
				shape.props.collapsed ? 'is-collapsed' : 'is-expanded'
			}`}
			style={{ width: shape.props.w, height: shape.props.h }}
		>
			<header className="markdown-document-header">
				<div className="markdown-document-heading">
					<strong>{shape.props.title}</strong>
					<span>r{shape.props.revision.slice(7, 15)} · {shape.props.bytes} B</span>
				</div>
				<button
					type="button"
					className="markdown-document-toggle"
					aria-label={
						shape.props.collapsed
							? `Expand ${shape.props.title}`
							: `Collapse ${shape.props.title}`
					}
					aria-expanded={!shape.props.collapsed}
					onPointerDown={stopEventPropagation}
					onClick={(event) => {
						stopEventPropagation(event)
						toggleCollapsed()
					}}
				>
					<svg viewBox="0 0 16 16" aria-hidden="true">
						<path
							d={shape.props.collapsed ? 'M4 6l4 4 4-4' : 'M4 10l4-4 4 4'}
						/>
					</svg>
				</button>
			</header>

			{!shape.props.collapsed && (
				<div
					className="markdown-document-content"
					onPointerDown={stopEventPropagation}
					onClick={stopEventPropagation}
					onWheel={stopEventPropagation}
				>
					{shape.props.sourceName && (
						<div className="markdown-document-source">
							<span>OBSIDIAN / MARKDOWN</span>
							<code>{shape.props.sourceName}</code>
						</div>
					)}
					<div className="markdown-document-rendered">
						<Markdown
							skipHtml
							components={{
								a: ({ href, children }) => (
									<a href={href} target="_blank" rel="noreferrer">
										{children}
									</a>
								),
							}}
						>
							{markdownDocumentBody(shape.props.markdown) || '_Empty Markdown document._'}
						</Markdown>
					</div>
				</div>
			)}
		</HTMLContainer>
	)
}

export function isMarkdownDocumentShape(
	shape: TLShape | undefined
): shape is MarkdownDocumentShape {
	return Boolean(
		shape?.type === MARKDOWN_DOCUMENT_SHAPE_TYPE &&
		shape.props.schema === MARKDOWN_DOCUMENT_CONTRACT_SCHEMA &&
		typeof shape.props.documentRef === 'string' &&
		MARKDOWN_DOCUMENT_REF_PATTERN.test(shape.props.documentRef) &&
		typeof shape.props.revision === 'string' &&
		MARKDOWN_DOCUMENT_REVISION_PATTERN.test(shape.props.revision)
	)
}

export function createMarkdownDocumentShape(
	editor: Editor,
	input: MarkdownDocumentInput
) {
	const bounds = editor.getViewportPageBounds()
	const w = Math.max(
		MARKDOWN_DOCUMENT_MIN_WIDTH,
		Math.min(MARKDOWN_DOCUMENT_DEFAULT_WIDTH, bounds.w - 48)
	)
	const id = createShapeId()
	editor.markHistoryStoppingPoint('Import Markdown document')
	editor.createShape<MarkdownDocumentShape>({
		id,
		type: MARKDOWN_DOCUMENT_SHAPE_TYPE,
		x: bounds.x + (bounds.w - w) / 2,
		y: bounds.y + (bounds.h - MARKDOWN_DOCUMENT_DEFAULT_HEIGHT) / 2,
		props: {
			...input,
			w,
			h: MARKDOWN_DOCUMENT_COLLAPSED_HEIGHT,
			expandedH: MARKDOWN_DOCUMENT_DEFAULT_HEIGHT,
			collapsed: true,
		},
	})
	editor.select(id)
	return id
}

export function replaceMarkdownDocumentShape(
	editor: Editor,
	shape: MarkdownDocumentShape,
	input: MarkdownDocumentInput
) {
	editor.markHistoryStoppingPoint('Replace Markdown document')
	editor.updateShape<MarkdownDocumentShape>({
		id: shape.id,
		type: MARKDOWN_DOCUMENT_SHAPE_TYPE,
		props: {
			...shape.props,
			...input,
		},
	})
	return shape.id
}

export function projectMarkdownDocumentsForAgent(
	shapes: readonly TLShape[],
	maxTotalBytes = Number.POSITIVE_INFINITY
): readonly MarkdownDocumentAgentContext[] {
	let remaining = maxTotalBytes
	const contexts: MarkdownDocumentAgentContext[] = []
	for (const shape of shapes) {
		if (!isMarkdownDocumentShape(shape)) continue
		const markdown = truncateUtf8(shape.props.markdown, Math.max(0, remaining))
		contexts.push({
			shapeId: shape.id,
			schema: shape.props.schema,
			documentRef: shape.props.documentRef,
			revision: shape.props.revision as MarkdownDocumentInput['revision'],
			bytes: shape.props.bytes,
			title: shape.props.title,
			sourceName: shape.props.sourceName,
			sourceKind: shape.props.sourceKind,
			links: shape.props.links,
			markdown,
			truncated: markdown.length < shape.props.markdown.length,
		})
		remaining -= new TextEncoder().encode(markdown).byteLength
	}
	return contexts
}
