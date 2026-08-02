const TRUST_COLORS = [
  { id: 'trust-owned', value: '#b9ddb9' },
  { id: 'trust-policy', value: '#b9d3f2' },
  { id: 'trust-projection', value: '#cbd6f4' },
  { id: 'trust-management', value: '#b9e2df' },
  { id: 'trust-vendor', value: '#d8cff2' },
  { id: 'trust-exposed', value: '#f4df9a' },
  { id: 'trust-semitrusted', value: '#f6cda5' },
  { id: 'trust-hostile', value: '#efb7b4' }
];

const CONTOUR_LEGEND = [
  { id: 'owned', label: 'Owned', colorId: 'trust-owned' },
  { id: 'policy', label: 'Policy / projection', colorId: 'trust-policy' },
  { id: 'management', label: 'Private management', colorId: 'trust-management' },
  { id: 'vendor', label: 'External ingress', colorId: 'trust-vendor' },
  { id: 'exposed', label: 'Content-exposed', colorId: 'trust-exposed' },
  { id: 'semitrusted', label: 'Semi-trusted hands', colorId: 'trust-semitrusted' },
  { id: 'hostile', label: 'Hostile web', colorId: 'trust-hostile' }
];

const VIEW_IDS = [
  'vi_contours_reworked',
  'vi_fleet_reworked',
  'vi_issuers_reworked',
  'vi_must_trust',
  'vi_must_network',
  'vi_must_deployment'
];

export function buildContourProject(source) {
  const output = structuredClone(source);
  if (!output?.physicalTopology?.components || !output?.physicalTopology?.views) {
    throw new Error('Isoflow export is missing physicalTopology');
  }

  output.project = { ...(output.project ?? {}), title: 'AutoRecruit — colored contours + MUST' };
  output.physicalTopology.colors = TRUST_COLORS.map(clone);
  output.physicalTopology.legend = CONTOUR_LEGEND.map(clone);

  const components = output.physicalTopology.components;
  const componentById = new Map(components.map((component) => [component.id, component]));
  const iconByName = new Map((output.icons ?? []).map((icon) => [icon.name, icon.id]));

  rename(componentById, 'c_edge', 'Cloudflare origin-hiding ingress');
  rename(componentById, 'c_cloud', 'cloud LLM — content-exposed');
  rename(componentById, 'c_rentgpu', 'RentGPU — host can read VRAM');
  rename(componentById, 'c_relay', 'Iroh relay — metadata / availability trust');
  rename(componentById, 'c_checkers', 'external coherence checker — untrusted');
  rename(componentById, 'c_nym', 'Nym RU egress — mailbox/provider polling');

  const add = (id, name, iconName) => {
    if (componentById.has(id)) return componentById.get(id);
    const component = { id, name, icon: iconByName.get(iconName) };
    if (!component.icon) throw new Error(`Missing icon ${iconName}`);
    components.push(component);
    componentById.set(id, component);
    return component;
  };

  add('c_cfaccess', 'Cloudflare Access + FIDO2', 'Lock');
  add('c_vault', 'Secrets / credential store — refs only', 'Lock');
  add('c_sidecar', 'hands-sidecar — trusted, job scoped', 'Function');
  add('c_identity', 'Account Identity Capsule', 'Package');
  add('c_preflight', 'Signed coherence + mutation preflight', 'Firewall');
  add('c_viewerbridge', 'Viewer bridge + takeover leases', 'Router');
  add('c_nymclient', 'Nym client namespace', 'Router');
  add('c_providerapis', 'Proxy / SMS / mailbox / CAPTCHA provider APIs', 'Cloud');
  add('c_securegpu', 'Secure cloud GPU — policy-bound', 'Cloud');
  add('c_control_a', 'Control server A — matrix-os + Hermes brain', 'Server');
  add('c_control_b', 'Control server B — workers + Viewer bridge', 'Server');
  add('c_db_primary', 'Postgres primary', 'Storage');
  add('c_db_backup', 'Postgres PITR + immutable backup', 'Storage');
  add('c_relay_a', 'Iroh relay A — separate provider / ASN', 'Router');
  add('c_relay_b', 'Iroh relay B — separate provider / ASN', 'Router');
  add('c_hands_a', 'Owned Hands host A — Proxmox', 'Server');
  add('c_hands_b', 'Owned Hands host B — Proxmox', 'Server');
  add('c_artifact_store', 'Artifact store — content addressed + encrypted', 'Package');
  add('c_headscale_coord', 'Fleet coordinator — Headscale, stable nodes only', 'Access Point');

  const sourceViews = new Map(output.physicalTopology.views.map((view) => [view.id, view]));
  const contourView = reworkCurrentContours(sourceViews.get('vi_contours'));
  const fleetView = reworkFleet(sourceViews.get('vi_fleet'));
  const issuerView = reworkIssuers(sourceViews.get('vi_issuers'));
  const mustTrustView = buildMustTrustView();
  const mustNetworkView = buildMustNetworkView();
  const mustDeploymentView = buildMustDeploymentView();

  output.physicalTopology.views = [
    contourView,
    fleetView,
    issuerView,
    mustTrustView,
    mustNetworkView,
    mustDeploymentView
  ];
  for (const view of output.physicalTopology.views) {
    for (const viewItem of view.items) {
      viewItem.labelHeight = Math.max(viewItem.labelHeight ?? 80, 120);
    }
  }
  output.physicalTopology.flows = [];
  remapExistingDocumentRefs(output.documents, {
    vi_contours: 'vi_contours_reworked',
    vi_fleet: 'vi_fleet_reworked',
    vi_issuers: 'vi_issuers_reworked'
  });
  output.documents ??= { list: [] };
  output.documents.list ??= [];
  output.documents.list.push(buildDesignDocument());

  validateProject(output);
  return output;
}

