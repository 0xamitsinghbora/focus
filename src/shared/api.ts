import {
  AppSettings,
  DailyGoal,
  DayReviewData,
  LogEntry,
  ReminderStatus,
  SessionTimerPayload,
  ClientLogPayload,
  SystemDiagnostics,
  AddGoalPayload,
  UninstallResult,
  DeleteDataResult,
  ThemeMode,
  SyncTarget,
  HeatmapData,
  SessionQuickActionType,
  BreakNudgePayload,
  LearningTrack,
  LearningStage,
  UpdateState,
  UpdateDownloadProgress,
  CleanCacheResult,
  InstallUpdateOptions,
  EvaluatorMode,
  EvaluationRecord,
  EvaluationSubmission,
  EvaluatorMetrics,
  GoalBreakdownAnalysis,
  GoalBreakdownResult
} from './types'

export interface FocusAPI {
  // --- Logs & Day Review ---
  logs: {
    get: (date: string) => Promise<LogEntry[]>
    append: (date: string, entry: LogEntry, isCheckIn?: boolean) => Promise<void>
    update: (date: string, log: LogEntry) => Promise<LogEntry>
    delete: (id: string) => Promise<{ success: boolean }>
    getHeatmap: (startDate?: string) => Promise<HeatmapData>
    getDayReview: (date: string) => Promise<DayReviewData>
    openDataFolder: () => Promise<boolean>
    exportData: () => Promise<{
      success: boolean
      canceled?: boolean
      filePath?: string
      error?: string
    }>
    importData: () => Promise<{
      success: boolean
      canceled?: boolean
      error?: string
      filePath?: string
      stats?: { logs: number; dailyGoals: number; inboxGoals: number; recurringGoals: number }
    }>
    backupDatabase: () => Promise<string>
    downloadDatabase: () => Promise<{
      success: boolean
      canceled?: boolean
      filePath?: string
      error?: string
    }>
    uploadDatabaseToDrive: () => Promise<{
      success: boolean
      fileName?: string
      error?: string
    }>
  }

  // --- Daily Goals ---
  goals: {
    get: (date: string) => Promise<DailyGoal[]>
    add: (payload: AddGoalPayload) => Promise<DailyGoal>
    update: (date: string, goal: DailyGoal) => Promise<DailyGoal>
    updateBatch: (goals: DailyGoal[]) => Promise<DailyGoal[]>
    delete: (goalId: string) => Promise<{ success: boolean }>
    deleteBatch: (goalIds: string[]) => Promise<{ success: boolean; count: number }>
    getDeleted: (
      limit?: number,
      offset?: number,
      query?: string
    ) => Promise<{ goals: DailyGoal[]; totalCount: number }>
    restore: (goalId: string) => Promise<DailyGoal | null>
    restoreBatch: (goalIds: string[]) => Promise<DailyGoal[]>
    hardDelete: (goalId: string) => Promise<{ success: boolean }>
    emptyTrash: () => Promise<{ success: boolean; count: number }>
    carry: (fromDate: string, toDate: string, goalId: string) => Promise<DailyGoal>
    carryBatch: (fromDate: string, toDate: string, goalIds: string[]) => Promise<DailyGoal[]>
    getLoggedMinutes: (goalIds?: string[]) => Promise<Record<string, number>>
    getGroupColors: () => Promise<Record<string, string>>
    setGroupColor: (tag: string, color: string) => Promise<{ success: boolean }>
    deleteGroupColor: (tag: string) => Promise<{ success: boolean }>
    renameGroup: (
      oldTag: string,
      newTag: string,
      newColor?: string
    ) => Promise<{ success: boolean }>
    analyze: (payload: {
      title: string
      note?: string
      targetMinutes?: number
    }) => Promise<GoalBreakdownAnalysis>
    breakdown: (payload: {
      title: string
      note?: string
      targetMinutes?: number
    }) => Promise<GoalBreakdownResult>
  }

  // --- Learning & Spaced Repetition ---
  learning: {
    getTracks: (status?: 'active' | 'mastered') => Promise<LearningTrack[]>
    resetStage: (
      trackId: string,
      stage: LearningStage,
      newDate: string
    ) => Promise<{ success: boolean }>
  }

