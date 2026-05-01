import { ipcMain } from 'electron'
import { TerminalManager } from '../TerminalManager'
import { CLISessionTracker } from '../CLISessionTracker'
import { registerWorkspaceHandlers } from './workspace-handlers'
import { registerSessionHandlers } from './session-handlers'
import { registerFolderHandlers } from './folder-handlers'
import { registerGitHandlers } from './git-handlers'
import { registerGitHubHandlers } from './github-handlers'
import { registerSettingsHandlers } from './settings-handlers'
import { registerTerminalHandlers } from './terminal-handlers'
import { registerFileSearchHandlers } from './file-search-handlers'
import { registerSystemHandlers } from './system-handlers'
import { registerWindowHandlers } from './window-handlers'
import { registerUpdateHandlers } from './update-handlers'

export function registerAllHandlers(deps: {
    terminalManager: TerminalManager
    cliSessionTracker: CLISessionTracker
    onInstallUpdate: () => void
}): void {
    registerWorkspaceHandlers()
    registerSessionHandlers()
    registerFolderHandlers()
    registerGitHandlers()
    registerGitHubHandlers()
    registerSettingsHandlers()
    registerTerminalHandlers(deps.cliSessionTracker)
    registerFileSearchHandlers()
    registerSystemHandlers()
    registerWindowHandlers()
    registerUpdateHandlers(deps.terminalManager, deps.onInstallUpdate)
}