function reworkCurrentContours(source) {
  if (!source) throw new Error('Missing source view vi_contours');
  const view = clone(source);
  view.id = 'vi_contours_reworked';
  view.name = '1 - CURRENT / colored trust + exposure contours';
  view.rectangles = [
    rect('rc_op', -1, -1, 1, 1, 'trust-owned'),
    rect('rc_edge', 3, -1, 5, 1, 'trust-vendor'),
    rect('rc_llm_external', -1, 3, 1, 9, 'trust-exposed'),
    rect('rc_llm_local', -1, 11, 1, 13, 'trust-owned'),
    rect('rc_router', 3, 7, 5, 13, 'trust-policy'),
    rect('rc_prod', 7, -1, 13, 13, 'trust-owned'),
    rect('rc_mgmt', 15, 3, 17, 9, 'trust-management'),
    rect('rc_hands', 19, -1, 21, 5, 'trust-semitrusted'),
    rect('rc_3p', 23, -1, 29, 5, 'trust-hostile')
  ];
  view.textBoxes = [
    text('tc_op', -1, 1, 'OWNED / OPERATOR'),
    text('tc_edge', 3, 1, 'VENDOR INGRESS'),
    text('tc_llm_ext', -1, 9, 'CONTENT-EXPOSED INFERENCE', 'Y'),
    text('tc_llm_local', -1, 13, 'OWNED LOCAL INFERENCE'),
    text('tc_router', 3, 13, 'POLICY GATE :8317', 'Y'),
    text('tc_prod', 7, 13, 'OWNED CONTROL + STATE', 'Y'),
    text('tc_mgmt', 15, 9, 'PRIVATE MGMT / METADATA TRUST', 'Y'),
    text('tc_hands', 19, 5, 'SEMI-TRUSTED HANDS', 'Y'),
    text('tc_3p', 23, 5, 'HOSTILE / CONTENT-EXPOSED 3P')
  ];
  return view;
}

