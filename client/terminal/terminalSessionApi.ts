export type TerminalSessionRole = 'architecture' | 'ml'
export type TerminalSessionState =
	| 'available'
	| 'unconfigured'
	| 'missing'
	| 'ambiguous'
	| 'offline'

export interface TerminalSessionStatus {
	provider: 'zellij'
	role: TerminalSessionRole
	state: TerminalSessionState
	readOnly: true
	checkedAt: string
	sessionRef?: string
}

const TERMINAL_SESSION_STATUS_ENDPOINT =
	'http://127.0.0.1:5176/terminal/session/status'

export async function getTerminalSessionStatus(
	role: TerminalSessionRole,
	sessionRef?: string,
	signal?: AbortSignal
): Promise<TerminalSessionStatus> {
	const url = new URL(TERMINAL_SESSION_STATUS_ENDPOINT)
	url.searchParams.set('role', role)
	if (sessionRef) url.searchParams.set('sessionRef', sessionRef)
	const response = await fetch(url, {
		method: 'GET',
		cache: 'no-store',
		signal,
	})
	if (!response.ok) {
		throw new Error((await response.text()) || 'Terminal session status is unavailable')
	}
	const result = (await response.json()) as TerminalSessionStatus
	if (
		result.provider !== 'zellij' ||
		result.role !== role ||
		result.readOnly !== true ||
		!['available', 'unconfigured', 'missing', 'ambiguous', 'offline'].includes(result.state)
	) {
		throw new Error('Terminal session status response is invalid')
	}
	return result
}
