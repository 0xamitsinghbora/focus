import { app } from 'electron'
import fssync from 'fs'
import path from 'path'
import Database from 'better-sqlite3'
import { logger } from './logger'
import {
  LogEntry,
  AppSettings,
  DailyGoal,
  GoalInboxItem,
  RecurringGoal,
  RecurringFrequency,
  DayReviewData,
  SessionTimerPayload,
  HeatmapBreakdown,
  SyncDirtyTargets,
  GoalType
} from '../shared/types'
import { SyncManifest, SyncTarget } from './syncUtils'
import { initDatabaseSchema } from './dataMigrations'
import {
  backupDatabase,
  backupDatabaseToFile,
  maybePerformDailyBackup,
  exportAllData,
  importAllData,
  type ExportPayload,
  type ImportResult
} from './dataBackup'
import {
  SettingsRepository,
  DEFAULT_SETTINGS,
  LogsRepository,
  GoalsRepository,
  DailyGoalsRepository,
  InboxRepository,
  RecurringGoalsRepository,
  TrashArchiveRepository,
  LearningRepository,
  EvaluationRepository
} from './repositories'
import { AnalyticsService } from './services/AnalyticsService'
import { LearningService } from './services/LearningService'
import { EvaluatorService } from './services/EvaluatorService'

export interface PurgedRecord {
  id: string
  entity: string
  purgedAt: string
}

export class DataManager {
  public static readonly DEFAULT_SETTINGS: AppSettings = DEFAULT_SETTINGS

  private dataPath: string
  private db!: Database.Database

  public settingsRepo!: SettingsRepository
  public logsRepo!: LogsRepository
  public goalsRepo!: GoalsRepository
  public analyticsService!: AnalyticsService
  public learningRepo!: LearningRepository
  public learningService!: LearningService
  public evaluationRepo!: EvaluationRepository
  public evaluatorService!: EvaluatorService

  public get dailyGoalsRepo(): DailyGoalsRepository {
    return this.goalsRepo.daily
  }

  public get inboxRepo(): InboxRepository {
    return this.goalsRepo.inbox
  }

  public get recurringRepo(): RecurringGoalsRepository {
    return this.goalsRepo.recurring
  }

  public get trashRepo(): TrashArchiveRepository {
    return this.goalsRepo.trash
  }

  private dirtyLogDates = new Set<string>()
  private dirtyGoalDates = new Set<string>()
  private dirtyInbox = false
  private dirtyRecurring = false
  private dirtySettings = false
  private dirtyPurged = false
  private providerDirtyTargets = new Map<
    string,
    {
      logDates: Set<string>
      goalDates: Set<string>
      syncInbox: boolean
      syncRecurring: boolean
      syncSettings: boolean
      syncPurged: boolean
    }
  >()
  private backupTimer: NodeJS.Timeout | null = null

  constructor(customDbPath?: string) {
    if (customDbPath) {
      this.dataPath = path.dirname(customDbPath)
      fssync.mkdirSync(this.dataPath, { recursive: true })
      this.initDatabaseWithRecovery(customDbPath)
      return
    }

    this.dataPath = path.join(app.getPath('userData'), 'focus-logs')
    fssync.mkdirSync(this.dataPath, { recursive: true })

    const dbPath = path.join(this.dataPath, 'focus.db')
    this.initDatabaseWithRecovery(dbPath)
    this.backupTimer = setTimeout(() => {
      this.backupTimer = null
      maybePerformDailyBackup(this.db, this.dataPath, () =>
        this.purgeSoftDeletedRecordsOlderThan(30)
      )
    }, 2000)
  }

  private initDatabaseWithRecovery(dbPath: string): void {
    try {
      this.db = new Database(dbPath)
      this.initDb()
      this.prepareStatements()
      const checkResult = this.db.pragma('quick_check') as Array<{ quick_check: string }>
      if (
        Array.isArray(checkResult) &&
        checkResult.length > 0 &&
        checkResult[0].quick_check !== 'ok'
      ) {
        throw new Error(`SQLite quick_check failed: ${checkResult[0].quick_check}`)
      }
    } catch (err) {
      logger.error('db', 'Database corruption or initialization failure detected:', err)
      this.recoverCorruptDatabase(dbPath)
    }
  }

