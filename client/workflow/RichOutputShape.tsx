import {
	BaseBoxShapeUtil,
	HTMLContainer,
	Rectangle2d,
	T,
	TLShape,
	stopEventPropagation,
} from 'tldraw'
import { useEffect, useMemo, useState } from 'react'
import Markdown from 'react-markdown'
import {
	exportWorkflowRunJsonl,
	listWorkflowRuns,
	subscribeToWorkflowRuns,
	WorkflowRunRecord,
} from './runStore'

export const WORKFLOW_RICH_OUTPUT_SHAPE_TYPE = 'workflow-rich-output' as const

declare module '@tldraw/tlschema' {
	export interface TLGlobalShapePropsMap {
		[WORKFLOW_RICH_OUTPUT_SHAPE_TYPE]: {
			w: number
			h: number
		}
	}
}

export type WorkflowRichOutputShape = TLShape<typeof WORKFLOW_RICH_OUTPUT_SHAPE_TYPE>

interface RichOutputWorkflowMeta {
	workflowId: string
	nodeId: string
	status: string
	config: Record<string, string>
	error?: string
}

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

export type OutputPresentation =
	| { kind: 'json'; value: JsonValue }
	| { kind: 'markdown'; value: string }

export class WorkflowRichOutputShapeUtil extends BaseBoxShapeUtil<WorkflowRichOutputShape> {
	static override type = WORKFLOW_RICH_OUTPUT_SHAPE_TYPE
	static override props = {
		w: T.number,
		h: T.number,
	}

	override getDefaultProps(): WorkflowRichOutputShape['props'] {
		return { w: 420, h: 300 }
	}

	override getGeometry(shape: WorkflowRichOutputShape) {
		return new Rectangle2d({
			width: shape.props.w,
			height: shape.props.h,
			isFilled: true,
		})
	}

	override component(shape: WorkflowRichOutputShape) {
		return <RichOutputCard shape={shape} />
	}

	override getIndicatorPath(shape: WorkflowRichOutputShape) {
		const path = new Path2D()
		path.roundRect(0, 0, shape.props.w, shape.props.h, 12)
		return path
	}

	override getText(shape: WorkflowRichOutputShape) {
		const meta = shape.meta.workflow as unknown as RichOutputWorkflowMeta | undefined
		return meta?.config.value ?? ''
	}
}

function RichOutputCard({ shape }: { shape: WorkflowRichOutputShape }) {
	const meta = shape.meta.workflow as unknown as RichOutputWorkflowMeta
	const [runs, setRuns] = useState<WorkflowRunRecord[]>([])
	const [selectedRunId, setSelectedRunId] = useState(meta.config.latestRunId ?? '')

	useEffect(() => {
		let active = true
		const load = async () => {
			try {
				const nextRuns = await listWorkflowRuns(meta.workflowId)
				if (!active) return
				setRuns(nextRuns.filter((run) => Boolean(run.nodeResults[meta.nodeId])))
			} catch {
				if (active) setRuns([])
			}
		}
		void load()
		return subscribeToWorkflowRuns((workflowId) => {
			if (workflowId === meta.workflowId) void load()
		})
	}, [meta.nodeId, meta.workflowId])

	useEffect(() => {
		if (meta.config.latestRunId) setSelectedRunId(meta.config.latestRunId)
	}, [meta.config.latestRunId])

	const selectedRun = runs.find((run) => run.id === selectedRunId)
	const value = selectedRun?.nodeResults[meta.nodeId]?.output ?? meta.config.value ?? ''
	const presentation = useMemo(() => parseOutputPresentation(value), [value])
	const status = selectedRun?.nodeResults[meta.nodeId]?.status ?? meta.status

	return (
		<HTMLContainer
			className={`workflow-rich-output-shell is-${status}`}
			style={{ width: shape.props.w, height: shape.props.h }}
		>
			<header className="workflow-rich-output-header">
				<div>
					<strong>RICH OUTPUT</strong>
					<span>{presentation.kind.toUpperCase()}</span>
				</div>
				<span className="workflow-rich-output-status">{status.toUpperCase()}</span>
			</header>
			<div
				className="workflow-rich-output-controls"
				onPointerDown={stopEventPropagation}
				onClick={stopEventPropagation}
			>
				<label>
					RUN
					<select
						value={selectedRunId}
						disabled={!runs.length}
						onChange={(event) => setSelectedRunId(event.currentTarget.value)}
					>
						{!runs.length && <option value="">Latest canvas value</option>}
						{runs.map((run) => (
							<option key={run.id} value={run.id}>
								{formatRunLabel(run)}
							</option>
						))}
					</select>
				</label>
				<button
					type="button"
					disabled={!selectedRun}
					onPointerDown={stopEventPropagation}
					onClick={(event) => {
						stopEventPropagation(event)
						if (!selectedRun) return
						const jsonl = exportWorkflowRunJsonl(selectedRun)
						if (!jsonl) return
						const blob = new Blob([jsonl], { type: 'application/jsonlines' })
						const url = URL.createObjectURL(blob)
						const link = document.createElement('a')
						link.href = url
						link.download = buildWorkflowRunJsonlFilename(
							meta.workflowId,
							selectedRun.id,
							meta.nodeId
						)
						document.body.appendChild(link)
						link.click()
						link.remove()
						URL.revokeObjectURL(url)
					}}
				>
					EXPORT JSONL
				</button>
				<small>{runs.length ? `${runs.length} saved run${runs.length === 1 ? '' : 's'}` : 'Not saved yet'}</small>
			</div>
			<div
				className="workflow-rich-output-body"
				onPointerDown={stopEventPropagation}
				onClick={stopEventPropagation}
				onWheel={stopEventPropagation}
			>
				{presentation.kind === 'json' ? (
					<JsonTree value={presentation.value} depth={0} />
				) : (
					<Markdown
						skipHtml
						components={{
							a: ({ href, children }) => (
								<a href={href} target="_blank" rel="noreferrer">
									{children}
								</a>
							),
						}}
					>
						{presentation.value || '_No output yet._'}
					</Markdown>
				)}
				{meta.error && <div className="workflow-rich-output-error">{meta.error}</div>}
			</div>
		</HTMLContainer>
	)
}

