/**
 * Port parsing utilities - pure functions for testing
 */
import { PortInfo } from '../../shared/types'

export function parseLsofOutput(output: string): PortInfo[] {
    const lines = output.split('\n')
    const ports: PortInfo[] = []
    const seen = new Set<string>()

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim()
        if (!line) continue

        const parts = line.split(/\s+/)
        if (parts.length < 9) continue

        const command = parts[0]
        const pid = parseInt(parts[1])
        const address = parts[8]

        const isLocalPort = address.includes('localhost') ||
            address.includes('127.0.0.1') ||
            address.includes('::1') ||
            address.includes('*:')
        if (!isLocalPort) continue

        const portMatch = address.match(/:(\d+)(?:\s|\)|$)/)
        if (portMatch) {
            const port = parseInt(portMatch[1])
            const key = `${port}-${pid}`

            if (!seen.has(key)) {
                ports.push({ port, pid, command, cwd: '' })
                seen.add(key)
            }
        }
    }

    return ports.sort((a, b) => a.port - b.port)
}

export function parseSsOutput(output: string): { port: number; pid: number; command: string }[] {
    const lines = output.split('\n')
    const ports: { port: number; pid: number; command: string }[] = []
    const seen = new Set<string>()

    for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('State')) continue

        const parts = trimmed.split(/\s+/)
        if (parts.length < 6) continue

        const state = parts[0]
        if (state !== 'LISTEN') continue

        const localAddress = parts[3]
        const processField = parts.slice(5).join(' ')

        const isLocalPort = localAddress.includes('127.0.0.1') ||
            localAddress.includes('localhost') ||
            localAddress.includes('::1') ||
            localAddress.startsWith('*:') ||
            localAddress.startsWith('0.0.0.0:')
        if (!isLocalPort) continue

        const portMatch = localAddress.match(/:(\d+)$/)
        if (!portMatch) continue

        const port = parseInt(portMatch[1])
        const pidMatch = processField.match(/pid=(\d+)/)
        const cmdMatch = processField.match(/"([^"]+)"/)

        if (!pidMatch) continue

        const pid = parseInt(pidMatch[1])
        const command = cmdMatch ? cmdMatch[1] : 'unknown'
        const key = `${port}-${pid}`

        if (!seen.has(key)) {
            ports.push({ port, pid, command })
            seen.add(key)
        }
    }

    return ports.sort((a, b) => a.port - b.port)
}

export function parseNetstatOutput(output: string): { port: number; pid: number; command: string }[] {
    const lines = output.split('\n')
    const ports: { port: number; pid: number; command: string }[] = []
    const seen = new Set<string>()

    for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('Proto') || trimmed.startsWith('Active')) continue

        const parts = trimmed.split(/\s+/)
        if (parts.length < 7) continue

        const proto = parts[0]
        if (!proto.startsWith('tcp')) continue

        const localAddress = parts[3]
        const state = parts[5]
        if (state !== 'LISTEN') continue

        const isLocalPort = localAddress.includes('127.0.0.1') ||
            localAddress.includes('localhost') ||
            localAddress.includes('::1') ||
            localAddress.startsWith('*:') ||
            localAddress.startsWith('0.0.0.0:')
        if (!isLocalPort) continue

        const portMatch = localAddress.match(/:(\d+)$/)
        if (!portMatch) continue

        const port = parseInt(portMatch[1])

        const pidProgram = parts[6]
        if (pidProgram === '-') continue

        const pidMatch = pidProgram.match(/^(\d+)\//)
        if (!pidMatch) continue

        const pid = parseInt(pidMatch[1])
        const command = pidProgram.split('/')[1] || 'unknown'
        const key = `${port}-${pid}`

        if (!seen.has(key)) {
            ports.push({ port, pid, command })
            seen.add(key)
        }
    }

    return ports.sort((a, b) => a.port - b.port)
}
