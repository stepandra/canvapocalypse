const PRODUCT_TEMPLATE_HANDOFFS = [
	'product-roadmap',
	'delivery-timeline',
	'opportunity-decision',
	'opportunity-solution-tree',
	'impact-map',
	'service-blueprint',
] as const

export const PRODUCT_CREATIVE_IDEATION_METHODS = [
	'Rapid association for breadth',
	'First-principles reconstruction for a stronger underlying model',
	'Constraint removal for a bolder direction',
	'Opposite-day inversion for non-obvious alternatives',
	'Analogy transfer from a distant but structurally similar domain',
] as const

export function buildProductCreativeIdeationPrompt({
	selectedShapeCount,
}: {
	selectedShapeCount: number
}) {
	const contextLabel =
		selectedShapeCount > 0
			? `${selectedShapeCount} explicitly selected canvas shape${selectedShapeCount === 1 ? '' : 's'}`
			: 'the bounded visible canvas area'

	return [
		'Run the Product Creative Ideation skill on the supplied canvas context.',
		`The authorized context is ${contextLabel}; do not inspect or infer anything outside it.`,
		'',
		'Work as a product-thinking facilitator, not as a diagram generator yet:',
		'1. State the core opportunity, intended user outcome, and the two most important unknowns.',
		`2. Generate exactly five genuinely distinct directions, one through each method: ${PRODUCT_CREATIVE_IDEATION_METHODS.join('; ')}.`,
		'3. For every direction give: a short name, the product thesis, who benefits, the riskiest assumption, one fast evidence probe, and the key trade-off.',
		'4. Cluster overlapping directions, then recommend the best two while explaining why they remain meaningfully different.',
		`5. For each recommendation choose one diagram handoff from this exact native-template allowlist: ${PRODUCT_TEMPLATE_HANDOFFS.join(', ')}.`,
		'6. End with a brief invitation to choose a direction by name or ask for a hybrid. Keep the result concise and scannable.',
		'',
		'Do not create, update, delete, move, or restyle canvas shapes in this turn. Do not insert a template automatically. The user must choose or refine a direction first; the chosen existing native template or normal canvas mutation flow is the next step.',
	].join('\n')
}

export const PRODUCT_CREATIVE_IDEATION_USER_MESSAGE =
	'Creative ideation · explore product directions without changing the canvas'
