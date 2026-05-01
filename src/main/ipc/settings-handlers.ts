import { ipcMain, dialog, app } from 'electron'
import { existsSync } from 'fs'
import { execFileSync } from 'child_process'
import { store } from '../store'
import { execWithShell, shellQuote } from '../utils/shell'

export function registerSettingsHandlers(): void {
    ipcMain.handle('get-settings', () => {
        return store.get('settings')
    })

    ipcMain.handle('save-settings', (_, settings) => {
        store.set('settings', settings)
        return true
    })

    ipcMain.handle('validate-shell-path', async (_, shellPath: string) => {
        try {
            const SAFE_SHELL_NAME = /^[a-zA-Z0-9_\-\/]+$/
            if (!SAFE_SHELL_NAME.test(shellPath) || shellPath.includes('..')) {
                return { valid: false, error: `Invalid shell path: ${shellPath}` }
            }

            if (shellPath.startsWith('/')) {
                if (existsSync(shellPath)) {
                    return { valid: true, resolvedPath: shellPath }
                } else {
                    return { valid: false, error: `Shell not found at path: ${shellPath}` }
                }
            }
            const resolvedPath = execFileSync('which', [shellPath], { encoding: 'utf-8' }).trim()
            if (resolvedPath) {
                return { valid: true, resolvedPath }
            } else {
                return { valid: false, error: `Shell '${shellPath}' not found in PATH` }
            }
        } catch {
            return { valid: false, error: `Shell '${shellPath}' not found or not accessible` }
        }
    })

    ipcMain.handle('validate-editor-path', async (_, editorPath: string, testDir?: string) => {
        try {
            let targetDir = testDir
            if (!targetDir) {
                const result = await dialog.showOpenDialog({
                    properties: ['openDirectory'],
                    title: 'Select a folder to test the editor',
                    buttonLabel: 'Test with this folder'
                })
                if (result.canceled || result.filePaths.length === 0) {
                    return { valid: false, error: 'Test cancelled' }
                }
                targetDir = result.filePaths[0]
            }

            await execWithShell(`${shellQuote(editorPath)} ${shellQuote(targetDir!)}`)
            return { valid: true, resolvedPath: editorPath }
        } catch (e) {
            return { valid: false, error: (e instanceof Error ? e.message : String(e)) || 'Failed to open editor' }
        }
    })

    ipcMain.handle('get-app-version', () => {
        return app.getVersion()
    })

    ipcMain.handle('get-templates', () => {
        return store.get('customTemplates') || []
    })

    ipcMain.handle('save-templates', (_, templates) => {
        store.set('customTemplates', templates)
        return true
    })
}
