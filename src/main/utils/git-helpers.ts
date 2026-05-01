import path from 'path'
import simpleGit from 'simple-git'
import { existsSync } from 'fs'
import { Workspace } from '../../shared/types'
import { store } from '../store'
import { v4 as uuidv4 } from 'uuid'

export interface ParsedWorktree {
    path: string
    branchName: string
}

export interface WorktreeSyncSummary {
    imported: number
    removed: number
    updated: number
}

export function parseWorktreeListPorcelain(output: string): ParsedWorktree[] {
    const parsed: ParsedWorktree[] = []
    const entries = output.split('\n\n')

    for (const entry of entries) {
        const lines = entry.split('\n').map(line => line.trim()).filter(Boolean)
        if (lines.length === 0) continue

        let worktreePath: string | undefined
        let branchName: string | undefined

        for (const line of lines) {
            if (line.startsWith('worktree ')) {
                worktreePath = line.slice('worktree '.length).trim()
                continue
            }
            if (line.startsWith('branch refs/heads/')) {
                branchName = line.slice('branch refs/heads/'.length).trim()
            }
        }

        if (worktreePath && branchName) {
            parsed.push({
                path: path.resolve(worktreePath),
                branchName
            })
        }
    }

    return parsed
}

export async function syncWorktreeWorkspaces(): Promise<WorktreeSyncSummary> {
    const summary: WorktreeSyncSummary = { imported: 0, removed: 0, updated: 0 }

    const workspaces = (store.get('workspaces') as Workspace[]) || []
    const parentWorkspaces = workspaces.filter(w => !w.parentWorkspaceId && !w.isPlayground && !w.isHome)

    const discoveredByParent = new Map<string, Map<string, string>>()

    for (const parent of parentWorkspaces) {
        try {
            const git = simpleGit(parent.path)
            const isRepo = await git.checkIsRepo()
            if (!isRepo) continue

            const worktreeOutput = await git.raw(['worktree', 'list', '--porcelain'])
            const parsed = parseWorktreeListPorcelain(worktreeOutput)
            const parentResolvedPath = path.resolve(parent.path)

            const discovered = new Map<string, string>()
            for (const item of parsed) {
                if (item.path === parentResolvedPath) continue
                discovered.set(item.path, item.branchName)
            }

            discoveredByParent.set(parent.id, discovered)
        } catch (error) {
            console.error('[sync-worktree-workspaces] Failed to scan parent workspace:', parent.path, error)
        }
    }

    let changed = false
    const nextWorkspaces: Workspace[] = []

    for (const workspace of workspaces) {
        if (!workspace.parentWorkspaceId) {
            nextWorkspaces.push(workspace)
            continue
        }

        const discovered = discoveredByParent.get(workspace.parentWorkspaceId)
        if (!discovered) {
            nextWorkspaces.push(workspace)
            continue
        }

        const workspaceResolvedPath = path.resolve(workspace.path)
        const discoveredBranchName = discovered.get(workspaceResolvedPath)
        if (!discoveredBranchName) {
            summary.removed += 1
            changed = true
            continue
        }

        discovered.delete(workspaceResolvedPath)

        if (workspace.branchName !== discoveredBranchName) {
            summary.updated += 1
            changed = true
            nextWorkspaces.push({
                ...workspace,
                branchName: discoveredBranchName
            })
            continue
        }

        nextWorkspaces.push(workspace)
    }

    for (const parent of parentWorkspaces) {
        const discovered = discoveredByParent.get(parent.id)
        if (!discovered || discovered.size === 0) continue

        for (const [worktreePath, branchName] of discovered.entries()) {
            const alreadyTracked = nextWorkspaces.some(workspace => path.resolve(workspace.path) === worktreePath)
            if (alreadyTracked) continue

            const importedWorkspace: Workspace = {
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
                parentWorkspaceId: parent.id,
                branchName
            }

            nextWorkspaces.push(importedWorkspace)
            summary.imported += 1
            changed = true
        }
    }

    if (changed) {
        store.set('workspaces', nextWorkspaces)
    }

    return summary
}
