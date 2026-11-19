import { ipcMain } from 'electron'
import {
  IpcChannels,
  GetGoalsPayload,
  AddGoalPayload,
  UpdateGoalPayload,
  UpdateGoalsPayload,
  DeleteGoalPayload,
  DeleteGoalsPayload,
  RestoreGoalPayload,
  RestoreGoalsPayload,
  HardDeleteGoalPayload,
  CarryGoalPayload,
  CarryGoalsPayload,
  SetGroupColorPayload,
  DeleteGroupColorPayload,
  RenameGroupPayload,
  AddInboxPayload,
  UpdateInboxPayload,
  AddInboxToTodayPayload,
  AddRecurringPayload,
  UpdateRecurringPayload,
  GenerateTodayPayload
} from '../../shared/types'
import { isValidDateString, isValidId, isValidIdArray, isValidGoalObject } from '../ipcSecurity'
import { logger } from '../logger'
import type { GoalsRepository, SettingsRepository } from '../repositories'
import type { AnalyticsService } from '../services/AnalyticsService'
import type { SyncTarget } from '../syncUtils'

export interface GoalsIpcDependencies {
  goalsRepo: GoalsRepository
  settingsRepo: SettingsRepository
  analyticsService: AnalyticsService
  syncAfterWrite: (target?: SyncTarget) => void
  getDirtyGoalDates?: () => string[]
  security: {
    assertSenderIsMainWindow: (event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent) => void
    assertSenderIsMainWindowOrPrompt: (
      event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent
    ) => void
    assertSenderIsAppWindow?: (event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent) => void
  }
  isQuitting?: () => boolean
}

export class GoalsIpcController {
  private deps: GoalsIpcDependencies

  constructor(deps: GoalsIpcDependencies) {
    this.deps = deps
  }

