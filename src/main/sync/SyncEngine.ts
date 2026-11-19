import {
  FileManifestEntry,
  SyncManifest,
  computeChecksum,
  reconcileEntries,
  mergedDiffers,
  withRetry,
  lifecycleTime,
  logLifecycleTime
} from '../syncUtils'
import { sanitizeSettings } from '../settingsSanitizer'
import { logger } from '../logger'
import { DailyGoal, LogEntry, AppSettings, SyncTarget } from '../../shared/types'
import type { DataManager } from '../dataManager'
import type { ReminderScheduler } from '../scheduler'
import type { SyncStorageProvider, RemoteFileInfo } from './SyncStorageProvider'

export interface SyncEngineOptions {
  dataManager: DataManager
  scheduler: ReminderScheduler
  provider: SyncStorageProvider
  onDataUpdated?: (target?: SyncTarget) => void
  onPerformSync?: (options?: {
    incremental?: boolean
  }) => Promise<{ success: boolean; error?: string }>
}

export class SyncEngine {
  private dataManager: DataManager
  private scheduler: ReminderScheduler
  private provider: SyncStorageProvider
  private onDataUpdated?: (target?: SyncTarget) => void
  private onPerformSync?: (options?: {
    incremental?: boolean
  }) => Promise<{ success: boolean; error?: string }>

  public isSyncing = false
  public hasPendingSync = false
  public currentSyncId = 0
  public lastSyncError: string | null = null
  public syncAbortController: AbortController | null = null
  public activeSyncPromise: Promise<{ success: boolean; error?: string }> | null = null
  private syncDebounceTimer: NodeJS.Timeout | null = null
  private pollingIntervalId: NodeJS.Timeout | null = null

  public dirtyLogDates = new Set<string>()
  public dirtyGoalDates = new Set<string>()
  public dirtyInbox = false
  public dirtyRecurring = false
  public dirtySettings = false
  public dirtyPurged = false

  constructor(options: SyncEngineOptions) {
    this.dataManager = options.dataManager
    this.scheduler = options.scheduler
    this.provider = options.provider
    this.onDataUpdated = options.onDataUpdated
    this.onPerformSync = options.onPerformSync
  }

  public checkSyncActive(syncId?: number): void {
    if (this.syncAbortController?.signal.aborted) {
      throw new Error('Sync aborted')
    }
    if (typeof syncId === 'number' && syncId !== this.currentSyncId) {
      throw new Error('Sync superseded by newer run')
    }
  }

  public scheduleSyncAfterWrite(target?: SyncTarget): void {
    if (target) {
      target.logDates?.forEach((d) => this.dirtyLogDates.add(d))
      target.goalDates?.forEach((d) => this.dirtyGoalDates.add(d))
      if (target.syncInbox) this.dirtyInbox = true
      if (target.syncRecurring) this.dirtyRecurring = true
      if (target.syncSettings) this.dirtySettings = true
      if (target.syncPurged) this.dirtyPurged = true
    }

    if (typeof this.dataManager.consumeDirtySyncTargets === 'function') {
      const dmTargets = this.dataManager.consumeDirtySyncTargets(this.provider.providerId)
      dmTargets.logDates.forEach((d) => this.dirtyLogDates.add(d))
      dmTargets.goalDates.forEach((d) => this.dirtyGoalDates.add(d))
      if (dmTargets.syncInbox) this.dirtyInbox = true
      if (dmTargets.syncRecurring) this.dirtyRecurring = true
      if (dmTargets.syncSettings) this.dirtySettings = true
      if (dmTargets.syncPurged) this.dirtyPurged = true
    }

    if (this.syncDebounceTimer) clearTimeout(this.syncDebounceTimer)
    this.syncDebounceTimer = setTimeout(() => {
      this.syncDebounceTimer = null
      const syncFn = this.onPerformSync ?? ((opts) => this.syncNow(opts))
      syncFn({ incremental: true }).catch((e) =>
        logger.error(this.provider.providerId, 'Background sync failed:', e)
      )
    }, 2000)
  }

  public startBackgroundPolling(intervalMs = 60000): void {
    this.stopBackgroundPolling()
    this.pollingIntervalId = setInterval(() => {
      const syncFn = this.onPerformSync ?? ((opts) => this.syncNow(opts))
      syncFn({ incremental: true }).catch((e) =>
        logger.warn(this.provider.providerId, 'Polling sync error:', e)
      )
    }, intervalMs)
  }

  public stopBackgroundPolling(): void {
    if (this.pollingIntervalId) {
      clearInterval(this.pollingIntervalId)
      this.pollingIntervalId = null
    }
  }

