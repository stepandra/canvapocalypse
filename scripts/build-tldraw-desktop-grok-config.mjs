import { build } from 'esbuild'
import { chmod, mkdir, rename, unlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const entryPoint = fileURLToPath(
	new URL('./tldraw-desktop-grok-config.tsx', import.meta.url)
)
const outputArgument = readArgument('--outfile')
if (!outputArgument) {
	throw new Error('Pass --outfile <tldraw working>/<document>/script/config.js.')
}
const outfile = resolve(outputArgument)
const workingRoot = resolve(
	homedir(),
	'Library/Application Support/tldraw/working'
)
const child = relative(workingRoot, outfile)
if (
	child.startsWith(`..${sep}`) ||
	child === '..' ||
	child.split(sep).length !== 3 ||
	child.split(sep)[1] !== 'script' ||
	child.split(sep)[2] !== 'config.js'
) {
	throw new Error('Output must be a tldraw Offline working config.js path.')
}

const result = await build({
	entryPoints: [entryPoint],
	outfile,
	write: false,
	bundle: true,
	format: 'esm',
	platform: 'browser',
	target: 'es2022',
	jsx: 'automatic',
	external: ['react', 'react/*', 'tldraw'],
	loader: { '.css': 'text' },
	logLevel: 'warning',
})
if (result.outputFiles?.length !== 1) {
	throw new Error('Grok Offline config build did not produce one bundle.')
}
await mkdir(dirname(outfile), { recursive: true })
const temporary = resolve(
	dirname(outfile),
	`.${basename(outfile)}.${process.pid}.${Date.now()}.tmp`
)
try {
	await writeFile(temporary, result.outputFiles[0].contents, {
		flag: 'wx',
		mode: 0o600,
	})
	await rename(temporary, outfile)
	await chmod(outfile, 0o600)
} catch (error) {
	await unlink(temporary).catch(() => {})
	throw error
}
console.log(`Built Grok tldraw Offline config at ${outfile}`)

function readArgument(name) {
	const direct = process.argv.find((argument) => argument.startsWith(`${name}=`))
	if (direct) return direct.slice(name.length + 1)
	const index = process.argv.indexOf(name)
	return index >= 0 ? process.argv[index + 1] : undefined
}
