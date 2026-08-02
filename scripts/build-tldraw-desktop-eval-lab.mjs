import { build } from 'esbuild'
import {
	chmod,
	mkdir,
	readFile,
	rename,
	unlink,
	writeFile,
} from 'node:fs/promises'
import { homedir } from 'node:os'
import {
	basename,
	dirname,
	isAbsolute,
	relative,
	resolve,
	sep,
} from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadOrCreateHtmlMockupResidentCapability } from './html-mockup-resident-capability.mjs'
import { resolveOfflineConfigDocument } from './tldraw-offline-config-target.mjs'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const entryPoint = fileURLToPath(
	new URL('./tldraw-desktop-eval-lab-config.tsx', import.meta.url)
)
const outputArgument =
	readArgument('--outfile') ?? process.env.TLDRAW_OFFLINE_CONFIG_OUTFILE
if (!outputArgument) {
	throw new Error(
		'Pass --outfile /path/to/tldraw/working/<document>/script/config.js.'
	)
}

const outfile = resolve(outputArgument)
const ignoredBuildRoot = resolve(
	repoRoot,
	'.tldraw-html-mockups',
	'offline-build'
)
const tldrawWorkingRoot = resolve(
	homedir(),
	'Library/Application Support/tldraw/working'
)
const allowedRoots = [ignoredBuildRoot, tldrawWorkingRoot]
if (!allowedRoots.some((root) => isPathInside(root, outfile))) {
	throw new Error(
		'Offline config output must stay inside this repository or tldraw working data.'
	)
}
if (dirname(outfile) === outfile || !isAbsolute(outfile)) {
	throw new Error('Offline config output path is invalid.')
}
const isOfflineWorkingOutput = isPathInside(tldrawWorkingRoot, outfile)
if (isOfflineWorkingOutput) assertOfflineConfigPath(outfile, tldrawWorkingRoot)
const skipStatus = process.argv.includes('--skip-status')
const offlineTarget =
	isOfflineWorkingOutput && !skipStatus
		? await resolveOfflineTarget(outfile)
		: null

const capability = loadOrCreateHtmlMockupResidentCapability({
	cwd: repoRoot,
	envCapability: process.env.TLDRAW_HTML_MOCKUP_RESIDENT_CAPABILITY,
})
await mkdir(dirname(outfile), { recursive: true })
const buildResult = await build({
	entryPoints: [entryPoint],
	outfile,
	write: false,
	bundle: true,
	format: 'esm',
	platform: 'browser',
	target: 'es2022',
	jsx: 'automatic',
	external: ['react', 'react/*', 'tldraw'],
	loader: {
		'.css': 'text',
		'.png': 'dataurl',
	},
	define: {
		__TLDRAW_HTML_MOCKUP_RESIDENT_CAPABILITY__: JSON.stringify(capability),
	},
	logLevel: 'warning',
})
if (buildResult.outputFiles?.length !== 1) {
	throw new Error('Offline config build did not produce exactly one bundle.')
}
const bundle = buildResult.outputFiles[0].contents
if (!Buffer.from(bundle).includes(Buffer.from(capability))) {
	throw new Error('Offline config build omitted the resident capability.')
}
const temporaryPath = resolve(
	dirname(outfile),
	`.${basename(outfile)}.${process.pid}.${Date.now()}.tmp`
)
try {
	await writeFile(temporaryPath, bundle, { flag: 'wx', mode: 0o600 })
	await rename(temporaryPath, outfile)
	await chmod(outfile, 0o600)
} catch (error) {
	await unlink(temporaryPath).catch(() => {})
	throw error
}

if (offlineTarget) {
	await verifyOfflineScriptStatus(offlineTarget)
}
console.log(`Built resident tldraw Offline config at ${outfile}`)

function readArgument(name) {
	const direct = process.argv.find((argument) =>
		argument.startsWith(`${name}=`)
	)
	if (direct) return direct.slice(name.length + 1)
	const index = process.argv.indexOf(name)
	return index >= 0 ? process.argv[index + 1] : undefined
}

function isPathInside(root, candidate) {
	const child = relative(root, candidate)
	return (
		child === '' ||
		(!child.startsWith(`..${sep}`) &&
			child !== '..' &&
			!isAbsolute(child))
	)
}

function assertOfflineConfigPath(candidate, workingRoot) {
	const parts = relative(workingRoot, candidate).split(sep)
	if (
		parts.length !== 3 ||
		parts[1] !== 'script' ||
		parts[2] !== 'config.js'
	) {
		throw new Error(
			'Offline output must be <tldraw working>/<document id>/script/config.js.'
		)
	}
}

async function resolveOfflineTarget(candidate) {
	const serverConfig = await readOfflineServerConfig()
	const documentId = await resolveOfflineConfigDocument({
		candidate,
		serverConfig,
	})
	return { documentId, serverConfig }
}

async function readOfflineServerConfig() {
	const serverConfigPath = resolve(
		homedir(),
		'Library/Application Support/tldraw/server.json'
	)
	let serverConfig
	try {
		serverConfig = JSON.parse(await readFile(serverConfigPath, 'utf8'))
	} catch {
		throw new Error(
			'tldraw Offline server is unavailable; config.js was built but not verified.'
		)
	}
	if (
		!Number.isInteger(serverConfig.port) ||
		typeof serverConfig.token !== 'string' ||
		!serverConfig.token
	) {
		throw new Error('tldraw Offline server configuration is invalid.')
	}
	return serverConfig
}

async function verifyOfflineScriptStatus({ documentId, serverConfig }) {
	const statusUrl = `http://127.0.0.1:${serverConfig.port}/api/doc/${documentId}/script-status`
	for (let attempt = 0; attempt < 20; attempt += 1) {
		const response = await fetch(statusUrl, {
			headers: { authorization: `Bearer ${serverConfig.token}` },
			cache: 'no-store',
		})
		if (!response.ok) {
			throw new Error(
				`tldraw Offline script-status returned HTTP ${response.status}.`
			)
		}
		const statusPayload = await response.json()
		const status = statusPayload?.result ?? statusPayload
		if (status?.state === 'applied') return
		if (status?.state === 'error') {
			throw new Error(
				`tldraw Offline rejected config.js; inspect ${status.errorLogPath ?? 'script-status'}.`
			)
		}
		await new Promise((resolveDelay) => setTimeout(resolveDelay, 250))
	}
	throw new Error(
		'tldraw Offline config.js remained pending after the verification window.'
	)
}
