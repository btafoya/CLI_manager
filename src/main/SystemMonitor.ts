import { exec } from 'child_process'
import { ipcMain } from 'electron'
import { SystemInfo, Workspace } from '../shared/types'
import { promisify } from 'util'
import os from 'os'
import Store from 'electron-store'
import { readFile } from 'fs/promises'
import { existsSync } from 'fs'

const execAsync = promisify(exec)

/**
 * SystemMonitor - On-demand system information collector
 *
 * Collects CPU, RAM, Disk, Battery, Uptime, and Terminal info
 * only when requested (no background polling).
 * Uses Node.js os module + platform-specific shell commands.
 */
export class SystemMonitor {
    private store: any
    private readonly isMac = process.platform === 'darwin'
    private readonly isLinux = process.platform === 'linux'

    constructor(store: Store) {
        this.store = store

        // Register IPC handler - fetches data only when popover opens
        ipcMain.handle('get-system-info', async () => {
            return this.getSystemInfo()
        })
    }

    /**
     * Collect all system info in parallel for speed
     */
    private async getSystemInfo(): Promise<SystemInfo> {
        const [cpuInfo, diskInfo, batteryInfo] = await Promise.all([
            this.getCPUUsage(),
            this.getDiskInfo(),
            this.getBatteryInfo()
        ])

        // These are synchronous (Node.js os module) - no need to await
        const memoryInfo = this.getMemoryInfo()
        const uptimeInfo = this.getUptimeInfo()
        const terminalInfo = this.getTerminalInfo()

        return {
            cpu: cpuInfo,
            memory: memoryInfo,
            disk: diskInfo,
            battery: batteryInfo,
            uptime: uptimeInfo,
            terminal: terminalInfo
        }
    }

    /**
     * CPU usage - platform specific
     * macOS: `top` command
     * Linux: `/proc/stat` (fastest, no shell exec)
     */
    private async getCPUUsage(): Promise<SystemInfo['cpu']> {
        const cpus = os.cpus()
        const defaultCpu: SystemInfo['cpu'] = {
            model: cpus[0]?.model || 'Unknown',
            count: cpus.length,
            usage: { user: 0, sys: 0, idle: 100, total: 0 }
        }

        if (this.isLinux) {
            return this.getLinuxCPUUsage(defaultCpu)
        }

        // macOS
        try {
            // top -l 1 -n 0: single snapshot, no process list (faster)
            const { stdout } = await execAsync('top -l 1 -n 0', { timeout: 5000 })
            const cpuMatch = stdout.match(/CPU usage: ([\d.]+)%\s+user,\s+([\d.]+)%\s+sys,\s+([\d.]+)%\s+idle/)

            if (cpuMatch) {
                const user = parseFloat(cpuMatch[1])
                const sys = parseFloat(cpuMatch[2])
                const idle = parseFloat(cpuMatch[3])
                return {
                    ...defaultCpu,
                    usage: { user, sys, idle, total: Math.round((user + sys) * 10) / 10 }
                }
            }
        } catch (error) {
            console.error('[SystemMonitor] Failed to get CPU usage:', error)
        }

        return defaultCpu
    }

    /**
     * Read CPU usage from /proc/stat (Linux only)
     * Calculates usage delta between two readings 100ms apart
     */
    private async getLinuxCPUUsage(defaultCpu: SystemInfo['cpu']): Promise<SystemInfo['cpu']> {
        try {
            const parseStat = (data: string) => {
                const line = data.split('\n')[0] // cpu line
                const parts = line.split(/\s+/).slice(1).map(Number)
                // user, nice, system, idle, iowait, irq, softirq, steal, guest, guest_nice
                const user = parts[0] + parts[1]
                const sys = parts[2] + parts[5] + parts[6]
                const idle = parts[3] + parts[4]
                const total = parts.reduce((a, b) => a + b, 0)
                return { user, sys, idle, total }
            }

            const stat1 = await readFile('/proc/stat', 'utf-8')
            const data1 = parseStat(stat1)

            // Wait 100ms for delta
            await new Promise(r => setTimeout(r, 100))

            const stat2 = await readFile('/proc/stat', 'utf-8')
            const data2 = parseStat(stat2)

            const totalDelta = data2.total - data1.total
            if (totalDelta === 0) return defaultCpu

            const userPercent = ((data2.user - data1.user) / totalDelta) * 100
            const sysPercent = ((data2.sys - data1.sys) / totalDelta) * 100
            const idlePercent = ((data2.idle - data1.idle) / totalDelta) * 100

            return {
                ...defaultCpu,
                usage: {
                    user: Math.round(userPercent * 10) / 10,
                    sys: Math.round(sysPercent * 10) / 10,
                    idle: Math.round(idlePercent * 10) / 10,
                    total: Math.round((userPercent + sysPercent) * 10) / 10
                }
            }
        } catch (error) {
            console.error('[SystemMonitor] Failed to read /proc/stat:', error)
            return defaultCpu
        }
    }

