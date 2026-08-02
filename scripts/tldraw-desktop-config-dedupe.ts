type StaticRegistrationKey = 'type' | 'id'

type ConstructorWithStaticRegistration = {
	readonly type?: unknown
	readonly id?: unknown
}

/**
 * Merge host and Canvapocalypse registrations without leaving duplicate static
 * `type` / `id` entries in the tldraw config.
 *
 * The last registration wins, matching tldraw's replacement semantics when a
 * config script intentionally supplies a newer implementation for an existing
 * shape util or tool.
 */
export function mergeUniqueRegistrations<T extends ConstructorWithStaticRegistration>(
	host: readonly T[],
	additions: readonly T[],
	key: StaticRegistrationKey
): T[] {
	const combined = [...host, ...additions]
	const lastIndexByKey = new Map<string, number>()
	const lastIndexByIdentity = new Map<T, number>()

	combined.forEach((registration, index) => {
		const value = registration[key]
		if (typeof value === 'string' && value.length > 0) {
			lastIndexByKey.set(value, index)
			return
		}
		lastIndexByIdentity.set(registration, index)
	})

	return combined.filter((registration, index) => {
		const value = registration[key]
		if (typeof value === 'string' && value.length > 0) {
			return lastIndexByKey.get(value) === index
		}
		return lastIndexByIdentity.get(registration) === index
	})
}
