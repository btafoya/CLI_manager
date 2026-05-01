import { BrowserWindow } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import icon from '../../../resources/icon.png?asset'
import { windowState } from '../window-state'

export function createFullscreenTerminalWindow(sessionIds: string[]): void {
    const existingGrid = BrowserWindow.getAllWindows().find(w => w.title === 'Split Terminal View')
    if (existingGrid && !existingGrid.isDestroyed()) {
        existingGrid.close()
    }

    const macGridOptions = process.platform === 'darwin' ? {
        titleBarStyle: 'hiddenInset' as const,
        vibrancy: 'under-window' as const,
        visualEffectState: 'active' as const,
        trafficLightPosition: { x: 15, y: 10 }
    } : {}

    const fullscreenWindow = new BrowserWindow({
        width: 1600,
        height: 900,
        show: false,
        autoHideMenuBar: true,
        icon,
        ...macGridOptions,
        webPreferences: {
            preload: join(__dirname, '../preload/index.js'),
            sandbox: false,
            contextIsolation: true,
            nodeIntegration: false,
            zoomFactor: 1
        }
    })

    windowState.gridWindow = fullscreenWindow

    fullscreenWindow.on('ready-to-show', () => {
        fullscreenWindow.show()
        if (windowState.mainWindow && !windowState.mainWindow.isDestroyed()) {
            windowState.mainWindow.webContents.send('grid-view-state-changed', true, sessionIds)
        }
    })

    fullscreenWindow.on('closed', () => {
        windowState.gridWindow = null
        if (windowState.mainWindow && !windowState.mainWindow.isDestroyed()) {
            windowState.mainWindow.webContents.send('grid-view-state-changed', false, [])
        }
    })

    fullscreenWindow.webContents.setZoomFactor(1)
    fullscreenWindow.webContents.setZoomLevel(0)
    fullscreenWindow.webContents.setVisualZoomLevelLimits(1, 1)

    fullscreenWindow.webContents.on('before-input-event', (event, input) => {
        const isModifier = input.meta || input.control
        if (isModifier && (input.key === '=' || input.key === '+' || input.key === '-' || input.key === '0')) {
            event.preventDefault()
            fullscreenWindow.webContents.send('terminal-zoom', input.key)
        }
    })

    const sessionIdsParam = sessionIds.join(',')
    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
        fullscreenWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}?mode=fullscreen&sessions=${sessionIdsParam}`)
    } else {
        fullscreenWindow.loadFile(join(__dirname, '../renderer/index.html'), {
            query: { mode: 'fullscreen', sessions: sessionIdsParam }
        })
    }
}