  private recoverCorruptDatabase(dbPath: string): void {
    try {
      if (this.db) {
        try {
          this.db.close()
        } catch {
          // ignore
        }
      }

      const corruptTimestamp = Date.now()
      for (const ext of ['', '-wal', '-shm']) {
        const filePath = `${dbPath}${ext}`
        const targetCorruptPath = `${dbPath}.corrupt.${corruptTimestamp}${ext}`
        if (fssync.existsSync(filePath)) {
          try {
            fssync.copyFileSync(filePath, targetCorruptPath)
            fssync.unlinkSync(filePath)
            logger.warn(
              'db',
              `Quarantined corrupt database file ${filePath} to ${targetCorruptPath} and removed original file`
            )
          } catch (copyErr) {
            logger.error('db', `Failed to quarantine corrupt database file ${filePath}:`, copyErr)
            try {
              if (fssync.existsSync(filePath)) fssync.unlinkSync(filePath)
            } catch {
              // ignore
            }
          }
        }
      }

      const backupDir = path.join(this.dataPath, 'backups')
      let restoredFromBackup = false
      if (fssync.existsSync(backupDir)) {
        const backups = fssync
          .readdirSync(backupDir)
          .filter((f) => f.startsWith('focus-backup-') && f.endsWith('.db'))
          .sort()
          .reverse()

        for (const backup of backups) {
          const candidatePath = path.join(backupDir, backup)
          try {
            const tempDb = new Database(candidatePath, { readonly: true })
            const result = tempDb.pragma('quick_check') as Array<{ quick_check: string }>
            tempDb.close()

            if (Array.isArray(result) && result[0]?.quick_check === 'ok') {
              for (const ext of ['-wal', '-shm']) {
                const staleFile = `${dbPath}${ext}`
                if (fssync.existsSync(staleFile)) {
                  try {
                    fssync.unlinkSync(staleFile)
                  } catch {
                    // ignore
                  }
                }
              }
              fssync.copyFileSync(candidatePath, dbPath)
              logger.info('db', `Successfully restored database from clean backup: ${backup}`)
              restoredFromBackup = true
              break
            } else {
              logger.warn('db', `Backup ${backup} failed integrity check, trying next...`)
            }
          } catch (candErr) {
            logger.warn('db', `Failed evaluating backup candidate ${backup}:`, candErr)
          }
        }
      }

      if (!restoredFromBackup) {
        logger.warn(
          'db',
          'No usable backup found. Initializing a clean database to recover operation.'
        )
      }

      this.db = new Database(dbPath)
      this.initDb()
      this.prepareStatements()
    } catch (criticalErr) {
      logger.error('db', 'Critical failure during database recovery:', criticalErr)
      throw criticalErr
    }
  }

  private initDb(): void {
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
    this.db.pragma('synchronous = NORMAL')
    this.db.pragma('busy_timeout = 5000')
    this.db.pragma('cache_size = -4000')
    this.db.pragma('auto_vacuum = INCREMENTAL')

    initDatabaseSchema(this.db)
  }

  private prepareStatements(): void {
    this.settingsRepo = new SettingsRepository(this.db, () => {
      this.dirtySettings = true
    })

    this.logsRepo = new LogsRepository(this.db, (date) => {
      this.dirtyLogDates.add(date)
      this.analyticsService?.invalidateGoalMinutesCache()
    })

    this.goalsRepo = new GoalsRepository(this.db, this.settingsRepo, this.logsRepo, {
      markDirtyGoalDate: (date) => this.dirtyGoalDates.add(date),
      markDirtyInbox: () => {
        this.dirtyInbox = true
      },
      markDirtyRecurring: () => {
        this.dirtyRecurring = true
      },
      markDirtyPurged: () => {
        this.dirtyPurged = true
      },
      invalidateMinutesCache: () => this.analyticsService?.invalidateGoalMinutesCache()
    })

    this.evaluationRepo = new EvaluationRepository(this.db)

    this.analyticsService = new AnalyticsService(
      this.db,
      this.goalsRepo,
      this.logsRepo,
      this.settingsRepo,
      this.evaluationRepo
    )

    this.learningRepo = new LearningRepository(this.db)
    this.learningService = new LearningService(this.db, this.learningRepo, this.goalsRepo)

    this.evaluatorService = new EvaluatorService({
      evaluationRepo: this.evaluationRepo,
      goalsRepo: this.goalsRepo,
      logsRepo: this.logsRepo,
      settingsRepo: this.settingsRepo
    })
  }

