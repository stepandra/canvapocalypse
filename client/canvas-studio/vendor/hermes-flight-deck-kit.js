// offline/flight-deck-kit.tsx
import {
  BaseBoxShapeUtil,
  HTMLContainer,
  Rectangle2d,
  T,
  createBindingId,
  createShapeId,
  stopEventPropagation as stopEventPropagation2
} from "tldraw";

// client/app.css
var app_default = ':root {\n  --ui-canvas: #f7f7f5;\n  --ui-panel: #ffffff;\n  --ui-background: #fafaf9;\n  --ui-muted-1: #f3f3f1;\n  --ui-muted-2: #e9e9e6;\n  --ui-divider: #dededb;\n  --ui-divider-strong: #cacac6;\n  --ui-text-1: #171717;\n  --ui-text-2: #555552;\n  --ui-text-3: #858580;\n  --ui-focus: #426c9b;\n  --ui-success: #466b8c;\n  --ui-warning: #a46e2f;\n  --ui-danger: #b44747;\n  --ui-stage: #596a7c;\n  --ui-agent: #596a7c;\n  --ui-persona: #816a4c;\n  --ui-overlay: #765d91;\n  font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;\n  color: var(--ui-text-1);\n  background: var(--ui-canvas);\n  font-synthesis: none;\n}\n\n* { box-sizing: border-box; }\nhtml, body, #root { width: 100%; height: 100%; margin: 0; overflow: hidden; }\nbutton, input, textarea, select { font: inherit; }\nbutton { color: inherit; }\n\n.app-shell { position: relative; width: 100%; height: 100%; background: var(--ui-canvas); }\n.canvas-wrap { position: absolute; inset: 0 374px 0 0; }\n.tl-background { background: var(--ui-canvas) !important; }\n.surface { background: var(--ui-panel); border: 1px solid var(--ui-divider); box-shadow: none; }\n\n.topbar { position: absolute; z-index: 50; top: 12px; left: 12px; right: 386px; min-height: 52px; display: flex; align-items: center; gap: 9px; padding: 6px; border-radius: 9px; }\n.brand-mark { width: 36px; height: 36px; display: grid; place-items: center; border: 1px solid var(--ui-divider); border-radius: 7px; background: var(--ui-muted-2); color: var(--ui-agent); font: 800 16px/1 ui-monospace, monospace; }\n.brand-copy { min-width: 178px; display: grid; gap: 2px; }\n.brand-copy strong { font-size: 12px; font-weight: 650; }\n.brand-copy span { color: var(--ui-text-3); font-size: 9px; }\n.stage-nav { height: 34px; display: flex; align-items: stretch; border: 1px solid var(--ui-divider); border-radius: 6px; background: var(--ui-muted-1); overflow: hidden; }\n.stage-nav button { min-width: 50px; border: 0; border-right: 1px solid var(--ui-divider); padding: 0 9px; background: transparent; color: var(--ui-text-3); cursor: pointer; font-size: 8px; font-weight: 750; letter-spacing: .04em; text-transform: uppercase; }\n.stage-nav button:last-child { border-right: 0; }\n.stage-nav button:hover { color: var(--ui-text-1); background: var(--ui-panel); }\n.stage-nav button.active { color: #fff; background: #252525; }\n.target-chip { min-width: 74px; padding: 5px 7px; border: 1px solid var(--ui-divider); border-radius: 5px; color: var(--ui-text-2); background: var(--ui-muted-1); font: 700 7px/1.1 ui-monospace, monospace; text-align: center; text-transform: uppercase; }\n.repo-open { min-width: 240px; flex: 1; display: flex; height: 34px; border: 1px solid var(--ui-divider); border-radius: 6px; background: var(--ui-muted-1); overflow: hidden; }\n.repo-open input { min-width: 80px; flex: 1; border: 0; outline: 0; padding: 0 9px; background: transparent; color: var(--ui-text-1); font: 500 9px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace; }\n.repo-open button { border: 0; border-left: 1px solid var(--ui-divider); padding: 0 10px; background: var(--ui-panel); cursor: pointer; font-size: 9px; font-weight: 700; }\n.secondary-button, .wide-button { min-height: 32px; border: 1px solid var(--ui-divider); border-radius: 6px; padding: 0 10px; background: var(--ui-panel); cursor: pointer; color: var(--ui-text-1); font-size: 9px; font-weight: 700; }\n.secondary-button:hover, .wide-button:hover { background: var(--ui-muted-1); border-color: var(--ui-divider-strong); }\n.play-button { min-height: 34px; border: 1px solid #000; border-radius: 6px; padding: 0 13px; display: inline-flex; align-items: center; justify-content: center; gap: 7px; background: #111; color: #fff; cursor: pointer; font-size: 10px; font-weight: 750; box-shadow: none; }\n.play-button:hover { background: #2a2a2a; }\n.stop-button { min-height: 34px; border: 1px solid var(--ui-danger); border-radius: 6px; padding: 0 12px; background: #fff; color: var(--ui-danger); cursor: pointer; font-size: 9px; font-weight: 750; }\nbutton:disabled { opacity: .48; cursor: not-allowed; }\n\n.config-panel { position: absolute; z-index: 45; top: 12px; right: 12px; bottom: 12px; width: 358px; display: flex; flex-direction: column; border-radius: 10px; overflow: hidden; }\n.panel-heading { min-height: 52px; display: flex; align-items: center; justify-content: space-between; padding: 7px 10px; border-bottom: 1px solid var(--ui-divider); background: var(--ui-panel); }\n.panel-heading h2 { margin: 3px 0 0; font-size: 12px; font-weight: 650; letter-spacing: 0; }\n.eyebrow { display: block; color: var(--ui-text-3); font: 650 8px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .05em; }\n.fresh-badge { padding: 0; border: 0; border-radius: 0; background: transparent; color: var(--ui-success); font: 750 7px/1 ui-monospace, monospace; letter-spacing: .04em; text-transform: uppercase; }\n.tab-bar { display: grid; grid-template-columns: repeat(3, 1fr); padding: 0 8px; border-bottom: 1px solid var(--ui-divider); background: var(--ui-muted-1); }\n.tab-bar button, .prompt-tabs button { border: 0; border-bottom: 2px solid transparent; padding: 9px 4px 8px; background: transparent; color: var(--ui-text-3); cursor: pointer; font-size: 8px; font-weight: 750; text-transform: uppercase; letter-spacing: .06em; }\n.tab-bar button.active, .prompt-tabs button.active { border-bottom-color: var(--ui-focus); color: var(--ui-text-1); }\n.panel-scroll { flex: 1; min-height: 0; overflow: auto; padding: 8px; background: var(--ui-panel); scrollbar-width: thin; scrollbar-color: var(--ui-divider-strong) transparent; }\n.panel-notice { flex: 0 0 auto; overflow: hidden; padding: 7px 9px; border-top: 1px solid var(--ui-divider); background: var(--ui-muted-1); color: var(--ui-text-3); font-size: 8px; line-height: 1.35; text-overflow: ellipsis; white-space: nowrap; }\n.config-section { padding: 8px; border: 1px solid var(--ui-divider); border-radius: 7px; background: var(--ui-background); }\n.config-section + .config-section { margin-top: 7px; }\n.config-section h3 { display: flex; justify-content: space-between; margin: -8px -8px 8px; padding: 9px 8px 8px; border-bottom: 1px solid var(--ui-divider); color: var(--ui-text-2); font-size: 9px; text-transform: uppercase; letter-spacing: .06em; }\n.config-section h3 span { color: var(--ui-text-3); }\n.config-section label { display: grid; grid-template-columns: 104px minmax(0, 1fr); align-items: center; gap: 7px; margin-top: 7px; color: var(--ui-text-2); font-size: 9px; font-weight: 600; }\n.config-section :is(input, select) { min-width: 0; height: 30px; border: 1px solid var(--ui-divider); border-radius: 6px; outline: 0; padding: 0 8px; background: var(--ui-muted-1); color: var(--ui-text-1); font: 550 9px/1 ui-monospace, monospace; }\n.config-section :is(input, select):focus { border-color: var(--ui-focus); box-shadow: inset 0 0 0 1px var(--ui-focus); }\n.hermes-model-routing { min-width: 0; display: grid; gap: 7px; }\n.hermes-model-select { min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr) 31px; gap: 4px; }\n.hermes-model-select select { min-width: 0; width: 100%; }\n.hermes-model-select button { min-width: 0; border: 1px solid var(--ui-divider); border-radius: 6px; background: var(--ui-panel); color: var(--ui-focus); cursor: pointer; font-size: 14px; }\n.hermes-model-status { margin: 2px 0 0; color: var(--ui-text-3); font: 7px/1.45 ui-monospace, monospace; overflow-wrap: anywhere; }\n.hermes-model-status.is-warning { color: var(--ui-warning); }\n.kv { display: grid; grid-template-columns: 88px minmax(0, 1fr); gap: 7px; align-items: start; padding: 7px 0; border-bottom: 1px solid var(--ui-divider); }\n.kv span { color: var(--ui-text-3); font-size: 8px; }\n.kv code { overflow-wrap: anywhere; color: var(--ui-text-2); font-size: 8px; line-height: 1.35; }\n.section-note { margin: 9px 0 0; color: var(--ui-text-3); font-size: 8px; line-height: 1.45; }\n.budget-primary { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1px; border: 1px solid var(--ui-divider); border-radius: 6px; background: var(--ui-divider); overflow: hidden; }\n.budget-primary > span { min-width: 0; display: grid; gap: 4px; padding: 8px; background: var(--ui-panel); }\n.budget-primary small, .provider-usage small { color: var(--ui-text-3); font: 700 7px/1.2 ui-monospace, monospace; letter-spacing: .04em; }\n.budget-primary strong { overflow: hidden; color: var(--ui-text-1); font: 700 10px/1.2 ui-monospace, monospace; text-overflow: ellipsis; white-space: nowrap; }\n.budget-bar { height: 5px; margin-top: 8px; border-radius: 999px; background: var(--ui-muted-2); overflow: hidden; }\n.budget-bar span { display: block; height: 100%; min-width: 1px; border-radius: inherit; background: var(--ui-focus); }\n.budget-breakdown { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px 12px; margin-top: 9px; }\n.budget-breakdown span { display: flex; justify-content: space-between; gap: 6px; color: var(--ui-text-3); font-size: 8px; }\n.budget-breakdown strong { color: var(--ui-text-2); font: 650 8px/1.2 ui-monospace, monospace; text-align: right; }\n.provider-usage { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px 10px; margin-top: 9px; padding: 8px; border: 1px solid color-mix(in srgb, var(--ui-success), transparent 55%); border-radius: 6px; background: color-mix(in srgb, var(--ui-success), transparent 94%); }\n.provider-usage small { grid-column: 1 / -1; color: var(--ui-success); }\n.provider-usage strong { color: var(--ui-text-1); font: 700 9px/1.3 ui-monospace, monospace; }\n.provider-usage span { color: var(--ui-text-3); font: 600 8px/1.3 ui-monospace, monospace; }\n.budget-note { margin: 8px 0 0; color: var(--ui-text-3); font-size: 7px; line-height: 1.4; }\n.status-line { display: flex; align-items: center; gap: 7px; color: var(--ui-text-2); font-size: 9px; }\n.dot { width: 7px; height: 7px; flex: 0 0 auto; border-radius: 50%; background: var(--ui-text-3); }\n.dot.ok { background: var(--ui-success); box-shadow: none; }\n.wide-button { width: 100%; margin-top: 12px; }\n.panel-repo { min-width: 0; width: 100%; }\n.readiness-hero { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: start; gap: 8px; }\n.readiness-hero strong { color: var(--ui-text-2); font-size: 10px; line-height: 1.4; }\n.readiness-pill { padding: 3px 5px; border: 1px solid var(--ui-divider); border-radius: 4px; color: var(--ui-text-3); font: 750 7px/1 ui-monospace, monospace; text-transform: uppercase; }\n.readiness-pill.pass { border-color: color-mix(in srgb, var(--ui-success), transparent 55%); color: var(--ui-success); background: color-mix(in srgb, var(--ui-success), transparent 92%); }\n.readiness-pill.warn { border-color: color-mix(in srgb, var(--ui-warning), transparent 55%); color: var(--ui-warning); background: color-mix(in srgb, var(--ui-warning), transparent 92%); }\n.readiness-pill.fail { border-color: color-mix(in srgb, var(--ui-danger), transparent 55%); color: var(--ui-danger); background: color-mix(in srgb, var(--ui-danger), transparent 92%); }\n.readiness-row { width: 100%; display: grid; grid-template-columns: 8px minmax(0, 1fr) auto; align-items: center; gap: 7px; border: 0; border-bottom: 1px solid var(--ui-divider); padding: 8px 0; background: transparent; cursor: pointer; text-align: left; }\n.readiness-row:last-child { border-bottom: 0; }\n.readiness-row:hover span:nth-child(2) { color: var(--ui-focus); }\n.readiness-row span:nth-child(2) { font-size: 9px; }\n.readiness-row strong { color: var(--ui-text-3); font: 700 7px/1 ui-monospace, monospace; text-transform: uppercase; }\n.event-dot.status-pass { background: var(--ui-success); }\n.event-dot.status-warn { background: var(--ui-warning); }\n.event-dot.status-fail { background: var(--ui-danger); }\n.target-list { display: grid; gap: 5px; }\n.target-list button { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 8px; border: 1px solid var(--ui-divider); border-radius: 6px; padding: 8px; background: var(--ui-panel); cursor: pointer; text-align: left; }\n.target-list button.active { border-color: var(--ui-focus); box-shadow: inset 0 0 0 1px var(--ui-focus); }\n.target-list button.unavailable { opacity: .58; }\n.target-list button > span:first-child { min-width: 0; display: grid; gap: 3px; }\n.target-list strong { font-size: 9px; }\n.target-list small { overflow: hidden; color: var(--ui-text-3); font-size: 7px; text-overflow: ellipsis; white-space: nowrap; }\n.target-state { color: var(--ui-warning); font: 750 7px/1 ui-monospace, monospace; text-transform: uppercase; }\n.target-state.ready { color: var(--ui-success); }\n.referral-card { display: grid; gap: 7px; margin-top: 8px; padding: 9px; border: 1px solid var(--ui-divider); border-radius: 6px; background: var(--ui-muted-1); }\n.referral-card strong { font-size: 10px; }\n.referral-card p { margin: 0; color: var(--ui-text-2); font-size: 8px; line-height: 1.45; }\n.referral-card a { color: var(--ui-focus); font-size: 9px; font-weight: 700; }\n.referral-card small { color: var(--ui-text-3); font-size: 7px; }\n.request-card { border-color: color-mix(in srgb, var(--ui-warning), transparent 55%); }\n.request-card > strong { font: 750 8px/1 ui-monospace, monospace; text-transform: uppercase; }\n.request-card pre { max-height: 140px; overflow: auto; padding: 8px; background: #202124; color: #ececec; font: 8px/1.4 ui-monospace, monospace; white-space: pre-wrap; }\n.request-actions { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; }\n.request-actions button { min-height: 30px; border: 1px solid var(--ui-divider); border-radius: 5px; background: var(--ui-panel); cursor: pointer; font-size: 8px; font-weight: 700; }\n.extension-row { display: flex; justify-content: space-between; gap: 8px; padding: 8px 0; border-top: 1px solid var(--ui-divider); }\n.extension-row div { min-width: 0; display: grid; gap: 3px; }\n.extension-row strong { font-size: 10px; }\n.extension-row small { overflow: hidden; color: var(--ui-text-3); font-size: 8px; text-overflow: ellipsis; white-space: nowrap; }\n.extension-row > span, .restart-pill { align-self: start; padding: 0; border-radius: 0; background: transparent; color: var(--ui-text-3); font: 700 7px/1 ui-monospace, monospace; white-space: nowrap; text-transform: uppercase; }\n.restart-pill { color: var(--ui-warning) !important; }\n.surface-row { display: grid; gap: 3px; padding: 8px 0; border-top: 1px solid var(--ui-divider); }\n.surface-row strong { color: var(--ui-text-2); font-size: 9px; }\n.surface-row small { color: var(--ui-text-3); font-size: 8px; line-height: 1.35; }\n.evidence-list { display: grid; gap: 0; }\n.evidence-list > div { min-width: 0; display: grid; grid-template-columns: 8px minmax(0, 1fr) auto; align-items: start; gap: 7px; padding: 7px 0; border-bottom: 1px solid var(--ui-divider); color: var(--ui-text-2); font-size: 8px; line-height: 1.35; }\n.evidence-list > div:last-child { border-bottom: 0; }\n.evidence-list small { color: var(--ui-text-3); font: 700 7px/1.3 ui-monospace, monospace; text-transform: uppercase; }\n.inventory-row { min-width: 0; display: flex; align-items: start; justify-content: space-between; gap: 8px; padding: 7px 0; border-bottom: 1px solid var(--ui-divider); }\n.inventory-row > span { min-width: 0; display: grid; gap: 2px; }\n.inventory-row strong { overflow-wrap: anywhere; color: var(--ui-text-2); font-size: 8px; }\n.inventory-row small { overflow-wrap: anywhere; color: var(--ui-text-3); font-size: 7px; line-height: 1.35; }\n.inventory-row code { flex: 0 0 auto; color: var(--ui-text-2); font: 650 7px/1.35 ui-monospace, monospace; text-align: right; }\n.inventory-details { margin-top: 6px; }\n.inventory-details summary { padding: 6px 0; color: var(--ui-focus); cursor: pointer; font-size: 8px; font-weight: 700; }\n.inventory-total { display: flex; justify-content: space-between; gap: 8px; padding-top: 8px; color: var(--ui-text-2); font-size: 8px; }\n.inventory-total strong { font: 700 8px/1.2 ui-monospace, monospace; text-align: right; }\n\n.composer { position: absolute; z-index: 42; right: 386px; bottom: 96px; left: 12px; min-height: 66px; display: grid; grid-template-columns: 105px minmax(0, 1fr) 40px; align-items: center; gap: 8px; padding: 7px; border-radius: 9px; }\n.composer-branch { display: grid; gap: 3px; padding-left: 5px; }\n.composer-branch span { color: var(--ui-text-3); font: 650 8px/1.2 ui-monospace, monospace; text-transform: uppercase; letter-spacing: .05em; }\n.composer-branch strong { font-size: 10px; font-weight: 650; }\n.composer textarea { height: 50px; resize: none; border: 1px solid var(--ui-divider); border-radius: 6px; outline: 0; padding: 9px 10px; background: var(--ui-muted-1); color: var(--ui-text-1); font-size: 10px; line-height: 1.4; }\n.composer textarea:focus { border-color: var(--ui-focus); box-shadow: inset 0 0 0 1px var(--ui-focus); }\n.composer .play-button { width: 36px; height: 36px; padding: 0; }\n.timeline { position: absolute; z-index: 41; right: 386px; bottom: 12px; left: 12px; height: 74px; display: grid; grid-template-columns: 112px minmax(0, 1fr); align-items: stretch; border-radius: 9px; overflow: hidden; }\n.timeline-heading { display: flex; flex-direction: column; justify-content: center; gap: 4px; padding: 10px; border-right: 1px solid var(--ui-divider); background: var(--ui-muted-1); }\n.timeline-heading strong { font-size: 9px; }\n.timeline-heading span { color: var(--ui-text-3); font: 650 7px/1 ui-monospace, monospace; text-transform: uppercase; }\n.timeline-empty { align-self: center; margin: 0; padding: 12px; color: var(--ui-text-3); font-size: 8px; }\n.timeline-strip { min-width: 0; display: flex; align-items: stretch; overflow-x: auto; padding: 8px; gap: 0; }\n.timeline-event { position: relative; min-width: 112px; display: grid; grid-template-columns: 8px minmax(0, 1fr); align-content: center; gap: 3px 5px; padding: 0 9px; border-right: 1px solid var(--ui-divider); }\n.timeline-event:last-child { border-right: 0; }\n.timeline-event strong { overflow: hidden; font: 700 7px/1.2 ui-monospace, monospace; text-overflow: ellipsis; text-transform: uppercase; white-space: nowrap; }\n.timeline-event small { grid-column: 2; overflow: hidden; color: var(--ui-text-3); font-size: 7px; text-overflow: ellipsis; white-space: nowrap; }\n.report-summary { min-width: 0; display: grid; grid-template-columns: auto minmax(0, 1fr); align-content: center; gap: 5px 14px; padding: 10px 14px; }\n.report-summary strong { grid-row: 1 / 3; align-self: center; font-size: 14px; }\n.report-summary span { overflow: hidden; color: var(--ui-text-3); font: 8px/1.25 ui-monospace, monospace; text-overflow: ellipsis; white-space: nowrap; }\n\n.hermes-config-node { width: 100%; height: 100%; pointer-events: all; }\n.hermes-config-explorer { width: 100%; height: 100%; min-height: 0; display: grid; grid-template-rows: 54px minmax(0, 1fr) auto; overflow: hidden; border: 1px solid var(--ui-divider-strong); border-radius: 10px; background: var(--ui-panel); color: var(--ui-text-1); box-shadow: 0 8px 30px rgba(23, 23, 23, .09); pointer-events: auto; }\n.hermes-config-explorer > header { min-width: 0; display: grid; grid-template-columns: 34px minmax(0, 1fr) 12px; align-items: center; gap: 9px; padding: 7px 11px; border-bottom: 1px solid var(--ui-divider); background: var(--ui-panel); }\n.hermes-config-icon { width: 32px; height: 32px; display: grid; place-items: center; border: 1px solid var(--ui-divider); border-radius: 7px; background: var(--ui-muted-2); color: var(--ui-focus); font: 800 14px/1 ui-monospace, monospace; }\n.hermes-config-explorer > header > span { min-width: 0; display: grid; gap: 3px; }\n.hermes-config-explorer > header strong { overflow: hidden; font-size: 12px; font-weight: 680; text-overflow: ellipsis; white-space: nowrap; }\n.hermes-config-explorer > header small { overflow: hidden; color: var(--ui-text-3); font: 650 7px/1.2 ui-monospace, monospace; letter-spacing: .04em; text-overflow: ellipsis; white-space: nowrap; }\n.hermes-config-explorer > header i { width: 8px; height: 8px; border-radius: 50%; background: var(--ui-text-3); }\n.hermes-config-explorer > header i.is-dirty { background: var(--ui-warning); box-shadow: 0 0 0 3px color-mix(in srgb, var(--ui-warning), transparent 82%); }\n.hermes-config-body { min-width: 0; min-height: 0; display: grid; grid-auto-rows: max-content; align-content: start; gap: 8px; overflow-y: scroll; overscroll-behavior: contain; padding: 9px; scrollbar-gutter: stable; scrollbar-width: thin; scrollbar-color: var(--ui-divider-strong) transparent; touch-action: pan-y; }\n.hermes-config-filter { position: sticky; z-index: 3; top: -9px; display: grid; grid-template-columns: 18px minmax(0, 1fr) 28px; align-items: center; gap: 6px; margin: -9px -9px 0; padding: 9px; border-bottom: 1px solid var(--ui-divider); background: var(--ui-panel); }\n.hermes-config-filter > span { color: var(--ui-text-3); font: 18px/1 ui-monospace, monospace; transform: rotate(-15deg); }\n.hermes-config-filter input { width: 100%; height: 32px; border: 1px solid var(--ui-divider); border-radius: 6px; outline: 0; padding: 0 9px; background: var(--ui-muted-1); color: var(--ui-text-1); font-size: 9px; }\n.hermes-config-filter input:focus { border-color: var(--ui-focus); box-shadow: inset 0 0 0 1px var(--ui-focus); }\n.hermes-config-filter button { width: 28px; height: 28px; border: 0; border-radius: 5px; background: transparent; color: var(--ui-text-3); cursor: pointer; font-size: 16px; }\n.hermes-config-category { min-width: 0; display: grid; overflow: hidden; border: 1px solid var(--ui-divider); border-radius: 7px; background: var(--ui-background); }\n.hermes-config-category-toggle { width: 100%; min-height: 36px; display: grid; grid-template-columns: 18px minmax(0, 1fr) auto; align-items: center; gap: 7px; border: 0; padding: 0 9px; background: transparent; color: var(--ui-text-1); cursor: pointer; text-align: left; }\n.hermes-config-category-toggle:hover { background: var(--ui-muted-1); }\n.hermes-config-category-toggle > span { color: var(--ui-text-3); font: 16px/1 ui-monospace, monospace; }\n.hermes-config-category-toggle strong { font-size: 10px; font-weight: 680; }\n.hermes-config-category-toggle small { color: var(--ui-text-3); font: 700 7px/1 ui-monospace, monospace; letter-spacing: .04em; }\n.hermes-config-category > div { display: grid; gap: 8px; padding: 8px; border-top: 1px solid var(--ui-divider); background: var(--ui-panel); }\n.hermes-config-control { min-width: 0; display: grid; grid-template-columns: 220px minmax(0, 1fr); align-items: center; gap: 9px; padding-bottom: 8px; border-bottom: 1px solid var(--ui-divider); }\n.hermes-config-control:last-child { padding-bottom: 0; border-bottom: 0; }\n.hermes-config-control-copy { min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 3px 8px; }\n.hermes-config-control-copy strong { overflow: hidden; color: var(--ui-text-2); font-size: 9px; font-weight: 680; text-overflow: ellipsis; white-space: nowrap; }\n.hermes-config-control-copy small { color: var(--ui-text-3); font: 700 6px/1.2 ui-monospace, monospace; letter-spacing: .05em; }\n.hermes-config-control-copy em { grid-column: 1 / -1; color: var(--ui-text-3); font-size: 7px; font-style: normal; line-height: 1.35; }\n.hermes-config-control > :is(input, select, textarea, output), .hermes-config-checkbox { width: 100%; min-width: 0; border: 1px solid var(--ui-divider); border-radius: 6px; outline: 0; background: var(--ui-muted-1); color: var(--ui-text-1); font: 550 9px/1.25 ui-monospace, monospace; }\n.hermes-config-control > :is(input, select, output), .hermes-config-checkbox { min-height: 31px; padding: 0 8px; }\n.hermes-config-control > textarea { min-height: 66px; resize: vertical; padding: 8px; line-height: 1.4; }\n.hermes-config-control > :is(input, select, textarea):focus { border-color: var(--ui-focus); box-shadow: inset 0 0 0 1px var(--ui-focus); }\n.hermes-config-control > output { display: flex; align-items: center; overflow: hidden; color: var(--ui-text-2); text-overflow: ellipsis; white-space: nowrap; }\n.hermes-config-checkbox { display: flex; align-items: center; gap: 8px; cursor: pointer; }\n.hermes-config-checkbox input { width: 14px; height: 14px; margin: 0; accent-color: var(--ui-focus); cursor: pointer; }\n.hermes-config-checkbox span { font-size: 9px; }\n.hermes-config-category .hermes-model-routing { padding-bottom: 8px; border-bottom: 1px solid var(--ui-divider); }\n.hermes-config-category .hermes-model-routing > label { min-width: 0; display: grid; grid-template-columns: 220px minmax(0, 1fr); align-items: center; gap: 9px; color: var(--ui-text-2); font-size: 9px; font-weight: 680; }\n.hermes-config-category .hermes-model-routing :is(input, select) { width: 100%; min-width: 0; min-height: 31px; border: 1px solid var(--ui-divider); border-radius: 6px; outline: 0; padding: 0 8px; background: var(--ui-muted-1); color: var(--ui-text-1); font: 550 9px/1.25 ui-monospace, monospace; }\n.hermes-config-category .hermes-model-routing :is(input, select):focus { border-color: var(--ui-focus); box-shadow: inset 0 0 0 1px var(--ui-focus); }\n.hermes-config-multiselect { position: relative; width: 100%; min-width: 0; border: 1px solid var(--ui-divider); border-radius: 6px; background: var(--ui-muted-1); color: var(--ui-text-2); font: 550 9px/1.25 ui-monospace, monospace; }\n.hermes-config-multiselect > summary { min-height: 31px; display: flex; align-items: center; overflow: hidden; padding: 0 8px; cursor: pointer; text-overflow: ellipsis; white-space: nowrap; }\n.hermes-config-multiselect > div { max-height: 190px; display: grid; gap: 1px; overflow: auto; padding: 5px; border-top: 1px solid var(--ui-divider); background: var(--ui-panel); }\n.hermes-config-multiselect label { display: flex; align-items: center; gap: 7px; padding: 5px; border-radius: 4px; cursor: pointer; }\n.hermes-config-multiselect label:hover { background: var(--ui-muted-1); }\n.hermes-config-multiselect input { width: 13px; height: 13px; margin: 0; accent-color: var(--ui-focus); }\n.hermes-config-multiselect small { padding: 6px; color: var(--ui-text-3); font-size: 8px; }\n.hermes-config-raw p { margin: 0; color: var(--ui-text-3); font-size: 8px; line-height: 1.45; }\n.hermes-config-raw textarea { width: 100%; min-height: 440px; resize: vertical; border: 1px solid #303030; border-radius: 6px; outline: 0; padding: 11px; background: #202124; color: #ececec; font: 9px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace; tab-size: 2; }\n.hermes-config-footer { display: grid; gap: 5px; padding: 8px 9px 7px; border-top: 1px solid var(--ui-divider); background: var(--ui-panel); }\n.hermes-config-actions { display: grid; grid-template-columns: 1fr 1.4fr; gap: 6px; }\n.hermes-config-actions button { min-height: 34px; border: 1px solid var(--ui-divider); border-radius: 6px; background: var(--ui-panel); color: var(--ui-text-1); cursor: pointer; font-size: 9px; font-weight: 700; }\n.hermes-config-actions button.is-primary { border-color: #111; background: #111; color: #fff; }\n.hermes-config-actions button:disabled { opacity: .45; cursor: not-allowed; }\n.hermes-config-status { min-width: 0; overflow: hidden; padding: 0 2px; color: var(--ui-text-3); font: 7px/1.4 ui-monospace, monospace; text-overflow: ellipsis; white-space: nowrap; }\n.hermes-config-empty { margin: 0; padding: 10px; color: var(--ui-text-3); font-size: 9px; }\n\n.layer-card, .chat-card { width: 100%; height: 100%; pointer-events: all; }\n.capability-card { width: 100%; height: 100%; display: grid; grid-template-rows: minmax(0, 1fr) 25px; border: 1px solid var(--ui-divider); border-radius: 7px; overflow: hidden; background: var(--ui-panel); box-shadow: none; }\n.capability-card.is-active { border-color: var(--ui-focus); box-shadow: inset 0 0 0 1px var(--ui-focus); }\n.capability-card.status-pass { border-left: 3px solid var(--ui-success); }\n.capability-card.status-warn { border-left: 3px solid var(--ui-warning); }\n.capability-card.status-fail { border-left: 3px solid var(--ui-danger); }\n.capability-card.status-not-run { border-left: 3px solid var(--ui-text-3); }\n.capability-card > button { width: 100%; min-width: 0; display: grid; grid-template-columns: 50px minmax(0, 1fr) 72px; align-items: center; gap: 10px; border: 0; padding: 9px 10px; background: transparent; cursor: pointer; text-align: left; }\n.capability-icon { display: grid; place-items: center; width: 42px; height: 42px; border-radius: 6px; background: var(--ui-muted-2); color: var(--ui-text-2); font: 750 9px/1 ui-monospace, monospace; }\n.capability-copy { min-width: 0; display: grid; gap: 3px; }\n.capability-copy small { color: var(--ui-text-3); font: 650 7px/1.25 ui-monospace, monospace; letter-spacing: .04em; text-transform: uppercase; }\n.capability-copy strong { font-size: 11px; font-weight: 650; }\n.capability-copy span { overflow: hidden; color: var(--ui-text-2); font-size: 8px; text-overflow: ellipsis; white-space: nowrap; }\n.capability-card .readiness-pill { justify-self: end; }\n.capability-card > footer { display: flex; align-items: center; overflow: hidden; padding: 0 10px; border-top: 1px solid var(--ui-divider); color: var(--ui-text-3); font-size: 7px; text-overflow: ellipsis; white-space: nowrap; }\n.layer-card { --node-accent: var(--ui-agent); border: 1px solid var(--ui-divider); border-radius: 7px; overflow: hidden; background: var(--ui-panel); box-shadow: none; }\n.layer-card.tier-stable { --node-accent: var(--ui-agent); }\n.layer-card.tier-context { --node-accent: var(--ui-stage); }\n.layer-card.tier-volatile { --node-accent: var(--ui-persona); }\n.layer-card.tier-api-overlay { --node-accent: var(--ui-overlay); }\n.layer-card.state-shadowed, .layer-card.state-missing { opacity: .58; }\n.layer-card.state-blocked { border-color: var(--ui-danger); }\n.layer-card-button { width: 100%; height: 100%; display: grid; grid-template-rows: 48px minmax(0, 1fr) 25px; border: 0; padding: 0; background: transparent; cursor: pointer; text-align: left; }\n.layer-card-header { display: grid; grid-template-columns: 34px minmax(0, 1fr) auto; align-items: center; gap: 9px; padding: 7px 10px; border-bottom: 1px solid var(--ui-divider); background: var(--ui-panel); }\n.layer-order { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 6px; background: var(--ui-muted-2); color: var(--node-accent); font: 750 9px/1 ui-monospace, monospace; }\n.layer-identity { min-width: 0; display: grid; gap: 2px; }\n.layer-identity strong { overflow: hidden; font-size: 12px; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }\n.state-pill { padding: 0; border-radius: 0; background: transparent; color: var(--ui-text-3); font: 750 7px/1 ui-monospace, monospace; letter-spacing: .04em; text-transform: uppercase; white-space: nowrap; }\n.state-pill.effective { background: transparent; color: var(--ui-success); }\n.state-pill.blocked { background: transparent; color: var(--ui-danger); }\n.layer-tier { overflow: hidden; color: var(--ui-text-3); font: 650 8px/1.2 ui-monospace, monospace; letter-spacing: .04em; text-overflow: ellipsis; text-transform: uppercase; white-space: nowrap; }\n.layer-reason { display: -webkit-box; overflow: hidden; padding: 7px 10px 5px; color: var(--ui-text-2); font-size: 9px; line-height: 1.3; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }\n.layer-card-footer { display: flex; align-items: center; justify-content: space-between; gap: 7px; min-width: 0; padding: 0 10px; border-top: 1px solid var(--ui-divider); color: var(--ui-text-3); font: 500 8px/1 ui-monospace, monospace; }\n.layer-card-footer span:first-child { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\n.layer-card-footer span:last-child { flex: 0 0 auto; color: var(--node-accent); }\n\n.chat-card { position: relative; display: grid; grid-template-rows: 48px minmax(0, 1fr) 25px; border: 1px solid var(--ui-divider); border-radius: 7px; overflow: hidden; background: var(--ui-panel); box-shadow: none; }\n.chat-card.is-active { border-color: var(--ui-focus); box-shadow: inset 0 0 0 1px var(--ui-focus); }\n.chat-card-select { position: absolute; inset: 0; z-index: 0; border: 0; background: transparent; cursor: pointer; }\n.chat-card header, .chat-card footer, .message-stack { position: relative; z-index: 1; pointer-events: none; }\n.chat-card header { display: grid; grid-template-columns: 34px minmax(0, 1fr) auto; align-items: center; gap: 9px; padding: 7px 10px; border-bottom: 1px solid var(--ui-divider); background: var(--ui-panel); }\n.chat-card-icon { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 6px; background: var(--ui-muted-2); color: var(--ui-focus); font: 750 16px/1 ui-monospace, monospace; }\n.chat-card header div { display: grid; gap: 4px; }\n.chat-card header strong { font-size: 12px; font-weight: 650; }\n.run-state { align-self: start; display: flex; align-items: center; gap: 5px; margin-top: 4px; padding: 0; border-radius: 0; background: transparent; color: var(--ui-text-3); font: 750 7px/1 ui-monospace, monospace; text-transform: uppercase; }\n.run-state.state-running { background: transparent; color: var(--ui-warning); }\n.run-state.state-complete { background: transparent; color: var(--ui-success); }\n.run-state.state-error { background: transparent; color: var(--ui-danger); }\n.spinner { width: 7px; height: 7px; border: 1px solid currentColor; border-right-color: transparent; border-radius: 50%; animation: spin .7s linear infinite; }\n@keyframes spin { to { transform: rotate(360deg); } }\n.message-stack { min-height: 0; overflow: hidden; padding: 8px 10px; background: var(--ui-panel); }\n.message-row { display: grid; grid-template-columns: 42px minmax(0, 1fr); gap: 7px; padding: 7px 0; border-bottom: 1px solid var(--ui-divider); }\n.message-row > span { padding-top: 2px; color: var(--ui-text-3); font: 750 7px/1 ui-monospace, monospace; }\n.message-row.role-assistant > span { color: var(--ui-focus); }\n.message-row p { display: -webkit-box; overflow: hidden; margin: 0; color: var(--ui-text-2); font-size: 9px; line-height: 1.4; white-space: pre-wrap; -webkit-box-orient: vertical; -webkit-line-clamp: 3; }\n.empty-message { display: grid; place-items: center; height: 100%; padding: 20px; color: var(--ui-text-3); text-align: center; font-size: 9px; line-height: 1.5; }\n.branch-error { margin-top: 7px; padding: 7px; border-left: 2px solid var(--ui-danger); background: var(--ui-muted-1); color: var(--ui-danger); font-size: 8px; }\n.chat-card footer { display: flex; justify-content: space-between; align-items: center; padding: 0 10px; border-top: 1px solid var(--ui-divider); color: var(--ui-text-3); font-size: 8px; }\n.chat-card footer code { font-size: 8px; }\n\n.trace-summary { display: flex; align-items: baseline; gap: 8px; padding: 9px; border: 1px solid var(--ui-divider); border-radius: 7px; background: var(--ui-muted-1); }\n.trace-summary strong { color: var(--ui-focus); font-size: 20px; }\n.trace-summary span { color: var(--ui-text-3); font-size: 8px; }\n.trace-event { margin-top: 7px; border: 1px solid var(--ui-divider); border-radius: 7px; background: var(--ui-panel); overflow: hidden; }\n.trace-event summary { display: flex; align-items: center; gap: 7px; padding: 8px; cursor: pointer; color: var(--ui-text-2); font: 700 8px/1 ui-monospace, monospace; }\n.event-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--ui-text-3); }\n.event-dot.tool-start, .event-dot.tool-progress { background: var(--ui-warning); }\n.event-dot.tool-complete, .event-dot.run-complete { background: var(--ui-success); }\n.event-dot.run-error { background: var(--ui-danger); }\n.trace-event pre { max-height: 230px; overflow: auto; margin: 0; padding: 9px; border-top: 1px solid var(--ui-divider); background: #202124; color: #ececec; font: 8px/1.45 ui-monospace, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }\n\n.modal-backdrop { position: fixed; z-index: 100; inset: 0; display: grid; place-items: center; padding: 28px; background: rgba(23,23,23,.34); backdrop-filter: blur(3px); }\n.editor-modal, .prompt-modal { width: min(980px, calc(100vw - 56px)); height: min(780px, calc(100vh - 56px)); display: flex; flex-direction: column; border-radius: 10px; overflow: hidden; }\n.editor-modal > header, .prompt-modal > header { display: flex; justify-content: space-between; gap: 20px; padding: 13px 15px 11px; border-bottom: 1px solid var(--ui-divider); }\n.editor-modal h2, .prompt-modal h2 { margin: 4px 0; font-size: 16px; font-weight: 650; }\n.editor-modal header code { color: var(--ui-text-3); font-size: 9px; }\n.prompt-modal header p { margin: 4px 0 0; color: var(--ui-text-3); font-size: 9px; }\n.prompt-modal > .prompt-budget { flex: 0 0 auto; margin: 10px 15px 0; }\n.icon-button { width: 30px; height: 30px; border: 1px solid var(--ui-divider); border-radius: 6px; background: var(--ui-panel); cursor: pointer; font-size: 18px; }\n.source-status { display: flex; align-items: center; gap: 10px; padding: 8px 15px; border-bottom: 1px solid var(--ui-divider); background: var(--ui-muted-1); }\n.source-status p { margin: 0; color: var(--ui-text-2); font-size: 9px; }\n.editor-modal > textarea { flex: 1; min-height: 0; resize: none; border: 0; outline: 0; padding: 18px; background: #202124; color: #ececec; font: 11px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace; tab-size: 2; }\n.editor-modal > footer, .prompt-modal > footer { min-height: 52px; display: flex; align-items: center; justify-content: space-between; gap: 15px; padding: 8px 12px; border-top: 1px solid var(--ui-divider); color: var(--ui-text-3); font-size: 9px; }\n.editor-modal footer div { display: flex; gap: 8px; }\n.modal-error { padding: 8px 16px; background: #faeded; color: var(--ui-danger); font-size: 9px; }\n.prompt-tabs { display: flex; padding: 0 15px; border-bottom: 1px solid var(--ui-divider); background: var(--ui-muted-1); }\n.prompt-tabs button { min-width: 100px; }\n.prompt-body { flex: 1; min-height: 0; display: grid; grid-template-columns: 210px minmax(0, 1fr); }\n.prompt-body aside { overflow: auto; padding: 10px; border-right: 1px solid var(--ui-divider); background: var(--ui-background); }\n.prompt-body aside div { display: grid; grid-template-columns: 24px minmax(0, 1fr); gap: 2px 7px; padding: 8px; border-radius: 6px; opacity: .55; }\n.prompt-body aside div.included { opacity: 1; background: var(--ui-muted-2); }\n.prompt-body aside span { grid-row: 1 / 3; color: var(--ui-text-3); font: 700 8px/1.4 ui-monospace, monospace; }\n.prompt-body aside strong { overflow: hidden; font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }\n.prompt-body aside small { color: var(--ui-text-3); font: 7px/1 ui-monospace, monospace; text-transform: uppercase; }\n.prompt-body > pre { overflow: auto; margin: 0; padding: 18px; background: #202124; color: #ececec; font: 10px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }\n\n@media (max-width: 1050px) {\n  .config-panel { width: 320px; }\n  .topbar { right: 352px; }\n  .composer { right: 446px; }\n  .canvas-wrap { right: 336px; }\n  .topbar .secondary-button { display: none; }\n  .brand-copy { display: none; }\n}\n';

