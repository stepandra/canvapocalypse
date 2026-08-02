import { useEffect, useRef, useState } from 'react'
import {
	getTerminalSessionStatus,
	TerminalSessionRole,
	TerminalSessionStatus,
} from './terminalSessionApi'
import './terminalSessionMonitor.css'

const POLL_INTERVAL_MS = 5_000

const STATE_LABELS: Record<TerminalSessionStatus['state'], string> = {
	available: 'Session present',
	unconfigured: 'Target not configured',
	missing: 'Session not found',
	ambiguous: 'Ambiguous server mapping',
	offline: 'Zellij offline',
}

export interface TerminalSessionPresentation {
	state: TerminalSessionStatus['state']
	owner: string
	label: string
}

export function getTerminalSessionPresentation(
	role: TerminalSessionRole,
	state: TerminalSessionStatus['state'],
	hasError = false
): TerminalSessionPresentation {
	const resolvedState = hasError ? 'offline' : state
	return {
		state: resolvedState,
		owner: role === 'architecture' ? 'Ampcode Architect' : 'ML-Intern',
		label: STATE_LABELS[resolvedState],
	}
}

export function TerminalSessionMonitor({ role }: { role: TerminalSessionRole }) {
	const [status, setStatus] = useState<TerminalSessionStatus | null>(null)
	const [error, setError] = useState('')
	const sessionRef = useRef<string | undefined>(undefined)

	useEffect(() => {
		const controller = new AbortController()
		sessionRef.current = undefined
		setStatus(null)
		setError('')
		const poll = async () => {
			try {
				const next = await getTerminalSessionStatus(
					role,
					sessionRef.current,
					controller.signal
				)
				if (next.state === 'available' && next.sessionRef) {
					sessionRef.current = next.sessionRef
				} else if (next.state === 'missing' && sessionRef.current) {
					// The bridge may have restarted and reissued refs. Clear the
					// stale binding; the next poll can only bind through the exact
					// server-side mapping for this role.
					sessionRef.current = undefined
				}
				setStatus(next)
				setError('')
			} catch (pollError) {
				if (controller.signal.aborted) return
				setError(
					pollError instanceof Error
						? pollError.message
						: 'Terminal session status is unavailable'
				)
			}
		}
		void poll()
		const interval = window.setInterval(() => void poll(), POLL_INTERVAL_MS)
		return () => {
			controller.abort()
			window.clearInterval(interval)
		}
	}, [role])

	const presentation = getTerminalSessionPresentation(
		role,
		status?.state ?? 'offline',
		Boolean(error)
	)

	return (
		<aside
			className="terminal-session-monitor"
			data-state={presentation.state}
			aria-label={`${presentation.owner} terminal session status`}
			aria-live="polite"
			onPointerDown={(event) => event.stopPropagation()}
			onClick={(event) => event.stopPropagation()}
		>
			<span className="terminal-session-monitor-dot" aria-hidden="true" />
			<div>
				<strong>{presentation.owner}</strong>
				<span>Zellij · {presentation.label} · read only</span>
			</div>
			{status?.state === 'available' && status.sessionRef && (
				<code title="Opaque exact-session reference">
					{status.sessionRef.slice(0, 11)}…
				</code>
			)}
		</aside>
	)
}
