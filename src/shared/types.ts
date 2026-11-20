export type ThemeMode = 'system' | 'dark' | 'light'

export const DEFAULT_SORT_ORDER = 1000000000

export type CloudSyncProvider = 'none' | 'google-drive'

export type FocusQualityRating = 1 | 2 | 3 | 4 | 5

export type GoalType = 'deep' | 'routine'

export type AudioMode = 'silence' | 'focus_sound' | 'music'

export type AppSettings = {
  reminderIntervalMinutes: number
  openAtLogin: boolean
  dayCutoffHour?: number
  dailyFocusTargetMinutes?: number
  boardHistoryHorizonDays?: number
  syncProvider?: CloudSyncProvider
  driveRefreshToken?: string
  driveSyncEnabled?: boolean
  lastUpdated?: number
  theme?: ThemeMode
  collapsedColumns?: Record<string, boolean>
  sortOption?: string
  groupColors?: Record<string, string>
  showWidget?: boolean
  whiteNoisePreference?: { noiseType: string; volume: number; spatialAudio?: boolean }
  customShortcuts?: Record<string, string>
  lastMorningRitualDate?: string
  enableBreakNudges?: boolean
  hasCompletedOnboarding?: boolean
  autoCheckUpdates?: boolean
  autoDownloadUpdates?: boolean
  lastUpdateCheck?: number
  lastRunVersion?: string
}

export type LogEntry = {
  id: string
  timestamp: string
  text: string
  startedAt?: string
  endedAt?: string
  goalId?: string
  goalTitle?: string
  note?: string
  productivity?: ProductivityLevel
  durationMinutes?: number
  productiveMinutes?: number
  focusQuality?: number
  goalType?: GoalType
  audioMode?: AudioMode | null
  didDotReset?: boolean
  updatedAt?: string
  deletedAt?: string
}

export type ProductivityLevel = 'productive' | 'break'

export type DailyGoal = {
  id: string
  date: string
  effectiveDate?: string
  title: string
  status: 'planned' | 'in_progress' | 'done'
  targetMinutes?: number
  deadline?: string
  sourceInboxGoalId?: string
  sourceRecurringGoalId?: string
  createdAt: string
  completedAt?: string
  carriedFromDate?: string
  carriedToDate?: string
  carriedFromGoalId?: string
  note?: string
  remindAt?: string
  repeat?: string
  groupTag?: string
  groupColor?: string
  sortOrder?: number
  goalType?: GoalType
  updatedAt?: string
  deletedAt?: string
  restoredAt?: string
  learningTrackId?: string
  learningStage?: 1 | 2 | 3
}

export type LearningStage = 1 | 2 | 3
export type LearningRevisionStatus = 'pending' | 'scheduled' | 'completed' | 'skipped'
export type LearningTrackStatus = 'active' | 'mastered' | 'paused' | 'deleted'

export type LearningTrack = {
  id: string
  title: string
  originalGoalId?: string
  originDate: string
  targetMinutes?: number
  currentStage: number // 1 (Day 1), 2 (Day 7), 3 (Day 30), 4 (Mastered)
  status: LearningTrackStatus

  // Stage 1 (1st Day)
  day1Date: string
  day1Status: LearningRevisionStatus
  day1GoalId?: string
  day1CompletedAt?: string

  // Stage 2 (7th Day)
  day7Date: string
  day7Status: LearningRevisionStatus
  day7GoalId?: string
  day7CompletedAt?: string

  // Stage 3 (30th Day)
  day30Date: string
  day30Status: LearningRevisionStatus
  day30GoalId?: string
  day30CompletedAt?: string

  note?: string
  createdAt: string
  updatedAt?: string
  deletedAt?: string
}

export type GoalInboxItem = {
  id: string
  title: string
  note?: string
  status: 'active'
  createdAt: string
  updatedAt?: string
  deletedAt?: string
}

export type RecurringFrequency = 'daily' | 'weekdays' | 'weekends' | 'weekly'

