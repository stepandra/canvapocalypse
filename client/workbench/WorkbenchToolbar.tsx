import { DefaultToolbar, DefaultToolbarContent } from 'tldraw'
import { MarkdownImportButton } from '../markdown/MarkdownImportButton'
import { WorkbenchEmojiPalette } from './WorkbenchEmojiPalette'

export function WorkbenchToolbar() {
	return (
		<DefaultToolbar>
			<WorkbenchEmojiPalette />
			<MarkdownImportButton />
			<DefaultToolbarContent />
		</DefaultToolbar>
	)
}
