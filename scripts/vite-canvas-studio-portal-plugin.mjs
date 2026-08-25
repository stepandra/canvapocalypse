import { createHash } from 'node:crypto'
import { readFileSync, realpathSync, statSync } from 'node:fs'
import { isAbsolute } from 'node:path'

export const CANVAS_STUDIO_PORTAL_VIRTUAL_ID = 'virtual:canvas-studio-portal'
const resolvedVirtualId = `\0${CANVAS_STUDIO_PORTAL_VIRTUAL_ID}`
const SHA256_PATTERN = /^[a-f0-9]{64}$/
const ID_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/

export function createCanvasStudioPortalPlugin(manifestJson, portalBuildConfigJson) {
	if (manifestJson && portalBuildConfigJson) {
		throw new Error('Canvas Studio portal accepts a manifest or a portal-build config, not both')
	}
	const buildConfig = portalBuildConfigJson
		? parsePortalBuildConfig(portalBuildConfigJson)
		: undefined
	const manifest = buildConfig
		? buildConfig.contributions.map((path) => ({ path }))
		: parsePortalManifest(manifestJson)
	const locked = Boolean(buildConfig) || manifest.length > 0
	const runtime = buildConfig?.runtime ?? {
		projectApi: '/__canvas/project',
		inventorySha256: '',
		bridges: [],
	}
	const catalog = buildConfig
		? { ...buildConfig.catalog, pages: buildConfig.project.kits }
		: undefined
	return {
		name: 'canvas-studio-portal',
		resolveId(id) {
			if (id === CANVAS_STUDIO_PORTAL_VIRTUAL_ID) return resolvedVirtualId
		},
		load(id) {
			if (id !== resolvedVirtualId) return
			const imports = manifest.map(
				(entry, index) =>
					`import { CANVAS_KIT_CONTRIBUTIONS as contribution${index} } from ${JSON.stringify(entry.path)}`
			)
			const suppliedContributions = `[${manifest.map((_, index) => `...contribution${index}`).join(', ')}]`
			const enabledKitIds = buildConfig
				? [...new Set(Object.values(buildConfig.project.kits).flat())].sort()
				: undefined
			const contributions = enabledKitIds
				? `${suppliedContributions}.filter((contribution) => ${JSON.stringify(enabledKitIds)}.includes(contribution.kitId))`
				: suppliedContributions
			return [
				...imports,
				`export const CANVAS_STUDIO_PORTAL_LOCKED = ${locked}`,
				`export const CANVAS_STUDIO_PORTAL_CONTRIBUTIONS = ${contributions}`,
				`export const CANVAS_STUDIO_PORTAL_RUNTIME = ${JSON.stringify(runtime)}`,
				`export const CANVAS_STUDIO_PORTAL_CATALOG = ${JSON.stringify(catalog)}`,
				'',
			].join('\n')
		},
	}
}

export function parsePortalBuildConfig(configJson) {
	let value
	try {
		value = JSON.parse(configJson)
	} catch {
		throw new Error('Canvas Studio portal build config must be valid JSON')
	}
	assertObjectShape(
		value,
		['schema', 'project', 'catalog', 'contributions', 'runtime'],
		[],
		'Canvas Studio portal build config'
	)
	if (value.schema !== 'canvas.portal-build/v1') {
		throw new Error('Canvas Studio portal build config must use canvas.portal-build/v1')
	}

	const project = parseProject(value.project)
	const catalog = parseCatalog(value.catalog)
	const catalogKitIds = new Set(catalog.kits.map(({ id }) => id))
	const enabledKitIds = new Set(Object.values(project.kits).flat())
	for (const kitId of enabledKitIds) {
		if (!catalogKitIds.has(kitId)) {
			throw new Error(`Canvas Studio portal project enables unknown catalog kit ${kitId}`)
		}
	}

	const contributions = parseContributionPaths(value.contributions, true)
	const runtime = parseRuntime(value.runtime, enabledKitIds)
	return Object.freeze({
		schema: 'canvas.portal-build/v1',
		project,
		catalog,
		contributions,
		runtime,
	})
}

