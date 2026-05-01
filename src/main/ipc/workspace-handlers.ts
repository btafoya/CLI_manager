import { ipcMain, dialog, BrowserWindow } from 'electron'
import path from 'path'
import { existsSync, mkdirSync } from 'fs'
import simpleGit from 'simple-git'
import { store } from '../store'
import { Workspace, TerminalSession, UserSettings, IPCResult, WorkspaceFolder } from '../../shared/types'
import { v4 as uuidv4 } from 'uuid'
import { syncWorktreeWorkspaces } from '../utils/git-helpers'
import { ensureHomeWorkspace } from '../utils/workspace-helpers'

export function registerWorkspaceHandlers(): void {
    ipcMain.handle('get-workspaces', () => {
        ensureHomeWorkspace()
        const workspaces = store.get('workspaces') as Workspace[]
        return workspaces.sort((a, b) => {
            if (a.isHome) return -1
            if (b.isHome) return 1
            return a.createdAt - b.createdAt
        })
    })

    ipcMain.handle('sync-worktree-workspaces', async (): Promise<IPCResult<{ imported: number; removed: number; updated: number }>> => {
        try {
            const result = await syncWorktreeWorkspaces()
            return { success: true, data: result }
        } catch (e) {
            console.error('[sync-worktree-workspaces] ERROR:', e)
            return { success: false, error: (e instanceof Error ? e.message : String(e)), errorType: 'UNKNOWN_ERROR' }
        }
    })

    ipcMain.handle('add-workspace', async (): Promise<IPCResult<Workspace> | null> => {
        const workspaces = store.get('workspaces') as Workspace[]

        const result = await dialog.showOpenDialog({
            properties: ['openDirectory']
        })

        if (result.canceled || result.filePaths.length === 0) {
            return null
        }

        const dirPath = result.filePaths[0]
        const name = dirPath.split('/').pop() || 'Untitled'

        const newWorkspace: Workspace = {
            id: uuidv4(),
            name,
            path: dirPath,
            sessions: [
                {
                    id: uuidv4(),
                    name: 'Main',
                    cwd: dirPath,
                    type: 'regular'
                }
            ],
            createdAt: Date.now()
        }

        store.set('workspaces', [...workspaces, newWorkspace])
        return { success: true, data: newWorkspace }
    })

    ipcMain.handle('add-worktree-workspace', async (_, parentWorkspaceId: string, branchName: string): Promise<IPCResult<Workspace>> => {
        const workspaces = store.get('workspaces') as Workspace[]
        const parentWorkspace = workspaces.find((w: Workspace) => w.id === parentWorkspaceId)

        if (!parentWorkspace) {
            return { success: false, error: 'Parent workspace not found', errorType: 'UNKNOWN_ERROR' }
        }

        const git = simpleGit(parentWorkspace.path)
        const settings = store.get('settings') as UserSettings

        const sanitizedBranchName = branchName.replace(/\//g, '-')

        let worktreePath: string
        if (settings?.worktreePath) {
            worktreePath = path.join(settings.worktreePath, parentWorkspace.name, sanitizedBranchName)
        } else {
            worktreePath = path.join(
                path.dirname(parentWorkspace.path),
                `${parentWorkspace.name}-worktrees`,
                sanitizedBranchName
            )
        }

        const worktreesDir = path.dirname(worktreePath)
        if (!existsSync(worktreesDir)) {
            mkdirSync(worktreesDir, { recursive: true })
        }

        try {
            const isRepo = await git.checkIsRepo()
            if (!isRepo) {
                return { success: false, error: 'Not a git repository', errorType: 'NOT_A_REPO' }
            }

            const branches = await git.branch()
            if (branches.all.includes(branchName)) {
                return { success: false, error: `Branch '${branchName}' already exists`, errorType: 'BRANCH_EXISTS' }
            }

            if (existsSync(worktreePath)) {
                return { success: false, error: `Worktree path '${worktreePath}' already exists`, errorType: 'WORKTREE_EXISTS' }
            }

            await git.raw(['worktree', 'add', '-b', branchName, worktreePath])

            const newWorktreeWorkspace: Workspace = {
                id: uuidv4(),
                name: branchName,
                path: worktreePath,
                sessions: [
                    {
                        id: uuidv4(),
                        name: 'Main',
                        cwd: worktreePath,
                        type: 'regular'
                    }
                ],
                createdAt: Date.now(),
                parentWorkspaceId: parentWorkspaceId,
                branchName: branchName,
                baseBranch: branches.current || 'main'
            }

            store.set('workspaces', [...workspaces, newWorktreeWorkspace])
            return { success: true, data: newWorktreeWorkspace }
        } catch (e) {
            console.error('Failed to create worktree:', e)
            return { success: false, error: (e instanceof Error ? e.message : String(e)), errorType: 'UNKNOWN_ERROR' }
        }
    })

    ipcMain.handle('remove-workspace', async (_, id: string, deleteBranch: boolean = true) => {
        const workspaces = store.get('workspaces') as Workspace[]
        const workspace = workspaces.find((w: Workspace) => w.id === id)

        if (!workspace) return false

        if (workspace.isHome) {
            return false
        }

        if (workspace.parentWorkspaceId && workspace.branchName) {
            const parentWorkspace = workspaces.find((w: Workspace) => w.id === workspace.parentWorkspaceId)

            if (parentWorkspace) {
                const git = simpleGit(parentWorkspace.path)

                try {
                    await git.raw(['worktree', 'remove', workspace.path, '--force'])
                } catch (e) {
                    console.error('Failed to remove worktree:', e)
                }

                if (deleteBranch) {
                    try {
                        await git.branch(['-D', workspace.branchName])
                    } catch (e) {
                        console.error('Failed to delete branch:', e)
                    }
                }
            }
        }

        store.set('workspaces', workspaces.filter((w: Workspace) => w.id !== id))
        return true
    })

    ipcMain.handle('create-playground', async () => {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
        const playgroundPath = path.join(store.get('playgroundPath') as string, `playground-${timestamp}`)

        if (!existsSync(playgroundPath)) {
            mkdirSync(playgroundPath, { recursive: true })
        }

        const newWorkspace: Workspace = {
            id: uuidv4(),
            name: `Playground ${timestamp}`,
            path: playgroundPath,
            sessions: [
                {
                    id: uuidv4(),
                    name: 'Main',
                    cwd: playgroundPath,
                    type: 'regular'
                }
            ],
            createdAt: Date.now(),
            isPlayground: true
        }

        const workspaces = store.get('workspaces') as Workspace[]
        store.set('workspaces', [...workspaces, newWorkspace])

        return newWorkspace
    })

    ipcMain.handle('reorder-workspaces', (_, workspaceIds: string[]) => {
        const workspaces = store.get('workspaces') as Workspace[]

        const reorderedWorkspaces = workspaceIds
            .map(id => workspaces.find(w => w.id === id))
            .filter((w): w is Workspace => w !== undefined)

        const remainingWorkspaces = workspaces.filter(w => !workspaceIds.includes(w.id))
        const finalWorkspaces = [...reorderedWorkspaces, ...remainingWorkspaces]

        store.set('workspaces', finalWorkspaces)
        return true
    })

    ipcMain.handle('toggle-pin-workspace', (_, workspaceId: string) => {
        const workspaces = store.get('workspaces') as Workspace[]
        const workspace = workspaces.find(w => w.id === workspaceId)
        if (!workspace) return false

        workspace.isPinned = !workspace.isPinned
        store.set('workspaces', workspaces)

        BrowserWindow.getAllWindows().forEach(win => {
            win.webContents.send('workspaces-updated')
        })
        return workspace.isPinned
    })
}
