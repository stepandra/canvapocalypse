export const AUTORECRUIT_ICON_COLLECTION = 'AutoRecruit';

export const AUTORECRUIT_ICONS = Object.freeze([
  createIcon('arctl', 'arctl'),
  createIcon('arctl-sidecar', 'arctl sidecar'),
  createIcon('ar-hands', 'ar-hands'),
  createIcon('browser-hands', 'Browser Hands'),
  createIcon('browser-viewer', 'Browser Viewer'),
  createIcon('command-center', 'Command Center'),
  createIcon('llm-gateway', 'LLM Gateway'),
  createIcon('evaluation-lab', 'Evaluation Lab'),
  createIcon('independent-oracle-review', 'Independent Oracle Review'),
  createIcon('operator-approval', 'Operator Approval'),
  createIcon('signed-platform-tier-gate', 'Signed Platform-Tier Gate'),
  createIcon('gpu-model-job', 'GPU Model Job'),
]);

export function includeAutorecruitIcons(icons = []) {
  const customIds = new Set(AUTORECRUIT_ICONS.map(({ id }) => id));
  return [
    ...icons.filter(({ id }) => !customIds.has(id)),
    ...AUTORECRUIT_ICONS.map((icon) => ({ ...icon })),
  ];
}

function createIcon(slug, name) {
  return Object.freeze({
    id: `autorecruit:${slug}`,
    name,
    url: `/isoflow-icons/autorecruit/${slug}.png`,
    collection: AUTORECRUIT_ICON_COLLECTION,
    isIsometric: true,
  });
}