export function parsePortalManifest(manifestJson) {
	if (!manifestJson) return []
	let entries
	try {
		entries = JSON.parse(manifestJson)
	} catch {
		throw new Error('CANVAS_STUDIO_PORTAL_MANIFEST must be valid JSON')
	}
	if (!Array.isArray(entries) || entries.length === 0) {
		throw new Error('Locked Canvas Studio portal requires at least one canonical contribution')
	}
	const seenPaths = new Set()
	return entries.map((entry, index) => {
		if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
			throw new Error(`Canvas Studio portal contribution ${index + 1} must be an object`)
		}
		if (Object.keys(entry).sort().join(',') !== 'path,sha256') {
			throw new Error(`Canvas Studio portal contribution ${index + 1} has an invalid shape`)
		}
		if (typeof entry.path !== 'string' || !isAbsolute(entry.path)) {
			throw new Error(`Canvas Studio portal contribution ${index + 1} path must be absolute`)
		}
		if (typeof entry.sha256 !== 'string' || !SHA256_PATTERN.test(entry.sha256)) {
			throw new Error(`Canvas Studio portal contribution ${index + 1} requires a lowercase SHA-256`)
		}
		let path
		try {
			path = realpathSync(entry.path)
		} catch {
			throw new Error(`Canvas Studio portal contribution does not exist: ${entry.path}`)
		}
		if (!statSync(path).isFile()) {
			throw new Error(`Canvas Studio portal contribution is not a regular file: ${entry.path}`)
		}
		if (seenPaths.has(path)) {
			throw new Error(`Duplicate Canvas Studio portal contribution path: ${entry.path}`)
		}
		seenPaths.add(path)
		const actualSha256 = createHash('sha256').update(readFileSync(path)).digest('hex')
		if (actualSha256 !== entry.sha256) {
			throw new Error(
				`Canvas Studio portal contribution hash mismatch for ${entry.path}: expected ${entry.sha256}, got ${actualSha256}`
			)
		}
		return Object.freeze({ path, sha256: entry.sha256 })
	})
}

function parseProject(value) {
	assertObjectShape(value, ['name', 'pages', 'kits'], [], 'Canvas Studio portal project')
	if (typeof value.name !== 'string' || !value.name.trim()) {
		throw new Error('Canvas Studio portal project name must not be empty')
	}
	if (!Array.isArray(value.pages) || value.pages.length === 0) {
		throw new Error('Canvas Studio portal project requires at least one page')
	}
	const pageIds = new Set()
	const pages = value.pages.map((page, index) => {
		assertObjectShape(page, ['id', 'title'], [], `Canvas Studio portal page ${index + 1}`)
		if (!ID_PATTERN.test(page.id) || pageIds.has(page.id)) {
			throw new Error(`Canvas Studio portal page id ${String(page.id)} is invalid or duplicated`)
		}
		if (typeof page.title !== 'string' || !page.title.trim()) {
			throw new Error(`Canvas Studio portal page ${page.id} title must not be empty`)
		}
		pageIds.add(page.id)
		return Object.freeze({ id: page.id, title: page.title })
	})
	if (!isRecord(value.kits)) {
		throw new Error('Canvas Studio portal project kits must be an object')
	}
	const kits = {}
	for (const [pageId, kitIds] of Object.entries(value.kits)) {
		if (!pageIds.has(pageId)) {
			throw new Error(`Canvas Studio portal project kits reference unknown page ${pageId}`)
		}
		kits[pageId] = parseIdList(kitIds, `Canvas Studio portal page ${pageId} kits`)
	}
	for (const pageId of pageIds) kits[pageId] ??= []
	return Object.freeze({ name: value.name, pages: Object.freeze(pages), kits: Object.freeze(kits) })
}