export type RecurringGoal = {
  id: string
  title: string
  targetMinutes?: number
  frequency: RecurringFrequency
  startsOn: string
  endsOn?: string
  status: 'active' | 'paused' | 'deleted'
  createdAt: string
  pausedAt?: string
  deletedAt?: string
  updatedAt?: string
  restoredAt?: string
}

export type GoalBreakdown = {
  goalId: string
  title: string
  productiveMinutes: number
  targetMinutes?: number
  logs: LogEntry[]
  status: 'planned' | 'in_progress' | 'done'
}

export type DayReviewData = {
  date: string
  goals: DailyGoal[]
  logs: LogEntry[]
  totalProductiveMinutes: number
  goalBreakdown: GoalBreakdown[]
  otherProductiveMinutes: number
  unclassifiedLogs: LogEntry[]
  averageFocusQuality?: number
}

export type ReminderStatus = {
  intervalMinutes: number
  currentBlockStartedAt: string
  nextPromptTime: string
  isPendingPrompt: boolean
  dayCutoffHour?: number
  snoozeCount?: number
}

export interface SyncDirtyTargets {
  logDates: string[]
  goalDates: string[]
  syncInbox: boolean
  syncRecurring: boolean
  syncSettings: boolean
  syncPurged: boolean
}

export interface SyncTarget extends Partial<SyncDirtyTargets> {
  todayMinutes?: number
}

export type HeatmapBreakdown = {
  sessions: number
  completedGoals: number
  total: number
}

export type HeatmapData = Record<string, number | HeatmapBreakdown>

export enum IpcChannels {
  GetLogs = 'data:get-logs',
  AppendLog = 'data:append-log',
  UpdateLog = 'data:update-log',
  DeleteLog = 'data:delete-log',
  DataUpdated = 'data:updated',
  RemindSnooze = 'remind:snooze',
  RemindSubmit = 'remind:submit',
  RemindGetStatus = 'remind:get-status',
  GetSettings = 'settings:get',
  SetSettings = 'settings:set',
  PatchSettings = 'settings:patch',
  DriveConnect = 'drive:connect',
  DriveDisconnect = 'drive:disconnect',
  DriveSyncNow = 'drive:sync-now',
  DriveStatus = 'drive:status',
  GetHeatmap = 'data:get-heatmap',
  GetGoals = 'data:get-goals',
  AddGoal = 'data:add-goal',
  UpdateGoal = 'data:update-goal',
  UpdateGoals = 'data:update-goals',
  DeleteGoal = 'data:delete-goal',
  DeleteGoals = 'data:delete-goals',
  GoalsGetDeleted = 'goals:get-deleted',
  GoalsRestore = 'goals:restore',
  GoalsRestoreBatch = 'goals:restore-batch',
  GoalsHardDelete = 'goals:hard-delete',
  GoalsEmptyTrash = 'goals:empty-trash',
  CarryGoal = 'data:carry-goal',
  CarryGoals = 'data:carry-goals',
  GoalsGetLoggedMinutes = 'goals:get-logged-minutes',
  GetDayReview = 'data:get-day-review',
  GoalsGetInbox = 'goals:get-inbox',
  GoalsAddInbox = 'goals:add-inbox',
  GoalsUpdateInbox = 'goals:update-inbox',
  GoalsAddInboxToToday = 'goals:add-inbox-to-today',
  GoalsGetRecurring = 'goals:get-recurring',
  GoalsAddRecurring = 'goals:add-recurring',
  GoalsUpdateRecurring = 'goals:update-recurring',
  GoalsGenerateToday = 'goals:generate-today',
  GetGroupColors = 'goals:get-group-colors',
  SetGroupColor = 'goals:set-group-color',
  DeleteGroupColor = 'goals:delete-group-color',
  RenameGroup = 'goals:rename-group',
  PromptResize = 'prompt:resize',
  PromptShown = 'prompt:shown',
  PromptShow = 'prompt:show',
  OpenDataFolder = 'data:open-folder',
  NavigateTab = 'app:navigate-tab',
  LogMessage = 'logger:log',
  GetAppLogs = 'logger:get-logs',
  OpenLogsFolder = 'logger:open-folder',
  ClearAppLogs = 'logger:clear',
  GetSystemDiagnostics = 'logger:get-diagnostics',
  OpenGitHubIssue = 'logger:open-github-issue',
  ExportData = 'data:export',
  ImportData = 'data:import',
  BackupDatabase = 'data:backup',
  DownloadDatabase = 'data:download-database',
  UploadDatabaseToDrive = 'data:upload-database-drive',
  UpdateSessionTimer = 'session:update-timer',
  GetSessionState = 'session:get-state',
  SessionTogglePause = 'session:toggle-pause',
  SessionQuickAction = 'session:quick-action',
  SessionZeroReached = 'session:zero-reached',
  PromptFocus = 'prompt:focus',
  WidgetShowApp = 'widget:show-app',
  WidgetToggleSession = 'widget:toggle-session',
  WidgetGetBounds = 'widget:get-bounds',
  WidgetSetPosition = 'widget:set-position',
  WidgetSavePosition = 'widget:save-position',
  WidgetPositionUpdated = 'widget:position-updated',
  WidgetSnapTaskbar = 'widget:snap-taskbar',
  WidgetHide = 'widget:hide',
  WidgetContextMenu = 'widget:context-menu',
  WidgetSetIgnoreMouseEvents = 'widget:set-ignore-mouse-events',
  WidgetSetExpanded = 'widget:set-expanded',
  ThemeUpdated = 'theme:updated',
  UninstallApp = 'app:uninstall',
  DeleteAllData = 'app:delete-all-data',
  BreakNudge = 'scheduler:break-nudge',
  LearningGetTracks = 'learning:get-tracks',
  LearningGetDue = 'learning:get-due',
  LearningResetStage = 'learning:reset-stage',
  LearningSkipStage = 'learning:skip-stage',
  UpdateCheck = 'update:check',
  UpdateDownload = 'update:download',
  UpdateCancelDownload = 'update:cancel-download',
  UpdateInstall = 'update:install',
  UpdateGetState = 'update:get-state',
  UpdateCleanCache = 'update:clean-cache',
  UpdateStatusChanged = 'update:status-changed',
  UpdateDownloadProgress = 'update:download-progress'
}

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'installing'
  | 'error'

