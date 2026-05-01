import { app, shell, BrowserWindow, Tray, Menu, dialog, nativeImage } from 'electron'
import path, { join } from 'path'
import { electronApp, is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import icon from '../../resources/icon.png?asset'
import { Workspace } from '../shared/types'
import os from 'os'
import { existsSync, readdirSync } from 'fs'

import { TerminalManager } from './TerminalManager'
import { PortManager } from './PortManager'
import { SystemMonitor } from './SystemMonitor'
import { CLISessionTracker } from './CLISessionTracker'
import { store } from './store'
import { fixPath } from './utils/shell'
import { windowState } from './window-state'
import { registerAllHandlers } from './ipc'

// Set app name for development mode
app.setName('CLI Manager')

// Auto Updater 설정
// User must click "Download" button to start download (not automatic)
autoUpdater.autoDownload = false
autoUpdater.autoInstallOnAppQuit = true

const cliSessionTracker = new CLISessionTracker()
const terminalManager = new TerminalManager(cliSessionTracker)
const portManager = new PortManager()
const systemMonitor = new SystemMonitor(store)

// Background mode state
let tray: Tray | null = null
let isQuitting = false  // True when user confirms to quit completely
let isBackgroundMode = false  // True when running in background (window hidden)

function createWindow(): void {
    const macWindowOptions = process.platform === 'darwin' ? {
        titleBarStyle: 'hiddenInset' as const,
        vibrancy: 'under-window' as const,
        visualEffectState: 'active' as const,
        trafficLightPosition: { x: 15, y: 10 }
    } : {}

    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        show: false,
        autoHideMenuBar: true,
        icon,
        ...macWindowOptions,
        webPreferences: {
            preload: join(__dirname, '../preload/index.js'),
            sandbox: false,
            contextIsolation: true,
            nodeIntegration: false,
            zoomFactor: 1
        }
    })

    windowState.mainWindow = win

    win.on('ready-to-show', () => {
        win.show()
    })

    win.webContents.setZoomFactor(1)
    win.webContents.setZoomLevel(0)
    win.webContents.setVisualZoomLevelLimits(1, 1)

    win.webContents.on('before-input-event', (event, input) => {
        const isModifier = input.meta || input.control
        if (isModifier && (input.key === '=' || input.key === '+' || input.key === '-' || input.key === '0')) {
            event.preventDefault()
            win.webContents.send('terminal-zoom', input.key)
        }
    })

    win.webContents.setWindowOpenHandler((details) => {
        shell.openExternal(details.url)
        return { action: 'deny' }
    })

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
        win.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
        win.loadFile(join(__dirname, '../renderer/index.html'))
    }
}

// Validate cliSessionIds on startup against Claude's actual session storage.
// If the JSONL file doesn't exist, the session was never saved — clear the stale ID.
function validateCliSessionIds(): void {
    const claudeDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude')
    const projectsDir = path.join(claudeDir, 'projects')

    if (!existsSync(projectsDir)) {
        return
    }

    const existingSessionIds = new Set<string>()
    try {
        const projectDirs = readdirSync(projectsDir)
        for (const dir of projectDirs) {
            const dirPath = path.join(projectsDir, dir)
            try {
                const files = readdirSync(dirPath)
                for (const file of files) {
                    if (file.endsWith('.jsonl')) {
                        existingSessionIds.add(file.replace('.jsonl', ''))
                    }
                }
            } catch { /* skip unreadable dirs */ }
        }
    } catch (e) {
        console.error('[validateCliSessionIds] Failed to scan projects dir:', e)
        return
    }

    const workspaces = store.get('workspaces') as Workspace[]
    let modified = false
    for (const ws of workspaces) {
        for (const session of ws.sessions) {
            if (session.cliSessionId) {
                if (!existingSessionIds.has(session.cliSessionId)) {
                    delete session.cliSessionId
                    delete session.cliToolName
                    modified = true
                }
            }
        }
    }
    if (modified) {
        store.set('workspaces', workspaces)
    }
}

