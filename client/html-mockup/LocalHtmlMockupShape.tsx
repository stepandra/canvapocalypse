import { useEffect, useRef, useState } from 'react'
import {
	BaseBoxShapeUtil,
	createShapeId,
	Editor,
	HTMLContainer,
	Rectangle2d,
	resizeBox,
	stopEventPropagation,
	T,
	TLResizeInfo,
	TLShape,
	useEditor,
} from 'tldraw'
import {
	HTML_MOCKUP_MODE_MESSAGE,
	HtmlMockupDocumentSummary,
	HtmlMockupSnapshotSummary,
	issueHtmlMockupPreviewUrl,
	parseHtmlMockupSelectionMessage,
} from './htmlMockupBridge'
import type { StitchProviderReference } from '../../shared/types/Stitch'

export const LOCAL_HTML_MOCKUP_SHAPE_TYPE = 'local-html-mockup' as const
const HTML_MOCKUP_REVISION_PATTERN = /^sha256:[a-f0-9]{64}$/i
const HTML_MOCKUP_DEFAULT_WIDTH = 720
const HTML_MOCKUP_DEFAULT_HEIGHT = 520
const HTML_MOCKUP_MIN_WIDTH = 320
const HTML_MOCKUP_MIN_HEIGHT = 240
const HTML_MOCKUP_VIEWPORT_MARGIN = 24

declare module '@tldraw/tlschema' {
	export interface TLGlobalShapePropsMap {
		[LOCAL_HTML_MOCKUP_SHAPE_TYPE]: {
			w: number
			h: number
		}
	}
}

export type LocalHtmlMockupShape = TLShape<typeof LOCAL_HTML_MOCKUP_SHAPE_TYPE>
export type LocalHtmlMockupPreviewMode = 'inspect' | 'preview'

export interface LocalHtmlMockupMeta {
	schema: 'canvapocalypse-local-html/v1'
	documentRef: string
	revision: string
	title: string
	selectedTargetRef?: string
	selectedTargetLabel?: string
	previewMode: LocalHtmlMockupPreviewMode
	truncated: boolean
	targetCount?: number
	provider?: StitchProviderReference
}

export class LocalHtmlMockupShapeUtil extends BaseBoxShapeUtil<LocalHtmlMockupShape> {
	static override type = LOCAL_HTML_MOCKUP_SHAPE_TYPE
	static override props = {
		w: T.number,
		h: T.number,
	}

	override getDefaultProps(): LocalHtmlMockupShape['props'] {
		return { w: HTML_MOCKUP_DEFAULT_WIDTH, h: HTML_MOCKUP_DEFAULT_HEIGHT }
	}

	override onResize(
		shape: LocalHtmlMockupShape,
		info: TLResizeInfo<LocalHtmlMockupShape>
	) {
		return resizeBox(shape, info, {
			minWidth: HTML_MOCKUP_MIN_WIDTH,
			minHeight: HTML_MOCKUP_MIN_HEIGHT,
		})
	}

	override getGeometry(shape: LocalHtmlMockupShape) {
		return new Rectangle2d({
			width: shape.props.w,
			height: shape.props.h,
			isFilled: true,
		})
	}

	override component(shape: LocalHtmlMockupShape) {
		return <LocalHtmlMockupCard shape={shape} />
	}

	override getIndicatorPath(shape: LocalHtmlMockupShape) {
		const path = new Path2D()
		path.roundRect(0, 0, shape.props.w, shape.props.h, 11)
		return path
	}

	override getText(shape: LocalHtmlMockupShape) {
		const meta = readLocalHtmlMockupMeta(shape)
		return [meta?.title, meta?.selectedTargetLabel, meta?.selectedTargetRef]
			.filter(Boolean)
			.join(' ')
	}
}

