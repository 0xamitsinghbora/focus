import fssync from 'fs'
import path from 'path'
import Database from 'better-sqlite3'
import { LogEntry, AppSettings, DailyGoal, GoalInboxItem, RecurringGoal, localDateStr } from '../shared/types'
import { logger } from './logger'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export interface ExportPayload {
  version: number
  exportedAt: string
  settings: AppSettings
  logs: LogEntry[]
  dailyGoals: DailyGoal[]
  inboxGoals: GoalInboxItem[]
  recurringGoals: RecurringGoal[]
  groupColors: Record<string, string>
}

interface ImportPayload {
  logs?: (LogEntry & { date?: string })[]
  dailyGoals?: DailyGoal[]
  inboxGoals?: GoalInboxItem[]
  recurringGoals?: RecurringGoal[]
  settings?: Partial<AppSettings>
  groupColors?: Record<string, string>
}

export interface ImportResult {
  logs: number
  dailyGoals: number
  inboxGoals: number
  recurringGoals: number
  groupColors: number
}

interface ExportContext {
  db: Database.Database
  mapGoalRow: (row: DailyGoal & { sortOrder: number | null }) => DailyGoal
  getInboxGoals: () => Promise<GoalInboxItem[]>
  getRecurringGoals: () => Promise<RecurringGoal[]>
  getGroupColors: () => Record<string, string>
  getSettings: () => AppSettings
}

interface ImportContext {
  db: Database.Database
  upsertLog: (entry: LogEntry, date: string) => void
  upsertDailyGoal: (goal: DailyGoal) => void
  upsertInboxGoal: (inbox: GoalInboxItem) => void
  upsertRecurringGoal: (recurring: RecurringGoal) => void
  upsertGroupColor: (tag: string, color: string) => void
  markDirtyLogDate: (date: string) => void
  markDirtyGoalDate: (date: string) => void
  onImportComplete: (counts: ImportResult) => void
}

export function pruneOldBackups(targetDir: string, maxBackups = 5): void {
  try {
    const files = fssync
      .readdirSync(targetDir)
      .filter((f) => f.startsWith('focus-backup-') && f.endsWith('.db'))
      .map((f) => ({
        name: f,
        path: path.join(targetDir, f),
        time: fssync.statSync(path.join(targetDir, f)).mtimeMs
      }))
      .sort((a, b) => b.time - a.time)

    if (files.length > maxBackups) {
      files.slice(maxBackups).forEach((f) => {
        try {
          fssync.unlinkSync(f.path)
        } catch {
          /* ignore */
        }
      })
    }
  } catch (err) {
    logger.warn('db', 'Failed to prune old backups:', err)
  }
}

let activeBackupQueue: Promise<string> = Promise.resolve('')

export async function backupDatabase(
  db: Database.Database,
  dataPath: string,
  backupDir?: string
): Promise<string> {
  if (!db || !db.open) {
    throw new Error('Database is closed')
  }

  const runBackup = async (): Promise<string> => {
    const targetDir = backupDir || path.join(dataPath, 'backups')
    fssync.mkdirSync(targetDir, { recursive: true })
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupPath = path.join(targetDir, `focus-backup-${timestamp}.db`)

    try {
      db.pragma('wal_checkpoint(RESTART)')
      db.pragma('wal_checkpoint(TRUNCATE)')
    } catch (err) {
      logger.warn('db', 'Failed to checkpoint WAL prior to backup:', err)
    }

    await db.backup(backupPath)
    pruneOldBackups(targetDir, 5)
    return backupPath
  }

  activeBackupQueue = activeBackupQueue.then(runBackup, runBackup)
  return activeBackupQueue
}

