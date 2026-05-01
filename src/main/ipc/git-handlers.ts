import { ipcMain } from 'electron'
import path from 'path'
import { existsSync } from 'fs'
import simpleGit from 'simple-git'

export function registerGitHandlers(): void {
    ipcMain.handle('get-git-status', async (_, workspacePath: string) => {
        try {
            const git = simpleGit(workspacePath)
            const isRepo = await git.checkIsRepo()
            if (!isRepo) return null

            const status = await git.status()
            const mergeHeadPath = path.join(workspacePath, '.git', 'MERGE_HEAD')
            const isMerging = existsSync(mergeHeadPath)

            const renamedFiles = status.renamed.map(r => r.to)
            const allStaged = [...new Set([...status.staged, ...renamedFiles])]

            return {
                branch: status.current || 'unknown',
                modified: status.modified,
                staged: allStaged,
                untracked: status.not_added,
                conflicted: status.conflicted,
                deleted: status.deleted,
                renamed: status.renamed.map(r => ({ from: r.from, to: r.to })),
                created: status.created,
                ahead: status.ahead,
                behind: status.behind,
                isMerging
            }
        } catch (e) {
            console.error('Git status error:', e)
            return null
        }
    })

    ipcMain.handle('git-stage', async (_, workspacePath: string, file: string) => {
        try {
            const git = simpleGit(workspacePath)
            await git.add(file)
            return true
        } catch (e) {
            console.error('Git stage error:', e)
            throw e
        }
    })

    ipcMain.handle('git-stage-all', async (_, workspacePath: string) => {
        try {
            const git = simpleGit(workspacePath)
            await git.add('.')
            return true
        } catch (e) {
            console.error('Git stage all error:', e)
            throw e
        }
    })

    ipcMain.handle('git-stage-files', async (_, workspacePath: string, files: string[]) => {
        try {
            const git = simpleGit(workspacePath)
            await git.add(files)
            return true
        } catch (e) {
            console.error('Git stage files error:', e)
            throw e
        }
    })

    ipcMain.handle('git-unstage', async (_, workspacePath: string, file: string) => {
        try {
            const git = simpleGit(workspacePath)
            await git.reset(['HEAD', file])
            return true
        } catch (e) {
            console.error('Git unstage error:', e)
            throw e
        }
    })

    ipcMain.handle('git-unstage-all', async (_, workspacePath: string) => {
        try {
            const git = simpleGit(workspacePath)
            await git.reset(['HEAD'])
            return true
        } catch (e) {
            console.error('Git unstage all error:', e)
            throw e
        }
    })

    ipcMain.handle('git-commit', async (_, workspacePath: string, message: string) => {
        try {
            const git = simpleGit(workspacePath)
            await git.commit(message)
            return true
        } catch (e) {
            console.error('Git commit error:', e)
            throw e
        }
    })

    ipcMain.handle('git-push', async (_, workspacePath: string) => {
        try {
            const git = simpleGit(workspacePath)
            const status = await git.status()
            const currentBranch = status.current
            const tracking = status.tracking

            if (!tracking && currentBranch) {
                await git.push(['--set-upstream', 'origin', currentBranch])
            } else {
                await git.push()
            }

            return true
        } catch (e) {
            console.error('Git push error:', e)
            throw e
        }
    })

    ipcMain.handle('git-pull', async (_, workspacePath: string) => {
        try {
            const git = simpleGit(workspacePath)
            await git.pull()
            return true
        } catch (e) {
            console.error('Git pull error:', e)
            throw e
        }
    })

    ipcMain.handle('git-log', async (_, workspacePath: string, limit: number = 20) => {
        try {
            const git = simpleGit(workspacePath)
            const log = await git.log({ maxCount: limit })
            return log.all.map(commit => ({
                hash: commit.hash,
                message: commit.message,
                author: commit.author_name,
                date: commit.date
            }))
        } catch (e) {
            console.error('Git log error:', e)
            throw e
        }
    })

    ipcMain.handle('git-reset', async (_, workspacePath: string, commitHash: string, hard: boolean = false) => {
        try {
            const git = simpleGit(workspacePath)
            if (hard) {
                await git.reset(['--hard', commitHash])
            } else {
                await git.reset(['--soft', commitHash])
            }
            return true
        } catch (e) {
            console.error('Git reset error:', e)
            throw e
        }
    })

    ipcMain.handle('git-list-branches', async (_, workspacePath: string) => {
        try {
            const git = simpleGit(workspacePath)
            const isRepo = await git.checkIsRepo()
            if (!isRepo) return null

            const branchSummary = await git.branch()

            let worktreeBranches: string[] = []
            try {
                const worktreeOutput = await git.raw(['worktree', 'list', '--porcelain'])
                const lines = worktreeOutput.split('\n')
                for (const line of lines) {
                    if (line.startsWith('branch refs/heads/')) {
                        const branchName = line.replace('branch refs/heads/', '')
                        worktreeBranches.push(branchName)
                    }
                }
            } catch {
                // Silently ignore worktree errors
            }

            return {
                current: branchSummary.current,
                all: branchSummary.all,
                branches: branchSummary.branches,
                worktreeBranches
            }
        } catch (e) {
            console.error('Git list branches error:', e)
            throw e
        }
    })

    ipcMain.handle('git-checkout', async (_, workspacePath: string, branchName: string) => {
        try {
            const git = simpleGit(workspacePath)
            await git.checkout(branchName)
            return true
        } catch (e) {
            console.error('Git checkout error:', e)
            throw e
        }
    })

    ipcMain.handle('git-merge', async (_, workspacePath: string, branchName: string) => {
        try {
            const git = simpleGit(workspacePath)
            const beforeStatus = await git.status()

            if (!beforeStatus.isClean()) {
                const uncommittedFiles = [...beforeStatus.modified, ...beforeStatus.staged, ...beforeStatus.not_added]
                return {
                    success: false,
                    error: `Cannot merge: You have uncommitted changes.\n\nModified files:\n${uncommittedFiles.join('\n')}\n\nPlease commit or stash your changes first.`,
                    errorType: 'UNKNOWN_ERROR',
                    data: { merged: false, uncommittedChanges: uncommittedFiles }
                }
            }

            const result = await git.merge([branchName])
            const afterStatus = await git.status()

            if (result.failed) {
                return {
                    success: false,
                    error: 'Merge conflict occurred',
                    errorType: 'UNKNOWN_ERROR',
                    data: { merged: false, conflicts: afterStatus.conflicted }
                }
            }

            const noChanges = result.summary.changes === 0 && result.summary.insertions === 0 && result.summary.deletions === 0
            if (noChanges) {
                return {
                    success: true,
                    data: { merged: true, alreadyUpToDate: true }
                }
            }

            return { success: true, data: { merged: true, alreadyUpToDate: false } }
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            if (msg?.includes('CONFLICTS') || msg?.includes('conflict')) {
                const git = simpleGit(workspacePath)
                const status = await git.status()
                return {
                    success: false,
                    error: 'Merge conflict occurred',
                    errorType: 'UNKNOWN_ERROR',
                    data: { merged: false, conflicts: status.conflicted }
                }
            }
            return { success: false, error: msg, errorType: 'UNKNOWN_ERROR' }
        }
    })

    ipcMain.handle('git-merge-abort', async (_, workspacePath: string) => {
        try {
            const git = simpleGit(workspacePath)
            await git.merge(['--abort'])
            return { success: true }
        } catch (e) {
            console.error('Git merge abort error:', e)
            return { success: false, error: (e instanceof Error ? e.message : String(e)), errorType: 'UNKNOWN_ERROR' }
        }
    })

    ipcMain.handle('git-delete-branch', async (_, workspacePath: string, branchName: string, force: boolean = false) => {
        try {
            const git = simpleGit(workspacePath)
            const flag = force ? '-D' : '-d'
            await git.branch([flag, branchName])
            return { success: true }
        } catch (e) {
            console.error('Git delete branch error:', e)
            return { success: false, error: (e instanceof Error ? e.message : String(e)), errorType: 'UNKNOWN_ERROR' }
        }
    })
}
