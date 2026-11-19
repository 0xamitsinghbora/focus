import React from 'react'
import { Button } from '../ui/button'

export interface DeleteDataSectionProps {
  onOpenDeleteDataModal: () => void
}

export function DeleteDataSection({
  onOpenDeleteDataModal
}: DeleteDataSectionProps): React.JSX.Element {
  return (
    <div className="mt-4 rounded-2xl border border-border/70 bg-card overflow-hidden shadow-apple-subtle apple-card-elevated">
      <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-9 w-9 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center shrink-0">
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
              <path d="M3 6h18" />
              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
              <line x1="10" x2="10" y1="11" y2="17" />
              <line x1="14" x2="14" y1="11" y2="17" />
            </svg>
          </div>
          <div className="min-w-0">
            <div className="text-[13.5px] font-semibold tracking-[-0.015em] text-destructive">
              Delete All Data
            </div>
            <div className="text-[12px] text-muted-foreground mt-0.5">
              Permanently delete all your local activity history, goals, and Google Drive sync data.
            </div>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={onOpenDeleteDataModal}
          className="h-8 text-[12px] text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30 shrink-0 self-start sm:self-auto cursor-pointer"
        >
          Delete Data
        </Button>
      </div>
    </div>
  )
}
