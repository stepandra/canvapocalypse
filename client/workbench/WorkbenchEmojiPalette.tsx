import { useId } from 'react'
import {
	TldrawUiButton,
	TldrawUiDropdownMenuContent,
	TldrawUiDropdownMenuGroup,
	TldrawUiDropdownMenuItem,
	TldrawUiDropdownMenuRoot,
	TldrawUiDropdownMenuTrigger,
	TldrawUiToolbarButton,
	useEditor,
	useValue,
} from 'tldraw'
import {
	activateEmojiStamp,
	EmojiStampTool,
	getEmojiStampState,
} from './EmojiStampTool'
import {
	WorkbenchEmojiDefinition,
	WORKBENCH_EMOJIS,
} from './workbenchEmoji'

function EmojiGlyph({ definition }: { definition: WorkbenchEmojiDefinition }) {
	if (definition.customImageSrc) {
		return <img src={definition.customImageSrc} alt="" draggable={false} />
	}
	return <span aria-hidden="true">{definition.glyph}</span>
}

export function WorkbenchEmojiPalette() {
	const editor = useEditor()
	const menuId = useId()
	const selectedEmojiId = useValue(
		'selected workbench emoji stamp',
		() => getEmojiStampState(editor).get(),
		[editor]
	)
	const currentToolId = useValue(
		'workbench emoji current tool',
		() => editor.getCurrentToolId(),
		[editor]
	)
	const selectedEmoji =
		WORKBENCH_EMOJIS.find((definition) => definition.id === selectedEmojiId) ??
		WORKBENCH_EMOJIS[0]

	const selectStamp = (definition: WorkbenchEmojiDefinition) => {
		activateEmojiStamp(editor, definition.id)
	}

	return (
		<div
			className="workbench-emoji-control"
			onPointerDown={(event) => event.stopPropagation()}
			onClick={(event) => event.stopPropagation()}
		>
			<TldrawUiDropdownMenuRoot id={`workbench-emoji-palette-${menuId}`}>
				<TldrawUiDropdownMenuTrigger>
					<TldrawUiToolbarButton
						type="tool"
						className="workbench-emoji-trigger"
						isActive={currentToolId === EmojiStampTool.id}
						aria-label={`Emoji stamp · ${selectedEmoji.label}`}
						aria-pressed={currentToolId === EmojiStampTool.id}
						title={`Emoji stamp · ${selectedEmoji.label}`}
					>
						<EmojiGlyph definition={selectedEmoji} />
					</TldrawUiToolbarButton>
				</TldrawUiDropdownMenuTrigger>
				<TldrawUiDropdownMenuContent
					className="workbench-emoji-palette"
					side="top"
					align="center"
					alignOffset={0}
					sideOffset={8}
					collisionPadding={8}
				>
					<TldrawUiDropdownMenuGroup
						className="workbench-emoji-grid"
						aria-label="Canvas emoji"
					>
						{WORKBENCH_EMOJIS.map((definition) => (
							<TldrawUiDropdownMenuItem key={definition.id}>
								<TldrawUiButton
									type="icon"
									className="workbench-emoji-item"
									title={definition.label}
									aria-label={`Use ${definition.label} stamp`}
									aria-pressed={selectedEmojiId === definition.id}
									onClick={() => selectStamp(definition)}
								>
									<EmojiGlyph definition={definition} />
								</TldrawUiButton>
							</TldrawUiDropdownMenuItem>
						))}
					</TldrawUiDropdownMenuGroup>
				</TldrawUiDropdownMenuContent>
			</TldrawUiDropdownMenuRoot>
		</div>
	)
}
