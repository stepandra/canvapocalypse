import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { CanvasExamplesApp } from './canvas-examples/app/CanvasExamplesApp'
import { isCanvasExamplesPath } from './canvas-examples/app/routes'
import { installDefaultCanvasStudioCatalog } from './canvas-studio/defaultCatalog'
import {
	CANVAS_STUDIO_PORTAL_CATALOG,
	CANVAS_STUDIO_PORTAL_COMPOSITION,
	CANVAS_STUDIO_PORTAL_LOCKED,
	CANVAS_STUDIO_PORTAL_RUNTIME,
} from './canvas-studio/portalComposition'
import { installCanvasStudioPortalOwnerRuntime } from './canvas-studio/portalOwnerRuntime'
import './index.css'
import './canvas-examples/app/canvas-examples.css'
import '../scripts/tldraw-desktop-eval-lab.css'
import './workbench/workbenchSelectionContext.css'

if (CANVAS_STUDIO_PORTAL_LOCKED) {
	;(globalThis as typeof globalThis & { __CANVAS_STUDIO_CATALOG__?: unknown })
		.__CANVAS_STUDIO_CATALOG__ = CANVAS_STUDIO_PORTAL_CATALOG
	installCanvasStudioPortalOwnerRuntime(
		CANVAS_STUDIO_PORTAL_COMPOSITION,
		CANVAS_STUDIO_PORTAL_RUNTIME
	)
} else {
	installDefaultCanvasStudioCatalog()
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
	<React.StrictMode>
		{isCanvasExamplesPath(window.location.pathname) ? <CanvasExamplesApp /> : <App />}
	</React.StrictMode>
)
