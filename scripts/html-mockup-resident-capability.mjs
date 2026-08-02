import { randomBytes } from 'node:crypto'
import {
	chmodSync,
	closeSync,
	fstatSync,
	lstatSync,
	mkdirSync,
	openSync,
	readFileSync,
	writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const CAPABILITY_PATTERN = /^hr_[A-Za-z0-9_-]{43,128}$/
const MAX_CAPABILITY_FILE_BYTES = 256

export function loadOrCreateHtmlMockupResidentCapability(options = {}) {
	const configured = options.envCapability
	if (configured != null && configured !== '') {
		return validateCapability(String(configured))
	}

	const cwd = resolve(options.cwd ?? process.cwd())
	const capabilityPath = resolve(
		options.capabilityPath ??
			process.env.TLDRAW_HTML_MOCKUP_RESIDENT_CAPABILITY_FILE ??
			join(cwd, '.tldraw-html-mockups', 'resident-capability')
	)
	mkdirSync(dirname(capabilityPath), { recursive: true, mode: 0o700 })

	try {
		const metadata = lstatSync(capabilityPath)
		if (
			metadata.isSymbolicLink() ||
			!metadata.isFile() ||
			metadata.size > MAX_CAPABILITY_FILE_BYTES
		) {
			throw new Error(
				'Local HTML Mockup resident capability file is unsafe.'
			)
		}
		const capability = validateCapability(
			readFileSync(capabilityPath, 'utf8').trim()
		)
		chmodSync(capabilityPath, 0o600)
		return capability
	} catch (error) {
		if (error?.code !== 'ENOENT') throw error
	}

	const capability = `hr_${randomBytes(32).toString('base64url')}`
	let descriptor
	try {
		descriptor = openSync(capabilityPath, 'wx', 0o600)
		const metadata = fstatSync(descriptor)
		if (!metadata.isFile()) {
			throw new Error(
				'Local HTML Mockup resident capability destination is unsafe.'
			)
		}
		writeFileSync(descriptor, `${capability}\n`, {
			encoding: 'utf8',
		})
	} catch (error) {
		if (error?.code === 'EEXIST') {
			return loadOrCreateHtmlMockupResidentCapability({
				cwd,
				capabilityPath,
			})
		}
		throw error
	} finally {
		if (descriptor !== undefined) closeSync(descriptor)
	}
	return capability
}

export function htmlMockupResidentCapabilityFile(options = {}) {
	const cwd = resolve(options.cwd ?? process.cwd())
	return resolve(
		options.capabilityPath ??
			process.env.TLDRAW_HTML_MOCKUP_RESIDENT_CAPABILITY_FILE ??
			join(cwd, '.tldraw-html-mockups', 'resident-capability')
	)
}

function validateCapability(value) {
	if (!CAPABILITY_PATTERN.test(value)) {
		throw new Error(
			'Local HTML Mockup resident capability must be a high-entropy hr_ token.'
		)
	}
	return value
}