  public register(): void {
    const {
      goalsRepo,
      settingsRepo,
      analyticsService,
      syncAfterWrite,
      getDirtyGoalDates,
      security
    } = this.deps

    const getDirtyDates = (): string[] => {
      try {
        return getDirtyGoalDates ? getDirtyGoalDates() : []
      } catch (err) {
        logger.warn('goals:ipc', 'Failed to retrieve dirty goal dates:', err)
        return []
      }
    }

    ipcMain.handle(IpcChannels.GetGoals, async (event, payload?: GetGoalsPayload) => {
      if (this.deps.isQuitting?.()) return []
      if (security.assertSenderIsAppWindow) {
        security.assertSenderIsAppWindow(event)
      } else {
        security.assertSenderIsMainWindowOrPrompt(event)
      }
      if (!payload || !isValidDateString(payload.date)) return []
      try {
        const { date } = payload
        const todayDate = goalsRepo.getTodayDate()
        if (date === todayDate) {
          await goalsRepo.generateTodayGoals(date)
          return await goalsRepo.getBoardGoals(date)
        }
        return await goalsRepo.getGoals(date)
      } catch (err) {
        logger.error('goals:ipc', `Failed to get goals for date ${payload.date}:`, err)
        throw err
      }
    })

    ipcMain.handle(IpcChannels.AddGoal, async (event, payload?: AddGoalPayload) => {
      security.assertSenderIsMainWindowOrPrompt(event)
      if (
        !payload ||
        !isValidDateString(payload.date) ||
        typeof payload.title !== 'string' ||
        !payload.title.trim()
      ) {
        throw new Error('Invalid AddGoal payload')
      }
      try {
        const {
          date,
          title,
          targetMinutes,
          deadline,
          note,
          remindAt,
          repeat,
          groupTag,
          groupColor,
          sortOrder,
          status,
          learningTrackId,
          learningStage
        } = payload
        const goal = await goalsRepo.addGoal(
          date,
          title,
          targetMinutes,
          undefined,
          deadline,
          note,
          remindAt,
          repeat,
          groupTag,
          groupColor,
          sortOrder,
          status,
          learningTrackId,
          learningStage
        )
        syncAfterWrite({ goalDates: [date] })
        return goal
      } catch (err) {
        logger.error('goals:ipc', 'Failed to add goal:', err)
        throw err
      }
    })

    ipcMain.handle(IpcChannels.UpdateGoal, async (event, payload?: UpdateGoalPayload) => {
      security.assertSenderIsMainWindowOrPrompt(event)
      if (!payload || !isValidDateString(payload.date) || !isValidGoalObject(payload.goal)) {
        throw new Error('Invalid UpdateGoal payload')
      }
      try {
        const { date, goal } = payload
        const updatedGoal = await goalsRepo.updateGoal(date, goal)
        const targetDates = [date]
        if (goal.date && goal.date !== date) {
          targetDates.push(goal.date)
        }
        const today = goalsRepo.getTodayDate()
        if (!targetDates.includes(today)) {
          targetDates.push(today)
        }
        syncAfterWrite({ goalDates: targetDates })
        return updatedGoal
      } catch (err) {
        logger.error('goals:ipc', 'Failed to update goal:', err)
        throw err
      }
    })

    ipcMain.handle(IpcChannels.UpdateGoals, async (event, payload?: UpdateGoalsPayload) => {
      security.assertSenderIsMainWindow(event)
      if (!payload || !Array.isArray(payload.goals) || !payload.goals.every(isValidGoalObject)) {
        throw new Error('Invalid UpdateGoals payload')
      }
      try {
        const { goals } = payload
        const updatedGoals = await goalsRepo.updateGoals(goals)
        const affectedDates = Array.from(new Set(goals.map((g) => g.date).filter(Boolean)))
        const today = goalsRepo.getTodayDate()
        if (!affectedDates.includes(today)) {
          affectedDates.push(today)
        }
        syncAfterWrite({ goalDates: affectedDates.length > 0 ? affectedDates : undefined })
        return updatedGoals
      } catch (err) {
        logger.error('goals:ipc', 'Failed to update goals in batch:', err)
        throw err
      }
    })

    ipcMain.handle(IpcChannels.DeleteGoal, async (event, payload?: DeleteGoalPayload) => {
      security.assertSenderIsMainWindow(event)
      if (!payload || !isValidId(payload.goalId)) throw new Error('Invalid DeleteGoal payload')
      try {
        const { goalId } = payload
        const goalDate = await goalsRepo.deleteGoal(goalId)
        syncAfterWrite(goalDate ? { goalDates: [goalDate] } : undefined)
        return { success: true }
      } catch (err) {
        logger.error('goals:ipc', `Failed to delete goal ${payload.goalId}:`, err)
        throw err
      }
    })

    ipcMain.handle(IpcChannels.DeleteGoals, async (event, payload?: DeleteGoalsPayload) => {
      security.assertSenderIsMainWindow(event)
      if (!payload || !isValidIdArray(payload.goalIds)) {
        throw new Error('Invalid DeleteGoals payload')
      }
      try {
        const { goalIds } = payload
        const affectedDates = await goalsRepo.deleteGoals(goalIds)
        syncAfterWrite(affectedDates.length > 0 ? { goalDates: affectedDates } : undefined)
        return { success: true, count: goalIds.length }
      } catch (err) {
        logger.error('goals:ipc', 'Failed to delete goals in batch:', err)
        throw err
      }
    })

    ipcMain.handle(
      IpcChannels.GoalsGetDeleted,
      async (event, payload?: { limit?: number; offset?: number; query?: string }) => {
        security.assertSenderIsMainWindow(event)
        try {
          const limit = Math.max(1, Math.min(payload?.limit ?? 50, 200))
          const offset = Math.max(0, payload?.offset ?? 0)
          const query = typeof payload?.query === 'string' ? payload.query.trim() : undefined
          const goals = await goalsRepo.getDeletedGoals(limit, offset, query)
          const totalCount = await goalsRepo.getDeletedGoalsCount(query)
          return { goals, totalCount }
        } catch (err) {
          logger.error('goals:ipc', 'Failed to get deleted goals:', err)
          throw err
        }
      }
    )

    ipcMain.handle(IpcChannels.GoalsRestore, async (event, payload?: RestoreGoalPayload) => {
      security.assertSenderIsMainWindow(event)
      if (!payload || !isValidId(payload.goalId)) throw new Error('Invalid RestoreGoal payload')
      try {
        const { goalId } = payload
        const restored = await goalsRepo.restoreGoal(goalId)
        if (restored) {
          syncAfterWrite({ goalDates: [restored.date] })
        }
        return restored
      } catch (err) {
        logger.error('goals:ipc', `Failed to restore goal ${payload.goalId}:`, err)
        throw err
      }
    })

    ipcMain.handle(IpcChannels.GoalsRestoreBatch, async (event, payload?: RestoreGoalsPayload) => {
      security.assertSenderIsMainWindow(event)
      if (!payload || !isValidIdArray(payload.goalIds))
        throw new Error('Invalid RestoreGoals payload')
      try {
        const { goalIds } = payload
        const restored = await goalsRepo.restoreGoals(goalIds)
        if (restored.length > 0) {
          const affectedDates = Array.from(new Set(restored.map((g) => g.date)))
          syncAfterWrite({ goalDates: affectedDates })
        }
        return restored
      } catch (err) {
        logger.error('goals:ipc', 'Failed to restore goals in batch:', err)
        throw err
      }
    })

    ipcMain.handle(IpcChannels.GoalsHardDelete, async (event, payload?: HardDeleteGoalPayload) => {
      security.assertSenderIsMainWindow(event)
      if (!payload || !isValidId(payload.goalId)) throw new Error('Invalid GoalsHardDelete payload')
      try {
        const result = await goalsRepo.hardDeleteGoal(payload.goalId)
        if (result.success) {
          syncAfterWrite({
            syncPurged: true,
            goalDates: result.date ? [result.date] : undefined
          })
        }
        return { success: result.success }
      } catch (err) {
        logger.error('goals:ipc', `Failed to hard delete goal ${payload.goalId}:`, err)
        throw err
      }
    })

    ipcMain.handle(IpcChannels.GoalsEmptyTrash, async (event) => {
      security.assertSenderIsMainWindow(event)
      try {
        const { count, affectedDates } = await goalsRepo.emptyTrash()
        if (count > 0) {
          syncAfterWrite({
            syncPurged: true,
            goalDates: affectedDates.length > 0 ? affectedDates : undefined
          })
        }
        return { success: true, count }
      } catch (err) {
        logger.error('goals:ipc', 'Failed to empty trash:', err)
        throw err
      }
    })

    ipcMain.handle(IpcChannels.CarryGoal, async (event, payload?: CarryGoalPayload) => {
      security.assertSenderIsMainWindow(event)
      if (
        !payload ||
        !isValidDateString(payload.fromDate) ||
        !isValidDateString(payload.toDate) ||
        !isValidId(payload.goalId)
      ) {
        throw new Error('Invalid CarryGoal payload')
      }
      try {
        const { fromDate, toDate, goalId } = payload
        const goal = await goalsRepo.carryGoal(fromDate, toDate, goalId)
        syncAfterWrite({ goalDates: [fromDate, toDate] })
        return goal
      } catch (err) {
        logger.error('goals:ipc', `Failed to carry goal ${payload.goalId}:`, err)
        throw err
      }
    })

    ipcMain.handle(IpcChannels.CarryGoals, async (event, payload?: CarryGoalsPayload) => {
      security.assertSenderIsMainWindow(event)
      if (
        !payload ||
        !isValidDateString(payload.fromDate) ||
        !isValidDateString(payload.toDate) ||
        !isValidIdArray(payload.goalIds)
      ) {
        throw new Error('Invalid CarryGoals payload')
      }
      try {
        const { fromDate, toDate, goalIds } = payload
        const goals = await goalsRepo.carryGoals(fromDate, toDate, goalIds)
        syncAfterWrite({ goalDates: [fromDate, toDate] })
        return goals
      } catch (err) {
        logger.error('goals:ipc', 'Failed to carry goals in batch:', err)
        throw err
      }
    })

    ipcMain.handle(IpcChannels.GoalsGetLoggedMinutes, async (event, goalIds?: string[]) => {
      security.assertSenderIsMainWindowOrPrompt(event)
      try {
        return await analyticsService.getGoalLoggedMinutesMap(goalIds)
      } catch (err) {
        logger.error('goals:ipc', 'Failed to get logged minutes map:', err)
        throw err
      }
    })

    ipcMain.handle(IpcChannels.GetGroupColors, async (event) => {
      security.assertSenderIsMainWindow(event)
      try {
        return settingsRepo.getGroupColors()
      } catch (err) {
        logger.error('goals:ipc', 'Failed to get group colors:', err)
        throw err
      }
    })

    ipcMain.handle(IpcChannels.SetGroupColor, async (event, payload?: SetGroupColorPayload) => {
      security.assertSenderIsMainWindow(event)
      if (!payload?.tag || !payload?.color) throw new Error('Invalid SetGroupColor payload')
      try {
        const { tag, color } = payload
        const affectedDates = await goalsRepo.updateGroupColorAcrossGoals(tag, color)
        syncAfterWrite({ syncSettings: true, goalDates: affectedDates })
        return { success: true }
      } catch (err) {
        logger.error('goals:ipc', `Failed to set group color for tag ${payload.tag}:`, err)
        throw err
      }
    })

    ipcMain.handle(
      IpcChannels.DeleteGroupColor,
      async (event, payload?: DeleteGroupColorPayload) => {
        security.assertSenderIsMainWindow(event)
        if (!payload?.tag) throw new Error('Invalid DeleteGroupColor payload')
        try {
          const { tag } = payload
          settingsRepo.deleteGroupColor(tag)
          syncAfterWrite({ syncSettings: true })
          return { success: true }
        } catch (err) {
          logger.error('goals:ipc', `Failed to delete group color for tag ${payload.tag}:`, err)
          throw err
        }
      }
    )

    ipcMain.handle(IpcChannels.RenameGroup, async (event, payload?: RenameGroupPayload) => {
      security.assertSenderIsMainWindow(event)
      if (!payload?.oldTag || !payload?.newTag) throw new Error('Invalid RenameGroup payload')
      try {
        const { oldTag, newTag, newColor } = payload
        const affectedDates = await goalsRepo.renameGroupAcrossGoals(oldTag, newTag, newColor)
        syncAfterWrite({ syncSettings: true, goalDates: affectedDates })
        return { success: true }
      } catch (err) {
        logger.error(
          'goals:ipc',
          `Failed to rename group from ${payload.oldTag} to ${payload.newTag}:`,
          err
        )
        throw err
      }
    })

    ipcMain.handle(IpcChannels.GoalsGetInbox, async (event) => {
      security.assertSenderIsMainWindow(event)
      try {
        return await goalsRepo.getInboxGoals()
      } catch (err) {
        logger.error('goals:ipc', 'Failed to get inbox goals:', err)
        throw err
      }
    })

    ipcMain.handle(IpcChannels.GoalsAddInbox, async (event, payload?: AddInboxPayload) => {
      security.assertSenderIsMainWindow(event)
      if (!payload?.title) throw new Error('Invalid AddInbox payload')
      try {
        const { title, note } = payload
        const item = await goalsRepo.addInboxGoal(title, note)
        syncAfterWrite({ syncInbox: true })
        return item
      } catch (err) {
        logger.error('goals:ipc', 'Failed to add inbox goal:', err)
        throw err
      }
    })

    ipcMain.handle(IpcChannels.GoalsUpdateInbox, async (event, payload?: UpdateInboxPayload) => {
      security.assertSenderIsMainWindow(event)
      if (!payload?.item) throw new Error('Invalid UpdateInbox payload')
      try {
        const { item } = payload
        const updatedItem = await goalsRepo.updateInboxGoal(item)
        syncAfterWrite({ syncInbox: true })
        return updatedItem
      } catch (err) {
        logger.error('goals:ipc', 'Failed to update inbox goal:', err)
        throw err
      }
    })

    ipcMain.handle(
      IpcChannels.GoalsAddInboxToToday,
      async (event, payload?: AddInboxToTodayPayload) => {
        security.assertSenderIsMainWindow(event)
        if (!payload?.inboxGoalId || !payload?.date)
          throw new Error('Invalid AddInboxToToday payload')
        try {
          const { inboxGoalId, date, targetMinutes } = payload
          const goal = await goalsRepo.addInboxGoalToToday(inboxGoalId, date, targetMinutes)
          syncAfterWrite({ goalDates: [date], syncInbox: true })
          return goal
        } catch (err) {
          logger.error('goals:ipc', 'Failed to add inbox goal to today:', err)
          throw err
        }
      }
    )

    ipcMain.handle(IpcChannels.GoalsGetRecurring, async (event) => {
      security.assertSenderIsMainWindow(event)
      try {
        return await goalsRepo.getRecurringGoals()
      } catch (err) {
        logger.error('goals:ipc', 'Failed to get recurring goals:', err)
        throw err
      }
    })

    ipcMain.handle(IpcChannels.GoalsAddRecurring, async (event, payload?: AddRecurringPayload) => {
      security.assertSenderIsMainWindow(event)
      if (!payload?.title || !payload?.startsOn) throw new Error('Invalid AddRecurring payload')
      try {
        const { title, targetMinutes, startsOn, endsOn, frequency } = payload
        const goal = await goalsRepo.addRecurringGoal(
          title,
          targetMinutes,
          startsOn,
          endsOn,
          frequency
        )
        const today = goalsRepo.getTodayDate()
        await goalsRepo.generateTodayGoals(today)
        const dirtyDates = getDirtyDates()
        syncAfterWrite({
          syncRecurring: true,
          goalDates: Array.from(new Set([today, ...dirtyDates]))
        })
        return goal
      } catch (err) {
        logger.error('goals:ipc', 'Failed to add recurring goal:', err)
        throw err
      }
    })

    ipcMain.handle(
      IpcChannels.GoalsUpdateRecurring,
      async (event, payload?: UpdateRecurringPayload) => {
        security.assertSenderIsMainWindow(event)
        if (!payload?.goal) throw new Error('Invalid UpdateRecurring payload')
        try {
          const { goal } = payload
          const updatedGoal = await goalsRepo.updateRecurringGoal(goal)
          const today = goalsRepo.getTodayDate()
          await goalsRepo.generateTodayGoals(today)
          const dirtyDates = getDirtyDates()
          syncAfterWrite({
            syncRecurring: true,
            goalDates: Array.from(new Set([today, ...dirtyDates]))
          })
          return updatedGoal
        } catch (err) {
          logger.error('goals:ipc', 'Failed to update recurring goal:', err)
          throw err
        }
      }
    )

    ipcMain.handle(
      IpcChannels.GoalsGenerateToday,
      async (event, payload?: GenerateTodayPayload) => {
        security.assertSenderIsMainWindowOrPrompt(event)
        if (!payload?.date) return []
        try {
          const { date } = payload
          const goals = await goalsRepo.generateTodayGoals(date, true)
          const dirtyDates = getDirtyDates()
          if (dirtyDates.length > 0) {
            syncAfterWrite({ goalDates: dirtyDates })
          }
          return goals
        } catch (err) {
          logger.error('goals:ipc', `Failed to generate today goals for date ${payload.date}:`, err)
          throw err
        }
      }
    )
  }

