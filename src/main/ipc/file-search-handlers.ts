import { ipcMain } from 'electron'
import path from 'path'
import { existsSync, readdirSync, statSync, readFileSync } from 'fs'
import { execAsync } from '../utils/shell'

function getRipgrepPath(): string {
    if (process.env.NODE_ENV === 'development') {
        return path.join(__dirname, '../../node_modules/@vscode/ripgrep/bin/rg')
    }
    // In production, rg should be in PATH
    return 'rg'
}

export function registerFileSearchHandlers(): void {
    ipcMain.handle('search-files', async (_, workspacePath: string, searchQuery: string) => {
        try {
            const maxResults = 100
            const excludeDirs = ['.git', 'node_modules', '.next', 'dist', 'build', '.turbo', '.cache', 'coverage']
            const files: Array<{ path: string; relativePath: string; name: string }> = []

            const searchRecursive = (dir: string, basePath: string) => {
                if (files.length >= maxResults) return

                try {
                    const items = readdirSync(dir)

                    for (const item of items) {
                        if (files.length >= maxResults) break

                        const fullPath = path.join(dir, item)
                        const relativePath = path.relative(basePath, fullPath)

                        try {
                            const stat = statSync(fullPath)

                            if (stat.isDirectory()) {
                                if (!excludeDirs.includes(item) && !item.startsWith('.')) {
                                    searchRecursive(fullPath, basePath)
                                }
                            } else if (stat.isFile()) {
                                const lowerQuery = searchQuery.toLowerCase()
                                const fileName = item.toLowerCase()
                                const relPath = relativePath.toLowerCase()

                                if (fileName.includes(lowerQuery) || relPath.includes(lowerQuery)) {
                                    files.push({
                                        path: fullPath,
                                        relativePath: relativePath,
                                        name: item
                                    })
                                }
                            }
                        } catch {
                            continue
                        }
                    }
                } catch {
                    return
                }
            }

            if (searchQuery) {
                searchRecursive(workspacePath, workspacePath)
            }

            return { success: true, files }
        } catch (error) {
            console.error('[searchFiles] Error:', error)
            return { success: false, error: (error instanceof Error ? error.message : String(error)), files: [] }
        }
    })

    ipcMain.handle('search-content', async (_, workspacePath: string, searchQuery: string) => {
        try {
            const maxResults = 200
            const excludeDirs = ['.git', 'node_modules', '.next', 'dist', 'build', '.turbo', '.cache', 'coverage']

            const tryRipgrep = async (rgCommand: string, method: string) => {
                const rgArgs = [
                    '--json',
                    '--max-count', '5',
                    '--max-columns', '500',
                    '--no-heading',
                    '--line-number',
                    '--column',
                    '--smart-case',
                    '--hidden',
                    ...excludeDirs.map(dir => `--glob=!${dir}/`),
                    searchQuery,
                    '.'
                ]

                const { stdout } = await execAsync(`"${rgCommand}" ${rgArgs.join(' ')}`, { cwd: workspacePath })

                const results: Array<{
                    path: string
                    relativePath: string
                    line: number
                    column: number
                    text: string
                    matches: Array<{ start: number; end: number }>
                }> = []

                const lines = stdout.trim().split('\n')
                for (const line of lines) {
                    if (!line || results.length >= maxResults) break

                    try {
                        const data = JSON.parse(line)
                        if (data.type === 'match') {
                            const filePath = data.data.path.text
                            const lineNumber = data.data.line_number
                            const lineText = data.data.lines.text
                            const submatches = data.data.submatches || []

                            results.push({
                                path: path.join(workspacePath, filePath),
                                relativePath: filePath,
                                line: lineNumber,
                                column: submatches[0]?.start || 0,
                                text: lineText,
                                matches: submatches.map((m: { start: number; end: number }) => ({
                                    start: m.start,
                                    end: m.end
                                }))
                            })
                        }
                    } catch {
                        continue
                    }
                }

                return { success: true, results, method }
            }

            try {
                const ripgrepPath = getRipgrepPath()
                return await tryRipgrep(ripgrepPath, 'ripgrep (bundled)')
            } catch {
                try {
                    const { stdout: rgVersion } = await execAsync('which rg')
                    const systemRgPath = rgVersion.trim()
                    return await tryRipgrep(systemRgPath, 'ripgrep (system)')
                } catch {
                    const results: Array<{
                        path: string
                        relativePath: string
                        line: number
                        column: number
                        text: string
                        matches: Array<{ start: number; end: number }>
                    }> = []

                    const searchInFile = (filePath: string, basePath: string) => {
                        if (results.length >= maxResults) return

                        try {
                            const content = readFileSync(filePath, 'utf-8')
                            const lines = content.split('\n')
                            const lowerQuery = searchQuery.toLowerCase()

                            for (let i = 0; i < lines.length && results.length < maxResults; i++) {
                                const line = lines[i]
                                const lowerLine = line.toLowerCase()

                                if (lowerLine.includes(lowerQuery)) {
                                    const column = lowerLine.indexOf(lowerQuery)
                                    const matches = []
                                    let pos = 0

                                    while (pos < lowerLine.length && matches.length < 10) {
                                        const idx = lowerLine.indexOf(lowerQuery, pos)
                                        if (idx === -1) break
                                        matches.push({ start: idx, end: idx + searchQuery.length })
                                        pos = idx + searchQuery.length
                                    }

                                    results.push({
                                        path: filePath,
                                        relativePath: path.relative(basePath, filePath),
                                        line: i + 1,
                                        column,
                                        text: line.trim(),
                                        matches
                                    })
                                }
                            }
                        } catch {
                            return
                        }
                    }

                    const searchRecursive = (dir: string, basePath: string) => {
                        if (results.length >= maxResults) return

                        try {
                            const items = readdirSync(dir)

                            for (const item of items) {
                                if (results.length >= maxResults) break

                                const fullPath = path.join(dir, item)

                                try {
                                    const stat = statSync(fullPath)

                                    if (stat.isDirectory()) {
                                        if (!excludeDirs.includes(item) && !item.startsWith('.')) {
                                            searchRecursive(fullPath, basePath)
                                        }
                                    } else if (stat.isFile()) {
                                        if (stat.size > 1024 * 1024) continue

                                        const ext = path.extname(item).toLowerCase()
                                        const binaryExts = ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.woff', '.woff2', '.ttf', '.eot', '.zip', '.tar', '.gz']
                                        if (binaryExts.includes(ext)) continue

                                        searchInFile(fullPath, basePath)
                                    }
                                } catch {
                                    continue
                                }
                            }
                        } catch {
                            return
                        }
                    }

                    if (searchQuery) {
                        searchRecursive(workspacePath, workspacePath)
                    }

                    return { success: true, results, method: 'nodejs' }
                }
            }
        } catch (error) {
            return { success: false, error: (error instanceof Error ? error.message : String(error)), results: [] }
        }
    })
}