export interface UpdateReleaseInfo {
  version: string
  releaseName: string
  releaseNotes: string
  publishedAt: string
  htmlUrl: string
  isPrerelease: boolean
  assetName: string
  assetSize: number
  downloadUrl: string
}

export interface UpdateDownloadProgress {
  bytesDownloaded: number
  totalBytes: number
  percent: number
  bytesPerSecond: number
  remainingSeconds: number
}

export interface UpdateState {
  status: UpdateStatus
  currentVersion: string
  availableUpdate?: UpdateReleaseInfo | null
  progress?: UpdateDownloadProgress | null
  error?: string | null
  lastCheckedAt?: number | null
  downloadedFilePath?: string | null
}

export interface CleanCacheResult {
  success: boolean
  freedBytes: number
  cleanedFiles: string[]
  error?: string
}

export interface InstallUpdateOptions {
  silent?: boolean
}

export type BreakNudgePayload = {
  urgency: number
  breakMinutes: number
  intervalMinutes: number
  title: string
  body: string
  timestamp: number
}

export type SessionQuickActionType =
  | 'add-5m'
  | 'start-break'
  | 'start-afk-break'
  | 'complete-task'
  | 'toggle-pause'
  | 'restart-session'
  | 'pause'
  | 'resume'
  | 'snooze'
  | 'switch-task'
  | 'dot-reset'

export interface UninstallResult {
  success: boolean
  message?: string
  error?: string
}

export interface DeleteDataResult {
  success: boolean
  message?: string
  error?: string
}

export type GetLogsPayload = {
  date: string
}

export type AppendLogPayload = {
  date: string
  entry: LogEntry
  isCheckIn?: boolean
}

export type UpdateLogPayload = {
  date: string
  log: LogEntry
}

export type DeleteLogPayload = {
  id: string
}

export type GetGoalsPayload = {
  date: string
}

