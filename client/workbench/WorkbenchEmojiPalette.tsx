import {
	TldrawUiButton,
	TldrawUiButtonIcon,
	TldrawUiDropdownMenuContent,
	TldrawUiDropdownMenuGroup,
	TldrawUiDropdownMenuItem,
	TldrawUiDropdownMenuRoot,
	TldrawUiDropdownMenuTrigger,
	TldrawUiToolbar,
	TldrawUiToolbarButton,
	useEditor,
} from 'tldraw'
import {
	insertWorkbenchEmoji,
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

	const insert = (definition: WorkbenchEmojiDefinition) => {
		insertWorkbenchEmoji(editor, definition.id)
	}

	return (
		<aside
			className="workbench-emoji-control"
			onPointerDown={(event) => event.stopPropagation()}
			onClick={(event) => event.stopPropagation()}
		>
			<TldrawUiDropdownMenuRoot id="workbench-emoji-palette">
				<TldrawUiToolbar
					className="workbench-emoji-toolbar"
					label="Canvas emoji"
					orientation="horizontal"
				>
					<TldrawUiDropdownMenuTrigger>
						<TldrawUiToolbarButton
							type="tool"
							className="workbench-emoji-trigger"
							aria-label="Emoji palette"
							title="Emoji palette"
						>
							<TldrawUiButtonIcon icon="geo-star" />
						</TldrawUiToolbarButton>
					</TldrawUiDropdownMenuTrigger>
				</TldrawUiToolbar>
				<TldrawUiDropdownMenuContent
					className="workbench-emoji-palette"
					side="top"
					align="start"
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
									aria-label={`Insert ${definition.label}`}
									onClick={() => insert(definition)}
								>
									<EmojiGlyph definition={definition} />
								</TldrawUiButton>
							</TldrawUiDropdownMenuItem>
						))}
					</TldrawUiDropdownMenuGroup>
				</TldrawUiDropdownMenuContent>
			</TldrawUiDropdownMenuRoot>
		</aside>
	)
}
