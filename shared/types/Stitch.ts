import type { DesignSystemProjection } from './DesignSystem'

export type StitchDeviceType = 'MOBILE' | 'DESKTOP' | 'TABLET' | 'AGNOSTIC'

export interface StitchStatus {
	configured: boolean
	authMode: 'api-key' | 'oauth' | 'missing'
	provider: 'google-stitch'
	surface: 'native-tldraw'
}

export interface StitchProjectSummary {
	projectRef: string
	title: string
}

export interface StitchScreenSummary {
	screenRef: string
	projectRef: string
	title: string
	documentRef?: string
	localRevision?: string
}

export interface StitchOperationReceipt {
	receiptId: string
	status: 'succeeded'
	operation: 'create-project' | 'generate' | 'edit'
}

export interface StitchProviderReference {
	schema: 'canvapocalypse-stitch-ref/v1'
	projectRef: string
	screenRef: string
}

export interface StitchCreateProjectRequest {
	title: string
	idempotencyKey: string
}

export interface StitchGenerateRequest {
	projectRef: string
	prompt: string
	deviceType: StitchDeviceType
	idempotencyKey: string
	designSystem?: DesignSystemProjection
}

export interface StitchEditRequest extends Omit<StitchGenerateRequest, 'projectRef'> {
	screenRef: string
	expectedRevision: string
}