  // --- 3rd-Party Evaluator & Anti-Cheat ---
  evaluator: {
    getSettings: () => Promise<{
      mode: EvaluatorMode
      strictness: 'strict' | 'moderate' | 'lenient'
      requireProofOfWork: boolean
    }>
    updateSettings: (settings: {
      mode?: EvaluatorMode
      strictness?: 'strict' | 'moderate' | 'lenient'
      requireProofOfWork?: boolean
    }) => Promise<{ success: boolean }>
    submitForReview: (submission: EvaluationSubmission) => Promise<EvaluationRecord>
    runAiReview: (submission: EvaluationSubmission) => Promise<EvaluationRecord>
    getEvaluations: (filter?: {
      entityType?: 'goal' | 'day_review' | 'session'
      entityId?: string
      date?: string
    }) => Promise<EvaluationRecord[]>
    getMetrics: () => Promise<EvaluatorMetrics>
  }

  // --- Timer & Session ---
  session: {
    updateTimer: (payload: SessionTimerPayload) => void
    getState: () => Promise<SessionTimerPayload>
    quickAction?: (action: SessionQuickActionType, payload?: string) => void
    notifyZeroReached?: (autoPause?: boolean) => void
    onTogglePause: (callback: () => void) => () => void
    onQuickAction: (
      callback: (action: SessionQuickActionType, payload?: string) => void
    ) => () => void
    onSessionUpdate: (callback: (payload: SessionTimerPayload) => void) => () => void
  }

  // --- Scheduler & Prompts ---
  scheduler: {
    getStatus: () => Promise<ReminderStatus>
    snooze: (minutes?: number) => void
    submit: () => void
    resizePrompt: (height: number) => void
    focusPrompt: () => void
    showPrompt?: () => void
    onPromptShown: (callback: () => void) => () => void
    onBreakNudge?: (callback: (payload: BreakNudgePayload) => void) => () => void
  }

  // --- Settings & App Lifecycle ---
  settings: {
    get: () => Promise<AppSettings>
    set: (settings: AppSettings) => Promise<void>
    patch: (partial: Partial<AppSettings>) => Promise<AppSettings>
    uninstall: (options?: { keepUserData?: boolean }) => Promise<UninstallResult>
    deleteAllData: () => Promise<DeleteDataResult>
  }

  // --- Diagnostics & Logging ---
  diagnostics: {
    logClientMessage: (payload: ClientLogPayload) => void
    getLogs: (limit?: number) => Promise<string[]>
    getSystemDiagnostics: () => Promise<SystemDiagnostics>
    openLogsFolder: () => Promise<boolean>
    clearLogs: () => Promise<boolean>
    openGitHubIssue: (customDescription?: string) => Promise<{ success: boolean; report: string }>
  }

  // --- Cloud Sync ---
  sync: {
    driveStatus: () => Promise<{ isConnected: boolean; isSyncing: boolean; isConfigured: boolean }>
    driveConnect: () => Promise<{ success: boolean; error?: string }>
    driveDisconnect: () => Promise<void>
    driveSyncNow: () => Promise<{ success: boolean; error?: string }>
    uploadDatabaseToDrive: () => Promise<{ success: boolean; fileName?: string; error?: string }>
  }

  // --- Desktop Widget ---
  widget: {
    getBounds: () => Promise<{ x: number; y: number; width: number; height: number }>
    setPosition: (pos: { x: number; y: number }) => void
    savePosition: () => Promise<{ x: number; y: number } | null>
    hide: () => void
    showApp: () => void
    toggleSession: () => void
    contextMenu: () => void
    snapTaskbar: () => void
    setIgnoreMouseEvents?: (ignore: boolean) => void
    setExpanded?: (expanded: boolean) => void
    onPositionUpdated: (callback: (pos: { x: number; y: number }) => void) => () => void
  }

  // --- Theme Sync ---
  theme?: {
    getInitialTheme?: () => ThemeMode
    onThemeUpdated: (callback: (theme: ThemeMode) => void) => () => void
  }

  // --- Global Push Events ---
  events: {
    onDataUpdated: (callback: (target?: SyncTarget) => void) => () => void
    onNavigateTab: (
      callback: (tab: 'today' | 'goals' | 'review' | 'settings') => void
    ) => () => void
  }

  // --- Software Updates (GitHub Releases) ---
  updater: {
    checkForUpdates: () => Promise<UpdateState>
    downloadUpdate: () => Promise<boolean>
    cancelDownload: () => Promise<boolean>
    installUpdate: (options?: InstallUpdateOptions) => Promise<boolean>
    getState: () => Promise<UpdateState>
    cleanCache: () => Promise<CleanCacheResult>
    onStatusChange: (callback: (state: UpdateState) => void) => () => void
    onDownloadProgress: (callback: (progress: UpdateDownloadProgress) => void) => () => void
  }
}
