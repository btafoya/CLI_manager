import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFile } from 'fs/promises'
import { existsSync } from 'fs'

vi.mock('fs/promises', () => ({
    readFile: vi.fn()
}))

vi.mock('fs', () => ({
    existsSync: vi.fn()
}))

vi.mock('electron', () => ({
    ipcMain: {
        handle: vi.fn()
    }
}))

vi.mock('electron-store', () => ({
    default: vi.fn().mockImplementation(() => ({
        get: vi.fn().mockReturnValue([])
    }))
}))

import { SystemMonitor } from '../SystemMonitor'

describe('SystemMonitor Linux battery', () => {
    let monitor: SystemMonitor
    const store: any = {}

    beforeEach(() => {
        vi.clearAllMocks()
        monitor = new SystemMonitor(store)
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('parses Linux battery uevent', async () => {
        vi.stubGlobal('process', { ...process, platform: 'linux' })
        ;(existsSync as any).mockReturnValue(true)
        ;(readFile as any).mockResolvedValue(`POWER_SUPPLY_NAME=BAT0
POWER_SUPPLY_STATUS=Charging
POWER_SUPPLY_PRESENT=1
POWER_SUPPLY_TECHNOLOGY=Li-ion
POWER_SUPPLY_CYCLE_COUNT=0
POWER_SUPPLY_VOLTAGE_MIN_DESIGN=11400000
POWER_SUPPLY_VOLTAGE_NOW=12407000
POWER_SUPPLY_POWER_NOW=0
POWER_SUPPLY_ENERGY_FULL_DESIGN=50100000
POWER_SUPPLY_ENERGY_FULL=44100000
POWER_SUPPLY_ENERGY_NOW=43580000
POWER_SUPPLY_CAPACITY=98
POWER_SUPPLY_CAPACITY_LEVEL=Normal
POWER_SUPPLY_MODEL_NAME=DELL 01VV1X
POWER_SUPPLY_MANUFACTURER=SMP
POWER_SUPPLY_SERIAL_NUMBER=1234`)

        const result = await (monitor as any).getLinuxBatteryInfo()

        expect(result).toEqual({
            percent: 98,
            status: 'charging',
            powerSource: 'Battery'
        })
    })

    it('returns null when no battery found', async () => {
        vi.stubGlobal('process', { ...process, platform: 'linux' })
        ;(existsSync as any).mockReturnValue(false)

        const result = await (monitor as any).getLinuxBatteryInfo()
        expect(result).toBeNull()
    })

    it('detects AC power', async () => {
        vi.stubGlobal('process', { ...process, platform: 'linux' })
        ;(existsSync as any).mockReturnValue(true)
        ;(readFile as any).mockResolvedValue(`POWER_SUPPLY_NAME=BAT0
POWER_SUPPLY_STATUS=Full
POWER_SUPPLY_CAPACITY=100
POWER_SUPPLY_ONLINE=1`)

        const result = await (monitor as any).getLinuxBatteryInfo()

        expect(result).toEqual({
            percent: 100,
            status: 'charged',
            powerSource: 'AC'
        })
    })

    it('parses discharging status', async () => {
        vi.stubGlobal('process', { ...process, platform: 'linux' })
        ;(existsSync as any).mockReturnValue(true)
        ;(readFile as any).mockResolvedValue(`POWER_SUPPLY_NAME=BAT0
POWER_SUPPLY_STATUS=Discharging
POWER_SUPPLY_CAPACITY=45`)

        const result = await (monitor as any).getLinuxBatteryInfo()

        expect(result).toEqual({
            percent: 45,
            status: 'discharging',
            powerSource: 'Battery'
        })
    })
})

describe('SystemMonitor Linux CPU', () => {
    let monitor: SystemMonitor
    const store: any = {}

    beforeEach(() => {
        vi.clearAllMocks()
        monitor = new SystemMonitor(store)
    })

    it('calculates CPU usage from /proc/stat', async () => {
        vi.stubGlobal('process', { ...process, platform: 'linux' })
        const defaultCpu = {
            model: 'Test CPU',
            count: 4,
            usage: { user: 0, sys: 0, idle: 100, total: 0 }
        }

        // First read: total = 10000
        ;(readFile as any).mockResolvedValueOnce('cpu  1000 0 500 8500 0 0 0 0 0 0')
        // Second read after 100ms: total = 10500 (increased by 500)
        ;(readFile as any).mockResolvedValueOnce('cpu  1100 0 600 8800 0 0 0 0 0 0')

        const result = await (monitor as any).getLinuxCPUUsage(defaultCpu)

        expect(result.model).toBe('Test CPU')
        expect(result.count).toBe(4)
        expect(result.usage.total).toBeGreaterThan(0)
        expect(result.usage.total).toBeLessThan(100)
    })

    it('returns default on read error', async () => {
        vi.stubGlobal('process', { ...process, platform: 'linux' })
        const defaultCpu = {
            model: 'Test CPU',
            count: 4,
            usage: { user: 0, sys: 0, idle: 100, total: 0 }
        }

        ;(readFile as any).mockRejectedValue(new Error('Permission denied'))

        const result = await (monitor as any).getLinuxCPUUsage(defaultCpu)

        expect(result).toEqual(defaultCpu)
    })
})
