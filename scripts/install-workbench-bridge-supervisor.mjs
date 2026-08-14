import { execFile as execFileCallback } from 'node:child_process'
import {
	chmod,
	mkdir,
	rename,
	unlink,
	writeFile,
} from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

export const WORKBENCH_SUPERVISOR_LAUNCH_AGENT_LABEL =
	'dev.canvapocalypse.workbench-bridge-supervisor'

const execFile = promisify(execFileCallback)
const SCRIPT_PATH = fileURLToPath(
	new URL('./workbench-bridge-supervisor.mjs', import.meta.url),
)
const REPO_ROOT = resolve(dirname(SCRIPT_PATH), '..')

export function renderWorkbenchSupervisorLaunchAgent(options = {}) {
	const nodePath = options.nodePath ? resolve(options.nodePath) : undefined
	const scriptPath = resolve(options.scriptPath ?? SCRIPT_PATH)
	const workingDirectory = resolve(options.workingDirectory ?? REPO_ROOT)
	const pathValue =
		options.pathValue ??
		[
			dirname(nodePath ?? process.execPath),
			'/opt/homebrew/bin',
			'/usr/local/bin',
			'/usr/bin',
			'/bin',
		].join(':')
	const label =
		options.label ?? WORKBENCH_SUPERVISOR_LAUNCH_AGENT_LABEL

	return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key>
	<string>${escapeXml(label)}</string>
	<key>ProgramArguments</key>
	<array>
		<string>${escapeXml(nodePath ?? '/usr/bin/env')}</string>
		${nodePath ? '' : '<string>node</string>\n\t\t'}<string>${escapeXml(scriptPath)}</string>
	</array>
	<key>WorkingDirectory</key>
	<string>${escapeXml(workingDirectory)}</string>
	<key>EnvironmentVariables</key>
	<dict>
		<key>PATH</key>
		<string>${escapeXml(pathValue)}</string>
	</dict>
	<key>RunAtLoad</key>
	<true/>
	<key>KeepAlive</key>
	<true/>
	<key>ProcessType</key>
	<string>Interactive</string>
	<key>StandardOutPath</key>
	<string>/dev/null</string>
	<key>StandardErrorPath</key>
	<string>/dev/null</string>
</dict>
</plist>
`
}

export async function installWorkbenchSupervisorLaunchAgent(options = {}) {
	if (process.platform !== 'darwin' && !options.allowNonDarwin) {
		throw new Error('The workbench supervisor LaunchAgent is macOS-only.')
	}
	const userHome = resolve(options.homeDirectory ?? homedir())
	const launchAgentsDirectory = join(userHome, 'Library', 'LaunchAgents')
	const plistPath =
		options.plistPath ??
		join(
			launchAgentsDirectory,
			`${WORKBENCH_SUPERVISOR_LAUNCH_AGENT_LABEL}.plist`,
		)
	const uid = options.uid ?? process.getuid?.()
	if (!Number.isInteger(uid) || uid < 0) {
		throw new Error('Could not resolve the current user ID for launchctl.')
	}
	const launchctl = options.launchctl ?? runLaunchctl
	const domain = `gui/${uid}`
	const serviceTarget = `${domain}/${WORKBENCH_SUPERVISOR_LAUNCH_AGENT_LABEL}`

	await mkdir(dirname(plistPath), { recursive: true, mode: 0o700 })
	const temporaryPath = `${plistPath}.tmp-${process.pid}`
	await writeFile(
		temporaryPath,
		renderWorkbenchSupervisorLaunchAgent(options),
		{ encoding: 'utf8', mode: 0o600 },
	)
	await chmod(temporaryPath, 0o600)
	await rename(temporaryPath, plistPath)

	await launchctl(['bootout', domain, plistPath], { allowFailure: true })
	await launchctl(['bootstrap', domain, plistPath])
	await launchctl(['enable', serviceTarget])
	await launchctl(['kickstart', '-k', serviceTarget])
	return { label: WORKBENCH_SUPERVISOR_LAUNCH_AGENT_LABEL, plistPath }
}

export async function uninstallWorkbenchSupervisorLaunchAgent(options = {}) {
	if (process.platform !== 'darwin' && !options.allowNonDarwin) {
		throw new Error('The workbench supervisor LaunchAgent is macOS-only.')
	}
	const userHome = resolve(options.homeDirectory ?? homedir())
	const plistPath =
		options.plistPath ??
		join(
			userHome,
			'Library',
			'LaunchAgents',
			`${WORKBENCH_SUPERVISOR_LAUNCH_AGENT_LABEL}.plist`,
		)
	const uid = options.uid ?? process.getuid?.()
	if (!Number.isInteger(uid) || uid < 0) {
		throw new Error('Could not resolve the current user ID for launchctl.')
	}
	const launchctl = options.launchctl ?? runLaunchctl
	await launchctl(['bootout', `gui/${uid}`, plistPath], { allowFailure: true })
	try {
		await unlink(plistPath)
	} catch (error) {
		if (error?.code !== 'ENOENT') throw error
	}
	return { label: WORKBENCH_SUPERVISOR_LAUNCH_AGENT_LABEL, plistPath }
}

async function runLaunchctl(arguments_, options = {}) {
	try {
		await execFile('/bin/launchctl', arguments_, {
			encoding: 'utf8',
			maxBuffer: 64 * 1024,
		})
	} catch (error) {
		if (options.allowFailure) return
		throw new Error(
			`launchctl ${arguments_[0]} failed with exit code ${error?.code ?? 'unknown'}.`,
		)
	}
}

function escapeXml(value) {
	return String(value)
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&apos;')
}

async function runMain() {
	const uninstall = process.argv.slice(2).includes('--uninstall')
	const result = uninstall
		? await uninstallWorkbenchSupervisorLaunchAgent()
		: await installWorkbenchSupervisorLaunchAgent()
	console.log(
		`${uninstall ? 'Uninstalled' : 'Installed'} ${result.label} at ${result.plistPath}`,
	)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	runMain().catch((error) => {
		console.error(error instanceof Error ? error.message : String(error))
		process.exitCode = 1
	})
}
