import { useState, useEffect, useCallback, useRef } from 'react'
import { AppSettings, ThemeMode, CloudSyncProvider, SyncTarget } from '../../../shared/types'
import { PageShell } from './DashboardLayout'
import { useToast } from '../lib/useToast'
import { logger } from '../lib/logger'
import { GeneralSettingsSection } from './settings/GeneralSettingsSection'
import { CloudSyncSection } from './settings/CloudSyncSection'
import { EvaluatorSettingsSection } from './settings/EvaluatorSettingsSection'
import { UpdateSettingsSection } from './settings/UpdateSettingsSection'
import { DiagnosticsSection } from './settings/DiagnosticsSection'
import { DeleteDataSection } from './settings/DeleteDataSection'
import { DeleteDataModal } from './settings/DeleteDataModal'

interface SettingsPanelProps {
  theme: ThemeMode
  setTheme: (t: ThemeMode, broadcast?: boolean) => void
  onSettingsSaved: () => Promise<void>
  onSyncComplete: () => Promise<void>
  onIntervalChange: (n: number) => void
  onOpenShortcuts?: () => void
}

export function SettingsPanel({
  theme,
  setTheme,
  onSettingsSaved,
  onSyncComplete,
  onIntervalChange,
  onOpenShortcuts
}: SettingsPanelProps): React.JSX.Element {
  const toast = useToast()
  const toastRef = useRef(toast)
  useEffect(() => {
    toastRef.current = toast
  }, [toast])

  const [interval, setInterval_] = useState(45)
  const [dailyFocusTarget, setDailyFocusTarget] = useState(480)
  const [openAtLogin, setOpenAtLogin] = useState(true)
  const [showWidget, setShowWidget] = useState(true)
  const [syncProvider, setSyncProvider] = useState<CloudSyncProvider>('none')
  const [driveSyncEnabled, setDriveSyncEnabled] = useState(false)
  const [driveStatus, setDriveStatus] = useState<{
    isConnected: boolean
    isSyncing: boolean
    isConfigured: boolean
  }>({
    isConnected: false,
    isSyncing: false,
    isConfigured: true
  })
  const [isDownloadingDb, setIsDownloadingDb] = useState(false)
  const [isUploadingToDrive, setIsUploadingToDrive] = useState(false)
  const [isDeleteDataModalOpen, setIsDeleteDataModalOpen] = useState(false)
  const [isDeletingData, setIsDeletingData] = useState(false)
  const [autoCheckUpdates, setAutoCheckUpdates] = useState(true)
  const [autoDownloadUpdates, setAutoDownloadUpdates] = useState(false)
  const [lastUpdateCheck, setLastUpdateCheck] = useState<number | undefined>(undefined)
  const [tratakaDuration, setTratakaDuration] = useState(60)
  const [loaded, setLoaded] = useState(false)

  const lastSavedSettingsRef = useRef<{
    interval: number
    dailyFocusTarget: number
    openAtLogin: boolean
    showWidget: boolean
    syncProvider: CloudSyncProvider
    driveSyncEnabled: boolean
    theme: ThemeMode
    autoCheckUpdates: boolean
    autoDownloadUpdates: boolean
    tratakaDuration: number
  } | null>(null)

  const pendingSaveRef = useRef<(() => Promise<void>) | null>(null)

  // Flush pending debounced settings on unmount or beforeunload so early tab switch / navigation / rapid quit doesn't discard edits
  useEffect(() => {
    const handleBeforeUnload = (): void => {
      if (pendingSaveRef.current) {
        pendingSaveRef.current().catch((err) => {
          console.error('Failed to flush settings on beforeunload:', err)
        })
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      if (pendingSaveRef.current) {
        pendingSaveRef.current().catch((err) => {
          console.error('Failed to flush settings on unmount:', err)
        })
      }
    }
  }, [])

  const loadDriveStatus = useCallback(async () => {
    try {
      const status = await window.api.sync.driveStatus()
      if (status) {
        setDriveStatus({
          isConnected: Boolean(status.isConnected),
          isSyncing: Boolean(status.isSyncing),
          isConfigured: status.isConfigured !== false
        })
        if (!status.isConnected) {
          setSyncProvider((prev) => (prev === 'google-drive' ? 'none' : prev))
        }
      }
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    window.api.settings
      .get()
      .then((settings: AppSettings) => {
        const loadedInterval = settings.reminderIntervalMinutes || 45
        const loadedDailyTarget =
          typeof settings.dailyFocusTargetMinutes === 'number'
            ? settings.dailyFocusTargetMinutes
            : 480
        const loadedOpen = settings.openAtLogin ?? true
        const loadedShowWidget = settings.showWidget !== false
        const loadedSync = settings.driveSyncEnabled || false
        let loadedProvider: CloudSyncProvider =
          settings.syncProvider || (settings.driveSyncEnabled ? 'google-drive' : 'none')
        if (loadedProvider === 'google-drive' && !settings.driveSyncEnabled) {
          loadedProvider = 'none'
        }
        const loadedTheme = settings.theme || 'system'
        const loadedAutoCheck = settings.autoCheckUpdates !== false
        const loadedAutoDownload = settings.autoDownloadUpdates || false
        const loadedLastCheck = settings.lastUpdateCheck
        const loadedTrataka = settings.tratakaDurationSeconds || 60

        setInterval_(loadedInterval)
        setDailyFocusTarget(loadedDailyTarget)
        setOpenAtLogin(loadedOpen)
        setShowWidget(loadedShowWidget)
        setSyncProvider(loadedProvider)
        setDriveSyncEnabled(loadedSync)
        setAutoCheckUpdates(loadedAutoCheck)
        setAutoDownloadUpdates(loadedAutoDownload)
        setLastUpdateCheck(loadedLastCheck)
        setTratakaDuration(loadedTrataka)
        onIntervalChange(loadedInterval)

        lastSavedSettingsRef.current = {
          interval: loadedInterval,
          dailyFocusTarget: loadedDailyTarget,
          openAtLogin: loadedOpen,
          showWidget: loadedShowWidget,
          syncProvider: loadedProvider,
          driveSyncEnabled: loadedSync,
          theme: loadedTheme,
          autoCheckUpdates: loadedAutoCheck,
          autoDownloadUpdates: loadedAutoDownload,
          tratakaDuration: loadedTrataka
        }
        setLoaded(true)
      })
      .catch((err) => {
        console.error('Failed to load settings:', err)
        setLoaded(true)
      })

    loadDriveStatus()
  }, [loadDriveStatus, onIntervalChange])

  // Poll drive status while an initial or manual sync operation is in flight
  useEffect(() => {
    if (!driveStatus.isSyncing) return
    const timer = setInterval(() => {
      loadDriveStatus()
    }, 1000)
    return () => clearInterval(timer)
  }, [driveStatus.isSyncing, loadDriveStatus])

  useEffect(() => {
    const unsub = window.api.events?.onDataUpdated?.(async (target?: SyncTarget) => {
      if (target && !target.syncSettings) {
        return
      }
      try {
        const latest = await window.api.settings.get()
        if (latest) {
          if (latest.syncProvider) {
            setSyncProvider(latest.syncProvider)
          }
          if (typeof latest.driveSyncEnabled === 'boolean') {
            setDriveSyncEnabled(latest.driveSyncEnabled)
          }
          if (typeof latest.reminderIntervalMinutes === 'number') {
            setInterval_(latest.reminderIntervalMinutes)
          }
          if (typeof latest.dailyFocusTargetMinutes === 'number') {
            setDailyFocusTarget(latest.dailyFocusTargetMinutes)
          }
          if (typeof latest.openAtLogin === 'boolean') {
            setOpenAtLogin(latest.openAtLogin)
          }
          if (typeof latest.showWidget === 'boolean') {
            setShowWidget(latest.showWidget)
          }
          if (typeof latest.autoCheckUpdates === 'boolean') {
            setAutoCheckUpdates(latest.autoCheckUpdates)
          }
          if (typeof latest.autoDownloadUpdates === 'boolean') {
            setAutoDownloadUpdates(latest.autoDownloadUpdates)
          }
          if (typeof latest.lastUpdateCheck === 'number') {
            setLastUpdateCheck(latest.lastUpdateCheck)
          }
          if (typeof latest.tratakaDurationSeconds === 'number') {
            setTratakaDuration(latest.tratakaDurationSeconds)
          }
          if (latest.theme && latest.theme !== theme) {
            setTheme(latest.theme, false)
          }
          loadDriveStatus()

          if (lastSavedSettingsRef.current) {
            lastSavedSettingsRef.current = {
              interval:
                typeof latest.reminderIntervalMinutes === 'number'
                  ? latest.reminderIntervalMinutes
                  : lastSavedSettingsRef.current.interval,
              dailyFocusTarget:
                typeof latest.dailyFocusTargetMinutes === 'number'
                  ? latest.dailyFocusTargetMinutes
                  : lastSavedSettingsRef.current.dailyFocusTarget,
              openAtLogin:
                typeof latest.openAtLogin === 'boolean'
                  ? latest.openAtLogin
                  : lastSavedSettingsRef.current.openAtLogin,
              showWidget:
                typeof latest.showWidget === 'boolean'
                  ? latest.showWidget
                  : lastSavedSettingsRef.current.showWidget,
              syncProvider: latest.syncProvider || lastSavedSettingsRef.current.syncProvider,
              driveSyncEnabled:
                typeof latest.driveSyncEnabled === 'boolean'
                  ? latest.driveSyncEnabled
                  : lastSavedSettingsRef.current.driveSyncEnabled,
              theme: latest.theme || lastSavedSettingsRef.current.theme,
              autoCheckUpdates:
                typeof latest.autoCheckUpdates === 'boolean'
                  ? latest.autoCheckUpdates
                  : lastSavedSettingsRef.current.autoCheckUpdates,
              autoDownloadUpdates:
                typeof latest.autoDownloadUpdates === 'boolean'
                  ? latest.autoDownloadUpdates
                  : lastSavedSettingsRef.current.autoDownloadUpdates,
              tratakaDuration:
                typeof latest.tratakaDurationSeconds === 'number'
                  ? latest.tratakaDurationSeconds
                  : lastSavedSettingsRef.current.tratakaDuration
            }
          }
        }
      } catch {
        // ignore
      }
    })
    return () => {
      if (typeof unsub === 'function') {
        unsub()
      }
    }
  }, [loadDriveStatus, theme, setTheme])

  useEffect(() => {
    if (!loaded || !lastSavedSettingsRef.current) return

    const last = lastSavedSettingsRef.current
    const isDifferent =
      last.interval !== interval ||
      last.dailyFocusTarget !== dailyFocusTarget ||
      last.openAtLogin !== openAtLogin ||
      last.showWidget !== showWidget ||
      last.syncProvider !== syncProvider ||
      last.driveSyncEnabled !== driveSyncEnabled ||
      last.theme !== theme ||
      last.autoCheckUpdates !== autoCheckUpdates ||
      last.autoDownloadUpdates !== autoDownloadUpdates ||
      last.tratakaDuration !== tratakaDuration

    if (!isDifferent) return

    const isDiscreteChange =
      last.openAtLogin !== openAtLogin ||
      last.showWidget !== showWidget ||
      last.syncProvider !== syncProvider ||
      last.driveSyncEnabled !== driveSyncEnabled ||
      last.theme !== theme ||
      last.autoCheckUpdates !== autoCheckUpdates ||
      last.autoDownloadUpdates !== autoDownloadUpdates ||
      last.tratakaDuration !== tratakaDuration

    lastSavedSettingsRef.current = {
      interval,
      dailyFocusTarget,
      openAtLogin,
      showWidget,
      syncProvider,
      driveSyncEnabled,
      theme,
      autoCheckUpdates,
      autoDownloadUpdates,
      tratakaDuration
    }

    if (last.interval !== interval) {
      onIntervalChange(interval)
    }

    const saveAction = async (): Promise<void> => {
      try {
        const patch: Partial<AppSettings> = {}
        if (last.interval !== interval) patch.reminderIntervalMinutes = interval
        if (last.dailyFocusTarget !== dailyFocusTarget)
          patch.dailyFocusTargetMinutes = dailyFocusTarget
        if (last.openAtLogin !== openAtLogin) patch.openAtLogin = openAtLogin
        if (last.showWidget !== showWidget) patch.showWidget = showWidget
        if (last.theme !== theme) patch.theme = theme
        if (last.syncProvider !== syncProvider) patch.syncProvider = syncProvider
        if (last.driveSyncEnabled !== driveSyncEnabled) patch.driveSyncEnabled = driveSyncEnabled
        if (last.autoCheckUpdates !== autoCheckUpdates) patch.autoCheckUpdates = autoCheckUpdates
        if (last.autoDownloadUpdates !== autoDownloadUpdates)
          patch.autoDownloadUpdates = autoDownloadUpdates
        if (last.tratakaDuration !== tratakaDuration) patch.tratakaDurationSeconds = tratakaDuration

        if (window.api?.settings?.patch) {
          await window.api.settings.patch(patch)
        } else {
          const current = await window.api.settings.get().catch(() => ({}) as AppSettings)
          delete current.driveRefreshToken
          await window.api.settings.set({ ...current, ...patch })
        }
        pendingSaveRef.current = null
        await onSettingsSaved()
        onIntervalChange(interval)
      } catch (err) {
        console.error('Failed to save settings:', err)
        toastRef.current.error('Failed to save settings', 'Settings')
      }
    }

    pendingSaveRef.current = saveAction

    const delay = isDiscreteChange ? 0 : 1000

    const timer = setTimeout(async () => {
      await saveAction()
    }, delay)

    return () => clearTimeout(timer)
  }, [
    interval,
    dailyFocusTarget,
    openAtLogin,
    showWidget,
    syncProvider,
    driveSyncEnabled,
    theme,
    autoCheckUpdates,
    autoDownloadUpdates,
    tratakaDuration,
    loaded,
    onSettingsSaved,
    onIntervalChange
  ])

  const handleDriveConnect = async (): Promise<void> => {
    if (!driveStatus.isConfigured) {
      toastRef.current.error(
        'Google Drive credentials are not set to connect.',
        'Credentials Not Set'
      )
      return
    }
    try {
      const res = await window.api.sync.driveConnect()
      if (res.success) {
        const settings = await window.api.settings.get()
        setSyncProvider('google-drive')
        setDriveSyncEnabled(settings.driveSyncEnabled || false)
        await loadDriveStatus()
        toastRef.current.success('Connected to Google Drive successfully.', 'Account Connected')
        setTimeout(() => {
          loadDriveStatus()
        }, 1200)
      } else {
        toastRef.current.error(
          res.error || 'Google Drive credentials are not set to connect.',
          'Credentials Not Set'
        )
      }
    } catch {
      toastRef.current.error(
        'Google Drive credentials are not set to connect.',
        'Credentials Not Set'
      )
    }
  }

  const handleDriveDisconnect = async (): Promise<void> => {
    if (pendingSaveRef.current) {
      pendingSaveRef.current = null
    }
    await window.api.sync.driveDisconnect()
    setSyncProvider('none')
    setDriveSyncEnabled(false)
    if (lastSavedSettingsRef.current) {
      lastSavedSettingsRef.current.syncProvider = 'none'
      lastSavedSettingsRef.current.driveSyncEnabled = false
    }
    await loadDriveStatus()
    toastRef.current.info('Disconnected from Google Drive.', 'Account Disconnected')
  }

  const handleDriveSyncNow = async (): Promise<void> => {
    setDriveStatus((s) => ({ ...s, isSyncing: true }))
    try {
      const res = await window.api.sync.driveSyncNow()
      if (res.success) {
        await onSyncComplete()
        toastRef.current.success('Activity logs and goals are up to date.', 'Sync Complete')
      } else {
        toastRef.current.error(res.error || 'Synchronization failed.', 'Sync Failed')
      }
    } catch (e) {
      toastRef.current.error(String(e), 'Sync Error')
    } finally {
      loadDriveStatus()
    }
  }

  const handleDownloadDatabase = useCallback(async (): Promise<boolean> => {
    if (isDownloadingDb) return false
    setIsDownloadingDb(true)
    try {
      if (typeof window !== 'undefined' && window.api?.logs?.downloadDatabase) {
        const result = await window.api.logs.downloadDatabase()
        if (result && result.canceled) {
          return false
        }
        if (result && result.success) {
          toastRef.current.success('SQLite database downloaded successfully.', 'Download Complete')
          return true
        } else if (result && result.error) {
          toastRef.current.error(String(result.error), 'Download Failed')
          return false
        } else {
          toastRef.current.success('SQLite database downloaded.', 'Download Complete')
          return true
        }
      }
      return false
    } catch (e) {
      toastRef.current.error(String(e), 'Download Failed')
      return false
    } finally {
      setIsDownloadingDb(false)
    }
  }, [isDownloadingDb])

  const handleUploadDatabaseToDrive = useCallback(async (): Promise<boolean> => {
    if (isUploadingToDrive) return false
    if (!driveStatus.isConnected) {
      toastRef.current.error(
        'Google Drive is not connected. Please connect Google Drive first.',
        'Upload Failed'
      )
      return false
    }
    setIsUploadingToDrive(true)
    try {
      if (typeof window !== 'undefined' && window.api?.logs?.uploadDatabaseToDrive) {
        const result = await window.api.logs.uploadDatabaseToDrive()
        if (result && result.success) {
          toastRef.current.success(
            `Database snapshot uploaded to Google Drive (${result.fileName || 'backup'}).`,
            'Upload Complete'
          )
          return true
        } else if (result && result.error) {
          toastRef.current.error(String(result.error), 'Upload Failed')
          return false
        } else {
          toastRef.current.error('Failed to upload database to Google Drive.', 'Upload Failed')
          return false
        }
      }
      return false
    } catch (e) {
      toastRef.current.error(String(e), 'Upload Failed')
      return false
    } finally {
      setIsUploadingToDrive(false)
    }
  }, [isUploadingToDrive, driveStatus.isConnected])

  const handleOpenGitHubIssues = useCallback(async () => {
    await logger.openGitHubIssue()
    toastRef.current.info(
      'Gmail draft opened & logs folder revealed. You can drag focus.log to attach it.',
      'Report Bug'
    )
  }, [])

  const handleDeleteData = useCallback(async () => {
    try {
      setIsDeletingData(true)
      const res = await window.api.settings.deleteAllData()
      if (!res?.success) {
        setIsDeletingData(false)
        setIsDeleteDataModalOpen(false)
        toastRef.current.error(
          res?.error || 'Failed to delete data. Please try again.',
          'Delete Failed'
        )
      } else {
        toastRef.current.success(
          res.message || 'All local and Google Drive data has been permanently deleted.',
          'Data Deleted'
        )
        setIsDeletingData(false)
        setIsDeleteDataModalOpen(false)
        await loadDriveStatus()
        await onSyncComplete()
        await onSettingsSaved()
      }
    } catch (error) {
      console.error('Failed to delete data:', error)
      setIsDeletingData(false)
      setIsDeleteDataModalOpen(false)
      toastRef.current.error(
        error instanceof Error
          ? error.message
          : 'An unexpected error occurred while deleting data.',
        'Delete Error'
      )
    }
  }, [loadDriveStatus, onSyncComplete, onSettingsSaved])

  return (
    <PageShell className="overflow-y-auto custom-scrollbar">
      <div className="max-w-170 mx-auto py-4">
        <div className="rounded-2xl border border-border/70 bg-card overflow-hidden shadow-apple-subtle divide-y divide-border/50">
          <GeneralSettingsSection
            theme={theme}
            setTheme={setTheme}
            interval={interval}
            setInterval={setInterval_}
            dailyFocusTarget={dailyFocusTarget}
            setDailyFocusTarget={setDailyFocusTarget}
            tratakaDuration={tratakaDuration}
            setTratakaDuration={setTratakaDuration}
            openAtLogin={openAtLogin}
            setOpenAtLogin={setOpenAtLogin}
            showWidget={showWidget}
            setShowWidget={setShowWidget}
            onOpenShortcuts={onOpenShortcuts}
          />

          <CloudSyncSection
            syncProvider={syncProvider}
            driveStatus={driveStatus}
            onDriveConnect={handleDriveConnect}
            onDriveSyncNow={handleDriveSyncNow}
            onDriveDisconnect={handleDriveDisconnect}
          />
        </div>

        <div className="rounded-2xl border border-border/70 bg-card overflow-hidden shadow-apple-subtle mt-4">
          <EvaluatorSettingsSection />
        </div>

        <UpdateSettingsSection lastUpdateCheck={lastUpdateCheck} />

        <DiagnosticsSection onOpenGitHubIssues={handleOpenGitHubIssues} />

        <DeleteDataSection onOpenDeleteDataModal={() => setIsDeleteDataModalOpen(true)} />
      </div>

      <DeleteDataModal
        isOpen={isDeleteDataModalOpen}
        isDeleting={isDeletingData}
        isDownloadingDb={isDownloadingDb}
        isUploadingToDrive={isUploadingToDrive}
        isDriveConnected={driveStatus.isConnected}
        onDownloadDatabase={handleDownloadDatabase}
        onUploadDatabaseToDrive={handleUploadDatabaseToDrive}
        onClose={() => setIsDeleteDataModalOpen(false)}
        onConfirmDelete={handleDeleteData}
      />
    </PageShell>
  )
}
