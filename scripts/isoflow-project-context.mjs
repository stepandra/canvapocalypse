import { readFile, realpath, stat } from 'node:fs/promises'
import { resolve } from 'node:path'

const PROJECT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,79}$/i

export async function resolveIsoflowProjectContext({
	projectId,
	studioRoot,
	projectRootOverride,
}) {
	const id = validateProjectId(projectId)
	const workspacePath = resolve(studioRoot, 'workspaces', `${id}.json`)
	let workspace

	try {
		workspace = JSON.parse(await readFile(workspacePath, 'utf8'))
	} catch (error) {
		if (error?.code === 'ENOENT') {
			throw httpError(`Unknown Isoflow project: ${id}`, 404)
		}
		throw httpError(`Isoflow workspace is unreadable: ${id}`, 500)
	}

	if (workspace?.projectId !== id) {
		throw httpError(`Isoflow workspace projectId mismatch: ${id}`, 500)
	}
	const configuredRoot = projectRootOverride || workspace?.projectRoot
	if (typeof configuredRoot !== 'string' || configuredRoot.trim() === '') {
		throw httpError(`Isoflow workspace has no projectRoot: ${id}`, 500)
	}

	const candidate = resolve(studioRoot, configuredRoot)
	let metadata
	try {
		metadata = await stat(candidate)
	} catch (error) {
		if (error?.code === 'ENOENT') {
			throw httpError(`Isoflow project root does not exist: ${id}`, 500)
		}
		throw error
	}
	if (!metadata.isDirectory()) {
		throw httpError(`Isoflow project root is not a directory: ${id}`, 500)
	}

	return {
		projectId: id,
		projectRoot: await realpath(candidate),
		workspacePath,
	}
}

function validateProjectId(projectId) {
	if (typeof projectId !== 'string' || !PROJECT_ID_PATTERN.test(projectId)) {
		throw httpError('A valid Isoflow projectId is required', 400)
	}
	return projectId
}

function httpError(message, statusCode) {
	const error = new Error(message)
	error.statusCode = statusCode
	return error
}
