import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const contributionModuleUrls = new Set(
	process.argv.slice(2).map((modulePath) => pathToFileURL(modulePath).href)
)
const sharedRuntimePackages = ['react-dom', 'react', 'tldraw']

export async function resolve(specifier, context, nextResolve) {
	const sharedRuntime =
		specifier.startsWith('@tldraw/') ||
		sharedRuntimePackages.some(
			(packageName) =>
				specifier === packageName || specifier.startsWith(`${packageName}/`)
		)
	if (!sharedRuntime) return nextResolve(specifier, context)
	try {
		return await nextResolve(specifier, context)
	} catch (error) {
		if (error?.code !== 'ERR_MODULE_NOT_FOUND') throw error
		return nextResolve(specifier, {
			...context,
			parentURL: import.meta.url,
		})
	}
}

export async function load(url, context, nextLoad) {
	const loaded = await nextLoad(url, context)
	if (contributionModuleUrls.has(url) && loaded.format === 'commonjs') {
		return {
			...loaded,
			format: 'module',
			source: loaded.source ?? (await readFile(new URL(url))),
		}
	}
	return loaded
}
