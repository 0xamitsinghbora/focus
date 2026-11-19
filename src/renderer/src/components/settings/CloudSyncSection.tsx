import React from 'react'
import { CloudSyncProvider } from '../../../../shared/types'
import { Button } from '../ui/button'

export interface CloudSyncSectionProps {
  syncProvider: CloudSyncProvider
  driveStatus: {
    isConnected: boolean
    isSyncing: boolean
    isConfigured: boolean
  }
  onDriveConnect: () => Promise<void>
  onDriveSyncNow?: () => Promise<void>
  onDriveDisconnect: () => Promise<void>
}

export function CloudSyncSection({
  driveStatus,
  onDriveConnect,
  onDriveDisconnect
}: CloudSyncSectionProps): React.JSX.Element {
  return (
    <div className="p-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className="h-9 w-9 rounded-xl bg-secondary/80 flex items-center justify-center shrink-0">
          <svg width="20" height="20" viewBox="0 0 87.3 78" className="shrink-0">
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
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[13.5px] font-semibold text-foreground">Google Drive</span>
            {driveStatus.isConnected && (
              <span className="text-[11px] text-muted-foreground font-normal">(Connected)</span>
            )}
          </div>
          <div className="text-[12px] text-muted-foreground mt-0.5">
            {driveStatus.isConnected
              ? 'Connected to Google Drive. Automatically syncing in background.'
              : 'Sync logs and goals with your private Google Drive app storage.'}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2.5 shrink-0">
        {driveStatus.isConnected ? (
          <>
            {driveStatus.isSyncing ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="3"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                  />
                </svg>
                Syncing...
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
                Synced
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={onDriveDisconnect}
              className="text-apple-red hover:bg-apple-red/10 hover:text-apple-red text-[12px] cursor-pointer"
            >
              Disconnect
            </Button>
          </>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={onDriveConnect}
            className="text-[12px] cursor-pointer"
            aria-label="Connect Google Drive"
          >
            Connect
          </Button>
        )}
      </div>
    </div>
  )
}
