import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { CanvasExamplesApp } from './canvas-examples/app/CanvasExamplesApp'
import { isCanvasExamplesPath } from './canvas-examples/app/routes'
import { installDefaultCanvasStudioCatalog } from './canvas-studio/defaultCatalog'
import './index.css'
import './canvas-examples/app/canvas-examples.css'
import '../scripts/tldraw-desktop-eval-lab.css'
import './workbench/workbenchSelectionContext.css'

installDefaultCanvasStudioCatalog()

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
	<React.StrictMode>
		{isCanvasExamplesPath(window.location.pathname) ? <CanvasExamplesApp /> : <App />}
	</React.StrictMode>
)
