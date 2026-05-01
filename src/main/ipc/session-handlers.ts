import { ipcMain } from 'electron'
import { store } from '../store'
import { Workspace, TerminalSession, IPCResult } from '../../shared/types'
import { v4 as uuidv4 } from 'uuid'

export function registerSessionHandlers(): void {
    ipcMain.handle('add-session', async (_, workspaceId: string, type: 'regular' | 'worktree', branchName?: string, initialCommand?: string, sessionName?: string): Promise<IPCResult<TerminalSession> | null> => {
        const workspaces = store.get('workspaces') as Workspace[]
        const workspace = workspaces.find((w: Workspace) => w.id === workspaceId)

        if (!workspace) return null

        if (type === 'worktree') {
            console.warn('Use add-worktree-workspace instead')
            return null
        }

        const newSession: TerminalSession = {
            id: uuidv4(),
            name: sessionName || 'Terminal',
            cwd: workspace.path,
            type,
            initialCommand
        }

        workspace.sessions.push(newSession)
        store.set('workspaces', workspaces)

        return { success: true, data: newSession }
    })

    ipcMain.handle('remove-session', (_, workspaceId: string, sessionId: string) => {
        const workspaces = store.get('workspaces') as Workspace[]
        const workspace = workspaces.find((w: Workspace) => w.id === workspaceId)

        if (!workspace) return false

        workspace.sessions = workspace.sessions.filter(s => s.id !== sessionId)
        store.set('workspaces', workspaces.map(w =>
            w.id === workspaceId ? workspace : w
        ))

        return true
    })

    ipcMain.handle('rename-session', (_, workspaceId: string, sessionId: string, newName: string) => {
        const workspaces = store.get('workspaces') as Workspace[]
        const workspace = workspaces.find((w: Workspace) => w.id === workspaceId)

        if (!workspace) return false

        const session = workspace.sessions.find(s => s.id === sessionId)
        if (!session) return false

        session.name = newName
        store.set('workspaces', workspaces.map(w =>
            w.id === workspaceId ? workspace : w
        ))

        return true
    })

    ipcMain.handle('update-session-memo', (_, workspaceId: string, sessionId: string, memo: string) => {
        const workspaces = store.get('workspaces') as Workspace[]
        const workspace = workspaces.find((w: Workspace) => w.id === workspaceId)
        if (!workspace) return false

        const session = workspace.sessions.find(s => s.id === sessionId)
        if (!session) return false

        session.memo = memo
        store.set('workspaces', workspaces.map(w =>
            w.id === workspaceId ? workspace : w
        ))

        return true
    })

    ipcMain.handle('reorder-sessions', (_, workspaceId: string, sessionIds: string[]) => {
        const workspaces = store.get('workspaces') as Workspace[]
        const workspace = workspaces.find((w: Workspace) => w.id === workspaceId)

        if (!workspace) return false

        const reorderedSessions = sessionIds
            .map(id => workspace.sessions.find(s => s.id === id))
            .filter((s): s is TerminalSession => s !== undefined)

        workspace.sessions = reorderedSessions
        store.set('workspaces', workspaces.map(w =>
            w.id === workspaceId ? workspace : w
        ))

        return true
    })
}
