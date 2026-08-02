# CURRENT views corrected to evidence-verified actual state

Date: 2026-07-30

## Context

A DevSecOps-lens audit compared the `autorecruit-contours` CURRENT views (1–3)
against the AutoRecruit monorepo source-of-truth documents (CONTEXT.md,
FINAL_BOSS active_work + ADRs, ops/production inventory, and the production CD
runbook). Several diagram claims were unverified or contradicted by accepted
evidence. MUST views (4–6) were left unchanged: they are target state and
already match accepted ADRs.

## Decisions

1. Ingress is owned Caddy (`app.crypack.rodeo`), not vendor Cloudflare; the
   inherited Cloudflare Worker deployment was removed. Contour recolored
   `trust-vendor` → `trust-owned`.
2. The `:8317` router is the operator-Mac CPA/CLIProxyAPI reached from devbox
   via the `:18317` reverse tunnel, not the repository Elixir `llm-proxy`.
   RentGPU and `iroh-blobs` were removed for lack of any repository evidence.
3. Hands primary path is `workers → exe.dev VM Hands (agent-browser --cdp
   loopback → embedded Foxbridge)` drawn solid. The Iroh relay and Headscale
   remain only as an experimental partial management lane drawn DASHED
   (IR-G2 green, production-direct yellow); Headscale is legacy tailnet.
4. Fleet substrate is exe.dev as PRIMARY (not burst); Proxmox, CubeSandbox,
   and the 6–10-day rotation cron were removed for lack of evidence. Lifecycle
   is job-scoped with 30-day inactivity retention.
5. RU proxies are per-account/run lease refs, never a shared fleet proxy.
6. Postgres is a lease ledger / ref store, not a credential bus: the
   `Postgres → Hands` connector was removed and replaced with
   `arctl → hands-sidecar / ar-hands → Hands`. The sidecar node carries the
   open B4 gap note (same-UID with agent today; OS isolation proposed).
7. Mailbox flow follows the accepted neverest default: `mailbox-svc → nym_ru
   egress → Provider mailboxes (IMAP)`; Nym is an egress route, not a
   processing node. CAPTCHA is provider-readiness refs only.

## Conventions introduced

- DASHED connector = experimental, partial, or out-of-release lane.
- Item descriptions carry the security caveat where the name cannot.

## Evidence anchors

- `matrix-os/ops/production/Caddyfile`, `production-inventory.yaml`
- `FINAL_BOSS/00_index/active_work.md`
- `FINAL_BOSS/decisions/adr/security_classification.md`,
  `arctl_resource_issuer.md`, `arctl_agent_contract_and_hands_boundary.md`,
  `mailbox_architecture.md`, `execution_runtime_absurd_worker_jobs.md`,
  `browser_worker_brain_hands_split.md`
- `AutoRecruit Production CD.atrb` (release boundary)
- Bridge transactions: idempotency keys
  `devsecops-actual-state:autorecruit-contours:vi_{contours,fleet,issuers}_reworked`
  (revisions 12–15, actor `amp:devsecops-council`)
