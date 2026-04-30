import { describe, it, expect } from 'vitest'
import { parseLsofOutput, parseSsOutput, parseNetstatOutput } from '../utils/portParsing'

describe('parseLsofOutput', () => {
    it('parses macOS lsof output', () => {
        const output = `COMMAND     PID   USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
node      12345 user   23u  IPv4 0x1234567890abcdef      0t0  TCP 127.0.0.1:3000 (LISTEN)
python    12346 user   24u  IPv6 0x1234567890abcdf0      0t0  TCP [::1]:8080 (LISTEN)
nginx     12347 user   25u  IPv4 0x1234567890abcdf1      0t0  TCP *:80 (LISTEN)
node      12345 user   26u  IPv4 0x1234567890abcdf2      0t0  TCP 127.0.0.1:3000 (LISTEN)`

        const result = parseLsofOutput(output)

        expect(result).toHaveLength(3)
        expect(result[0]).toEqual({ port: 80, pid: 12347, command: 'nginx', cwd: '' })
        expect(result[1]).toEqual({ port: 3000, pid: 12345, command: 'node', cwd: '' })
        expect(result[2]).toEqual({ port: 8080, pid: 12346, command: 'python', cwd: '' })
    })

    it('filters non-local ports', () => {
        const output = `COMMAND     PID   USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
node      12345 user   23u  IPv4 0x1234567890abcdef      0t0  TCP *:3000 (LISTEN)
node      12345 user   24u  IPv4 0x1234567890abcdf0      0t0  TCP 192.168.1.1:3001 (LISTEN)`

        const result = parseLsofOutput(output)
        expect(result).toHaveLength(1)
        expect(result[0].port).toBe(3000)
    })

    it('handles empty output', () => {
        const result = parseLsofOutput('')
        expect(result).toHaveLength(0)
    })

    it('sorts by port number', () => {
        const output = `COMMAND     PID   USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
nginx     12347 user   25u  IPv4 0x1      0t0  TCP 127.0.0.1:80 (LISTEN)
node      12345 user   23u  IPv4 0x2      0t0  TCP 127.0.0.1:3000 (LISTEN)
python    12346 user   24u  IPv4 0x3      0t0  TCP 127.0.0.1:808 (LISTEN)`

        const result = parseLsofOutput(output)
        expect(result.map(r => r.port)).toEqual([80, 808, 3000])
    })
})

describe('parseSsOutput', () => {
    it('parses ss -tlnp output', () => {
        const output = `State   Recv-Q   Send-Q     Local Address:Port      Peer Address:Port  Process
LISTEN  0        4096           127.0.0.1:3000           0.0.0.0:*      users:(("node",pid=12345,fd=23))
LISTEN  0        4096                 [::1]:8080              [::]:*      users:(("python",pid=12346,fd=24))
LISTEN  0        4096                   0.0.0.0:80                  0.0.0.0:*      users:(("nginx",pid=12347,fd=25))`

        const result = parseSsOutput(output)

        expect(result).toHaveLength(3)
        expect(result[0]).toEqual({ port: 80, pid: 12347, command: 'nginx' })
        expect(result[1]).toEqual({ port: 3000, pid: 12345, command: 'node' })
        expect(result[2]).toEqual({ port: 8080, pid: 12346, command: 'python' })
    })

    it('filters non-LISTEN states', () => {
        const output = `State   Recv-Q   Send-Q     Local Address:Port      Peer Address:Port  Process
ESTAB   0        0          127.0.0.1:3000         127.0.0.1:54321  users:(("node",pid=12345,fd=23))
LISTEN  0        4096       127.0.0.1:3001         0.0.0.0:*        users:(("node",pid=12345,fd=24))`

        const result = parseSsOutput(output)
        expect(result).toHaveLength(1)
        expect(result[0].port).toBe(3001)
    })

    it('filters non-local addresses', () => {
        const output = `State   Recv-Q   Send-Q     Local Address:Port      Peer Address:Port  Process
LISTEN  0        4096       192.168.1.1:3000       0.0.0.0:*        users:(("node",pid=12345,fd=23))
LISTEN  0        4096       127.0.0.1:3001         0.0.0.0:*        users:(("node",pid=12345,fd=24))`

        const result = parseSsOutput(output)
        expect(result).toHaveLength(1)
        expect(result[0].port).toBe(3001)
    })

    it('handles entries without process info', () => {
        const output = `State   Recv-Q   Send-Q     Local Address:Port      Peer Address:Port  Process
LISTEN  0        4096       127.0.0.1:3000         0.0.0.0:*`

        const result = parseSsOutput(output)
        expect(result).toHaveLength(0)
    })

    it('handles empty output', () => {
        const result = parseSsOutput('')
        expect(result).toHaveLength(0)
    })
})

describe('parseNetstatOutput', () => {
    it('parses netstat -tlnp output', () => {
        const output = `Proto Recv-Q Send-Q Local Address           Foreign Address         State       PID/Program name
tcp        0      0 127.0.0.1:3000          0.0.0.0:*               LISTEN      12345/node
tcp6       0      0 ::1:8080                :::*                    LISTEN      12346/python
tcp        0      0 0.0.0.0:80              0.0.0.0:*               LISTEN      12347/nginx`

        const result = parseNetstatOutput(output)

        expect(result).toHaveLength(3)
        expect(result[0]).toEqual({ port: 80, pid: 12347, command: 'nginx' })
        expect(result[1]).toEqual({ port: 3000, pid: 12345, command: 'node' })
        expect(result[2]).toEqual({ port: 8080, pid: 12346, command: 'python' })
    })

    it('filters non-LISTEN states', () => {
        const output = `Proto Recv-Q Send-Q Local Address           Foreign Address         State       PID/Program name
tcp        0      0 127.0.0.1:3000          127.0.0.1:54321         ESTABLISHED 12345/node
tcp        0      0 127.0.0.1:3001          0.0.0.0:*               LISTEN      12345/node`

        const result = parseNetstatOutput(output)
        expect(result).toHaveLength(1)
        expect(result[0].port).toBe(3001)
    })

    it('filters non-local addresses', () => {
        const output = `Proto Recv-Q Send-Q Local Address           Foreign Address         State       PID/Program name
tcp        0      0 192.168.1.1:3000        0.0.0.0:*               LISTEN      12345/node
tcp        0      0 127.0.0.1:3001          0.0.0.0:*               LISTEN      12345/node`

        const result = parseNetstatOutput(output)
        expect(result).toHaveLength(1)
        expect(result[0].port).toBe(3001)
    })

    it('skips entries with dash for PID', () => {
        const output = `Proto Recv-Q Send-Q Local Address           Foreign Address         State       PID/Program name
tcp        0      0 127.0.0.1:3000          0.0.0.0:*               LISTEN      -`

        const result = parseNetstatOutput(output)
        expect(result).toHaveLength(0)
    })

    it('handles empty output', () => {
        const result = parseNetstatOutput('')
        expect(result).toHaveLength(0)
    })
})
