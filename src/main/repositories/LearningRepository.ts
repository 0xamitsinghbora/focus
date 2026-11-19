import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import {
  LearningTrack,
  LearningTrackStatus,
  LearningRevisionStatus,
  LearningStage,
  shiftDate
} from '../../shared/types'

export interface LearningDirtyCallbacks {
  markDirtyLearning?: () => void
}

interface LearningTrackRow {
  id: string
  title: string
  originalGoalId: string | null
  originDate: string
  targetMinutes: number | null
  currentStage: number
  status: string
  day1Date: string
  day1Status: string
  day1GoalId: string | null
  day1CompletedAt: string | null
  day7Date: string
  day7Status: string
  day7GoalId: string | null
  day7CompletedAt: string | null
  day30Date: string
  day30Status: string
  day30GoalId: string | null
  day30CompletedAt: string | null
  note?: string | null
  createdAt: string
  updatedAt: string | null
  deletedAt: string | null
}

export class LearningRepository {
  private db: Database.Database
  private callbacks?: LearningDirtyCallbacks

  private stmts: {
    insertTrack: Database.Statement
    updateTrack: Database.Statement
    getTrackById: Database.Statement
    getTrackByOriginalGoalId: Database.Statement
    getActiveTracks: Database.Statement
    getMasteredTracks: Database.Statement
    getAllTracks: Database.Statement
    deleteTrack: Database.Statement
    getPendingRevisions: Database.Statement
    updateStageScheduled: (stage: LearningStage) => Database.Statement
    updateStageCompleted: (stage: LearningStage) => Database.Statement
  }

  constructor(db: Database.Database, callbacks?: LearningDirtyCallbacks) {
    this.db = db
    this.callbacks = callbacks

    this.stmts = {
      insertTrack: this.db.prepare(`
        INSERT INTO learning_tracks (
          id, title, originalGoalId, originDate, targetMinutes, currentStage, status,
          day1Date, day1Status, day1GoalId, day1CompletedAt,
          day7Date, day7Status, day7GoalId, day7CompletedAt,
          day30Date, day30Status, day30GoalId, day30CompletedAt,
          note, createdAt, updatedAt, deletedAt
        )
        VALUES (
          @id, @title, @originalGoalId, @originDate, @targetMinutes, @currentStage, @status,
          @day1Date, @day1Status, @day1GoalId, @day1CompletedAt,
          @day7Date, @day7Status, @day7GoalId, @day7CompletedAt,
          @day30Date, @day30Status, @day30GoalId, @day30CompletedAt,
          @note, @createdAt, @updatedAt, @deletedAt
        )
      `),
      updateTrack: this.db.prepare(`
        UPDATE learning_tracks SET
          title = @title,
          originalGoalId = @originalGoalId,
          originDate = @originDate,
          targetMinutes = @targetMinutes,
          currentStage = @currentStage,
          status = @status,
          day1Date = @day1Date,
          day1Status = @day1Status,
          day1GoalId = @day1GoalId,
          day1CompletedAt = @day1CompletedAt,
          day7Date = @day7Date,
          day7Status = @day7Status,
          day7GoalId = @day7GoalId,
          day7CompletedAt = @day7CompletedAt,
          day30Date = @day30Date,
          day30Status = @day30Status,
          day30GoalId = @day30GoalId,
          day30CompletedAt = @day30CompletedAt,
          note = @note,
          updatedAt = @updatedAt,
          deletedAt = @deletedAt
        WHERE id = @id
      `),
      getTrackById: this.db.prepare(`
        SELECT * FROM learning_tracks WHERE id = ? AND deletedAt IS NULL
      `),
      getTrackByOriginalGoalId: this.db.prepare(`
        SELECT * FROM learning_tracks WHERE originalGoalId = ? AND deletedAt IS NULL LIMIT 1
      `),
      getActiveTracks: this.db.prepare(`
        SELECT * FROM learning_tracks WHERE status = 'active' AND deletedAt IS NULL ORDER BY originDate DESC
      `),
      getMasteredTracks: this.db.prepare(`
        SELECT * FROM learning_tracks WHERE status = 'mastered' AND deletedAt IS NULL ORDER BY updatedAt DESC
      `),
      getAllTracks: this.db.prepare(`
        SELECT * FROM learning_tracks WHERE deletedAt IS NULL ORDER BY originDate DESC
      `),
      deleteTrack: this.db.prepare(`
        UPDATE learning_tracks SET deletedAt = ?, updatedAt = ?, status = 'deleted' WHERE id = ?
      `),
      getPendingRevisions: this.db.prepare(`
        SELECT * FROM learning_tracks
        WHERE deletedAt IS NULL
          AND status = 'active'
          AND (
            (day1Date <= ? AND day1Status = 'pending')
            OR (day7Date <= ? AND day7Status = 'pending' AND day1Status = 'completed')
            OR (day30Date <= ? AND day30Status = 'pending' AND day7Status = 'completed')
          )
        ORDER BY originDate ASC
      `),
      updateStageScheduled: (stage: LearningStage) => {
        const goalCol = stage === 1 ? 'day1GoalId' : stage === 2 ? 'day7GoalId' : 'day30GoalId'
        const statusCol = stage === 1 ? 'day1Status' : stage === 2 ? 'day7Status' : 'day30Status'
        return this.db.prepare(`
          UPDATE learning_tracks
          SET ${statusCol} = 'scheduled', ${goalCol} = ?, updatedAt = ?
          WHERE id = ? AND deletedAt IS NULL
        `)
      },
      updateStageCompleted: (stage: LearningStage) => {
        const statusCol = stage === 1 ? 'day1Status' : stage === 2 ? 'day7Status' : 'day30Status'
        const completedCol =
          stage === 1 ? 'day1CompletedAt' : stage === 2 ? 'day7CompletedAt' : 'day30CompletedAt'
        const nextStage = stage + 1
        const nextStatus = nextStage > 3 ? 'mastered' : 'active'
        return this.db.prepare(`
          UPDATE learning_tracks
          SET ${statusCol} = 'completed',
              ${completedCol} = ?,
              currentStage = ${nextStage},
              status = '${nextStatus}',
              updatedAt = ?
          WHERE id = ? AND deletedAt IS NULL
        `)
      }
    }
  }

