import { exec, execFile } from 'child_process'
import { promisify } from 'util'

export const execAsync = promisify(exec)
export const execFileAsync = promisify(execFile)

// Fix PATH for packaged app on macOS and Linux
// When launched from Finder/Spotlight or desktop, the app doesn't inherit shell PATH
export async function fixPath(): Promise<void> {
    if (process.platform === 'win32') return
    if (process.env.PATH?.includes('/usr/local/bin')) return // Already fixed

    try {
        const shell = process.env.SHELL || (process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash')
        const { stdout } = await execAsync(`${shell} -l -c 'echo $PATH'`)
        const shellPath = stdout.trim()
        if (shellPath) {
            process.env.PATH = shellPath
        }
    } catch (e) {
        console.error('[fixPath] Failed to get shell PATH:', e)
    }
}

// Helper function to execute commands with login shell
// Uses execFile to avoid double shell parsing and quote-escaping bugs.
// Callers should use shellQuote() on individual arguments that contain spaces/special chars.
export async function execWithShell(
    command: string,
    options?: { cwd?: string }
): Promise<{ stdout: string; stderr: string }> {
    const shell = process.env.SHELL || (process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash')
    return execFileAsync(shell, ['-l', '-c', command], {
        cwd: options?.cwd,
        maxBuffer: 10 * 1024 * 1024,
        encoding: 'utf-8'
    })
}

/**
 * Quote a string for safe use as a single shell argument.
 * Wraps in single quotes and escapes internal single quotes.
 */
export function shellQuote(str: string): string {
    return "'" + str.replace(/'/g, "'\\''") + "'"
}
