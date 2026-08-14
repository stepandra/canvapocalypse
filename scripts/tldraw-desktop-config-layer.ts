const WORKBENCH_DESKTOP_LAYER_MARKER = Symbol.for(
	'canvapocalypse.workbench.desktop-layer'
)

type MarkedLayer<T> = T & {
	[WORKBENCH_DESKTOP_LAYER_MARKER]?: T
}

/**
 * Document scripts are reapplied in-place while the desktop window stays open.
 * Keep the host's original front-of-canvas component, but unwrap our previous
 * workbench layer so a hot reapply replaces it instead of nesting another copy.
 */
export function unwrapWorkbenchDesktopLayer<T>(candidate: T | undefined) {
	if (!candidate) return candidate
	return (
		(candidate as MarkedLayer<T>)[WORKBENCH_DESKTOP_LAYER_MARKER] ?? candidate
	)
}

export function markWorkbenchDesktopLayer<T>(layer: T, base: T | undefined) {
	Object.defineProperty(layer, WORKBENCH_DESKTOP_LAYER_MARKER, {
		value: base,
		configurable: false,
		enumerable: false,
		writable: false,
	})
	return layer
}
