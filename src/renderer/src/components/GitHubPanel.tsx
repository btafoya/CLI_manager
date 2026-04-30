import React, { useState, useEffect } from 'react'
import { Github, RefreshCw, GitPullRequest, Play, Clock, CheckCircle2, XCircle, ExternalLink } from 'lucide-react'

interface GitHubPanelProps {
    workspacePath: string
    visible: boolean
}

export function GitHubPanel({ workspacePath, visible }: GitHubPanelProps) {
    const [loading, setLoading] = useState(false)
    const [ghAuth, setGhAuth] = useState(false)
    const [ghRepo, setGhRepo] = useState<any>(null)
    const [ghPRs, setGhPRs] = useState<any[]>([])
    const [ghWorkflows, setGhWorkflows] = useState<any[]>([])
    const [showWorkflows, setShowWorkflows] = useState(false)
    const [prTitle, setPrTitle] = useState('')
    const [prBody, setPrBody] = useState('')

    const checkGitHubAuth = async () => {
        if (!workspacePath) return
        try {
            const authStatus = await window.api.ghCheckAuth()
            setGhAuth(authStatus.authenticated)
            if (authStatus.authenticated) {
                const repo = await window.api.ghRepoView(workspacePath)
                const prs = await window.api.ghListPRs(workspacePath)
                const workflows = await window.api.ghWorkflowStatus(workspacePath)
                setGhRepo(repo)
                setGhPRs(prs)
                if (workflows.success && workflows.data) {
                    setGhWorkflows(workflows.data)
                }
            }
        } catch {
            setGhAuth(false)
        }
    }

    const refreshWorkflows = async () => {
        if (!workspacePath || !ghAuth) return
        try {
            setLoading(true)
            const workflows = await window.api.ghWorkflowStatus(workspacePath)
            if (workflows.success && workflows.data) {
                setGhWorkflows(workflows.data)
            }
        } catch {
            // ignore
        } finally {
            setLoading(false)
        }
    }

    const handleGitHubLogin = async () => {
        try {
            setLoading(true)
            const result = await window.api.ghAuthLogin()
            if (result.success) {
                await checkGitHubAuth()
            }
        } catch {
            // ignore
        } finally {
            setLoading(false)
        }
    }

    const handleCreatePR = async () => {
        if (!workspacePath || !prTitle.trim()) return
        try {
            setLoading(true)
            const result = await window.api.ghCreatePR(workspacePath, prTitle, prBody)
            if (result.success) {
                setPrTitle('')
                setPrBody('')
                await checkGitHubAuth() // Refresh PR list
            }
        } catch {
            // ignore
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        if (visible && workspacePath) {
            checkGitHubAuth()
        }
    }, [visible, workspacePath])

    if (!visible) return null

    return (
        <div className="p-4 border-b border-white/10 bg-black/20">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <Github size={16} className="text-purple-400" />
                    <h3 className="text-sm font-semibold text-white">GitHub</h3>
                </div>
                {ghAuth && ghRepo && (
                    <a
                        href={ghRepo.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                    >
                        {ghRepo.owner.login}/{ghRepo.name}
                        <ExternalLink size={12} />
                    </a>
                )}
            </div>

            {!ghAuth ? (
                <div className="space-y-2">
                    <p className="text-xs text-gray-400">GitHub CLI authentication required</p>
                    <button
                        onClick={handleGitHubLogin}
                        disabled={loading}
                        className="w-full px-3 py-2 text-sm bg-purple-600 hover:bg-purple-500 text-white rounded transition-colors disabled:opacity-50"
                    >
                        GitHub Login
                    </button>
                    <p className="text-xs text-gray-500">Authenticate in browser and return</p>
                </div>
            ) : (
                <div className="space-y-3">
                    <div>
                        <label className="text-xs text-gray-400 block mb-1">Create Pull Request</label>
                        <input
                            type="text"
                            value={prTitle}
                            onChange={e => setPrTitle(e.target.value)}
                            placeholder="PR title"
                            className="w-full bg-black/30 border border-white/10 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-purple-500 mb-2"
                        />
                        <textarea
                            value={prBody}
                            onChange={e => setPrBody(e.target.value)}
                            placeholder="PR description (optional)"
                            className="w-full bg-black/30 border border-white/10 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-purple-500 resize-none"
                            rows={2}
                        />
                        <button
                            onClick={handleCreatePR}
                            disabled={loading || !prTitle.trim()}
                            className="mt-2 w-full px-3 py-1.5 text-sm bg-purple-600 hover:bg-purple-500 text-white rounded transition-colors disabled:opacity-50"
                        >
                            <GitPullRequest size={14} className="inline mr-1" />
                            Create PR
                        </button>
                    </div>

                    {ghPRs.length > 0 && (
                        <div>
                            <h4 className="text-xs font-semibold text-gray-400 mb-2">Recent Pull Requests</h4>
                            <div className="space-y-1 max-h-40 overflow-y-auto">
                                {ghPRs.slice(0, 5).map(pr => (
                                    <a
                                        key={pr.number}
                                        href={pr.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="block p-2 bg-black/30 hover:bg-white/5 rounded text-xs transition-colors"
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className="text-white font-medium truncate">#{pr.number} {pr.title}</span>
                                            <span className={`text-xs px-1.5 py-0.5 rounded ${
                                                pr.state === 'OPEN' ? 'bg-green-500/20 text-green-300' :
                                                pr.state === 'MERGED' ? 'bg-purple-500/20 text-purple-300' :
                                                'bg-red-500/20 text-red-300'
                                            }`}>
                                                {pr.state}
                                            </span>
                                        </div>
                                        <div className="text-gray-500 mt-1">by {pr.author.login}</div>
                                    </a>
                                ))}
                            </div>
                        </div>
                    )}

                    {ghWorkflows.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-white/10">
                            <div className="flex items-center justify-between mb-2">
                                <h4 className="text-xs font-semibold text-gray-400 flex items-center gap-1">
                                    <Play size={12} />
                                    Actions ({ghWorkflows.length})
                                </h4>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={refreshWorkflows}
                                        disabled={loading}
                                        className="p-1 hover:bg-white/10 rounded transition-colors disabled:opacity-50"
                                        title="Refresh"
                                    >
                                        <RefreshCw size={12} className="text-gray-400" />
                                    </button>
                                    <button
                                        onClick={() => setShowWorkflows(!showWorkflows)}
                                        className="text-xs text-blue-400 hover:text-blue-300"
                                    >
                                        {showWorkflows ? 'Hide' : 'Show'}
                                    </button>
                                </div>
                            </div>

                            {showWorkflows && (
                                <div className="space-y-1 max-h-48 overflow-y-auto">
                                    {ghWorkflows.map((workflow, index) => {
                                        const isRunning = workflow.status === 'in_progress' || workflow.status === 'queued'
                                        const isSuccess = workflow.conclusion === 'success'
                                        const isFailure = workflow.conclusion === 'failure'

                                        return (
                                            <a
                                                key={index}
                                                href={workflow.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="block p-2 bg-black/30 hover:bg-white/5 rounded text-xs transition-colors"
                                            >
                                                <div className="flex items-start gap-2">
                                                    {isRunning && (
                                                        <Clock size={14} className="text-yellow-400 shrink-0 mt-0.5 animate-pulse" />
                                                    )}
                                                    {isSuccess && (
                                                        <CheckCircle2 size={14} className="text-green-400 shrink-0 mt-0.5" />
                                                    )}
                                                    {isFailure && (
                                                        <XCircle size={14} className="text-red-400 shrink-0 mt-0.5" />
                                                    )}
                                                    {!isRunning && !isSuccess && !isFailure && (
                                                        <div className="w-3.5 h-3.5 rounded-full bg-gray-500 shrink-0 mt-0.5" />
                                                    )}

                                                    <div className="flex-1 min-w-0">
                                                        <div className="text-white font-medium truncate">{workflow.name}</div>
                                                        <div className="text-gray-500 mt-1 flex items-center gap-2">
                                                            <span>{workflow.headBranch}</span>
                                                            <span>•</span>
                                                            <span>
                                                                {new Date(workflow.createdAt).toLocaleDateString()}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </a>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