export async function backupDatabaseToFile(
  db: Database.Database,
  destPath: string
): Promise<string> {
  if (!db || !db.open) {
    throw new Error('Database is closed')
  }

  const runBackupToFile = async (): Promise<string> => {
    const targetDir = path.dirname(destPath)
    fssync.mkdirSync(targetDir, { recursive: true })

    try {
      db.pragma('wal_checkpoint(RESTART)')
      db.pragma('wal_checkpoint(TRUNCATE)')
    } catch (err) {
      logger.warn('db', 'Failed to checkpoint WAL prior to backup:', err)
    }

    await db.backup(destPath)
    return destPath
  }

  activeBackupQueue = activeBackupQueue.then(runBackupToFile, runBackupToFile)
  return activeBackupQueue
}

export async function maybePerformDailyBackup(
  db: Database.Database,
  dataPath: string,
  purgeCallback?: () => Promise<unknown>
): Promise<void> {
  if (!db || !db.open) {
    return
  }
  try {
    const targetDir = path.join(dataPath, 'backups')
    let performedBackup = false

    if (!fssync.existsSync(targetDir)) {
      performedBackup = true
    } else {
      const files = fssync.readdirSync(targetDir).filter((f) => f.endsWith('.db'))
      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000
      const hasRecent = files.some((f) => {
        try {
          return fssync.statSync(path.join(targetDir, f)).mtimeMs > oneDayAgo
        } catch {
          return false
        }
      })
      if (!hasRecent) {
        performedBackup = true
      }
    }

    if (performedBackup) {
      try {
        await backupDatabase(db, dataPath, targetDir)
      } catch (err) {
        logger.warn('db', 'Daily database backup failed:', err)
      }
    }

    if (purgeCallback) {
      try {
        await purgeCallback()
      } catch (err) {
        logger.warn('db', 'Failed to purge soft-deleted records during maintenance:', err)
      }
    }

    try {
      if (db && db.open) {
        db.pragma('incremental_vacuum(500)')
        db.pragma('wal_checkpoint(PASSIVE)')
        db.pragma('optimize')
      }
    } catch (e) {
      logger.warn('db', 'Database maintenance optimization failed:', e)
    }
  } catch {
    // ignore
  }
}

export async function exportAllData(context: ExportContext): Promise<ExportPayload> {
  const logRows = context.db
    .prepare('SELECT * FROM logs WHERE deletedAt IS NULL ORDER BY date ASC, timestamp ASC')
    .all() as (LogEntry & { productivity: string | null })[]
  const allLogs: LogEntry[] = logRows.map((r) => ({
    ...r,
    productivity: (r.productivity || undefined) as LogEntry['productivity'],
    startedAt: r.startedAt ?? undefined,
    endedAt: r.endedAt ?? undefined,
    goalId: r.goalId ?? undefined,
    goalTitle: r.goalTitle ?? undefined,
    note: r.note ?? undefined,
    durationMinutes: r.durationMinutes ?? undefined,
    productiveMinutes: r.productiveMinutes ?? undefined,
    updatedAt: r.updatedAt ?? undefined,
    deletedAt: r.deletedAt ?? undefined
  }))

  const goalRows = context.db
    .prepare('SELECT * FROM daily_goals WHERE deletedAt IS NULL ORDER BY date ASC, sortOrder ASC')
    .all() as (DailyGoal & { sortOrder: number | null })[]
  const allDailyGoals: DailyGoal[] = goalRows.map((r) => context.mapGoalRow(r))

  const [inboxGoals, recurringGoals, groupColors] = await Promise.all([
    context.getInboxGoals(),
    context.getRecurringGoals(),
    Promise.resolve(context.getGroupColors())
  ])

  const rawSettings = context.getSettings()
  const sanitizedSettings: AppSettings = { ...rawSettings }
  sanitizedSettings.groupColors = groupColors
  if ('driveRefreshToken' in sanitizedSettings) {
    delete sanitizedSettings.driveRefreshToken
  }

  return {
    version: 3,
    exportedAt: new Date().toISOString(),
    settings: sanitizedSettings,
    logs: allLogs,
    dailyGoals: allDailyGoals,
    inboxGoals,
    recurringGoals,
    groupColors
  }
}

function isObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val)
}

function isValidString(val: unknown): val is string {
  return typeof val === 'string' && val.trim().length > 0
}

