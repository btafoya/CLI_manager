import { existsSync } from 'fs'
import os from 'os'
import { v4 as uuidv4 } from 'uuid'
import { store } from '../store'
import { Workspace, UserSettings } from '../../shared/types'

export function isValidPath(dirPath: string): boolean {
    try {
        return existsSync(dirPath)
    } catch {
        return false
    }
}

export function ensureHomeWorkspace(): Workspace | null {
    try {
        const settings = store.get('settings') as UserSettings | undefined
        const workspaces = store.get('workspaces') as Workspace[]
        const existingHome = workspaces.find((w: Workspace) => w.isHome)

        const showHomeWorkspace = settings?.showHomeWorkspace ?? true

        if (!showHomeWorkspace) {
            if (existingHome) {
                const filtered = workspaces.filter(w => !w.isHome)
                store.set('workspaces', filtered)
            }
            return null
        }

        const customPath = settings?.homeWorkspacePath
        let homePath: string

        if (customPath && customPath.trim()) {
            if (isValidPath(customPath)) {
                homePath = customPath
            } else {
                console.warn('[Home Workspace] Custom path invalid, falling back to system home:', customPath)
                homePath = os.homedir()
            }
        } else {
            homePath = os.homedir()
        }

        if (!isValidPath(homePath)) {
            console.error('[Home Workspace] Home path does not exist:', homePath)
            return null
        }

        if (existingHome) {
            if (existingHome.path !== homePath) {
                existingHome.path = homePath
                existingHome.sessions = existingHome.sessions.map(s => ({
                    ...s,
                    cwd: homePath
                }))
                store.set('workspaces', workspaces)
            }
            return existingHome
        }

        let username = 'user'
        let hostname = 'local'

        try {
            username = os.userInfo().username || 'user'
        } catch {
            console.warn('[Home Workspace] Could not get username')
        }

        try {
            hostname = os.hostname() || 'local'
        } catch {
            console.warn('[Home Workspace] Could not get hostname')
        }

        const homeName = `${username}@${hostname}`

        const homeWorkspace: Workspace = {
            id: uuidv4(),
            name: homeName,
            path: homePath,
            sessions: [
                {
                    id: uuidv4(),
                    name: 'Main',
                    cwd: homePath,
                    type: 'regular'
                }
            ],
            createdAt: Date.now(),
            isHome: true
        }

        store.set('workspaces', [homeWorkspace, ...workspaces])

        return homeWorkspace
    } catch (error) {
        console.error('[Home Workspace] Unexpected error:', error)
        return null
    }
}
