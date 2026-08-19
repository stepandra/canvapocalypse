import { Editor, TLBinding, TLBindingCreate, TLCreateShapePartial, TLPageId, TLShape, TLShapeId } from 'tldraw'
import { describe, expect, it } from 'vitest'
import { summarizeWorkbenchMeta } from '../parts/WorkbenchArtifactsPartUtil'
import {
	ARCHITECTURE_BOUNDARY_SHAPE_TYPE,
	ARCHITECTURE_DIAGRAM_SURFACE_SHAPE_TYPE,
	ARCHITECTURE_RELATION_LABEL_SHAPE_TYPE,
	ARCHITECTURE_SERVICE_SHAPE_TYPE,
} from './architecture/ArchitectureDiagramShapes'
import { WORKBENCH_DOMAIN_PACKS, WORKBENCH_DOMAINS } from './domainPacks'
import {
	buildWorkbenchTemplateRenderPlan,
	getWorkbenchTemplateSource,
	insertWorkbenchTemplate,
	WORKBENCH_NATIVE_SHAPE_SCHEMA,
} from './workbenchCanvas'

const TEST_DATE = '2026-07-27'
const TEST_PAGE_ID = 'page:workbench-test' as TLPageId

describe('Workbench native template render plans', () => {
	it('materializes every pack template as native shapes with bound arrows', () => {
		for (const pack of WORKBENCH_DOMAINS) {
			for (const template of WORKBENCH_DOMAIN_PACKS[pack].templates) {
				const instanceId = `test-${pack}-${template.id}`
				const source = getWorkbenchTemplateSource(pack, template.id, TEST_DATE)
				const plan = buildWorkbenchTemplateRenderPlan({
					pack,
					templateId: template.id,
					instanceId,
					center: { x: 1800, y: 1200 },
					parentId: TEST_PAGE_ID,
					today: TEST_DATE,
				})

				const relationLabelCount =
					pack === 'architecture'
						? source.relations.filter((relation) => relation.text).length
						: 0
				expect(plan.shapes.length).toBe(
					source.nodes.length + source.relations.length + relationLabelCount
				)
				expect(plan.bindings).toHaveLength(source.relations.length * 2)
				expect(new Set(plan.shapeIds).size).toBe(plan.shapeIds.length)
				expect(new Set(plan.bindingIds).size).toBe(plan.bindingIds.length)

				for (const shape of plan.shapes) {
					expect(shape.id).toMatch(new RegExp(`^shape:${instanceId}-`))
					expect([
						'geo',
						'note',
						'text',
						'frame',
						'arrow',
						ARCHITECTURE_DIAGRAM_SURFACE_SHAPE_TYPE,
						ARCHITECTURE_BOUNDARY_SHAPE_TYPE,
						ARCHITECTURE_RELATION_LABEL_SHAPE_TYPE,
						ARCHITECTURE_SERVICE_SHAPE_TYPE,
					]).toContain(shape.type)
					expect(['image', 'embed', 'bookmark', 'video']).not.toContain(shape.type)

					const metadata = shape.meta as {
						workbench: {
							schema: string
							instanceId: string
							pack: string
							templateId: string
							artifact?: { artifactId: string }
							relation?: {
								relationId: string
								start: { artifactId: string; shapeId: string }
								end: { artifactId: string; shapeId: string }
							}
						}
					}
					expect(Object.keys(metadata)).toEqual(['workbench'])
					expect(metadata.workbench.schema).toBe(WORKBENCH_NATIVE_SHAPE_SCHEMA)
					expect(metadata.workbench.instanceId).toBe(instanceId)
					expect(metadata.workbench.pack).toBe(pack)
					expect(metadata.workbench.templateId).toBe(template.id)
					const serializedMetadata = JSON.stringify(metadata)
					expect(serializedMetadata.length, `${pack}/${template.id}/${shape.id}: ${serializedMetadata}`).toBeLessThan(
						600
					)
					const semantic = summarizeWorkbenchMeta(metadata)
					expect(semantic).not.toBeNull()
					if (shape.type === 'arrow') {
						expect(semantic?.relation?.relationId).toBe(metadata.workbench.relation?.relationId)
						expect(semantic?.relation?.start?.shapeId).toBe(metadata.workbench.relation?.start.shapeId)
						expect(semantic?.relation?.end?.shapeId).toBe(metadata.workbench.relation?.end.shapeId)
						expect(plan.shapeIds).toContain(metadata.workbench.relation?.start.shapeId)
						expect(plan.shapeIds).toContain(metadata.workbench.relation?.end.shapeId)
					} else {
						expect(semantic?.artifact?.artifactId).toBe(metadata.workbench.artifact?.artifactId)
						expect(semantic?.artifact?.pack).toBe(pack)
						expect(semantic?.artifact?.templateId).toBe(template.id)
					}
				}

				const arrowIds = new Set(
					plan.shapes.filter((shape) => shape.type === 'arrow').map((shape) => shape.id as TLShapeId)
				)
				expect(arrowIds.size).toBe(source.relations.length)
				for (const arrowId of arrowIds) {
					const arrowBindings = plan.bindings.filter((binding) => binding.fromId === arrowId)
					expect(arrowBindings.map((binding) => binding.props?.terminal).sort()).toEqual(['end', 'start'])
					for (const binding of arrowBindings) {
						expect(plan.shapeIds).toContain(binding.toId)
						expect(binding.toId).not.toBe(arrowId)
					}
				}
			}
		}
	})

	it('prefixes each insertion so duplicate templates never share record ids', () => {
		const common = {
			pack: 'architecture' as const,
			templateId: 'decision-graph',
			center: { x: 900, y: 700 },
			parentId: TEST_PAGE_ID,
			today: TEST_DATE,
		}
		const first = buildWorkbenchTemplateRenderPlan({
			...common,
			instanceId: 'decision-copy-a',
		})
		const second = buildWorkbenchTemplateRenderPlan({
			...common,
			instanceId: 'decision-copy-b',
		})

		expect(first.shapeIds.some((id) => second.shapeIds.includes(id))).toBe(false)
		expect(first.bindingIds.some((id) => second.bindingIds.includes(id))).toBe(false)
	})

	it.each(['architecture', 'product'] as const)(
		'adds a semantic visual hierarchy and edge-bound routing to %s diagrams',
		(pack) => {
			const templateId =
				pack === 'architecture' ? 'system-context' : 'opportunity-decision'
			const source = getWorkbenchTemplateSource(pack, templateId, TEST_DATE)
			const plan = buildWorkbenchTemplateRenderPlan({
				pack,
				templateId,
				instanceId: `visual-grammar-${pack}`,
				center: { x: 1200, y: 900 },
				parentId: TEST_PAGE_ID,
				today: TEST_DATE,
			})

			expect(source.nodes.some((node) => node.artifactRole === 'heading')).toBe(true)
			if (pack === 'architecture') {
				expect(source.nodes.filter((node) => node.primitive === 'architecture-surface')).toHaveLength(1)
				expect(plan.shapes.filter((shape) => shape.type === ARCHITECTURE_DIAGRAM_SURFACE_SHAPE_TYPE)).toHaveLength(1)
				expect(plan.shapes.some((shape) => shape.type === 'geo')).toBe(false)
			} else {
				expect(source.nodes.some((node) => node.artifactRole === 'annotation')).toBe(true)
			}
			expect(source.nodes.some((node) => node.artifactRole === 'legend')).toBe(false)
			expect(source.nodes.some((node) => node.geometry.y >= source.bounds.h)).toBe(false)

			const firstForegroundNode = plan.shapes.findIndex(
				(shape) =>
					shape.type !== 'frame' &&
					shape.type !== 'arrow' &&
					shape.type !== ARCHITECTURE_DIAGRAM_SURFACE_SHAPE_TYPE &&
					shape.type !== ARCHITECTURE_BOUNDARY_SHAPE_TYPE
			)
			const lastArrow = plan.shapes.map((shape) => shape.type === 'arrow').lastIndexOf(true)
			expect(lastArrow).toBeLessThan(firstForegroundNode)
			for (const binding of plan.bindings) {
				expect(binding.props?.isPrecise).toBe(false)
				expect(binding.props?.normalizedAnchor).toEqual({ x: 0.5, y: 0.5 })
			}
		}
	)

	it('keeps the Product roadmap concise and uses placement for implied chronology', () => {
		const source = getWorkbenchTemplateSource(
			'product',
			'product-roadmap',
			TEST_DATE
		)
		const productNodes = source.nodes.filter(
			(node) =>
				node.artifactRole !== 'heading' &&
				node.artifactRole !== 'annotation' &&
				node.primitive !== 'frame'
		)

		expect(
			source.nodes
				.filter((node) => node.artifactKind === 'diagram-phase')
				.map((node) => node.text)
		).toEqual(['Now', 'Next', 'Later'])
		expect(productNodes.every((node) => !node.text.includes('\n'))).toBe(true)
		expect(productNodes.every((node) => node.text.length <= 32)).toBe(true)
		expect(
			productNodes.find((node) => node.artifactTitle === 'Pilot ready')?.text
		).toBe('Pilot')
		expect(new Set(source.relations.map((relation) => relation.relationType))).toEqual(
			new Set(['blocks', 'decided-by'])
		)
	})

	it('reparents UI/UX children to the generated frame and converts coordinates to frame-local', () => {
		const source = getWorkbenchTemplateSource('uiux', 'wireframe-screen-set', TEST_DATE)
		const plan = buildWorkbenchTemplateRenderPlan({
			pack: 'uiux',
			templateId: 'wireframe-screen-set',
			instanceId: 'uiux-frame-test',
			center: { x: 1200, y: 900 },
			parentId: TEST_PAGE_ID,
			today: TEST_DATE,
		})
		const shapeByArtifact = new Map(
			plan.shapes.map((shape) => [
				(shape.meta as { workbench: { artifact?: { artifactId?: string } } }).workbench.artifact?.artifactId,
				shape,
			])
		)
		const child = source.nodes.find((node) => node.parentLogicalShapeId)
		expect(child).toBeDefined()
		if (!child?.parentLogicalShapeId) return

		const parent = source.nodes.find((node) => node.logicalShapeId === child.parentLogicalShapeId)
		expect(parent?.primitive).toBe('frame')
		if (!parent) return

		const renderedChild = shapeByArtifact.get(child.artifactRef)
		const renderedParent = shapeByArtifact.get(parent.artifactRef)
		expect(renderedParent?.type).toBe('frame')
		expect(renderedChild?.parentId).toBe(renderedParent?.id)
		expect(renderedChild?.x).toBe(child.geometry.x - parent.geometry.x)
		expect(renderedChild?.y).toBe(child.geometry.y - parent.geometry.y)
	})

	it.each([
		['product', 'impact-map'],
		['product', 'service-blueprint'],
	] as const)('uses native frames as semantic containers in %s/%s', (pack, templateId) => {
		const source = getWorkbenchTemplateSource(pack, templateId, TEST_DATE)
		const frameIds = new Set(
			source.nodes.filter((node) => node.primitive === 'frame').map((node) => node.logicalShapeId)
		)
		const children = source.nodes.filter((node) => node.parentLogicalShapeId)

		expect(frameIds.size).toBeGreaterThan(0)
		expect(children.length).toBeGreaterThan(0)
		expect(children.every((node) => frameIds.has(node.parentLogicalShapeId!))).toBe(true)
	})

	it('uses custom diagram, boundary, and service records for Architecture while preserving logical containment', () => {
		const source = getWorkbenchTemplateSource('architecture', 'c4-container', TEST_DATE)
		const plan = buildWorkbenchTemplateRenderPlan({
			pack: 'architecture',
			templateId: 'c4-container',
			instanceId: 'architecture-custom-shapes',
			center: { x: 1200, y: 900 },
			parentId: TEST_PAGE_ID,
			today: TEST_DATE,
		})
		const boundaryIds = new Set(
			source.nodes
				.filter((node) => node.primitive === 'architecture-boundary')
				.map((node) => node.logicalShapeId)
		)
		const containedNodes = source.nodes.filter((node) => node.parentLogicalShapeId)

		expect(plan.shapes.map((shape) => shape.type)).toEqual(
			expect.arrayContaining([
				ARCHITECTURE_DIAGRAM_SURFACE_SHAPE_TYPE,
				ARCHITECTURE_BOUNDARY_SHAPE_TYPE,
				ARCHITECTURE_RELATION_LABEL_SHAPE_TYPE,
				ARCHITECTURE_SERVICE_SHAPE_TYPE,
			])
		)
		expect(containedNodes.length).toBeGreaterThan(0)
		expect(containedNodes.every((node) => boundaryIds.has(node.parentLogicalShapeId!))).toBe(true)
		expect(
			plan.shapes
				.filter((shape) => shape.type === ARCHITECTURE_SERVICE_SHAPE_TYPE)
				.every((shape) => shape.parentId === TEST_PAGE_ID)
		).toBe(true)
		const webApplication = plan.shapes.find(
			(shape) =>
				shape.type === ARCHITECTURE_SERVICE_SHAPE_TYPE &&
				(shape.meta as { workbench: { artifact?: { artifactId?: string } } }).workbench.artifact?.artifactId ===
					'c4-container:web-app'
		)
		expect(webApplication?.props).toMatchObject({
			category: 'frontend',
			title: 'Web application',
			subtitle: '[Container: browser]',
		})
		const externalProvider = plan.shapes.find(
			(shape) =>
				shape.type === ARCHITECTURE_SERVICE_SHAPE_TYPE &&
				(shape.meta as { workbench: { artifact?: { artifactId?: string } } }).workbench.artifact?.artifactId ===
					'c4-container:external-provider'
		)
		expect(externalProvider?.props).toMatchObject({
			category: 'external',
			title: 'External provider',
		})
		const relationLabels = plan.shapes.filter(
			(shape) => shape.type === ARCHITECTURE_RELATION_LABEL_SHAPE_TYPE
		)
		expect(relationLabels).toHaveLength(source.relations.length)
		expect(relationLabels.map((shape) => shape.props.text)).toEqual(
			expect.arrayContaining(['Uses', 'HTTPS', 'SQL', 'Schedules', 'Reads', 'API'])
		)
		for (const arrow of plan.shapes.filter((shape) => shape.type === 'arrow')) {
			expect(JSON.stringify(arrow.props.richText)).not.toMatch(
				/Uses|HTTPS|SQL|Schedules|Reads|API/
			)
		}
	})

	it('rejects mismatched template and pack pairs before creating a render plan', () => {
		expect(() =>
			buildWorkbenchTemplateRenderPlan({
				pack: 'ml',
				templateId: 'system-context',
				instanceId: 'wrong-pack',
				center: { x: 0, y: 0 },
				parentId: TEST_PAGE_ID,
				today: TEST_DATE,
			})
		).toThrow(/does not belong to ml/)
	})

	it('attaches branch lineage and materializes branch names in decision variants', () => {
		const plan = buildWorkbenchTemplateRenderPlan({
			pack: 'architecture',
			templateId: 'decision-graph',
			instanceId: 'branch-comparison',
			center: { x: 900, y: 700 },
			parentId: TEST_PAGE_ID,
			conversation: {
				branchId: 'branch:alternative',
				branchName: 'Alternative',
				parentBranchId: 'branch:main',
				parentTurnId: 'turn:2',
				comparedBranchId: 'branch:main',
				comparedBranchName: 'Main',
			},
			nodeText: {
				'decision-graph:option-a': 'Main\nBase alternative',
				'decision-graph:option-b': 'Alternative\nForked alternative',
			},
		})

		for (const shape of plan.shapes) {
			expect((shape.meta as { workbench: { conversation?: unknown } }).workbench.conversation).toEqual({
				branchId: 'branch:alternative',
				branchName: 'Alternative',
				parentBranchId: 'branch:main',
				parentTurnId: 'turn:2',
				comparedBranchId: 'branch:main',
				comparedBranchName: 'Main',
			})
		}
		const serialized = JSON.stringify(plan.shapes)
		expect(serialized).toContain('Base alternative')
		expect(serialized).toContain('Forked alternative')
		expect(serialized).toContain('ADR outcome')
	})
})

