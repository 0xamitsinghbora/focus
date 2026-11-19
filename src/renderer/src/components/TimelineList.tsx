import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { LogEntry, DailyGoal } from '../../../shared/types'
import { getLogTime, mergeLogs, autoClipSequentialLogs } from '../lib/timelineUtils'
import { TimelineBar } from './TimelineBar'
import { TimelineSessionCard } from './TimelineSessionCard'

function isSameTask(a: LogEntry, b: LogEntry): boolean {
  // 1. Productivity level must match
  const prodA = a.productivity || 'productive'
  const prodB = b.productivity || 'productive'
  if (prodA !== prodB) return false

  // 2. Goal identity
  if (a.goalId || b.goalId) {
    if (a.goalId !== b.goalId) return false
  } else {
    // Match on goalTitle or text
    const titleA = (a.goalTitle || a.text || '').trim().toLowerCase()
    const titleB = (b.goalTitle || b.text || '').trim().toLowerCase()
    if (titleA !== titleB) return false
  }

  // 3. Time adjacency: must be contiguous
  const timeA = getLogTime(a)
  const timeB = getLogTime(b)
  const gap = timeB.start - timeA.end

  // Contiguous if gap is between -2 mins (overlap) and +2 mins (slight pause)
  if (gap < -120000 || gap > 120000) return false

  return true
}

export interface TimelineListProps {
  logs: LogEntry[]
  goals?: DailyGoal[]
  emptyMessage?: string
  emptySubtitle?: string
  onOpenQuickLog?: () => void
  showTimelineBar?: boolean
}

const ESTIMATED_ITEM_HEIGHT = 80
const OVERSCAN = 6

export const TimelineList = React.memo(function TimelineList({
  logs,
  goals,
  emptyMessage = 'No logs available',
  emptySubtitle,
  onOpenQuickLog,
  showTimelineBar = true
}: TimelineListProps): React.JSX.Element {
  const [activeLogId, setActiveLogId] = useState<string | null>(null)
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [containerHeight, setContainerHeight] = useState(600)

  // Track container height via ResizeObserver for accurate window bounds
  useEffect(() => {
    const el = containerRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.height > 0) {
          setContainerHeight(entry.contentRect.height)
        }
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop)
  }, [])

  // Automatically combine consecutive entries of the same task and auto-clip overlaps
  const combinedLogs = useMemo(() => {
    if (logs.length === 0) return []

    const sequential = autoClipSequentialLogs(logs)
    const sorted = [...sequential].sort((a, b) => {
      const tA = getLogTime(a).start
      const tB = getLogTime(b).start
      return tA - tB
    })

    const result: LogEntry[] = []

    for (const log of sorted) {
      if (result.length === 0) {
        result.push(log)
        continue
      }

      const last = result[result.length - 1]
      if (isSameTask(last, log)) {
        result[result.length - 1] = mergeLogs(last, log)
      } else {
        result.push(log)
      }
    }

    return result
  }, [logs])

  const handleSelectLog = useCallback(
    (id: string): void => {
      setActiveLogId(id)
      const el = cardRefs.current[id]
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      } else {
        const index = combinedLogs.findIndex((l) => l.id === id)
        if (index >= 0 && containerRef.current) {
          containerRef.current.scrollTo({
            top: index * ESTIMATED_ITEM_HEIGHT,
            behavior: 'smooth'
          })
        }
      }
    },
    [combinedLogs]
  )

  const handleHoverLog = useCallback((id: string | null) => {
    setActiveLogId(id)
  }, [])

  const isVirtualized = combinedLogs.length > 25
  const { visibleLogs, topSpacerHeight, bottomSpacerHeight } = useMemo(() => {
    if (!isVirtualized) {
      return {
        visibleLogs: combinedLogs.map((log, index) => ({ log, index })),
        topSpacerHeight: 0,
        bottomSpacerHeight: 0
      }
    }
    const totalCount = combinedLogs.length
    const rawStartIndex = Math.floor(scrollTop / ESTIMATED_ITEM_HEIGHT)
    const startIndex = Math.max(0, rawStartIndex - OVERSCAN)
    const rawEndIndex = Math.ceil((scrollTop + containerHeight) / ESTIMATED_ITEM_HEIGHT)
    const endIndex = Math.min(totalCount, rawEndIndex + OVERSCAN)

    const topSpacer = startIndex * ESTIMATED_ITEM_HEIGHT
    const bottomSpacer = Math.max(0, (totalCount - endIndex) * ESTIMATED_ITEM_HEIGHT)

    const slice = combinedLogs.slice(startIndex, endIndex).map((log, i) => ({
      log,
      index: startIndex + i
    }))

    return {
      visibleLogs: slice,
      topSpacerHeight: topSpacer,
      bottomSpacerHeight: bottomSpacer
    }
  }, [combinedLogs, isVirtualized, scrollTop, containerHeight])

  if (combinedLogs.length === 0) {
    return (
      <div className="h-full min-h-[160px] flex flex-col items-center justify-center text-center gap-2 px-4 py-8 select-none">
        <div className="h-9 w-9 rounded-2xl bg-surface border border-border/70 flex items-center justify-center text-muted-foreground/60 shadow-2xs">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        </div>
        <div>
          <span className="text-[13px] font-semibold text-foreground/85 block">{emptyMessage}</span>
          <span className="text-[11px] text-muted-foreground/75 block mt-0.5 max-w-[280px]">
            {emptySubtitle ||
              'Focus sessions appear here chronologically as you focus on your tasks.'}
          </span>
        </div>
        {onOpenQuickLog && (
          <button
            type="button"
            onClick={onOpenQuickLog}
            className="mt-1 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11.5px] font-medium border border-border/80 bg-surface hover:bg-secondary text-foreground shadow-2xs active:scale-95 transition-all cursor-pointer"
          >
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>Record Session Manually</span>
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {showTimelineBar && (
        <TimelineBar
          logs={combinedLogs}
          goals={goals}
          activeLogId={activeLogId}
          onHoverLog={setActiveLogId}
          onSelectLog={handleSelectLog}
        />
      )}

      <div
        ref={containerRef}
        onScroll={isVirtualized ? handleScroll : undefined}
        role="list"
        aria-label="Timeline sessions"
        className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 py-3 space-y-2"
      >
        {topSpacerHeight > 0 && (
          <div aria-hidden="true" style={{ height: `${topSpacerHeight}px` }} />
        )}

        {visibleLogs.map(({ log, index }) => (
          <TimelineSessionCard
            key={log.id}
            log={log}
            goals={goals}
            isSelected={activeLogId === log.id}
            isFirst={index === 0}
            prevLog={index > 0 ? combinedLogs[index - 1] : null}
            onSelect={handleSelectLog}
            onHover={handleHoverLog}
            setRef={(el) => {
              cardRefs.current[log.id] = el
            }}
          />
        ))}

        {bottomSpacerHeight > 0 && (
          <div aria-hidden="true" style={{ height: `${bottomSpacerHeight}px` }} />
        )}
      </div>
    </div>
  )
})