function reworkFleet(source) {
  if (!source) throw new Error('Missing source view vi_fleet');
  const view = clone(source);
  view.id = 'vi_fleet_reworked';
  view.name = '2 - CURRENT / fleet, lifecycle + exposure';
  view.rectangles = [
    rect('rf_scheduler', -1, -1, 1, 1, 'trust-policy'),
    rect('rf_owned', -1, 3, 1, 5, 'trust-owned'),
    rect('rf_burst', -1, 7, 1, 9, 'trust-exposed'),
    rect('rf_relay', -1, 11, 1, 13, 'trust-management'),
    rect('rf_hands', 3, 1, 5, 11, 'trust-semitrusted'),
    rect('rf_egress', 7, 1, 9, 11, 'trust-exposed'),
    rect('rf_3p', 11, 3, 13, 9, 'trust-hostile')
  ];
  view.textBoxes = [
    text('tf_scheduler', -1, 1, 'ROTATION POLICY'),
    text('tf_owned', -1, 5, 'OWNED SUBSTRATE'),
    text('tf_burst', -1, 9, 'BURST PROVIDER'),
    text('tf_relay', -1, 13, 'MGMT RELAY'),
    text('tf_hands', 5, 11, 'ACCOUNT-BOUND HANDS', 'Y'),
    text('tf_egress', 9, 11, 'PER-ACCOUNT EGRESS', 'Y'),
    text('tf_3p', 13, 9, 'UNTRUSTED WEB', 'Y')
  ];
  return view;
}

function reworkIssuers(source) {
  if (!source) throw new Error('Missing source view vi_issuers');
  const view = clone(source);
  view.id = 'vi_issuers_reworked';
  view.name = '3 - CURRENT / issuers + content exposure';
  view.rectangles = [
    rect('ri_control', -1, 3, 5, 5, 'trust-owned'),
    rect('ri_mail', -1, 7, 1, 13, 'trust-policy'),
    rect('ri_hands', 3, 7, 5, 9, 'trust-semitrusted'),
    rect('ri_3p', 7, -1, 13, 13, 'trust-hostile')
  ];
  view.textBoxes = [
    text('ti_control', -1, 5, 'ISSUER + AUTHORITY'),
    text('ti_mail', -1, 13, 'PROVIDER EGRESS VIA NYM', 'Y'),
    text('ti_hands', 3, 9, 'JOB-SCOPED HANDS'),
    text('ti_3p', 13, 13, 'PROVIDERS / TARGETS SEE CONTENT', 'Y')
  ];
  return view;
}

