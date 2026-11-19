import React from 'react'
import { Button } from '../ui/button'

export interface DiagnosticsSectionProps {
  onOpenGitHubIssues: () => Promise<void>
  title?: string
  // Optional legacy props for backwards compatibility
  showAdvancedDiagnostics?: boolean
  setShowAdvancedDiagnostics?: React.Dispatch<React.SetStateAction<boolean>>
  onCopyIssueReport?: () => Promise<void>
  isReportCopied?: boolean
  onOpenLogsFolder?: () => Promise<void>
}

export function DiagnosticsSection({
  onOpenGitHubIssues,
  title = 'Report Bug / Issue'
}: DiagnosticsSectionProps): React.JSX.Element {
  return (
    <div className="mt-4 rounded-2xl border border-border/70 bg-card overflow-hidden shadow-apple-subtle apple-card-elevated">
      <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-9 w-9 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center shrink-0">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m8 2 1.88 1.88" />
              <path d="M14.12 3.88 16 2" />
              <path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1" />
              <path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6" />
              <path d="M12 20v-9" />
              <path d="M6.53 9C4.6 8.8 3 7.1 3 5" />
              <path d="M6 13H2" />
              <path d="M3 21c0-2.1 1.7-3.9 3.8-4" />
              <path d="M20.97 5c0 2.1-1.6 3.8-3.5 4" />
              <path d="M22 13h-4" />
              <path d="M17.2 17c2.1.1 3.8 1.9 3.8 4" />
            </svg>
          </div>
          <div className="min-w-0">
            <div className="text-[13.5px] font-semibold tracking-[-0.015em] text-foreground">
              {title}
            </div>
            <div className="text-[12px] text-muted-foreground mt-0.5">
              Send a bug report via Gmail. File Explorer will also reveal focus.log so you can drag & drop to attach it.
            </div>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={onOpenGitHubIssues}
          className="h-8 text-[12px] shrink-0 self-start sm:self-auto cursor-pointer"
          title="Open a pre-filled bug report draft in Gmail and reveal focus.log in File Explorer"
          aria-label="Submit Bug Report"
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="mr-1.5 text-foreground/80"
          >
            <rect width="20" height="16" x="2" y="4" rx="2" />
            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
          </svg>
          Report via Gmail
        </Button>
      </div>
    </div>
  )
}