  // --- Settings & Preferences Delegation ---

  public getSettings(): AppSettings {
    return this.settingsRepo.getSettings()
  }

  public setSettings(settings: AppSettings): void {
    if (!this.db || !this.db.open) return
    const prevCutoff = this.settingsRepo.getSettings().dayCutoffHour
    this.settingsRepo.setSettings(settings)
    this.dirtySettings = true
    if (typeof settings.dayCutoffHour === 'number' && settings.dayCutoffHour !== prevCutoff) {
      this.goalsRepo.recalculateEffectiveDates(settings.dayCutoffHour)
      this.logsRepo.recalculateEffectiveDates(settings.dayCutoffHour)
    }
  }

  public patchSettings(partial: Partial<AppSettings>): AppSettings {
    if (!this.db || !this.db.open) return this.settingsRepo.getSettings()
    const prevCutoff = this.settingsRepo.getSettings().dayCutoffHour
    const updated = this.settingsRepo.patchSettings(partial)
    this.dirtySettings = true
    if (typeof partial.dayCutoffHour === 'number' && partial.dayCutoffHour !== prevCutoff) {
      this.goalsRepo.recalculateEffectiveDates(partial.dayCutoffHour)
      this.logsRepo.recalculateEffectiveDates(partial.dayCutoffHour)
    }
    return updated
  }

  public getGroupColors(): Record<string, string> {
    return this.settingsRepo.getGroupColors()
  }

  public setGroupColor(tag: string, color: string): void {
    this.settingsRepo.setGroupColor(tag, color)
    this.dirtySettings = true
  }

  public deleteGroupColor(tag: string): void {
    this.settingsRepo.deleteGroupColor(tag)
    this.dirtySettings = true
  }

  public setGroupColors(colors: Record<string, string>): void {
    this.settingsRepo.setGroupColors(colors)
    this.dirtySettings = true
  }

  public async updateGroupColorAcrossGoals(
    groupTag: string,
    groupColor: string
  ): Promise<string[]> {
    const affected = await this.goalsRepo.updateGroupColorAcrossGoals(groupTag, groupColor)
    affected.forEach((d) => this.dirtyGoalDates.add(d))
    return affected
  }

  public async renameGroupAcrossGoals(
    oldTag: string,
    newTag: string,
    newColor?: string
  ): Promise<string[]> {
    const affected = await this.goalsRepo.renameGroupAcrossGoals(oldTag, newTag, newColor)
    affected.forEach((d) => this.dirtyGoalDates.add(d))
    return affected
  }

  public getSyncManifest(): SyncManifest | null {
    return this.settingsRepo.getSyncManifest()
  }

  public setSyncManifest(manifest: SyncManifest): void {
    this.settingsRepo.setSyncManifest(manifest)
  }

  public getActiveSession(): SessionTimerPayload | null {
    return this.settingsRepo.getActiveSession()
  }

  public setActiveSession(payload: SessionTimerPayload | null, forceImmediate = false): void {
    this.settingsRepo.setActiveSession(payload, forceImmediate)
  }

  // --- Dirty Tracking & Sync Targets ---

  public markDirty(target: SyncTarget): void {
    if (target.logDates?.length || target.goalDates?.length) {
      this.analyticsService.invalidateGoalMinutesCache()
    }
    target.logDates?.forEach((d) => {
      this.dirtyLogDates.add(d)
    })
    target.goalDates?.forEach((d) => {
      this.dirtyGoalDates.add(d)
    })
    if (target.syncInbox) this.dirtyInbox = true
    if (target.syncRecurring) this.dirtyRecurring = true
    if (target.syncSettings) this.dirtySettings = true
    if (target.syncPurged) this.dirtyPurged = true

    for (const p of this.providerDirtyTargets.values()) {
      target.logDates?.forEach((d) => p.logDates.add(d))
      target.goalDates?.forEach((d) => p.goalDates.add(d))
      if (target.syncInbox) p.syncInbox = true
      if (target.syncRecurring) p.syncRecurring = true
      if (target.syncSettings) p.syncSettings = true
      if (target.syncPurged) p.syncPurged = true
    }
  }

