import Database from 'better-sqlite3'
import {
  DailyGoal,
  GoalInboxItem,
  RecurringGoal,
  RecurringFrequency,
  localDateStr,
  GoalType
} from '../../shared/types'
import { PurgedRecord } from '../dataManager'
import { SettingsRepository } from './SettingsRepository'
import { LogsRepository } from './LogsRepository'
import { DailyGoalsRepository } from './DailyGoalsRepository'
import { InboxRepository } from './InboxRepository'
import { RecurringGoalsRepository } from './RecurringGoalsRepository'
import { TrashArchiveRepository } from './TrashArchiveRepository'

export interface GoalsDirtyCallbacks {
  markDirtyGoalDate: (date: string) => void
  markDirtyInbox: () => void
  markDirtyRecurring: () => void
  markDirtyPurged: () => void
  invalidateMinutesCache?: () => void
}

/**
 * Composite GoalsRepository orchestrating daily goals, inbox, recurring templates, and trash archive.
 */
export class GoalsRepository {
  public daily: DailyGoalsRepository
  public inbox: InboxRepository
  public recurring: RecurringGoalsRepository
  public trash: TrashArchiveRepository
  private settingsRepo: SettingsRepository

  public stmts: DailyGoalsRepository['stmts'] &
    InboxRepository['stmts'] &
    RecurringGoalsRepository['stmts'] &
    TrashArchiveRepository['stmts']

  constructor(
    db: Database.Database,
    settingsRepo: SettingsRepository,
    logsRepo: LogsRepository,
    callbacks?: GoalsDirtyCallbacks
  ) {
    this.settingsRepo = settingsRepo
    this.inbox = new InboxRepository(
      db,
      callbacks ? { markDirtyInbox: callbacks.markDirtyInbox } : undefined,
      () => this.trash.getPurgedIds()
    )

    this.daily = new DailyGoalsRepository(
      db,
      settingsRepo,
      logsRepo,
      callbacks
        ? {
            markDirtyGoalDate: callbacks.markDirtyGoalDate,
            invalidateMinutesCache: callbacks.invalidateMinutesCache
          }
        : undefined,
      this.inbox,
      () => this.trash.getPurgedIds()
    )

    this.recurring = new RecurringGoalsRepository(
      db,
      callbacks
        ? {
            markDirtyRecurring: callbacks.markDirtyRecurring,
            markDirtyGoalDate: callbacks.markDirtyGoalDate
          }
        : undefined,
      () => this.trash.getPurgedIds(),
      (date, includeDeleted) => this.daily.getGoals(date, includeDeleted)
    )

    this.trash = new TrashArchiveRepository(db, logsRepo, callbacks)

    // Aggregate stmts for backward-compatibility with tests and DataManager
    this.stmts = {
      ...this.daily.stmts,
      ...this.inbox.stmts,
      ...this.recurring.stmts,
      ...this.trash.stmts
    }
  }

  // --- Daily Goals Delegation ---

  public upsertGoal(goal: DailyGoal): void {
    this.daily.upsertDailyGoal(goal)
  }

  public getTodayDate(): string {
    const cutoff = this.settingsRepo.getSettings().dayCutoffHour || 0
    return localDateStr(new Date(), cutoff)
  }

  public mapGoalRow(r: DailyGoal & { sortOrder: number | null }): DailyGoal {
    return this.daily.mapGoalRow(r)
  }

  public goalParams(goal: DailyGoal): Record<string, unknown> {
    return this.daily.goalParams(goal)
  }

  public getAllGoalDates(includeDeleted = false): Promise<string[]> {
    return this.daily.getAllGoalDates(includeDeleted)
  }

  public getGoals(date: string, includeDeleted = false): Promise<DailyGoal[]> {
    return this.daily.getGoals(date, includeDeleted)
  }

  public getDayReviewGoals(date: string): Promise<DailyGoal[]> {
    return this.daily.getDayReviewGoals(date)
  }

  public getBoardGoals(todayDate: string): Promise<DailyGoal[]> {
    return this.daily.getBoardGoals(todayDate)
  }

  public getGoalById(goalId: string, includeDeleted = false): Promise<DailyGoal | null> {
    return this.daily.getGoalById(goalId, includeDeleted)
  }

  public getGoalsByIds(goalIds: string[]): Promise<DailyGoal[]> {
    return this.daily.getGoalsByIds(goalIds)
  }

  public setGoals(date: string, goals: DailyGoal[], isSyncApply = false): Promise<void> {
    return this.daily.setGoals(date, goals, isSyncApply)
  }