// client/hermes-config.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { stopEventPropagation } from "tldraw";
import { jsx, jsxs } from "react/jsx-runtime";
var CONFIG_SAVED_EVENT = "hermes-profile-canvas:config-saved";
var MODEL_ROUTING_IDS = /* @__PURE__ */ new Set(["model.default", "model.provider", "model.base_url"]);
var choices = (...values) => values.map((value) => ({ value, label: value }));
var BUILT_IN_PERSONALITIES = choices("helpful", "concise", "technical", "creative", "teacher", "kawaii", "catgirl", "pirate", "shakespeare", "surfer", "noir", "uwu", "philosopher", "hype");
var HERMES_TOOLSETS = choices(
  "hermes-cli",
  "hermes-acp",
  "hermes-api-server",
  "safe",
  "coding",
  "debugging",
  "browser",
  "clarify",
  "code_execution",
  "computer_use",
  "cronjob",
  "delegation",
  "file",
  "homeassistant",
  "image_gen",
  "memory",
  "search",
  "session_search",
  "skills",
  "terminal",
  "todo",
  "tts",
  "video",
  "video_gen",
  "vision",
  "web",
  "x_search"
);
var CONFIG_CATEGORIES = [
  {
    id: "routing",
    label: "Model, provider & agent loop",
    controls: [
      {
        id: "model.default",
        path: ["model", "default"],
        label: "Default model",
        type: "select",
        defaultValue: "",
        description: "Default model for fresh sessions. /model can override only the active session.",
        applies: "NEW SESSION"
      },
      {
        id: "model.provider",
        path: ["model", "provider"],
        label: "Provider",
        type: "select",
        defaultValue: "",
        description: "Provider route paired with the model. Credentials remain in the private profile .env.",
        applies: "NEW SESSION"
      },
      {
        id: "model.base_url",
        path: ["model", "base_url"],
        label: "OpenAI-compatible base URL",
        type: "text",
        defaultValue: "",
        description: "Optional endpoint override. Model discovery probes /v1/models without exposing its API key.",
        applies: "NEW SESSION",
        placeholder: "https://api.example.com/v1 or http://127.0.0.1:1234/v1"
      },
      {
        id: "model.context_length",
        path: ["model", "context_length"],
        label: "Context window",
        type: "number",
        defaultValue: 131072,
        min: 1024,
        max: 1e7,
        description: "Input context capacity used by prompt budgeting and compression thresholds.",
        applies: "NEXT MESSAGE"
      },
      {
        id: "model.max_tokens",
        path: ["model", "max_tokens"],
        label: "Max output tokens",
        type: "number",
        defaultValue: 8192,
        min: 1,
        max: 1e6,
        description: "Output limit only; this is not the model context window.",
        applies: "NEW SESSION"
      },
      {
        id: "agent.max_turns",
        path: ["agent", "max_turns"],
        label: "Max turns",
        type: "number",
        defaultValue: 500,
        min: 1,
        max: 5e3,
        description: "Maximum agent loop iterations before Hermes stops the run."
      },
      {
        id: "agent.api_max_retries",
        path: ["agent", "api_max_retries"],
        label: "API retries",
        type: "number",
        defaultValue: 3,
        min: 1,
        max: 20,
        description: "Hermes-level attempts before provider fallback or visible failure."
      },
      {
        id: "agent.tool_use_enforcement",
        path: ["agent", "tool_use_enforcement"],
        label: "Tool-use enforcement",
        type: "select",
        defaultValue: "auto",
        description: "Prompt guidance that tells matching models to execute tools rather than narrate actions.",
        applies: "NEW SESSION",
        options: choices("auto", "true", "false")
      },
      {
        id: "agent.coding_context",
        path: ["agent", "coding_context"],
        label: "Coding context",
        type: "select",
        defaultValue: "auto",
        description: "Hermes coding posture: automatic, focused toolset, forced on, or disabled.",
        options: choices("auto", "focus", "on", "off")
      },
      {
        id: "agent.environment_probe",
        path: ["agent", "environment_probe"],
        label: "Environment probe",
        type: "checkbox",
        defaultValue: true,
        description: "Add actionable runtime/toolchain hints when the selected environment is non-standard.",
        applies: "NEW SESSION"
      }
    ]
  },
  {
    id: "personality",
    label: "Personality & context files",
    controls: [
      {
        id: "display.personality",
        path: ["display", "personality"],
        label: "Active personality",
        type: "select",
        defaultValue: "",
        description: "Named built-in or agent.personalities entry. A selected personality shadows agent.system_prompt.",
        applies: "NEW SESSION",
        options: [{ value: "", label: "None \xB7 SOUL.md base personality" }, ...BUILT_IN_PERSONALITIES]
      },
      {
        id: "agent.system_prompt",
        path: ["agent", "system_prompt"],
        label: "Manual personality prompt",
        type: "textarea",
        defaultValue: "",
        description: "Used when no named personality is active. SOUL.md remains the profile identity slot.",
        applies: "NEW SESSION",
        placeholder: "Additional personality instructions used when no named personality is selected\u2026"
      },
      {
        id: "agent.environment_hint",
        path: ["agent", "environment_hint"],
        label: "Environment hint",
        type: "textarea",
        defaultValue: "",
        description: "Stable prompt guidance for a managed runtime. HERMES_ENVIRONMENT_HINT can override it.",
        applies: "NEW SESSION",
        placeholder: "Describe proxying, mounts, credential handling, or sandbox constraints\u2026"
      },
      {
        id: "status.personality",
        label: "Resolved personality",
        type: "status",
        defaultValue: "",
        description: "Static profile resolution; Inspect shows the exact effective prompt text.",
        status: (profile) => profile.extensions.personality || "SOUL.md / default identity"
      }
    ]
  },
  {
    id: "compression",
    label: "Context compression & caching",
    controls: [
      {
        id: "compression.enabled",
        path: ["compression", "enabled"],
        label: "Compression",
        type: "checkbox",
        defaultValue: true,
        description: "Allow Hermes to compact history before the model context is exhausted.",
        applies: "NEXT MESSAGE"
      },
      {
        id: "compression.threshold",
        path: ["compression", "threshold"],
        label: "Trigger ratio",
        type: "number",
        defaultValue: 0.5,
        min: 0.05,
        max: 1,
        description: "Compression starts near threshold \xD7 context window.",
        applies: "NEXT MESSAGE"
      },
      {
        id: "compression.target_ratio",
        path: ["compression", "target_ratio"],
        label: "Tail target ratio",
        type: "number",
        defaultValue: 0.2,
        min: 0.01,
        max: 1,
        description: "Recent-tail budget relative to the compression trigger.",
        applies: "NEXT MESSAGE"
      },
      {
        id: "compression.protect_last_n",
        path: ["compression", "protect_last_n"],
        label: "Protected messages",
        type: "number",
        defaultValue: 20,
        min: 1,
        max: 1e3,
        description: "Recent messages protected from normal compaction.",
        applies: "NEXT MESSAGE"
      },
      {
        id: "compression.in_place",
        path: ["compression", "in_place"],
        label: "In-place compression",
        type: "checkbox",
        defaultValue: true,
        description: "Keep one session ID and soft-archive compacted rows instead of rotating sessions.",
        applies: "NEXT MESSAGE"
      },
      {
        id: "compression.proactive_prune_tokens",
        path: ["compression", "proactive_prune_tokens"],
        label: "Proactive prune target",
        type: "number",
        defaultValue: 0,
        min: 0,
        max: 1e6,
        description: "Optional token target for pruning oversized tool results before full compression.",
        applies: "NEXT MESSAGE"
      },
      {
        id: "prompt_caching.cache_ttl",
        path: ["prompt_caching", "cache_ttl"],
        label: "Prompt cache TTL",
        type: "select",
        defaultValue: "5m",
        description: "Provider prompt-prefix cache lifetime where supported.",
        applies: "NEW SESSION",
        options: choices("5m", "1h")
      }
    ]
  },
  {
    id: "memory",
    label: "Prompt & memory",
    controls: [
      {
        id: "memory.memory_enabled",
        path: ["memory", "memory_enabled"],
        label: "MEMORY.md injection",
        type: "checkbox",
        defaultValue: true,
        description: "Inject curated long-term memory into the system prompt."
      },
      {
        id: "memory.user_profile_enabled",
        path: ["memory", "user_profile_enabled"],
        label: "USER.md injection",
        type: "checkbox",
        defaultValue: true,
        description: "Inject the curated user profile into the system prompt."
      },
      {
        id: "memory.write_approval",
        path: ["memory", "write_approval"],
        label: "Approve memory writes",
        type: "checkbox",
        defaultValue: false,
        description: "Require approval before foreground memory writes and stage background writes."
      },
      {
        id: "memory.provider",
        path: ["memory", "provider"],
        label: "External provider",
        type: "select",
        defaultValue: "",
        description: "Optional single provider such as honcho, hindsight, mem0, openviking, holographic, retaindb, byterover, or supermemory.",
        applies: "NEW SESSION",
        options: [
          { value: "", label: "Built-in MEMORY.md / USER.md only" },
          ...choices("honcho", "hindsight", "mem0", "openviking", "holographic", "retaindb", "byterover", "supermemory")
        ]
      },
      {
        id: "status.memory-provider",
        label: "Provider discovery",
        type: "status",
        defaultValue: "",
        description: "Provider must be discovered, initialized, and separately credentialed before recall is effective.",
        status: (profile) => profile.extensions.memoryProvider ? `${profile.extensions.memoryProvider} selected \xB7 Inspect required` : "built-in only"
      }
    ]
  },
  {
    id: "tools",
    label: "Tools, toolsets & approvals",
    controls: [
      {
        id: "toolsets",
        path: ["toolsets"],
        label: "Enabled toolsets",
        type: "multiselect",
        defaultValue: ["hermes-cli"],
        description: "Root Hermes toolset list. Inspect resolves composites, requirements, plugin tools, and schemas.",
        applies: "NEW SESSION",
        options: HERMES_TOOLSETS
      },
      {
        id: "agent.disabled_toolsets",
        path: ["agent", "disabled_toolsets"],
        label: "Disabled toolsets",
        type: "multiselect",
        defaultValue: [],
        description: "Subtracted after enabled/composite toolsets resolve.",
        applies: "NEW SESSION",
        options: HERMES_TOOLSETS
      },
      {
        id: "approvals.mode",
        path: ["approvals", "mode"],
        label: "Approval mode",
        type: "select",
        defaultValue: "smart",
        description: "Manual prompts, smart guardian review, or off (equivalent to yolo).",
        options: choices("manual", "smart", "off")
      },
      {
        id: "approvals.timeout",
        path: ["approvals", "timeout"],
        label: "Approval timeout",
        type: "number",
        defaultValue: 300,
        min: 1,
        max: 86400,
        description: "Seconds to wait for a human approval before failing closed."
      },
      {
        id: "tools.tool_search.enabled",
        path: ["tools", "tool_search", "enabled"],
        label: "Progressive Tool Search",
        type: "select",
        defaultValue: "auto",
        description: "Defer MCP and non-core plugin schemas behind search/describe/call bridge tools.",
        applies: "SCHEMA REBUILD",
        options: choices("auto", "on", "off")
      },
      {
        id: "tools.tool_search.threshold_pct",
        path: ["tools", "tool_search", "threshold_pct"],
        label: "Catalog budget %",
        type: "number",
        defaultValue: 5,
        min: 0,
        max: 100,
        description: "Listing budget as a percentage of the active model context window.",
        applies: "SCHEMA REBUILD"
      },
      {
        id: "tools.tool_search.listing_max_tokens",
        path: ["tools", "tool_search", "listing_max_tokens"],
        label: "Catalog token cap",
        type: "number",
        defaultValue: 4e3,
        min: 200,
        max: 6e4,
        description: "Absolute catalog listing cap before names-only or per-server degradation.",
        applies: "SCHEMA REBUILD"
      },
      {
        id: "tools.tool_search.search_default_limit",
        path: ["tools", "tool_search", "search_default_limit"],
        label: "Default search hits",
        type: "number",
        defaultValue: 5,
        min: 1,
        max: 50,
        description: "Default result count returned by tool_search.",
        applies: "SCHEMA REBUILD"
      },
      {
        id: "status.toolsets",
        label: "Static toolset declaration",
        type: "status",
        defaultValue: "",
        description: "Inspect builds the actual availability-filtered schema and reports token cost per toolset.",
        status: (profile) => `${profile.extensions.configuredToolsets?.length ?? 0} declared \xB7 runtime Inspect required`
      }
    ]
  },
  {
    id: "skills",
    label: "Skills & agent-managed skills",
    controls: [
      {
        id: "skills.write_approval",
        path: ["skills", "write_approval"],
        label: "Approve skill writes",
        type: "checkbox",
        defaultValue: false,
        description: "Stage skill_manage create/edit/patch/delete/write_file/remove_file actions for approval."
      },
      {
        id: "skills.guard_agent_created",
        path: ["skills", "guard_agent_created"],
        label: "Scan agent-created skills",
        type: "checkbox",
        defaultValue: false,
        description: "Defense-in-depth content scan with rollback for agent-created skill mutations."
      },
      {
        id: "skills.external_dirs",
        path: ["skills", "external_dirs"],
        label: "External skill roots",
        type: "list",
        defaultValue: [],
        description: "Additional skill directories. Existing external skills may be mutable if filesystem permissions allow.",
        applies: "RELOAD SKILLS",
        placeholder: "/opt/team-skills, ~/work/shared-skills"
      },
      {
        id: "skills.template_vars",
        path: ["skills", "template_vars"],
        label: "Template variables",
        type: "checkbox",
        defaultValue: true,
        description: "Expand HERMES_SKILL_DIR and HERMES_SESSION_ID in loaded skill content."
      },
      {
        id: "skills.inline_shell",
        path: ["skills", "inline_shell"],
        label: "Inline shell snippets",
        type: "checkbox",
        defaultValue: false,
        description: "Allow opt-in !`command` preprocessing inside skills. Keep disabled for untrusted repositories."
      },
      {
        id: "skills.inline_shell_timeout",
        path: ["skills", "inline_shell_timeout"],
        label: "Inline shell timeout",
        type: "number",
        defaultValue: 10,
        min: 1,
        max: 300,
        description: "Seconds allowed per inline shell snippet."
      },
      {
        id: "status.skills",
        label: "Discovered skill packages",
        type: "status",
        defaultValue: "",
        description: "Index metadata is always-on; full SKILL.md and support files load progressively.",
        status: (profile) => `${profile.extensions.skills.length} discovered \xB7 skill_manage tested at runtime`
      }
    ]
  },
  {
    id: "extensions",
    label: "Plugins, MCP, hooks & messaging",
    controls: [
      {
        id: "plugins.enabled",
        path: ["plugins", "enabled"],
        label: "Enabled plugins",
        type: "multiselect",
        defaultValue: [],
        description: "Opt-in standalone/user plugins. Bundled platform/backend providers follow their own selectors.",
        applies: "FRESH PROCESS"
      },
      {
        id: "plugins.disabled",
        path: ["plugins", "disabled"],
        label: "Disabled plugins",
        type: "multiselect",
        defaultValue: [],
        description: "Explicit deny list; disabled wins when a plugin appears in both lists.",
        applies: "FRESH PROCESS"
      },
      {
        id: "mcp.auto_reload_on_config_change",
        path: ["mcp", "auto_reload_on_config_change"],
        label: "Auto-reload MCP config",
        type: "checkbox",
        defaultValue: true,
        description: "Reconnect and rebuild MCP tools when watched config changes; schema changes invalidate prompt cache.",
        applies: "MCP RELOAD"
      },
      {
        id: "approvals.mcp_reload_confirm",
        path: ["approvals", "mcp_reload_confirm"],
        label: "Confirm MCP cache reset",
        type: "checkbox",
        defaultValue: true,
        description: "Warn before the next full-input resend after MCP schemas change."
      },
      {
        id: "status.plugins",
        label: "Plugins",
        type: "status",
        defaultValue: "",
        description: "Native Python and Portable Agent Plugin manifests discovered in the repository.",
        status: (profile) => `${profile.extensions.plugins.length} native \xB7 ${profile.extensions.portablePlugins?.length ?? 0} portable`
      },
      {
        id: "status.mcp",
        label: "MCP",
        type: "status",
        defaultValue: "",
        description: "External MCP servers surfaced by this profile fixture.",
        status: (profile) => profile.extensions.mcpConfigured ? `${profile.extensions.mcpServers?.length ?? 1} configured \xB7 connection test required` : "not configured"
      },
      {
        id: "status.hooks",
        label: "Hooks & middleware",
        type: "status",
        defaultValue: "",
        description: "Hermes lifecycle hooks and request/tool middleware declared by the profile.",
        status: (profile) => `${profile.extensions.hooksConfigured ? "hooks" : "no hooks"} \xB7 ${profile.extensions.middlewareConfigured ? "middleware" : "no middleware"}`
      },
      {
        id: "status.messaging",
        label: "Messaging",
        type: "status",
        defaultValue: "",
        description: "Gateway/channel configuration discovery; live delivery still needs a scenario run.",
        status: (profile) => profile.extensions.messagingConfigured ? "configured \xB7 test required" : "not configured"
      }
    ]
  },
  {
    id: "documents",
    label: "Document extraction & privacy",
    controls: [
      {
        id: "security.allow_lazy_installs",
        path: ["security", "allow_lazy_installs"],
        label: "Lazy converter installs",
        type: "checkbox",
        defaultValue: true,
        description: "Permit firecrawl-anydoc installation for PDF, legacy Office, OpenDocument, RTF, and EPUB extraction."
      },
      {
        id: "security.redact_secrets",
        path: ["security", "redact_secrets"],
        label: "Redact tool-output secrets",
        type: "checkbox",
        defaultValue: false,
        description: "Mask likely secrets before tool output reaches context and logs. Requires restart.",
        applies: "RESTART"
      },
      {
        id: "privacy.redact_pii",
        path: ["privacy", "redact_pii"],
        label: "Redact gateway PII",
        type: "checkbox",
        defaultValue: false,
        description: "Hash user IDs and strip phone numbers from gateway session context.",
        applies: "GATEWAY RESTART"
      },
      {
        id: "status.documents",
        label: "Extractor surface",
        type: "status",
        defaultValue: "",
        description: "DOCX, XLSX, and IPYNB are built in; optional formats require the lazy converter. Input cap is 50 MiB.",
        status: (profile) => profile.extensions.documentExtraction?.lazyInstalls ? "3 built-in \xB7 optional formats enabled" : "3 built-in \xB7 optional formats disabled"
      },
      {
        id: "status.env",
        label: "Secret requirements",
        type: "status",
        defaultValue: "",
        description: "Only variable names are shown. Values remain in the private .env and never enter the archive.",
        status: (profile) => `${profile.extensions.envRequirements?.length ?? 0} declared names \xB7 values excluded`
      }
    ]
  },
  {
    id: "terminal",
    label: "Terminal, sandbox & SSH backend",
    controls: [
      {
        id: "terminal.backend",
        path: ["terminal", "backend"],
        label: "Backend",
        type: "select",
        defaultValue: "local",
        description: "Where terminal, file, and code-execution tools run.",
        options: ["local", "docker", "singularity", "modal", "daytona", "vercel_sandbox", "ssh"].map((value) => ({ value, label: value }))
      },
      {
        id: "terminal.cwd",
        path: ["terminal", "cwd"],
        label: "Working directory",
        type: "text",
        defaultValue: ".",
        description: "Initial working directory as seen by the selected backend.",
        placeholder: "/workspace or ."
      },
      {
        id: "terminal.degraded_mode",
        path: ["terminal", "degraded_mode"],
        label: "Connection failures",
        type: "select",
        defaultValue: "warn",
        description: "Return a recoverable warning or fail the tool call when remote infrastructure is unavailable.",
        options: choices("warn", "fail")
      },
      {
        id: "terminal.home_mode",
        path: ["terminal", "home_mode"],
        label: "Subprocess HOME",
        type: "select",
        defaultValue: "auto",
        description: "auto, real OS home, or profile-isolated home. A profile alone is not a filesystem sandbox.",
        applies: "NEW ENVIRONMENT",
        options: choices("auto", "real", "profile")
      },
      {
        id: "terminal.timeout",
        path: ["terminal", "timeout"],
        label: "Command timeout",
        type: "number",
        defaultValue: 180,
        min: 1,
        max: 86400,
        description: "Default foreground command timeout in seconds."
      },
      {
        id: "terminal.persistent_shell",
        path: ["terminal", "persistent_shell"],
        label: "Persistent shell",
        type: "checkbox",
        defaultValue: true,
        description: "Preserve shell cwd and environment across terminal calls where the backend supports it.",
        applies: "NEW ENVIRONMENT"
      },
      {
        id: "terminal.ssh_host",
        path: ["terminal", "ssh_host"],
        label: "SSH host",
        type: "text",
        defaultValue: "",
        description: "Host name or address of an existing remote machine, including an exe.dev VM.",
        placeholder: "your-vm.exe.xyz or 203.0.113.10"
      },
      {
        id: "terminal.ssh_user",
        path: ["terminal", "ssh_user"],
        label: "SSH user",
        type: "text",
        defaultValue: "",
        description: "Remote account used by the Hermes SSH environment backend.",
        placeholder: "ubuntu"
      },
      {
        id: "terminal.ssh_port",
        path: ["terminal", "ssh_port"],
        label: "SSH port",
        type: "number",
        defaultValue: 22,
        min: 1,
        max: 65535,
        description: "Remote SSH daemon port."
      },
      {
        id: "terminal.ssh_key",
        path: ["terminal", "ssh_key"],
        label: "SSH key path",
        type: "text",
        defaultValue: "",
        description: "Path to a private key on the runtime host. Never paste private-key contents into config.yaml.",
        placeholder: "~/.ssh/id_ed25519"
      },
      {
        id: "terminal.container_cpu",
        path: ["terminal", "container_cpu"],
        label: "Container CPUs",
        type: "number",
        defaultValue: 1,
        min: 1,
        max: 128,
        description: "Shared resource setting for supported container and sandbox backends.",
        applies: "NEW ENVIRONMENT"
      },
      {
        id: "terminal.container_memory",
        path: ["terminal", "container_memory"],
        label: "Container memory MiB",
        type: "number",
        defaultValue: 5120,
        min: 128,
        max: 1048576,
        description: "Memory allocation for supported container and sandbox backends.",
        applies: "NEW ENVIRONMENT"
      },
      {
        id: "terminal.container_persistent",
        path: ["terminal", "container_persistent"],
        label: "Persistent filesystem",
        type: "checkbox",
        defaultValue: true,
        description: "Persist backend filesystem state where supported; live processes are not guaranteed to survive.",
        applies: "NEW ENVIRONMENT"
      }
    ]
  }
];
function stripYamlComment(value) {
  let quote = "";
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quote === '"' && character === "\\") {
      index += 1;
      continue;
    }
    if (character === '"' || character === "'") quote = quote === character ? "" : quote || character;
    if (character === "#" && !quote && (index === 0 || /\s/.test(value[index - 1]))) return value.slice(0, index).trimEnd();
  }
  return value.trimEnd();
}
function parseYamlScalar(raw) {
  const value = stripYamlComment(raw).trim();
  if (!value) return "";
  if (value.startsWith("[") && value.endsWith("]")) {
    return value.slice(1, -1).split(",").map((item) => String(parseYamlScalar(item)).trim()).filter(Boolean);
  }
  if (value.startsWith('"')) {
    try {
      return JSON.parse(value);
    } catch {
      return value.slice(1, value.lastIndexOf('"'));
    }
  }
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1).replaceAll("''", "'");
  if (/^(true|false)$/i.test(value)) return value.toLowerCase() === "true";
  if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(value)) return Number(value);
  return value;
}
function yamlKeyPattern(key, indent) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${" ".repeat(indent)}${escaped}:\\s*(.*)$`);
}
function yamlNode(lines, path) {
  let searchStart = 0;
  let searchEnd = lines.length;
  for (let depth = 0; depth < path.length; depth += 1) {
    const indent = depth * 2;
    const pattern = yamlKeyPattern(path[depth], indent);
    let start = -1;
    let inline = "";
    for (let index = searchStart; index < searchEnd; index += 1) {
      const match = pattern.exec(lines[index]);
      if (!match) continue;
      start = index;
      inline = stripYamlComment(match[1]).trim();
      break;
    }
    if (start < 0) return null;
    let end = searchEnd;
    for (let index = start + 1; index < searchEnd; index += 1) {
      const match = /^(\s*)(?:[A-Za-z0-9_.-]+:|-\s)/.exec(lines[index]);
      if (match && match[1].length <= indent) {
        end = index;
        break;
      }
    }
    if (depth === path.length - 1) return { start, end, indent, inline };
    if (inline) return { start, end, indent, inline, blockedAt: depth };
    searchStart = start + 1;
    searchEnd = end;
  }
  return null;
}
function readYamlValue(content, path, fallback) {
  const lines = content.split("\n");
  const node = yamlNode(lines, path);
  if (node && node.blockedAt == null) {
    if (node.inline) return { value: parseYamlScalar(node.inline), present: true };
    const itemPattern = new RegExp(`^${" ".repeat(node.indent + 2)}-\\s*(.*)$`);
    const items = [];
    for (let index = node.start + 1; index < node.end; index += 1) {
      const item = itemPattern.exec(lines[index]);
      if (item) items.push(String(parseYamlScalar(item[1])));
    }
    return { value: items, present: true };
  }
  if (path.length === 2 && path[0] === "model" && path[1] === "default") {
    const root = yamlNode(lines, ["model"]);
    if (root?.inline) return { value: parseYamlScalar(root.inline), present: true };
  }
  return { value: fallback, present: false };
}
function yamlValue(value) {
  if (Array.isArray(value)) return `[${value.map((item) => JSON.stringify(item)).join(", ")}]`;
  if (typeof value === "string") return JSON.stringify(value);
  return String(value);
}
function writeYamlValue(content, path, value) {
  const hadTrailingNewline = content.endsWith("\n");
  const lines = content.split("\n");
  if (hadTrailingNewline) lines.pop();
  if (path.length === 2 && path[0] === "model") {
    const root = yamlNode(lines, ["model"]);
    if (root?.inline) {
      if (path[1] === "default") lines.splice(root.start, root.end - root.start, `model: ${yamlValue(value)}`);
      else lines.splice(root.start, root.end - root.start, "model:", `  default: ${yamlValue(parseYamlScalar(root.inline))}`, `  ${path[1]}: ${yamlValue(value)}`);
      return `${lines.join("\n")}${hadTrailingNewline ? "\n" : ""}`;
    }
  }
  for (let depth = 0; depth < path.length - 1; depth += 1) {
    const prefix = path.slice(0, depth + 1);
    const existing = yamlNode(lines, prefix);
    if (existing && existing.blockedAt == null && !existing.inline) continue;
    if (existing?.inline) {
      const legacy = parseYamlScalar(existing.inline);
      lines.splice(existing.start, existing.end - existing.start, `${" ".repeat(existing.indent)}${path[depth]}:`);
      if (path[depth] === "tool_search" && typeof legacy === "boolean") {
        lines.splice(existing.start + 1, 0, `${" ".repeat(existing.indent + 2)}enabled: ${legacy ? "auto" : "off"}`);
      }
      continue;
    }
    if (depth === 0) {
      if (lines.length && lines.at(-1)?.trim()) lines.push("");
      lines.push(`${path[0]}:`);
      continue;
    }
    const parent = yamlNode(lines, path.slice(0, depth));
    if (!parent) throw new Error(`Cannot create YAML path ${path.join(".")}.`);
    if (parent.inline) lines.splice(parent.start, 1, `${" ".repeat(parent.indent)}${path[depth - 1]}:`);
    const refreshedParent = yamlNode(lines, path.slice(0, depth));
    if (!refreshedParent) throw new Error(`Cannot create YAML path ${path.join(".")}.`);
    lines.splice(refreshedParent.end, 0, `${" ".repeat(depth * 2)}${path[depth]}:`);
  }
  const target = yamlNode(lines, path);
  const rendered = `${" ".repeat((path.length - 1) * 2)}${path.at(-1)}: ${yamlValue(value)}`;
  if (target && target.blockedAt == null) lines.splice(target.start, target.end - target.start, rendered);
  else if (path.length === 1) {
    if (lines.length && lines.at(-1)?.trim()) lines.push("");
    lines.push(rendered);
  } else {
    const parent = yamlNode(lines, path.slice(0, -1));
    if (!parent) throw new Error(`Cannot create YAML path ${path.join(".")}.`);
    lines.splice(parent.end, 0, rendered);
  }
  return `${lines.join("\n")}${hadTrailingNewline ? "\n" : ""}`;
}
function editableControls() {
  return CONFIG_CATEGORIES.flatMap((category) => category.controls).filter((control) => control.path);
}
function valuesFromContent(content) {
  return Object.fromEntries(editableControls().map((control) => {
    const { value } = readYamlValue(content, control.path, control.defaultValue);
    return [control.id, control.type === "list" && Array.isArray(value) ? value.join(", ") : value];
  }));
}
async function profileFetch(apiBase, path, init) {
  const response = await fetch(`${apiBase}${path}`, init);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message ?? `Request failed (${response.status})`);
  return payload;
}
var INITIAL_PROVIDERS = [
  { id: "openrouter", label: "OpenRouter", description: "OpenRouter model aggregator", authType: "api_key", credentialEnvVars: ["OPENROUTER_API_KEY"], credentialConfigured: false, defaultBaseUrl: "https://openrouter.ai/api/v1" },
  { id: "openai-api", label: "OpenAI API", description: "OpenAI API", authType: "api_key", credentialEnvVars: ["OPENAI_API_KEY"], credentialConfigured: false, defaultBaseUrl: "https://api.openai.com/v1" },
  { id: "custom", label: "Custom OpenAI-compatible endpoint", description: "Self-hosted or third-party endpoint", authType: "host_gated", credentialEnvVars: [], credentialConfigured: false, defaultBaseUrl: "" }
];
function useHermesModelCatalog(apiBase, provider, baseUrl = "") {
  const [catalog, setCatalog] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const result = await profileFetch(apiBase, "/api/models", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ provider, baseUrl }),
          signal: controller.signal
        });
        setCatalog(result);
      } catch (reason) {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 350);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [apiBase, baseUrl, provider, refreshKey]);
  return { catalog, loading, error, refresh: () => setRefreshKey((current) => current + 1) };
}
function HermesModelRoutingFields({
  apiBase = "",
  provider,
  model,
  baseUrl = "",
  includeBaseUrl = false,
  onProviderChange,
  onModelChange,
  onBaseUrlChange
}) {
  const { catalog, loading, error, refresh } = useHermesModelCatalog(apiBase, provider, baseUrl);
  const [manual, setManual] = useState(false);
  const providers = useMemo(() => {
    const available = catalog?.providers?.length ? catalog.providers : INITIAL_PROVIDERS;
    if (!provider || available.some((candidate) => candidate.id === provider)) return available;
    return [{ id: provider, label: `${provider} (current profile value)`, description: "", authType: "unknown", credentialEnvVars: [], credentialConfigured: false, defaultBaseUrl: "" }, ...available];
  }, [catalog, provider]);
  const selectedProvider = providers.find((candidate) => candidate.id === (provider || catalog?.provider));
  const models = useMemo(() => {
    const values = [...catalog?.models ?? []];
    if (model && !values.includes(model)) values.unshift(model);
    return values;
  }, [catalog, model]);
  const credentialVars = catalog?.credential.envVars ?? selectedProvider?.credentialEnvVars ?? [];
  const credentialConfigured = catalog?.credential.configured ?? selectedProvider?.credentialConfigured ?? false;
  const credentialLocation = catalog?.credential.location ?? "~/.hermes/.env";
  const credentialReason = catalog?.credential.reason ?? "";
  const endpointPlaceholder = selectedProvider?.defaultBaseUrl || "https://api.example.com/v1 or http://127.0.0.1:1234/v1";
  const changeProvider = (value) => {
    setManual(false);
    onProviderChange(value);
    if (value !== provider && onBaseUrlChange) onBaseUrlChange("");
  };
  return /* @__PURE__ */ jsxs("div", { className: "hermes-model-routing", children: [
    /* @__PURE__ */ jsxs("label", { children: [
      /* @__PURE__ */ jsx("span", { children: "Provider" }),
      /* @__PURE__ */ jsxs("select", { value: provider, onChange: (event) => changeProvider(event.target.value), children: [
        /* @__PURE__ */ jsx("option", { value: "", children: "Hermes private-config default" }),
        providers.map((candidate) => /* @__PURE__ */ jsx("option", { value: candidate.id, children: candidate.label }, candidate.id))
      ] })
    ] }),
    includeBaseUrl ? /* @__PURE__ */ jsxs("label", { children: [
      /* @__PURE__ */ jsx("span", { children: "Base URL" }),
      /* @__PURE__ */ jsx("input", { type: "url", value: baseUrl, onChange: (event) => onBaseUrlChange?.(event.target.value), placeholder: endpointPlaceholder, spellCheck: false })
    ] }) : null,
    /* @__PURE__ */ jsxs("label", { children: [
      /* @__PURE__ */ jsx("span", { children: "Model" }),
      /* @__PURE__ */ jsxs("span", { className: "hermes-model-select", children: [
        /* @__PURE__ */ jsxs("select", { value: manual ? "__manual__" : model, onChange: (event) => {
          if (event.target.value === "__manual__") setManual(true);
          else {
            setManual(false);
            onModelChange(event.target.value);
          }
        }, disabled: loading && !models.length, children: [
          /* @__PURE__ */ jsx("option", { value: "", children: loading ? "Loading models\u2026" : models.length ? "Select a model\u2026" : "No models discovered" }),
          models.map((candidate) => /* @__PURE__ */ jsx("option", { value: candidate, children: candidate }, candidate)),
          /* @__PURE__ */ jsx("option", { value: "__manual__", children: "Manual model ID\u2026" })
        ] }),
        /* @__PURE__ */ jsx("button", { type: "button", onClick: refresh, disabled: loading, "aria-label": "Refresh models from provider", children: loading ? "\u2026" : "\u21BB" })
      ] })
    ] }),
    manual ? /* @__PURE__ */ jsxs("label", { children: [
      /* @__PURE__ */ jsx("span", { children: "Model ID" }),
      /* @__PURE__ */ jsx("input", { value: model, onChange: (event) => onModelChange(event.target.value), placeholder: "provider/model-name", spellCheck: false, autoFocus: true })
    ] }) : null,
    /* @__PURE__ */ jsxs("p", { className: `hermes-model-status ${error || catalog?.warning ? "is-warning" : ""}`, children: [
      error ? `Model discovery failed: ${error}` : catalog?.warning ? catalog.warning : loading ? "Querying the provider model catalog\u2026" : `${models.length.toLocaleString()} models \xB7 ${catalog?.source === "live" ? `live ${catalog.modelsUrl || "/v1/models"}` : "Hermes catalog"}`,
      credentialVars.length ? ` API key: ${credentialVars.join(" or ")} is ${credentialConfigured ? "configured" : "missing"} in ${credentialLocation}; its value never enters config.yaml or the .tldraw file.` : selectedProvider?.authType === "host_gated" ? " No credential is automatically forwarded to this endpoint; localhost/no-key servers work directly, while remote vendors use a host-derived VENDOR_API_KEY in ~/.hermes/.env." : " This provider uses account/OAuth authentication rather than a profile API-key field.",
      credentialReason ? ` ${credentialReason}` : ""
    ] })
  ] });
}
function HermesConfigExplorer({ apiBase = "" }) {
  const explorerRef = useRef(null);
  const bodyRef = useRef(null);
  const [profile, setProfile] = useState(null);
  const [document, setDocument] = useState(null);
  const [content, setContent] = useState("");
  const [values, setValues] = useState({});
  const [filter, setFilter] = useState("");
  const [expanded, setExpanded] = useState(() => /* @__PURE__ */ new Set(["routing"]));
  const [rawOpen, setRawOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("Connecting to the local Flight Deck runtime\u2026");
  const load = useCallback(async () => {
    try {
      const loaded = await profileFetch(apiBase, "/api/profile");
      const config = loaded.documents.find((candidate) => candidate.path === "config.yaml") ?? null;
      if (!config) throw new Error("This profile does not expose config.yaml.");
      setProfile(loaded);
      setDocument(config);
      setContent(config.content);
      setValues(valuesFromContent(config.content));
      setStatus(`Revision ${config.revision.slice(0, 8)} \xB7 profile repository`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(`Runtime unavailable \xB7 showing Hermes defaults \xB7 ${message}`);
    }
  }, [apiBase]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    const explorer = explorerRef.current;
    const view = explorer?.ownerDocument.defaultView;
    if (!explorer || !view) return;
    const handleWheel = (event) => {
      const body = bodyRef.current;
      if (!body || !event.target || !explorer.contains(event.target) || event.ctrlKey || event.metaKey) return;
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? body.clientHeight : 1;
      if (!event.deltaX && !event.deltaY) return;
      event.preventDefault();
      event.stopPropagation();
      body.scrollTop += event.deltaY * unit;
      body.scrollLeft += event.deltaX * unit;
    };
    view.addEventListener("wheel", handleWheel, { capture: true, passive: false });
    return () => view.removeEventListener("wheel", handleWheel, { capture: true });
  }, []);
  const dirty = Boolean(document && content !== document.content);
  const normalizedFilter = filter.trim().toLowerCase();
  const visibleCategories = useMemo(() => CONFIG_CATEGORIES.map((category) => {
    if (!normalizedFilter) return category;
    const categoryMatch = `${category.id} ${category.label}`.toLowerCase().includes(normalizedFilter);
    const controls = categoryMatch ? category.controls : category.controls.filter(
      (control) => `${control.id} ${control.label} ${control.description} ${String(values[control.id] ?? "")}`.toLowerCase().includes(normalizedFilter)
    );
    return { ...category, controls };
  }).filter((category) => category.controls.length), [normalizedFilter, values]);
  const update = (control, value) => {
    if (!control.path) return;
    setValues((current) => ({ ...current, [control.id]: value }));
    let persistedValue = control.type === "list" ? String(value).split(",").map((item) => item.trim()).filter(Boolean) : value;
    if (control.id === "agent.tool_use_enforcement" && (value === "true" || value === "false")) {
      persistedValue = value === "true";
    }
    setContent((current) => writeYamlValue(current, control.path, persistedValue));
    setStatus(`Unsaved profile draft \xB7 ${control.applies?.toLowerCase() ?? "runtime rebuild"} after save`);
  };
  const updateById = (id, value) => {
    const control = editableControls().find((candidate) => candidate.id === id);
    if (control) update(control, value);
  };
  const save = async () => {
    if (!document || !dirty) return;
    setSaving(true);
    try {
      await profileFetch(apiBase, "/api/document", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: "config.yaml", content, expectedRevision: document.revision })
      });
      await load();
      window.dispatchEvent(new Event(CONFIG_SAVED_EVENT));
      setStatus("Saved config.yaml \xB7 Hermes runtime resets for the next session");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };
  const renderControl = (control) => {
    const source = control.path ? readYamlValue(content, control.path, control.defaultValue) : null;
    const value = values[control.id] ?? source?.value ?? control.defaultValue;
    const selected = Array.isArray(value) ? value : String(value).split(",").map((item) => item.trim()).filter(Boolean);
    const dynamicOptions = control.id.startsWith("plugins.") ? [
      ...(profile?.extensions.plugins ?? []).map((plugin) => ({ value: String(plugin.id ?? ""), label: String(plugin.name ?? plugin.id ?? "") })),
      ...(profile?.extensions.portablePlugins ?? []).map((plugin) => ({ value: String(plugin.id ?? ""), label: String(plugin.name ?? plugin.id ?? "") }))
    ].filter((option) => option.value) : control.options ?? [];
    const options = [...dynamicOptions];
    for (const current of selected) if (current && !options.some((option) => option.value === current)) options.push({ value: current, label: `${current} (current/custom)` });
    return /* @__PURE__ */ jsxs("div", { className: "hermes-config-control", children: [
      /* @__PURE__ */ jsxs("span", { className: "hermes-config-control-copy", children: [
        /* @__PURE__ */ jsx("strong", { children: control.label }),
        /* @__PURE__ */ jsx("small", { children: control.type === "status" ? "DISCOVERED" : `${source?.present ? "PROFILE" : "HERMES DEFAULT"}${control.applies ? ` \xB7 ${control.applies}` : ""}` }),
        /* @__PURE__ */ jsx("em", { children: control.description })
      ] }),
      control.type === "status" ? /* @__PURE__ */ jsx("output", { children: profile && control.status ? control.status(profile) : "loading" }) : control.type === "select" ? /* @__PURE__ */ jsx("select", { value: String(value), onChange: (event) => update(control, event.target.value), children: options.map((option) => /* @__PURE__ */ jsx("option", { value: option.value, children: option.label }, option.value)) }) : control.type === "multiselect" ? /* @__PURE__ */ jsxs("details", { className: "hermes-config-multiselect", children: [
        /* @__PURE__ */ jsx("summary", { children: selected.length ? selected.join(", ") : "None selected" }),
        /* @__PURE__ */ jsx("div", { children: options.length ? options.map((option) => /* @__PURE__ */ jsxs("label", { children: [
          /* @__PURE__ */ jsx("input", { type: "checkbox", checked: selected.includes(option.value), onChange: (event) => update(control, event.target.checked ? [...selected, option.value] : selected.filter((item) => item !== option.value)) }),
          /* @__PURE__ */ jsx("span", { children: option.label })
        ] }, option.value)) : /* @__PURE__ */ jsx("small", { children: "No compatible options were discovered in this profile." }) })
      ] }) : control.type === "checkbox" ? /* @__PURE__ */ jsxs("label", { className: "hermes-config-checkbox", children: [
        /* @__PURE__ */ jsx("input", { type: "checkbox", checked: Boolean(value), onChange: (event) => update(control, event.target.checked) }),
        /* @__PURE__ */ jsx("span", { children: value ? "Enabled" : "Disabled" })
      ] }) : control.type === "textarea" ? /* @__PURE__ */ jsx("textarea", { value: String(value), onChange: (event) => update(control, event.target.value), placeholder: control.placeholder, spellCheck: false }) : /* @__PURE__ */ jsx("input", { type: control.type === "number" ? "number" : "text", min: control.min, max: control.max, value: String(value), onChange: (event) => update(control, control.type === "number" ? Number(event.target.value) : event.target.value), placeholder: control.placeholder ?? (control.type === "list" ? "Comma-separated values\u2026" : void 0), spellCheck: false })
    ] }, control.id);
  };
  return /* @__PURE__ */ jsxs("aside", { ref: explorerRef, className: "hermes-config-explorer", onPointerDown: stopEventPropagation, onClick: stopEventPropagation, onWheel: stopEventPropagation, children: [
    /* @__PURE__ */ jsxs("header", { children: [
      /* @__PURE__ */ jsx("div", { className: "hermes-config-icon", children: "H" }),
      /* @__PURE__ */ jsxs("span", { children: [
        /* @__PURE__ */ jsx("strong", { children: "Hermes config.yaml" }),
        /* @__PURE__ */ jsx("small", { children: "ON-CANVAS \xB7 PROFILE CONFIG \xB7 CREDENTIAL HOME EXCLUDED" })
      ] }),
      /* @__PURE__ */ jsx("i", { className: dirty ? "is-dirty" : "", title: dirty ? "Unsaved changes" : "Saved" })
    ] }),
    /* @__PURE__ */ jsxs("div", { ref: bodyRef, className: "hermes-config-body", children: [
      /* @__PURE__ */ jsxs("div", { className: "hermes-config-filter", children: [
        /* @__PURE__ */ jsx("span", { children: "\u2315" }),
        /* @__PURE__ */ jsx("input", { value: filter, onChange: (event) => setFilter(event.target.value), placeholder: "Filter options, values, descriptions\u2026" }),
        filter ? /* @__PURE__ */ jsx("button", { onClick: () => setFilter(""), "aria-label": "Clear filter", children: "\xD7" }) : null
      ] }),
      visibleCategories.map((category) => {
        const isExpanded = normalizedFilter !== "" || expanded.has(category.id);
        const hasModelRouting = category.controls.some((control) => MODEL_ROUTING_IDS.has(control.id));
        const regularControls = category.controls.filter((control) => !MODEL_ROUTING_IDS.has(control.id));
        return /* @__PURE__ */ jsxs("section", { className: "hermes-config-category", children: [
          /* @__PURE__ */ jsxs("button", { className: "hermes-config-category-toggle", onClick: () => setExpanded((current) => {
            const next = new Set(current);
            if (next.has(category.id)) next.delete(category.id);
            else next.add(category.id);
            return next;
          }), children: [
            /* @__PURE__ */ jsx("span", { children: isExpanded ? "\u2304" : "\u203A" }),
            /* @__PURE__ */ jsx("strong", { children: category.label }),
            /* @__PURE__ */ jsx("small", { children: category.controls.length })
          ] }),
          isExpanded ? /* @__PURE__ */ jsxs("div", { children: [
            hasModelRouting ? /* @__PURE__ */ jsx(HermesModelRoutingFields, { apiBase, provider: String(values["model.provider"] ?? ""), model: String(values["model.default"] ?? ""), baseUrl: String(values["model.base_url"] ?? ""), includeBaseUrl: true, onProviderChange: (value) => updateById("model.provider", value), onModelChange: (value) => updateById("model.default", value), onBaseUrlChange: (value) => updateById("model.base_url", value) }) : null,
            regularControls.map(renderControl)
          ] }) : null
        ] }, category.id);
      }),
      !visibleCategories.length ? /* @__PURE__ */ jsxs("p", { className: "hermes-config-empty", children: [
        "No Hermes config options match \u201C",
        filter,
        "\u201D."
      ] }) : null,
      !normalizedFilter || "raw yaml source config".includes(normalizedFilter) ? /* @__PURE__ */ jsxs("section", { className: "hermes-config-category hermes-config-raw", children: [
        /* @__PURE__ */ jsxs("button", { className: "hermes-config-category-toggle", onClick: () => setRawOpen((open) => !open), children: [
          /* @__PURE__ */ jsx("span", { children: rawOpen ? "\u2304" : "\u203A" }),
          /* @__PURE__ */ jsx("strong", { children: "Raw profile YAML" }),
          /* @__PURE__ */ jsx("small", { children: "ADVANCED" })
        ] }),
        rawOpen ? /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("p", { children: "Unknown Hermes settings and comments are preserved. Provider credentials belong in the external Hermes credential config, not this distributed profile." }),
          /* @__PURE__ */ jsx("textarea", { value: content, onChange: (event) => {
            setContent(event.target.value);
            setValues(valuesFromContent(event.target.value));
            setStatus("Unsaved raw YAML draft \xB7 not runtime validated");
          }, placeholder: "Edit the complete Hermes config.yaml source\u2026", spellCheck: false })
        ] }) : null
      ] }) : null
    ] }),
    /* @__PURE__ */ jsxs("footer", { className: "hermes-config-footer", children: [
      /* @__PURE__ */ jsxs("div", { className: "hermes-config-actions", children: [
        /* @__PURE__ */ jsx("button", { onClick: () => void load(), disabled: saving, children: "Reload" }),
        /* @__PURE__ */ jsx("button", { className: "is-primary", onClick: () => void save(), disabled: saving || !dirty, children: saving ? "Saving\u2026" : "Save config.yaml" })
      ] }),
      /* @__PURE__ */ jsx("small", { className: "hermes-config-status", children: status })
    ] })
  ] });
}

// offline/flight-deck-kit.tsx
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
var API_BASE = "http://127.0.0.1:5192";
var PAGE_NAME = "Hermes Flight Deck";
var LEGACY_PAGE_NAME = "Hermes Profile Canvas";
var PROMPT_LAYER_TYPE = "hermes-prompt-layer";
var CHAT_BRANCH_TYPE = "hermes-chat-branch";
var CAPABILITY_TYPE = "hermes-flight-capability";
var HERMES_CONFIG_TYPE = "hermes-config-node";
var EDGE_EVENT = "hermes-profile-canvas:ensure-edges";
var KIT_ID = "hermes.flight-deck";
var PROFILE_CANVAS_PRESET_ID = "hermes.profile-canvas";
var SEED_META = { canvasKitId: KIT_ID, canvasPresetId: PROFILE_CANVAS_PRESET_ID, hermesFlightDeckSeed: true };
function parseData(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
function tierLabel(tier) {
  if (tier === "api-overlay") return "API overlay";
  return `${tier[0].toUpperCase()}${tier.slice(1)} cache tier`;
}
function formatPercent(value) {
  const percent = Math.max(0, Number(value) || 0);
  if (percent === 0) return "0%";
  if (percent < 0.01) return "<0.01%";
  return `${percent.toFixed(percent < 1 ? 2 : 1)}%`;
}
var HermesConfigShapeUtil = class extends BaseBoxShapeUtil {
  static type = HERMES_CONFIG_TYPE;
  static props = { w: T.number, h: T.number };
  getDefaultProps() {
    return { w: 560, h: 1040 };
  }
  canBind() {
    return false;
  }
  canResize() {
    return false;
  }
  canSnap() {
    return false;
  }
  getGeometry(shape) {
    return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true });
  }
  component(shape) {
    return /* @__PURE__ */ jsxs2(HTMLContainer, { className: "hermes-config-node", style: { width: shape.props.w, height: shape.props.h }, children: [
      /* @__PURE__ */ jsx2("style", { children: app_default }),
      /* @__PURE__ */ jsx2(HermesConfigExplorer, { apiBase: API_BASE })
    ] });
  }
  indicator(shape) {
    return /* @__PURE__ */ jsx2("rect", { width: shape.props.w, height: shape.props.h, rx: 10, ry: 10 });
  }
  getIndicatorPath(shape) {
    const path = new Path2D();
    path.roundRect(0, 0, shape.props.w, shape.props.h, 10);
    return path;
  }
};
var PromptLayerShapeUtil = class extends BaseBoxShapeUtil {
  static type = PROMPT_LAYER_TYPE;
  static props = { w: T.number, h: T.number, data: T.string };
  getDefaultProps() {
    return { w: 360, h: 116, data: "{}" };
  }
  canResize() {
    return false;
  }
  getGeometry(shape) {
    return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true });
  }
  component(shape) {
    const layer = parseData(shape.props.data);
    if (!layer) return null;
    const state = layer.blocked ? "blocked" : layer.effective ? "effective" : layer.exists ? "shadowed" : "missing";
    const injectedTokens = layer.effective ? layer.injectedTokens ?? layer.estimatedTokens : 0;
    const percent = layer.effective ? layer.contextPercent : 0;
    return /* @__PURE__ */ jsxs2(HTMLContainer, { className: `layer-card state-${state} tier-${layer.tier}`, children: [
      /* @__PURE__ */ jsx2("style", { children: app_default }),
      /* @__PURE__ */ jsxs2(
        "button",
        {
          className: "layer-card-button",
          onPointerDown: stopEventPropagation2,
          onClick: () => window.dispatchEvent(new CustomEvent("hermes-profile-canvas:select-layer", { detail: layer.id })),
          children: [
            /* @__PURE__ */ jsxs2("span", { className: "layer-card-header", children: [
              /* @__PURE__ */ jsx2("span", { className: "layer-order", children: String(layer.order).padStart(2, "0") }),
              /* @__PURE__ */ jsxs2("span", { className: "layer-identity", children: [
                /* @__PURE__ */ jsx2("strong", { children: layer.label }),
                /* @__PURE__ */ jsx2("span", { className: "layer-tier", children: tierLabel(layer.tier) })
              ] }),
              /* @__PURE__ */ jsx2("span", { className: `state-pill ${state}`, children: state })
            ] }),
            /* @__PURE__ */ jsx2("span", { className: "layer-reason", children: layer.reason }),
            /* @__PURE__ */ jsxs2("span", { className: "layer-card-footer", children: [
              /* @__PURE__ */ jsx2("span", { children: layer.path ?? layer.kind }),
              /* @__PURE__ */ jsxs2("span", { children: [
                injectedTokens.toLocaleString(),
                " EST. TOKENS \xB7 ",
                layer.contextResolved || !layer.effective ? formatPercent(percent) : "\u2014"
              ] })
            ] })
          ]
        }
      )
    ] });
  }
  indicator(shape) {
    return /* @__PURE__ */ jsx2("rect", { width: shape.props.w, height: shape.props.h, rx: 7, ry: 7 });
  }
  getIndicatorPath(shape) {
    const path = new Path2D();
    path.roundRect(0, 0, shape.props.w, shape.props.h, 7);
    return path;
  }
};
var CapabilityShapeUtil = class extends BaseBoxShapeUtil {
  static type = CAPABILITY_TYPE;
  static props = { w: T.number, h: T.number, data: T.string };
  getDefaultProps() {
    return { w: 320, h: 118, data: "{}" };
  }
  canResize() {
    return false;
  }
  getGeometry(shape) {
    return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true });
  }
  component(shape) {
    const data = parseData(shape.props.data);
    if (!data) return null;
    return /* @__PURE__ */ jsxs2(HTMLContainer, { className: `capability-card status-${data.status} ${data.active ? "is-active" : ""}`, children: [
      /* @__PURE__ */ jsx2("style", { children: app_default }),
      /* @__PURE__ */ jsxs2("button", { onPointerDown: stopEventPropagation2, onClick: () => window.dispatchEvent(new CustomEvent("hermes-profile-canvas:select-capability", { detail: data.id })), children: [
        /* @__PURE__ */ jsx2("span", { className: "capability-icon", children: data.id === "prompt" ? "\xB6" : data.id === "tools" ? "\u2301" : data.id === "skills" ? "\u25C7" : data.id === "messaging" ? "\u2197" : data.id === "extensions" ? "\u2318" : data.id === "documents" ? "DOC" : data.id === "memory" ? "MEM" : "H" }),
        /* @__PURE__ */ jsxs2("span", { className: "capability-copy", children: [
          /* @__PURE__ */ jsx2("small", { children: data.eyebrow }),
          /* @__PURE__ */ jsx2("strong", { children: data.label }),
          /* @__PURE__ */ jsx2("span", { children: data.summary })
        ] }),
        /* @__PURE__ */ jsx2("span", { className: `readiness-pill ${data.status}`, children: data.status === "not-run" ? "not run" : data.status })
      ] }),
      /* @__PURE__ */ jsx2("footer", { children: data.details })
    ] });
  }
  indicator(shape) {
    return /* @__PURE__ */ jsx2("rect", { width: shape.props.w, height: shape.props.h, rx: 7, ry: 7 });
  }
  getIndicatorPath(shape) {
    const path = new Path2D();
    path.roundRect(0, 0, shape.props.w, shape.props.h, 7);
    return path;
  }
};
var ChatBranchShapeUtil = class extends BaseBoxShapeUtil {
  static type = CHAT_BRANCH_TYPE;
  static props = { w: T.number, h: T.number, data: T.string };
  getDefaultProps() {
    return { w: 370, h: 280, data: "{}" };
  }
  canResize() {
    return false;
  }
  getGeometry(shape) {
    return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true });
  }
  component(shape) {
    const data = parseData(shape.props.data);
    if (!data) return null;
    const shownMessages = data.messages.slice(-4);
    return /* @__PURE__ */ jsxs2(HTMLContainer, { className: `chat-card ${data.active ? "is-active" : ""}`, children: [
      /* @__PURE__ */ jsx2("style", { children: app_default }),
      /* @__PURE__ */ jsx2(
        "button",
        {
          className: "chat-card-select",
          onPointerDown: stopEventPropagation2,
          onClick: () => window.dispatchEvent(new CustomEvent("hermes-profile-canvas:select-branch", { detail: data.id })),
          "aria-label": `Select ${data.label}`
        }
      ),
      /* @__PURE__ */ jsxs2("header", { children: [
        /* @__PURE__ */ jsx2("span", { className: "chat-card-icon", children: "\u21B3" }),
        /* @__PURE__ */ jsxs2("div", { children: [
          /* @__PURE__ */ jsx2("strong", { children: data.label }),
          /* @__PURE__ */ jsx2("span", { className: "eyebrow", children: "CHAT BRANCH" })
        ] }),
        /* @__PURE__ */ jsxs2("span", { className: `run-state state-${data.status}`, children: [
          data.status === "running" ? /* @__PURE__ */ jsx2("span", { className: "spinner" }) : null,
          data.status
        ] })
      ] }),
      /* @__PURE__ */ jsxs2("div", { className: "message-stack", children: [
        shownMessages.length === 0 ? /* @__PURE__ */ jsx2("div", { className: "empty-message", children: "Ready for a prompt. Run starts a fresh Hermes prompt snapshot." }) : shownMessages.map((message, index) => /* @__PURE__ */ jsxs2("div", { className: `message-row role-${message.role}`, children: [
          /* @__PURE__ */ jsx2("span", { children: message.role === "user" ? "YOU" : "HERMES" }),
          /* @__PURE__ */ jsx2("p", { children: message.content || (data.status === "running" ? "\u2026" : "") })
        ] }, `${data.id}-${data.messages.length - shownMessages.length + index}`)),
        data.error ? /* @__PURE__ */ jsx2("div", { className: "branch-error", children: data.error }) : null
      ] }),
      /* @__PURE__ */ jsxs2("footer", { children: [
        /* @__PURE__ */ jsx2("code", { children: data.sessionId.slice(0, 8) }),
        /* @__PURE__ */ jsxs2("span", { children: [
          data.messages.length,
          " messages"
        ] })
      ] })
    ] });
  }
  indicator(shape) {
    return /* @__PURE__ */ jsx2("rect", { width: shape.props.w, height: shape.props.h, rx: 7, ry: 7 });
  }
  getIndicatorPath(shape) {
    const path = new Path2D();
    path.roundRect(0, 0, shape.props.w, shape.props.h, 7);
    return path;
  }
};
var HERMES_FLIGHT_DECK_SHAPE_UTILS = [
  PromptLayerShapeUtil,
  ChatBranchShapeUtil,
  CapabilityShapeUtil,
  HermesConfigShapeUtil
];
function stableShapeId(prefix, id) {
  return createShapeId(`${prefix}-${id.replace(/[^A-Za-z0-9_-]/g, "-")}`);
}
function branchLayout(branches) {
  const byParent = /* @__PURE__ */ new Map();
  for (const branch of branches) byParent.set(branch.parentId, [...byParent.get(branch.parentId) ?? [], branch]);
  let leaf = 0;
  const positions = /* @__PURE__ */ new Map();
  const visit = (branch, depth) => {
    const children = byParent.get(branch.id) ?? [];
    const y = children.length ? children.map((child) => visit(child, depth + 1)).reduce((sum, value) => sum + value, 0) / children.length : leaf++ * 330;
    positions.set(branch.id, { x: 80 + depth * 450, y: 130 + y });
    return y;
  };
  for (const root of byParent.get(null) ?? []) visit(root, 0);
  return positions;
}
function ensureFlightDeckPage(editor) {
  let page = editor.getPages().find((candidate) => candidate.name === PAGE_NAME || candidate.name === LEGACY_PAGE_NAME);
  if (!page) {
    editor.createPage({ name: PAGE_NAME });
    page = editor.getPages().find((candidate) => candidate.name === PAGE_NAME);
  }
  if (page && page.name !== PAGE_NAME) {
    editor.updatePage({ id: page.id, name: PAGE_NAME });
    page = editor.getPage(page.id);
  }
  if (page && editor.getCurrentPageId() !== page.id) editor.setCurrentPage(page.id);
  return page;
}
var SEED_LAYERS = [
  {
    id: "soul",
    order: 1,
    tier: "stable",
    kind: "personality",
    label: "SOUL.md",
    path: "SOUL.md",
    content: "",
    revision: "local-seed",
    exists: true,
    blocked: false,
    editable: true,
    effective: true,
    reason: "Stable personality source discovered in the profile distribution.",
    estimatedTokens: 286,
    injectedTokens: 286,
    contextPercent: 0,
    contextResolved: false
  },
  {
    id: "project-context",
    order: 2,
    tier: "context",
    kind: "project-instructions",
    label: "AGENTS.md",
    path: "AGENTS.md",
    content: "",
    revision: "local-seed",
    exists: true,
    blocked: false,
    editable: true,
    effective: true,
    reason: "Winning project-context source for repository-specific instructions.",
    estimatedTokens: 412,
    injectedTokens: 412,
    contextPercent: 0,
    contextResolved: false
  },
  {
    id: "system-overlay",
    order: 3,
    tier: "api-overlay",
    kind: "system-prompt",
    label: "agent.system_prompt",
    path: "config.yaml",
    content: "",
    revision: "local-seed",
    exists: true,
    blocked: false,
    editable: true,
    effective: true,
    reason: "Config-side system prompt overlay applied after repository context.",
    estimatedTokens: 96,
    injectedTokens: 96,
    contextPercent: 0,
    contextResolved: false
  }
];
var SEED_CAPABILITY = {
  id: "prompt",
  label: "Prompt composition",
  eyebrow: "PROFILE READINESS",
  status: "not-run",
  summary: "Local profile sources are mapped; inspect Hermes for an exact snapshot.",
  details: "This deterministic seed needs no gateway. The full Offline app refreshes it from the selected profile when available.",
  counts: { sources: SEED_LAYERS.length },
  evidence: ["SOUL.md stable source", "AGENTS.md context source", "config.yaml API overlay"],
  tests: ["Build exact prompt snapshot", "Compare estimated and provider-reported usage"]
};
var SEED_BRANCH = {
  id: "root",
  sessionId: "flight-deck-local-seed",
  parentId: null,
  label: "Main",
  messages: [],
  status: "idle"
};
function buildSeed(pageId, point) {
  const nonce = createShapeId().slice("shape:".length);
  const shapeId = (suffix) => createShapeId(`hermes-flight-deck-${nonce}-${suffix}`);
  const bindingId = (suffix) => createBindingId(`hermes-flight-deck-${nonce}-${suffix}`);
  const configId = shapeId("config");
  const capabilityId = shapeId("capability-prompt");
  const branchId = shapeId("branch-root");
  const layerIds = SEED_LAYERS.map((layer) => shapeId(`layer-${layer.id}`));
  const arrowIds = SEED_LAYERS.slice(1).map((_, index) => shapeId(`prompt-edge-${index}`));
  const bindingIds = arrowIds.flatMap((_, index) => [bindingId(`prompt-edge-${index}-start`), bindingId(`prompt-edge-${index}-end`)]);
  const origin = { x: point.x - 280, y: point.y - 520 };
  const shapes = [
    {
      id: configId,
      type: HERMES_CONFIG_TYPE,
      parentId: pageId,
      x: origin.x,
      y: origin.y,
      props: { w: 560, h: 1040 },
      meta: SEED_META
    },
    ...SEED_LAYERS.map((layer, index) => ({
      id: layerIds[index],
      type: PROMPT_LAYER_TYPE,
      parentId: pageId,
      x: origin.x + 700,
      y: origin.y + 110 + index * 158,
      props: { w: 360, h: 116, data: JSON.stringify(layer) },
      meta: SEED_META
    })),
    {
      id: capabilityId,
      type: CAPABILITY_TYPE,
      parentId: pageId,
      x: origin.x + 700,
      y: origin.y + 660,
      props: { w: 320, h: 118, data: JSON.stringify({ ...SEED_CAPABILITY, active: true }) },
      meta: SEED_META
    },
    {
      id: branchId,
      type: CHAT_BRANCH_TYPE,
      parentId: pageId,
      x: origin.x + 1100,
      y: origin.y + 110,
      props: { w: 370, h: 280, data: JSON.stringify({ ...SEED_BRANCH, active: true }) },
      meta: SEED_META
    },
    ...arrowIds.map((id, index) => ({
      id,
      type: "arrow",
      parentId: pageId,
      x: origin.x + 1060,
      y: origin.y + 168 + index * 158,
      props: {
        color: "grey",
        size: "s",
        arrowheadEnd: "arrow",
        start: { x: 0, y: 0 },
        end: { x: 0, y: 158 }
      },
      meta: { ...SEED_META, hermesProfileEdge: `prompt:${SEED_LAYERS[index].id}:${SEED_LAYERS[index + 1].id}` }
    }))
  ];
  const bindings = arrowIds.flatMap((arrowId, index) => [
    {
      id: bindingIds[index * 2],
      type: "arrow",
      fromId: arrowId,
      toId: layerIds[index],
      props: { terminal: "start", normalizedAnchor: { x: 0.5, y: 0.5 }, isExact: false, isPrecise: false, snap: "none" }
    },
    {
      id: bindingIds[index * 2 + 1],
      type: "arrow",
      fromId: arrowId,
      toId: layerIds[index + 1],
      props: { terminal: "end", normalizedAnchor: { x: 0.5, y: 0.5 }, isExact: false, isPrecise: false, snap: "none" }
    }
  ]);
  return {
    shapes,
    bindings,
    shapeIds: shapes.map((shape) => shape.id),
    bindingIds
  };
}
function insertProfileCanvasPreset(editor, pageId, point) {
  const page = editor.getPage(pageId);
  if (!page) throw new Error(`Unknown page: ${pageId}`);
  const plan = buildSeed(pageId, point);
  if (plan.shapeIds.some((id) => editor.getShape(id)) || plan.bindingIds.some((id) => editor.getBinding(id))) {
    throw new Error("Hermes Flight Deck insertion generated a duplicate record id");
  }
  const pageShapeCount = editor.getPageShapeIds(pageId).size;
  if (pageShapeCount + plan.shapeIds.length > editor.options.maxShapesPerPage) {
    throw new Error("Hermes Flight Deck preset exceeds the page shape limit");
  }
  const historyMark = editor.markHistoryStoppingPoint("Insert Hermes Flight Deck");
  try {
    editor.run(() => {
      editor.createShapes(plan.shapes);
      for (const shapeId of plan.shapeIds) {
        if (!editor.getShape(shapeId)) throw new Error(`Hermes Flight Deck insertion skipped shape ${shapeId}`);
      }
      editor.createBindings(plan.bindings);
      for (const bindingId of plan.bindingIds) {
        if (!editor.getBinding(bindingId)) throw new Error(`Hermes Flight Deck insertion skipped binding ${bindingId}`);
      }
    });
    editor.squashToMark(historyMark);
  } catch (error) {
    editor.bailToMark(historyMark);
    throw error;
  }
  return { kitId: KIT_ID, presetId: PROFILE_CANVAS_PRESET_ID, shapeIds: plan.shapeIds, bindingIds: plan.bindingIds };
}
var CANVAS_KIT_CONTRIBUTIONS = [
  {
    kitId: KIT_ID,
    presetIds: [PROFILE_CANVAS_PRESET_ID],
    shapeUtils: HERMES_FLIGHT_DECK_SHAPE_UTILS,
    bindingUtils: [],
    tools: [],
    insertPreset(editor, presetId, { pageId, point }) {
      if (presetId !== PROFILE_CANVAS_PRESET_ID) {
        throw new Error(`Unknown preset ${presetId} for kit ${KIT_ID}`);
      }
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
        throw new Error("Hermes Flight Deck insertion point must contain finite x and y coordinates");
      }
      return insertProfileCanvasPreset(editor, pageId, point);
    }
  }
];
export {
  API_BASE,
  CANVAS_KIT_CONTRIBUTIONS,
  CAPABILITY_TYPE,
  CHAT_BRANCH_TYPE,
  CapabilityShapeUtil,
  ChatBranchShapeUtil,
  EDGE_EVENT,
  HERMES_CONFIG_TYPE,
  HERMES_FLIGHT_DECK_SHAPE_UTILS,
  HermesConfigShapeUtil,
  LEGACY_PAGE_NAME,
  PAGE_NAME,
  PROMPT_LAYER_TYPE,
  PromptLayerShapeUtil,
  branchLayout,
  ensureFlightDeckPage,
  stableShapeId
};