  private getOrCreateProviderDirty(provider: string): {
    logDates: Set<string>
    goalDates: Set<string>
    syncInbox: boolean
    syncRecurring: boolean
    syncSettings: boolean
    syncPurged: boolean
  } {
    let p = this.providerDirtyTargets.get(provider)
    if (!p) {
      p = {
        logDates: new Set(this.dirtyLogDates),
        goalDates: new Set(this.dirtyGoalDates),
        syncInbox: this.dirtyInbox,
        syncRecurring: this.dirtyRecurring,
        syncSettings: this.dirtySettings,
        syncPurged: this.dirtyPurged
      }
      this.providerDirtyTargets.set(provider, p)
    }
    return p
  }

  public getDirtySyncTargets(provider?: string): SyncDirtyTargets {
    if (provider) {
      const p = this.getOrCreateProviderDirty(provider)
      return {
        logDates: Array.from(p.logDates),
        goalDates: Array.from(p.goalDates),
        syncInbox: p.syncInbox,
        syncRecurring: p.syncRecurring,
        syncSettings: p.syncSettings,
        syncPurged: p.syncPurged
      }
    }
    return {
      logDates: Array.from(this.dirtyLogDates),
      goalDates: Array.from(this.dirtyGoalDates),
      syncInbox: this.dirtyInbox,
      syncRecurring: this.dirtyRecurring,
      syncSettings: this.dirtySettings,
      syncPurged: this.dirtyPurged
    }
  }

  public consumeDirtySyncTargets(provider?: string): SyncDirtyTargets {
    if (provider) {
      const p = this.getOrCreateProviderDirty(provider)
      const targets = {
        logDates: Array.from(p.logDates),
        goalDates: Array.from(p.goalDates),
        syncInbox: p.syncInbox,
        syncRecurring: p.syncRecurring,
        syncSettings: p.syncSettings,
        syncPurged: p.syncPurged
      }
      p.logDates.clear()
      p.goalDates.clear()
      p.syncInbox = false
      p.syncRecurring = false
      p.syncSettings = false
      p.syncPurged = false
      return targets
    }
    const targets = this.getDirtySyncTargets()
    this.dirtyLogDates.clear()
    this.dirtyGoalDates.clear()
    this.dirtyInbox = false
    this.dirtyRecurring = false
    this.dirtySettings = false
    this.dirtyPurged = false
    return targets
  }

  // --- Backup & Export Delegation ---

  public async backupDatabase(backupDir?: string): Promise<string> {
    return backupDatabase(this.db, this.dataPath, backupDir)
  }

  public async backupDatabaseToFile(destPath: string): Promise<string> {
    return backupDatabaseToFile(this.db, destPath)
  }

  public async exportAllData(): Promise<ExportPayload> {
    return exportAllData({
      db: this.db,
      mapGoalRow: (r) => this.goalsRepo.mapGoalRow(r),
      getInboxGoals: () => this.getInboxGoals(),
      getRecurringGoals: () => this.getRecurringGoals(),
      getGroupColors: () => this.getGroupColors(),
      getSettings: () => this.getSettings()
    })
  }

  public async importAllData(payload: unknown): Promise<ImportResult> {
    return importAllData(
      {
        db: this.db,
        upsertLog: (entry, date) => this.logsRepo.upsertLog(entry, date),
        upsertDailyGoal: (goal) => this.goalsRepo.upsertGoal(goal),
        upsertInboxGoal: (inbox) => this.goalsRepo.inbox.upsertInboxGoal(inbox),
        upsertRecurringGoal: (recurring) => this.goalsRepo.recurring.upsertRecurringGoal(recurring),
        upsertGroupColor: (tag, color) => this.settingsRepo.setGroupColor(tag, color),
        markDirtyLogDate: (date) => this.dirtyLogDates.add(date),
        markDirtyGoalDate: (date) => this.dirtyGoalDates.add(date),
        onImportComplete: (counts) => {
          if (counts.logs > 0 || counts.dailyGoals > 0)
            this.analyticsService.invalidateGoalMinutesCache()
          if (counts.inboxGoals > 0) this.dirtyInbox = true
          if (counts.recurringGoals > 0) this.dirtyRecurring = true
          if (counts.groupColors > 0) this.dirtySettings = true
        }
      },
      payload
    )
  }

