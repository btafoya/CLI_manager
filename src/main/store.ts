import Store from 'electron-store'
import { app } from 'electron'
import { AppConfig } from '../shared/types'

export const store = new Store<AppConfig>({
    defaults: {
        workspaces: [],
        playgroundPath: app.getPath('downloads'),
        customTemplates: [],
        settings: {
            theme: 'dark',
            fontSize: 14,
            fontFamily: 'Monaco, Courier New, monospace',
            defaultShell: process.platform === 'darwin' ? 'zsh' : 'bash',
            defaultEditor: 'vscode',
            customEditorPath: undefined,
            portFilter: {
                enabled: true,
                minPort: 3000,
                maxPort: 9000
            },
            ignoredPorts: [],
            ignoredProcesses: [],
            portActionLogs: [],
            hooks: {
                enabled: true,
                claudeCode: {
                    enabled: true,
                    detectRunning: true,
                    detectReady: true,
                    detectError: false,
                    showInSidebar: true,
                    autoDismissSeconds: 5
                }
            }
        }
    }
}) as any
