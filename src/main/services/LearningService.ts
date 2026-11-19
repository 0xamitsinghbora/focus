import Database from 'better-sqlite3'
import { DailyGoal, LearningTrack, LearningStage } from '../../shared/types'
import { LearningRepository } from '../repositories/LearningRepository'
import { GoalsRepository } from '../repositories/GoalsRepository'
import { logger } from '../logger'

export class LearningService {
  private db: Database.Database
  private learningRepo: LearningRepository
  private goalsRepo: GoalsRepository

  private stmts: {
    hasGoalForTrackAndStage: Database.Statement
  }

  constructor(db: Database.Database, learningRepo: LearningRepository, goalsRepo: GoalsRepository) {
    this.db = db
    this.learningRepo = learningRepo
    this.goalsRepo = goalsRepo

    this.stmts = {
      hasGoalForTrackAndStage: this.db.prepare(`
        SELECT id FROM daily_goals
        WHERE learningTrackId = ?
          AND learningStage = ?
          AND deletedAt IS NULL
        LIMIT 1
      `)
    }
  }

  /**
   * Called when a goal is updated or added. If a #learning task is marked 'done',
   * triggers the next revision stage or creates a new learning track.
   */
  public async onGoalUpdated(goal: DailyGoal): Promise<void> {
    try {
      const isLearningTag = goal.groupTag?.trim().toLowerCase() === 'learning'
      if (!isLearningTag) return

      if (goal.status === 'done') {
        if (goal.learningTrackId && goal.learningStage) {
          // Completed a revision goal
          await this.learningRepo.markStageCompleted(
            goal.learningTrackId,
            goal.learningStage,
            goal.completedAt || new Date().toISOString()
          )
        } else if (!goal.learningTrackId) {
          // Completed initial study goal
          const existingTrack = await this.learningRepo.getTrackByOriginalGoalId(goal.id)
          if (!existingTrack) {
            // Strip any leading "#learning" or "learning" from title if needed for clean track title
            const cleanTitle = goal.title.replace(/#learning/gi, '').trim() || goal.title
            await this.learningRepo.createTrack(cleanTitle, goal.date, {
              originalGoalId: goal.id,
              targetMinutes: goal.targetMinutes,
              note: goal.note
            })
          }
        }
      }
    } catch (err) {
      logger.error('learning', 'error in onGoalUpdated', err)
    }
  }

  /**
   * Scans for pending revisions due on or before `date` and materializes them
   * as planned DailyGoals with appropriate R-Y-G colors and stage badges.
   */
  public async materializeRevisionsForDate(date: string): Promise<DailyGoal[]> {
    const materialized: DailyGoal[] = []
    try {
      const pendingTracks = await this.learningRepo.getPendingRevisions(date)

      for (const track of pendingTracks) {
        let stage: LearningStage | null = null

        if (track.day1Date <= date && track.day1Status === 'pending') {
          stage = 1
        } else if (
          track.day7Date <= date &&
          track.day7Status === 'pending' &&
          track.day1Status === 'completed'
        ) {
          stage = 2
        } else if (
          track.day30Date <= date &&
          track.day30Status === 'pending' &&
          track.day7Status === 'completed'
        ) {
          stage = 3
        }

        if (!stage) continue

        // Check if a goal already exists for this track & stage
        const existing = this.stmts.hasGoalForTrackAndStage.get(track.id, stage) as
          { id: string } | undefined
        if (existing) {
          // Track is already scheduled
          continue
        }

        // Auto-scale target minutes to ~50% of original, default 20m
        const targetMinutes = track.targetMinutes
          ? Math.max(5, Math.round(track.targetMinutes * 0.5))
          : 20

        // Determine R-Y-G color
        const groupColor =
          stage === 1 ? 'learning-red' : stage === 2 ? 'learning-yellow' : 'learning-green'

        // Determine title
        const baseTitle = track.title.trim()
        const title = baseTitle.toLowerCase().startsWith('revise:')
          ? baseTitle
          : `Revise: ${baseTitle}`

        const revisionGoal = await this.goalsRepo.addGoal(
          date,
          title,
          targetMinutes,
          undefined, // source
          undefined, // deadline
          track.note,
          undefined, // remindAt
          undefined, // repeat
          'learning',
          groupColor,
          undefined, // sortOrder
          'planned',
          track.id,
          stage
        )

        await this.learningRepo.markStageScheduled(track.id, stage, revisionGoal.id)
        materialized.push(revisionGoal)
      }
    } catch (err) {
      logger.error('learning', 'error materializing revisions', err)
    }
    return materialized
  }

  public async getTracks(status?: 'active' | 'mastered'): Promise<LearningTrack[]> {
    return this.learningRepo.getTracks(status)
  }

  public async resetStage(trackId: string, stage: LearningStage, newDate: string): Promise<void> {
    return this.learningRepo.resetStage(trackId, stage, newDate)
  }

  public async deleteTrack(trackId: string): Promise<void> {
    return this.learningRepo.deleteTrack(trackId)
  }
}
