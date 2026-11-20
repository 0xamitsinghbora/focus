import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import {
  IpcChannels,
  SessionTimerPayload,
  SyncTarget,
  ThemeMode,
  SessionQuickActionType,
  BreakNudgePayload,
  UpdateState,
  UpdateDownloadProgress
} from '../shared/types'
import { FocusAPI } from '../shared/api'

function createSubscriber<T = void>(channel: string) {
  return (callback: (data: T) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, data: T): void => callback(data)
    ipcRenderer.on(channel, handler)
    return () => {
      ipcRenderer.removeListener(channel, handler)
    }
  }
}

export const api: FocusAPI = {
  logs: {
    get: (date) => ipcRenderer.invoke(IpcChannels.GetLogs, { date }),
    append: (date, entry, isCheckIn) =>
      ipcRenderer.invoke(IpcChannels.AppendLog, { date, entry, isCheckIn }),
    update: (date, log) => ipcRenderer.invoke(IpcChannels.UpdateLog, { date, log }),
    delete: (id) => ipcRenderer.invoke(IpcChannels.DeleteLog, { id }),
    getHeatmap: (startDate) => ipcRenderer.invoke(IpcChannels.GetHeatmap, { startDate }),
    getDayReview: (date) => ipcRenderer.invoke(IpcChannels.GetDayReview, { date }),
    openDataFolder: () => ipcRenderer.invoke(IpcChannels.OpenDataFolder),
    exportData: () => ipcRenderer.invoke(IpcChannels.ExportData),
    importData: () => ipcRenderer.invoke(IpcChannels.ImportData),
    backupDatabase: () => ipcRenderer.invoke(IpcChannels.BackupDatabase),
    downloadDatabase: () => ipcRenderer.invoke(IpcChannels.DownloadDatabase),
    uploadDatabaseToDrive: () => ipcRenderer.invoke(IpcChannels.UploadDatabaseToDrive)
  },

  goals: {
    get: (date) => ipcRenderer.invoke(IpcChannels.GetGoals, { date }),
    add: (payload) => ipcRenderer.invoke(IpcChannels.AddGoal, payload),
    update: (date, goal) => ipcRenderer.invoke(IpcChannels.UpdateGoal, { date, goal }),
    updateBatch: (goals) => ipcRenderer.invoke(IpcChannels.UpdateGoals, { goals }),
    delete: (goalId) => ipcRenderer.invoke(IpcChannels.DeleteGoal, { goalId }),
    deleteBatch: (goalIds) => ipcRenderer.invoke(IpcChannels.DeleteGoals, { goalIds }),
    getDeleted: (limit, offset, query) =>
      ipcRenderer.invoke(IpcChannels.GoalsGetDeleted, { limit, offset, query }),
    restore: (goalId) => ipcRenderer.invoke(IpcChannels.GoalsRestore, { goalId }),
    restoreBatch: (goalIds) => ipcRenderer.invoke(IpcChannels.GoalsRestoreBatch, { goalIds }),
    hardDelete: (goalId) => ipcRenderer.invoke(IpcChannels.GoalsHardDelete, { goalId }),
    emptyTrash: () => ipcRenderer.invoke(IpcChannels.GoalsEmptyTrash),
    carry: (fromDate, toDate, goalId) =>
      ipcRenderer.invoke(IpcChannels.CarryGoal, { fromDate, toDate, goalId }),
    carryBatch: (fromDate, toDate, goalIds) =>
      ipcRenderer.invoke(IpcChannels.CarryGoals, { fromDate, toDate, goalIds }),
    getLoggedMinutes: (goalIds) => ipcRenderer.invoke(IpcChannels.GoalsGetLoggedMinutes, goalIds),
    getGroupColors: () => ipcRenderer.invoke(IpcChannels.GetGroupColors),
    setGroupColor: (tag, color) => ipcRenderer.invoke(IpcChannels.SetGroupColor, { tag, color }),
    deleteGroupColor: (tag) => ipcRenderer.invoke(IpcChannels.DeleteGroupColor, { tag }),
    renameGroup: (oldTag, newTag, newColor) =>
      ipcRenderer.invoke(IpcChannels.RenameGroup, { oldTag, newTag, newColor })
  },

  learning: {
    getTracks: (status) => ipcRenderer.invoke(IpcChannels.LearningGetTracks, status),
    resetStage: (trackId, stage, newDate) =>
      ipcRenderer.invoke(IpcChannels.LearningResetStage, { trackId, stage, newDate })
  },

  evaluator: {
    getSettings: () => ipcRenderer.invoke(IpcChannels.EvaluatorGetSettings),
    updateSettings: (settings) => ipcRenderer.invoke(IpcChannels.EvaluatorUpdateSettings, settings),
    submitForReview: (submission) =>
      ipcRenderer.invoke(IpcChannels.EvaluatorSubmitForReview, submission),
    runAiReview: (submission) => ipcRenderer.invoke(IpcChannels.EvaluatorRunAiReview, submission),
    getEvaluations: (filter) => ipcRenderer.invoke(IpcChannels.EvaluatorGetEvaluations, filter),
    getMetrics: () => ipcRenderer.invoke(IpcChannels.EvaluatorGetMetrics)
  },

  session: {
    updateTimer: (payload) => ipcRenderer.send(IpcChannels.UpdateSessionTimer, payload),
    getState: () => ipcRenderer.invoke(IpcChannels.GetSessionState),
    quickAction: (action, payload) =>
      ipcRenderer.send(IpcChannels.SessionQuickAction, action, payload),
    notifyZeroReached: (autoPause = true) =>
      ipcRenderer.send(IpcChannels.SessionZeroReached, autoPause),
    onTogglePause: (callback) => {
      const handler = (): void => callback()
      ipcRenderer.on(IpcChannels.SessionTogglePause, handler)
      return () => {
        ipcRenderer.removeListener(IpcChannels.SessionTogglePause, handler)
      }
    },
    onQuickAction: (callback) => {
      const handler = (
        _: IpcRendererEvent,
        action: SessionQuickActionType,
        payload?: string
      ): void => callback(action, payload)
      ipcRenderer.on(IpcChannels.SessionQuickAction, handler)
      return () => {
        ipcRenderer.removeListener(IpcChannels.SessionQuickAction, handler)
      }
    },
    onSessionUpdate: createSubscriber<SessionTimerPayload>(IpcChannels.UpdateSessionTimer)
  },

  scheduler: {
    getStatus: () => ipcRenderer.invoke(IpcChannels.RemindGetStatus),
    snooze: (minutes?: number) => ipcRenderer.send(IpcChannels.RemindSnooze, minutes),
    submit: () => ipcRenderer.send(IpcChannels.RemindSubmit),
    resizePrompt: (height) => ipcRenderer.send(IpcChannels.PromptResize, height),
    focusPrompt: () => ipcRenderer.send(IpcChannels.PromptFocus),
    showPrompt: () => ipcRenderer.send(IpcChannels.PromptShow),
    onPromptShown: (callback) => {
      const handler = (): void => callback()
      ipcRenderer.on(IpcChannels.PromptShown, handler)
      return () => {
        ipcRenderer.removeListener(IpcChannels.PromptShown, handler)
      }
    },
    onBreakNudge: createSubscriber<BreakNudgePayload>(IpcChannels.BreakNudge)
  },

  settings: {
    get: () => ipcRenderer.invoke(IpcChannels.GetSettings),
    set: (settings) => ipcRenderer.invoke(IpcChannels.SetSettings, settings),
    patch: (partial) => ipcRenderer.invoke(IpcChannels.PatchSettings, partial),
    uninstall: (options?: { keepUserData?: boolean }) =>
      ipcRenderer.invoke(IpcChannels.UninstallApp, options),
    deleteAllData: () => ipcRenderer.invoke(IpcChannels.DeleteAllData)
  },

  diagnostics: {
    logClientMessage: (payload) => ipcRenderer.send(IpcChannels.LogMessage, payload),
    getLogs: (limit) => ipcRenderer.invoke(IpcChannels.GetAppLogs, { limit }),
    getSystemDiagnostics: () => ipcRenderer.invoke(IpcChannels.GetSystemDiagnostics),
    openLogsFolder: () => ipcRenderer.invoke(IpcChannels.OpenLogsFolder),
    clearLogs: () => ipcRenderer.invoke(IpcChannels.ClearAppLogs),
    openGitHubIssue: (customDescription) =>
      ipcRenderer.invoke(IpcChannels.OpenGitHubIssue, customDescription)
  },

  sync: {
    driveStatus: () => ipcRenderer.invoke(IpcChannels.DriveStatus),
    driveConnect: () => ipcRenderer.invoke(IpcChannels.DriveConnect),
    driveDisconnect: () => ipcRenderer.invoke(IpcChannels.DriveDisconnect),
    driveSyncNow: () => ipcRenderer.invoke(IpcChannels.DriveSyncNow),
    uploadDatabaseToDrive: () => ipcRenderer.invoke(IpcChannels.UploadDatabaseToDrive)
  },

  widget: {
    getBounds: () => ipcRenderer.invoke(IpcChannels.WidgetGetBounds),
    setPosition: (pos) => ipcRenderer.send(IpcChannels.WidgetSetPosition, pos),
    savePosition: () => ipcRenderer.invoke(IpcChannels.WidgetSavePosition),
    hide: () => ipcRenderer.send(IpcChannels.WidgetHide),
    showApp: () => ipcRenderer.send(IpcChannels.WidgetShowApp),
    toggleSession: () => ipcRenderer.send(IpcChannels.WidgetToggleSession),
    contextMenu: () => ipcRenderer.send(IpcChannels.WidgetContextMenu),
    snapTaskbar: () => ipcRenderer.send(IpcChannels.WidgetSnapTaskbar),
    setIgnoreMouseEvents: (ignore: boolean) =>
      ipcRenderer.send(IpcChannels.WidgetSetIgnoreMouseEvents, ignore),
    setExpanded: (expanded: boolean) => ipcRenderer.send(IpcChannels.WidgetSetExpanded, expanded),
    onPositionUpdated: createSubscriber<{ x: number; y: number }>(IpcChannels.WidgetPositionUpdated)
  },

  events: {
    onDataUpdated: (callback) => {
      const handler = (_: IpcRendererEvent, target?: SyncTarget): void => callback(target)
      ipcRenderer.on(IpcChannels.DataUpdated, handler)
      return () => {
        ipcRenderer.removeListener(IpcChannels.DataUpdated, handler)
      }
    },
    onNavigateTab: (callback) => {
      const handler = (_: IpcRendererEvent, tab: 'today' | 'goals' | 'review' | 'settings'): void =>
        callback(tab)
      ipcRenderer.on(IpcChannels.NavigateTab, handler)
      return () => {
        ipcRenderer.removeListener(IpcChannels.NavigateTab, handler)
      }
    }
  },

  theme: {
    getInitialTheme: (): ThemeMode => {
      try {
        if (typeof localStorage !== 'undefined') {
          const stored = localStorage.getItem('focus-theme')
          if (stored === 'light' || stored === 'dark' || stored === 'system') {
            return stored
          }
        }
      } catch {
        // ignore
      }
      return 'system'
    },
    onThemeUpdated: createSubscriber<ThemeMode>(IpcChannels.ThemeUpdated)
  },

  updater: {
    checkForUpdates: () => ipcRenderer.invoke(IpcChannels.UpdateCheck),
    downloadUpdate: () => ipcRenderer.invoke(IpcChannels.UpdateDownload),
    cancelDownload: () => ipcRenderer.invoke(IpcChannels.UpdateCancelDownload),
    installUpdate: (options) => ipcRenderer.invoke(IpcChannels.UpdateInstall, options),
    getState: () => ipcRenderer.invoke(IpcChannels.UpdateGetState),
    cleanCache: () => ipcRenderer.invoke(IpcChannels.UpdateCleanCache),
    onStatusChange: createSubscriber<UpdateState>(IpcChannels.UpdateStatusChanged),
    onDownloadProgress: createSubscriber<UpdateDownloadProgress>(IpcChannels.UpdateDownloadProgress)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error('Failed to expose api bridge in main world:', error)
  }
} else if (typeof window !== 'undefined') {
  // @ts-ignore (define in dts)
  window.api = api
}