function buildMustTrustView() {
  const items = [
    item('mt_op', 'c_operator', 0, 4), item('mt_cf', 'c_cfaccess', 4, 4),
    item('mt_hub', 'c_hub', 8, 0), item('mt_matrix', 'c_matrix', 8, 4), item('mt_viewer', 'c_viewer', 8, 8),
    item('mt_matrixos', 'c_matrixos', 12, 0), item('mt_postgres', 'c_postgres', 12, 4),
    item('mt_hermes', 'c_hermes', 12, 8), item('mt_arctl', 'c_arctl', 12, 12), item('mt_vault', 'c_vault', 12, 16),
    item('mt_bridge', 'c_viewerbridge', 16, 0), item('mt_relay_a', 'c_relay_a', 16, 4), item('mt_relay_b', 'c_relay_b', 16, 8),
    item('mt_sidecar', 'c_sidecar', 20, 0), item('mt_identity', 'c_identity', 20, 4),
    item('mt_vulpine', 'c_vulpine', 20, 8), item('mt_android', 'c_android', 20, 12), item('mt_preflight', 'c_preflight', 20, 16),
    item('mt_proxy', 'c_ruproxy', 24, 0), item('mt_provider', 'c_providerapis', 24, 4),
    item('mt_securegpu', 'c_securegpu', 24, 8), item('mt_cloud', 'c_cloud', 24, 12),
    item('mt_checkers', 'c_checkers', 28, 0), item('mt_market', 'c_marketplace', 28, 4)
  ];
  return makeView('vi_must_trust', '4 - MUST / trust, authority + exposure', items, [
    ['op_cf', 'mt_op', 'mt_cf'], ['cf_hub', 'mt_cf', 'mt_hub'], ['hub_cp', 'mt_hub', 'mt_matrixos'],
    ['cp_db', 'mt_matrixos', 'mt_postgres'], ['cp_hermes', 'mt_matrixos', 'mt_hermes'],
    ['cp_arctl', 'mt_matrixos', 'mt_arctl'], ['cp_matrix', 'mt_matrixos', 'mt_matrix'],
    ['cp_bridge', 'mt_matrixos', 'mt_bridge'], ['viewer_bridge', 'mt_viewer', 'mt_bridge'],
    ['bridge_ra', 'mt_bridge', 'mt_relay_a'], ['bridge_rb', 'mt_bridge', 'mt_relay_b'],
    ['ra_sidecar', 'mt_relay_a', 'mt_sidecar'], ['rb_sidecar', 'mt_relay_b', 'mt_sidecar'],
    ['arctl_sidecar', 'mt_arctl', 'mt_sidecar'], ['vault_arctl', 'mt_vault', 'mt_arctl'],
    ['sidecar_identity', 'mt_sidecar', 'mt_identity'], ['identity_vulpine', 'mt_identity', 'mt_vulpine'],
    ['identity_android', 'mt_identity', 'mt_android'], ['vulpine_gate', 'mt_vulpine', 'mt_preflight'],
    ['android_gate', 'mt_android', 'mt_preflight'], ['vulpine_proxy', 'mt_vulpine', 'mt_proxy'],
    ['android_proxy', 'mt_android', 'mt_proxy'], ['proxy_checker', 'mt_proxy', 'mt_checkers'],
    ['checker_gate', 'mt_checkers', 'mt_preflight'], ['proxy_market', 'mt_proxy', 'mt_market'],
    ['arctl_provider', 'mt_arctl', 'mt_provider'], ['hermes_secure', 'mt_hermes', 'mt_securegpu'],
    ['hermes_cloud', 'mt_hermes', 'mt_cloud']
  ], [
    rect('mt_r_op', -1, 3, 1, 5, 'trust-owned'), rect('mt_r_ingress', 3, 3, 5, 5, 'trust-vendor'),
    rect('mt_r_projection', 7, -1, 9, 9, 'trust-projection'), rect('mt_r_control', 11, -1, 13, 17, 'trust-owned'),
    rect('mt_r_mgmt', 15, -1, 17, 9, 'trust-management'), rect('mt_r_hands', 19, -1, 21, 17, 'trust-semitrusted'),
    rect('mt_r_providers', 23, -1, 25, 13, 'trust-exposed'), rect('mt_r_web', 27, -1, 29, 5, 'trust-hostile')
  ], [
    text('mt_t_op', -1, 5, 'TRUSTED OPERATOR'), text('mt_t_ingress', 3, 5, 'VENDOR INGRESS'),
    text('mt_t_projection', 7, 9, 'SANITIZED PROJECTION', 'Y'), text('mt_t_control', 11, 17, 'AUTHORITY + DURABLE STATE', 'Y'),
    text('mt_t_mgmt', 15, 9, 'PRIVATE MANAGEMENT', 'Y'), text('mt_t_hands', 19, 17, 'SEMI-TRUSTED EXECUTION', 'Y'),
    text('mt_t_providers', 23, 13, 'CONTENT-EXPOSED PROVIDERS', 'Y'), text('mt_t_web', 27, 5, 'HOSTILE WEB', 'Y')
  ]);
}

