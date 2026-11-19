import { AppSettings } from '../shared/types'

const KNOWN_SETTING_KEYS = new Set<string>([
  'reminderIntervalMinutes',
  'openAtLogin',
  'dayCutoffHour',
  'boardHistoryHorizonDays',
  'syncProvider',
  'driveRefreshToken',
  'driveSyncEnabled',
  'lastUpdated',
  'theme',
  'collapsedColumns',
  'sortOption',
  'groupColors',
  'showWidget',
  'whiteNoisePreference',
  'customShortcuts',
  'dailyFocusTargetMinutes',
  'lastMorningRitualDate',
  'enableBreakNudges',
  'hasCompletedOnboarding'
])

export function sanitizeSettings(settings: Partial<AppSettings>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(settings)) {
    if (!KNOWN_SETTING_KEYS.has(k)) {
      continue
    }
    if (v === undefined) {
      sanitized[k] = undefined
      continue
    }
    if (k === 'reminderIntervalMinutes') {
      const num = typeof v === 'number' ? Math.round(v) : NaN
      sanitized[k] = !isNaN(num) && num >= 1 ? Math.min(1440, num) : 45
    } else if (k === 'dayCutoffHour') {
      const num = typeof v === 'number' ? Math.round(v) : NaN
      sanitized[k] = !isNaN(num) && num >= 0 && num <= 12 ? num : 0
    } else if (k === 'boardHistoryHorizonDays') {
      const num = typeof v === 'number' ? Math.round(v) : NaN
      sanitized[k] = !isNaN(num) && num >= 1 ? Math.min(3650, num) : 365
    } else if (k === 'whiteNoisePreference') {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        const pref = v as { noiseType?: unknown; volume?: unknown; spatialAudio?: unknown }
        const noiseType = typeof pref.noiseType === 'string' ? pref.noiseType : 'cocoon'
        const volume =
          typeof pref.volume === 'number' && !isNaN(pref.volume)
            ? Math.max(0, Math.min(1, pref.volume))
            : 0.25
        const spatialAudio = typeof pref.spatialAudio === 'boolean' ? pref.spatialAudio : true
        sanitized[k] = { noiseType, volume, spatialAudio }
      }
    } else if (k === 'customShortcuts') {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        const shortcuts: Record<string, string> = {}
        for (const [sKey, sVal] of Object.entries(v as Record<string, unknown>)) {
          if (typeof sKey === 'string' && typeof sVal === 'string') {
            shortcuts[sKey] = sVal.trim()
          }
        }
        sanitized[k] = shortcuts
      }
    } else {
      sanitized[k] = v
    }
  }
  return sanitized
}
