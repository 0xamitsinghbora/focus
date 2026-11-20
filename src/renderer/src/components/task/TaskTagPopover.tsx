import React from 'react'
import {
  GroupColorId,
  GROUP_THEMES,
  getGroupTheme,
  getPreferredGroupColor,
  saveGroupColor,
  getUsedGroupColorsMap
} from '../../lib/groupTheme'
import { cn } from '../../lib/utils'

export interface TaskTagPopoverProps {
  pos: { x: number; y: number }
  groupTag: string
  setGroupTag: (tag: string) => void
  groupColor: string
  setGroupColor: (color: string) => void
  currentGroupTheme: ReturnType<typeof getGroupTheme>
  existingGroups?: { tag: string; color?: string }[]
  onClose: () => void
  popoverRef: React.RefObject<HTMLDivElement | null>
  groupInputRef: React.RefObject<HTMLInputElement | null>
  groupTriggerRef: React.RefObject<HTMLButtonElement | null>
}

export function TaskTagPopover({
  pos,
  groupTag,
  setGroupTag,
  groupColor,
  setGroupColor,
  currentGroupTheme,
  existingGroups = [],
  onClose,
  popoverRef,
  groupInputRef,
  groupTriggerRef
}: TaskTagPopoverProps): React.JSX.Element {
  const usedColorsMap = getUsedGroupColorsMap(groupTag, existingGroups)

  const handleDone = (): void => {
    const val = groupTag.trim()
    if (val) {
      setGroupTag(val)
      saveGroupColor(val, groupColor as GroupColorId)
    }
    onClose()
    groupTriggerRef.current?.focus()
  }

  return (
    <div
      ref={popoverRef}
      tabIndex={-1}
      style={
        {
          left: pos.x,
          top: pos.y,
          WebkitAppRegion: 'no-drag'
        } as React.CSSProperties
      }
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation()
          onClose()
          groupTriggerRef.current?.focus()
        }
      }}
      className="fixed z-9999 w-[300px] rounded-2xl border border-border/80 bg-popover/95 p-3.5 shadow-apple-popover backdrop-blur-md animate-in fade-in zoom-in-95 duration-100 select-none text-[13px] focus:outline-none"
    >
      <div className="flex items-center justify-between pb-2 border-b border-border/40">
        <div className="flex items-center gap-1.5 font-semibold text-foreground text-[12.5px]">
          <span className={cn('h-2.5 w-2.5 rounded-full', currentGroupTheme.dotClass)} />
          <span>Group Tag & Theme</span>
        </div>
        {groupTag && (
          <button
            type="button"
            onClick={() => {
              setGroupTag('')
              onClose()
              groupTriggerRef.current?.focus()
            }}
            className="text-[11px] text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
          >
            Clear
          </button>
        )}
      </div>

      {/* Group Tag Input */}
      <div className="mt-2.5 space-y-1.5">
        <label className="text-[11px] font-medium text-muted-foreground">Group Tag Name</label>
        <div className="flex items-center gap-1.5">
          <input
            ref={groupInputRef}
            type="text"
            value={groupTag}
            onChange={(e) => {
              const val = e.target.value
              setGroupTag(val)
              const pref = getPreferredGroupColor(val)
              if (pref) setGroupColor(pref)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleDone()
              }
            }}
            placeholder="e.g. Design, Backend, Sprint 1"
            className="flex-1 rounded-lg border border-border bg-background/80 px-2.5 py-1.5 text-[12.5px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
            autoFocus
          />
          <button
            type="button"
            onClick={handleDone}
            className="rounded-lg bg-secondary px-2.5 py-1.5 text-[11px] font-semibold text-foreground hover:bg-secondary/80 border border-border/70 cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>

      {/* Existing Groups (if any) */}
      {existingGroups && existingGroups.length > 0 && (
        <div className="mt-3 space-y-1.5">
          <label className="text-[11px] font-medium text-muted-foreground">Existing Groups</label>
          <div className="flex flex-wrap gap-1 max-h-[85px] overflow-y-auto custom-scrollbar">
            {existingGroups.map((g) => {
              const gTheme = getGroupTheme(g.color || getPreferredGroupColor(g.tag))
              const isSelected = groupTag.trim().toLowerCase() === g.tag.toLowerCase()
              return (
                <button
                  key={g.tag}
                  type="button"
                  onClick={() => {
                    setGroupTag(g.tag)
                    const c = g.color || getPreferredGroupColor(g.tag)
                    setGroupColor(c)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      setGroupTag(g.tag)
                      const c = g.color || getPreferredGroupColor(g.tag)
                      setGroupColor(c)
                      saveGroupColor(g.tag, c as GroupColorId)
                      onClose()
                      groupTriggerRef.current?.focus()
                    }
                  }}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium transition-all border cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary',
                    isSelected
                      ? cn(
                          gTheme.badgeBg,
                          gTheme.badgeText,
                          gTheme.badgeBorder,
                          'ring-1 ring-border shadow-2xs'
                        )
                      : 'bg-secondary/60 text-foreground/80 hover:bg-secondary border-border/50'
                  )}
                >
                  <span className={cn('h-1.5 w-1.5 rounded-full', gTheme.dotClass)} />
                  <span>{g.tag}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Color Theme Selector */}
      <div className="mt-3 space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <label className="text-[11px] font-medium text-muted-foreground">Color Theme</label>
            {usedColorsMap.size > 0 && (
              <span className="text-[9.5px] text-muted-foreground/75 flex items-center gap-0.5 font-normal">
                <svg
                  className="h-2 w-2 text-muted-foreground stroke-[2.5]"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
                <span>Used</span>
              </span>
            )}
          </div>
          <span className="text-[11px] font-medium text-foreground">{currentGroupTheme.name}</span>
        </div>
        <div className="grid grid-cols-8 gap-1.5 pt-0.5">
          {GROUP_THEMES.map((theme, idx) => {
            const isSelected = groupColor === theme.id
            const usedByGroup = usedColorsMap.get(theme.id)
            const isUsed = Boolean(usedByGroup)

            return (
              <button
                key={theme.id}
                type="button"
                disabled={isUsed}
                onClick={() => {
                  if (!isUsed) {
                    setGroupColor(theme.id)
                    const t = groupTag.trim()
                    if (t) {
                      saveGroupColor(t, theme.id)
                    }
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (!isUsed) {
                      e.preventDefault()
                      setGroupColor(theme.id)
                      const t = groupTag.trim()
                      if (t) {
                        saveGroupColor(t, theme.id)
                      }
                      onClose()
                      groupTriggerRef.current?.focus()
                    }
                    return
                  }
                  if (idx === GROUP_THEMES.length - 1 && e.key === 'Tab' && !e.shiftKey) {
                    e.preventDefault()
                    groupInputRef.current?.focus()
                    return
                  }
                }}
                title={isUsed ? `${theme.name} (Already used by "${usedByGroup}")` : theme.name}
                className={cn(
                  'group relative flex h-7 items-center justify-center rounded-lg border transition-all duration-150 focus:outline-none focus:ring-[1.5px] focus:ring-primary',
                  theme.headerBg,
                  theme.headerBorder,
                  isUsed
                    ? 'opacity-35 cursor-not-allowed hover:opacity-35'
                    : isSelected
                      ? 'ring-2 ring-primary border-primary shadow-2xs scale-105 cursor-pointer'
                      : 'hover:scale-105 opacity-80 hover:opacity-100 cursor-pointer'
                )}
              >
                <div className="relative flex items-center justify-center">
                  <span className={cn('h-3.5 w-3.5 rounded-full shadow-2xs', theme.dotClass)} />
                  {isUsed && (
                    <svg
                      className="absolute inset-0 m-auto h-3 w-3 text-foreground/90 drop-shadow-xs pointer-events-none stroke-[3]"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
