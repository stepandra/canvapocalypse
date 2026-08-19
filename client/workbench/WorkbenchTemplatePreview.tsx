export type WorkbenchTemplatePreviewTone =
	| 'primary'
	| 'secondary'
	| 'accent'
	| 'evidence'

export interface WorkbenchTemplatePreviewNode {
	x: number
	y: number
	w: number
	h: number
	tone?: WorkbenchTemplatePreviewTone
	kind?: 'box' | 'boundary' | 'decision' | 'milestone'
}

export interface WorkbenchTemplatePreviewEdge {
	from: readonly [number, number]
	to: readonly [number, number]
}

export interface WorkbenchTemplatePreviewScene {
	nodes: readonly WorkbenchTemplatePreviewNode[]
	edges: readonly WorkbenchTemplatePreviewEdge[]
}

const scenes: Record<string, WorkbenchTemplatePreviewScene> = {
	'system-context': {
		nodes: [
			{ x: 4, y: 16, w: 14, h: 14, tone: 'secondary' },
			{ x: 28, y: 7, w: 40, h: 32, kind: 'boundary' },
			{ x: 38, y: 17, w: 20, h: 12, tone: 'primary' },
			{ x: 78, y: 16, w: 14, h: 14, tone: 'accent' },
		],
		edges: [
			{ from: [18, 23], to: [38, 23] },
			{ from: [58, 23], to: [78, 23] },
		],
	},
	'decision-graph': {
		nodes: [
			{ x: 3, y: 6, w: 20, h: 11, tone: 'evidence' },
			{ x: 3, y: 29, w: 20, h: 11, tone: 'secondary' },
			{ x: 39, y: 14, w: 18, h: 18, kind: 'decision', tone: 'primary' },
			{ x: 73, y: 6, w: 20, h: 11, tone: 'accent' },
			{ x: 73, y: 29, w: 20, h: 11, tone: 'secondary' },
		],
		edges: [
			{ from: [23, 11], to: [39, 20] },
			{ from: [23, 34], to: [39, 26] },
			{ from: [57, 20], to: [73, 11] },
			{ from: [57, 26], to: [73, 34] },
		],
	},
	'c4-container': {
		nodes: [
			{ x: 3, y: 16, w: 15, h: 13, tone: 'secondary' },
			{ x: 27, y: 4, w: 49, h: 38, kind: 'boundary' },
			{ x: 34, y: 11, w: 16, h: 11, tone: 'primary' },
			{ x: 56, y: 11, w: 13, h: 24, tone: 'accent' },
			{ x: 34, y: 28, w: 16, h: 8, tone: 'evidence' },
			{ x: 84, y: 16, w: 11, h: 13, tone: 'accent' },
		],
		edges: [
			{ from: [18, 22], to: [34, 16] },
			{ from: [50, 16], to: [56, 16] },
			{ from: [69, 23], to: [84, 23] },
		],
	},
	'c4-component': {
		nodes: [
			{ x: 7, y: 5, w: 86, h: 36, kind: 'boundary' },
			{ x: 15, y: 12, w: 18, h: 10, tone: 'primary' },
			{ x: 42, y: 12, w: 18, h: 10, tone: 'secondary' },
			{ x: 69, y: 12, w: 16, h: 10, tone: 'accent' },
			{ x: 42, y: 28, w: 18, h: 7, tone: 'evidence' },
		],
		edges: [
			{ from: [33, 17], to: [42, 17] },
			{ from: [60, 17], to: [69, 17] },
			{ from: [51, 22], to: [51, 28] },
		],
	},
	'service-data-flow': {
		nodes: [
			{ x: 3, y: 8, w: 17, h: 11, tone: 'secondary' },
			{ x: 29, y: 27, w: 17, h: 11, tone: 'primary' },
			{ x: 55, y: 8, w: 17, h: 11, tone: 'primary' },
			{ x: 81, y: 27, w: 15, h: 11, tone: 'accent' },
		],
		edges: [
			{ from: [20, 14], to: [29, 32] },
			{ from: [46, 32], to: [55, 14] },
			{ from: [72, 14], to: [81, 32] },
		],
	},
	'change-radar': {
		nodes: [
			{ x: 37, y: 13, w: 26, h: 20, kind: 'boundary' },
			{ x: 43, y: 18, w: 14, h: 10, tone: 'primary' },
			{ x: 4, y: 5, w: 20, h: 10, tone: 'accent' },
			{ x: 4, y: 31, w: 20, h: 10, tone: 'secondary' },
			{ x: 76, y: 5, w: 20, h: 10, tone: 'evidence' },
			{ x: 76, y: 31, w: 20, h: 10, tone: 'accent' },
		],
		edges: [
			{ from: [24, 10], to: [43, 20] },
			{ from: [24, 36], to: [43, 27] },
			{ from: [57, 20], to: [76, 10] },
			{ from: [57, 27], to: [76, 36] },
		],
	},
	'product-roadmap': {
		nodes: [
			{ x: 3, y: 4, w: 94, h: 10, kind: 'boundary' },
			{ x: 3, y: 18, w: 94, h: 10, kind: 'boundary' },
			{ x: 3, y: 32, w: 94, h: 10, kind: 'boundary' },
			{ x: 12, y: 6, w: 24, h: 6, tone: 'primary' },
			{ x: 48, y: 20, w: 33, h: 6, tone: 'accent' },
			{ x: 25, y: 34, w: 29, h: 6, tone: 'secondary' },
			{ x: 87, y: 18, w: 7, h: 10, kind: 'milestone', tone: 'evidence' },
		],
		edges: [],
	},
	'delivery-timeline': {
		nodes: [
			{ x: 10, y: 19, w: 9, h: 9, kind: 'milestone', tone: 'secondary' },
			{ x: 32, y: 19, w: 9, h: 9, kind: 'milestone', tone: 'primary' },
			{ x: 55, y: 19, w: 9, h: 9, kind: 'milestone', tone: 'accent' },
			{ x: 78, y: 17, w: 13, h: 13, kind: 'decision', tone: 'evidence' },
		],
		edges: [
			{ from: [4, 23], to: [96, 23] },
		],
	},
	'opportunity-decision': {
		nodes: [
			{ x: 38, y: 3, w: 24, h: 10, tone: 'primary' },
			{ x: 8, y: 21, w: 25, h: 10, tone: 'secondary' },
			{ x: 39, y: 21, w: 22, h: 10, tone: 'accent' },
			{ x: 72, y: 19, w: 16, h: 16, kind: 'decision', tone: 'evidence' },
			{ x: 8, y: 36, w: 25, h: 7, tone: 'evidence' },
		],
		edges: [
			{ from: [50, 13], to: [20, 21] },
			{ from: [33, 26], to: [39, 26] },
			{ from: [61, 26], to: [72, 27] },
		],
	},
	'opportunity-solution-tree': {
		nodes: [
			{ x: 38, y: 2, w: 24, h: 8, tone: 'primary' },
			{ x: 12, y: 19, w: 25, h: 8, tone: 'secondary' },
			{ x: 63, y: 19, w: 25, h: 8, tone: 'secondary' },
			{ x: 3, y: 36, w: 18, h: 7, tone: 'accent' },
			{ x: 28, y: 36, w: 18, h: 7, tone: 'accent' },
			{ x: 54, y: 36, w: 18, h: 7, tone: 'accent' },
			{ x: 79, y: 36, w: 18, h: 7, tone: 'evidence' },
		],
		edges: [
			{ from: [50, 10], to: [24, 19] },
			{ from: [50, 10], to: [75, 19] },
			{ from: [24, 27], to: [12, 36] },
			{ from: [24, 27], to: [37, 36] },
			{ from: [75, 27], to: [63, 36] },
			{ from: [75, 27], to: [88, 36] },
		],
	},
	'impact-map': {
		nodes: [
			{ x: 3, y: 17, w: 18, h: 12, tone: 'primary' },
			{ x: 29, y: 5, w: 18, h: 10, tone: 'secondary' },
			{ x: 29, y: 31, w: 18, h: 10, tone: 'secondary' },
			{ x: 55, y: 5, w: 18, h: 10, tone: 'accent' },
			{ x: 55, y: 31, w: 18, h: 10, tone: 'accent' },
			{ x: 81, y: 5, w: 16, h: 10, tone: 'evidence' },
			{ x: 81, y: 31, w: 16, h: 10, tone: 'evidence' },
		],
		edges: [
			{ from: [21, 23], to: [29, 10] },
			{ from: [21, 23], to: [29, 36] },
			{ from: [47, 10], to: [55, 10] },
			{ from: [47, 36], to: [55, 36] },
			{ from: [73, 10], to: [81, 10] },
			{ from: [73, 36], to: [81, 36] },
		],
	},
	'service-blueprint': {
		nodes: [
			{ x: 3, y: 3, w: 94, h: 8, kind: 'boundary' },
			{ x: 3, y: 14, w: 94, h: 8, kind: 'boundary' },
			{ x: 3, y: 25, w: 94, h: 8, kind: 'boundary' },
			{ x: 3, y: 36, w: 94, h: 8, kind: 'boundary' },
			{ x: 12, y: 16, w: 19, h: 4, tone: 'primary' },
			{ x: 42, y: 27, w: 19, h: 4, tone: 'accent' },
			{ x: 70, y: 38, w: 19, h: 4, tone: 'secondary' },
		],
		edges: [],
	},
}