  public async deleteAllData(): Promise<void> {
    if (!this.db || !this.db.open) return

    const wipeTimestamp = Date.now()

    const wipeTx = this.db.transaction(() => {
      this.db.exec(`
        DELETE FROM logs;
        DELETE FROM daily_goals;
        DELETE FROM inbox_goals;
        DELETE FROM recurring_goals;
        DELETE FROM group_colors;
        DELETE FROM purged_records;
        DELETE FROM sync_state;
        DELETE FROM settings;
      `)
      // Atomically persist pending_remote_wipe so if sync reconnects, it wipes remote cloud instead of pulling old files
      this.db
        .prepare(`INSERT OR REPLACE INTO sync_state (key, value) VALUES ('pending_remote_wipe', ?)`)
        .run(JSON.stringify({ wipedAt: wipeTimestamp }))
    })
    wipeTx()

    this.settingsRepo.setSettings({
      ...DataManager.DEFAULT_SETTINGS,
      driveSyncEnabled: false,
      syncProvider: 'none',
      driveRefreshToken: undefined
    })

    try {
      this.db.exec('VACUUM;')
    } catch {
      // ignore vacuum errors
    }

    try {
      const backupDir = path.join(this.dataPath, 'backups')
      if (fssync.existsSync(backupDir)) {
        const files = fssync.readdirSync(backupDir)
        for (const file of files) {
          fssync.unlinkSync(path.join(backupDir, file))
        }
      }
    } catch (e) {
      logger.warn('db', 'Failed to remove backup files during data deletion:', e)
    }

    this.dirtyLogDates.clear()
    this.dirtyGoalDates.clear()
    this.dirtyInbox = false
    this.dirtyRecurring = false
    this.dirtySettings = false
    this.dirtyPurged = false
    this.providerDirtyTargets.clear()

    this.analyticsService?.invalidateGoalMinutesCache()
  }

  public hasPendingRemoteWipe(): boolean {
    if (!this.db || !this.db.open) return false
    try {
      const row = this.db
        .prepare("SELECT value FROM sync_state WHERE key = 'pending_remote_wipe'")
        .get() as { value: string } | undefined
      return Boolean(row?.value)
    } catch {
      return false
    }
  }

  public getPendingRemoteWipeTimestamp(): number | null {
    if (!this.db || !this.db.open) return null
    try {
      const row = this.db
        .prepare("SELECT value FROM sync_state WHERE key = 'pending_remote_wipe'")
        .get() as { value: string } | undefined
      if (!row?.value) return null
      const parsed = JSON.parse(row.value)
      return typeof parsed.wipedAt === 'number' ? parsed.wipedAt : null
    } catch {
      return null
    }
  }

  public clearPendingRemoteWipe(): void {
    if (!this.db || !this.db.open) return
    try {
      this.db.prepare("DELETE FROM sync_state WHERE key = 'pending_remote_wipe'").run()
    } catch {
      // ignore
    }
  }

  public getDataPath(): string {
    return this.dataPath
  }

  public getTodayDate(): string {
    return this.settingsRepo.getTodayDate()
  }

  // --- Logs Delegation ---

  public async getAllLogDates(includeDeleted = false): Promise<string[]> {
    return this.logsRepo.getAllLogDates(includeDeleted)
  }

  public async getLogs(date: string, includeDeleted = false): Promise<LogEntry[]> {
    return this.logsRepo.getLogs(date, includeDeleted)
  }

  public async appendLog(date: string, entry: LogEntry): Promise<void> {
    await this.logsRepo.appendLog(date, entry)
    this.dirtyLogDates.add(date)
    this.analyticsService.invalidateGoalMinutesCache()
  }

  public async setLogs(date: string, logs: LogEntry[], isSyncApply = false): Promise<void> {
    this.analyticsService.invalidateGoalMinutesCache()
    const purgedIds = isSyncApply ? await this.getPurgedIds() : new Set<string>()
    await this.logsRepo.setLogs(date, logs, isSyncApply, purgedIds)
    if (!isSyncApply) {
      this.dirtyLogDates.add(date)
    }
  }

