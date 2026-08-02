import {
	DEFAULT_WORKBENCH_DOMAIN,
	isWorkbenchDomain,
	WorkbenchDomain,
} from './domainPacks'

export const WORKBENCH_PACK_QUERY_PARAM = 'pack'
export const WORKBENCH_PACK_STORAGE_KEY = 'canvapocalypse:workbench-pack'

const LEGACY_WORKBENCH_DOMAIN_ALIASES: Readonly<Record<string, WorkbenchDomain>> = {
	'ml-llm': 'ml',
	'ui-ux': 'uiux',
	'product-pm': 'product',
}

interface WorkbenchStorage {
	getItem(key: string): string | null
	setItem(key: string, value: string): void
}

function getBrowserStorage(): WorkbenchStorage | null {
	try {
		return globalThis.localStorage ?? null
	} catch {
		return null
	}
}

function resolvePersistedWorkbenchDomain(value: unknown): WorkbenchDomain | null {
	if (isWorkbenchDomain(value)) return value
	return typeof value === 'string' ? LEGACY_WORKBENCH_DOMAIN_ALIASES[value] ?? null : null
}

export function readWorkbenchDomainSelection(
	search = globalThis.location?.search ?? '',
	storage: WorkbenchStorage | null = getBrowserStorage()
): WorkbenchDomain {
	const query = new URLSearchParams(search)
	const queryValue = query.get(WORKBENCH_PACK_QUERY_PARAM)
	const queryDomain = resolvePersistedWorkbenchDomain(queryValue)
	if (queryDomain) return queryDomain
	if (query.get('workflow') === 'ml-intern' || query.get('canvas') === 'eval-lab') {
		return 'ml'
	}

	try {
		const storedValue = storage?.getItem(WORKBENCH_PACK_STORAGE_KEY)
		const storedDomain = resolvePersistedWorkbenchDomain(storedValue)
		if (storedDomain) return storedDomain
	} catch {
		// Storage is an optional convenience; the workbench remains usable without it.
	}

	return DEFAULT_WORKBENCH_DOMAIN
}

export function persistWorkbenchDomainSelection(
	domain: WorkbenchDomain,
	storage: WorkbenchStorage | null = getBrowserStorage()
) {
	try {
		storage?.setItem(WORKBENCH_PACK_STORAGE_KEY, domain)
	} catch {
		// Keep the in-memory selection when storage is unavailable.
	}

	if (typeof window === 'undefined') return
	const nextUrl = new URL(window.location.href)
	nextUrl.searchParams.set(WORKBENCH_PACK_QUERY_PARAM, domain)
	window.history.replaceState(
		window.history.state,
		'',
		`${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`
	)
}
