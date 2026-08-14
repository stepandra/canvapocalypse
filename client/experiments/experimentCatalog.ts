export const LEAD_EXPERIMENT_CATALOG_VERSION = 'lead-acquisition/v1' as const

export type LeadExperimentPhase =
	| 'DISCOVER'
	| 'QUALIFY'
	| 'ACQUIRE'
	| 'ENGAGE'
	| 'HANDOFF'
	| 'CLOSE'

export interface ExperimentSchematicNode {
	id: string
	label: string
	x: number
	y: number
	tone: 'cyan' | 'violet' | 'amber' | 'green' | 'red'
}

export interface ExperimentSchematicEdge {
	from: string
	to: string
}

export interface LeadAcquisitionExperiment {
	id: string
	sequence: number
	phase: LeadExperimentPhase
	title: string
	subtitle: string
	hypothesis: string
	method: string
	successMetric: string
	guardrail: string
	schematic: {
		nodes: ExperimentSchematicNode[]
		edges: ExperimentSchematicEdge[]
	}
}

function linearSchematic(
	labels: string[],
	tones: ExperimentSchematicNode['tone'][] = ['cyan', 'violet', 'amber', 'green']
) {
	const width = 420
	const margin = 36
	const step = (width - margin * 2) / Math.max(1, labels.length - 1)
	const nodes = labels.map((label, index) => ({
		id: `n${index}`,
		label,
		x: margin + index * step,
		y: index % 2 === 0 ? 58 : 102,
		tone: tones[index % tones.length],
	}))
	return {
		nodes,
		edges: nodes.slice(1).map((node, index) => ({ from: nodes[index].id, to: node.id })),
	}
}