  public async updateLog(date: string, entry: LogEntry): Promise<LogEntry> {
    const updated = await this.logsRepo.updateLog(date, entry)
    this.dirtyLogDates.add(date)
    this.analyticsService.invalidateGoalMinutesCache()
    return updated
  }

  public async deleteLog(id: string): Promise<string | null> {
    this.analyticsService.invalidateGoalMinutesCache()
    const affectedDate = await this.logsRepo.deleteLog(id)
    if (affectedDate) {
      this.dirtyLogDates.add(affectedDate)
    }
    return affectedDate
  }

  // --- Daily Goals Delegation ---

  public async getAllGoalDates(includeDeleted = false): Promise<string[]> {
    return this.goalsRepo.getAllGoalDates(includeDeleted)
  }

  public async getGoals(date: string, includeDeleted = false): Promise<DailyGoal[]> {
    if (this.learningService) {
      await this.learningService.materializeRevisionsForDate(date)
    }
    return this.goalsRepo.getGoals(date, includeDeleted)
  }

  public async getDayReviewGoals(date: string): Promise<DailyGoal[]> {
    return this.goalsRepo.getDayReviewGoals(date)
  }

  public async getBoardGoals(todayDate: string): Promise<DailyGoal[]> {
    return this.goalsRepo.getBoardGoals(todayDate)
  }

  public async getGoalById(goalId: string, includeDeleted = false): Promise<DailyGoal | null> {
    return this.goalsRepo.getGoalById(goalId, includeDeleted)
  }

  public async setGoals(date: string, goals: DailyGoal[], isSyncApply = false): Promise<void> {
    this.analyticsService.invalidateGoalMinutesCache()
    await this.goalsRepo.setGoals(date, goals, isSyncApply)
    if (!isSyncApply) {
      this.dirtyGoalDates.add(date)
      for (const g of goals) {
        if (g.date && g.date !== date) {
          this.dirtyGoalDates.add(g.date)
        }
      }
    }
  }

  public async addGoal(
    date: string,
    title: string,
    targetMinutes?: number,
    source?: Pick<DailyGoal, 'sourceInboxGoalId' | 'sourceRecurringGoalId'>,
    deadline?: string,
    note?: string,
    remindAt?: string,
    repeat?: string,
    groupTag?: string,
    groupColor?: string,
    sortOrder?: number,
    status?: DailyGoal['status'],
    learningTrackId?: string,
    learningStage?: 1 | 2 | 3,
    goalType?: GoalType
  ): Promise<DailyGoal> {
    const goal = await this.goalsRepo.addGoal(
      date,
      title,
      targetMinutes,
      source,
      deadline,
      note,
      remindAt,
      repeat,
      groupTag,
      groupColor,
      sortOrder,
      status,
      learningTrackId,
      learningStage,
      goalType
    )
    this.dirtyGoalDates.add(date)
    if (this.learningService) {
      await this.learningService.onGoalUpdated(goal)
    }
    return goal
  }

  public async updateGoal(date: string, goal: DailyGoal): Promise<DailyGoal> {
    const updated = await this.goalsRepo.updateGoal(date, goal)
    this.dirtyGoalDates.add(updated.date)
    this.analyticsService.invalidateGoalMinutesCache()
    if (this.learningService) {
      await this.learningService.onGoalUpdated(updated)
    }
    return updated
  }

  public async updateGoals(goals: DailyGoal[]): Promise<DailyGoal[]> {
    const updated = await this.goalsRepo.updateGoals(goals)
    for (const g of updated) {
      this.dirtyGoalDates.add(g.date)
      if (this.learningService) {
        await this.learningService.onGoalUpdated(g)
      }
    }
    this.analyticsService.invalidateGoalMinutesCache()
    return updated
  }

  public async deleteGoal(goalId: string): Promise<string | null> {
    this.analyticsService.invalidateGoalMinutesCache()
    const affectedDate = await this.goalsRepo.deleteGoal(goalId)
    if (affectedDate) {
      this.dirtyGoalDates.add(affectedDate)
    }
    return affectedDate
  }

