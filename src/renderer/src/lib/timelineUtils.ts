import { LogEntry } from '../../../shared/types'

export function calculateMergedDurationMs(intervals: { startMs: number; endMs: number }[]): number {
  const valid = intervals
    .filter(
      (i) => typeof i.startMs === 'number' && typeof i.endMs === 'number' && i.endMs > i.startMs
    )
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs)

  if (valid.length === 0) return 0

  let totalMs = 0
  let curStart = valid[0].startMs
  let curEnd = valid[0].endMs

  for (let i = 1; i < valid.length; i++) {
    const { startMs, endMs } = valid[i]
    if (startMs <= curEnd) {
      curEnd = Math.max(curEnd, endMs)
    } else {
      totalMs += curEnd - curStart
      curStart = startMs
      curEnd = endMs
    }
  }

  totalMs += curEnd - curStart
  return totalMs
}

const parseLogTime = (iso?: string): number | null => {
  if (!iso) return null
  const t = new Date(iso).getTime()
  return isNaN(t) ? null : t
}

export const getLogTime = (log: LogEntry): { start: number; end: number } => {
  const parsedEnd = parseLogTime(log.endedAt) ?? parseLogTime(log.timestamp) ?? Date.now()
  const parsedStart =
    parseLogTime(log.startedAt) ??
    (log.durationMinutes && log.durationMinutes > 0
      ? parsedEnd - log.durationMinutes * 60000
      : parsedEnd - 60000)

  const start = Math.min(parsedStart, parsedEnd)
  const end = Math.max(parsedStart, parsedEnd)
  return { start, end: Math.max(end, start + 60000) }
}

function getProductiveMinutes(log: LogEntry): number {
  if (log.productivity === 'break') return 0
  if (typeof log.productiveMinutes === 'number') {
    return Math.max(0, Math.round(log.productiveMinutes))
  }
  if (log.productivity === 'productive' || !log.productivity) {
    return Math.max(0, Math.round(log.durationMinutes || 0))
  }
  return 0
}

export function mergeLogs(a: LogEntry, b: LogEntry): LogEntry {
  const timeA = getLogTime(a)
  const timeB = getLogTime(b)
  const startMs = Math.min(timeA.start, timeB.start)
  const endMs = Math.max(timeA.end, timeB.end)

  const spanMinutes = Math.round((endMs - startMs) / 60000)
  const sumDuration = (a.durationMinutes || 0) + (b.durationMinutes || 0)
  const durationMinutes = Math.max(1, sumDuration > 0 ? sumDuration : spanMinutes)

  const prodMinutesA = getProductiveMinutes(a)
  const prodMinutesB = getProductiveMinutes(b)
  const totalProdMinutes = prodMinutesA + prodMinutesB

  const bothBreak = a.productivity === 'break' && b.productivity === 'break'
  const productivity: LogEntry['productivity'] = bothBreak
    ? 'break'
    : totalProdMinutes > 0
      ? 'productive'
      : a.productivity || b.productivity

  // Deduplicate notes cleanly
  const notesSet = new Set<string>()
  if (a.note?.trim()) notesSet.add(a.note.trim())
  if (b.note?.trim()) notesSet.add(b.note.trim())

  let combinedNote: string | undefined
  if (notesSet.size > 0) {
    combinedNote = Array.from(notesSet).join(' · ')
  }

  let combinedText = a.text
  if (b.text && a.text !== b.text && !a.text.includes(b.text)) {
    combinedText = `${a.text} · ${b.text}`
  }

  return {
    ...a,
    id: a.id,
    timestamp: b.timestamp || new Date(endMs).toISOString(),
    text: combinedText,
    startedAt: new Date(startMs).toISOString(),
    endedAt: new Date(endMs).toISOString(),
    goalId: a.goalId || b.goalId,
    goalTitle: a.goalTitle || b.goalTitle,
    note: combinedNote || a.note || b.note,
    productivity,
    durationMinutes,
    productiveMinutes: bothBreak ? undefined : totalProdMinutes > 0 ? totalProdMinutes : undefined
  }
}

/**
 * Automatically clips and splits overlapping tasks and breaks so all timeline activities
 * line up edge-to-edge sequentially on a single line with zero overlap.
 * When a break occurs during a task, the task's endedAt is clipped to the break's start time
 * (or split around the break if work continued afterward).
 */
