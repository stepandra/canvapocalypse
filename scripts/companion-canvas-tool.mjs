/**
 * Provider-neutral public seam for existing agent threads that need bounded
 * access to the native tldraw canvas. The implementation shares queue state
 * with the ML-Intern compatibility aliases.
 */
export {
	COMPANION_TLDRAW_TOOL_NAMES,
	describeCompanionCanvasCapability,
	enqueueCompanionCanvasPlan,
	executeCompanionCanvasCapability,
	getCompanionCanvasToolStatus,
	handleCompanionCanvasToolRequest,
	issueCompanionCanvasCapabilityManifest,
	leaseNextMlInternCanvasTool as leaseNextCompanionCanvasTool,
	recordMlInternCanvasToolReceipt as recordCompanionCanvasToolReceipt,
	registerMlInternCanvasClient as registerCompanionCanvasClient,
	resetMlInternCanvasToolState as resetCompanionCanvasToolState,
} from './ml-intern-canvas-tool.mjs'
