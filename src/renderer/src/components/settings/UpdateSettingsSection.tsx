import React, { useState, useEffect, useCallback, useRef } from 'react'
import { UpdateState, UpdateDownloadProgress } from '../../../../shared/types'
import { Button } from '../ui/button'
import { Switch } from '../ui/switch'
import { useToast } from '../../lib/useToast'
import { cn } from '../../lib/utils'

export interface UpdateSettingsSectionProps {
  autoCheckUpdates: boolean
  setAutoCheckUpdates: (enabled: boolean) => void
  autoDownloadUpdates: boolean
  setAutoDownloadUpdates: (enabled: boolean) => void
  lastUpdateCheck?: number
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const idx = Math.min(units.length - 1, Math.max(0, i))
  return `${(bytes / Math.pow(1024, idx)).toFixed(1)} ${units[idx]}`
}

function formatSpeed(bytesPerSec?: number): string {
  if (!bytesPerSec || bytesPerSec <= 0) return '0 B/s'
  return `${formatBytes(bytesPerSec)}/s`
}

function formatRelativeTime(timestamp?: number): string {
  if (!timestamp) return 'Never'
  const diffSec = Math.floor((Date.now() - timestamp) / 1000)
  if (diffSec < 10) return 'Just now'
  if (diffSec < 60) return `${diffSec} seconds ago`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHours = Math.floor(diffMin / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  return new Date(timestamp).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export function UpdateSettingsSection({
  autoCheckUpdates,
  setAutoCheckUpdates,
  autoDownloadUpdates,
  setAutoDownloadUpdates,
  lastUpdateCheck
}: UpdateSettingsSectionProps): React.JSX.Element {
  const toast = useToast()
  const [updateState, setUpdateState] = useState<UpdateState>({
    status: 'idle',
    currentVersion: '1.0.0',
    availableUpdate: null,
    progress: null,
    error: null,
    lastCheckedAt: lastUpdateCheck || null
  })
  const [isChecking, setIsChecking] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const [isInstalling, setIsInstalling] = useState(false)
  const [isCleaning, setIsCleaning] = useState(false)
  const [showNotes, setShowNotes] = useState(false)
  const [cleanFeedback, setCleanFeedback] = useState<string | null>(null)

  const isMountedRef = useRef(true)
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  // 1. Initial State Fetch
  useEffect(() => {
    if (typeof window !== 'undefined' && window.api?.updater) {
      window.api.updater
        .getState()
        .then((state) => {
          if (isMountedRef.current && state) {
            setUpdateState(state)
            if (state.status === 'downloading') setIsDownloading(true)
            if (state.status === 'checking') setIsChecking(true)
          }
        })
        .catch(() => {
          // ignore
        })
    }
  }, [])

  // 2. Subscribe to Update State & Progress push events
  useEffect(() => {
    if (typeof window === 'undefined' || !window.api?.updater) return

    const unsubState = window.api.updater.onStatusChange?.((state: UpdateState) => {
      if (!isMountedRef.current || !state) return
      setUpdateState(state)
      setIsChecking(state.status === 'checking')
      setIsDownloading(state.status === 'downloading')
      setIsInstalling(state.status === 'installing')
    })

    const unsubProgress = window.api.updater.onDownloadProgress?.(
      (progress: UpdateDownloadProgress) => {
        if (!isMountedRef.current || !progress) return
        setUpdateState((prev) => ({
          ...prev,
          status: 'downloading',
          progress
        }))
        setIsDownloading(true)
      }
    )

    return () => {
      unsubState?.()
      unsubProgress?.()
    }
  }, [])

  const handleCheckForUpdates = useCallback(async () => {
    if (isChecking || !window.api?.updater) return
    setIsChecking(true)
    setCleanFeedback(null)
    try {
      const state = await window.api.updater.checkForUpdates()
      if (isMountedRef.current && state) {
        setUpdateState(state)
        if (state.status === 'available') {
          toast.info(`Focus v${state.availableUpdate?.version} is available.`, 'Update Available')
        } else if (state.status === 'not-available') {
          toast.success('You are running the latest version of Focus.', 'Up to Date')
        } else if (state.status === 'error') {
          toast.error(state.error || 'Failed to check for updates.', 'Update Check Error')
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(msg, 'Update Check Failed')
    } finally {
      if (isMountedRef.current) {
        setIsChecking(false)
      }
    }
  }, [isChecking, toast])

  const handleDownloadUpdate = useCallback(async () => {
    if (isDownloading || !window.api?.updater) return
    setIsDownloading(true)
    try {
      const ok = await window.api.updater.downloadUpdate()
      if (!ok && isMountedRef.current) {
        setIsDownloading(false)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(msg, 'Download Failed')
      if (isMountedRef.current) {
        setIsDownloading(false)
      }
    }
  }, [isDownloading, toast])

  const handleCancelDownload = useCallback(async () => {
    if (!window.api?.updater) return
    try {
      await window.api.updater.cancelDownload()
      if (isMountedRef.current) {
        setIsDownloading(false)
        toast.info('Update download cancelled.', 'Cancelled')
      }
    } catch {
      // ignore
    }
  }, [toast])

  const handleInstallUpdate = useCallback(async () => {
    if (isInstalling || !window.api?.updater) return
    setIsInstalling(true)
    try {
      toast.info('Preparing to install update. Focus will restart shortly...', 'Installing Update')
      await window.api.updater.installUpdate()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(msg, 'Install Failed')
      if (isMountedRef.current) {
        setIsInstalling(false)
      }
    }
  }, [isInstalling, toast])

  const handleCleanCache = useCallback(async () => {
    if (isCleaning || !window.api?.updater) return
    setIsCleaning(true)
    try {
      const result = await window.api.updater.cleanCache()
      if (isMountedRef.current) {
        if (result && result.freedBytes > 0) {
          const msg = `Reclaimed ${formatBytes(result.freedBytes)} across ${result.cleanedFiles.length} cached file(s).`
          setCleanFeedback(msg)
          toast.success(msg, 'Cache Cleaned')
        } else {
          setCleanFeedback('Cache is already clean. No old installer files found.')
          toast.info('No cached update files to clean.', 'Cache Clean')
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(msg, 'Clean Cache Failed')
    } finally {
      if (isMountedRef.current) {
        setIsCleaning(false)
      }
    }
  }, [isCleaning, toast])

  const status = updateState.status
  const available = updateState.availableUpdate
  const progress = updateState.progress
  const effectiveLastChecked = updateState.lastCheckedAt || lastUpdateCheck

  return (
    <div className="mt-4 rounded-2xl border border-border/70 bg-card overflow-hidden shadow-apple-subtle apple-card-elevated">
      {/* 1. Header Section */}
      <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-9 w-9 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[13.5px] font-semibold tracking-[-0.015em] text-foreground">
                Software Updates
              </span>
              <span className="text-[11px] font-medium text-muted-foreground/80 px-2 py-0.5 rounded-md bg-secondary/60 border border-border/40">
                v{updateState.currentVersion}
              </span>
            </div>
            <div className="text-[12px] text-muted-foreground mt-0.5 flex items-center gap-1.5 flex-wrap">
              <span>Checks GitHub Releases for updates.</span>
              <span>·</span>
              <span>Last checked: {formatRelativeTime(effectiveLastChecked)}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCheckForUpdates}
            disabled={isChecking || status === 'downloading' || isInstalling}
            className="text-[12px] font-medium cursor-pointer"
          >
            {isChecking ? (
              <span className="flex items-center gap-1.5">
                <svg
                  className="animate-spin h-3.5 w-3.5"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Checking...
              </span>
            ) : (
              'Check for Updates'
            )}
          </Button>
        </div>
      </div>

      {/* 2. Status Banners & Actions */}
      {status === 'error' && updateState.error && (
        <div className="px-4 pb-3">
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-destructive flex items-start gap-2.5 text-[12px]">
            <svg
              className="w-4 h-4 mt-0.5 shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <div className="min-w-0 flex-1">
              <span className="font-semibold">Update check issue: </span>
              <span>{updateState.error}</span>
            </div>
          </div>
        </div>
      )}

      {/* 3. Available Update Card */}
      {status === 'available' && available && (
        <div className="px-4 pb-4">
          <div className="rounded-xl border border-primary/30 bg-primary/5 dark:bg-primary/10 p-3.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-primary text-primary-foreground">
                    New Update
                  </span>
                  <span className="text-[13px] font-bold text-foreground">
                    v{available.version}
                  </span>
                  {available.assetSize > 0 && (
                    <span className="text-[11px] text-muted-foreground">
                      ({formatBytes(available.assetSize)})
                    </span>
                  )}
                </div>
                <div className="text-[12px] text-foreground/90 font-medium mt-1">
                  {available.releaseName || `Focus v${available.version}`}
                </div>
                {available.publishedAt && (
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    Released on {new Date(available.publishedAt).toLocaleDateString()}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {available.htmlUrl && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      try {
                        window.open(available.htmlUrl, '_blank')
                      } catch {
                        // ignore
                      }
                    }}
                    className="text-[12px]"
                  >
                    View on GitHub
                  </Button>
                )}
                {available.downloadUrl && (
                  <Button
                    variant="default"
                    size="sm"
                    onClick={handleDownloadUpdate}
                    disabled={isDownloading}
                    className="text-[12px] font-medium"
                  >
                    Download Update
                  </Button>
                )}
              </div>
            </div>

            {/* Release Notes */}
            {available.releaseNotes && (
              <div className="mt-3 pt-3 border-t border-border/40">
                <button
                  type="button"
                  onClick={() => setShowNotes((prev) => !prev)}
                  className="text-[11.5px] font-medium text-primary hover:underline flex items-center gap-1 cursor-pointer"
                >
                  {showNotes ? 'Hide Release Notes' : 'Show Release Notes'}
                  <svg
                    className={cn(
                      'w-3.5 h-3.5 transition-transform duration-200',
                      showNotes && 'rotate-180'
                    )}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                {showNotes && (
                  <div className="mt-2 text-[12px] text-foreground/80 bg-background/60 p-3 rounded-lg border border-border/30 max-h-48 overflow-y-auto whitespace-pre-wrap font-sans leading-relaxed custom-scrollbar">
                    {available.releaseNotes}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4. Downloading Progress Card */}
      {status === 'downloading' && (
        <div className="px-4 pb-4">
          <div className="rounded-xl border border-border/70 bg-secondary/30 p-3.5">
            <div className="flex items-center justify-between text-[12px] mb-2">
              <span className="font-semibold text-foreground flex items-center gap-1.5">
                <svg
                  className="animate-spin h-3.5 w-3.5 text-primary"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Downloading Focus v{available?.version || 'update'}...
              </span>
              <span className="font-mono text-[11px] text-muted-foreground">
                {progress?.percent ?? 0}%
              </span>
            </div>

            {/* Progress Bar */}
            <div className="h-2 w-full bg-secondary/80 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-200 ease-out"
                style={{ width: `${progress?.percent ?? 0}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] text-muted-foreground mt-2">
              <span>
                {progress
                  ? `${formatBytes(progress.bytesDownloaded)} of ${formatBytes(progress.totalBytes)} · ${formatSpeed(progress.bytesPerSecond)}`
                  : 'Preparing download...'}
              </span>
              <div className="flex items-center gap-2">
                {progress && progress.remainingSeconds > 0 && (
                  <span>~{progress.remainingSeconds}s remaining</span>
                )}
                <button
                  type="button"
                  onClick={handleCancelDownload}
                  className="text-destructive hover:underline font-medium cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. Downloaded / Ready to Install Card */}
      {status === 'downloaded' && (
        <div className="px-4 pb-4">
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <div className="h-6 w-6 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
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
              </div>
              <div>
                <div className="text-[13px] font-bold text-foreground">Update Ready to Install</div>
                <div className="text-[11.5px] text-muted-foreground mt-0.5">
                  Focus will safely save all current focus data, terminate background processes, and
                  relaunch updated.
                </div>
              </div>
            </div>

            <Button
              variant="default"
              size="sm"
              onClick={handleInstallUpdate}
              disabled={isInstalling}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[12px] shrink-0"
            >
              {isInstalling ? 'Installing...' : 'Restart & Install Update'}
            </Button>
          </div>
        </div>
      )}

      {/* 6. Settings Toggles */}
      <div className="border-t border-border/50 divide-y divide-border/40">
        <div className="p-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[13px] font-medium text-foreground">
              Automatically check for updates
            </div>
            <div className="text-[11.5px] text-muted-foreground">
              Periodically check GitHub Releases in the background.
            </div>
          </div>
          <Switch
            checked={autoCheckUpdates}
            onCheckedChange={setAutoCheckUpdates}
            aria-label="Automatically check for updates"
          />
        </div>

        <div className="p-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[13px] font-medium text-foreground">
              Automatically download updates
            </div>
            <div className="text-[11.5px] text-muted-foreground">
              Download new releases in the background when available.
            </div>
          </div>
          <Switch
            checked={autoDownloadUpdates}
            onCheckedChange={setAutoDownloadUpdates}
            aria-label="Automatically download updates"
          />
        </div>

        {/* 7. Cache Cleanup Row */}
        <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[13px] font-medium text-foreground">Clean update cache</div>
            <div className="text-[11.5px] text-muted-foreground">
              Remove old installer packages and incomplete downloads from disk.
            </div>
            {cleanFeedback && (
              <div className="text-[11px] text-primary font-medium mt-1">{cleanFeedback}</div>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCleanCache}
            disabled={isCleaning}
            className="text-[12px] shrink-0"
          >
            {isCleaning ? 'Cleaning...' : 'Clean Cache'}
          </Button>
        </div>
      </div>
    </div>
  )
}
