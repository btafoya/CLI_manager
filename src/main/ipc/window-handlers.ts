import { ipcMain } from 'electron'
import { windowState } from '../window-state'
import { createFullscreenTerminalWindow } from '../utils/window-helpers'

export function registerWindowHandlers(): void {
    ipcMain.handle('open-fullscreen-terminal', (_event, sessionIds: string[]) => {
        if (sessionIds && sessionIds.length > 0) {
            createFullscreenTerminalWindow(sessionIds)
            return true
        }
        return false
    })

    ipcMain.handle('sync-grid-sessions', (_event, sessionIds: string[]) => {
        if (windowState.gridWindow && !windowState.gridWindow.isDestroyed()) {
            windowState.gridWindow.webContents.send('grid-sessions-updated', sessionIds)
            if (windowState.mainWindow && !windowState.mainWindow.isDestroyed()) {
                windowState.mainWindow.webContents.send('grid-view-state-changed', true, sessionIds)
            }
            return true
        }
        return false
    })
}