export function createLocalHtmlMockupMeta(
	document: HtmlMockupDocumentSummary | HtmlMockupSnapshotSummary,
	previewMode: LocalHtmlMockupPreviewMode = 'inspect',
	provider?: StitchProviderReference
): LocalHtmlMockupMeta {
	return {
		schema: 'canvapocalypse-local-html/v1',
		documentRef: document.documentRef,
		revision: String(document.revision),
		title: document.title,
		previewMode,
		truncated: document.truncated === true,
		...(typeof document.targetCount === 'number'
			? { targetCount: document.targetCount }
			: {}),
		...(provider ? { provider } : {}),
	}
}

export function readLocalHtmlMockupMeta(
	shape: Pick<LocalHtmlMockupShape, 'meta'>
): LocalHtmlMockupMeta | null {
	const value = shape.meta.htmlMockup
	if (
		!isRecord(value) ||
		value.schema !== 'canvapocalypse-local-html/v1' ||
		typeof value.documentRef !== 'string' ||
		typeof value.revision !== 'string' ||
		!HTML_MOCKUP_REVISION_PATTERN.test(value.revision) ||
		typeof value.title !== 'string' ||
		(value.previewMode !== 'inspect' && value.previewMode !== 'preview') ||
		typeof value.truncated !== 'boolean'
	) {
		return null
	}
	if (
		(value.selectedTargetRef !== undefined &&
			typeof value.selectedTargetRef !== 'string') ||
		(value.selectedTargetLabel !== undefined &&
			typeof value.selectedTargetLabel !== 'string') ||
		(value.targetCount !== undefined &&
			(typeof value.targetCount !== 'number' ||
				!Number.isSafeInteger(value.targetCount) ||
				value.targetCount < 0)) ||
		(value.provider !== undefined &&
			(!isRecord(value.provider) ||
				value.provider.schema !== 'canvapocalypse-stitch-ref/v1' ||
				typeof value.provider.projectRef !== 'string' ||
				!/^stp_[A-Za-z0-9_-]{22,64}$/.test(value.provider.projectRef) ||
				typeof value.provider.screenRef !== 'string' ||
				!/^sts_[A-Za-z0-9_-]{22,64}$/.test(value.provider.screenRef)))
	) {
		return null
	}
	return value as unknown as LocalHtmlMockupMeta
}

export function isLocalHtmlMockupShape(
	shape: TLShape
): shape is LocalHtmlMockupShape {
	return (
		shape.type === LOCAL_HTML_MOCKUP_SHAPE_TYPE &&
		readLocalHtmlMockupMeta(shape) !== null
	)
}

export function createLocalHtmlMockupShape(
	editor: Editor,
	document: HtmlMockupDocumentSummary | HtmlMockupSnapshotSummary,
	provider?: StitchProviderReference
) {
	const bounds = editor.getViewportPageBounds()
	const width = Math.max(
		HTML_MOCKUP_MIN_WIDTH,
		Math.min(
			HTML_MOCKUP_DEFAULT_WIDTH,
			bounds.w - HTML_MOCKUP_VIEWPORT_MARGIN * 2
		)
	)
	const height = Math.max(
		HTML_MOCKUP_MIN_HEIGHT,
		Math.min(
			HTML_MOCKUP_DEFAULT_HEIGHT,
			bounds.h - HTML_MOCKUP_VIEWPORT_MARGIN * 2
		)
	)
	const id = createShapeId(`html-mockup-${document.documentRef}-${Date.now()}`)
	const meta = createLocalHtmlMockupMeta(document, 'inspect', provider)

	editor.markHistoryStoppingPoint('Insert Local HTML Mockup')
	editor.createShape<LocalHtmlMockupShape>({
		id,
		type: LOCAL_HTML_MOCKUP_SHAPE_TYPE,
		x: bounds.x + (bounds.w - width) / 2,
		y: bounds.y + (bounds.h - height) / 2,
		props: { w: width, h: height },
		meta: { htmlMockup: meta as any },
	})
	editor.select(id)
	return id
}