function parseCatalog(value) {
	assertObjectShape(value, ['version', 'kits'], [], 'Canvas Studio portal catalog')
	if (!Number.isInteger(value.version) || value.version < 1 || !Array.isArray(value.kits)) {
		throw new Error('Canvas Studio portal catalog has an invalid version or kits')
	}
	const kitIds = new Set()
	const presetIds = new Set()
	const kits = value.kits.map((kit, index) => {
		assertObjectShape(
			kit,
			['id', 'title', 'kind', 'runtime', 'tags', 'presets'],
			['defaultPage'],
			`Canvas Studio portal catalog kit ${index + 1}`
		)
		if (!ID_PATTERN.test(kit.id) || kitIds.has(kit.id)) {
			throw new Error(`Canvas Studio portal catalog kit id ${String(kit.id)} is invalid or duplicated`)
		}
		for (const field of ['title', 'kind', 'runtime']) {
			if (typeof kit[field] !== 'string' || !kit[field].trim()) {
				throw new Error(`Canvas Studio portal catalog kit ${kit.id} has invalid ${field}`)
			}
		}
		if (kit.defaultPage !== undefined && typeof kit.defaultPage !== 'string') {
			throw new Error(`Canvas Studio portal catalog kit ${kit.id} has invalid defaultPage`)
		}
		const tags = parseStringList(kit.tags, `Canvas Studio portal catalog kit ${kit.id} tags`)
		if (!Array.isArray(kit.presets)) {
			throw new Error(`Canvas Studio portal catalog kit ${kit.id} presets must be an array`)
		}
		const presets = kit.presets.map((preset, presetIndex) => {
			assertObjectShape(
				preset,
				['id', 'title', 'tags'],
				[],
				`Canvas Studio portal catalog preset ${presetIndex + 1}`
			)
			if (!ID_PATTERN.test(preset.id) || presetIds.has(preset.id)) {
				throw new Error(`Canvas Studio portal preset id ${String(preset.id)} is invalid or duplicated`)
			}
			if (typeof preset.title !== 'string' || !preset.title.trim()) {
				throw new Error(`Canvas Studio portal preset ${preset.id} title must not be empty`)
			}
			presetIds.add(preset.id)
			return Object.freeze({
				id: preset.id,
				title: preset.title,
				tags: parseStringList(
					preset.tags,
					`Canvas Studio portal preset ${preset.id} tags`
				),
			})
		})
		kitIds.add(kit.id)
		return Object.freeze({
			id: kit.id,
			title: kit.title,
			kind: kit.kind,
			runtime: kit.runtime,
			...(kit.defaultPage !== undefined ? { defaultPage: kit.defaultPage } : {}),
			tags,
			presets: Object.freeze(presets),
		})
	})
	return Object.freeze({ version: value.version, kits: Object.freeze(kits) })
}

