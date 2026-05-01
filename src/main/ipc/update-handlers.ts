import { ipcMain, app } from 'electron'
import { autoUpdater } from 'electron-updater'
import { is } from '@electron-toolkit/utils'
import { TerminalManager } from '../TerminalManager'

export function registerUpdateHandlers(terminalManager: TerminalManager, onInstall: () => void): void {
    ipcMain.handle('check-for-update', async () => {
        if (is.dev) {
            return { success: false, error: 'dev-mode', isDev: true }
        }

        try {
            const result = await autoUpdater.checkForUpdates()
            const currentVersion = app.getVersion()
            const latestVersion = result?.updateInfo?.version

            if (latestVersion && latestVersion !== currentVersion) {
                return { success: true, version: latestVersion, hasUpdate: true }
            } else {
                return { success: true, version: currentVersion, hasUpdate: false }
            }
        } catch (error) {
            console.error('Update check error:', error)
            return { success: false, error: (error instanceof Error ? error.message : String(error)) }
        }
    })

    ipcMain.handle('download-update', async () => {
        try {
            await autoUpdater.downloadUpdate()
            return { success: true }
        } catch (error) {
            console.error('Download update error:', error)
            return { success: false, error: (error instanceof Error ? error.message : String(error)) }
        }
    })

    ipcMain.handle('install-update', () => {
        onInstall()
        terminalManager.killAll()
        autoUpdater.quitAndInstall()
    })
}