export function updateLocalHtmlMockupSnapshot(
	editor: Editor,
	shape: LocalHtmlMockupShape,
	document: HtmlMockupSnapshotSummary
) {
	const previous = readLocalHtmlMockupMeta(shape)
	if (!previous || previous.documentRef !== document.documentRef) {
		throw new Error(
			'Snapshot does not belong to the selected Local HTML Mockup'
		)
	}
	const revisionChanged = previous.revision !== String(document.revision)
	const {
		selectedTargetRef: previousTargetRef,
		selectedTargetLabel: previousTargetLabel,
		targetCount: _previousTargetCount,
		...stablePrevious
	} = previous
	const next: LocalHtmlMockupMeta = {
		...stablePrevious,
		revision: String(document.revision),
		title: document.title,
		truncated: document.truncated,
		...(typeof document.targetCount === 'number'
			? { targetCount: document.targetCount }
			: {}),
		...(!revisionChanged && previousTargetRef
			? {
					selectedTargetRef: previousTargetRef,
					...(previousTargetLabel
						? { selectedTargetLabel: previousTargetLabel }
						: {}),
				}
			: {}),
	}
	editor.updateShape<LocalHtmlMockupShape>({
		id: shape.id,
		type: LOCAL_HTML_MOCKUP_SHAPE_TYPE,
		meta: { ...shape.meta, htmlMockup: next as any },
	})
}

export function replaceLocalHtmlMockupDocument(
	editor: Editor,
	shape: LocalHtmlMockupShape,
	document: HtmlMockupDocumentSummary | HtmlMockupSnapshotSummary,
	provider?: StitchProviderReference
) {
	editor.markHistoryStoppingPoint('Change Local HTML Mockup document')
	editor.updateShape<LocalHtmlMockupShape>({
		id: shape.id,
		type: LOCAL_HTML_MOCKUP_SHAPE_TYPE,
		meta: {
			...shape.meta,
			htmlMockup: createLocalHtmlMockupMeta(
				document,
				'inspect',
				provider
			) as any,
		},
	})
	editor.select(shape.id)
}

export function clearLocalHtmlMockupTarget(
	editor: Editor,
	shape: LocalHtmlMockupShape
) {
	const meta = readLocalHtmlMockupMeta(shape)
	if (!meta) return
	const {
		selectedTargetRef: _selectedTargetRef,
		selectedTargetLabel: _selectedTargetLabel,
		...nextMeta
	} = meta
	editor.updateShape<LocalHtmlMockupShape>({
		id: shape.id,
		type: LOCAL_HTML_MOCKUP_SHAPE_TYPE,
		meta: {
			...shape.meta,
			htmlMockup: nextMeta as any,
		},
	})
}

export function updateLocalHtmlMockupPreviewMode(
	editor: Editor,
	shape: LocalHtmlMockupShape,
	previewMode: LocalHtmlMockupPreviewMode
) {
	const meta = readLocalHtmlMockupMeta(shape)
	if (!meta || meta.previewMode === previewMode) return
	const {
		selectedTargetRef: _selectedTargetRef,
		selectedTargetLabel: _selectedTargetLabel,
		...stableMeta
	} = meta
	editor.markHistoryStoppingPoint(
		previewMode === 'preview'
			? 'Interact with Local HTML Mockup'
			: 'Select Local HTML Mockup target'
	)
	editor.updateShape<LocalHtmlMockupShape>({
		id: shape.id,
		type: LOCAL_HTML_MOCKUP_SHAPE_TYPE,
		meta: {
			...shape.meta,
			htmlMockup: {
				...stableMeta,
				previewMode,
			} as any,
		},
	})
	editor.select(shape.id)
}

