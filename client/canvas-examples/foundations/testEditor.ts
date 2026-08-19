import {
	createTLStore,
	defaultAddFontsFromNode,
	defaultBindingUtils,
	defaultShapeTools,
	defaultShapeUtils,
	defaultTools,
	Editor,
	tipTapDefaultExtensions,
	type TLAnyBindingUtilConstructor,
	type TLAnyShapeUtilConstructor,
	type TLStateNodeConstructor,
} from 'tldraw'

export class CanvasExamplesTestEditor extends Editor {
	constructor({
		tools = [],
		shapeUtils: additionalShapeUtils = [],
		bindingUtils: additionalBindingUtils = [],
		initialState = 'select',
	}: {
		tools?: TLStateNodeConstructor[]
		shapeUtils?: TLAnyShapeUtilConstructor[]
		bindingUtils?: TLAnyBindingUtilConstructor[]
		initialState?: string
	} = {}) {
		const shapeUtils = [...defaultShapeUtils, ...additionalShapeUtils]
		const bindingUtils = [...defaultBindingUtils, ...additionalBindingUtils]
		const customToolIds = new Set(tools.map((tool) => tool.id))
		const editorTools = [...defaultTools, ...defaultShapeTools]
			.filter((tool) => !customToolIds.has(tool.id))
			.concat(tools)
		super({
			shapeUtils,
			bindingUtils,
			textOptions: {
				addFontsFromNode: defaultAddFontsFromNode,
				tipTapConfig: { extensions: tipTapDefaultExtensions },
			},
			tools: editorTools,
			store: createTLStore({ shapeUtils, bindingUtils }),
			getContainer: () => document.createElement('div'),
			initialState,
		})
	}
}

export function installCanvasExamplesTestDom() {
	class FakeElement {
		constructor(
			public ownerDocument: typeof document,
			public tagName = 'div',
			public textContent = ''
		) {}

		nodeType = 1
		tabIndex = 0
		children: FakeElement[] = []
		attributes = new Map<string, string>()
		classList = { add() {}, remove() {} }
		style = {
			cssText: '',
			setProperty() {},
			removeProperty() {},
			getPropertyValue() {
				return ''
			},
		}
		private rawInnerHtml: string | null = null
		get innerHTML() {
			if (this.rawInnerHtml !== null) return this.rawInnerHtml
			return this.children
				.map((child) =>
					child.nodeType === 3
						? child.textContent
						: `<${child.tagName}>${child.innerHTML}</${child.tagName}>`
				)
				.join('')
		}
		set innerHTML(value: string) {
			this.rawInnerHtml = value
			this.children = []
		}
		get scrollWidth() {
			return this.getBoundingClientRect().width
		}
		addEventListener() {}
		removeEventListener() {}
		setAttribute(name: string, value: string) {
			this.attributes.set(name, String(value))
		}
		setAttributeNS(_namespace: string, name: string, value: string) {
			this.setAttribute(name, value)
		}
		removeAttribute(name: string) {
			this.attributes.delete(name)
		}
		appendChild(child: FakeElement) {
			this.rawInnerHtml = null
			this.children.push(child)
			return child
		}
		removeChild(child: FakeElement) {
			this.children = this.children.filter((candidate) => candidate !== child)
			return child
		}
		remove() {}
		focus() {}
		blur() {}
		contains() {
			return true
		}
		getBoundingClientRect() {
			return {
				x: 0,
				y: 0,
				top: 0,
				left: 0,
				width: 1080,
				height: 720,
				bottom: 720,
				right: 1080,
				toJSON: () => ({}),
			}
		}
	}

	const fakeDocument = {
		activeElement: null,
		body: null as unknown as FakeElement,
		documentElement: null as unknown as FakeElement,
		createElement: (tagName = 'div') =>
			new FakeElement(fakeDocument as unknown as typeof document, tagName),
		createElementNS: (_namespace: string, tagName: string) =>
			new FakeElement(fakeDocument as unknown as typeof document, tagName),
		createTextNode: (text: string) => {
			const node = new FakeElement(
				fakeDocument as unknown as typeof document,
				'#text',
				text
			)
			node.nodeType = 3
			return node
		},
		createDocumentFragment: () =>
			new FakeElement(fakeDocument as unknown as typeof document, '#fragment'),
		implementation: {
			createHTMLDocument: () => fakeDocument,
		},
	}
	const body = new FakeElement(fakeDocument as unknown as typeof document)
	fakeDocument.body = body
	fakeDocument.documentElement = body
	const requestAnimationFrame = () => 1
	const cancelAnimationFrame = () => undefined
	const previous = {
		document: Object.getOwnPropertyDescriptor(globalThis, 'document'),
		window: Object.getOwnPropertyDescriptor(globalThis, 'window'),
		navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator'),
		requestAnimationFrame: Object.getOwnPropertyDescriptor(globalThis, 'requestAnimationFrame'),
		cancelAnimationFrame: Object.getOwnPropertyDescriptor(globalThis, 'cancelAnimationFrame'),
	}
	Object.defineProperty(globalThis, 'document', { configurable: true, value: fakeDocument })
	Object.defineProperty(globalThis, 'window', {
		configurable: true,
		value: {
			document: fakeDocument,
			devicePixelRatio: 1,
			addEventListener() {},
			removeEventListener() {},
			requestAnimationFrame,
			cancelAnimationFrame,
		},
	})
	Object.defineProperty(globalThis, 'navigator', {
		configurable: true,
		value: { userAgent: 'vitest' },
	})
	Object.defineProperty(globalThis, 'requestAnimationFrame', {
		configurable: true,
		value: requestAnimationFrame,
	})
	Object.defineProperty(globalThis, 'cancelAnimationFrame', {
		configurable: true,
		value: cancelAnimationFrame,
	})

	return () => {
		for (const [key, descriptor] of Object.entries(previous)) {
			if (descriptor) Object.defineProperty(globalThis, key, descriptor)
			else delete (globalThis as Record<string, unknown>)[key]
		}
	}
}