export function autoClipSequentialLogs(logs: LogEntry[]): LogEntry[] {
  if (!logs || logs.length <= 1) return logs || []

  const isBreakLog = (log: LogEntry): boolean => {
    return log.productivity === 'break' || log.text.trim().toLowerCase() === 'break'
  }

  interface TimeBoundLog {
    log: LogEntry
    startMs: number
    endMs: number
  }

  // 1. Parse all logs into time intervals
  const parsed: TimeBoundLog[] = logs
    .map((log) => {
      const times = getLogTime(log)
      return {
        log,
        startMs: times.start,
        endMs: times.end
      }
    })
    .filter((item) => item.endMs > item.startMs)
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs)

  if (parsed.length <= 1) return parsed.map((p) => p.log)

  // 2. Separate break logs and task logs
  const rawBreaks = parsed.filter((p) => isBreakLog(p.log))
  const rawTasks = parsed.filter((p) => !isBreakLog(p.log))

  // 3. Merge overlapping breaks so breaks form unified contiguous intervals
  const mergedBreaks: TimeBoundLog[] = []
  for (const b of rawBreaks) {
    if (mergedBreaks.length === 0) {
      mergedBreaks.push({ ...b })
    } else {
      const last = mergedBreaks[mergedBreaks.length - 1]
      if (b.startMs <= last.endMs) {
        const newEnd = Math.max(last.endMs, b.endMs)
        const durationMins = Math.max(1, Math.round((newEnd - last.startMs) / 60000))
        last.endMs = newEnd
        last.log = {
          ...last.log,
          startedAt: new Date(last.startMs).toISOString(),
          endedAt: new Date(newEnd).toISOString(),
          timestamp: new Date(newEnd).toISOString(),
          durationMinutes: durationMins,
          productiveMinutes: 0
        }
      } else {
        mergedBreaks.push({ ...b })
      }
    }
  }

  // 4. Clip or split each task around break intervals
  const clippedTasks: TimeBoundLog[] = []
  for (const task of rawTasks) {
    let currentIntervals: { startMs: number; endMs: number }[] = [
      { startMs: task.startMs, endMs: task.endMs }
    ]

    for (const b of mergedBreaks) {
      const nextIntervals: { startMs: number; endMs: number }[] = []
      for (const seg of currentIntervals) {
        const overlapStart = Math.max(seg.startMs, b.startMs)
        const overlapEnd = Math.min(seg.endMs, b.endMs)

        if (overlapStart >= overlapEnd) {
          // No overlap
          nextIntervals.push(seg)
        } else {
          // Break clips or splits segment
          // Left portion before break:
          if (seg.startMs < b.startMs) {
            nextIntervals.push({ startMs: seg.startMs, endMs: b.startMs })
          }
          // Right portion after break:
          if (seg.endMs > b.endMs) {
            nextIntervals.push({ startMs: b.endMs, endMs: seg.endMs })
          }
        }
      }
      currentIntervals = nextIntervals
    }

    // Keep intervals with >= 30 seconds
    const validIntervals = currentIntervals.filter((iv) => iv.endMs - iv.startMs >= 30000)

    for (let i = 0; i < validIntervals.length; i++) {
      const iv = validIntervals[i]
      const durationMinutes = Math.max(1, Math.round((iv.endMs - iv.startMs) / 60000))
      const startIso = new Date(iv.startMs).toISOString()
      const endIso = new Date(iv.endMs).toISOString()

      clippedTasks.push({
        startMs: iv.startMs,
        endMs: iv.endMs,
        log: {
          ...task.log,
          id: i === 0 ? task.log.id : `${task.log.id}-split-${i}`,
          startedAt: startIso,
          endedAt: endIso,
          timestamp: endIso,
          durationMinutes,
          productiveMinutes:
            task.log.productiveMinutes !== undefined
              ? Math.min(task.log.productiveMinutes, durationMinutes)
              : durationMinutes
        }
      })
    }
  }

  // 5. Combine clipped tasks and breaks, then sort by startMs
  const allIntervals = [...clippedTasks, ...mergedBreaks].sort(
    (a, b) => a.startMs - b.startMs || a.endMs - b.endMs
  )

  // 6. Final sequential pass: ensure strictly sequential non-overlapping boundaries
  // If an interval slightly overlaps the next one, clip its endMs to next.startMs
  const finalResult: LogEntry[] = []
  for (let i = 0; i < allIntervals.length; i++) {
    const cur = allIntervals[i]
    const next = i < allIntervals.length - 1 ? allIntervals[i + 1] : undefined

    let curEndMs = cur.endMs
    if (next && curEndMs > next.startMs) {
      curEndMs = next.startMs
    }

    // Only keep if at least 30s
    if (curEndMs - cur.startMs >= 30000) {
      const durationMinutes = Math.max(1, Math.round((curEndMs - cur.startMs) / 60000))
      const endIso = new Date(curEndMs).toISOString()
      const startIso = new Date(cur.startMs).toISOString()
      finalResult.push({
        ...cur.log,
        startedAt: startIso,
        endedAt: endIso,
        timestamp: endIso,
        durationMinutes,
        productiveMinutes:
          cur.log.productivity === 'break'
            ? 0
            : cur.log.productiveMinutes !== undefined
              ? Math.min(cur.log.productiveMinutes, durationMinutes)
              : durationMinutes
      })
    }
  }

  return finalResult
}