  public addGoal(
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
    return this.daily.addGoal(
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
  }

  public updateGoal(date: string, goal: DailyGoal): Promise<DailyGoal> {
    return this.daily.updateGoal(date, goal)
  }

  public updateGoals(goals: DailyGoal[]): Promise<DailyGoal[]> {
    return this.daily.updateGoals(goals)
  }

  public deleteGoal(goalId: string): Promise<string | null> {
    return this.daily.deleteGoal(goalId)
  }

  public deleteGoals(goalIds: string[]): Promise<string[]> {
    return this.daily.deleteGoals(goalIds)
  }

  public carryGoal(fromDate: string, toDate: string, goalId: string): Promise<DailyGoal> {
    return this.daily.carryGoal(fromDate, toDate, goalId)
  }

  public carryGoals(fromDate: string, toDate: string, goalIds?: string[]): Promise<DailyGoal[]> {
    return this.daily.carryGoals(fromDate, toDate, goalIds)
  }

  public updateGroupColorAcrossGoals(groupTag: string, groupColor: string): Promise<string[]> {
    return this.daily.updateGroupColorAcrossGoals(groupTag, groupColor)
  }

  public renameGroupAcrossGoals(
    oldTag: string,
    newTag: string,
    groupColor?: string
  ): Promise<string[]> {
    return this.daily.renameGroupAcrossGoals(oldTag, newTag, groupColor)
  }

  public addInboxGoalToToday(
    inboxGoalId: string,
    date: string,
    targetMinutes?: number
  ): Promise<DailyGoal> {
    return this.daily.addInboxGoalToToday(inboxGoalId, date, targetMinutes)
  }

  // --- Inbox Goals Delegation ---

  public inboxParams(item: GoalInboxItem): Record<string, unknown> {
    return this.inbox.inboxParams(item)
  }

  public getInboxGoals(includeDeleted = false): Promise<GoalInboxItem[]> {
    return this.inbox.getInboxGoals(includeDeleted)
  }

  public getInboxGoalById(id: string): Promise<GoalInboxItem | null> {
    return this.inbox.getInboxGoalById(id)
  }

  public setInboxGoals(items: GoalInboxItem[], isSyncApply = false): Promise<void> {
    return this.inbox.setInboxGoals(items, isSyncApply)
  }

  public deleteInboxGoal(id: string): Promise<void> {
    return this.inbox.deleteInboxGoal(id)
  }

  public addInboxGoal(title: string, note?: string): Promise<GoalInboxItem> {
    return this.inbox.addInboxGoal(title, note)
  }

  public updateInboxGoal(item: GoalInboxItem): Promise<GoalInboxItem> {
    return this.inbox.updateInboxGoal(item)
  }

  // --- Recurring Goals Delegation ---

  public recurringParams(goal: RecurringGoal): Record<string, unknown> {
    return this.recurring.recurringParams(goal)
  }

  public getRecurringGoals(includeDeleted = false): Promise<RecurringGoal[]> {
    return this.recurring.getRecurringGoals(includeDeleted)
  }

  public getRecurringGoalById(id: string): Promise<RecurringGoal | null> {
    return this.recurring.getRecurringGoalById(id)
  }

  public setRecurringGoals(goals: RecurringGoal[], isSyncApply = false): Promise<void> {
    return this.recurring.setRecurringGoals(goals, isSyncApply)
  }

  public deleteRecurringGoal(id: string): Promise<void> {
    return this.recurring.deleteRecurringGoal(id)
  }

  public addRecurringGoal(
    title: string,
    targetMinutes: number | undefined,
    startsOn: string,
    endsOn?: string,
    frequency: RecurringFrequency = 'daily'
  ): Promise<RecurringGoal> {
    return this.recurring.addRecurringGoal(title, targetMinutes, startsOn, endsOn, frequency)
  }

  public updateRecurringGoal(goal: RecurringGoal): Promise<RecurringGoal> {
    return this.recurring.updateRecurringGoal(goal)
  }

  public generateTodayGoals(date: string, force = false): Promise<DailyGoal[]> {
    return this.recurring.generateTodayGoals(date, force)
  }

  // --- Trash & Purged Records Delegation ---

  public getDeletedGoals(limit = 100, offset = 0, query?: string): Promise<DailyGoal[]> {
    return this.trash.getDeletedGoals(limit, offset, query)
  }

  public getDeletedGoalsCount(query?: string): Promise<number> {
    return this.trash.getDeletedGoalsCount(query)
  }

  public restoreGoal(goalId: string): Promise<DailyGoal | null> {
    return this.trash.restoreGoal(goalId)
  }

  public restoreGoals(goalIds: string[]): Promise<DailyGoal[]> {
    return this.trash.restoreGoals(goalIds)
  }

  public recalculateEffectiveDates(cutoffHour: number): void {
    this.daily.recalculateEffectiveDates(cutoffHour)
  }

  public hardDeleteGoal(goalId: string): Promise<{ success: boolean; date?: string }> {
    return this.trash.hardDeleteGoal(goalId)
  }

  public emptyTrash(): Promise<{ count: number; affectedDates: string[] }> {
    return this.trash.emptyTrash()
  }

  public getPurgedIds(): Promise<Set<string>> {
    return this.trash.getPurgedIds()
  }

  public getPurgedRecords(): Promise<PurgedRecord[]> {
    return this.trash.getPurgedRecords()
  }

  public setPurgedRecords(records: PurgedRecord[], fromSync = false): Promise<void> {
    return this.trash.setPurgedRecords(records, fromSync)
  }

  public prunePurgedRecordsOlderThan(days = 90): Promise<number> {
    return this.trash.prunePurgedRecordsOlderThan(days)
  }

  public purgeSoftDeletedRecordsOlderThan(days = 30): Promise<{
    logs: number
    inboxGoals: number
    dailyGoals: number
    recurringGoals: number
    prunedTombstones: number
  }> {
    return this.trash.purgeSoftDeletedRecordsOlderThan(days)
  }
}