  public async deleteGoals(goalIds: string[]): Promise<string[]> {
    this.analyticsService.invalidateGoalMinutesCache()
    const affected = await this.goalsRepo.deleteGoals(goalIds)
    affected.forEach((d) => this.dirtyGoalDates.add(d))
    return affected
  }

  public async getDeletedGoals(limit = 100, offset = 0, query?: string): Promise<DailyGoal[]> {
    return this.goalsRepo.getDeletedGoals(limit, offset, query)
  }

  public async getDeletedGoalsCount(query?: string): Promise<number> {
    return this.goalsRepo.getDeletedGoalsCount(query)
  }

  public async restoreGoal(goalId: string): Promise<DailyGoal | null> {
    this.analyticsService.invalidateGoalMinutesCache()
    const restored = await this.goalsRepo.restoreGoal(goalId)
    if (restored) {
      this.dirtyGoalDates.add(restored.date)
    }
    return restored
  }

  public async restoreGoals(goalIds: string[]): Promise<DailyGoal[]> {
    this.analyticsService.invalidateGoalMinutesCache()
    const restored = await this.goalsRepo.restoreGoals(goalIds)
    restored.forEach((g) => this.dirtyGoalDates.add(g.date))
    return restored
  }

  public async hardDeleteGoal(goalId: string): Promise<{ success: boolean; date?: string }> {
    this.analyticsService.invalidateGoalMinutesCache()
    const res = await this.goalsRepo.hardDeleteGoal(goalId)
    if (res.date) {
      this.dirtyGoalDates.add(res.date)
    }
    this.dirtyPurged = true
    return res
  }

  public async emptyTrash(): Promise<{ count: number; affectedDates: string[] }> {
    this.analyticsService.invalidateGoalMinutesCache()
    const res = await this.goalsRepo.emptyTrash()
    res.affectedDates.forEach((d) => this.dirtyGoalDates.add(d))
    if (res.count > 0) {
      this.dirtyPurged = true
    }
    return res
  }

  public async getPurgedIds(): Promise<Set<string>> {
    return this.goalsRepo.getPurgedIds()
  }

  public async getPurgedRecords(): Promise<PurgedRecord[]> {
    return this.goalsRepo.getPurgedRecords()
  }

  public async setPurgedRecords(records: PurgedRecord[], fromSync = false): Promise<void> {
    return this.goalsRepo.setPurgedRecords(records, fromSync)
  }

  public async prunePurgedRecordsOlderThan(days = 90): Promise<number> {
    const changes = await this.goalsRepo.prunePurgedRecordsOlderThan(days)
    if (changes > 0) {
      this.dirtyPurged = true
    }
    return changes
  }

  public async purgeSoftDeletedRecordsOlderThan(days = 30): Promise<{
    logs: number
    inboxGoals: number
    dailyGoals: number
    recurringGoals: number
    prunedTombstones: number
  }> {
    const res = await this.goalsRepo.purgeSoftDeletedRecordsOlderThan(days)
    if (res.logs > 0 || res.dailyGoals > 0) {
      this.analyticsService.invalidateGoalMinutesCache()
    }
    if (res.inboxGoals > 0) this.dirtyInbox = true
    if (res.recurringGoals > 0) this.dirtyRecurring = true
    if (res.logs > 0 || res.inboxGoals > 0 || res.dailyGoals > 0 || res.recurringGoals > 0) {
      this.dirtyPurged = true
    }
    return res
  }

  public async carryGoal(fromDate: string, toDate: string, goalId: string): Promise<DailyGoal> {
    this.analyticsService.invalidateGoalMinutesCache()
    const carried = await this.goalsRepo.carryGoal(fromDate, toDate, goalId)
    this.dirtyGoalDates.add(fromDate)
    this.dirtyGoalDates.add(toDate)
    return carried
  }

  public async carryGoals(
    fromDate: string,
    toDate: string,
    goalIds: string[]
  ): Promise<DailyGoal[]> {
    this.analyticsService.invalidateGoalMinutesCache()
    const carried = await this.goalsRepo.carryGoals(fromDate, toDate, goalIds)
    this.dirtyGoalDates.add(fromDate)
    this.dirtyGoalDates.add(toDate)
    return carried
  }

  // --- Inbox Goals Delegation ---

  public async getInboxGoals(includeDeleted = false): Promise<GoalInboxItem[]> {
    return this.goalsRepo.getInboxGoals(includeDeleted)
  }

