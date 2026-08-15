import {
	createTLStore,
	defaultBindingUtils,
	defaultShapeTools,
	defaultShapeUtils,
	defaultTools,
	Editor,
	type TLStateNodeConstructor,
} from 'tldraw'

export class CanvasExamplesTestEditor extends Editor {
	constructor({
		tools = [],
		initialState = 'select',
	}: {
		tools?: TLStateNodeConstructor[]
		initialState?: string
	} = {}) {
		const shapeUtils = [...defaultShapeUtils]
		const bindingUtils = [...defaultBindingUtils]
		super({
			shapeUtils,
			bindingUtils,
			tools: [...defaultTools, ...defaultShapeTools, ...tools],
			store: createTLStore({ shapeUtils, bindingUtils }),
			getContainer: () => document.createElement('div'),
			initialState,
		})
	}
}

export function installCanvasExamplesTestDom() {
	class FakeElement {
		constructor(public ownerDocument: typeof document) {}

		tabIndex = 0
		classList = { add() {}, remove() {} }
		style = {
			setProperty() {},
			removeProperty() {},
			getPropertyValue() {
				return ''
			},
		}
		addEventListener() {}
		removeEventListener() {}
		setAttribute() {}
		removeAttribute() {}
		appendChild() {
			return this
		}
		removeChild() {
			return this
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
		createElement: () => new FakeElement(fakeDocument as unknown as typeof document),
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
