import { build } from 'esbuild'
import {
	chmod,
	mkdir,
	readFile,
	realpath,
	rename,
	stat,
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
import { fileURLToPath, pathToFileURL } from 'node:url'
import { loadOrCreateHtmlMockupResidentCapability } from './html-mockup-resident-capability.mjs'
import { resolveOfflineConfigDocument } from './tldraw-offline-config-target.mjs'

const MAX_CONTRIBUTION_MODULES = 16
const MAX_CONTRIBUTION_PATH_CHARS = 4096
const WORKBENCH_CONTRIBUTIONS = [
	{
		kitId: 'workbench.architecture',
		presetIds: [
			'workbench.system-context',
			'workbench.decision-graph',
			'workbench.change-radar',
		],
	},
	{
		kitId: 'workbench.ml',
		presetIds: [
			'workbench.experiment-loop',
			'workbench.eval-pipeline',
			'workbench.model-delivery',
		],
	},
	{
		kitId: 'workbench.uiux',
		presetIds: [
			'workbench.user-flow',
			'workbench.wireframe-set',
			'workbench.component-anatomy',
		],
	},
	{
		kitId: 'workbench.product',
		presetIds: [
			'workbench.roadmap',
			'workbench.timeline',
			'workbench.opportunity-map',
		],
	},
]
const contributionIdPattern = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/
const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const configFactoryModule = fileURLToPath(
	new URL('./tldraw-desktop-eval-lab-config-factory.tsx', import.meta.url)
)
const canvasKitHostModule = fileURLToPath(
	new URL('../client/canvas-studio/host.ts', import.meta.url)
)
const htmlMockupBridgeModule = fileURLToPath(
	new URL('../client/html-mockup/htmlMockupBridge.ts', import.meta.url)
)
const bridgeSupervisorClientModule = fileURLToPath(
	new URL('../client/bridges/bridgeSupervisorClient.ts', import.meta.url)
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
const contributionModules = await resolveContributionModules(
	readArguments('--contribution')
)
await validateContributionModules(contributionModules)

const capability = loadOrCreateHtmlMockupResidentCapability({
	cwd: repoRoot,
	envCapability: process.env.TLDRAW_HTML_MOCKUP_RESIDENT_CAPABILITY,
})
await mkdir(dirname(outfile), { recursive: true })
const buildResult = await build({
	stdin: {
		contents: renderStaticCompositionEntry(contributionModules),
		resolveDir: repoRoot,
		sourcefile: 'tldraw-desktop-eval-lab-composed-entry.ts',
		loader: 'ts',
	},
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
	legalComments: 'none',
	minifySyntax: true,
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
const contributionSummary = contributionModules.length
	? ` with ${contributionModules.length} external contribution module${contributionModules.length === 1 ? '' : 's'}`
	: ''
console.log(`Built resident tldraw Offline config${contributionSummary} at ${outfile}`)

function renderStaticCompositionEntry(contributionModules) {
	const imports = contributionModules.map(
		(modulePath, index) =>
			`import { CANVAS_KIT_CONTRIBUTIONS as contribution${index} } from ${JSON.stringify(modulePath)}`
	)
	const contributions = contributionModules.map(
		(_, index) => `...contribution${index}`
	)
	return [
		`import { createCanvapocalypseCanvasKitComposition } from ${JSON.stringify(canvasKitHostModule)}`,
		`import { createTldrawDesktopEvalLabConfig } from ${JSON.stringify(configFactoryModule)}`,
		`import { installHtmlMockupResidentCapability } from ${JSON.stringify(htmlMockupBridgeModule)}`,
		`import { installBridgeSupervisorResidentCapability } from ${JSON.stringify(bridgeSupervisorClientModule)}`,
		...imports,
		'declare const __TLDRAW_HTML_MOCKUP_RESIDENT_CAPABILITY__: string',
		'installHtmlMockupResidentCapability(__TLDRAW_HTML_MOCKUP_RESIDENT_CAPABILITY__)',
		'installBridgeSupervisorResidentCapability(__TLDRAW_HTML_MOCKUP_RESIDENT_CAPABILITY__)',
		`const externalContributions = [${contributions.join(', ')}]`,
		'export const CANVAS_KIT_COMPOSITION = createCanvapocalypseCanvasKitComposition(externalContributions)',
		'export default createTldrawDesktopEvalLabConfig(CANVAS_KIT_COMPOSITION)',
		'',
	].join('\n')
}

function readArgument(name) {
	const direct = process.argv.find((argument) =>
		argument.startsWith(`${name}=`)
	)
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
			if (!value || value.startsWith('--')) {
				throw new Error(`${name} requires an absolute local module path.`)
			}
			values.push(value)
			index += 1
			continue
		}
		if (argument.startsWith(`${name}=`)) {
			const value = argument.slice(name.length + 1)
			if (!value) {
				throw new Error(`${name} requires an absolute local module path.`)
			}
			values.push(value)
		}
	}
	return values
}

async function resolveContributionModules(moduleArguments) {
	if (moduleArguments.length > MAX_CONTRIBUTION_MODULES) {
		throw new Error(
			`Offline config accepts at most ${MAX_CONTRIBUTION_MODULES} contribution modules.`
		)
	}
	const modules = []
	const seen = new Set()
	for (const moduleArgument of moduleArguments) {
		if (
			moduleArgument.length > MAX_CONTRIBUTION_PATH_CHARS ||
			!isAbsolute(moduleArgument)
		) {
			throw new Error('--contribution must be an absolute local module path.')
		}
		const modulePath = await realpath(moduleArgument).catch(() => {
			throw new Error(`Contribution module does not exist: ${moduleArgument}`)
		})
		const metadata = await stat(modulePath)
		if (!metadata.isFile()) {
			throw new Error(`Contribution module is not a regular file: ${moduleArgument}`)
		}
		if (seen.has(modulePath)) {
			throw new Error(`Duplicate contribution module path: ${moduleArgument}`)
		}
		seen.add(modulePath)
		modules.push(modulePath)
	}
	return modules
}

async function validateContributionModules(modulePaths) {
	if (modulePaths.length === 0) return
	const buildNonce = `${process.pid}-${Date.now()}`
	const contributionGroups = await Promise.all(
		modulePaths.map(async (modulePath, index) => {
			const moduleUrl = pathToFileURL(modulePath)
			moduleUrl.searchParams.set('canvasStudioBuild', `${buildNonce}-${index}`)
			const module = await import(moduleUrl.href)
			if (!Array.isArray(module.CANVAS_KIT_CONTRIBUTIONS)) {
				throw new Error(
					`Contribution module must export a CANVAS_KIT_CONTRIBUTIONS array: ${modulePath}`
				)
			}
			return module.CANVAS_KIT_CONTRIBUTIONS
		})
	)
	assertValidCanvasKitContributions([
		...WORKBENCH_CONTRIBUTIONS.map((contribution) => ({
			...contribution,
			shapeUtils: [],
			bindingUtils: [],
			tools: [],
		})),
		...contributionGroups.flat(),
	])
}

function assertValidCanvasKitContributions(contributions) {
	const kitIds = new Map()
	const presetIds = new Map()
	const shapeIds = new Map()
	const bindingIds = new Map()
	const toolIds = new Map()
	for (const contribution of contributions) {
		if (!contribution || typeof contribution !== 'object') {
			throw new Error('Canvas Studio contribution must be an object.')
		}
		assertUniqueContributionId(
			contribution.kitId,
			'kit',
			kitIds,
			contribution.kitId
		)
		if (!Array.isArray(contribution.presetIds)) {
			throw new Error(`Canvas Studio kit ${contribution.kitId} presetIds must be an array.`)
		}
		for (const presetId of contribution.presetIds) {
			assertUniqueContributionId(
				presetId,
				'preset',
				presetIds,
				contribution.kitId
			)
		}
		assertUniqueRegistrations(
			contribution.shapeUtils,
			'type',
			'shape',
			shapeIds,
			contribution.kitId
		)
		assertUniqueRegistrations(
			contribution.bindingUtils,
			'type',
			'binding',
			bindingIds,
			contribution.kitId
		)
		assertUniqueRegistrations(
			contribution.tools,
			'id',
			'tool',
			toolIds,
			contribution.kitId
		)
	}
}

function assertUniqueContributionId(value, kind, owners, owner) {
	if (typeof value !== 'string' || !contributionIdPattern.test(value)) {
		throw new Error(`Invalid Canvas Studio ${kind} id: ${value}`)
	}
	const existingOwner = owners.get(value)
	if (existingOwner) {
		if (kind === 'kit') {
			throw new Error(`Duplicate Canvas Studio kit id ${value}`)
		}
		throw new Error(
			`Duplicate Canvas Studio ${kind} id ${value} in ${existingOwner} and ${owner}`
		)
	}
	owners.set(value, owner)
}

function assertUniqueRegistrations(registrations, key, kind, owners, owner) {
	if (!Array.isArray(registrations)) {
		throw new Error(`Canvas Studio kit ${owner} ${kind} registrations must be an array.`)
	}
	for (const registration of registrations) {
		const value = registration?.[key]
		if (typeof value !== 'string' || !value) {
			throw new Error(
				`Canvas Studio ${kind} registration is missing static ${key}`
			)
		}
		if (!contributionIdPattern.test(value)) {
			throw new Error(`Invalid Canvas Studio ${kind} id: ${value}`)
		}
		const existingOwner = owners.get(value)
		if (existingOwner) {
			throw new Error(
				`Duplicate Canvas Studio ${kind} id ${value} in ${existingOwner} and ${owner}`
			)
		}
		owners.set(value, owner)
	}
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