  private mapTrackRow(r: LearningTrackRow): LearningTrack {
    return {
      id: r.id,
      title: r.title,
      originalGoalId: r.originalGoalId || undefined,
      originDate: r.originDate,
      targetMinutes: r.targetMinutes != null ? Number(r.targetMinutes) : undefined,
      currentStage: Number(r.currentStage),
      status: r.status as LearningTrackStatus,
      day1Date: r.day1Date,
      day1Status: r.day1Status as LearningRevisionStatus,
      day1GoalId: r.day1GoalId || undefined,
      day1CompletedAt: r.day1CompletedAt || undefined,
      day7Date: r.day7Date,
      day7Status: r.day7Status as LearningRevisionStatus,
      day7GoalId: r.day7GoalId || undefined,
      day7CompletedAt: r.day7CompletedAt || undefined,
      day30Date: r.day30Date,
      day30Status: r.day30Status as LearningRevisionStatus,
      day30GoalId: r.day30GoalId || undefined,
      day30CompletedAt: r.day30CompletedAt || undefined,
      note: r.note || undefined,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt || undefined,
      deletedAt: r.deletedAt || undefined
    }
  }

  private trackParams(track: LearningTrack): Record<string, unknown> {
    return {
      id: track.id,
      title: track.title,
      originalGoalId: track.originalGoalId ?? null,
      originDate: track.originDate,
      targetMinutes: track.targetMinutes ?? null,
      currentStage: track.currentStage,
      status: track.status,
      day1Date: track.day1Date,
      day1Status: track.day1Status,
      day1GoalId: track.day1GoalId ?? null,
      day1CompletedAt: track.day1CompletedAt ?? null,
      day7Date: track.day7Date,
      day7Status: track.day7Status,
      day7GoalId: track.day7GoalId ?? null,
      day7CompletedAt: track.day7CompletedAt ?? null,
      day30Date: track.day30Date,
      day30Status: track.day30Status,
      day30GoalId: track.day30GoalId ?? null,
      day30CompletedAt: track.day30CompletedAt ?? null,
      note: track.note ?? null,
      createdAt: track.createdAt,
      updatedAt: track.updatedAt ?? new Date().toISOString(),
      deletedAt: track.deletedAt ?? null
    }
  }