  public async setInboxGoals(items: GoalInboxItem[], isSyncApply = false): Promise<void> {
    await this.goalsRepo.setInboxGoals(items, isSyncApply)
    if (!isSyncApply) {
      this.dirtyInbox = true
    }
  }

  public async deleteInboxGoal(id: string): Promise<void> {
    await this.goalsRepo.deleteInboxGoal(id)
    this.dirtyInbox = true
  }

  public async addInboxGoal(title: string, note?: string): Promise<GoalInboxItem> {
    const item = await this.goalsRepo.addInboxGoal(title, note)
    this.dirtyInbox = true
    return item
  }

  public async updateInboxGoal(item: GoalInboxItem): Promise<GoalInboxItem> {
    const updated = await this.goalsRepo.updateInboxGoal(item)
    this.dirtyInbox = true
    return updated
  }

  public async addInboxGoalToToday(
    inboxGoalId: string,
    date: string,
    targetMinutes?: number
  ): Promise<DailyGoal> {
    const goal = await this.goalsRepo.addInboxGoalToToday(inboxGoalId, date, targetMinutes)
    this.dirtyGoalDates.add(date)
    this.dirtyInbox = true
    return goal
  }

  // --- Recurring Goals Delegation ---

  public async getRecurringGoals(includeDeleted = false): Promise<RecurringGoal[]> {
    return this.goalsRepo.getRecurringGoals(includeDeleted)
  }

  public async setRecurringGoals(goals: RecurringGoal[], isSyncApply = false): Promise<void> {
    await this.goalsRepo.setRecurringGoals(goals, isSyncApply)
    if (!isSyncApply) {
      this.dirtyRecurring = true
    }
  }

  public async deleteRecurringGoal(id: string): Promise<void> {
    await this.goalsRepo.deleteRecurringGoal(id)
    this.dirtyRecurring = true
  }

  public async addRecurringGoal(
    title: string,
    targetMinutes: number | undefined,
    startsOn: string,
    endsOn?: string,
    frequency: RecurringFrequency = 'daily'
  ): Promise<RecurringGoal> {
    const goal = await this.goalsRepo.addRecurringGoal(
      title,
      targetMinutes,
      startsOn,
      endsOn,
      frequency
    )
    this.dirtyRecurring = true
    return goal
  }

  public async updateRecurringGoal(goal: RecurringGoal): Promise<RecurringGoal> {
    const updated = await this.goalsRepo.updateRecurringGoal(goal)
    this.dirtyRecurring = true
    return updated
  }

  public async generateTodayGoals(date: string, force = false): Promise<DailyGoal[]> {
    return this.goalsRepo.generateTodayGoals(date, force)
  }

  // --- Analytics Delegation ---

  public invalidateGoalMinutesCache(): void {
    this.analyticsService.invalidateGoalMinutesCache()
  }

  public async getGoalLoggedMinutesMap(targetGoalIds?: string[]): Promise<Record<string, number>> {
    return this.analyticsService.getGoalLoggedMinutesMap(targetGoalIds)
  }

  public async getDayReview(date: string): Promise<DayReviewData> {
    return this.analyticsService.getDayReview(date)
  }

  public async getHeatmapData(startDate?: string): Promise<Record<string, number>> {
    return this.analyticsService.getHeatmapData(startDate)
  }

  public async getHeatmapBreakdown(startDate?: string): Promise<Record<string, HeatmapBreakdown>> {
    return this.analyticsService.getHeatmapBreakdown(startDate)
  }

  // --- Database Lifecycle ---

  public getDb(): Database.Database {
    return this.db
  }

  public isOpen(): boolean {
    return Boolean(this.db && this.db.open)
  }

  public close(): void {
    if (this.backupTimer) {
      clearTimeout(this.backupTimer)
      this.backupTimer = null
    }
    if (!this.db || !this.db.open) {
      return
    }
    try {
      this.db.pragma('optimize')
      this.db.pragma('wal_checkpoint(TRUNCATE)')
      this.db.close()
      logger.info('db', 'Database connection closed cleanly with WAL checkpoint')
    } catch (err) {
      logger.warn('db', 'Error closing database:', err)
    }
  }
}
