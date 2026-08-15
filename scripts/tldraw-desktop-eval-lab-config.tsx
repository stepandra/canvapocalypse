import { CANVAPOCALYPSE_CANVAS_KIT_COMPOSITION } from '../client/canvas-studio/host'
import { installBridgeSupervisorResidentCapability } from '../client/bridges/bridgeSupervisorClient'
import { installHtmlMockupResidentCapability } from '../client/html-mockup/htmlMockupBridge'
import { createTldrawDesktopEvalLabConfig } from './tldraw-desktop-eval-lab-config-factory'

declare const __TLDRAW_HTML_MOCKUP_RESIDENT_CAPABILITY__: string

installHtmlMockupResidentCapability(
	__TLDRAW_HTML_MOCKUP_RESIDENT_CAPABILITY__
)
installBridgeSupervisorResidentCapability(
	__TLDRAW_HTML_MOCKUP_RESIDENT_CAPABILITY__
)

/** @param {import('../.script-workspace/script-context').ConfigScriptContext} ctx */
export default createTldrawDesktopEvalLabConfig(
	CANVAPOCALYPSE_CANVAS_KIT_COMPOSITION
)
