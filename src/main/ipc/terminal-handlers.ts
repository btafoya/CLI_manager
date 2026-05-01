import { ipcMain } from 'electron'
import { store } from '../store'
import { Workspace, TerminalSession } from '../../shared/types'
import { windowState } from '../window-state'
import { CLISessionTracker } from '../CLISessionTracker'

export function registerTerminalHandlers(cliSessionTracker: CLISessionTracker): void {
    cliSessionTracker.onSessionDetected = (info) => {
        const workspaces = store.get('workspaces') as Workspace[]
        for (const ws of workspaces) {
            const session = ws.sessions.find((s: TerminalSession) => s.id === info.terminalId)
            if (session) {
                session.cliSessionId = info.cliSessionId
                session.cliToolName = info.cliToolName
                store.set('workspaces', workspaces)

                if (windowState.mainWindow && !windowState.mainWindow.isDestroyed()) {
                    windowState.mainWindow.webContents.send('cli-session-detected', {
                        workspaceId: ws.id,
                        sessionId: info.terminalId,
                        cliSessionId: info.cliSessionId,
                        cliToolName: info.cliToolName
                    })
                }
                break
            }
        }
    }

    ipcMain.handle('update-session-cli-info', (_, workspaceId: string, sessionId: string, cliSessionId: string, cliToolName: string): boolean => {
        const workspaces = store.get('workspaces') as Workspace[]
        const ws = workspaces.find((w: Workspace) => w.id === workspaceId)
        if (!ws) return false
        const session = ws.sessions.find((s: TerminalSession) => s.id === sessionId)
        if (!session) return false
        session.cliSessionId = cliSessionId
        session.cliToolName = cliToolName
        store.set('workspaces', workspaces)
        return true
    })

    ipcMain.handle('clear-session-cli-info', (_, workspaceId: string, sessionId: string): boolean => {
        const workspaces = store.get('workspaces') as Workspace[]
        const ws = workspaces.find((w: Workspace) => w.id === workspaceId)
        if (!ws) return false
        const session = ws.sessions.find((s: TerminalSession) => s.id === sessionId)
        if (!session) return false
        delete session.cliSessionId
        delete session.cliToolName
        store.set('workspaces', workspaces)
        return true
    })

    ipcMain.handle('rewrite-cli-command', (_, command: string): { command: string; cliSessionId: string; cliToolName: string } | null => {
        return cliSessionTracker.rewriteCommand(command)
    })
}