function LocalHtmlMockupCard({ shape }: { shape: LocalHtmlMockupShape }) {
	const editor = useEditor()
	const iframeRef = useRef<HTMLIFrameElement>(null)
	const meta = readLocalHtmlMockupMeta(shape)
	const [previewUrl, setPreviewUrl] = useState<string>()
	const [previewError, setPreviewError] = useState<string>()
	const documentRef = meta?.documentRef
	const revision = meta?.revision
	const previewMode = meta?.previewMode

	const syncPreviewMode = () => {
		const source = iframeRef.current?.contentWindow
		if (!source || !documentRef || !revision || !previewMode) return
		// The preview intentionally has an opaque origin. The child accepts
		// this command only from its exact parent WindowProxy and validates
		// documentRef + revision.
		source.postMessage(
			{
				type: HTML_MOCKUP_MODE_MESSAGE,
				documentRef,
				revision,
				mode: previewMode,
			},
			'*'
		)
	}

	useEffect(() => {
		setPreviewUrl(undefined)
		setPreviewError(undefined)
		if (!documentRef || !revision) return
		const controller = new AbortController()
			void issueHtmlMockupPreviewUrl(
				documentRef,
				revision,
				controller.signal
			).then(
			(url) => setPreviewUrl(url),
			(error) => {
				if (controller.signal.aborted) return
				setPreviewError(
					error instanceof Error ? error.message : 'Preview unavailable'
				)
			}
		)
		return () => controller.abort()
	}, [documentRef, revision])

	useEffect(() => {
		if (!meta) return
		const onMessage = (event: MessageEvent<unknown>) => {
			const source = iframeRef.current?.contentWindow
			if (!source) return
			const selected = parseHtmlMockupSelectionMessage(event, {
				documentRef: meta.documentRef,
				revision: meta.revision,
				source,
			})
			if (!selected) return
			const latest = editor.getShape(shape.id)
			if (!latest || latest.type !== LOCAL_HTML_MOCKUP_SHAPE_TYPE) return
			const latestMeta = readLocalHtmlMockupMeta(latest)
			if (
				!latestMeta ||
				latestMeta.documentRef !== selected.documentRef ||
				latestMeta.revision !== selected.revision
			) {
				return
			}
			editor.select(latest.id)
			editor.updateShape<LocalHtmlMockupShape>({
				id: latest.id,
				type: LOCAL_HTML_MOCKUP_SHAPE_TYPE,
				meta: {
					...latest.meta,
					htmlMockup: {
						...latestMeta,
						selectedTargetRef: selected.targetRef,
						selectedTargetLabel: selected.label,
					} as any,
				},
			})
		}
		window.addEventListener('message', onMessage)
		return () => window.removeEventListener('message', onMessage)
	}, [editor, meta, shape.id])

	useEffect(() => {
		syncPreviewMode()
	}, [previewMode, previewUrl])

	if (!meta) {
		return (
			<HTMLContainer
				className="html-mockup-shape is-invalid"
				style={{ width: shape.props.w, height: shape.props.h }}
			>
				<strong>Invalid Local HTML Mockup reference</strong>
			</HTMLContainer>
		)
	}

	return (
		<HTMLContainer
			className="html-mockup-shape"
			style={{ width: shape.props.w, height: shape.props.h }}
		>
			<header className="html-mockup-shape-header">
				<div>
					<strong>{meta.title}</strong>
					<span>{meta.documentRef}</span>
				</div>
				<div className="html-mockup-shape-badges">
					<span>r{meta.revision.slice(0, 12)}</span>
					{meta.truncated && <span>BOUNDED</span>}
				</div>
			</header>
			<div
				className="html-mockup-shape-preview"
				onPointerDown={stopEventPropagation}
				onClick={stopEventPropagation}
				onWheel={stopEventPropagation}
			>
				{previewUrl ? (
					<iframe
						ref={iframeRef}
						title={`Local HTML Mockup: ${meta.title}`}
						src={previewUrl}
						sandbox="allow-scripts"
						referrerPolicy="no-referrer"
						onLoad={syncPreviewMode}
					/>
				) : (
					<div className="html-mockup-shape-loading" role="status">
						{previewError ?? 'Authorizing local preview…'}
					</div>
				)}
			</div>
			<footer className="html-mockup-shape-footer">
				<span>
					{meta.previewMode === 'inspect' ? 'SELECT TARGET' : 'INTERACT'}
				</span>
				<strong title={meta.selectedTargetRef}>
					{meta.selectedTargetLabel ?? 'No component selected'}
				</strong>
				<small>
					{typeof meta.targetCount === 'number'
						? `${meta.targetCount} indexed`
						: 'Compact snapshot'}
				</small>
			</footer>
		</HTMLContainer>
	)
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value)
}