describe('Workbench template editor transaction', () => {
	it('validates the target page before starting an editor transaction', () => {
		let runCount = 0
		const editor = {
			getCurrentPageId: () => TEST_PAGE_ID,
			getPage: () => undefined,
			run: () => {
				runCount += 1
			},
		} as unknown as Editor

		expect(() =>
			insertWorkbenchTemplate(editor, 'architecture', 'system-context', {
				pageId: TEST_PAGE_ID,
				point: { x: 100, y: 100 },
			})
		).toThrow(/page page:workbench-test does not exist/)
		expect(runCount).toBe(0)
	})

	it('creates shapes and bindings in one editor transaction, verifies them, and selects the result', () => {
		const shapes = new Map<TLShapeId, TLCreateShapePartial<TLShape>>()
		const bindings = new Map<string, TLBindingCreate<TLBinding>>()
		let runCount = 0
		let selected: TLShapeId[] = []
		let historyLabel = ''
		let zoomRequest: { bounds: unknown; options: unknown } | undefined

		const editor = {
			options: { animationMediumMs: 320 },
			getViewportPageBounds: () => ({ center: { x: 1000, y: 800 } }),
			getCurrentPageId: () => TEST_PAGE_ID,
			getPage: (pageId: TLPageId) => (pageId === TEST_PAGE_ID ? { id: TEST_PAGE_ID } : undefined),
			markHistoryStoppingPoint: (label: string) => {
				historyLabel = label
			},
			run: (operation: () => void) => {
				runCount += 1
				operation()
			},
			createShapes: (partials: TLCreateShapePartial<TLShape>[]) => {
				for (const partial of partials) {
					if (partial.id) shapes.set(partial.id, partial)
				}
			},
			getShape: (id: TLShapeId) => shapes.get(id),
			createBindings: (partials: TLBindingCreate<TLBinding>[]) => {
				for (const partial of partials) {
					if (partial.id) bindings.set(partial.id, partial)
				}
			},
			getBinding: (id: string) => bindings.get(id),
			setSelectedShapes: (ids: TLShapeId[]) => {
				selected = [...ids]
			},
			zoomToBounds: (bounds: unknown, options: unknown) => {
				zoomRequest = { bounds, options }
			},
		} as unknown as Editor

		const receipt = insertWorkbenchTemplate(editor, 'architecture', 'system-context', {
			instanceId: 'mock-editor-insert',
			today: TEST_DATE,
		})

		expect(runCount).toBe(1)
		expect(historyLabel).toBe('Create System Context')
		expect([...shapes.keys()]).toEqual(receipt.shapeIds)
		expect([...bindings.keys()]).toEqual(receipt.bindingIds)
		expect(selected).toEqual(receipt.shapeIds)
		const source = getWorkbenchTemplateSource('architecture', 'system-context', TEST_DATE)
		expect(zoomRequest).toEqual({
			bounds: {
				x: 1000 - source.bounds.w / 2,
				y: 800 - source.bounds.h / 2,
				w: source.bounds.w,
				h: source.bounds.h,
			},
			options: { inset: 240, animation: { duration: 320 } },
		})
		expect(receipt.bindingIds).toHaveLength([...shapes.values()].filter((shape) => shape.type === 'arrow').length * 2)
		for (const binding of bindings.values()) {
			expect(binding.type).toBe('arrow')
			expect(shapes.get(binding.fromId)?.type).toBe('arrow')
			expect(shapes.has(binding.toId)).toBe(true)
		}
		for (const shape of shapes.values()) {
			if (shape.parentId === TEST_PAGE_ID) continue
			expect(shapes.get(shape.parentId as TLShapeId)?.type).toBe('frame')
		}
	})
})