function buildMustNetworkView() {
  const items = [
    item('mn_op', 'c_operator', 0, 0), item('mn_cf', 'c_cfaccess', 4, 0), item('mn_hub', 'c_hub', 8, 0), item('mn_cp', 'c_matrixos', 12, 0),
    item('mn_viewer', 'c_viewer', 0, 4), item('mn_bridge', 'c_viewerbridge', 4, 4), item('mn_ra', 'c_relay_a', 8, 4), item('mn_rb', 'c_relay_b', 12, 4), item('mn_sidecar', 'c_sidecar', 16, 4),
    item('mn_runtime_check', 'c_vulpine', 0, 8), item('mn_proxy_check', 'c_ruproxy', 4, 8), item('mn_checker', 'c_checkers', 8, 8), item('mn_gate', 'c_preflight', 12, 8),
    item('mn_runtime_live', 'c_vulpine', 16, 8), item('mn_proxy_live', 'c_ruproxy', 20, 8), item('mn_market', 'c_marketplace', 24, 8),
    item('mn_arctl', 'c_arctl', 0, 12), item('mn_nym', 'c_nymclient', 4, 12), item('mn_providers', 'c_providerapis', 8, 12),
    item('mn_hermes', 'c_hermes', 0, 16), item('mn_router', 'c_router8317', 4, 16), item('mn_macbox', 'c_macbox', 8, 16),
    item('mn_securegpu', 'c_securegpu', 12, 16), item('mn_cloud', 'c_cloud', 16, 16)
  ];
  return makeView('vi_must_network', '5 - MUST / separated network planes', items, [
    ['mn_ing_1', 'mn_op', 'mn_cf'], ['mn_ing_2', 'mn_cf', 'mn_hub'], ['mn_ing_3', 'mn_hub', 'mn_cp'],
    ['mn_mgmt_1', 'mn_viewer', 'mn_bridge'], ['mn_mgmt_2', 'mn_bridge', 'mn_ra'], ['mn_mgmt_3', 'mn_bridge', 'mn_rb'],
    ['mn_mgmt_4', 'mn_ra', 'mn_sidecar'], ['mn_mgmt_5', 'mn_rb', 'mn_sidecar'],
    ['mn_check_1', 'mn_runtime_check', 'mn_proxy_check'], ['mn_check_2', 'mn_proxy_check', 'mn_checker'],
    ['mn_check_3', 'mn_checker', 'mn_gate'], ['mn_gate_live', 'mn_gate', 'mn_runtime_live'],
    ['mn_live_1', 'mn_runtime_live', 'mn_proxy_live'], ['mn_live_2', 'mn_proxy_live', 'mn_market'],
    ['mn_provider_1', 'mn_arctl', 'mn_nym'], ['mn_provider_2', 'mn_nym', 'mn_providers'],
    ['mn_inf_1', 'mn_hermes', 'mn_router'], ['mn_inf_local', 'mn_router', 'mn_macbox'],
    ['mn_inf_secure', 'mn_router', 'mn_securegpu'], ['mn_inf_cloud', 'mn_router', 'mn_cloud']
  ], [
    rect('mn_r_ingress', -1, -1, 13, 1, 'trust-vendor'), rect('mn_r_mgmt', -1, 3, 17, 5, 'trust-management'),
    rect('mn_r_check', -1, 7, 13, 9, 'trust-semitrusted'), rect('mn_r_target', 15, 7, 25, 9, 'trust-hostile'),
    rect('mn_r_provider', -1, 11, 9, 13, 'trust-exposed'), rect('mn_r_inf_owned', -1, 15, 9, 17, 'trust-owned'),
    rect('mn_r_inf_external', 11, 15, 17, 17, 'trust-exposed')
  ], [
    text('mn_t_ing', -1, 1, 'INGRESS — ORIGIN HIDING, NOT IP BLIND'),
    text('mn_t_mgmt', -1, 5, 'MGMT — PRIVATE FORWARDS; NEVER TARGET EGRESS'),
    text('mn_t_check', -1, 9, 'SAME-BROWSER CHECK → SIGNED GATE'),
    text('mn_t_target', 15, 9, 'TARGET EGRESS — ONLY AFTER GATE'),
    text('mn_t_provider', -1, 13, 'PROVIDER / IMAP EGRESS VIA NYM'),
    text('mn_t_inf_owned', -1, 17, 'INFERENCE POLICY + OWNED LOCAL'),
    text('mn_t_inf_external', 11, 17, 'CONTENT-EXPOSED INFERENCE')
  ]);
}