function parseRuntime(value, enabledKitIds) {
	assertObjectShape(
		value,
		['projectApi', 'inventorySha256'],
		['publicUrl', 'bridges'],
		'Canvas Studio portal runtime'
	)
	if (!validPortalRoutePrefix(value.projectApi)) {
		throw new Error('Canvas Studio portal runtime projectApi must be a safe same-origin prefix')
	}
	if (typeof value.inventorySha256 !== 'string' || !SHA256_PATTERN.test(value.inventorySha256)) {
		throw new Error('Canvas Studio portal runtime inventorySha256 must be lowercase SHA-256')
	}
	if (value.publicUrl !== undefined) validatePublicUrl(value.publicUrl)
	if (value.bridges !== undefined && !Array.isArray(value.bridges)) {
		throw new Error('Canvas Studio portal runtime bridges must be an array')
	}
	const serviceIds = new Set()
	const routePrefixes = new Set([value.projectApi])
	const bridges = (value.bridges ?? []).map((bridge, index) => {
		assertObjectShape(
			bridge,
			['serviceId', 'routes'],
			['kitId'],
			`Canvas Studio portal bridge ${index + 1}`
		)
		if (!ID_PATTERN.test(bridge.serviceId) || serviceIds.has(bridge.serviceId)) {
			throw new Error(`Canvas Studio portal bridge serviceId ${String(bridge.serviceId)} is invalid or duplicated`)
		}
		if (bridge.kitId !== undefined && !enabledKitIds.has(bridge.kitId)) {
			throw new Error(`Canvas Studio portal bridge ${bridge.serviceId} references disabled kit ${String(bridge.kitId)}`)
		}
		if (!Array.isArray(bridge.routes) || bridge.routes.length === 0) {
			throw new Error(`Canvas Studio portal bridge ${bridge.serviceId} requires at least one route`)
		}
		const routes = bridge.routes.map((route, routeIndex) => {
			assertObjectShape(
				route,
				['prefix'],
				['stripPrefix'],
				`Canvas Studio portal bridge ${bridge.serviceId} route ${routeIndex + 1}`
			)
			if (!validPortalRoutePrefix(route.prefix) || routePrefixes.has(route.prefix)) {
				throw new Error(`Canvas Studio portal route prefix ${String(route.prefix)} is invalid or duplicated`)
			}
			if (route.stripPrefix !== undefined && typeof route.stripPrefix !== 'boolean') {
				throw new Error(`Canvas Studio portal route ${route.prefix} has invalid stripPrefix`)
			}
			routePrefixes.add(route.prefix)
			return Object.freeze({
				prefix: route.prefix,
				...(route.stripPrefix !== undefined ? { stripPrefix: route.stripPrefix } : {}),
			})
		})
		serviceIds.add(bridge.serviceId)
		return Object.freeze({
			serviceId: bridge.serviceId,
			...(bridge.kitId !== undefined ? { kitId: bridge.kitId } : {}),
			routes: Object.freeze(routes),
		})
	})
	return Object.freeze({
		projectApi: value.projectApi,
		inventorySha256: value.inventorySha256,
		...(value.publicUrl !== undefined ? { publicUrl: value.publicUrl } : {}),
		bridges: Object.freeze(bridges),
	})
}

function parseContributionPaths(value, allowEmpty) {
	if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
		throw new Error('Canvas Studio portal contributions must be an array')
	}
	const paths = []
	const seenPaths = new Set()
	for (const entry of value) {
		if (typeof entry !== 'string' || !isAbsolute(entry)) {
			throw new Error('Canvas Studio portal contribution path must be absolute')
		}
		let path
		try {
			path = realpathSync(entry)
		} catch {
			throw new Error(`Canvas Studio portal contribution does not exist: ${entry}`)
		}
		if (!statSync(path).isFile()) {
			throw new Error(`Canvas Studio portal contribution is not a regular file: ${entry}`)
		}
		if (seenPaths.has(path)) {
			throw new Error(`Duplicate Canvas Studio portal contribution path: ${entry}`)
		}
		seenPaths.add(path)
		paths.push(path)
	}
	return Object.freeze(paths)
}

function parseIdList(value, label) {
	const ids = parseStringList(value, label)
	if (ids.some((id) => !ID_PATTERN.test(id)) || new Set(ids).size !== ids.length) {
		throw new Error(`${label} contains an invalid or duplicate id`)
	}
	return ids
}

function parseStringList(value, label) {
	if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
		throw new Error(`${label} must be a string array`)
	}
	return Object.freeze([...value])
}

function validatePublicUrl(value) {
	if (typeof value !== 'string') throw new Error('Canvas Studio portal publicUrl must be a URL')
	let url
	try {
		url = new URL(value)
	} catch {
		throw new Error('Canvas Studio portal publicUrl must be a URL')
	}
	if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
		throw new Error('Canvas Studio portal publicUrl must be an uncredentialed HTTP(S) URL')
	}
}

function validPortalRoutePrefix(value) {
	return (
		typeof value === 'string' &&
		value !== '' &&
		value !== '/' &&
		value.startsWith('/') &&
		!value.endsWith('/') &&
		!value.includes('..') &&
		!/[?#\\]/.test(value)
	)
}

function assertObjectShape(value, required, optional, label) {
	if (!isRecord(value)) throw new Error(`${label} must be an object`)
	const keys = Object.keys(value)
	const allowed = new Set([...required, ...optional])
	if (required.some((key) => !keys.includes(key)) || keys.some((key) => !allowed.has(key))) {
		throw new Error(`${label} has an invalid shape`)
	}
}

function isRecord(value) {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