export type AddGoalPayload = {
  date: string
  title: string
  status?: 'planned' | 'in_progress' | 'done'
  targetMinutes?: number
  deadline?: string
  note?: string
  remindAt?: string
  repeat?: string
  groupTag?: string
  groupColor?: string
  sortOrder?: number
  goalType?: GoalType
  learningTrackId?: string
  learningStage?: 1 | 2 | 3
}

export type UpdateGoalPayload = {
  date: string
  goal: DailyGoal
}

export type UpdateGoalsPayload = {
  goals: DailyGoal[]
}

export type DeleteGoalPayload = {
  goalId: string
}

export type DeleteGoalsPayload = {
  goalIds: string[]
}

export type RestoreGoalPayload = {
  goalId: string
}

export type RestoreGoalsPayload = {
  goalIds: string[]
}

export type HardDeleteGoalPayload = {
  goalId: string
}

export type CarryGoalPayload = {
  fromDate: string
  toDate: string
  goalId: string
}

export type CarryGoalsPayload = {
  fromDate: string
  toDate: string
  goalIds: string[]
}

export type GetDayReviewPayload = {
  date: string
}

export type AddInboxPayload = {
  title: string
  note?: string
}

export type UpdateInboxPayload = {
  item: GoalInboxItem
}

export type AddInboxToTodayPayload = {
  inboxGoalId: string
  date: string
  targetMinutes?: number
}

export type AddRecurringPayload = {
  title: string
  targetMinutes?: number
  frequency?: RecurringFrequency
  startsOn: string
  endsOn?: string
}

export type UpdateRecurringPayload = {
  goal: RecurringGoal
}

export type GenerateTodayPayload = {
  date: string
}

export type SetGroupColorPayload = {
  tag: string
  color: string
}

export type DeleteGroupColorPayload = {
  tag: string
}

export type RenameGroupPayload = {
  oldTag: string
  newTag: string
  newColor?: string
}

export function localDateStr(d: Date = new Date(), cutoffHour = 0): string {
  let effective = d
  if (cutoffHour > 0 && d.getHours() < cutoffHour) {
    effective = new Date(
      d.getFullYear(),
      d.getMonth(),
      d.getDate() - 1,
      d.getHours(),
      d.getMinutes(),
      d.getSeconds()
    )
  }
  const y = effective.getFullYear()
  const m = String(effective.getMonth() + 1).padStart(2, '0')
  const day = String(effective.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parseLocalDate(dateStr?: string): Date {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())) {
    const fallback = new Date()
    fallback.setHours(12, 0, 0, 0)
    return fallback
  }
  const [year, month, day] = dateStr.trim().split('-').map(Number)
  return new Date(year, month - 1, day, 12, 0, 0, 0)
}

export function shiftDate(dateStr: string, days: number): string {
  const d = parseLocalDate(dateStr)
  d.setDate(d.getDate() + days)
  return localDateStr(d)
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export type ClientLogPayload = {
  level: LogLevel
  message: string
  tag?: string
  details?: string
  timestamp?: string
}

export type GetAppLogsPayload = {
  limit?: number
}

export type AppLogsResult = {
  lines: string[]
  logFilePath: string
  logFileSize: number
  logFileSizeFormatted: string
  lastModified?: string
}

export type SystemDiagnostics = {
  appVersion: string
  platform: string
  osRelease: string
  arch: string
  electronVersion: string
  chromeVersion: string
  nodeVersion: string
  uptimeSeconds: number
  memoryUsageMB: number
  logFilePath: string
  logFileSizeFormatted: string
  dataPath: string
  githubIssuesUrl?: string
  supportEmail?: string
}

export type SessionTimerPayload = {
  isActive: boolean
  isPaused: boolean
  isBreak: boolean
  isAfk?: boolean
  isOvertime: boolean
  goalId?: string
  goalTitle?: string
  secondsRemaining: number
  totalSeconds: number
  badgeDataUrl?: string
  startedAt?: string
  effectiveDate?: string
  accumulatedPausedMs?: number
  pauseStartEpoch?: number
  sessionNote?: string
  emptyInProgressStartEpoch?: number
  afkBreakStartEpoch?: number
}
