import Database from 'better-sqlite3'
import { AppSettings, SessionTimerPayload, localDateStr } from '../../shared/types'
import { SyncManifest } from '../syncUtils'
import { sanitizeSettings } from '../settingsSanitizer'
import { logger } from '../logger'

export const DEFAULT_SETTINGS: AppSettings = {
  reminderIntervalMinutes: 45,
  openAtLogin: true,
  theme: 'system',
  showWidget: true,
  dayCutoffHour: 0,
  dailyFocusTargetMinutes: 480,
  hasCompletedOnboarding: false,
  whiteNoisePreference: {
    noiseType: 'none',
    volume: 0.5
  },
  groupColors: {},
  collapsedColumns: {
    planned: false,
    in_progress: false,
    done: false
  },
  customShortcuts: {},
  autoCheckUpdates: true,
  autoDownloadUpdates: false,
  tratakaDurationSeconds: 60
}

export class SettingsRepository {
  private db: Database.Database
  private onDirty?: () => void
  private cachedSettings: AppSettings | null = null
  private lastPersistedSessionSignature: string | null = null
  private lastSessionPersistTime = 0

  public stmts: {
    getSettings: Database.Statement
    upsertSetting: Database.Statement
    deleteSetting: Database.Statement
    getGroupColors: Database.Statement
    upsertGroupColor: Database.Statement
    deleteGroupColor: Database.Statement
    clearGroupColors: Database.Statement
    getSyncState: Database.Statement
    setSyncState: Database.Statement
    deleteSyncState: Database.Statement
  }

  constructor(db: Database.Database, onDirty?: () => void) {
    this.db = db
    this.onDirty = onDirty

    this.stmts = {
      getSettings: db.prepare('SELECT key, value FROM settings'),
      upsertSetting: db.prepare(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
      ),
      deleteSetting: db.prepare('DELETE FROM settings WHERE key = ?'),
      getGroupColors: db.prepare('SELECT tag, color FROM group_colors'),
      upsertGroupColor: db.prepare(
        'INSERT INTO group_colors (tag, color, updatedAt) VALUES (?, ?, ?) ON CONFLICT(tag) DO UPDATE SET color = excluded.color, updatedAt = excluded.updatedAt'
      ),
      deleteGroupColor: db.prepare('DELETE FROM group_colors WHERE tag = ?'),
      clearGroupColors: db.prepare('DELETE FROM group_colors'),
      getSyncState: db.prepare('SELECT value FROM sync_state WHERE key = ?'),
      setSyncState: db.prepare(
        'INSERT INTO sync_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
      ),
      deleteSyncState: db.prepare('DELETE FROM sync_state WHERE key = ?')
    }
  }

  public getSettings(): AppSettings {
    if (this.cachedSettings) {
      return { ...this.cachedSettings }
    }
    if (!this.db || !this.db.open) {
      return { ...DEFAULT_SETTINGS }
    }
    const rows = this.stmts.getSettings.all() as { key: string; value: string }[]
    const settings: Record<string, unknown> = { ...DEFAULT_SETTINGS }
    for (const row of rows) {
      try {
        settings[row.key] = JSON.parse(row.value)
      } catch {
        settings[row.key] = row.value
      }
    }
    const groupColors = this.getGroupColors()
    if (Object.keys(groupColors).length > 0) {
      settings.groupColors = groupColors
    }
    this.cachedSettings = settings as unknown as AppSettings
    return { ...this.cachedSettings }
  }

  public setSettings(settings: AppSettings): void {
    if (!this.db || !this.db.open) {
      return
    }
    const validated = sanitizeSettings(settings)
    const tx = this.db.transaction(() => {
      for (const [k, v] of Object.entries(validated)) {
        if (v !== undefined) {
          this.stmts.upsertSetting.run(k, JSON.stringify(v))
        } else {
          this.stmts.deleteSetting.run(k)
        }
      }
      if (
        validated.groupColors &&
        typeof validated.groupColors === 'object' &&
        !Array.isArray(validated.groupColors)
      ) {
        const now = new Date().toISOString()
        for (const [tag, color] of Object.entries(
          validated.groupColors as Record<string, string>
        )) {
          const cleanTag = tag.trim().toLowerCase()
          if (cleanTag && cleanTag !== 'untagged' && color) {
            this.stmts.upsertGroupColor.run(cleanTag, color, now)
          }
        }
      }
    })
    tx()
    this.cachedSettings = null
    this.onDirty?.()
  }

  public patchSettings(partial: Partial<AppSettings>): AppSettings {
    if (!partial || typeof partial !== 'object' || !this.db || !this.db.open) {
      return this.getSettings()
    }
    const current = this.getSettings()
    const merged: AppSettings = {
      ...current,
      ...partial,
      ...(current.collapsedColumns || partial.collapsedColumns
        ? {
            collapsedColumns: {
              ...(current.collapsedColumns || {}),
              ...(partial.collapsedColumns || {})
            }
          }
        : {}),
      ...(current.groupColors || partial.groupColors
        ? {
            groupColors: {
              ...(current.groupColors || {}),
              ...(partial.groupColors || {})
            }
          }
        : {}),
      lastUpdated: partial.lastUpdated ?? Date.now()
    }
    this.setSettings(merged)
    return this.getSettings()
  }

