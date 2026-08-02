export type WorkflowIconName =
	| 'map'
	| 'new'
	| 'input'
	| 'trigger'
	| 'context'
	| 'action'
	| 'prompt-template'
	| 'decision'
	| 'llm'
	| 'agent'
	| 'openrouter'
	| 'base-url'
	| 'human'
	| 'data'
	| 'output'
	| 'rich-output'
	| 'mlflow-experiment'
	| 'mlflow-run'
	| 'mlflow-evaluation'
	| 'mlflow-model'
	| 'link'
	| 'play'
	| 'stop'

export function WorkflowIcon({ name }: { name: WorkflowIconName }) {
	return (
		<svg
			className="workflow-tool-icon"
			viewBox="0 0 24 24"
			aria-hidden="true"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.7"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			{name === 'map' && (
				<>
					<path d="m3.5 5 5-2 7 2 5-2v16l-5 2-7-2-5 2Z" />
					<path d="M8.5 3v16M15.5 5v16" />
				</>
			)}
			{name === 'new' && (
				<>
					<rect x="3" y="4" width="6" height="5" rx="1.2" />
					<rect x="15" y="15" width="6" height="5" rx="1.2" />
					<path d="M9 6.5h3a4 4 0 0 1 4 4V15" />
					<path d="M16.5 5v5M14 7.5h5" />
				</>
			)}
			{name === 'input' && (
				<>
					<rect x="8" y="5" width="12" height="14" rx="2" />
					<path d="M3 12h10M9.5 8.5 13 12l-3.5 3.5" />
				</>
			)}
			{name === 'trigger' && <path d="M13.5 2.5 5.5 13H12l-1.5 8.5L18.5 11H12Z" />}
			{name === 'context' && (
				<>
					<path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4" />
					<rect x="8" y="8" width="8" height="8" rx="2" />
				</>
			)}
			{name === 'action' && (
				<>
					<path d="M14.8 6.2a4 4 0 0 0-5 5L4 17l3 3 5.8-5.8a4 4 0 0 0 5-5l-2.7 2.7-3-3Z" />
					<path d="m4 17 3 3" />
				</>
			)}
			{name === 'prompt-template' && (
				<>
					<rect x="4" y="3" width="16" height="18" rx="2" />
					<path d="M8 8h8M8 12h5" />
					<path d="m9 15-2 2 2 2M15 15l2 2-2 2" />
				</>
			)}
			{name === 'decision' && (
				<>
					<path d="m12 3 7 7-7 7-7-7Z" />
					<path d="M12 17v4M5 10H2M19 10h3" />
				</>
			)}
			{name === 'llm' && (
				<>
					<rect x="4" y="4" width="16" height="16" rx="4" />
					<path d="M9 9h6M9 12h4M9 15h2" />
					<path d="m17.5 1 .5 1.5L19.5 3 18 3.5 17.5 5 17 3.5 15.5 3l1.5-.5Z" />
				</>
			)}
			{name === 'agent' && (
				<>
					<circle cx="12" cy="8" r="3" />
					<path d="M6 20v-2a6 6 0 0 1 12 0v2" />
					<path d="M4 5h3M17 5h3M3 8h3M18 8h3" opacity=".55" />
				</>
			)}
			{name === 'openrouter' && (
				<path
					d="M8.7 3.2h9.25C21.05 3.2 23 5.55 23 8.55c0 2.95-2.05 5.35-5.05 5.35h-.55l5.42 5.42c.68.68.2 1.84-.76 1.84H8.7A8.98 8.98 0 1 1 8.7 3.2Zm0 4.05a4.93 4.93 0 1 0 0 9.86 4.93 4.93 0 0 0 0-9.86Z"
					fill="currentColor"
					fillRule="evenodd"
					stroke="none"
				/>
			)}
			{name === 'base-url' && (
				<>
					<path d="M8.5 8.5 5 12l3.5 3.5M15.5 8.5 19 12l-3.5 3.5" />
					<path d="m13.5 5-3 14" />
					<path d="M3 4h18M3 20h18" opacity=".45" />
				</>
			)}
			{name === 'human' && (
				<>
					<circle cx="12" cy="8" r="3.5" />
					<path d="M5 21a7 7 0 0 1 14 0" />
				</>
			)}
			{name === 'data' && (
				<>
					<ellipse cx="12" cy="5.5" rx="7" ry="3" />
					<path d="M5 5.5v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
					<path d="M5 11.5v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
				</>
			)}
			{name === 'output' && (
				<>
					<rect x="4" y="5" width="12" height="14" rx="2" />
					<path d="M11 12h10M17.5 8.5 21 12l-3.5 3.5" />
				</>
			)}
			{name === 'rich-output' && (
				<>
					<rect x="3" y="4" width="18" height="16" rx="2" />
					<path d="M7 8h6M7 11h10M7 14h4" />
					<path d="m14.5 15.5 2 2 3-4" />
				</>
			)}
			{name === 'mlflow-experiment' && (
				<>
					<ellipse cx="12" cy="6" rx="7" ry="3" />
					<path d="M5 6v8c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
					<path d="M8 20h8M12 17v3" />
				</>
			)}
			{name === 'mlflow-run' && (
				<>
					<rect x="4" y="4" width="16" height="16" rx="3" />
					<path d="m9 8 7 4-7 4Z" fill="currentColor" stroke="none" />
					<path d="M7 2v3M17 2v3" />
				</>
			)}
			{name === 'mlflow-evaluation' && (
				<>
					<path d="M4 18V9M9 18V5M14 18v-7M19 18V3" />
					<path d="M3 21h18" />
					<path d="m15 7 2 2 4-5" />
				</>
			)}
			{name === 'mlflow-model' && (
				<>
					<path d="m12 3 8 4.5-8 4.5-8-4.5Z" />
					<path d="m4 12 8 4.5 8-4.5M4 16.5l8 4.5 8-4.5" />
				</>
			)}
			{name === 'link' && (
				<>
					<circle cx="5" cy="12" r="2.5" />
					<circle cx="19" cy="6" r="2.5" />
					<circle cx="19" cy="18" r="2.5" />
					<path d="M7.5 12h3.5a4 4 0 0 0 4-4v0M11 12a4 4 0 0 1 4 4v0" />
				</>
			)}
			{name === 'play' && <path d="m8 5 11 7-11 7Z" fill="currentColor" stroke="none" />}
			{name === 'stop' && <rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" stroke="none" />}
		</svg>
	)
}
