import { ipcMain } from 'electron'
import simpleGit from 'simple-git'
import { IPCResult } from '../../shared/types'
import { execWithShell, shellQuote } from '../utils/shell'

export function registerGitHubHandlers(): void {
    ipcMain.handle('gh-check-auth', async () => {
        try {
            const { stdout } = await execWithShell('gh auth status')
            return { authenticated: true, message: stdout }
        } catch (e) {
            return { authenticated: false, message: (e instanceof Error ? e.message : String(e)) }
        }
    })

    ipcMain.handle('gh-auth-login', async () => {
        try {
            const { stdout, stderr } = await execWithShell('gh auth login --web')
            return { success: true, message: stdout || stderr }
        } catch (e) {
            return { success: false, message: (e instanceof Error ? e.message : String(e)) }
        }
    })

    ipcMain.handle('gh-create-pr', async (_, workspacePath: string, title: string, body: string) => {
        try {
            const { stdout } = await execWithShell(`gh pr create --title ${shellQuote(title)} --body ${shellQuote(body)}`, { cwd: workspacePath })
            return { success: true, url: stdout.trim() }
        } catch (e) {
            console.error('GitHub PR creation error:', e)
            throw new Error((e instanceof Error ? e.message : String(e)))
        }
    })

    ipcMain.handle('gh-list-prs', async (_, workspacePath: string) => {
        try {
            const { stdout } = await execWithShell('gh pr list --json number,title,state,author,url', { cwd: workspacePath })
            return JSON.parse(stdout)
        } catch (e) {
            console.error('GitHub PR list error:', e)
            throw new Error((e instanceof Error ? e.message : String(e)))
        }
    })

    ipcMain.handle('gh-repo-view', async (_, workspacePath: string) => {
        try {
            const { stdout } = await execWithShell('gh repo view --json name,owner,url,description,defaultBranchRef', { cwd: workspacePath })
            return JSON.parse(stdout)
        } catch (e) {
            console.error('GitHub repo view error:', e)
            return null
        }
    })

    ipcMain.handle('gh-workflow-status', async (_, workspacePath: string) => {
        try {
            const { stdout } = await execWithShell('gh run list --json status,conclusion,name,headBranch,createdAt,url --limit 10', { cwd: workspacePath })
            return { success: true, data: JSON.parse(stdout) }
        } catch (e) {
            console.error('GitHub workflow status error:', e)
            return { success: false, error: (e instanceof Error ? e.message : String(e)), errorType: 'UNKNOWN_ERROR' }
        }
    })

    ipcMain.handle('gh-push-branch', async (_, workspacePath: string, branchName: string): Promise<IPCResult<void>> => {
        try {
            try {
                await execWithShell('gh --version')
            } catch {
                return { success: false, error: 'GitHub CLI not found', errorType: 'GH_CLI_NOT_FOUND' }
            }

            try {
                await execWithShell('gh auth status')
            } catch {
                return { success: false, error: 'Not authenticated with GitHub', errorType: 'GH_NOT_AUTHENTICATED' }
            }

            const git = simpleGit(workspacePath)
            await git.push('origin', branchName, ['--set-upstream'])
            return { success: true }
        } catch (e) {
            console.error('GitHub push error:', e)
            return { success: false, error: (e instanceof Error ? e.message : String(e)), errorType: 'UNKNOWN_ERROR' }
        }
    })

    ipcMain.handle('gh-merge-pr', async (_, workspacePath: string, prNumber: number) => {
        try {
            const prNum = Number(prNumber)
            if (!Number.isFinite(prNum) || prNum < 1) {
                throw new Error(`Invalid PR number: ${prNumber}`)
            }
            const { stdout } = await execWithShell(`gh pr merge ${prNum} --merge`, { cwd: workspacePath })
            return { success: true, message: stdout }
        } catch (e) {
            console.error('GitHub PR merge error:', e)
            throw new Error((e instanceof Error ? e.message : String(e)))
        }
    })

    ipcMain.handle('gh-create-pr-from-worktree', async (_, workspacePath: string, branchName: string, title: string, body: string): Promise<IPCResult<{ url: string }>> => {
        try {
            try {
                await execWithShell('gh --version')
            } catch {
                return { success: false, error: 'GitHub CLI not found', errorType: 'GH_CLI_NOT_FOUND' }
            }

            try {
                await execWithShell('gh auth status')
            } catch {
                return { success: false, error: 'Not authenticated with GitHub', errorType: 'GH_NOT_AUTHENTICATED' }
            }

            const git = simpleGit(workspacePath)
            const status = await git.status()

            if (status.ahead > 0) {
                await git.push('origin', branchName, ['--set-upstream'])
            }

            const { stdout } = await execWithShell(`gh pr create --title ${shellQuote(title)} --body ${shellQuote(body)} --head ${shellQuote(branchName)}`, { cwd: workspacePath })
            return { success: true, data: { url: stdout.trim() } }
        } catch (e) {
            console.error('GitHub PR creation error:', e)
            return { success: false, error: (e instanceof Error ? e.message : String(e)), errorType: 'UNKNOWN_ERROR' }
        }
    })
}
