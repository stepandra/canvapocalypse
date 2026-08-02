export type DesignSystemRevision = `sha256:${string}`

export type DesignSystemStatus =
	| 'current'
	| 'drifted'
	| 'missing'
	| 'unavailable'

export interface DesignSystemDocumentSummary {
	documentRef: string
	revision: DesignSystemRevision
	title: string
	projectId?: string
	bytes: number
	status: DesignSystemStatus
	driftSummary?: string
	truncated: boolean
}

export interface DesignSystemPaletteRole {
	role: string
	hex: string
	name?: string
}

export interface DesignSystemTypographySummary {
	role: string
	family?: string
	weight?: string
	summary?: string
}

export interface DesignSystemComponentSummary {
	name: string
	summary: string
}

/**
 * A deliberately small semantic view of DESIGN.md. It may be shown on the
 * canvas or sent to an agent; source Markdown, paths, offsets, URLs, and
 * credentials are not members of this contract.
 */
export interface DesignSystemProjection {
	projectId?: string
	theme?: string
	atmosphere: string[]
	palette: DesignSystemPaletteRole[]
	typography: DesignSystemTypographySummary[]
	components: DesignSystemComponentSummary[]
	layoutPrinciples: string[]
	truncated: boolean
}

export interface DesignSystemSnapshot extends DesignSystemDocumentSummary {
	projection: DesignSystemProjection
}

export interface DesignSystemContext {
	shapeId: string
	documentRef: string
	revision: DesignSystemRevision
	title: string
	status: DesignSystemStatus
	projection: DesignSystemProjection
}
