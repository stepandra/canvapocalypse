import { fileURLToPath } from 'url'
import { cloudflare } from '@cloudflare/vite-plugin'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { zodLocalePlugin } from './scripts/vite-zod-locale-plugin.js'

// https://vitejs.dev/config/
export default defineConfig(() => {
	return {
		server: {
			allowedHosts: process.env.AMP_ORB ? true : undefined,
			proxy: {
				'/__canvas-bridge-supervisor': {
					target: 'http://127.0.0.1:5177',
					rewrite: (path) => path.replace(/^\/__canvas-bridge-supervisor/, ''),
					configure: (proxy) => {
						proxy.on('proxyReq', (request) => {
							request.removeHeader('origin')
							request.setHeader('x-canvas-studio-dev-proxy', 'vite')
						})
					},
				},
				'/__canvas-grok-supervisor': {
					target: 'http://127.0.0.1:5187',
					rewrite: (path) => path.replace(/^\/__canvas-grok-supervisor/, ''),
					configure: (proxy) => {
						proxy.on('proxyReq', (request) => {
							request.removeHeader('origin')
							request.setHeader('x-canvas-studio-dev-proxy', 'vite')
						})
					},
				},
				'/__canvas-grok-config': {
					target: 'http://127.0.0.1:5188',
					rewrite: (path) => path.replace(/^\/__canvas-grok-config/, ''),
					configure: (proxy) => {
						proxy.on('proxyReq', (request) => request.removeHeader('origin'))
					},
				},
			},
		},
		plugins: [
			zodLocalePlugin(fileURLToPath(new URL('./scripts/zod-locales-shim.js', import.meta.url))),
			...(process.env.CANVAS_STUDIO_STORIES ? [] : [cloudflare()]),
			react(),
		],
	}
})