app.whenReady().then(async () => {
    await fixPath()

    validateCliSessionIds()

    electronApp.setAppUserModelId('com.climanager.app')

    const appMenu = Menu.buildFromTemplate([
        {
            label: app.name,
            submenu: [
                { role: 'about' },
                { type: 'separator' },
                { role: 'services' },
                { type: 'separator' },
                { role: 'hide' },
                { role: 'hideOthers' },
                { role: 'unhide' },
                { type: 'separator' },
                { role: 'quit' }
            ]
        },
        {
            label: 'Edit',
            submenu: [
                { role: 'undo' },
                { role: 'redo' },
                { type: 'separator' },
                { role: 'cut' },
                { role: 'copy' },
                { role: 'paste' },
                { role: 'selectAll' }
            ]
        },
        {
            label: 'Window',
            submenu: [
                { role: 'minimize' },
                { role: 'close' },
                { role: 'togglefullscreen' }
            ]
        }
    ])
    Menu.setApplicationMenu(appMenu)

    if (process.platform === 'darwin' && app.dock) {
        try {
            app.dock.setIcon(icon)
        } catch {
            // Icon loading may fail in packaged app, but icon.icns is used automatically
        }
    }

    if (!is.dev) {
        autoUpdater.checkForUpdatesAndNotify()
    }

    app.on('browser-window-created', (_, window) => {
        window.webContents.on('before-input-event', (event, input) => {
            if (input.key === 'F12') {
                if (is.dev) {
                    window.webContents.toggleDevTools()
                }
                event.preventDefault()
            }
        })
    })

    registerAllHandlers({
        terminalManager,
        cliSessionTracker,
        onInstallUpdate: () => { isQuitting = true }
    })

    createWindow()
})

app.on('activate', () => {
    if (isBackgroundMode) {
        showFromBackground()
    } else if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
    }
})

app.on('window-all-closed', () => {
    if (isBackgroundMode) {
        return
    }
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

app.on('before-quit', async (event) => {
    if (isQuitting) {
        return
    }

    const terminalCount = terminalManager.getTerminalCount()
    if (terminalCount === 0) {
        return
    }

    const runningCount = terminalManager.getRunningProcessCount()

    event.preventDefault()

    const dialogIcon = nativeImage.createFromPath(icon)
    let message: string
    if (runningCount > 0) {
        message = `${runningCount} of ${terminalCount} terminal(s) have running processes.`
    } else {
        message = `There are ${terminalCount} active terminal(s).`
    }

    const { response } = await dialog.showMessageBox({
        type: 'question',
        title: 'Quit CLI Manager',
        message: message,
        detail: 'What would you like to do?',
        buttons: ['Keep Running in Background', 'Terminate All & Quit', 'Cancel'],
        defaultId: 0,
        cancelId: 2,
        icon: dialogIcon.isEmpty() ? undefined : dialogIcon
    })

    if (response === 0) {
        enterBackgroundMode()
    } else if (response === 1) {
        isQuitting = true
        terminalManager.killAll()
        setTimeout(() => {
            app.quit()
        }, 100)
    }
})

function createTray(): void {
    if (tray) return

    const trayIcon = nativeImage.createFromPath(icon)
    const resizedIcon = trayIcon.resize({ width: 16, height: 16 })
    resizedIcon.setTemplateImage(true)

    tray = new Tray(resizedIcon)
    tray.setToolTip('CLI Manager - Running in background')

    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Show CLI Manager',
            click: () => {
                showFromBackground()
            }
        },
        { type: 'separator' },
        {
            label: `${terminalManager.getTerminalCount()} Terminal(s) Active`,
            enabled: false
        },
        { type: 'separator' },
        {
            label: 'Quit',
            click: () => {
                isQuitting = true
                terminalManager.killAll()
                app.quit()
            }
        }
    ])

    tray.setContextMenu(contextMenu)

    tray.on('click', () => {
        showFromBackground()
    })
}

function enterBackgroundMode(): void {
    isBackgroundMode = true
    createTray()

    BrowserWindow.getAllWindows().forEach(win => {
        win.hide()
    })

    if (process.platform === 'darwin' && app.dock) {
        app.dock.hide()
    }
}

function showFromBackground(): void {
    isBackgroundMode = false

    if (process.platform === 'darwin' && app.dock) {
        app.dock.show()
    }

    const windows = BrowserWindow.getAllWindows()
    if (windows.length === 0) {
        createWindow()
    } else {
        windows.forEach(win => {
            win.show()
            win.focus()
        })
    }

    if (tray) {
        tray.destroy()
        tray = null
    }
}

function sendUpdateStatus(status: string, data?: any) {
    BrowserWindow.getAllWindows().forEach(win => {
        win.webContents.send('update-status', { status, ...data })
    })
}

autoUpdater.on('checking-for-update', () => {
    sendUpdateStatus('checking')
})

autoUpdater.on('update-available', (info) => {
    sendUpdateStatus('available', { version: info.version })
})

autoUpdater.on('update-not-available', () => {
    sendUpdateStatus('not-available')
})

autoUpdater.on('download-progress', (progress) => {
    sendUpdateStatus('downloading', { percent: Math.round(progress.percent) })
})

autoUpdater.on('update-downloaded', (info) => {
    sendUpdateStatus('ready', { version: info.version })
})

autoUpdater.on('error', (err) => {
    console.error('Update error:', err)
    sendUpdateStatus('error', { message: (err instanceof Error ? err.message : String(err)) })
})
