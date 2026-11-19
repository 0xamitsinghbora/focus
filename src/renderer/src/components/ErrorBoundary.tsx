import { Component, ErrorInfo, ReactNode } from 'react'
import { logger } from '../lib/logger'
import { Button } from './ui/button'

interface Props {
  children: ReactNode
  fallbackTitle?: string
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
  copied: boolean
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      copied: false
    }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo })
    logger.error('ReactErrorBoundary', error.message, {
      stack: error.stack,
      componentStack: errorInfo.componentStack
    })
  }

  handleReportError = async (): Promise<void> => {
    try {
      const customDesc = [
        `**Unhandled UI Error:** ${this.state.error?.message || 'Unknown error'}`,
        '',
        '```',
        this.state.error?.stack || '',
        this.state.errorInfo?.componentStack || '',
        '```'
      ].join('\n')

      await logger.openGitHubIssue(customDesc)
      this.setState({ copied: true })
      setTimeout(() => this.setState({ copied: false }), 3000)
    } catch (e) {
      console.error('Failed to report error:', e)
    }
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full bg-background text-foreground flex items-center justify-center p-6 select-none">
          <div className="w-full max-w-xl rounded-2xl border border-destructive/30 bg-card p-6 shadow-2xl backdrop-blur-md">
            <div className="flex items-start gap-4">
              <div className="h-12 w-12 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center shrink-0 border border-destructive/20">
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>

              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-semibold tracking-tight text-foreground">
                  {this.props.fallbackTitle || 'Something went wrong'}
                </h2>
                <p className="text-[13px] text-muted-foreground mt-1 leading-relaxed">
                  Focus encountered an unexpected error. Diagnostic logs have been automatically
                  saved so you can easily report this via Gmail.
                </p>

                {this.state.error && (
                  <div className="mt-3.5 p-3 rounded-xl bg-destructive/5 border border-destructive/15 text-[12px] font-mono text-destructive/90 overflow-x-auto max-h-36">
                    {this.state.error.toString()}
                  </div>
                )}

                <div className="mt-5 flex items-center">
                  <Button
                    variant="default"
                    size="sm"
                    onClick={this.handleReportError}
                    className="h-8 text-[12.5px] font-medium"
                  >
                    {this.state.copied ? (
                      <span className="flex items-center gap-1.5 text-apple-green">
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        Report Opened & Copied!
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5">
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <rect width="20" height="16" x="2" y="4" rx="2" />
                          <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                        </svg>
                        Report Error
                      </span>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
