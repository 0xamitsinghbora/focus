import { ipcMain } from 'electron'
import {
  IpcChannels,
  GetLogsPayload,
  AppendLogPayload,
  UpdateLogPayload,
  DeleteLogPayload,
  GetDayReviewPayload
} from '../../shared/types'
import { isValidDateString, isValidId, handleSecure } from '../ipcSecurity'
import { logger } from '../logger'
import type { LogsRepository, GoalsRepository, SettingsRepository } from '../repositories'
import type { AnalyticsService } from '../services/AnalyticsService'
import type { ReminderScheduler } from '../scheduler'
import type { SyncTarget } from '../syncUtils'

export interface LogsIpcDependencies {
  logsRepo: LogsRepository
  analyticsService: AnalyticsService
  settingsRepo: SettingsRepository
  goalsRepo: GoalsRepository
  scheduler: ReminderScheduler
  syncAfterWrite: (target?: SyncTarget) => void
  security: {
    assertSenderIsMainWindow: (event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent) => void
    assertSenderIsMainWindowOrPrompt: (
      event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent
    ) => void
    assertSenderIsAppWindow: (event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent) => void
  }
  isQuitting?: () => boolean
}

export class LogsIpcController {
  private deps: LogsIpcDependencies

  constructor(deps: LogsIpcDependencies) {
    this.deps = deps
  }

  public register(): void {
    const {
      logsRepo,
      analyticsService,
      settingsRepo,
      goalsRepo,
      scheduler,
      syncAfterWrite,
      security
    } = this.deps

    handleSecure(IpcChannels.GetLogs, 'app', security, async (_, payload?: GetLogsPayload) => {
      if (this.deps.isQuitting?.()) return []
      if (!payload || !isValidDateString(payload.date)) return []
      return await logsRepo.getLogs(payload.date)
    })

    handleSecure(
      IpcChannels.AppendLog,
      'main_or_prompt',
      security,
      async (_, payload?: AppendLogPayload) => {
        if (
          !payload ||
          !isValidDateString(payload.date) ||
          !payload.entry ||
          !isValidId(payload.entry.id)
        ) {
          throw new Error('Invalid AppendLog payload')
        }
        const { date, entry, isCheckIn } = payload
        logger.debug('ipc', `AppendLog ${date}: id=${entry.id}`)
        const timedEntry = isCheckIn ? scheduler.enrichLogWithCurrentBlock(entry) : entry
        const result = await logsRepo.appendLog(date, timedEntry)
        if (isCheckIn) {
          const unattendedBreak = scheduler.consumeUnattendedBreak?.()
          if (unattendedBreak) {
            await logsRepo.appendLog(date, unattendedBreak)
          }
          scheduler.resetBlockAndTimer()
        }
        syncAfterWrite({ logDates: [date] })
        return result
      }
    )

    handleSecure(IpcChannels.UpdateLog, 'main', security, async (_, payload?: UpdateLogPayload) => {
      if (
        !payload ||
        !isValidDateString(payload.date) ||
        !payload.log ||
        !isValidId(payload.log.id)
      ) {
        throw new Error('Invalid UpdateLog payload')
      }
      const { date, log } = payload
      logger.debug('ipc', `UpdateLog ${date}: ${log.id}`)
      const result = await logsRepo.updateLog(date, log)
      syncAfterWrite({ logDates: [date] })
      return result
    })

    handleSecure(IpcChannels.DeleteLog, 'main', security, async (_, payload?: DeleteLogPayload) => {
      if (!payload || !isValidId(payload.id)) throw new Error('Invalid DeleteLog payload')
      const { id } = payload
      logger.debug('ipc', `DeleteLog: ${id}`)
      const affectedDate = await logsRepo.deleteLog(id)
      if (affectedDate) {
        syncAfterWrite({ logDates: [affectedDate] })
      }
      return { success: true }
    })

    handleSecure(
      IpcChannels.GetHeatmap,
      'app',
      security,
      async (_, payload?: { startDate?: string }) => {
        if (this.deps.isQuitting?.()) return {}
        return await analyticsService.getHeatmapBreakdown(payload?.startDate)
      }
    )

    handleSecure(
      IpcChannels.GetDayReview,
      'app',
      security,
      async (_, payload?: GetDayReviewPayload) => {
        if (this.deps.isQuitting?.()) return null
        if (!payload || !isValidDateString(payload.date)) return null
        const { date } = payload
        if (date === settingsRepo.getTodayDate()) {
          await goalsRepo.generateTodayGoals(date)
        }
        return await analyticsService.getDayReview(date)
      }
    )
  }

  public destroy(): void {
    const channels = [
      IpcChannels.GetLogs,
      IpcChannels.AppendLog,
      IpcChannels.UpdateLog,
      IpcChannels.DeleteLog,
      IpcChannels.GetHeatmap,
      IpcChannels.GetDayReview
    ]

    for (const channel of channels) {
      try {
        ipcMain.removeHandler(channel)
      } catch (err) {
        logger.warn('logs:ipc', `Failed to remove handler for ${channel}:`, err)
      }
    }
  }
}
