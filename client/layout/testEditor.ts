import { Driver } from '@tldraw/driver'
import {
	createTLStore,
	defaultBindingUtils,
	defaultShapeTools,
	defaultShapeUtils,
	defaultTools,
	Editor,
	registerDefaultSideEffects,
} from 'tldraw'
import {
	CONSTRAINT_LAYOUT_BINDING_UTILS,
	CONSTRAINT_LAYOUT_SHAPE_UTILS,
	mountConstraintLayout,
} from './binding'
import { FLEX_LAYOUT_SHAPE_UTILS, mountFlexLayout } from './flex'

export class LayoutTestEditor extends Editor {
	readonly controller: Driver
	private disposeConstraintLayout: (() => void) | undefined
	private disposeFlexLayout: (() => void) | undefined
	private disposeDefaultSideEffects: (() => void) | undefined

	constructor() {
		const shapeUtils = [
			...defaultShapeUtils,
			...FLEX_LAYOUT_SHAPE_UTILS,
			...CONSTRAINT_LAYOUT_SHAPE_UTILS,
		]
		const bindingUtils = [...defaultBindingUtils, ...CONSTRAINT_LAYOUT_BINDING_UTILS]
		super({
			shapeUtils,
			bindingUtils,
			tools: [...defaultTools, ...defaultShapeTools],
			textOptions: {},
			store: createTLStore({ shapeUtils, bindingUtils }),
			getContainer: () => document.createElement('div'),
			initialState: 'select',
		})
		this.controller = new Driver(this)
		this.disposeDefaultSideEffects = registerDefaultSideEffects(this)
		this.disposeFlexLayout = mountFlexLayout(this)
		this.disposeConstraintLayout = mountConstraintLayout(this)
	}

	pointerMove(...args: Parameters<Driver['pointerMove']>) {
		this.controller.pointerMove(...args)
		return this
	}

	pointerDown(...args: Parameters<Driver['pointerDown']>) {
		this.controller.pointerDown(...args)
		return this
	}

	pointerUp(...args: Parameters<Driver['pointerUp']>) {
		this.controller.pointerUp(...args)
		return this
	}

	override dispose() {
		this.disposeConstraintLayout?.()
		this.disposeFlexLayout?.()
		this.disposeDefaultSideEffects?.()
		this.controller.dispose()
		return super.dispose()
	}
}

export function installLayoutTestDom() {
	class FakeElement {
		constructor(
			public ownerDocument: typeof document,
			public tagName = 'div',
			public textContent = ''
		) {}
		nodeType = 1
		tabIndex = 0
		children: FakeElement[] = []
		classList = { add() {}, remove() {} }
		style = { setProperty() {}, removeProperty() {}, getPropertyValue: () => '' }
		addEventListener() {}
		removeEventListener() {}
		setAttribute() {}
		setAttributeNS() {}
		removeAttribute() {}
		appendChild(child: FakeElement) {
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
		get scrollWidth() {
			return 1080
		}
		get scrollHeight() {
			return 720
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
			const node = new FakeElement(fakeDocument as unknown as typeof document, '#text', text)
			node.nodeType = 3
			return node
		},
		createDocumentFragment: () =>
			new FakeElement(fakeDocument as unknown as typeof document, '#fragment'),
		implementation: { createHTMLDocument: () => fakeDocument },
	}
	const body = new FakeElement(fakeDocument as unknown as typeof document)
	fakeDocument.body = body
	fakeDocument.documentElement = body
	const requestAnimationFrame = () => 1
	const previous = {
		document: Object.getOwnPropertyDescriptor(globalThis, 'document'),
		window: Object.getOwnPropertyDescriptor(globalThis, 'window'),
		navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator'),
		requestAnimationFrame: Object.getOwnPropertyDescriptor(globalThis, 'requestAnimationFrame'),
		cancelAnimationFrame: Object.getOwnPropertyDescriptor(globalThis, 'cancelAnimationFrame'),
		Path2D: Object.getOwnPropertyDescriptor(globalThis, 'Path2D'),
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
			cancelAnimationFrame() {},
			setTimeout,
			clearTimeout,
			setInterval,
			clearInterval,
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
		value: () => undefined,
	})
	Object.defineProperty(globalThis, 'Path2D', {
		configurable: true,
		value: class {
			rect() {}
			roundRect() {}
		},
	})

	return () => {
		for (const [key, descriptor] of Object.entries(previous)) {
			if (descriptor) Object.defineProperty(globalThis, key, descriptor)
			else delete (globalThis as Record<string, unknown>)[key]
		}
	}
}
