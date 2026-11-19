import React, { useState, useEffect } from 'react'
import { Button } from '../ui/button'
import { useDialogA11y } from '../../lib/useDialogA11y'
import { cn } from '../../lib/utils'

export interface DeleteDataModalProps {
  isOpen: boolean
  isDeleting: boolean
  isDownloadingDb?: boolean
  isUploadingToDrive?: boolean
  isDriveConnected?: boolean
  onDownloadDatabase?: () => Promise<boolean | void>
  onUploadDatabaseToDrive?: () => Promise<boolean | void>
  onClose: () => void
  onConfirmDelete: () => Promise<void>
  // Backward compatibility
  isExporting?: boolean
  onExportData?: () => Promise<void>
}

export function DeleteDataModal({
  isOpen,
  isDeleting,
  isDownloadingDb = false,
  isUploadingToDrive = false,
  isDriveConnected = false,
  onDownloadDatabase,
  onUploadDatabaseToDrive,
  onClose,
  onConfirmDelete,
  onExportData
}: DeleteDataModalProps): React.JSX.Element | null {
  const [confirmStep, setConfirmStep] = useState<1 | 2 | 3>(1)
  const [downloadDone, setDownloadDone] = useState(false)
  const [uploadDone, setUploadDone] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setConfirmStep(1)
      setDownloadDone(false)
      setUploadDone(false)
    }
  }, [isOpen])

  const handleClose = (): void => {
    if (!isDeleting) {
      setConfirmStep(1)
      onClose()
    }
  }

  const handleDownload = async (): Promise<void> => {
    if (isDownloadingDb || isDeleting) return
    try {
      if (onDownloadDatabase) {
        const result = await onDownloadDatabase()
        if (result !== false) {
          setDownloadDone(true)
          setTimeout(() => setDownloadDone(false), 3500)
        }
      } else if (onExportData) {
        await onExportData()
      }
    } catch {
      // Handled by parent toast
    }
  }

  const handleUpload = async (): Promise<void> => {
    if (isUploadingToDrive || isDeleting || !isDriveConnected) return
    try {
      if (onUploadDatabaseToDrive) {
        const result = await onUploadDatabaseToDrive()
        if (result === true) {
          setUploadDone(true)
          setTimeout(() => setUploadDone(false), 3500)
        }
      }
    } catch {
      // Handled by parent toast
    }
  }

  const dialogRef = useDialogA11y<HTMLDivElement>({
    isOpen,
    onClose: handleClose,
    closeOnEscape: !isDeleting
  })

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-data-modal-title"
        tabIndex={-1}
        className="w-full max-w-md rounded-2xl border border-border/70 bg-card p-6 shadow-2xl space-y-4"
      >
        {/* Header with Step Indicator */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-destructive/10 text-destructive flex items-center justify-center shrink-0">
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
              <h3 id="delete-data-modal-title" className="text-lg font-bold text-foreground">
                Delete All Data
              </h3>
            </div>

            {/* 3-Step Confirmation Badges */}
            <div
              className="flex items-center gap-1.5"
              aria-label={`Confirmation step ${confirmStep} of 3`}
            >
              <span
                className={`h-2 w-6 rounded-full transition-all duration-200 ${
                  confirmStep >= 1 ? 'bg-destructive' : 'bg-muted'
                }`}
              />
              <span
                className={`h-2 w-6 rounded-full transition-all duration-200 ${
                  confirmStep >= 2 ? 'bg-destructive' : 'bg-muted'
                }`}
              />
              <span
                className={`h-2 w-6 rounded-full transition-all duration-200 ${
                  confirmStep >= 3 ? 'bg-destructive animate-pulse' : 'bg-muted'
                }`}
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed">
            {confirmStep === 1 && (
              <>
                This will permanently delete all your Focus session logs, tasks, daily goals,
                settings, and Google Drive cloud sync data.
              </>
            )}
            {confirmStep === 2 && (
              <span className="text-destructive/90 font-medium">
                Caution: Once deleted, this action cannot be undone. All data will be completely
                wiped from both your local database and connected Google Drive storage.
              </span>
            )}
            {confirmStep === 3 && (
              <span className="text-destructive font-semibold">
                Final Confirmation (Step 3 of 3): Please confirm one last time to proceed with
                permanent deletion of all local and cloud data.
              </span>
            )}
          </p>
        </div>

        {/* Database Backup Recommendations */}
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 space-y-3">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
              </svg>
            </div>
            <div>
              <div className="text-xs font-semibold text-foreground">Backup Recommended</div>
              <div className="text-[11px] text-muted-foreground">
                {isDriveConnected
                  ? 'Save your SQLite database locally or to Google Drive before deleting.'
                  : 'Save your SQLite database locally before deleting (or connect Drive in settings).'}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {/* Download SQLite DB Card */}
            <button
              type="button"
              onClick={handleDownload}
              disabled={isDownloadingDb || isDeleting}
              aria-label="Download Database (.db)"
              className="group relative flex flex-col justify-between p-3 rounded-xl border border-border/80 bg-background/70 hover:bg-secondary/60 hover:border-primary/40 active:scale-[0.98] transition-all duration-150 text-left cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:pointer-events-none"
            >
              <div className="flex items-center justify-between w-full mb-2">
                <div className="h-8 w-8 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  {isDownloadingDb ? (
                    <svg
                      className="animate-spin h-4 w-4 text-blue-500"
                      viewBox="0 0 24 24"
                      fill="none"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                      />
                    </svg>
                  ) : (
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" x2="12" y1="15" y2="3" />
                    </svg>
                  )}
                </div>
                {downloadDone ? (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-500 flex items-center gap-1 animate-in fade-in">
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Saved
                  </span>
                ) : (
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted/80 text-muted-foreground group-hover:text-foreground transition-colors">
                    .db file
                  </span>
                )}
              </div>
              <div>
                <div className="text-[12.5px] font-semibold text-foreground flex items-center gap-1">
                  <span>Download Database (.db)</span>
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {isDownloadingDb ? 'Saving local file...' : 'Save SQLite copy locally'}
                </div>
              </div>
            </button>

            {/* Upload to Google Drive Card */}
            <button
              type="button"
              onClick={handleUpload}
              disabled={isUploadingToDrive || isDeleting || !isDriveConnected}
              aria-label={
                !isDriveConnected ? 'Google Drive not connected' : 'Upload to Google Drive'
              }
              title={
                !isDriveConnected
                  ? 'Google Drive is not connected. Please connect Google Drive in Settings before backing up to cloud.'
                  : undefined
              }
              className={cn(
                'group relative flex flex-col justify-between p-3 rounded-xl border border-border/80 bg-background/70 transition-all duration-150 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                isDriveConnected
                  ? 'hover:bg-secondary/60 hover:border-primary/40 active:scale-[0.98] cursor-pointer disabled:opacity-50 disabled:pointer-events-none'
                  : 'opacity-50 cursor-not-allowed border-dashed'
              )}
            >
              <div className="flex items-center justify-between w-full mb-2">
                <div
                  className={cn(
                    'h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0 transition-transform',
                    isDriveConnected && 'group-hover:scale-105'
                  )}
                >
                  {isUploadingToDrive ? (
                    <svg
                      className="animate-spin h-4 w-4 text-emerald-500"
                      viewBox="0 0 24 24"
                      fill="none"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                      />
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 87.3 78" className="shrink-0">
                      <path
                        d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H1.1c0 1.55.4 3.1 1.2 4.5z"
                        fill="#0066da"
                      />
                      <path
                        d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44c-.8 1.4-1.2 2.95-1.2 4.5h27.5z"
                        fill="#00ac47"
                      />
                      <path
                        d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.8l5.85 10.1z"
                        fill="#ea4335"
                      />
                      <path
                        d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z"
                        fill="#00832d"
                      />
                      <path
                        d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z"
                        fill="#2684fc"
                      />
                      <path
                        d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25l16.15 28h27.5c0-1.55-.4-3.1-1.2-4.5z"
                        fill="#ffba00"
                      />
                    </svg>
                  )}
                </div>
                {uploadDone ? (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-500 flex items-center gap-1 animate-in fade-in">
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Uploaded
                  </span>
                ) : !isDriveConnected ? (
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted/80 text-muted-foreground">
                    Not connected
                  </span>
                ) : (
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted/80 text-muted-foreground group-hover:text-foreground transition-colors">
                    Cloud
                  </span>
                )}
              </div>
              <div>
                <div className="text-[12.5px] font-semibold text-foreground flex items-center gap-1">
                  <span>Upload to Google Drive</span>
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {isUploadingToDrive
                    ? 'Uploading backup...'
                    : !isDriveConnected
                      ? 'Connect Drive in settings first'
                      : 'Backup snapshot to Drive'}
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* Changing Confirmation Action Buttons */}
        <div className="pt-2">
          {confirmStep === 1 && (
            <div className="flex items-center justify-between gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClose}
                disabled={isDeleting}
                className="cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmStep(2)}
                disabled={isDeleting}
                className="border-destructive/40 text-destructive hover:bg-destructive/10 cursor-pointer"
              >
                Yes, delete my data (1/3)
              </Button>
            </div>
          )}

          {confirmStep === 2 && (
            <div className="flex items-center justify-between gap-3 flex-row-reverse animate-in fade-in duration-150">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClose}
                disabled={isDeleting}
                className="text-muted-foreground cursor-pointer"
              >
                Cancel (Abort)
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmStep(3)}
                disabled={isDeleting}
                className="border-destructive bg-destructive/10 text-destructive font-semibold hover:bg-destructive/20 cursor-pointer"
              >
                Yes, I understand this cannot be undone (2/3)
              </Button>
            </div>
          )}

          {confirmStep === 3 && (
            <div className="flex flex-col gap-2 animate-in fade-in duration-150">
              <Button
                variant="destructive"
                size="sm"
                onClick={onConfirmDelete}
                disabled={isDeleting}
                className="w-full h-9 text-xs font-bold cursor-pointer"
              >
                {isDeleting
                  ? 'Permanently deleting data from local & Google Drive...'
                  : 'Yes, permanently delete everything now (3/3)'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClose}
                disabled={isDeleting}
                className="w-full text-xs text-muted-foreground hover:text-foreground cursor-pointer"
              >
                Cancel & Keep My Data
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
