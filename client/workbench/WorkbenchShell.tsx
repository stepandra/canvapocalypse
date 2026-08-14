import { useCallback, useEffect, useState } from 'react'
import {
	TldrawUiButton,
	TldrawUiButtonIcon,
	TldrawUiButtonLabel,
	TldrawUiIcon,
	TldrawUiPopover,
	TldrawUiPopoverContent,
	TldrawUiPopoverTrigger,
	TldrawUiToolbar,
	TldrawUiToolbarButton,
	useEditor,
} from 'tldraw'
import { TldrawAgentApp } from '../agent/TldrawAgentApp'
import { TldrawAgentAppContextProvider } from '../agent/TldrawAgentAppProvider'
import { BridgeCenter } from '../bridges/BridgeCenter'
import { MlInternEvalLabLauncher } from '../components/MlInternEvalLabLauncher'
import { CompanionCanvasBridgeController } from '../components/CompanionCanvasBridgeController'
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
import { WorkbenchDomainIcon } from './WorkbenchDomainIcon'
import { WorkbenchEmojiPalette } from './WorkbenchEmojiPalette'
import { UiuxProviderDock } from './UiuxProviderDock'
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
	const [domainMenuOpen, setDomainMenuOpen] = useState(false)
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
				className="workbench-aux-rail workbench-pack-switcher"
				label="AI Workbench"
				orientation="vertical"
				onPointerDown={(event) => event.stopPropagation()}
				onClick={(event) => event.stopPropagation()}
			>
				<TldrawUiPopover
					id="workbench-domain-center"
					open={domainMenuOpen}
					onOpenChange={setDomainMenuOpen}
					className="workbench-domain-popover"
				>
					<TldrawUiPopoverTrigger>
						<TldrawUiToolbarButton
							type="icon"
							className="workbench-rail-trigger workbench-domain-trigger workbench-template-trigger"
							title={`Domain · ${activePack.label}`}
							aria-label={`Domain · ${activePack.label}`}
							aria-expanded={domainMenuOpen}
						>
							<WorkbenchDomainIcon name={activePack.icon} />
						</TldrawUiToolbarButton>
					</TldrawUiPopoverTrigger>
					<TldrawUiPopoverContent
						side="right"
						align="start"
						sideOffset={8}
						collisionPadding={12}
						autoFocusFirstButton={false}
					>
						<section
							className="workbench-domain-center workbench-template-palette"
							aria-label="Workbench domain"
							onPointerDown={(event) => event.stopPropagation()}
							onClick={(event) => event.stopPropagation()}
						>
							<header className="workbench-popover-header">
								<div className="workbench-popover-title">
									<span
										className="workbench-active-domain-icon"
										aria-hidden="true"
									>
										<WorkbenchDomainIcon name={activePack.icon} />
									</span>
									<span className="workbench-popover-heading">
										<span className="workbench-popover-kicker">
											ACTIVE DOMAIN
										</span>
										<strong>{activePack.label}</strong>
									</span>
									<span className="workbench-surface-badge">Native canvas</span>
								</div>
								<p>{activePack.description}</p>
							</header>

							<div
								className="workbench-domain-options workbench-pack-options"
								role="group"
								aria-label="Domain pack"
							>
								{WORKBENCH_DOMAINS.map((domain) => {
									const pack = WORKBENCH_DOMAIN_PACKS[domain]
									const active = domain === activeDomain
									return (
										<TldrawUiButton
											key={domain}
											type="menu"
											className="workbench-domain-option workbench-pack-option"
											title={pack.description}
											aria-pressed={active}
											data-active={active}
											onClick={() => selectDomain(domain)}
										>
											<span
												className="workbench-domain-option-icon"
												aria-hidden="true"
											>
												<WorkbenchDomainIcon name={pack.icon} small />
											</span>
											<TldrawUiButtonLabel>{pack.label}</TldrawUiButtonLabel>
											{active && (
												<TldrawUiButtonIcon icon="check-circle" small />
											)}
										</TldrawUiButton>
									)
								})}
							</div>

							<div className="workbench-popover-section workbench-template-control">
								<div className="workbench-popover-section-heading">
									<strong>Templates</strong>
									<span>{activePack.templates.length} native sets</span>
								</div>
								<div className="workbench-template-group">
									{activePack.templates.map((template) => (
										<TldrawUiButton
											type="menu"
											className="workbench-template-option"
											key={template.id}
											title={template.label}
											onClick={() =>
												createTemplate(template.id, template.label)
											}
										>
											<span
												className="workbench-template-option-icon"
												aria-hidden="true"
											>
												<TldrawUiIcon icon={template.icon} label="" small />
											</span>
											<TldrawUiButtonLabel>
												<span className="workbench-template-option-title">
													{template.label}
												</span>
												<span className="workbench-template-option-description">
													{template.description}
												</span>
											</TldrawUiButtonLabel>
										</TldrawUiButton>
									))}
								</div>
							</div>

							{activeDomain === 'uiux' && (
								<div className="workbench-popover-section workbench-mode-adjunct">
									<div className="workbench-popover-section-heading">
										<strong>Providers</strong>
										<span>Selection-aware</span>
									</div>
									<UiuxProviderDock />
								</div>
							)}
							{activeDomain === 'product' && (
								<div className="workbench-popover-section workbench-mode-adjunct">
									<div className="workbench-popover-section-heading">
										<strong>Product workspace</strong>
										<span>Read-only import</span>
									</div>
									<KanbanTracksControl />
								</div>
							)}

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
								<span>
									<strong>
										{templateStatus?.label ?? 'Auto route'}
									</strong>
									<small>
										{templateStatus
											? 'Undoable canvas receipt'
											: 'Intent + selection'}
									</small>
								</span>
							</span>
						</section>
					</TldrawUiPopoverContent>
				</TldrawUiPopover>
				<BridgeCenter />
			</TldrawUiToolbar>

			<WorkbenchEmojiPalette />
			{toolProfile && (
				<WorkflowOverlay key={toolProfile.id} profile={toolProfile} />
			)}
			{activePack.overlays.isoflow && <IsoflowOverlay />}
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
