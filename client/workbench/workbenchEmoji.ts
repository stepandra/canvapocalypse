import {
	AssetRecordType,
	createShapeId,
	Editor,
	TLAssetId,
	TLImageAsset,
	TLShapeId,
	toRichText,
} from 'tldraw'
import angryPoopMangaUrl from './assets/angry-poop-manga.png'

export type WorkbenchEmojiId =
	| 'idea'
	| 'approved'
	| 'risk'
	| 'launch'
	| 'direction'
	| 'hot'
	| 'review'
	| 'love'
	| 'angry-poop'

export interface WorkbenchEmojiDefinition {
	id: WorkbenchEmojiId
	label: string
	glyph?: string
	customImageSrc?: string
}

export const WORKBENCH_EMOJIS: readonly WorkbenchEmojiDefinition[] = Object.freeze([
	{ id: 'idea', label: 'Idea', glyph: '💡' },
	{ id: 'approved', label: 'Approved', glyph: '✅' },
	{ id: 'risk', label: 'Risk', glyph: '⚠️' },
	{ id: 'launch', label: 'Launch', glyph: '🚀' },
	{ id: 'direction', label: 'Question', glyph: '❓' },
	{ id: 'hot', label: 'Hot', glyph: '🔥' },
	{ id: 'review', label: 'Review', glyph: '👀' },
	{ id: 'love', label: 'Love', glyph: '❤️' },
	{
		id: 'angry-poop',
		label: 'Angry poop',
		customImageSrc: angryPoopMangaUrl,
	},
])

export interface WorkbenchEmojiReceipt {
	emojiId: WorkbenchEmojiId
	shapeId: TLShapeId
	assetId?: TLAssetId
	undoable: true
}

export function insertWorkbenchEmoji(
	editor: Editor,
	emojiId: WorkbenchEmojiId,
	options: { instanceId?: string } = {}
): WorkbenchEmojiReceipt {
	const definition = WORKBENCH_EMOJIS.find((candidate) => candidate.id === emojiId)
	if (!definition) throw new Error(`Unknown workbench emoji: ${emojiId}`)

	const instanceId =
		options.instanceId ??
		`${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
	const shapeId = createShapeId(`workbench-emoji-${emojiId}-${instanceId}`)
	const center = editor.getViewportPageBounds().center
	let assetId: TLAssetId | undefined
	let asset: TLImageAsset | undefined

	if (definition.customImageSrc) {
		assetId = AssetRecordType.createId(`workbench-emoji-${emojiId}-${instanceId}`)
		asset = {
			id: assetId,
			typeName: 'asset',
			type: 'image',
			props: {
				name: `${emojiId}.png`,
				src: definition.customImageSrc,
				w: 256,
				h: 256,
				mimeType: 'image/png',
				isAnimated: false,
			},
			meta: {
				workbenchEmoji: {
					version: 1,
					emojiId,
				},
			},
		}
		// Asset records are intentionally history-ignored by tldraw. Register the
		// asset before opening the shape transaction so that its ignored batch
		// cannot absorb the user-visible insertion into the same transaction.
		editor.createAssets([asset])
	}

	editor.markHistoryStoppingPoint(`Insert ${definition.label}`)
	editor.run(() => {
		if (definition.customImageSrc && assetId && asset) {
			editor.createShape({
				id: shapeId,
				type: 'image',
				x: center.x - 48,
				y: center.y - 48,
				props: {
					assetId,
					w: 96,
					h: 96,
				},
				meta: asset.meta,
			})
		} else {
			editor.createShape({
				id: shapeId,
				type: 'text',
				x: center.x - 48,
				y: center.y - 36,
				props: {
					richText: toRichText(definition.glyph ?? ''),
					size: 'xl',
					font: 'draw',
					textAlign: 'middle',
					w: 96,
					autoSize: false,
				},
				meta: {
					workbenchEmoji: {
						version: 1,
						emojiId,
					},
				},
			})
		}
		editor.setSelectedShapes([shapeId])
	})

	return {
		emojiId,
		shapeId,
		...(assetId ? { assetId } : {}),
		undoable: true,
	}
}
