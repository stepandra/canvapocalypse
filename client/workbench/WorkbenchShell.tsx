import { useCallback, useEffect, useState } from 'react'
import {
	TldrawUiButton,
	TldrawUiButtonIcon,
	TldrawUiButtonLabel,
	TldrawUiDropdownMenuContent,
	TldrawUiDropdownMenuGroup,
	TldrawUiDropdownMenuItem,
	TldrawUiDropdownMenuRoot,
	TldrawUiDropdownMenuTrigger,
	TldrawUiIcon,
	TldrawUiToolbar,
	TldrawUiToolbarButton,
	TldrawUiToolbarToggleGroup,
	TldrawUiToolbarToggleItem,
	useEditor,
} from 'tldraw'
import { TldrawAgentApp } from '../agent/TldrawAgentApp'
import { TldrawAgentAppContextProvider } from '../agent/TldrawAgentAppProvider'
import { MlInternEvalLabLauncher } from '../components/MlInternEvalLabLauncher'
import { CompanionCanvasBridgeController } from '../components/CompanionCanvasBridgeController'
import { DesignSystemOverlay } from '../design-system/DesignSystemOverlay'
import { HtmlMockupOverlay } from '../html-mockup/HtmlMockupOverlay'
import { IsoflowOverlay } from '../isoflow/IsoflowOverlay'
import { KanbanTracksControl } from '../kanban/KanbanTracksControl'
import { TerminalSessionMonitor } from '../terminal/TerminalSessionMonitor'
import { WorkflowOverlay } from '../workflow/WorkflowOverlay'
import {
	resolveWorkbenchDomainPack,
	WORKBENCH_DOMAIN_PACKS,
	WORKBENCH_DOMAINS,
	WorkbenchDomain,
} from './domainPacks'
import {
	persistWorkbenchDomainSelection,
	readWorkbenchDomainSelection,
} from './workbenchState'
import { WorkbenchAgentDock } from './WorkbenchAgentDock'
import { insertWorkbenchTemplate } from './workbenchCanvas'
import { WorkbenchEmojiPalette } from './WorkbenchEmojiPalette'
import { resolveWorkbenchToolProfile } from './workbenchToolProfiles'
import './workbench.css'

interface WorkbenchShellProps {
	app: TldrawAgentApp | null
}

