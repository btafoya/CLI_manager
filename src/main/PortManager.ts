import { exec } from 'child_process'
import { BrowserWindow, ipcMain } from 'electron'
import { PortInfo } from '../shared/types'
import { promisify } from 'util'
import { readlink } from 'fs/promises'
import { parseLsofOutput, parseSsOutput, parseNetstatOutput } from './utils/portParsing'

const execAsync = promisify(exec)

export class PortManager {
    private interval: NodeJS.Timeout | null = null
    private readonly isMac = process.platform === 'darwin'
    private readonly isLinux = process.platform === 'linux'

    constructor() {
        // Start monitoring
        this.startMonitoring()

        // Register IPC handlers
        ipcMain.handle('kill-process', async (_, pid: number) => {
            return this.killProcess(pid)
        })

        // 수동 새로고침 핸들러
        ipcMain.handle('refresh-ports', async () => {
            await this.checkPorts()
            return true
        })
    }

    private startMonitoring() {
        // Run immediately
        this.checkPorts()

        // Then every 5 seconds
        this.interval = setInterval(() => {
            this.checkPorts()
        }, 5000)
    }

    private async checkPorts(): Promise<void> {
        try {
            let ports: PortInfo[] = []

            if (this.isMac) {
                ports = await this.checkMacPorts()
            } else if (this.isLinux) {
                ports = await this.checkLinuxPorts()
            } else {
                // Windows or other: not supported yet
                ports = []
            }

            this.broadcast(ports)
        } catch (error: any) {
            console.error('Port check error:', error)
            this.broadcast([])
        }
    }

    private async checkMacPorts(): Promise<PortInfo[]> {
        const { stdout } = await execAsync('lsof -i -P -n -sTCP:LISTEN')
        const parsed = parseLsofOutput(stdout)
        // Add CWD for each port
        return this.addCwdToPorts(parsed)
    }

    private async checkLinuxPorts(): Promise<PortInfo[]> {
        // Try ss first (modern Linux), fallback to netstat
        try {
            const { stdout } = await execAsync('ss -tlnp')
            const parsed = parseSsOutput(stdout)
            return this.addCwdToPorts(parsed)
        } catch (ssError) {
            try {
                const { stdout } = await execAsync('netstat -tlnp')
                const parsed = parseNetstatOutput(stdout)
                return this.addCwdToPorts(parsed)
            } catch (netstatError) {
                console.error('Neither ss nor netstat available for port monitoring')
                return []
            }
        }
    }

    private async addCwdToPorts(ports: { port: number; pid: number; command: string }[]): Promise<PortInfo[]> {
        const result: PortInfo[] = []
        for (const p of ports) {
            const cwd = await this.getProcessCwd(p.pid)
            result.push({ ...p, cwd })
        }
        return result
    }

    private async getProcessCwd(pid: number): Promise<string> {
        if (this.isLinux) {
            // Linux: read /proc/pid/cwd symlink (most reliable)
            try {
                const cwd = await readlink(`/proc/${pid}/cwd`)
                return cwd
            } catch {
                // Fallback to lsof if /proc not available
            }
        }

        // macOS fallback (and Linux lsof fallback)
        try {
            const { stdout } = await execAsync(`lsof -a -p ${pid} -d cwd -F n`)
            const match = stdout.match(/^n(.+)$/m)
            if (match) {
                return match[1]
            }
        } catch {
            // Ignore error
        }

        return ''
    }

    private broadcast(ports: PortInfo[]) {
        const windows = BrowserWindow.getAllWindows()
        windows.forEach((win: any) => {
            win.webContents.send('port-update', ports)
        })
    }

    public async killProcess(pid: number): Promise<boolean> {
        try {
            process.kill(pid)
            // Force refresh
            this.checkPorts()
            return true
        } catch (e) {
            console.error(`Failed to kill process ${pid}:`, e)
            return false
        }
    }

    public stop() {
        if (this.interval) {
            clearInterval(this.interval)
        }
    }
}
