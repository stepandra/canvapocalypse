import { build } from 'esbuild'
import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const entryPoint = resolve(repoRoot, 'client/canvas-studio/index.ts')
const outputArgument = readArgument('--outfile')
if (!outputArgument) {
	throw new Error('Pass --outfile /path/to/canvapocalypse-canvas-kits.js.')
}
const outfile = resolve(outputArgument)
await mkdir(dirname(outfile), { recursive: true })
await build({
	entryPoints: [entryPoint],
	outfile,
	bundle: true,
	format: 'esm',
	platform: 'browser',
	target: 'es2022',
	jsx: 'automatic',
	external: ['react', 'react/*', 'react-dom', 'react-dom/*', 'tldraw'],
	loader: {
		'.css': 'empty',
		'.png': 'dataurl',
	},
	logLevel: 'warning',
})
console.log(`Built Canvas Studio kit bundle at ${outfile}`)

function readArgument(name) {
	const direct = process.argv.find((argument) =>
		argument.startsWith(`${name}=`)
	)
	if (direct) return direct.slice(name.length + 1)
	const index = process.argv.indexOf(name)
	return index >= 0 ? process.argv[index + 1] : undefined
}
