import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import os from 'os'

vi.mock('os', () => ({
    default: {
        platform: vi.fn()
    }
}))

vi.mock('fs', () => ({
    existsSync: vi.fn()
}))

vi.mock('child_process', () => ({
    execSync: vi.fn()
}))

vi.mock('electron', () => ({
    ipcMain: {
        handle: vi.fn(),
        on: vi.fn()
    },
    BrowserWindow: {
        getAllWindows: vi.fn().mockReturnValue([])
    }
}))

describe('TerminalManager shell resolution', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        delete process.env.SHELL
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('uses env.SHELL on Linux', () => {
        vi.stubGlobal('process', { ...process, env: { SHELL: '/usr/bin/fish' }, platform: 'linux' })

        const envShell = process.env.SHELL
        const defaultShell = envShell || (process.platform === 'darwin' ? 'zsh' : 'bash')

        expect(defaultShell).toBe('/usr/bin/fish')
    })

    it('falls back to bash on Linux without env.SHELL', () => {
        vi.stubGlobal('process', { ...process, env: {}, platform: 'linux' })

        const envShell = process.env.SHELL
        const defaultShell = envShell || (process.platform === 'darwin' ? 'zsh' : 'bash')

        expect(defaultShell).toBe('bash')
    })

    it('uses zsh on macOS without env.SHELL', () => {
        vi.stubGlobal('process', { ...process, env: {}, platform: 'darwin' })

        const envShell = process.env.SHELL
        const defaultShell = envShell || (process.platform === 'darwin' ? 'zsh' : 'bash')

        expect(defaultShell).toBe('zsh')
    })

    it('uses powershell on Windows', () => {
        vi.stubGlobal('process', { ...process, env: {}, platform: 'win32' })
        ;(os.platform as any).mockReturnValue('win32')

        const defaultShell = os.platform() === 'win32' ? 'powershell.exe' : 'bash'

        expect(defaultShell).toBe('powershell.exe')
    })

    it('has correct Linux fallback shell order', () => {
        ;(os.platform as any).mockReturnValue('linux')

        const FALLBACK_SHELLS = os.platform() === 'win32'
            ? ['powershell.exe', 'cmd.exe']
            : (os.platform() === 'darwin'
                ? ['/bin/zsh', '/bin/bash', '/bin/sh']
                : ['/bin/bash', '/bin/sh', '/bin/zsh'])

        expect(FALLBACK_SHELLS).toEqual(['/bin/bash', '/bin/sh', '/bin/zsh'])
    })

    it('has correct macOS fallback shell order', () => {
        ;(os.platform as any).mockReturnValue('darwin')

        const FALLBACK_SHELLS = os.platform() === 'win32'
            ? ['powershell.exe', 'cmd.exe']
            : (os.platform() === 'darwin'
                ? ['/bin/zsh', '/bin/bash', '/bin/sh']
                : ['/bin/bash', '/bin/sh', '/bin/zsh'])

        expect(FALLBACK_SHELLS).toEqual(['/bin/zsh', '/bin/bash', '/bin/sh'])
    })
})
