import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { DailyGoal, GoalInboxItem, LogEntry, RecurringGoal, SyncTarget } from '../shared/types'

export interface FileManifestEntry {
  fileId?: string
  checksum?: string
  remoteModifiedTime?: string
  localTimestamp: number
}

export interface SyncManifest {
  version: number
  lastSyncedAt: number
  files: Record<string, FileManifestEntry>
  wipedAt?: number
}

export type { SyncTarget }

export function computeChecksum(content: string): string {
  return crypto.createHash('md5').update(content).digest('hex')
}

export function canonicalStringify(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj)
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalStringify).join(',') + ']'
  }
  const keys = Object.keys(obj as Record<string, unknown>).sort()
  return (
    '{' +
    keys
      .map((k) => JSON.stringify(k) + ':' + canonicalStringify((obj as Record<string, unknown>)[k]))
      .join(',') +
    '}'
  )
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 1000
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err: unknown) {
      const errorObj = err as { response?: { status?: number }; code?: string } | undefined
      const status = errorObj?.response?.status ?? errorObj?.code
      const isRetryable =
        status === 429 || status === 503 || status === 'ECONNRESET' || status === 'ETIMEDOUT'
      if (!isRetryable || attempt === maxAttempts) throw err
      const delay = baseDelayMs * Math.pow(2, attempt - 1) + Math.random() * 500
      await new Promise((r) => setTimeout(r, delay))
    }
  }
  throw new Error('Unreachable')
}

export function idSetsDiffer(a: { id: string }[], b: { id: string }[]): boolean {
  if (a.length !== b.length) return true
  const setA = new Set(a.map((x) => x.id))
  for (const item of b) {
    if (!setA.has(item.id)) return true
  }
  return false
}

export function mergedDiffers<T extends { id: string }>(
  merged: T[],
  original: T[],
  lifecycleFn?: (item: T) => number
): boolean {
  if (merged.length !== original.length) return true
  if (!lifecycleFn) return idSetsDiffer(merged, original)
  const origMap = new Map(original.map((o) => [o.id, o]))
  for (const m of merged) {
    const o = origMap.get(m.id)
    if (!o) return true
    if (lifecycleFn(m) !== lifecycleFn(o)) return true
    const mDel = (m as { deletedAt?: string }).deletedAt || undefined
    const oDel = (o as { deletedAt?: string }).deletedAt || undefined
    if (mDel !== oDel) return true
  }
  return false
}

const CLOCK_SKEW_TOLERANCE_MS = 60000

export function shouldIncomingOverwrite<T extends { deletedAt?: string; restoredAt?: string }>(
  incoming: T,
  existing: T,
  getTime: (item: T) => number
): boolean {
  const incomingTime = getTime(incoming)
  const existingTime = getTime(existing)

  // 1. Explicit restoration intent overrides tombstones:
  // If one replica has an explicit restore timestamp that is at or after (or concurrent with) the other's deletion,
  // the restoration intent wins over the tombstone.
  if (incoming.restoredAt && !incoming.deletedAt && existing.deletedAt) {
    const restoredTime = new Date(incoming.restoredAt).getTime()
    const deletedTime = new Date(existing.deletedAt).getTime()
    if (!isNaN(restoredTime) && !isNaN(deletedTime)) {
      if (restoredTime >= deletedTime - CLOCK_SKEW_TOLERANCE_MS) {
        return true
      }
    } else if (incomingTime >= existingTime - CLOCK_SKEW_TOLERANCE_MS) {
      return true
    }
  }

  if (existing.restoredAt && !existing.deletedAt && incoming.deletedAt) {
    const restoredTime = new Date(existing.restoredAt).getTime()
    const deletedTime = new Date(incoming.deletedAt).getTime()
    if (!isNaN(restoredTime) && !isNaN(deletedTime)) {
      if (restoredTime >= deletedTime - CLOCK_SKEW_TOLERANCE_MS) {
        return false
      }
    } else if (existingTime >= incomingTime - CLOCK_SKEW_TOLERANCE_MS) {
      return false
    }
  }

  // 2. Tombstone priority:
  // If one replica is deleted and the other is active (without a newer restoredAt override):
  // - If the deletion timestamp is >= the active update timestamp, the tombstone ALWAYS wins.
  // - If the active update timestamp appears newer due to forward clock skew on the modifying machine,
  //   the tombstone still wins if the divergence is within CLOCK_SKEW_TOLERANCE_MS (60 seconds).
  if (incoming.deletedAt && !existing.deletedAt) {
    if (incomingTime >= existingTime || (existingTime - incomingTime) <= CLOCK_SKEW_TOLERANCE_MS) {
      return true
    }
  }
  if (!incoming.deletedAt && existing.deletedAt) {
    if (existingTime >= incomingTime || (incomingTime - existingTime) <= CLOCK_SKEW_TOLERANCE_MS) {
      return false
    }
  }

  // 3. Strict LWW comparison outside the clock skew window or when deletion status matches
  if (incomingTime > existingTime) return true
  if (incomingTime < existingTime) return false

  // 4. Fallback tie-breaker when lifecycle timestamps match:
  // Tombstone always beats active state
  if (incoming.deletedAt && !existing.deletedAt) return true
  if (!incoming.deletedAt && existing.deletedAt) return false

  // 5. Deterministic content tie-breaker:
  // When timestamps and tombstone statuses match identically, both nodes must converge to the same value
  // regardless of replication direction, object key order, or network arrival sequence.
  const incomingHash = computeChecksum(canonicalStringify(incoming))
  const existingHash = computeChecksum(canonicalStringify(existing))
  return incomingHash > existingHash
}