function JsonTree({
	value,
	depth,
	label,
}: {
	value: JsonValue
	depth: number
	label?: string
}) {
	if (!isJsonContainer(value)) {
		return (
			<div className="workflow-json-leaf">
				{label !== undefined && <span className="workflow-json-key">{label}: </span>}
				<JsonPrimitive value={value} />
			</div>
		)
	}

	const entries = Array.isArray(value)
		? value.map((item, index) => [String(index), item] as const)
		: Object.entries(value)
	const containerLabel = label ?? (Array.isArray(value) ? 'Array' : 'Object')

	return (
		<details className="workflow-json-branch" open={depth < 2}>
			<summary>
				<span className="workflow-json-key">{containerLabel}</span>
				<span className="workflow-json-count">
					{Array.isArray(value) ? `[${entries.length}]` : `{${entries.length}}`}
				</span>
			</summary>
			<div className="workflow-json-children">
				{entries.map(([key, child]) => (
					<JsonTree key={key} value={child} depth={depth + 1} label={key} />
				))}
			</div>
		</details>
	)
}

function JsonPrimitive({ value }: { value: Exclude<JsonValue, JsonValue[] | object> }) {
	if (value === null) return <span className="workflow-json-null">null</span>
	if (typeof value === 'string') return <span className="workflow-json-string">{JSON.stringify(value)}</span>
	if (typeof value === 'number') return <span className="workflow-json-number">{value}</span>
	return <span className="workflow-json-boolean">{String(value)}</span>
}

function isJsonContainer(
	value: JsonValue
): value is JsonValue[] | { [key: string]: JsonValue } {
	return value !== null && typeof value === 'object'
}

export function parseOutputPresentation(rawValue: string): OutputPresentation {
	const fenced = extractWholeCodeFence(rawValue.trim())
	let candidate: unknown = fenced ?? rawValue.trim()
	let parsedAny = false

	for (let depth = 0; depth < 5 && typeof candidate === 'string'; depth += 1) {
		const trimmed = candidate.trim()
		if (!looksLikeJson(trimmed)) break
		try {
			candidate = JSON.parse(trimmed)
			parsedAny = true
		} catch {
			break
		}
	}

	if (parsedAny && typeof candidate !== 'string' && isJsonValue(candidate)) {
		return { kind: 'json', value: candidate }
	}
	if (parsedAny && typeof candidate === 'string') {
		return { kind: 'markdown', value: candidate }
	}
	return { kind: 'markdown', value: rawValue }
}

function extractWholeCodeFence(value: string) {
	const match = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i.exec(value)
	return match?.[1]?.trim()
}

function looksLikeJson(value: string) {
	return (
		(value.startsWith('{') && value.endsWith('}')) ||
		(value.startsWith('[') && value.endsWith(']')) ||
		(value.startsWith('"') && value.endsWith('"')) ||
		value === 'null' ||
		value === 'true' ||
		value === 'false' ||
		/^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(value)
	)
}

function isJsonValue(value: unknown): value is JsonValue {
	if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return true
	if (Array.isArray(value)) return value.every(isJsonValue)
	if (typeof value !== 'object') return false
	return Object.values(value).every(isJsonValue)
}

function formatRunLabel(run: WorkflowRunRecord) {
	const time = new Date(run.startedAt).toLocaleString([], {
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
	})
	return `${time} · ${run.status} · ${run.id.slice(0, 8)}`
}

export function buildWorkflowRunJsonlFilename(workflowId: string, runId: string, nodeId: string): string {
	const sanitize = (value: string) => value.replace(/[^a-zA-Z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '')
	return `${sanitize(workflowId)}_${sanitize(runId)}_${sanitize(nodeId)}.jsonl`
}
