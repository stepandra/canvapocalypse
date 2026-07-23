import {
	createShapeId,
	Editor,
	JsonObject,
	TLEmbedDefinition,
	TLEmbedShape,
	TLShape,
} from 'tldraw'

export const ISOFLOW_PROVIDER_ID = 'autorecruit_isoflow'
export const ISOFLOW_ORIGIN = 'http://127.0.0.1:4174'

const ALLOWED_HOSTS = new Set(['127.0.0.1:4174', 'localhost:4174'])

const ISOFLOW_ICON_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="10" fill="#162129"/>
  <path d="M14 18 32 8l18 10-18 10-18-10Zm0 14 18 10 18-10M14 46l18 10 18-10" fill="none" stroke="#73c8aa" stroke-width="5" stroke-linejoin="round"/>
  <circle cx="14" cy="32" r="4" fill="#f2b36e"/>
  <circle cx="50" cy="32" r="4" fill="#e97f78"/>
</svg>`

export const ISOFLOW_EMBED_DEFINITION: TLEmbedDefinition = {
	type: ISOFLOW_PROVIDER_ID,
	title: 'AutoRecruit Isoflow Diagram',
	hostnames: [...ALLOWED_HOSTS],
	icon: `data:image/svg+xml,${encodeURIComponent(ISOFLOW_ICON_SVG)}`,
	minWidth: 640,
	minHeight: 420,
	width: 1280,
	height: 820,
	doesResize: true,
	isAspectRatioLocked: false,
	embedOnPaste: true,
	backgroundColor: '#f7f8fa',
	overrideOutlineRadius: 2,
	overridePermissions: {
		'allow-downloads': true,
		'allow-forms': false,
		'allow-modals': true,
		'allow-popups': false,
		'allow-same-origin': true,
		'allow-scripts': true,
	},
	toEmbedUrl: toIsoflowEmbedUrl,
	fromEmbedUrl: fromIsoflowEmbedUrl,
}

export interface IsoflowEmbedMeta extends JsonObject {
	schema: 'canvapocalypse-embed/v1'
	provider: typeof ISOFLOW_PROVIDER_ID
	baseUrl: string
	projectId: string
	viewId: string
}

export const ISOFLOW_PROJECTS = [
	{
		id: 'autorecruit-contours',
		label: 'AutoRecruit DevSecOps',
		description: 'Current and MUST trust, exposure, network, and deployment views.',
		preferredViewId: 'vi_contours_reworked',
	},
	{
		id: 'autorecruit-ideal',
		label: 'AutoRecruit Ideal',
		description: 'Ideal target topology and ownership map.',
	},
	{
		id: 'eval-lab',
		label: 'Eval Lab',
		description: 'Evaluation lab as-is to to-be topology.',
	},
] as const

export function buildIsoflowUrl(
	projectId: string,
	viewId?: string,
	baseUrl = ISOFLOW_ORIGIN
) {
	const url = new URL(assertAllowedIsoflowBaseUrl(baseUrl))
	url.searchParams.set('project', projectId)
	if (viewId) url.searchParams.set('view', viewId)
	return url.href
}

export function toIsoflowEmbedUrl(input: string) {
	const url = parseAllowedUrl(input)
	if (!url) return undefined
	url.searchParams.set('embed', '1')
	return url.href
}

export function fromIsoflowEmbedUrl(input: string) {
	const url = parseAllowedUrl(input)
	if (!url) return undefined
	url.searchParams.delete('embed')
	return url.href
}

export function assertAllowedIsoflowBaseUrl(input: string) {
	const url = new URL(input)
	if (!ALLOWED_HOSTS.has(url.host)) {
		throw new Error(`Isoflow host is not allowed: ${url.host}`)
	}
	url.pathname = '/'
	url.search = ''
	url.hash = ''
	return url.href.replace(/\/$/, '')
}

export function isIsoflowEmbedShape(shape: TLShape | null | undefined): shape is TLEmbedShape {
	return Boolean(shape?.type === 'embed' && readIsoflowEmbedMeta(shape))
}

export function readIsoflowEmbedMeta(shape: TLShape): IsoflowEmbedMeta | null {
	const value = (shape.meta as any)?.embedProvider
	if (
		!value ||
		value.schema !== 'canvapocalypse-embed/v1' ||
		value.provider !== ISOFLOW_PROVIDER_ID ||
		typeof value.projectId !== 'string' ||
		typeof value.viewId !== 'string' ||
		typeof value.baseUrl !== 'string'
	) {
		return null
	}
	return value as IsoflowEmbedMeta
}

export function createIsoflowEmbed(
	editor: Editor,
	{
		projectId,
		viewId,
		baseUrl = ISOFLOW_ORIGIN,
	}: {
		projectId: string
		viewId: string
		baseUrl?: string
	}
) {
	const normalizedBaseUrl = assertAllowedIsoflowBaseUrl(baseUrl)
	const bounds = editor.getViewportPageBounds()
	const width = Math.min(1280, Math.max(760, bounds.w * 0.78))
	const height = Math.min(820, Math.max(500, bounds.h * 0.76))
	const id = createShapeId(`isoflow-${projectId}-${Date.now()}`)
	const meta: IsoflowEmbedMeta = {
		schema: 'canvapocalypse-embed/v1',
		provider: ISOFLOW_PROVIDER_ID,
		baseUrl: normalizedBaseUrl,
		projectId,
		viewId,
	}
	editor.createShape<TLEmbedShape>({
		id,
		type: 'embed',
		x: bounds.x + (bounds.w - width) / 2,
		y: bounds.y + (bounds.h - height) / 2,
		props: {
			w: width,
			h: height,
			url: buildIsoflowUrl(projectId, viewId, normalizedBaseUrl),
		},
		meta: { embedProvider: meta },
	})
	editor.select(id)
	editor.zoomToSelection({ animation: { duration: 220 } })
	return id
}

export function updateIsoflowEmbedView(editor: Editor, shape: TLEmbedShape, viewId: string) {
	const meta = readIsoflowEmbedMeta(shape)
	if (!meta) throw new Error('Selected embed is not an Isoflow provider')
	const nextMeta: IsoflowEmbedMeta = { ...meta, viewId }
	editor.updateShape<TLEmbedShape>({
		id: shape.id,
		type: 'embed',
		props: { url: buildIsoflowUrl(meta.projectId, viewId, meta.baseUrl) },
		meta: { ...shape.meta, embedProvider: nextMeta },
	})
}

export function findIsoflowEmbed(
	editor: Editor,
	projectId?: string
): { shape: TLEmbedShape; meta: IsoflowEmbedMeta } | null {
	const selected = editor.getSelectedShapes().find(isIsoflowEmbedShape)
	if (selected) {
		const meta = readIsoflowEmbedMeta(selected)!
		if (!projectId || meta.projectId === projectId) return { shape: selected, meta }
	}
	for (const shape of editor.getCurrentPageShapes()) {
		if (!isIsoflowEmbedShape(shape)) continue
		const meta = readIsoflowEmbedMeta(shape)!
		if (!projectId || meta.projectId === projectId) return { shape, meta }
	}
	return null
}

function parseAllowedUrl(input: string) {
	try {
		const url = new URL(input)
		if (!ALLOWED_HOSTS.has(url.host) || !url.searchParams.has('project')) return undefined
		return url
	} catch {
		return undefined
	}
}