  public async createTrack(
    title: string,
    originDate: string,
    options?: {
      originalGoalId?: string
      targetMinutes?: number
      note?: string
    }
  ): Promise<LearningTrack> {
    const now = new Date().toISOString()
    const track: LearningTrack = {
      id: randomUUID(),
      title: title.trim(),
      originalGoalId: options?.originalGoalId,
      originDate,
      targetMinutes: options?.targetMinutes,
      currentStage: 1,
      status: 'active',
      day1Date: shiftDate(originDate, 1),
      day1Status: 'pending',
      day7Date: shiftDate(originDate, 7),
      day7Status: 'pending',
      day30Date: shiftDate(originDate, 30),
      day30Status: 'pending',
      note: options?.note?.trim() || undefined,
      createdAt: now,
      updatedAt: now
    }

    this.stmts.insertTrack.run(this.trackParams(track))
    this.callbacks?.markDirtyLearning?.()
    return track
  }

  public async getTrackById(id: string): Promise<LearningTrack | null> {
    const row = this.stmts.getTrackById.get(id) as LearningTrackRow | undefined
    return row ? this.mapTrackRow(row) : null
  }

  public async getTrackByOriginalGoalId(goalId: string): Promise<LearningTrack | null> {
    const row = this.stmts.getTrackByOriginalGoalId.get(goalId) as LearningTrackRow | undefined
    return row ? this.mapTrackRow(row) : null
  }

  public async getTracks(status?: 'active' | 'mastered'): Promise<LearningTrack[]> {
    let rows: LearningTrackRow[]
    if (status === 'active') {
      rows = this.stmts.getActiveTracks.all() as LearningTrackRow[]
    } else if (status === 'mastered') {
      rows = this.stmts.getMasteredTracks.all() as LearningTrackRow[]
    } else {
      rows = this.stmts.getAllTracks.all() as LearningTrackRow[]
    }
    return rows.map((r) => this.mapTrackRow(r))
  }

  public async getPendingRevisions(date: string): Promise<LearningTrack[]> {
    const rows = this.stmts.getPendingRevisions.all(date, date, date) as LearningTrackRow[]
    return rows.map((r) => this.mapTrackRow(r))
  }

  public async updateTrack(track: LearningTrack): Promise<LearningTrack> {
    const updated = {
      ...track,
      updatedAt: new Date().toISOString()
    }
    this.stmts.updateTrack.run(this.trackParams(updated))
    this.callbacks?.markDirtyLearning?.()
    return updated
  }

  public async markStageScheduled(
    trackId: string,
    stage: LearningStage,
    goalId: string
  ): Promise<void> {
    const now = new Date().toISOString()
    this.stmts.updateStageScheduled(stage).run(goalId, now, trackId)
    this.callbacks?.markDirtyLearning?.()
  }

  public async markStageCompleted(
    trackId: string,
    stage: LearningStage,
    completedAt = new Date().toISOString()
  ): Promise<void> {
    const now = new Date().toISOString()
    this.stmts.updateStageCompleted(stage).run(completedAt, now, trackId)
    this.callbacks?.markDirtyLearning?.()
  }

  public async resetStage(trackId: string, stage: LearningStage, newDate: string): Promise<void> {
    const track = await this.getTrackById(trackId)
    if (!track) return

    const now = new Date().toISOString()
    if (stage === 1) {
      track.day1Date = newDate
      track.day1Status = 'pending'
      track.day1GoalId = undefined
      track.day1CompletedAt = undefined
    } else if (stage === 2) {
      track.day7Date = newDate
      track.day7Status = 'pending'
      track.day7GoalId = undefined
      track.day7CompletedAt = undefined
    } else if (stage === 3) {
      track.day30Date = newDate
      track.day30Status = 'pending'
      track.day30GoalId = undefined
      track.day30CompletedAt = undefined
    }
    track.currentStage = stage
    track.status = 'active'
    track.updatedAt = now

    await this.updateTrack(track)
  }

  public async deleteTrack(id: string): Promise<void> {
    const now = new Date().toISOString()
    this.stmts.deleteTrack.run(now, now, id)
    this.callbacks?.markDirtyLearning?.()
  }
}
