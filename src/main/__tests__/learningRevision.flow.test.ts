import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import os from 'os'
import path from 'path'
import fs from 'fs'
import { DataManager } from '../dataManager'
import { parseTaskShorthand } from '../../renderer/src/lib/taskShorthand'
import { DailyGoal } from '../../shared/types'

describe('End-to-End #learning Spaced Repetition Revision Flow', () => {
  let dbPath: string
  let testDir: string
  let dataManager: DataManager

  beforeEach(() => {
    testDir = path.join(
      os.tmpdir(),
      `focus-learning-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`
    )
    fs.mkdirSync(testDir, { recursive: true })
    dbPath = path.join(testDir, 'focus.db')

    dataManager = new DataManager(dbPath)
  })

  afterEach(async () => {
    if (dataManager) {
      dataManager.close()
    }
    try {
      fs.rmSync(testDir, { recursive: true, force: true })
    } catch {}
  })

  it('executes full end-to-end lifecycle: creation -> Day 1 (Red) -> Day 7 (Yellow) -> Day 30 (Green) -> Mastery', async () => {
    const day0 = '2026-11-20'

    // 1. User inputs shorthand task in UI
    const inputTitle = 'Read Raft consensus paper #learning ~60m'
    const { cleanTitle, parsedMinutes, parsedTag } = parseTaskShorthand(inputTitle)
    expect(cleanTitle).toBe('Read Raft consensus paper')
    expect(parsedMinutes).toBe(60)
    expect(parsedTag).toBe('learning')

    // 2. Task added to Day 0
    const initialGoal = await dataManager.addGoal(
      day0,
      cleanTitle,
      parsedMinutes,
      undefined,
      undefined,
      'Understand leader election, term numbers, and log replication safety',
      undefined,
      undefined,
      parsedTag,
      undefined,
      1000,
      'planned'
    )
    expect(initialGoal.groupTag).toBe('learning')
    expect(initialGoal.status).toBe('planned')

    // 3. User works on and finishes the Day 0 task -> moves to 'done'
    const completedGoal: DailyGoal = {
      ...initialGoal,
      status: 'done',
      completedAt: `${day0}T18:00:00.000Z`
    }
    await dataManager.updateGoal(day0, completedGoal)

    // Verify learning track is automatically generated in database
    const tracks = await dataManager.learningService.getTracks('active')
    expect(tracks).toHaveLength(1)
    const track = tracks[0]
    expect(track.title).toBe('Read Raft consensus paper')
    expect(track.originalGoalId).toBe(initialGoal.id)
    expect(track.originDate).toBe(day0)
    expect(track.day1Date).toBe('2026-11-21') // Day +1
    expect(track.day7Date).toBe('2026-11-27') // Day +7
    expect(track.day30Date).toBe('2026-12-20') // Day +30
    expect(track.currentStage).toBe(1)
    expect(track.day1Status).toBe('pending')

    // 4. Day 1 arrives (2026-11-21) -> Focus queries Day 1 goals
    const day1 = '2026-11-21'
    const day1Goals = await dataManager.getGoals(day1)
    expect(day1Goals).toHaveLength(1)
    const day1Revision = day1Goals[0]
    expect(day1Revision.title).toBe('Revise: Read Raft consensus paper')
    expect(day1Revision.learningTrackId).toBe(track.id)
    expect(day1Revision.learningStage).toBe(1)
    expect(day1Revision.groupColor).toBe('learning-red') // R of R-Y-G
    expect(day1Revision.targetMinutes).toBe(30) // 50% of 60m
    expect(day1Revision.status).toBe('planned')

    // Complete Day 1 revision
    const day1Done: DailyGoal = {
      ...day1Revision,
      status: 'done',
      completedAt: `${day1}T10:00:00.000Z`
    }
    await dataManager.updateGoal(day1, day1Done)

    const trackAfterDay1 = await dataManager.learningRepo.getTrackById(track.id)
    expect(trackAfterDay1?.day1Status).toBe('completed')
    expect(trackAfterDay1?.currentStage).toBe(2)

    // 5. Day 7 arrives (2026-11-27) -> Focus queries Day 7 goals
    const day7 = '2026-11-27'
    const day7Goals = await dataManager.getGoals(day7)
    expect(day7Goals).toHaveLength(1)
    const day7Revision = day7Goals[0]
    expect(day7Revision.title).toBe('Revise: Read Raft consensus paper')
    expect(day7Revision.learningTrackId).toBe(track.id)
    expect(day7Revision.learningStage).toBe(2)
    expect(day7Revision.groupColor).toBe('learning-yellow') // Y of R-Y-G
    expect(day7Revision.targetMinutes).toBe(30)
    expect(day7Revision.status).toBe('planned')

    // Complete Day 7 revision
    const day7Done: DailyGoal = {
      ...day7Revision,
      status: 'done',
      completedAt: `${day7}T11:00:00.000Z`
    }
    await dataManager.updateGoal(day7, day7Done)

    const trackAfterDay7 = await dataManager.learningRepo.getTrackById(track.id)
    expect(trackAfterDay7?.day7Status).toBe('completed')
    expect(trackAfterDay7?.currentStage).toBe(3)

    // 6. Day 30 arrives (2026-12-20) -> Focus queries Day 30 goals
    const day30 = '2026-12-20'
    const day30Goals = await dataManager.getGoals(day30)
    expect(day30Goals).toHaveLength(1)
    const day30Revision = day30Goals[0]
    expect(day30Revision.title).toBe('Revise: Read Raft consensus paper')
    expect(day30Revision.learningTrackId).toBe(track.id)
    expect(day30Revision.learningStage).toBe(3)
    expect(day30Revision.groupColor).toBe('learning-green') // G of R-Y-G
    expect(day30Revision.targetMinutes).toBe(30)
    expect(day30Revision.status).toBe('planned')

    // Complete Day 30 revision -> Mastered!
    const day30Done: DailyGoal = {
      ...day30Revision,
      status: 'done',
      completedAt: `${day30}T14:00:00.000Z`
    }
    await dataManager.updateGoal(day30, day30Done)

    const finalTrack = await dataManager.learningRepo.getTrackById(track.id)
    expect(finalTrack?.day30Status).toBe('completed')
    expect(finalTrack?.currentStage).toBe(4)
    expect(finalTrack?.status).toBe('mastered')

    // Mastered track does not schedule further revisions
    const laterDate = '2026-12-25'
    const laterGoals = await dataManager.getGoals(laterDate)
    expect(laterGoals).toHaveLength(0)
  })

  it('safely carries forward overdue revision tasks without breaking learning progression', async () => {
    const origin = '2026-11-01'
    const track = await dataManager.learningRepo.createTrack('Docker Swarm internals', origin, {
      targetMinutes: 40
    })

    // Materialize Day 1 on 2026-11-02
    const day1 = '2026-11-02'
    const goalsDay1 = await dataManager.getGoals(day1)
    expect(goalsDay1).toHaveLength(1)
    const rev1 = goalsDay1[0]
    expect(rev1.learningStage).toBe(1)
    expect(rev1.groupColor).toBe('learning-red')

    // User missed Day 1, carries it to Day 2 (2026-11-03)
    const day2 = '2026-11-03'
    const carried = await dataManager.carryGoal(day1, day2, rev1.id)
    expect(carried.learningTrackId).toBe(track.id)
    expect(carried.learningStage).toBe(1)
    expect(carried.groupColor).toBe('learning-red')

    // User completes carried goal on day 2
    const carriedCompleted: DailyGoal = {
      ...carried,
      status: 'done',
      completedAt: `${day2}T12:00:00.000Z`
    }
    await dataManager.updateGoal(day2, carriedCompleted)

    const trackUpdated = await dataManager.learningRepo.getTrackById(track.id)
    expect(trackUpdated?.day1Status).toBe('completed')
    expect(trackUpdated?.currentStage).toBe(2)
  })
})
