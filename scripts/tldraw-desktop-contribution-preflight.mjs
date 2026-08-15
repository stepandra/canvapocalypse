import { pathToFileURL } from 'node:url'
import { assertValidCanvapocalypseContributions } from './tldraw-desktop-contribution-validation.mjs'

try {
	const contributionGroups = await Promise.all(
		process.argv.slice(2).map(async (modulePath) => {
			const contributionModule = await import(pathToFileURL(modulePath).href)
			if (!Array.isArray(contributionModule.CANVAS_KIT_CONTRIBUTIONS)) {
				throw new Error(
					`Contribution module must export a CANVAS_KIT_CONTRIBUTIONS array: ${modulePath}`
				)
			}
			return contributionModule.CANVAS_KIT_CONTRIBUTIONS
		})
	)
	assertValidCanvapocalypseContributions(contributionGroups.flat())
	process.exit(0)
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error))
	process.exit(1)
}