const fallbackScene: WorkbenchTemplatePreviewScene = {
	nodes: [
		{ x: 4, y: 16, w: 21, h: 13, tone: 'secondary' },
		{ x: 39, y: 8, w: 22, h: 13, tone: 'primary' },
		{ x: 75, y: 25, w: 21, h: 13, tone: 'accent' },
	],
	edges: [
		{ from: [25, 22], to: [39, 15] },
		{ from: [61, 15], to: [75, 31] },
	],
}

export function getWorkbenchTemplatePreviewScene(
	templateId: string
): WorkbenchTemplatePreviewScene {
	return scenes[templateId] ?? fallbackScene
}

export function WorkbenchTemplatePreview({ templateId }: { templateId: string }) {
	const scene = getWorkbenchTemplatePreviewScene(templateId)

	return (
		<svg
			className="workbench-template-preview"
			viewBox="0 0 100 46"
			aria-hidden="true"
			focusable="false"
		>
			{scene.edges.map((edge, index) => (
				<line
					key={`edge-${index}`}
					className="workbench-template-preview-edge"
					x1={edge.from[0]}
					y1={edge.from[1]}
					x2={edge.to[0]}
					y2={edge.to[1]}
				/>
			))}
			{scene.nodes.map((node, index) => {
				const className = `workbench-template-preview-node workbench-template-preview-node-${node.tone ?? 'secondary'}`
				if (node.kind === 'decision' || node.kind === 'milestone') {
					const cx = node.x + node.w / 2
					const cy = node.y + node.h / 2
					return (
						<polygon
							key={`node-${index}`}
							className={className}
							points={`${cx},${node.y} ${node.x + node.w},${cy} ${cx},${node.y + node.h} ${node.x},${cy}`}
						/>
					)
				}

				return (
					<rect
						key={`node-${index}`}
						className={`${className}${node.kind === 'boundary' ? ' workbench-template-preview-node-boundary' : ''}`}
						x={node.x}
						y={node.y}
						width={node.w}
						height={node.h}
						rx={node.kind === 'boundary' ? 3 : 2}
					/>
				)
			})}
		</svg>
	)
}