function buildMustDeploymentView() {
  const items = [
    item('md_cf', 'c_cfaccess', 0, 0),
    item('md_relay_a', 'c_relay_a', 0, 4), item('md_relay_b', 'c_relay_b', 0, 8), item('md_headscale', 'c_headscale_coord', 0, 12),
    item('md_core_a', 'c_control_a', 4, 0), item('md_core_b', 'c_control_b', 4, 4),
    item('md_db_a', 'c_db_primary', 8, 0), item('md_db_b', 'c_db_backup', 8, 4), item('md_artifacts', 'c_artifact_store', 8, 8),
    item('md_hands_a', 'c_hands_a', 12, 0), item('md_hands_b', 'c_hands_b', 12, 4), item('md_burst', 'c_exedev', 12, 8),
    item('md_macbox', 'c_macbox', 4, 8), item('md_securegpu', 'c_securegpu', 16, 4), item('md_cloud', 'c_cloud', 16, 8),
    item('md_proxy', 'c_ruproxy', 20, 0), item('md_providers', 'c_providerapis', 20, 4),
    item('md_market', 'c_marketplace', 24, 0), item('md_checkers', 'c_checkers', 24, 4)
  ];
  return makeView('vi_must_deployment', '6 - MUST / concrete deployment + HA', items, [
    ['md_cf_a', 'md_cf', 'md_core_a'], ['md_cf_b', 'md_cf', 'md_core_b'],
    ['md_core_replica', 'md_core_a', 'md_core_b'], ['md_core_db', 'md_core_a', 'md_db_a'],
    ['md_db_backup', 'md_db_a', 'md_db_b'], ['md_core_artifacts', 'md_core_a', 'md_artifacts'],
    ['md_core_ra', 'md_core_a', 'md_relay_a'], ['md_core_rb', 'md_core_b', 'md_relay_b'],
    ['md_ra_ha', 'md_relay_a', 'md_hands_a'], ['md_rb_hb', 'md_relay_b', 'md_hands_b'],
    ['md_ra_burst', 'md_relay_a', 'md_burst'], ['md_rb_burst', 'md_relay_b', 'md_burst'],
    ['md_hands_a_proxy', 'md_hands_a', 'md_proxy'], ['md_hands_b_proxy', 'md_hands_b', 'md_proxy'],
    ['md_burst_proxy', 'md_burst', 'md_proxy'], ['md_proxy_market', 'md_proxy', 'md_market'],
    ['md_proxy_check', 'md_proxy', 'md_checkers'], ['md_core_local', 'md_core_a', 'md_macbox'],
    ['md_core_secure', 'md_core_a', 'md_securegpu'], ['md_core_cloud', 'md_core_a', 'md_cloud'],
    ['md_core_providers', 'md_core_a', 'md_providers']
  ], [
    rect('md_r_ingress', -1, -1, 1, 1, 'trust-vendor'), rect('md_r_mgmt', -1, 3, 1, 13, 'trust-management'),
    rect('md_r_core', 3, -1, 9, 9, 'trust-owned'), rect('md_r_hands', 11, -1, 13, 9, 'trust-semitrusted'),
    rect('md_r_ext_inf', 15, 3, 17, 9, 'trust-exposed'),
    rect('md_r_provider', 19, -1, 21, 5, 'trust-exposed'), rect('md_r_web', 23, -1, 25, 5, 'trust-hostile')
  ], [
    text('md_t_ingress', -1, 1, 'VENDOR INGRESS'), text('md_t_mgmt', -1, 13, 'BUY: 2 RELAY VPS + OPTIONAL COORDINATOR', 'Y'),
    text('md_t_core', 3, 9, 'CORE + OWNED INFERENCE + SEPARATE DB BACKUP', 'Y'),
    text('md_t_hands', 11, 9, 'BUY: 2 OWNED HANDS HOSTS (N+1) + BURST', 'Y'),
    text('md_t_external', 15, 9, 'POLICY-BOUND EXTERNAL GPU/LLM', 'Y'),
    text('md_t_provider', 19, 5, 'RESOURCE PROVIDERS', 'Y'), text('md_t_web', 23, 5, 'UNTRUSTED TARGETS', 'Y')
  ]);
}

