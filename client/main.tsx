import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { CanvasExamplesApp } from './canvas-examples/app/CanvasExamplesApp'
import { isCanvasExamplesPath } from './canvas-examples/app/routes'
import './index.css'
import './canvas-examples/app/canvas-examples.css'
import '../scripts/tldraw-desktop-eval-lab.css'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
	<React.StrictMode>
		{isCanvasExamplesPath(window.location.pathname) ? <CanvasExamplesApp /> : <App />}
	</React.StrictMode>
)