export const LEAD_ACQUISITION_EXPERIMENTS: readonly LeadAcquisitionExperiment[] = [
	{
		id: 'intent-search-sweep', sequence: 1, phase: 'DISCOVER', title: 'Intent Search Sweep',
		subtitle: 'SearXNG query families → explicit demand',
		hypothesis: 'Свежие формулировки проблемы дают более качественных лидов, чем поиск по должностям и профилям.',
		method: 'Запустить несколько query families: «ищу», «нужна помощь», deadline, budget, recommendation. Нормализовать и дедуплицировать результаты.',
		successMetric: 'Доля результатов с подтверждаемой потребностью и разрешённым способом ответа.',
		guardrail: 'Только публичные источники; не собирать чувствительные данные и не обходить ограничения площадок.',
		schematic: linearSchematic(['QUERY SET', 'SEARXNG', 'DEDUPE', 'SIGNALS']),
	},
	{
		id: 'marketplace-demand-scan', sequence: 2, phase: 'DISCOVER', title: 'Marketplace Demand Scan',
		subtitle: 'YouDo / services boards / niche marketplaces',
		hypothesis: 'Existing demand listings конвертируются лучше, чем публикация ещё одного generic TaskBrief.',
		method: 'Снимать bounded snapshot активных заданий, фильтровать по гео, сроку, бюджету и соответствию offer.',
		successMetric: 'Qualified candidates на одну просмотренную страницу и время до первого релевантного ответа.',
		guardrail: 'Соблюдать platform ToS, rate limits и разрешённые способы контакта.',
		schematic: linearSchematic(['BOARDS', 'FILTER', 'EVIDENCE', 'CANDIDATES']),
	},
	{
		id: 'indirect-signal-mining', sequence: 3, phase: 'DISCOVER', title: 'Indirect Signal Mining',
		subtitle: 'Posts, comments, referrals and adjacent conversations',
		hypothesis: 'Косвенные сигналы проблемы обнаруживают лид раньше, чем он публикует формальный запрос.',
		method: 'Искать обсуждения симптомов, запросы рекомендаций, упоминания deadline и неудачных попыток решения.',
		successMetric: 'Доля сигналов, после которых подтверждается реальная потребность.',
		guardrail: 'Не превращать публичный контекст в скрытое психологическое досье.',
		schematic: linearSchematic(['MENTIONS', 'CONTEXT', 'LINK', 'LEAD?']),
	},
	{
		id: 'persona-panel-calibration', sequence: 4, phase: 'QUALIFY', title: 'Persona Panel Calibration',
		subtitle: 'Advisory hypotheses, never labels',
		hypothesis: 'Набор поведенческих persona-гипотез улучшит выбор следующего действия, если калибровать его реальными outcomes.',
		method: 'Оценивать каждый содержательный signal панелью persona fixtures; сохранять vector, confidence и evidence refs.',
		successMetric: 'Calibration error между ожидаемым и фактическим reply / consent / close.',
		guardrail: 'source_of_truth=false; никаких диагнозов, защищённых признаков или эксплуатации уязвимостей.',
		schematic: linearSchematic(['SIGNAL', 'PERSONAS', 'VECTOR', 'CALIBRATE']),
	},
	{
		id: 'qualification-rubric', sequence: 5, phase: 'QUALIFY', title: 'Qualification Rubric',
		subtitle: 'Need × fit × timing × reachability',
		hypothesis: 'Evidence-backed multi-axis qualification уменьшит ложные лиды лучше единого opaque score.',
		method: 'Отдельно оценивать need evidence, offer fit, timing, authority, reachability и confidence.',
		successMetric: 'Precision qualified leads по фактическим содержательным ответам и коммерческим outcomes.',
		guardrail: 'Каждый score обязан ссылаться на наблюдаемый evidence; неизвестное не считать отрицательным.',
		schematic: linearSchematic(['EVIDENCE', 'RUBRIC', 'CONFIDENCE', 'QUEUE']),
	},
	{
		id: 'taskbrief-inbound', sequence: 6, phase: 'ACQUIRE', title: 'TaskBrief Inbound',
		subtitle: 'TaskBrief becomes one acquisition action',
		hypothesis: 'Узкий правдивый TaskBrief для одного сегмента даст полезный inbound, но не должен быть единственным каналом.',
		method: 'Сгенерировать варианты под конкретную площадку, persona panel и offer; публиковать только прошедший policy check.',
		successMetric: 'Qualified inbound responses на публикацию, не просмотры и не syntactic brief quality.',
		guardrail: 'Без вымышленных claims, fake urgency и скрытого переноса контакта с площадки.',
		schematic: linearSchematic(['MISSION', 'TASKBRIEF', 'PLATFORM', 'INBOUND']),
	},
	{
		id: 'public-reply', sequence: 7, phase: 'ENGAGE', title: 'Relevant Public Reply',
		subtitle: 'Useful first contact in the source context',
		hypothesis: 'Короткий релевантный публичный ответ создаёт больше доверия, чем немедленный unsolicited DM.',
		method: 'Ответить по существу проблемы, обозначить offer и задать один квалифицирующий вопрос.',
		successMetric: 'Содержательные ответы и добровольное продолжение диалога.',
		guardrail: 'Не раскрывать найденные личные сведения и не давить на срочность.',
		schematic: linearSchematic(['SIGNAL', 'DRAFT', 'APPROVE', 'REPLY']),
	},
	{
		id: 'permissioned-direct-contact', sequence: 8, phase: 'ENGAGE', title: 'Permissioned Direct Contact',
		subtitle: 'Private outreach only where expected or invited',
		hypothesis: 'Контекстный direct contact после разрешающего сигнала даст высокий reply rate без spam-паттерна.',
		method: 'Контактировать только при явном приглашении, platform affordance или предыдущем содержательном ответе.',
		successMetric: 'Meaningful reply rate, opt-out rate и количество policy blocks.',
		guardrail: 'Human approval до отправки; do-not-contact и cooldown имеют приоритет над utility score.',
		schematic: linearSchematic(['PERMISSION', 'CONTEXT', 'APPROVAL', 'MESSAGE']),
	},
	{
		id: 'referral-intro', sequence: 9, phase: 'ACQUIRE', title: 'Referral / Intro Path',
		subtitle: 'Trust-bearing graph edges',
		hypothesis: 'Тёплое интро от релевантного посредника повышает trust и qualification precision.',
		method: 'Искать не личные данные, а допустимые отношения: публичные сообщества, знакомые контакты, открытые referral paths.',
		successMetric: 'Accepted introductions и qualified conversations на запрос интро.',
		guardrail: 'Не изображать знакомство и не использовать имя посредника без его согласия.',
		schematic: linearSchematic(['SOURCE', 'INTRO PATH', 'CONSENT', 'LEAD']),
	},
	{
		id: 'message-framing-ab', sequence: 10, phase: 'ENGAGE', title: 'Message Framing A/B',
		subtitle: 'Controlled probes, one factor at a time',
		hypothesis: 'Правдоподобная broad-bridge формулировка обойдёт persona cosplay и переоптимизированные сообщения.',
		method: 'Менять по одному фактору: proof, brevity, question, channel framing. Сначала persona simulation, затем маленькая реальная проба.',
		successMetric: 'Lift содержательного reply и qualification без роста opt-out.',
		guardrail: 'Запрещены fake scarcity, ложные claims и адаптация под предполагаемые уязвимости.',
		schematic: linearSchematic(['BASELINE', 'VARIANTS', 'REAL PROBE', 'OUTCOME']),
	},
	{
		id: 'secure-channel-handoff', sequence: 11, phase: 'HANDOFF', title: 'Secure Channel Handoff',
		subtitle: 'Response → purpose → explicit consent → transfer',
		hypothesis: 'Объяснённый и permissioned handoff повышает completion и не разрушает доверие.',
		method: 'После содержательного ответа объяснить цель перехода, предложить варианты и зафиксировать явное согласие.',
		successMetric: 'Consented handoffs, completed transfers и продолженные conversations.',
		guardrail: 'Не обходить правила исходной площадки; не переносить лишний контекст и credentials.',
		schematic: linearSchematic(['RESPONSE', 'PURPOSE', 'CONSENT', 'SECURE']),
	},
	{
		id: 'close-offer-calibration', sequence: 12, phase: 'CLOSE', title: 'Close / Offer Calibration',
		subtitle: 'Verifiable commercial outcome, not persuasion score',
		hypothesis: 'Явные close criteria и outcome feedback позволят калибровать весь upstream pipeline.',
		method: 'Сравнить offer framing, next-step size и human handoff timing; записывать won/lost/nurture с причиной.',
		successMetric: 'Verified commitments, paid/papered outcomes и корректная calibration предыдущих score snapshots.',
		guardrail: 'Финальное предложение прозрачно; отказ завершает автоматическое давление и включает cooldown.',
		schematic: linearSchematic(['QUALIFIED', 'OFFER', 'HUMAN', 'OUTCOME']),
	},
] as const

export function getLeadExperiment(id: string) {
	return LEAD_ACQUISITION_EXPERIMENTS.find((experiment) => experiment.id === id)
}
