import { DesignSystemOverlay } from '../design-system/DesignSystemOverlay'
import { HtmlMockupOverlay } from '../html-mockup/HtmlMockupOverlay'
import { StitchOverlay } from '../stitch/StitchOverlay'

export function UiuxProviderDock() {
	return (
		<nav className="uiux-provider-dock" aria-label="UI/UX providers">
			<StitchOverlay docked />
			<DesignSystemOverlay docked />
			<HtmlMockupOverlay docked />
		</nav>
	)
}