function buildDesignDocument() {
  const content = [
    heading(1, 'AutoRecruit contours — corrected + MUST'),
    paragraph('Colors encode exposure: green owned, blue policy/projection, turquoise private management, purple external ingress, yellow content-exposed provider, orange semi-trusted Hands, red hostile web.'),
    ...VIEW_IDS.map((refId) => ({ type: 'itemReference', attrs: { refId, itemRefType: 'physicalTopology.view' } })),
    heading(2, 'Concrete capacity'),
    bullet('Two small Iroh relay VPS instances in different providers, ASNs, and preferably regions.'),
    bullet('Two control servers: authority/state owner and workers/viewer-bridge standby; no split-brain execution authority.'),
    bullet('Postgres primary plus a physically separate PITR/immutable backup target.'),
    bullet('Two owned Proxmox Hands hosts for N+1 capacity; exe.dev remains burst and fallback.'),
    bullet('Headscale coordinator is optional and serves stable owned fleet only; it is not cascaded through Iroh.'),
    heading(2, 'Non-negotiable gates'),
    bullet('Target navigation starts only after same-browser coherence evidence and signed mutation preflight.'),
    bullet('Iroh and Headscale are management paths, never target-site egress.'),
    bullet('Account Identity Capsule binds profile, proxy, mailbox, phone, locale, fingerprint seed, and resource lifecycle.'),
    bullet('Cloud and rented GPUs are content-exposed; identity-bearing prompts stay local or on explicitly approved secure compute.')
  ];
  return {
    id: 'doc_contours_must',
    itemReference: { id: 'doc_contours_must', type: 'project.document' },
    title: 'Colored contours + MUST deployment plan',
    data: { type: 'doc', content }
  };
}

function makeView(id, name, items, edges, rectangles, textBoxes) {
  return {
    id,
    name,
    items,
    rectangles,
    connectors: edges.map(([edgeId, from, to]) => connector(edgeId, from, to)),
    textBoxes
  };
}

function item(id, component, x, y) {
  return { id, component, tile: { x, y } };
}

function connector(id, from, to) {
  return {
    id,
    anchors: [
      { id: `${id}_a`, ref: { item: from } },
      { id: `${id}_b`, ref: { item: to } }
    ]
  };
}

function rect(id, x1, y1, x2, y2, color) {
  return { id, from: { x: x1, y: y1 }, to: { x: x2, y: y2 }, color };
}

function text(id, x, y, content, orientation = 'X') {
  return { id, tile: { x, y }, content, orientation, fontSize: 0.16 };
}

function heading(level, value) {
  return { type: 'heading', attrs: { level }, content: [{ type: 'text', text: value }] };
}

function paragraph(value) {
  return { type: 'paragraph', content: [{ type: 'text', text: value }] };
}

function bullet(value) {
  return { type: 'bulletList', content: [{ type: 'listItem', content: [paragraph(value)] }] };
}

function rename(componentById, id, name) {
  const component = componentById.get(id);
  if (component) component.name = name;
}

function remapExistingDocumentRefs(documents, mapping) {
  for (const document of documents?.list ?? []) walk(document.data, (node) => {
    if (node?.type === 'itemReference' && mapping[node.attrs?.refId]) {
      node.attrs.refId = mapping[node.attrs.refId];
    }
  });
}

function walk(value, visit) {
  if (!value || typeof value !== 'object') return;
  visit(value);
  for (const child of Object.values(value)) {
    if (Array.isArray(child)) child.forEach((entry) => walk(entry, visit));
    else walk(child, visit);
  }
}

function validateProject(project) {
  const components = new Set(project.physicalTopology.components.map((component) => component.id));
  const colors = new Set(project.physicalTopology.colors.map((color) => color.id));
  const views = new Set(project.physicalTopology.views.map((view) => view.id));
  for (const expected of VIEW_IDS) if (!views.has(expected)) throw new Error(`Missing view ${expected}`);
  for (const view of project.physicalTopology.views) {
    const items = new Set();
    for (const entry of view.items) {
      if (items.has(entry.id)) throw new Error(`Duplicate item ${entry.id} in ${view.id}`);
      if (!components.has(entry.component)) throw new Error(`Missing component ${entry.component}`);
      items.add(entry.id);
    }
    for (const rectangle of view.rectangles) {
      if (!colors.has(rectangle.color)) throw new Error(`Unknown color ${rectangle.color}`);
    }
    for (const edge of view.connectors) {
      for (const anchor of edge.anchors) {
        if (!items.has(anchor.ref.item)) throw new Error(`Dangling connector ${edge.id} in ${view.id}`);
      }
    }
  }
}

function clone(value) {
  return structuredClone(value);
}