export function WorkbenchShell({ app }: WorkbenchShellProps) {
	const editor = useEditor()
	const [activeDomain, setActiveDomain] = useState<WorkbenchDomain>(
		readWorkbenchDomainSelection
	)
	const [templateStatus, setTemplateStatus] = useState<{
		label: string
		title: string
	} | null>(null)
	const activePack = resolveWorkbenchDomainPack(activeDomain)
	const toolProfile = activePack.toolProfile
		? resolveWorkbenchToolProfile(activePack.toolProfile)
		: null

	useEffect(() => {
		const syncFromHistory = () =>
			setActiveDomain(readWorkbenchDomainSelection())
		window.addEventListener('popstate', syncFromHistory)
		return () => window.removeEventListener('popstate', syncFromHistory)
	}, [])

	const selectDomain = useCallback((domain: WorkbenchDomain) => {
		setActiveDomain(domain)
		setTemplateStatus(null)
		persistWorkbenchDomainSelection(domain)
	}, [])

	const createTemplate = useCallback(
		(templateId: string, templateLabel: string) => {
			try {
				const receipt = insertWorkbenchTemplate(
					editor,
					activeDomain,
					templateId
				)
				setTemplateStatus({
					label: `Created ${receipt.shapeIds.length}`,
					title: `${templateLabel}: ${receipt.shapeIds.length} native shapes and ${receipt.bindingIds.length} bindings`,
				})
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error)
				setTemplateStatus({ label: 'Create failed', title: message })
			}
		},
		[activeDomain, editor]
	)

	return (
		<>
			<TldrawUiToolbar
				className="workbench-pack-switcher"
				label="AI workbench domain"
				orientation="horizontal"
				onPointerDown={(event) => event.stopPropagation()}
				onClick={(event) => event.stopPropagation()}
			>
				<div className="workbench-pack-identity">
					<span className="workbench-pack-kicker">AI Workbench</span>
					<strong className="workbench-pack-name">{activePack.label}</strong>
				</div>
				<TldrawUiToolbarToggleGroup
					className="workbench-pack-options"
					type="single"
					value={activeDomain}
					aria-label="Domain pack"
				>
					{WORKBENCH_DOMAINS.map((domain) => {
						const pack = WORKBENCH_DOMAIN_PACKS[domain]
						const active = domain === activeDomain
						return (
							<TldrawUiToolbarToggleItem
								key={domain}
								className="workbench-pack-option"
								type="icon"
								value={domain}
								aria-label={`${pack.label}: ${pack.description}`}
								aria-pressed={active}
								title={pack.description}
								onClick={() => selectDomain(domain)}
							>
								<span className="workbench-pack-option-label workbench-pack-option-label--full">
									{pack.label}
								</span>
								<span className="workbench-pack-option-label workbench-pack-option-label--short">
									{pack.shortLabel}
								</span>
							</TldrawUiToolbarToggleItem>
						)
					})}
				</TldrawUiToolbarToggleGroup>
				<div className="workbench-template-control">
					<TldrawUiDropdownMenuRoot
						id={`workbench-templates-${activeDomain}`}
						key={activeDomain}
					>
						<TldrawUiDropdownMenuTrigger>
							<TldrawUiToolbarButton
								type="icon"
								className="workbench-template-trigger"
								title={`${activePack.label} templates`}
							>
								<TldrawUiButtonIcon icon="pack" small />
								<TldrawUiButtonLabel>Templates</TldrawUiButtonLabel>
								<span className="workbench-template-count" aria-hidden="true">
									{activePack.templates.length}
								</span>
							</TldrawUiToolbarButton>
						</TldrawUiDropdownMenuTrigger>
						<TldrawUiDropdownMenuContent
							className="workbench-template-palette"
							side="bottom"
							align="end"
							alignOffset={0}
							sideOffset={8}
							collisionPadding={8}
						>
							<TldrawUiDropdownMenuGroup className="workbench-template-group">
								<header className="workbench-template-header">
									<strong>{activePack.label} templates</strong>
									<span>Native, editable tldraw shapes</span>
								</header>
								{activePack.templates.map((template) => (
									<TldrawUiDropdownMenuItem key={template.id}>
										<TldrawUiButton
											type="menu"
											className="workbench-template-option"
											title={template.label}
											onClick={() =>
												createTemplate(template.id, template.label)
											}
										>
											<TldrawUiButtonIcon icon="plus" small />
											<TldrawUiButtonLabel>
												<span className="workbench-template-option-title">
													{template.label}
												</span>
												<span className="workbench-template-option-description">
													{template.description}
												</span>
											</TldrawUiButtonLabel>
										</TldrawUiButton>
									</TldrawUiDropdownMenuItem>
								))}
							</TldrawUiDropdownMenuGroup>
						</TldrawUiDropdownMenuContent>
					</TldrawUiDropdownMenuRoot>
				</div>
				{activeDomain === 'product' && <KanbanTracksControl />}
				<span
					className="workbench-pack-route"
					title={
						templateStatus?.title ??
						'Requests are routed per intent and selection'
					}
					data-status={templateStatus ? 'receipt' : 'route'}
					role="status"
					aria-live="polite"
				>
					<TldrawUiIcon
						icon={templateStatus ? 'check-circle' : 'arrow-cycle'}
						label=""
						small
					/>
					{templateStatus?.label ?? 'Auto route'}
				</span>
			</TldrawUiToolbar>

			<WorkbenchEmojiPalette />
			{toolProfile && (
				<WorkflowOverlay key={toolProfile.id} profile={toolProfile} />
			)}
			{activePack.overlays.isoflow && <IsoflowOverlay />}
			{activePack.overlays.htmlMockup && <HtmlMockupOverlay />}
			{activeDomain === 'uiux' && <DesignSystemOverlay />}
			{activePack.overlays.terminalSession && (
				<TerminalSessionMonitor
					role={activeDomain === 'ml' ? 'ml' : 'architecture'}
				/>
			)}
			{app && (
				<TldrawAgentAppContextProvider app={app}>
					<CompanionCanvasBridgeController>
						<WorkbenchAgentDock domainPack={activeDomain} />
						{activePack.overlays.mlIntern && <MlInternEvalLabLauncher />}
					</CompanionCanvasBridgeController>
				</TldrawAgentAppContextProvider>
			)}
		</>
	)
}
