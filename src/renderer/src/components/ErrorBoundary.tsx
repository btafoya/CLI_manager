import React, { Component, ReactNode } from 'react'

interface Props {
    children: ReactNode
    fallback?: ReactNode
}

interface State {
    hasError: boolean
    error?: Error
}

/**
 * React Error Boundary to catch render errors and prevent full app crashes.
 */
export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props)
        this.state = { hasError: false }
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error }
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error('[ErrorBoundary] Uncaught error:', error, errorInfo)
    }

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback
            }
            return (
                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        height: '100vh',
                        backgroundColor: '#0f0f0f',
                        color: '#e0e0e0',
                        padding: '2rem',
                        fontFamily: 'system-ui, sans-serif'
                    }}
                >
                    <h1 style={{ fontSize: '1.5rem', marginBottom: '1rem', color: '#ef4444' }}>
                        Something went wrong
                    </h1>
                    <p style={{ marginBottom: '1.5rem', opacity: 0.8 }}>
                        The application encountered an unexpected error. Please restart the app.
                    </p>
                    <pre
                        style={{
                            backgroundColor: '#1a1a1a',
                            padding: '1rem',
                            borderRadius: '8px',
                            fontSize: '0.85rem',
                            maxWidth: '600px',
                            overflow: 'auto',
                            color: '#a0a0a0'
                        }}
                    >
                        {this.state.error?.message}
                    </pre>
                    <button
                        onClick={() => window.location.reload()}
                        style={{
                            marginTop: '1.5rem',
                            padding: '0.5rem 1.5rem',
                            backgroundColor: '#3b82f6',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '0.9rem'
                        }}
                    >
                        Reload App
                    </button>
                </div>
            )
        }

        return this.props.children
    }
}
