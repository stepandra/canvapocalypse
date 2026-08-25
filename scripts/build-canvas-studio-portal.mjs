import { execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import {
	parsePortalBuildConfig,
	parsePortalManifest,
} from './vite-canvas-studio-portal-plugin.mjs'

const execFileAsync = promisify(execFile)
const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const viteBin = resolve(repoRoot, 'node_modules/vite/bin/vite.js')
const preflight = resolve(repoRoot, 'scripts/tldraw-desktop-contribution-preflight.mjs')
const loader = resolve(repoRoot, 'scripts/tldraw-desktop-contribution-loader.mjs')
const configPath = readArgument('--config')
const configuredOutput = readArgument('--out')
let buildConfig
let verifiedManifest

if (configPath) {
	if (!isAbsolute(configPath)) throw new Error('--config must be an absolute path')
	if (!configuredOutput) throw new Error('--config requires --out')
	if (readArguments('--contribution').length || readArguments('--sha256').length) {
		throw new Error('--config cannot be combined with --contribution or --sha256')
	}
	buildConfig = parsePortalBuildConfig(readFileSync(configPath, 'utf8'))
	verifiedManifest = buildConfig.contributions.map((path) => ({ path }))
} else {
	const paths = readArguments('--contribution')
	const hashes = readArguments('--sha256')
	if (paths.length === 0 || paths.length !== hashes.length) {
		throw new Error('Pass one --sha256 immediately for every --contribution path')
	}
	for (const path of paths) {
		if (!isAbsolute(path)) throw new Error('--contribution paths must be absolute')
	}
	verifiedManifest = parsePortalManifest(
		JSON.stringify(paths.map((path, index) => ({ path, sha256: hashes[index] })))
	)
}

await execFileAsync(
	process.execPath,
	[
		'--no-warnings=ExperimentalWarning',
		'--experimental-loader',
		loader,
		preflight,
		...verifiedManifest.map((entry) => entry.path),
	],
	{
		cwd: repoRoot,
		timeout: 15_000,
		killSignal: 'SIGKILL',
		maxBuffer: 1024 * 1024,
	}
)

const viteArguments = [viteBin, 'build']
const outDir = configuredOutput ?? readArgument('--out-dir')
if (outDir) {
	viteArguments.push('--outDir', resolve(outDir), '--emptyOutDir')
}
await execFileAsync(process.execPath, viteArguments, {
	cwd: repoRoot,
	env: {
		...process.env,
		...(buildConfig
			? { CANVAS_STUDIO_PORTAL_BUILD_CONFIG: JSON.stringify(buildConfig) }
			: { CANVAS_STUDIO_PORTAL_MANIFEST: JSON.stringify(verifiedManifest) }),
	},
	maxBuffer: 10 * 1024 * 1024,
})
console.log(`Built locked Canvas Studio portal with ${verifiedManifest.length} canonical contributions`)

function readArgument(name) {
	const direct = process.argv.find((argument) => argument.startsWith(`${name}=`))
	if (direct) return direct.slice(name.length + 1)
	const index = process.argv.indexOf(name)
	return index >= 0 ? process.argv[index + 1] : undefined
}

function readArguments(name) {
	const values = []
	for (let index = 2; index < process.argv.length; index += 1) {
		const argument = process.argv[index]
		if (argument === name) {
			const value = process.argv[index + 1]
			if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`)
			values.push(value)
			index += 1
		} else if (argument.startsWith(`${name}=`)) {
			values.push(argument.slice(name.length + 1))
		}
	}
	return values
}
