import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import {
  computeChecksum,
  canonicalStringify,
  idSetsDiffer,
  mergedDiffers,
  shouldIncomingOverwrite,
  reconcileEntries,
  lifecycleTime,
  atomicWriteJson
} from '../syncUtils'
import { DailyGoal } from '../../shared/types'

describe('syncUtils Module', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = path.join(
      os.tmpdir(),
      `focus-sync-utils-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    )
    fs.mkdirSync(tempDir, { recursive: true })
  })

  afterEach(() => {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true })
      }
    } catch {
      // ignore
    }
  })

  describe('computeChecksum', () => {
    it('generates consistent md5 hex digest for content', () => {
      const hash1 = computeChecksum('{"foo":"bar"}')
      const hash2 = computeChecksum('{"foo":"bar"}')
      const hash3 = computeChecksum('{"foo":"baz"}')

      expect(hash1).toBe(hash2)
      expect(hash1).not.toBe(hash3)
      expect(hash1).toMatch(/^[a-f0-9]{32}$/)
    })

    it('canonicalStringify produces identical output regardless of object key order', () => {
      const objA = { z: 1, a: 'test', m: { b: 2, a: 1 } }
      const objB = { a: 'test', m: { a: 1, b: 2 }, z: 1 }

      expect(canonicalStringify(objA)).toBe(canonicalStringify(objB))
      expect(computeChecksum(canonicalStringify(objA))).toBe(
        computeChecksum(canonicalStringify(objB))
      )
    })
  })

  describe('idSetsDiffer', () => {
    it('returns false for matching id sets in any order', () => {
      expect(idSetsDiffer([{ id: '1' }, { id: '2' }], [{ id: '2' }, { id: '1' }])).toBe(false)
    })

    it('returns true if lengths differ or ids differ', () => {
      expect(idSetsDiffer([{ id: '1' }], [{ id: '1' }, { id: '2' }])).toBe(true)
      expect(idSetsDiffer([{ id: '1' }, { id: '3' }], [{ id: '1' }, { id: '2' }])).toBe(true)
    })
  })

  describe('mergedDiffers', () => {
    it('detects length differences and missing items', () => {
      expect(mergedDiffers([{ id: '1' }], [{ id: '1' }, { id: '2' }])).toBe(true)
      expect(mergedDiffers([{ id: '1' }], [{ id: '1' }])).toBe(false)
    })

    it('uses lifecycleFn and deletedAt to detect changes', () => {
      const itemA = {
        id: '1',
        updatedAt: '2026-01-01T10:00:00Z',
        deletedAt: undefined as string | undefined
      }
      const itemB = {
        id: '1',
        updatedAt: '2026-01-01T12:00:00Z',
        deletedAt: undefined as string | undefined
      }
      const itemC = {
        id: '1',
        updatedAt: '2026-01-01T10:00:00Z',
        deletedAt: '2026-01-01T12:00:00Z' as string | undefined
      }

      const getLifecycle = (x: typeof itemA) => new Date(x.updatedAt).getTime()

      expect(mergedDiffers([itemB], [itemA], getLifecycle)).toBe(true)
      expect(mergedDiffers([itemC], [itemA], getLifecycle)).toBe(true)
      expect(mergedDiffers([itemA], [itemA], getLifecycle)).toBe(false)
    })
  })

  describe('shouldIncomingOverwrite & LWW Clock Skew Mitigation', () => {
    const getTime = (item: { updatedAt?: string; deletedAt?: string }) => {
      const dates = [item.updatedAt, item.deletedAt].filter(Boolean) as string[]
      return dates.length > 0 ? Math.max(...dates.map((d) => new Date(d).getTime())) : 0
    }

    it('allows newer incoming entry to overwrite older existing entry', () => {
      const existing = { id: '1', title: 'Old', updatedAt: '2026-01-01T10:00:00Z' }
      const incoming = { id: '1', title: 'New', updatedAt: '2026-01-01T10:05:00Z' }

      expect(shouldIncomingOverwrite(incoming, existing, getTime)).toBe(true)
    })

    it('rejects older incoming entry when existing is newer', () => {
      const existing = { id: '1', title: 'New', updatedAt: '2026-01-01T10:05:00Z' }
      const incoming = { id: '1', title: 'Old', updatedAt: '2026-01-01T10:00:00Z' }

      expect(shouldIncomingOverwrite(incoming, existing, getTime)).toBe(false)
    })

    it('prioritizes incoming tombstone over existing active task within clock skew tolerance window', () => {
      // Incoming device deleted the task, but incoming device clock was 2 seconds behind existing device
      const existing = { id: '1', title: 'Active Task', updatedAt: '2026-01-01T12:00:02.000Z' }
      const incoming = {
        id: '1',
        title: 'Active Task',
        deletedAt: '2026-01-01T12:00:00.000Z' // 2 seconds earlier due to clock skew
      }

      expect(shouldIncomingOverwrite(incoming, existing, getTime)).toBe(true)
    })

    it('preserves existing tombstone against active task within clock skew tolerance window', () => {
      // Existing device already has tombstone, incoming device sent active task with slight clock ahead (+2s)
      const existing = {
        id: '1',
        title: 'Task',
        deletedAt: '2026-01-01T12:00:00.000Z'
      }
      const incoming = {
        id: '1',
        title: 'Task',
        updatedAt: '2026-01-01T12:00:02.000Z' // 2s ahead
      }

      expect(shouldIncomingOverwrite(incoming, existing, getTime)).toBe(false)
    })

    it('honors tombstone priority and prevents resurrection when modifying machine clock is skewed forward by 8-10s (beyond 5s)', () => {
      // Device A deleted at 10:00:00. Device B modified at 10:00:08 (skewed clock).
      // On Device A (existing=tombstone, incoming=active 8s ahead)
      const existingA = { id: '1', title: 'Task', deletedAt: '2026-01-01T10:00:00.000Z' }
      const incomingB = { id: '1', title: 'Task', updatedAt: '2026-01-01T10:00:08.000Z' }
      expect(shouldIncomingOverwrite(incomingB, existingA, getTime)).toBe(false)

      // On Device B (existing=active 8s ahead, incoming=tombstone)
      expect(shouldIncomingOverwrite(existingA, incomingB, getTime)).toBe(true)
    })

    it('always honors tombstone when deleted_at >= updated_at regardless of elapsed time', () => {
      // Device A deleted at 10:05:00. Device B last updated at 10:00:00 (5 minutes earlier).
      const tombstone = { id: '1', title: 'Task', deletedAt: '2026-01-01T10:05:00.000Z' }
      const olderActive = { id: '1', title: 'Task', updatedAt: '2026-01-01T10:00:00.000Z' }

      // Incoming tombstone must overwrite older active
      expect(shouldIncomingOverwrite(tombstone, olderActive, getTime)).toBe(true)
      // Older active must never overwrite existing tombstone
      expect(shouldIncomingOverwrite(olderActive, tombstone, getTime)).toBe(false)
    })

    it('allows incoming restored item within clock skew tolerance to overwrite existing tombstone', () => {
      const existing = {
        id: '1',
        title: 'Task',
        deletedAt: '2026-01-01T12:00:00.000Z'
      }
      const incoming = {
        id: '1',
        title: 'Task',
        updatedAt: '2026-01-01T12:00:02.000Z',
        restoredAt: '2026-01-01T12:00:02.000Z' // Restored 2 seconds after deletion (within 5s clock skew)
      }

      expect(shouldIncomingOverwrite(incoming, existing, getTime)).toBe(true)
    })

    it('preserves existing restored item within clock skew tolerance against incoming older tombstone', () => {
      const existing = {
        id: '1',
        title: 'Task',
        updatedAt: '2026-01-01T12:00:02.000Z',
        restoredAt: '2026-01-01T12:00:02.000Z'
      }
      const incoming = {
        id: '1',
        title: 'Task',
        deletedAt: '2026-01-01T12:00:00.000Z'
      }

      expect(shouldIncomingOverwrite(incoming, existing, getTime)).toBe(false)
    })

    it('allows resurrection if incoming active task timestamp is well beyond clock skew tolerance', () => {
      const existing = {
        id: '1',
        title: 'Task',
        deletedAt: '2026-01-01T12:00:00.000Z'
      }
      const incoming = {
        id: '1',
        title: 'Resurrected Task',
        updatedAt: '2026-01-01T13:00:00.000Z' // 1 hour later
      }

      expect(shouldIncomingOverwrite(incoming, existing, getTime)).toBe(true)
    })

    it('resolves ties deterministically so both replicas converge to the same state', () => {
      const replicaA = { id: '1', title: 'Alpha', updatedAt: '2026-01-01T12:00:00.000Z' }
      const replicaB = { id: '1', title: 'Beta', updatedAt: '2026-01-01T12:00:00.000Z' }

      const aOverwritesB = shouldIncomingOverwrite(replicaA, replicaB, getTime)
      const bOverwritesA = shouldIncomingOverwrite(replicaB, replicaA, getTime)

      // Exactly one must be true and the other false, guaranteeing convergence
      expect(aOverwritesB !== bOverwritesA).toBe(true)

      // Test with reconcileEntries
      const listMergedFromA = reconcileEntries([replicaA], [replicaB], getTime)
      const listMergedFromB = reconcileEntries([replicaB], [replicaA], getTime)

      expect(listMergedFromA[0].title).toBe(listMergedFromB[0].title)
    })
  })

  describe('reconcileEntries', () => {
    it('merges non-overlapping and overlapping records correctly', () => {
      const local: DailyGoal[] = [
        {
          id: '1',
          title: 'Goal 1',
          status: 'planned',
          date: '2026-01-01',
          createdAt: '2026-01-01T10:00:00Z'
        },
        {
          id: '2',
          title: 'Goal 2 Local',
          status: 'planned',
          date: '2026-01-01',
          createdAt: '2026-01-01T10:00:00Z',
          updatedAt: '2026-01-01T10:10:00Z'
        }
      ]
      const remote: DailyGoal[] = [
        {
          id: '2',
          title: 'Goal 2 Remote Newer',
          status: 'done',
          completedAt: '2026-01-01T10:15:00Z',
          date: '2026-01-01',
          createdAt: '2026-01-01T10:00:00Z',
          updatedAt: '2026-01-01T10:15:00Z'
        },
        {
          id: '3',
          title: 'Goal 3 Remote',
          status: 'planned',
          date: '2026-01-01',
          createdAt: '2026-01-01T10:00:00Z'
        }
      ]

      const merged = reconcileEntries(local, remote, lifecycleTime)
      expect(merged).toHaveLength(3)

      const g2 = merged.find((g) => g.id === '2')
      expect(g2?.title).toBe('Goal 2 Remote Newer')
      expect(g2?.status).toBe('done')

      const g3 = merged.find((g) => g.id === '3')
      expect(g3?.title).toBe('Goal 3 Remote')
    })

    it('does NOT resurrect intentionally cleared fields from the older loser entry', () => {
      const olderLocal: DailyGoal = {
        id: '1',
        title: 'Task with note',
        note: 'Important note to clear',
        deadline: '2026-01-01T15:00:00Z',
        groupTag: 'Work',
        status: 'planned',
        date: '2026-01-01',
        createdAt: '2026-01-01T10:00:00Z',
        updatedAt: '2026-01-01T10:00:00Z'
      }

      const newerRemote: DailyGoal = {
        id: '1',
        title: 'Task with note cleared',
        note: undefined, // Intentionally cleared
        deadline: undefined, // Intentionally cleared
        groupTag: undefined, // Intentionally cleared
        status: 'planned',
        date: '2026-01-01',
        createdAt: '2026-01-01T10:00:00Z',
        updatedAt: '2026-01-01T11:00:00Z' // 1 hour newer
      }

      const merged = reconcileEntries([olderLocal], [newerRemote], lifecycleTime)
      expect(merged).toHaveLength(1)
      expect(merged[0].title).toBe('Task with note cleared')
      expect(merged[0].note).toBeUndefined()
      expect(merged[0].deadline).toBeUndefined()
      expect(merged[0].groupTag).toBeUndefined()
    })

    it('preserves terminal completion status against rebalanced sortOrder updates from other replicas', () => {
      const completedTask: DailyGoal = {
        id: '1',
        title: 'Complete important feature',
        status: 'done',
        completedAt: '2026-01-01T12:00:00Z',
        date: '2026-01-01',
        createdAt: '2026-01-01T10:00:00Z',
        updatedAt: '2026-01-01T12:00:00Z'
      }

      const rebalancedSortOrderTask: DailyGoal = {
        id: '1',
        title: 'Complete important feature',
        status: 'planned',
        sortOrder: 2500,
        date: '2026-01-01',
        createdAt: '2026-01-01T10:00:00Z',
        updatedAt: '2026-01-01T12:05:00Z' // 5 minutes newer from rebalance
      }

      const merged = reconcileEntries([completedTask], [rebalancedSortOrderTask], lifecycleTime)
      expect(merged).toHaveLength(1)
      expect(merged[0].status).toBe('done')
      expect(merged[0].completedAt).toBe('2026-01-01T12:00:00Z')
      expect(merged[0].sortOrder).toBe(2500)
    })

    it('filters out purged ids from both local and remote during reconciliation', () => {
      const getSampleTime = (item: { updatedAt?: string }) =>
        item.updatedAt ? new Date(item.updatedAt).getTime() : 0
      const local = [
        { id: '1', title: 'Task 1', updatedAt: '2026-01-01T10:00:00.000Z' },
        { id: '2', title: 'Task 2 (purged locally)', updatedAt: '2026-01-01T10:00:00.000Z' }
      ]
      const remote = [
        {
          id: '2',
          title: 'Task 2 (purged remote duplicate)',
          updatedAt: '2026-01-01T10:00:00.000Z'
        },
        {
          id: '3',
          title: 'Task 3 (purged on another peer)',
          updatedAt: '2026-01-01T10:00:00.000Z'
        },
        { id: '4', title: 'Task 4 (active keep)', updatedAt: '2026-01-01T10:00:00.000Z' }
      ]
      const purged = new Set(['2', '3'])
      const merged = reconcileEntries(local, remote, getSampleTime, undefined, purged)
      expect(merged.map((m) => m.id)).toEqual(['1', '4'])
    })
  })

  describe('atomicWriteJson', () => {
    it('writes json to disk and replaces atomically without leaving temp files', async () => {
      const targetFile = path.join(tempDir, 'data.json')
      await atomicWriteJson(targetFile, { test: 123 })

      expect(fs.existsSync(targetFile)).toBe(true)
      const parsed = JSON.parse(fs.readFileSync(targetFile, 'utf-8'))
      expect(parsed).toEqual({ test: 123 })

      // Overwrite again
      await atomicWriteJson(targetFile, { test: 456 })
      const updated = JSON.parse(fs.readFileSync(targetFile, 'utf-8'))
      expect(updated).toEqual({ test: 456 })

      const files = fs.readdirSync(tempDir)
      expect(files).toEqual(['data.json'])
    })
  })
})