function validateLogEntry(entry: unknown, index: number): LogEntry & { date?: string } {
  if (!isObject(entry)) {
    throw new Error(`Invalid log entry at index ${index}: expected an object`)
  }
  if (!isValidString(entry.id)) {
    throw new Error(`Invalid log entry at index ${index}: missing or empty 'id'`)
  }
  if (!isValidString(entry.timestamp)) {
    throw new Error(`Invalid log entry at index ${index}: missing or empty 'timestamp'`)
  }
  return entry as unknown as LogEntry & { date?: string }
}

function validateDailyGoal(goal: unknown, index: number): DailyGoal {
  if (!isObject(goal)) {
    throw new Error(`Invalid daily goal at index ${index}: expected an object`)
  }
  if (!isValidString(goal.id)) {
    throw new Error(`Invalid daily goal at index ${index}: missing or empty 'id'`)
  }
  if (!isValidString(goal.title)) {
    throw new Error(`Invalid daily goal at index ${index}: missing or empty 'title'`)
  }
  if (!isValidString(goal.date)) {
    throw new Error(`Invalid daily goal at index ${index}: missing or empty 'date'`)
  }
  return goal as unknown as DailyGoal
}

function validateInboxGoal(inbox: unknown, index: number): GoalInboxItem {
  if (!isObject(inbox)) {
    throw new Error(`Invalid inbox goal at index ${index}: expected an object`)
  }
  if (!isValidString(inbox.id)) {
    throw new Error(`Invalid inbox goal at index ${index}: missing or empty 'id'`)
  }
  if (!isValidString(inbox.title)) {
    throw new Error(`Invalid inbox goal at index ${index}: missing or empty 'title'`)
  }
  return inbox as unknown as GoalInboxItem
}

function validateRecurringGoal(rec: unknown, index: number): RecurringGoal {
  if (!isObject(rec)) {
    throw new Error(`Invalid recurring goal at index ${index}: expected an object`)
  }
  if (!isValidString(rec.id)) {
    throw new Error(`Invalid recurring goal at index ${index}: missing or empty 'id'`)
  }
  if (!isValidString(rec.title)) {
    throw new Error(`Invalid recurring goal at index ${index}: missing or empty 'title'`)
  }
  return rec as unknown as RecurringGoal
}

export function validateImportPayload(payload: unknown): ImportPayload {
  if (!isObject(payload)) {
    throw new Error('Invalid import payload: expected an object')
  }

  const hasLogs = 'logs' in payload
  const hasDailyGoals = 'dailyGoals' in payload
  const hasInboxGoals = 'inboxGoals' in payload
  const hasRecurringGoals = 'recurringGoals' in payload
  const hasGroupColors = 'groupColors' in payload
  const hasSettings = 'settings' in payload

  if (
    !hasLogs &&
    !hasDailyGoals &&
    !hasInboxGoals &&
    !hasRecurringGoals &&
    !hasGroupColors &&
    !hasSettings
  ) {
    throw new Error('Invalid import data: missing required backup sections')
  }

  let validatedLogs: (LogEntry & { date?: string })[] | undefined
  if (hasLogs) {
    if (!Array.isArray(payload.logs)) {
      throw new Error('Invalid import data: "logs" must be an array')
    }
    validatedLogs = payload.logs.map((entry, idx) => validateLogEntry(entry, idx))
  }

  let validatedDailyGoals: DailyGoal[] | undefined
  if (hasDailyGoals) {
    if (!Array.isArray(payload.dailyGoals)) {
      throw new Error('Invalid import data: "dailyGoals" must be an array')
    }
    validatedDailyGoals = payload.dailyGoals.map((goal, idx) => validateDailyGoal(goal, idx))
  }

  let validatedInboxGoals: GoalInboxItem[] | undefined
  if (hasInboxGoals) {
    if (!Array.isArray(payload.inboxGoals)) {
      throw new Error('Invalid import data: "inboxGoals" must be an array')
    }
    validatedInboxGoals = payload.inboxGoals.map((inbox, idx) => validateInboxGoal(inbox, idx))
  }

  let validatedRecurringGoals: RecurringGoal[] | undefined
  if (hasRecurringGoals) {
    if (!Array.isArray(payload.recurringGoals)) {
      throw new Error('Invalid import data: "recurringGoals" must be an array')
    }
    validatedRecurringGoals = payload.recurringGoals.map((rec, idx) =>
      validateRecurringGoal(rec, idx)
    )
  }

  let validatedGroupColors: Record<string, string> | undefined
  if (hasGroupColors) {
    if (!isObject(payload.groupColors)) {
      throw new Error('Invalid import data: "groupColors" must be an object')
    }
    validatedGroupColors = {}
    for (const [tag, color] of Object.entries(payload.groupColors)) {
      if (typeof tag === 'string' && typeof color === 'string') {
        validatedGroupColors[tag] = color
      }
    }
  }

  let validatedSettings: Partial<AppSettings> | undefined
  if (hasSettings) {
    if (!isObject(payload.settings)) {
      throw new Error('Invalid import data: "settings" must be an object')
    }
    validatedSettings = payload.settings as Partial<AppSettings>
  }

  return {
    logs: validatedLogs,
    dailyGoals: validatedDailyGoals,
    inboxGoals: validatedInboxGoals,
    recurringGoals: validatedRecurringGoals,
    groupColors: validatedGroupColors,
    settings: validatedSettings
  }
}