  public destroy(): void {
    this.stopBackgroundPolling()
    if (this.syncDebounceTimer) {
      clearTimeout(this.syncDebounceTimer)
      this.syncDebounceTimer = null
    }
    if (this.syncAbortController) {
      this.syncAbortController.abort()
      this.syncAbortController = null
    }
    this.isSyncing = false
    this.hasPendingSync = false
    this.activeSyncPromise = null
  }

  public async waitForInFlightSync(timeoutMs = 3000): Promise<void> {
    if (!this.isSyncing || !this.activeSyncPromise) return
    let timer: NodeJS.Timeout | null = null
    const timeout = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, timeoutMs)
    })
    try {
      await Promise.race([this.activeSyncPromise.catch(() => {}), timeout])
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  public async syncNow(options?: {
    incremental?: boolean
  }): Promise<{ success: boolean; error?: string }> {
    if (this.isSyncing) {
      this.hasPendingSync = true
      logger.info(this.provider.providerId, 'Sync already in progress; flagged hasPendingSync')
      return { success: false, error: 'Cannot sync right now' }
    }

    if (!this.provider.isConnected()) {
      return { success: false, error: `${this.provider.name} is not connected` }
    }

    this.isSyncing = true
    const execution = this.executeSync(options)
    this.activeSyncPromise = execution
    try {
      return await execution
    } finally {
      this.activeSyncPromise = null
    }
  }

  private async executeSync(options?: {
    incremental?: boolean
  }): Promise<{ success: boolean; error?: string }> {
    const syncId = ++this.currentSyncId
    const abortController = new AbortController()
    this.syncAbortController = abortController

    const isIncremental = Boolean(options?.incremental)
    let logDatesToSync: string[] = []
    let goalDatesToSync: string[] = []
    let syncInbox = true
    let syncRecurring = true
    let syncSettings = true
    let syncPurged = true

    if (isIncremental) {
      logDatesToSync = Array.from(this.dirtyLogDates)
      this.dirtyLogDates.clear()

      goalDatesToSync = Array.from(this.dirtyGoalDates)
      this.dirtyGoalDates.clear()

      syncInbox = this.dirtyInbox
      this.dirtyInbox = false

      syncRecurring = this.dirtyRecurring
      this.dirtyRecurring = false

      syncSettings = this.dirtySettings
      this.dirtySettings = false

      syncPurged = this.dirtyPurged
      this.dirtyPurged = false
    }

    try {
      this.checkSyncActive(syncId)
      const remoteFiles = await this.provider.listRemoteFiles(syncId)

      // 1. Honor offline deleteAllData by wiping remote cloud storage on next sync
      if (
        typeof this.dataManager.hasPendingRemoteWipe === 'function' &&
        this.dataManager.hasPendingRemoteWipe()
      ) {
        logger.info(
          this.provider.providerId,
          'Pending remote wipe detected; clearing remote cloud backup files...'
        )
        for (const rf of remoteFiles) {
          if (rf.id && typeof this.provider.deleteRemoteFile === 'function') {
            try {
              await this.provider.deleteRemoteFile(rf.name, rf.id, syncId)
            } catch (delErr) {
              logger.warn(
                this.provider.providerId,
                `Failed to delete remote file ${rf.name} during remote wipe:`,
                delErr
              )
            }
          }
        }
        const wipedAt =
          typeof this.dataManager.getPendingRemoteWipeTimestamp === 'function'
            ? this.dataManager.getPendingRemoteWipeTimestamp() || Date.now()
            : Date.now()
        const cleanManifest: SyncManifest = {
          version: 1,
          lastSyncedAt: Date.now(),
          files: {},
          wipedAt
        }
        await this.saveRemoteManifest(cleanManifest, undefined, syncId)
        if (typeof this.dataManager.clearPendingRemoteWipe === 'function') {
          this.dataManager.clearPendingRemoteWipe()
        }
        this.lastSyncError = null
        return { success: true }
      }

      const localManifest: SyncManifest =
        typeof this.dataManager.getSyncManifest === 'function'
          ? (await this.dataManager.getSyncManifest()) || {
              version: 1,
              lastSyncedAt: 0,
              files: {}
            }
          : {
              version: 1,
              lastSyncedAt: 0,
              files: {}
            }

      const remoteManifestFile = remoteFiles.find((f) => f.name === 'sync-manifest.json')
      let remoteManifest: SyncManifest | null = null
      if (remoteManifestFile) {
        try {
          const raw = await this.provider.readRemoteFile(
            'sync-manifest.json',
            remoteManifestFile.id,
            syncId,
            abortController.signal
          )
          if (raw) {
            remoteManifest = JSON.parse(raw)
          }
        } catch (err) {
          logger.warn(this.provider.providerId, 'Failed to read remote sync-manifest.json:', err)
        }
      }

      // 2. Honor remote cloud wipe from another device
      if (remoteManifest?.wipedAt && remoteManifest.wipedAt > (localManifest.lastSyncedAt || 0)) {
        logger.info(
          this.provider.providerId,
          'Remote wipe manifest detected; clearing local synced records to honor remote wipe...'
        )
        await this.dataManager.deleteAllData()
        if (typeof this.dataManager.clearPendingRemoteWipe === 'function') {
          this.dataManager.clearPendingRemoteWipe()
        }
        localManifest.lastSyncedAt = Date.now()
        localManifest.files = {}
        localManifest.wipedAt = remoteManifest.wipedAt
        if (typeof this.dataManager.setSyncManifest === 'function') {
          this.dataManager.setSyncManifest(localManifest)
        }
        this.lastSyncError = null
        return { success: true }
      }

      this.checkSyncActive(syncId)
      const logFilePattern = /^\d{4}-\d{2}-\d{2}\.json$/
      const goalFilePattern = /^goals-\d{4}-\d{2}-\d{2}\.json$/

      const logsResult = await this.syncLogs(
        remoteFiles,
        logFilePattern,
        isIncremental,
        logDatesToSync,
        localManifest,
        remoteManifest,
        syncId
      )

      this.checkSyncActive(syncId)
      const goalsResult = await this.syncGoals(
        remoteFiles,
        goalFilePattern,
        isIncremental,
        goalDatesToSync,
        localManifest,
        remoteManifest,
        syncId
      )

      this.checkSyncActive(syncId)
      const listsResult = await this.syncListFiles(
        remoteFiles,
        isIncremental,
        syncInbox,
        syncRecurring,
        syncPurged,
        localManifest,
        remoteManifest,
        syncId
      )

      this.checkSyncActive(syncId)
      const settingsChanged = await this.syncSettings(
        remoteFiles,
        isIncremental,
        syncSettings,
        localManifest,
        remoteManifest,
        syncId
      )

      this.checkSyncActive(syncId)
      localManifest.lastSyncedAt = Date.now()
      if (typeof this.dataManager.setSyncManifest === 'function') {
        this.dataManager.setSyncManifest(localManifest)
      }

      try {
        await this.saveRemoteManifest(localManifest, remoteManifestFile?.id, syncId)
      } catch (manifestErr) {
        if (syncId !== this.currentSyncId || !this.provider.isConnected()) throw manifestErr
        logger.warn(
          this.provider.providerId,
          'Failed to update remote sync-manifest.json:',
          manifestErr
        )
      }

      const hasLocalChanges =
        logsResult.changed || goalsResult.changed || listsResult.changed || settingsChanged
      if (hasLocalChanges) {
        this.onDataUpdated?.({
          logDates: logsResult.changedDates.length > 0 ? logsResult.changedDates : undefined,
          goalDates: goalsResult.changedDates.length > 0 ? goalsResult.changedDates : undefined,
          syncInbox: listsResult.syncInbox || undefined,
          syncRecurring: listsResult.syncRecurring || undefined,
          syncPurged: listsResult.syncPurged || undefined,
          syncSettings: settingsChanged || undefined
        })
      }

      this.lastSyncError = null
      return { success: true }
    } catch (error: unknown) {
      if (!this.provider.isConnected() || abortController.signal.aborted) {
        logger.info(
          this.provider.providerId,
          'Sync interrupted or aborted by disconnect; discarding dirty targets rollback.'
        )
        return { success: false, error: 'Sync disconnected' }
      }

      if (isIncremental) {
        logDatesToSync.forEach((d) => this.dirtyLogDates.add(d))
        goalDatesToSync.forEach((d) => this.dirtyGoalDates.add(d))
        if (syncInbox) this.dirtyInbox = true
        if (syncRecurring) this.dirtyRecurring = true
        if (syncSettings) this.dirtySettings = true
        if (syncPurged) this.dirtyPurged = true
      }

      const message = error instanceof Error ? error.message : String(error)
      this.lastSyncError = message
      logger.error(this.provider.providerId, 'Sync error:', error)
      return { success: false, error: message }
    } finally {
      this.isSyncing = false
      if (this.syncAbortController === abortController) {
        this.syncAbortController = null
      }
      if (this.hasPendingSync && this.provider.isConnected() && syncId === this.currentSyncId) {
        this.hasPendingSync = false
        this.scheduleSyncAfterWrite()
      } else {
        this.hasPendingSync = false
      }
    }
  }

  private async saveRemoteManifest(
    manifest: SyncManifest,
    existingFileId?: string | null,
    syncId?: number
  ): Promise<void> {
    this.checkSyncActive(syncId)
    const body = JSON.stringify(manifest, null, 2)
    await withRetry(() => {
      this.checkSyncActive(syncId)
      return this.provider.writeRemoteFile(
        'sync-manifest.json',
        body,
        existingFileId ?? undefined,
        syncId
      )
    })
  }

  private logLifecycleTime(log: LogEntry): number {
    return logLifecycleTime(log)
  }

  private maxLogLifecycleTime(logs: LogEntry[]): number {
    if (logs.length === 0) return 0
    return Math.max(...logs.map((l) => logLifecycleTime(l)))
  }

  private goalLifecycleTime(goal: DailyGoal): number {
    return lifecycleTime(goal)
  }

  private maxGoalLifecycleTime(goals: DailyGoal[]): number {
    if (goals.length === 0) return 0
    return Math.max(...goals.map((g) => lifecycleTime(g)))
  }

  private async syncLogs(
    remoteFiles: RemoteFileInfo[],
    logFilePattern: RegExp,
    isIncremental: boolean,
    targetDates: string[],
    localManifest: SyncManifest,
    remoteManifest: SyncManifest | null,
    syncId: number
  ): Promise<{ changed: boolean; changedDates: string[] }> {
    const ext = 'json'
    const allDates = new Set<string>()

    if (isIncremental) {
      targetDates.forEach((date) => allDates.add(date))
      if (localManifest.lastSyncedAt > 0) {
        remoteFiles.forEach((f) => {
          if (f.name && logFilePattern.test(f.name)) {
            const date = f.name.replace(`.${ext}`, '')
            const localEntry = localManifest.files[f.name]
            const remoteEntry = remoteManifest?.files?.[f.name]
            if (
              !localEntry ||
              (remoteEntry && remoteEntry.localTimestamp > (localEntry.localTimestamp || 0)) ||
              (f.modifiedTime && f.modifiedTime !== localEntry.remoteModifiedTime)
            ) {
              allDates.add(date)
            }
          }
        })
      }
    } else {
      const localLogDates = await this.dataManager.getAllLogDates(true)
      remoteFiles.forEach((f) => {
        if (f.name && logFilePattern.test(f.name)) allDates.add(f.name.replace(`.${ext}`, ''))
      })
      localLogDates.forEach((date) => allDates.add(date))
    }

    const dateList = Array.from(allDates)
    const CONCURRENCY_LIMIT = 5
    let anyLocalChanged = false
    const changedDates: string[] = []

    for (let i = 0; i < dateList.length; i += CONCURRENCY_LIMIT) {
      this.checkSyncActive(syncId)
      const chunk = dateList.slice(i, i + CONCURRENCY_LIMIT)
      const results = await Promise.all(
        chunk.map(async (date) => {
          this.checkSyncActive(syncId)
          const fileName = `${date}.${ext}`
          const remoteFile = remoteFiles.find((f) => f.name === fileName)
          const localManifestEntry = localManifest.files[fileName]
          const remoteManifestEntry = remoteManifest?.files?.[fileName]

          let localData: LogEntry[] = []
          try {
            localData = await this.dataManager.getLogs(date, true)
          } catch (err) {
            logger.warn(this.provider.providerId, `Failed to read local logs for ${date}:`, err)
          }

          if (remoteFile) {
            const localMaxTime = this.maxLogLifecycleTime(localData)
            const remoteUnchanged = Boolean(
              (remoteFile.md5Checksum && remoteFile.md5Checksum === localManifestEntry?.checksum) ||
              (remoteFile.modifiedTime &&
                localManifestEntry?.remoteModifiedTime &&
                remoteFile.modifiedTime === localManifestEntry.remoteModifiedTime)
            )
            const localUnchanged =
              Boolean(localManifestEntry) && localMaxTime <= localManifestEntry!.localTimestamp

            if (remoteUnchanged && localUnchanged && !isIncremental) {
              return false
            }

            if (remoteUnchanged && localData.length > 0) {
              const body = JSON.stringify(localData, null, 2)
              const checksum = computeChecksum(body)
              await withRetry(() => {
                this.checkSyncActive(syncId)
                return this.provider.writeRemoteFile(fileName, body, remoteFile.id, syncId)
              })
              const manifestEntry: FileManifestEntry = {
                fileId: remoteFile.id,
                checksum,
                remoteModifiedTime: remoteFile.modifiedTime,
                localTimestamp: localMaxTime
              }
              localManifest.files[fileName] = manifestEntry
              if (remoteManifest) remoteManifest.files[fileName] = manifestEntry
              return false
            }

            const remoteDataRaw = await withRetry(() =>
              this.provider.readRemoteFile(
                fileName,
                remoteFile.id,
                syncId,
                this.syncAbortController?.signal
              )
            )
            if (remoteDataRaw === null) {
              return false
            }

            let remoteData: LogEntry[] = []
            try {
              const parsed = JSON.parse(remoteDataRaw)
              if (Array.isArray(parsed)) {
                remoteData = parsed
              } else {
                throw new Error('Remote logs payload is not an array')
              }
            } catch (err) {
              logger.warn(
                this.provider.providerId,
                `Failed to parse remote logs for ${date}, skipping sync:`,
                err
              )
              return false
            }

            const mergedData = reconcileEntries(
              localData,
              remoteData,
              (l) => this.logLifecycleTime(l),
              (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
            )

            const localDiffers = mergedDiffers(mergedData, localData, (l) =>
              this.logLifecycleTime(l)
            )
            const remoteDiffers = mergedDiffers(mergedData, remoteData, (l) =>
              this.logLifecycleTime(l)
            )

            let localChanged = false
            if (localDiffers) {
              await this.dataManager.setLogs(date, mergedData, true)
              localChanged = true
            }

            let finalChecksum = remoteManifestEntry?.checksum || remoteFile.md5Checksum
            let finalModified = remoteFile.modifiedTime

            if (remoteDiffers) {
              const body = JSON.stringify(mergedData, null, 2)
              finalChecksum = computeChecksum(body)
              const updateRes = await withRetry(() => {
                this.checkSyncActive(syncId)
                return this.provider.writeRemoteFile(fileName, body, remoteFile.id, syncId)
              })
              finalModified = updateRes?.fileId ? new Date().toISOString() : finalModified
            }

            const manifestEntry: FileManifestEntry = {
              fileId: remoteFile.id,
              checksum: finalChecksum,
              remoteModifiedTime: finalModified,
              localTimestamp: this.maxLogLifecycleTime(mergedData)
            }
            localManifest.files[fileName] = manifestEntry
            if (remoteManifest) remoteManifest.files[fileName] = manifestEntry
            return localChanged
          } else {
            // New local file to upload
            if (localData.length === 0) return false
            const body = JSON.stringify(localData, null, 2)
            const checksum = computeChecksum(body)
            const createRes = await withRetry(() => {
              this.checkSyncActive(syncId)
              return this.provider.writeRemoteFile(fileName, body, undefined, syncId)
            })
            const manifestEntry: FileManifestEntry = {
              fileId: createRes?.fileId,
              checksum,
              remoteModifiedTime: new Date().toISOString(),
              localTimestamp: this.maxLogLifecycleTime(localData)
            }
            localManifest.files[fileName] = manifestEntry
            if (remoteManifest) remoteManifest.files[fileName] = manifestEntry
            return false
          }
        })
      )

      results.forEach((res, index) => {
        if (res) {
          anyLocalChanged = true
          changedDates.push(chunk[index])
        }
      })
    }

    return { changed: anyLocalChanged, changedDates }
  }

  private async syncGoals(
    remoteFiles: RemoteFileInfo[],
    goalFilePattern: RegExp,
    isIncremental: boolean,
    targetDates: string[],
    localManifest: SyncManifest,
    remoteManifest: SyncManifest | null,
    syncId: number
  ): Promise<{ changed: boolean; changedDates: string[] }> {
    const ext = 'json'
    const allDates = new Set<string>()

    if (isIncremental) {
      targetDates.forEach((date) => allDates.add(date))
      if (localManifest.lastSyncedAt > 0) {
        remoteFiles.forEach((f) => {
          if (f.name && goalFilePattern.test(f.name)) {
            const date = f.name.replace(`goals-`, '').replace(`.${ext}`, '')
            const localEntry = localManifest.files[f.name]
            const remoteEntry = remoteManifest?.files?.[f.name]
            if (
              !localEntry ||
              (remoteEntry && remoteEntry.localTimestamp > (localEntry.localTimestamp || 0)) ||
              (f.modifiedTime && f.modifiedTime !== localEntry.remoteModifiedTime)
            ) {
              allDates.add(date)
            }
          }
        })
      }
    } else {
      const localGoalDates = await this.dataManager.getAllGoalDates(true)
      remoteFiles.forEach((f) => {
        if (f.name && goalFilePattern.test(f.name)) {
          allDates.add(f.name.replace(`goals-`, '').replace(`.${ext}`, ''))
        }
      })
      localGoalDates.forEach((date) => allDates.add(date))
    }

    const dateList = Array.from(allDates)
    const CONCURRENCY_LIMIT = 5
    let anyLocalChanged = false
    const changedDates: string[] = []

    for (let i = 0; i < dateList.length; i += CONCURRENCY_LIMIT) {
      this.checkSyncActive(syncId)
      const chunk = dateList.slice(i, i + CONCURRENCY_LIMIT)
      const results = await Promise.all(
        chunk.map(async (date) => {
          this.checkSyncActive(syncId)
          const fileName = `goals-${date}.${ext}`
          const remoteFile = remoteFiles.find((f) => f.name === fileName)
          const localManifestEntry = localManifest.files[fileName]
          const remoteManifestEntry = remoteManifest?.files?.[fileName]

          let localData: DailyGoal[] = []
          try {
            localData = await this.dataManager.getGoals(date, true)
          } catch (err) {
            logger.warn(this.provider.providerId, `Failed to read local goals for ${date}:`, err)
          }

          if (remoteFile) {
            const localMaxTime = this.maxGoalLifecycleTime(localData)
            const remoteUnchanged = Boolean(
              (remoteFile.md5Checksum && remoteFile.md5Checksum === localManifestEntry?.checksum) ||
              (remoteFile.modifiedTime &&
                localManifestEntry?.remoteModifiedTime &&
                remoteFile.modifiedTime === localManifestEntry.remoteModifiedTime)
            )
            const localUnchanged =
              Boolean(localManifestEntry) && localMaxTime <= localManifestEntry!.localTimestamp

            if (remoteUnchanged && localUnchanged && !isIncremental) {
              return false
            }

            if (remoteUnchanged && localData.length > 0) {
              const body = JSON.stringify(localData, null, 2)
              const checksum = computeChecksum(body)
              await withRetry(() => {
                this.checkSyncActive(syncId)
                return this.provider.writeRemoteFile(fileName, body, remoteFile.id, syncId)
              })
              const manifestEntry: FileManifestEntry = {
                fileId: remoteFile.id,
                checksum,
                remoteModifiedTime: remoteFile.modifiedTime,
                localTimestamp: localMaxTime
              }
              localManifest.files[fileName] = manifestEntry
              if (remoteManifest) remoteManifest.files[fileName] = manifestEntry
              return false
            }

            const remoteDataRaw = await withRetry(() =>
              this.provider.readRemoteFile(
                fileName,
                remoteFile.id,
                syncId,
                this.syncAbortController?.signal
              )
            )
            if (remoteDataRaw === null) {
              return false
            }

            let remoteData: DailyGoal[] = []
            try {
              const parsed = JSON.parse(remoteDataRaw)
              if (Array.isArray(parsed)) {
                remoteData = parsed
              } else {
                throw new Error('Remote goals payload is not an array')
              }
            } catch (err) {
              logger.warn(
                this.provider.providerId,
                `Failed to parse remote goals for ${date}, skipping sync:`,
                err
              )
              return false
            }

            const purgedIds = await this.dataManager.getPurgedIds()
            const mergedData = reconcileEntries(
              localData,
              remoteData,
              (g) => this.goalLifecycleTime(g),
              (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
              purgedIds
            )

            const localDiffers = mergedDiffers(mergedData, localData, (g) =>
              this.goalLifecycleTime(g)
            )
            const remoteDiffers = mergedDiffers(mergedData, remoteData, (g) =>
              this.goalLifecycleTime(g)
            )

            let localChanged = false
            if (localDiffers) {
              await this.dataManager.setGoals(date, mergedData, true)
              localChanged = true
            }

            let finalChecksum = remoteManifestEntry?.checksum || remoteFile.md5Checksum
            let finalModified = remoteFile.modifiedTime

            if (remoteDiffers) {
              const body = JSON.stringify(mergedData, null, 2)
              finalChecksum = computeChecksum(body)
              const updateRes = await withRetry(() => {
                this.checkSyncActive(syncId)
                return this.provider.writeRemoteFile(fileName, body, remoteFile.id, syncId)
              })
              finalModified = updateRes?.fileId ? new Date().toISOString() : finalModified
            }

            const manifestEntry: FileManifestEntry = {
              fileId: remoteFile.id,
              checksum: finalChecksum,
              remoteModifiedTime: finalModified,
              localTimestamp: this.maxGoalLifecycleTime(mergedData)
            }
            localManifest.files[fileName] = manifestEntry
            if (remoteManifest) remoteManifest.files[fileName] = manifestEntry
            return localChanged
          } else {
            // New local goals to upload
            if (localData.length === 0) return false
            const body = JSON.stringify(localData, null, 2)
            const checksum = computeChecksum(body)
            const createRes = await withRetry(() => {
              this.checkSyncActive(syncId)
              return this.provider.writeRemoteFile(fileName, body, undefined, syncId)
            })
            const manifestEntry: FileManifestEntry = {
              fileId: createRes?.fileId,
              checksum,
              remoteModifiedTime: new Date().toISOString(),
              localTimestamp: this.maxGoalLifecycleTime(localData)
            }
            localManifest.files[fileName] = manifestEntry
            if (remoteManifest) remoteManifest.files[fileName] = manifestEntry
            return false
          }
        })
      )

      results.forEach((res, index) => {
        if (res) {
          anyLocalChanged = true
          changedDates.push(chunk[index])
        }
      })
    }

    return { changed: anyLocalChanged, changedDates }
  }

  private async syncListFiles(
    remoteFiles: RemoteFileInfo[],
    isIncremental: boolean,
    syncInbox: boolean,
    syncRecurring: boolean,
    syncPurged: boolean,
    _localManifest: SyncManifest,
    _remoteManifest: SyncManifest | null,
    syncId: number
  ): Promise<{
    changed: boolean
    syncInbox: boolean
    syncRecurring: boolean
    syncPurged: boolean
  }> {
    let inboxChanged = false
    let recurringChanged = false
    let purgedChanged = false

    // 1. Sync Inbox Goals
    if (!isIncremental || syncInbox) {
      this.checkSyncActive(syncId)
      const fileName = 'goal-inbox.json'
      const remoteFile = remoteFiles.find((f) => f.name === fileName)
      const localData = await this.dataManager.getInboxGoals(true)
      const purgedIds = await this.dataManager.getPurgedIds()

      if (remoteFile) {
        const remoteRaw = await withRetry(() =>
          this.provider.readRemoteFile(
            fileName,
            remoteFile.id,
            syncId,
            this.syncAbortController?.signal
          )
        )
        if (remoteRaw) {
          try {
            const remoteData = JSON.parse(remoteRaw)
            if (Array.isArray(remoteData)) {
              const merged = reconcileEntries(
                localData,
                remoteData,
                (i) => new Date(i.updatedAt || i.createdAt || 0).getTime(),
                undefined,
                purgedIds
              )
              if (
                mergedDiffers(merged, localData, (i) =>
                  new Date(i.updatedAt || i.createdAt || 0).getTime()
                )
              ) {
                await this.dataManager.setInboxGoals(merged, true)
                inboxChanged = true
              }
              if (
                mergedDiffers(merged, remoteData, (i) =>
                  new Date(i.updatedAt || i.createdAt || 0).getTime()
                )
              ) {
                const body = JSON.stringify(merged, null, 2)
                await withRetry(() =>
                  this.provider.writeRemoteFile(fileName, body, remoteFile.id, syncId)
                )
              }
            }
          } catch (err) {
            logger.warn(this.provider.providerId, 'Failed to parse remote goal-inbox.json:', err)
          }
        }
      } else if (localData.length > 0) {
        const body = JSON.stringify(localData, null, 2)
        await withRetry(() => this.provider.writeRemoteFile(fileName, body, undefined, syncId))
      }
    }

    // 2. Sync Recurring Goals
    if (!isIncremental || syncRecurring) {
      this.checkSyncActive(syncId)
      const fileName = 'recurring-goals.json'
      const remoteFile = remoteFiles.find((f) => f.name === fileName)
      const localData = await this.dataManager.getRecurringGoals(true)

      if (remoteFile) {
        const remoteRaw = await withRetry(() =>
          this.provider.readRemoteFile(
            fileName,
            remoteFile.id,
            syncId,
            this.syncAbortController?.signal
          )
        )
        if (remoteRaw) {
          try {
            const remoteData = JSON.parse(remoteRaw)
            if (Array.isArray(remoteData)) {
              const merged = reconcileEntries(localData, remoteData, (r) =>
                new Date(r.updatedAt || r.createdAt || 0).getTime()
              )
              if (
                mergedDiffers(merged, localData, (r) =>
                  new Date(r.updatedAt || r.createdAt || 0).getTime()
                )
              ) {
                await this.dataManager.setRecurringGoals(merged, true)
                recurringChanged = true
              }
              if (
                mergedDiffers(merged, remoteData, (r) =>
                  new Date(r.updatedAt || r.createdAt || 0).getTime()
                )
              ) {
                const body = JSON.stringify(merged, null, 2)
                await withRetry(() =>
                  this.provider.writeRemoteFile(fileName, body, remoteFile.id, syncId)
                )
              }
            }
          } catch (err) {
            logger.warn(
              this.provider.providerId,
              'Failed to parse remote recurring-goals.json:',
              err
            )
          }
        }
      } else if (localData.length > 0) {
        const body = JSON.stringify(localData, null, 2)
        await withRetry(() => this.provider.writeRemoteFile(fileName, body, undefined, syncId))
      }
    }

    // 3. Sync Purged Records
    if (!isIncremental || syncPurged) {
      this.checkSyncActive(syncId)
      const fileName = 'purged-records.json'
      const remoteFile = remoteFiles.find((f) => f.name === fileName)
      const localData = await this.dataManager.getPurgedRecords()

      if (remoteFile) {
        const remoteRaw = await withRetry(() =>
          this.provider.readRemoteFile(
            fileName,
            remoteFile.id,
            syncId,
            this.syncAbortController?.signal
          )
        )
        if (remoteRaw) {
          try {
            const remoteData = JSON.parse(remoteRaw)
            if (Array.isArray(remoteData)) {
              const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
              const merged = reconcileEntries(localData, remoteData, (p) =>
                new Date(p.purgedAt || 0).getTime()
              ).filter((p) => p.purgedAt && p.purgedAt >= ninetyDaysAgo)

              if (mergedDiffers(merged, localData, (p) => new Date(p.purgedAt || 0).getTime())) {
                await this.dataManager.setPurgedRecords(merged, true)
                purgedChanged = true
              }
              if (mergedDiffers(merged, remoteData, (p) => new Date(p.purgedAt || 0).getTime())) {
                const body = JSON.stringify(merged, null, 2)
                await withRetry(() =>
                  this.provider.writeRemoteFile(fileName, body, remoteFile.id, syncId)
                )
              }
            }
          } catch (err) {
            logger.warn(
              this.provider.providerId,
              'Failed to parse remote purged-records.json:',
              err
            )
          }
        }
      } else if (localData.length > 0) {
        const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
        const activeLocal = localData.filter((p) => p.purgedAt && p.purgedAt >= ninetyDaysAgo)
        if (activeLocal.length > 0) {
          const body = JSON.stringify(activeLocal, null, 2)
          await withRetry(() => this.provider.writeRemoteFile(fileName, body, undefined, syncId))
        }
      }
    }

    return {
      changed: inboxChanged || recurringChanged || purgedChanged,
      syncInbox: inboxChanged,
      syncRecurring: recurringChanged,
      syncPurged: purgedChanged
    }
  }

  private async syncSettings(
    remoteFiles: RemoteFileInfo[],
    isIncremental: boolean,
    syncSettings: boolean,
    _localManifest: SyncManifest,
    _remoteManifest: SyncManifest | null,
    syncId: number
  ): Promise<boolean> {
    if (isIncremental && !syncSettings) return false
    this.checkSyncActive(syncId)
    const fileName = 'settings.json'
    const remoteFile = remoteFiles.find((f) => f.name === fileName)
    const localSettings = this.scheduler.getSettings()

    if (remoteFile) {
      const remoteRaw = await withRetry(() =>
        this.provider.readRemoteFile(
          fileName,
          remoteFile.id,
          syncId,
          this.syncAbortController?.signal
        )
      )
      if (remoteRaw) {
        try {
          const remoteSettings = JSON.parse(remoteRaw) as AppSettings
          const localTime = localSettings.lastUpdated || 0
          const remoteTime = remoteSettings.lastUpdated || 0

          if (remoteTime > localTime) {
            this.scheduler.setSettings(
              {
                ...localSettings,
                ...remoteSettings,
                driveRefreshToken: localSettings.driveRefreshToken,
                driveSyncEnabled: localSettings.driveSyncEnabled
              },
              false
            )
            return true
          } else if (localTime > remoteTime) {
            const sanitized = sanitizeSettings(localSettings)
            const body = JSON.stringify(sanitized, null, 2)
            await withRetry(() =>
              this.provider.writeRemoteFile(fileName, body, remoteFile.id, syncId)
            )
          }
        } catch (err) {
          logger.warn(this.provider.providerId, 'Failed to parse remote settings.json:', err)
        }
      }
    } else {
      const sanitized = sanitizeSettings(localSettings)
      const body = JSON.stringify(sanitized, null, 2)
      await withRetry(() => this.provider.writeRemoteFile(fileName, body, undefined, syncId))
    }

    return false
  }
}
