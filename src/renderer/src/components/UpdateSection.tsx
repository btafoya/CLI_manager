import React, { useState, useEffect } from 'react'
import { RefreshCw, Download, CheckCircle2, AlertCircle, Loader2, HelpCircle, X } from 'lucide-react'

type UpdateStatus = 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'ready' | 'error'

interface UpdateState {
    status: UpdateStatus
    version?: string
    percent?: number
    message?: string
}

export function UpdateSection() {
    const [appVersion, setAppVersion] = useState<string>('')
    const [updateState, setUpdateState] = useState<UpdateState>({ status: 'idle' })
    const [showUpdateHelp, setShowUpdateHelp] = useState(false)

    useEffect(() => {
        window.api.getAppVersion().then(setAppVersion)
    }, [])

    useEffect(() => {
        const unsubscribe = window.api.onUpdateStatus((data: { status: string; version?: string; percent?: number; message?: string }) => {
            if (data.status === 'downloading') {
                setUpdateState({ status: 'downloading', percent: data.percent || 0 })
            } else if (data.status === 'ready') {
                setUpdateState({ status: 'ready', version: data.version })
            }
        })
        return unsubscribe
    }, [])

    const handleCheckForUpdate = async () => {
        setUpdateState({ status: 'checking' })
        try {
            const result = await window.api.checkForUpdate()
            if (result.isDev) {
                setUpdateState({ status: 'error', message: 'Dev mode' })
                return
            }
            if (!result.success) {
                setUpdateState({ status: 'error', message: result.error })
                return
            }
            if (result.hasUpdate) {
                setUpdateState({ status: 'available', version: result.version })
            } else {
                setUpdateState({ status: 'not-available' })
            }
        } catch (error) {
            setUpdateState({ status: 'error', message: error instanceof Error ? error.message : String(error) })
        }
    }

    const handleDownloadUpdate = () => {
        setUpdateState(prev => ({ ...prev, status: 'downloading', percent: 0 }))
        window.api.downloadUpdate()
    }

    const handleInstallUpdate = () => {
        window.api.installUpdate()
    }

    return (
        <div className="p-3 border-t border-white/5 space-y-2">
            {appVersion && (
                <div className="text-center leading-tight relative">
                    <div className="text-[10px] text-gray-500 flex items-center justify-center gap-1">
                        v{appVersion}
                        <button
                            onClick={() => setShowUpdateHelp(!showUpdateHelp)}
                            className="text-gray-500 hover:text-gray-300 transition-colors"
                            title="Update help"
                        >
                            <HelpCircle size={10} />
                        </button>
                    </div>
                    <a
                        href="https://solhun.com/changelog"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[9px] text-blue-500 hover:text-blue-400"
                    >
                        view changelog
                    </a>
                </div>
            )}

            {updateState.status === 'checking' && (
                <div className="flex items-center justify-center gap-1 text-[10px] text-blue-400">
                    <Loader2 size={10} className="animate-spin" />
                    <span>Checking...</span>
                </div>
            )}

            {updateState.status === 'available' && (
                <button
                    onClick={handleDownloadUpdate}
                    className="w-full px-2 py-1 text-[10px] bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors flex items-center justify-center gap-1"
                >
                    <Download size={10} />
                    Download v{updateState.version}
                </button>
            )}

            {updateState.status === 'downloading' && (
                <div className="space-y-1">
                    <div className="text-[10px] text-blue-400 text-center">
                        Downloading... {updateState.percent}%
                    </div>
                    <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-blue-500 transition-all duration-300"
                            style={{ width: `${updateState.percent || 0}%` }}
                        />
                    </div>
                </div>
            )}

            {updateState.status === 'ready' && (
                <button
                    onClick={handleInstallUpdate}
                    className="w-full px-2 py-1 text-[10px] bg-green-600 hover:bg-green-500 text-white rounded transition-colors flex items-center justify-center gap-1"
                >
                    <Download size={10} />
                    Install v{updateState.version}
                </button>
            )}

            {updateState.status === 'not-available' && (
                <div className="text-[10px] text-gray-500 text-center">
                    Up to date
                </div>
            )}

            {updateState.status === 'error' && (
                <div className="text-[10px] text-red-400 text-center truncate" title={updateState.message}>
                    Update error
                </div>
            )}

            {(updateState.status === 'idle' || updateState.status === 'not-available' || updateState.status === 'error') && (
                <button
                    onClick={handleCheckForUpdate}
                    className="w-full px-2 py-1 text-[10px] bg-white/10 hover:bg-white/20 text-gray-300 rounded transition-colors flex items-center justify-center gap-1"
                >
                    <RefreshCw size={10} />
                    Check Updates
                </button>
            )}

            {/* Update Help Modal */}
            {showUpdateHelp && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center">
                    {/* Backdrop */}
                    <div
                        className="absolute inset-0 bg-black/50"
                        onClick={() => setShowUpdateHelp(false)}
                    />
                    {/* Modal */}
                    <div className="relative w-72 p-4 bg-[#1e1e1e] border border-white/10 rounded-lg shadow-2xl text-left">
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-sm font-medium text-white">Update Troubleshooting</span>
                            <button
                                onClick={() => setShowUpdateHelp(false)}
                                className="text-gray-400 hover:text-white"
                            >
                                <X size={14} />
                            </button>
                        </div>

                        {updateState.status === 'error' && updateState.message && (
                            <div className="mb-3 p-2 bg-red-500/10 border border-red-500/20 rounded text-xs text-red-300">
                                <strong>Error:</strong> {updateState.message}
                            </div>
                        )}

                        <div className="mb-4 space-y-3">
                            <p className="text-xs text-gray-300">If update fails, check:</p>

                            <div>
                                <p className="text-xs text-white mb-1">1. App Location</p>
                                <p className="text-[11px] text-gray-400">
                                    App must be in /Applications folder. If you run directly from DMG, updates won't work. Drag the app to Applications first.
                                </p>
                            </div>

                            <div>
                                <p className="text-xs text-white mb-1">2. Firewall Settings</p>
                                <p className="text-[11px] text-gray-400">
                                    System Settings → Network → Firewall. Make sure CLI Manager is not blocked.
                                </p>
                            </div>

                            <div>
                                <p className="text-xs text-white mb-1">3. Network</p>
                                <p className="text-[11px] text-gray-400">
                                    Check internet connection. VPN or proxy may interfere with updates.
                                </p>
                            </div>
                        </div>

                        <div className="pt-3 border-t border-white/10">
                            <p className="text-xs text-gray-400 mb-2">Still having issues? Open an issue:</p>
                            <a
                                href="https://github.com/woorichicken/CLI_manager/issues"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-blue-400 hover:text-blue-300"
                            >
                                github.com/woorichicken/CLI_manager/issues
                            </a>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