    /**
     * Memory info via Node.js os module (built-in, fast, cross-platform)
     */
    private getMemoryInfo(): SystemInfo['memory'] {
        const total = os.totalmem()
        const free = os.freemem()
        const used = total - free

        return {
            totalGB: (total / 1024 / 1024 / 1024).toFixed(1),
            usedGB: (used / 1024 / 1024 / 1024).toFixed(1),
            freeGB: (free / 1024 / 1024 / 1024).toFixed(1),
            usagePercent: Math.round((used / total) * 100)
        }
    }

    /**
     * Disk usage - works on both macOS and Linux with df
     */
    private async getDiskInfo(): Promise<SystemInfo['disk']> {
        const defaultDisk: SystemInfo['disk'] = {
            total: '-', used: '-', available: '-', usagePercent: '-'
        }

        try {
            const { stdout } = await execAsync('df -h /', { timeout: 3000 })
            const lines = stdout.split('\n')
            // Skip header line, get data line
            const dataLine = lines[1]

            if (dataLine) {
                const parts = dataLine.split(/\s+/)
                return {
                    total: parts[1] || '-',
                    used: parts[2] || '-',
                    available: parts[3] || '-',
                    usagePercent: parts[4] || '-'
                }
            }
        } catch (error) {
            console.error('[SystemMonitor] Failed to get disk info:', error)
        }

        return defaultDisk
    }

    /**
     * Battery info - platform specific
     * macOS: `pmset` command
     * Linux: `/sys/class/power_supply/BAT0/uevent`
     */
    private async getBatteryInfo(): Promise<SystemInfo['battery']> {
        if (this.isLinux) {
            return this.getLinuxBatteryInfo()
        }

        // macOS
        try {
            const { stdout } = await execAsync('pmset -g batt', { timeout: 3000 })

            const powerSource = stdout.includes('AC Power') ? 'AC' as const : 'Battery' as const
            const batteryMatch = stdout.match(/(\d+)%/)
            const statusMatch = stdout.match(/(charging|discharging|charged)/)

            // If no battery percentage found, this is likely a desktop Mac
            if (!batteryMatch) return null

            return {
                percent: parseInt(batteryMatch[1]),
                status: (statusMatch ? statusMatch[1] : 'unknown') as SystemInfo['battery'] extends null ? never : NonNullable<SystemInfo['battery']>['status'],
                powerSource
            }
        } catch {
            // No battery available (desktop Mac)
            return null
        }
    }

    /**
     * Read battery info from Linux sysfs
     */
    private async getLinuxBatteryInfo(): Promise<SystemInfo['battery']> {
        const batteryPaths = [
            '/sys/class/power_supply/BAT0/uevent',
            '/sys/class/power_supply/BAT1/uevent'
        ]

        for (const batteryPath of batteryPaths) {
            if (!existsSync(batteryPath)) continue

            try {
                const data = await readFile(batteryPath, 'utf-8')
                const lines = data.split('\n')

                let capacity: number | null = null
                let status = 'unknown'
                let powerSource: 'AC' | 'Battery' = 'Battery'

                for (const line of lines) {
                    if (line.startsWith('POWER_SUPPLY_CAPACITY=')) {
                        capacity = parseInt(line.split('=')[1])
                    }
                    if (line.startsWith('POWER_SUPPLY_STATUS=')) {
                        const rawStatus = line.split('=')[1].toLowerCase()
                        if (rawStatus === 'charging') status = 'charging'
                        else if (rawStatus === 'discharging') status = 'discharging'
                        else if (rawStatus === 'full' || rawStatus === 'not charging') status = 'charged'
                    }
                    if (line.startsWith('POWER_SUPPLY_ONLINE=')) {
                        const online = line.split('=')[1]
                        if (online === '1') powerSource = 'AC'
                    }
                }

                if (capacity !== null) {
                    return {
                        percent: capacity,
                        status: status as SystemInfo['battery'] extends null ? never : NonNullable<SystemInfo['battery']>['status'],
                        powerSource
                    }
                }
            } catch (error) {
                console.error(`[SystemMonitor] Failed to read ${batteryPath}:`, error)
            }
        }

        // No battery found (desktop Linux)
        return null
    }

    /**
     * System uptime via Node.js os module (built-in, cross-platform)
     */
    private getUptimeInfo(): SystemInfo['uptime'] {
        const seconds = os.uptime()
        const days = Math.floor(seconds / 86400)
        const hours = Math.floor((seconds % 86400) / 3600)
        const minutes = Math.floor((seconds % 3600) / 60)

        let formatted = ''
        if (days > 0) formatted += `${days}d `
        formatted += `${hours}h ${minutes}m`

        return { formatted: formatted.trim(), seconds }
    }

    /**
     * Terminal session/workspace counts from electron-store
     */
    private getTerminalInfo(): SystemInfo['terminal'] {
        try {
            const workspaces = (this.store.get('workspaces') as Workspace[] | undefined) || []
            // Count only non-worktree workspaces
            const workspaceCount = workspaces.filter(w => !w.parentWorkspaceId).length
            // Count all sessions across all workspaces
            const activeSessionCount = workspaces.reduce(
                (sum, w) => sum + (w.sessions?.length || 0), 0
            )

            return { activeSessionCount, workspaceCount }
        } catch {
            return { activeSessionCount: 0, workspaceCount: 0 }
        }
    }
}