export async function importAllData(
  context: ImportContext,
  payload: unknown
): Promise<ImportResult> {
  const validated = validateImportPayload(payload)

  const logs = validated.logs ?? []
  const dailyGoals = validated.dailyGoals ?? []
  const inboxGoals = validated.inboxGoals ?? []
  const recurringGoals = validated.recurringGoals ?? []
  const groupColors =
    validated.groupColors ??
    (validated.settings?.groupColors && isObject(validated.settings.groupColors)
      ? (validated.settings.groupColors as Record<string, string>)
      : {})

  let importedLogs = 0
  let importedDailyGoals = 0
  let importedInboxGoals = 0
  let importedRecurringGoals = 0
  let importedGroupColors = 0

  const tx = context.db.transaction(() => {
    for (const [tag, color] of Object.entries(groupColors)) {
      if (tag && color && typeof tag === 'string' && typeof color === 'string') {
        const cleanTag = tag.toLowerCase().trim()
        if (cleanTag && cleanTag !== 'untagged') {
          context.upsertGroupColor(cleanTag, color)
          importedGroupColors++
        }
      }
    }

    for (const inbox of inboxGoals) {
      if (!inbox.id || !inbox.title) continue
      context.upsertInboxGoal(inbox)
      importedInboxGoals++
    }

    for (const recurring of recurringGoals) {
      if (!recurring.id || !recurring.title) continue
      context.upsertRecurringGoal(recurring)
      importedRecurringGoals++
    }

    for (const goal of dailyGoals) {
      if (!goal.id || !goal.title || !goal.date) continue
      context.upsertDailyGoal(goal)
      context.markDirtyGoalDate(goal.date)
      importedDailyGoals++
    }

    for (const log of logs) {
      if (!log.id || !log.timestamp) continue
      let date = log.date && DATE_RE.test(log.date) ? log.date : ''
      if (!date) {
        try {
          const d = new Date(log.timestamp)
          if (!isNaN(d.getTime())) {
            date = localDateStr(d)
          }
        } catch {
          // ignore
        }
        if (!date) {
          date = log.timestamp.slice(0, 10)
        }
      }
      context.upsertLog(log, date)
      context.markDirtyLogDate(date)
      importedLogs++
    }
  })

  tx()

  const result: ImportResult = {
    logs: importedLogs,
    dailyGoals: importedDailyGoals,
    inboxGoals: importedInboxGoals,
    recurringGoals: importedRecurringGoals,
    groupColors: importedGroupColors
  }

  context.onImportComplete(result)

  return result
}