export function reconcileEntries<T extends { id: string; deletedAt?: string; restoredAt?: string }>(
  localData: T[],
  remoteData: T[],
  getTime: (item: T) => number,
  sortFn?: (a: T, b: T) => number,
  purgedIds?: Set<string>
): T[] {
  const mergedMap = new Map<string, T>()
  localData.forEach((item) => {
    if (purgedIds && purgedIds.has(item.id)) return
    mergedMap.set(item.id, item)
  })
  remoteData.forEach((item) => {
    if (purgedIds && purgedIds.has(item.id)) return
    const existing = mergedMap.get(item.id)
    if (!existing) {
      mergedMap.set(item.id, item)
    } else {
      const incomingWins = shouldIncomingOverwrite(item, existing, getTime)
      const winner = incomingWins ? item : existing
      const loser = incomingWins ? existing : item
      const mergedItem: T = { ...winner }

      // Terminal completion preservation: if one replica marked the task done with completedAt,
      // and neither replica was deleted, preserve the completion over an uncompleted state
      if (
        !winner.deletedAt &&
        !loser.deletedAt &&
        'status' in loser &&
        (loser as Record<string, unknown>).status === 'done' &&
        'status' in winner &&
        (winner as Record<string, unknown>).status !== 'done'
      ) {
        ;(mergedItem as Record<string, unknown>).status = 'done'
        if ((loser as Record<string, unknown>).completedAt) {
          ;(mergedItem as Record<string, unknown>).completedAt = (
            loser as Record<string, unknown>
          ).completedAt
        }
      }

      mergedMap.set(item.id, mergedItem)
    }
  })
  const merged = Array.from(mergedMap.values())
  if (sortFn) {
    merged.sort(sortFn)
  }
  return merged
}

export function lifecycleTime(
  item:
    | GoalInboxItem
    | RecurringGoal
    | DailyGoal
    | { id: string; purgedAt?: string; createdAt?: string }
): number {
  const dates = [
    'createdAt' in item && typeof item.createdAt === 'string' ? item.createdAt : undefined,
    'completedAt' in item && typeof (item as DailyGoal).completedAt === 'string'
      ? (item as DailyGoal).completedAt
      : undefined,
    'pausedAt' in item && typeof (item as RecurringGoal).pausedAt === 'string'
      ? (item as RecurringGoal).pausedAt
      : undefined,
    'deletedAt' in item && typeof item.deletedAt === 'string' ? item.deletedAt : undefined,
    'restoredAt' in item && typeof (item as DailyGoal).restoredAt === 'string'
      ? (item as DailyGoal).restoredAt
      : undefined,
    'purgedAt' in item && typeof (item as { purgedAt?: string }).purgedAt === 'string'
      ? (item as { purgedAt?: string }).purgedAt
      : undefined,
    'updatedAt' in item && typeof (item as DailyGoal).updatedAt === 'string'
      ? (item as DailyGoal).updatedAt
      : undefined
  ].filter((d): d is string => typeof d === 'string' && d.trim().length > 0)
  const timestamps = dates
    .map((d) => new Date(d).getTime())
    .filter((t) => !isNaN(t) && Number.isFinite(t))
  return timestamps.length > 0 ? timestamps.reduce((max, t) => (t > max ? t : max), 0) : 0
}

export function logLifecycleTime(item: LogEntry): number {
  const dates = [item.timestamp, item.updatedAt, item.deletedAt].filter(
    (d): d is string => typeof d === 'string' && d.trim().length > 0
  )
  const timestamps = dates
    .map((d) => new Date(d).getTime())
    .filter((t) => !isNaN(t) && Number.isFinite(t))
  return timestamps.length > 0 ? timestamps.reduce((max, t) => (t > max ? t : max), 0) : 0
}

const fileWriteQueues = new Map<string, Promise<void>>()

async function executeAtomicWriteJson(filePath: string, data: unknown): Promise<void> {
  const content = JSON.stringify(data, null, 2)
  const dir = path.dirname(filePath)
  await fs.promises.mkdir(dir, { recursive: true })
  const tempPath = path.join(
    dir,
    `.focus-atomic-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`
  )
  await fs.promises.writeFile(tempPath, content, 'utf-8')
  try {
    await fs.promises.rename(tempPath, filePath)
  } catch (err: unknown) {
    const error = err as { code?: string }
    if (
      process.platform === 'win32' ||
      error?.code === 'EEXIST' ||
      error?.code === 'EPERM' ||
      error?.code === 'EXDEV'
    ) {
      try {
        await fs.promises.copyFile(tempPath, filePath)
        await fs.promises.unlink(tempPath).catch(() => {})
      } catch {
        // Fallback: direct write if copyFile also failed, but preserve error details
        await fs.promises.writeFile(filePath, content, 'utf-8')
        await fs.promises.unlink(tempPath).catch(() => {})
      }
    } else {
      await fs.promises.unlink(tempPath).catch(() => {})
      throw err
    }
  }
}

export async function atomicWriteJson(filePath: string, data: unknown): Promise<void> {
  const previous = fileWriteQueues.get(filePath) || Promise.resolve()
  const current = previous.then(
    () => executeAtomicWriteJson(filePath, data),
    () => executeAtomicWriteJson(filePath, data)
  )
  fileWriteQueues.set(filePath, current)
  current.finally(() => {
    if (fileWriteQueues.get(filePath) === current) {
      fileWriteQueues.delete(filePath)
    }
  })
  return current
}