  public getGroupColors(): Record<string, string> {
    if (!this.db || !this.db.open) {
      return {}
    }
    try {
      const rows = this.stmts.getGroupColors.all() as { tag: string; color: string }[]
      const result: Record<string, string> = {}
      for (const row of rows) {
        if (row.tag && row.color) {
          result[row.tag.toLowerCase()] = row.color
        }
      }
      return result
    } catch {
      return {}
    }
  }

  public setGroupColor(tag: string, color: string): void {
    const cleanTag = tag.trim().toLowerCase()
    if (!cleanTag || cleanTag === 'untagged' || !color) return
    const now = new Date().toISOString()
    const tx = this.db.transaction(() => {
      this.stmts.upsertGroupColor.run(cleanTag, color, now)
      this.stmts.upsertSetting.run('lastUpdated', JSON.stringify(Date.now()))
    })
    tx()
    this.cachedSettings = null
    this.onDirty?.()
  }

  public deleteGroupColor(tag: string): void {
    const cleanTag = tag.trim().toLowerCase()
    if (!cleanTag) return
    const tx = this.db.transaction(() => {
      this.stmts.deleteGroupColor.run(cleanTag)
      this.stmts.upsertSetting.run('lastUpdated', JSON.stringify(Date.now()))
    })
    tx()
    this.cachedSettings = null
    this.onDirty?.()
  }

  public setGroupColors(colors: Record<string, string>): void {
    const tx = this.db.transaction(() => {
      this.stmts.clearGroupColors.run()
      const now = new Date().toISOString()
      for (const [tag, color] of Object.entries(colors)) {
        const cleanTag = tag.trim().toLowerCase()
        if (cleanTag && cleanTag !== 'untagged' && color) {
          this.stmts.upsertGroupColor.run(cleanTag, color, now)
        }
      }
      this.stmts.upsertSetting.run('lastUpdated', JSON.stringify(Date.now()))
    })
    tx()
    this.cachedSettings = null
    this.onDirty?.()
  }

  public getSyncManifest(): SyncManifest | null {
    try {
      const row = this.stmts.getSyncState.get('manifest') as { value?: string } | undefined
      if (row?.value) {
        return JSON.parse(row.value)
      }
    } catch (e) {
      logger.warn('dataManager', 'Failed to read sync manifest from DB:', e)
    }
    return null
  }

  public setSyncManifest(manifest: SyncManifest): void {
    try {
      this.stmts.setSyncState.run('manifest', JSON.stringify(manifest))
    } catch (e) {
      logger.warn('dataManager', 'Failed to save sync manifest to DB:', e)
    }
  }

  public getActiveSession(): SessionTimerPayload | null {
    try {
      const row = this.stmts.getSyncState.get('active_session') as { value?: string } | undefined
      if (row?.value) {
        const parsed = JSON.parse(row.value)
        if (parsed && typeof parsed === 'object' && typeof parsed.isActive === 'boolean') {
          return parsed as SessionTimerPayload
        }
      }
    } catch (e) {
      logger.warn('dataManager', 'Failed to read active session from DB:', e)
    }
    return null
  }

  public setActiveSession(payload: SessionTimerPayload | null, forceImmediate = false): void {
    try {
      if (!payload || !payload.isActive) {
        if (this.lastPersistedSessionSignature !== null || forceImmediate) {
          this.stmts.deleteSyncState.run('active_session')
          this.lastPersistedSessionSignature = null
          this.lastSessionPersistTime = 0
        }
        return
      }

      const signature = `${payload.isActive}:${payload.isPaused}:${payload.isBreak}:${payload.goalId || ''}:${payload.totalSeconds}:${payload.startedAt || ''}:${payload.accumulatedPausedMs || 0}:${payload.sessionNote || ''}`
      const isLifecycleChange = signature !== this.lastPersistedSessionSignature
      const now = Date.now()
      const isHeartbeatDue = now - this.lastSessionPersistTime >= 30000

      if (isLifecycleChange || isHeartbeatDue || forceImmediate) {
        const cleanPayload: SessionTimerPayload = { ...payload }
        delete cleanPayload.badgeDataUrl
        this.stmts.setSyncState.run('active_session', JSON.stringify(cleanPayload))
        this.lastPersistedSessionSignature = signature
        this.lastSessionPersistTime = now
      }
    } catch (e) {
      logger.warn('dataManager', 'Failed to persist active session to DB:', e)
    }
  }

  public getTodayDate(): string {
    const cutoff = this.getSettings().dayCutoffHour || 0
    return localDateStr(new Date(), cutoff)
  }
}
