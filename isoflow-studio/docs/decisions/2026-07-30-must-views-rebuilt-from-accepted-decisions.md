# MUST views rebuilt from scratch against accepted decision maturity

Date: 2026-07-30

## Context

The previous MUST/target views (4–6) encoded an invented target topology:
Cloudflare Access + FIDO2, two control servers, Postgres PITR + immutable
backup, encrypted artifact store, two owned Proxmox Hands hosts, N+1, two
separate-ASN Iroh relays, Headscale fleet coordination, secure cloud GPU. An
unbiased re-read of the decision base showed most of those claims have no
accepted-ADR backing. The views were torn down completely (all items,
connectors, contours, labels removed) and redrawn from evidence.

## Maturity classification used

- **accepted target** — accepted ADR / controlling spec / current production
  contract.
- **proposed / implementation-gated** — drawn DASHED or labelled.
- **experimental / spike** — excluded from target views (Hatchet Lite,
  Matrix-native workflow profile) or labelled diagnostic-only (Steel).

## Decisions

1. Target ingress is **Caddy** (accepted/current). Cloudflare Access + FIDO2
   was removed from all target views — no accepted decision selects it.
2. View 4 (trust, authority + exposure) now shows: trusted operator incl.
   Resource Materializer and explicit mutation approval; sanitized projection
   (Hub Command Center, Tuwunel private Matrix, Browser Viewer svh_\*, four
   Hermes personas); authority (matrix-os two gateway lanes, Postgres, arctl,
   Eval Lab authority, artifact refs/hashes); private management (Viewer
   bridge, browser brain + Hindsight, llm-proxy :8018 as repo target with CPA
   :8317 current, hands-sidecar, MLflow 3, neverest+Maildir+mailbox-svc);
   semi-trusted execution (Hermes executors, ar-hands, VulpineOS exe.dev
   Hands, gated AndroidVM, eval worker + Promptfoo, observe-only watchers);
   content-exposed providers (incl. nym_ru egress, Steel labelled forbidden
   for marketplace mutation); hostile web (checkers, marketplaces).
3. View 5 (separated network planes) is organized as eight horizontal planes:
   ingress, projection, authority, management (SSH accepted / Iroh
   implementation-gated / Headscale optional future only), same-browser check
   → signed `platform_tier_gate_material` (fail closed), target egress only
   after green gate, provider/IMAP egress via nym_ru (+fallback), inference
   (llm-proxy target / CPA current). A right-hand rule column lists the seven
   NEVER/FAIL-CLOSED invariants from the accepted security model.
4. View 6 was renamed to "6 - MUST / deployment contour + open HA decisions".
   It draws only the accepted contour: one production host (Caddy+static,
   matrix-os preview API, eval worker, Postgres 16 public+absurd,
   restore-verified custom backups ×11; Hermes and MLflow observed but out of
   release), devbox/preprod control (personas, executors, Tuwunel, llm-proxy),
   operator Mac CPA :8317 via :18317 reverse bridge, exe.dev hands pool
   (prewarm 1 / max active 3), external providers/targets/checkers/cloud LLMs,
   and GitHub as signed-artifacts-only (outbound pull; never prod
   credentials). Multi-host HA, PITR, immutable backup, replicas, encrypted
   artifact store, N+1/Proxmox hands, secure GPU, Cloudflare Access, and
   separate-ASN relays are listed as **OPEN — needs deployment ADR**, not
   drawn as architecture. Second Iroh relay is PROPOSED only after
   production-green.
5. Connector semantics: SOLID = accepted path; DASHED =
   proposed/implementation-gated/fallback/diagnostic.

## Evidence anchors

- ADR register re-read: `security_classification.md`,
  `browser_worker_brain_hands_split.md`, `arctl_resource_issuer.md`,
  `arctl_agent_contract_and_hands_boundary.md` (proposed),
  `mailbox_architecture.md`, `execution_runtime_absurd_worker_jobs.md`
  (pilot-gated), `eval_lab_admin_observability.md` (MLflow amendment),
  `hub_sable_command_center.md`, experimental ADRs excluded.
- `matrix-os/ops/production/production-inventory.yaml`,
  `AutoRecruit Production CD.atrb` (single-host bounded contour).
- Caveat: `security_classification.md` and `mailbox_architecture.md` lack
  formal `Status:` lines but are used normatively by indexes and later ADRs.

## Bridge transactions

Idempotency keys `must-rebuild-2026-07-30:autorecruit-contours:{teardown-v4,
teardown-v5,teardown-v6,build-v4a,build-v4b,build-v5,build-v6}`, revisions
25–31, actor `amp:devsecops-council`.
