import { ipcMain } from 'electron'
import { store } from '../store'
import { Workspace, WorkspaceFolder } from '../../shared/types'
import { v4 as uuidv4 } from 'uuid'

export function registerFolderHandlers(): void {
    ipcMain.handle('get-folders', () => {
        return (store.get('folders') || []) as WorkspaceFolder[]
    })

    ipcMain.handle('create-folder', (_, name: string) => {
        const folders = (store.get('folders') || []) as WorkspaceFolder[]
        const newFolder: WorkspaceFolder = {
            id: uuidv4(),
            name,
            isExpanded: true,
            createdAt: Date.now()
        }
        folders.push(newFolder)
        store.set('folders', folders)
        return newFolder
    })

    ipcMain.handle('rename-folder', (_, folderId: string, newName: string) => {
        const folders = (store.get('folders') || []) as WorkspaceFolder[]
        const folder = folders.find(f => f.id === folderId)
        if (!folder) return false

        folder.name = newName
        store.set('folders', folders)
        return true
    })

    ipcMain.handle('remove-folder', (_, folderId: string) => {
        const folders = (store.get('folders') || []) as WorkspaceFolder[]
        const updatedFolders = folders.filter(f => f.id !== folderId)
        store.set('folders', updatedFolders)

        const workspaces = store.get('workspaces') as Workspace[]
        workspaces.forEach(w => {
            if (w.folderId === folderId) {
                w.folderId = undefined
            }
        })
        store.set('workspaces', workspaces)
        return true
    })

    ipcMain.handle('toggle-folder-expanded', (_, folderId: string) => {
        const folders = (store.get('folders') || []) as WorkspaceFolder[]
        const folder = folders.find(f => f.id === folderId)
        if (!folder) return false

        folder.isExpanded = !folder.isExpanded
        store.set('folders', folders)
        return folder.isExpanded
    })

    ipcMain.handle('move-workspace-to-folder', (_, workspaceId: string, folderId: string | null) => {
        const workspaces = store.get('workspaces') as Workspace[]
        const workspace = workspaces.find(w => w.id === workspaceId)
        if (!workspace) return false

        workspace.folderId = folderId || undefined
        store.set('workspaces', workspaces)
        return true
    })

    ipcMain.handle('reorder-folders', (_, folderIds: string[]) => {
        const folders = (store.get('folders') || []) as WorkspaceFolder[]
        const reorderedFolders = folderIds
            .map(id => folders.find(f => f.id === id))
            .filter((f): f is WorkspaceFolder => f !== undefined)

        const remaining = folders.filter(f => !folderIds.includes(f.id))
        store.set('folders', [...reorderedFolders, ...remaining])
        return true
    })
}
