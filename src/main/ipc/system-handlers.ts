import { ipcMain, dialog, shell, nativeImage } from 'electron'
import path from 'path'
import os from 'os'
import { existsSync, statSync, readFileSync } from 'fs'
import { store } from '../store'
import { UserSettings } from '../../shared/types'
import { execWithShell, shellQuote } from '../utils/shell'
import logoIcon from '../../../resources/icon.png?asset'

export function registerSystemHandlers(): void {
    ipcMain.handle('reveal-in-finder', async (_, filePath: string, baseCwd?: string) => {
        let resolvedPath = filePath

        if (resolvedPath.startsWith('~/')) {
            resolvedPath = path.join(os.homedir(), resolvedPath.slice(2))
        } else if (resolvedPath === '~') {
            resolvedPath = os.homedir()
        } else if (baseCwd && !path.isAbsolute(resolvedPath)) {
            resolvedPath = path.resolve(baseCwd, resolvedPath)
        }

        if (!existsSync(resolvedPath)) {
            console.error('[reveal-in-finder] File not found:', resolvedPath)
            return false
        }

        shell.showItemInFolder(resolvedPath)
        return true
    })

    ipcMain.handle('select-directory', async () => {
        const result = await dialog.showOpenDialog({
            properties: ['openDirectory', 'createDirectory']
        })

        if (result.canceled || result.filePaths.length === 0) {
            return null
        }

        return result.filePaths[0]
    })

    ipcMain.handle('show-message-box', async (_, options: { type: 'info' | 'warning' | 'error' | 'question'; title: string; message: string; detail?: string; buttons: string[]; icon?: string }) => {
        const iconPath = options.icon ? path.resolve(options.icon) : logoIcon
        const dialogIcon = nativeImage.createFromPath(iconPath)
        const result = await dialog.showMessageBox({
            type: options.type,
            title: options.title,
            message: options.message,
            detail: options.detail,
            buttons: options.buttons,
            icon: dialogIcon.isEmpty() ? undefined : dialogIcon
        })
        return result
    })

    ipcMain.handle('open-external', async (_, url: string) => {
        try {
            await shell.openExternal(url)
            return { success: true }
        } catch (error) {
            console.error('[openExternal] Error:', error)
            return { success: false, error: (error instanceof Error ? error.message : String(error)) }
        }
    })

    ipcMain.handle('check-tools', async () => {
        const tools = { git: false, gh: false, brew: false }

        try {
            await execWithShell('git --version')
            tools.git = true
        } catch {
            // Git not installed
        }

        try {
            await execWithShell('gh --version')
            tools.gh = true
        } catch {
            // GitHub CLI not installed
        }

        try {
            await execWithShell('brew --version')
            tools.brew = true
        } catch {
            // Homebrew not installed
        }

        return tools
    })

    ipcMain.handle('open-in-editor', async (_, workspacePath: string, editorType?: string) => {
        try {
            const settings = store.get('settings') as UserSettings
            const editor = editorType || settings?.defaultEditor || 'vscode'

            if (editor === 'custom') {
                const customPath = settings?.customEditorPath
                if (!customPath) {
                    throw new Error('Custom editor path not configured')
                }
                const fullCommand = `${shellQuote(customPath.trim())} ${shellQuote(workspacePath)}`
                await execWithShell(fullCommand)
                return { success: true, editor }
            }

            if (editor === 'antigravity' && process.platform === 'darwin') {
                await execWithShell(`open -a ${shellQuote('Antigravity')} ${shellQuote(workspacePath)}`)
                return { success: true, editor }
            }

            const editorCommands: Record<string, string> = {
                'vscode': 'code',
                'cursor': 'cursor',
                'antigravity': 'antigravity'
            }
            const command = editorCommands[editor]
            if (!command) {
                throw new Error(`Unknown editor type: ${editor}`)
            }

            const fullCommand = `${shellQuote(command)} ${shellQuote(workspacePath)}`
            await execWithShell(fullCommand)

            return { success: true, editor }
        } catch (e) {
            return { success: false, error: (e instanceof Error ? e.message : String(e)) }
        }
    })

    ipcMain.handle('read-file-content', async (_, filePath: string, maxSize: number = 500000) => {
        try {
            if (!existsSync(filePath)) {
                return { success: false, error: 'File not found' }
            }

            const stats = statSync(filePath)
            if (stats.size > maxSize) {
                return { success: false, error: `File too large (${Math.round(stats.size / 1024)}KB)`, size: stats.size }
            }

            const content = readFileSync(filePath, 'utf-8')
            return { success: true, content, size: stats.size }
        } catch (e) {
            return { success: false, error: (e instanceof Error ? e.message : String(e)) }
        }
    })

    ipcMain.handle('read-image-as-base64', async (_, filePath: string, maxSize: number = 10000000) => {
        try {
            if (!existsSync(filePath)) {
                return { success: false, error: 'File not found' }
            }

            const stats = statSync(filePath)
            if (stats.size > maxSize) {
                return { success: false, error: `Image too large (${Math.round(stats.size / 1024 / 1024)}MB)`, size: stats.size }
            }

            const ext = path.extname(filePath).toLowerCase().slice(1)
            const mimeTypes: Record<string, string> = {
                'png': 'image/png',
                'jpg': 'image/jpeg',
                'jpeg': 'image/jpeg',
                'gif': 'image/gif',
                'webp': 'image/webp',
                'svg': 'image/svg+xml',
                'ico': 'image/x-icon',
                'bmp': 'image/bmp'
            }
            const mimeType = mimeTypes[ext] || 'image/png'

            const buffer = readFileSync(filePath)
            const base64 = buffer.toString('base64')

            return { success: true, data: base64, mimeType, size: stats.size }
        } catch (e) {
            return { success: false, error: (e instanceof Error ? e.message : String(e)) }
        }
    })

    ipcMain.handle('open-file-in-editor', async (_, filePath: string, baseCwd: string, line?: number, column?: number) => {
        try {
            const settings = store.get('settings') as UserSettings
            const editor = settings?.defaultEditor || 'vscode'

            let absolutePath = filePath
            let found = false

            if (absolutePath.startsWith('~/')) {
                absolutePath = path.join(os.homedir(), absolutePath.slice(2))
            } else if (absolutePath === '~') {
                absolutePath = os.homedir()
            }

            if (path.isAbsolute(absolutePath)) {
                if (existsSync(absolutePath)) {
                    found = true
                } else {
                    const cwdRelative = path.join(baseCwd, absolutePath)
                    if (existsSync(cwdRelative)) {
                        absolutePath = cwdRelative
                        found = true
                    }
                }
            } else {
                absolutePath = path.resolve(baseCwd, absolutePath)
                found = existsSync(absolutePath)
            }

            if (!found) {
                return { success: false, error: `File not found: ${filePath}` }
            }

            let command: string
            if (editor === 'custom') {
                const customPath = settings?.customEditorPath
                if (!customPath) {
                    return { success: false, error: 'Custom editor path not configured' }
                }
                command = customPath.trim()
            } else {
                const editorCommands: Record<string, string> = {
                    'vscode': 'code',
                    'cursor': 'cursor',
                    'antigravity': 'antigravity'
                }
                command = editorCommands[editor]
                if (!command) {
                    return { success: false, error: `Unknown editor: ${editor}` }
                }
            }

            if (editor === 'antigravity' && process.platform === 'darwin') {
                await execWithShell(`open -a ${shellQuote('Antigravity')} ${shellQuote(absolutePath)}`)
                return { success: true }
            }

            const fullCommand = line
                ? `${shellQuote(command)} ${shellQuote(baseCwd)} -g ${shellQuote(`${absolutePath}:${line}${column ? `:${column}` : ''}`)}`
                : `${shellQuote(command)} ${shellQuote(baseCwd)} ${shellQuote(absolutePath)}`

            await execWithShell(fullCommand)

            return { success: true }
        } catch (e) {
            return { success: false, error: (e instanceof Error ? e.message : String(e)) }
        }
    })
}