  public destroy(): void {
    const channels = [
      IpcChannels.GetGoals,
      IpcChannels.AddGoal,
      IpcChannels.UpdateGoal,
      IpcChannels.UpdateGoals,
      IpcChannels.DeleteGoal,
      IpcChannels.DeleteGoals,
      IpcChannels.GoalsGetDeleted,
      IpcChannels.GoalsRestore,
      IpcChannels.GoalsRestoreBatch,
      IpcChannels.GoalsHardDelete,
      IpcChannels.GoalsEmptyTrash,
      IpcChannels.CarryGoal,
      IpcChannels.CarryGoals,
      IpcChannels.GoalsGetLoggedMinutes,
      IpcChannels.GetGroupColors,
      IpcChannels.SetGroupColor,
      IpcChannels.DeleteGroupColor,
      IpcChannels.RenameGroup,
      IpcChannels.GoalsGetInbox,
      IpcChannels.GoalsAddInbox,
      IpcChannels.GoalsUpdateInbox,
      IpcChannels.GoalsAddInboxToToday,
      IpcChannels.GoalsGetRecurring,
      IpcChannels.GoalsAddRecurring,
      IpcChannels.GoalsUpdateRecurring,
      IpcChannels.GoalsGenerateToday
    ]

    for (const channel of channels) {
      try {
        ipcMain.removeHandler(channel)
      } catch (err) {
        logger.warn('goals:ipc', `Failed to remove handler for ${channel}:`, err)
      }
    }
  }
}
