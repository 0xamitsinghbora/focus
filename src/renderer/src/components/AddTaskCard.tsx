import { useState, useRef, useEffect, useCallback, FormEvent, KeyboardEvent } from 'react'
import { DueDateTimePicker } from './ui/DueDateTimePicker'
import { cn } from '../lib/utils'
import {
  getGroupTheme,
  getPreferredGroupColor,
  saveGroupColor,
  getRandomUnusedColor,
  getSavedGroupColors
} from '../lib/groupTheme'
import { TaskPropertiesRow } from './task/TaskPropertiesRow'
import { TaskTagPopover } from './task/TaskTagPopover'
import { parseTaskShorthand } from '../lib/taskShorthand'

interface TaskFormData {
  title: string
  note?: string
  deadline?: string
  remindAt?: string
  repeat?: string
  groupTag?: string
  groupColor?: string
  targetMinutes?: number
  goalType?: 'deep' | 'routine'
}

export interface AddTaskCardProps {
  onAdd: (data: TaskFormData) => Promise<void>
  initialData?: Partial<TaskFormData>
  existingGroups?: { tag: string; color?: string }[]
  mode?: 'create' | 'edit'
  submitLabel?: string
  onCancel?: () => void
  isExpanded?: boolean
  onToggleExpand?: (expanded: boolean) => void
  triggerFocus?: number
  dayCutoffHour?: number
}

type ActivePopover = 'due' | 'group' | null

export function AddTaskCard({
  onAdd,
  initialData,
  existingGroups = [],
  mode = 'create',
  submitLabel,
  onCancel,
  isExpanded = false,
  onToggleExpand,
  triggerFocus,
  dayCutoffHour = 0
}: AddTaskCardProps): React.JSX.Element | null {
  const [expanded, setExpanded] = useState(isExpanded)
  const [heading, setHeading] = useState(initialData?.title || '')
  const [note, setNote] = useState(initialData?.note || '')
  const [groupTag, setGroupTag] = useState<string>(initialData?.groupTag || '')
  const [groupColor, setGroupColor] = useState<string>(() => {
    if (initialData?.groupColor) return initialData.groupColor
    if (initialData?.groupTag) return getPreferredGroupColor(initialData.groupTag)
    const saved = getSavedGroupColors()
    return getRandomUnusedColor(Object.values(saved))
  })
  const [goalType, setGoalType] = useState<'deep' | 'routine'>(initialData?.goalType || 'deep')

  // Date and Time components of deadline
  const [dueDate, setDueDate] = useState<string | null>(() => {
    if (!initialData?.deadline) return null
    return initialData.deadline.includes('T')
      ? initialData.deadline.split('T')[0]
      : initialData.deadline
  })

  const [dueTime, setDueTime] = useState<string | null>(() => {
    if (!initialData?.deadline) return null
    if (initialData.deadline.includes('T')) {
      const t = initialData.deadline.split('T')[1]
      return t ? t.slice(0, 5) : null
    }
    return null
  })

  const currentGroupTheme = getGroupTheme(groupColor)

  const [activePopover, setActivePopover] = useState<ActivePopover>(null)
  const [popoverPos, setPopoverPos] = useState<{ x: number; y: number } | null>(null)
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)
  const discardTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const isFormDirty =
    heading.trim() !== (initialData?.title || '').trim() ||
    note.trim() !== (initialData?.note || '').trim()

  const handleHeadingChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    setHeading(e.target.value)
    if (showDiscardConfirm) setShowDiscardConfirm(false)
  }

  const handleNoteChange = (e: React.ChangeEvent<HTMLTextAreaElement>): void => {
    setNote(e.target.value)
    if (showDiscardConfirm) setShowDiscardConfirm(false)
  }

  useEffect(() => {
    return () => {
      if (discardTimeoutRef.current) clearTimeout(discardTimeoutRef.current)
    }
  }, [])

  const containerRef = useRef<HTMLDivElement>(null)
  const headingInputRef = useRef<HTMLInputElement>(null)
  const noteTextareaRef = useRef<HTMLTextAreaElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const dueTriggerRef = useRef<HTMLButtonElement>(null)
  const groupTriggerRef = useRef<HTMLButtonElement>(null)
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  const submitButtonRef = useRef<HTMLButtonElement>(null)
  const groupInputRef = useRef<HTMLInputElement>(null)

  // Sync external expanded state
  useEffect(() => {
    setExpanded(isExpanded)
  }, [isExpanded])

  // Sync initialData changes when editing or props change
  useEffect(() => {
    if (initialData) {
      setHeading(initialData.title || '')
      setNote(initialData.note || '')
      setGroupTag(initialData.groupTag || '')
      setGroupColor(
        initialData.groupColor ||
          (initialData.groupTag
            ? getPreferredGroupColor(initialData.groupTag)
            : getRandomUnusedColor(Object.values(getSavedGroupColors())))
      )
      const initialDate = initialData.deadline
        ? initialData.deadline.includes('T')
          ? initialData.deadline.split('T')[0]
          : initialData.deadline
        : null
      const initialTime =
        initialData?.deadline && initialData.deadline.includes('T')
          ? initialData.deadline.split('T')[1].slice(0, 5)
          : null
      setDueDate(initialDate)
      setDueTime(initialTime)
      if (initialData.goalType) {
        setGoalType(initialData.goalType)
      }
    }
  }, [initialData])

  const setExpandedState = useCallback(
    (exp: boolean): void => {
      setExpanded(exp)
      onToggleExpand?.(exp)
      if (exp) {
        setTimeout(() => {
          headingInputRef.current?.focus()
          if (mode === 'edit') {
            headingInputRef.current?.select()
          }
        }, 50)
      } else {
        setActivePopover(null)
      }
    },
    [onToggleExpand, mode]
  )

  // Auto focus & select title on mount / expand
  useEffect(() => {
    if (!expanded) return
    const focusInput = (): void => {
      if (headingInputRef.current) {
        headingInputRef.current.focus()
        if (mode === 'edit') {
          headingInputRef.current.select()
        }
      }
    }
    const timer1 = setTimeout(focusInput, 50)
    const timer2 = setTimeout(() => {
      if (headingInputRef.current && document.activeElement !== headingInputRef.current) {
        focusInput()
      }
    }, 150)
    return () => {
      clearTimeout(timer1)
      clearTimeout(timer2)
    }
  }, [expanded, mode])

  // External trigger (e.g. Ctrl+N)
  useEffect(() => {
    if (triggerFocus && triggerFocus > 0) {
      setExpandedState(true)
    }
  }, [triggerFocus, setExpandedState])

  // Click outside to close popover
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent): void => {
      const target = e.target as Node
      if (popoverRef.current && !popoverRef.current.contains(target)) {
        const isOurTrigger = Array.from(
          containerRef.current?.querySelectorAll('[data-popover-trigger]') || []
        ).some((el) => el.contains(target))
        if (!isOurTrigger) {
          setActivePopover(null)
        }
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  // Auto-focus group input when group popover opens
  useEffect(() => {
    if (activePopover !== 'group') return
    const timer = setTimeout(() => {
      groupInputRef.current?.focus()
      groupInputRef.current?.select()
    }, 60)
    return () => clearTimeout(timer)
  }, [activePopover])

  const resetForm = (): void => {
    setHeading(initialData?.title || '')
    setNote(initialData?.note || '')
    setGroupTag(initialData?.groupTag || '')
    setGroupColor(
      initialData?.groupColor ||
        (initialData?.groupTag
          ? getPreferredGroupColor(initialData.groupTag)
          : getRandomUnusedColor(Object.values(getSavedGroupColors())))
    )
    const initialDate = initialData?.deadline
      ? initialData.deadline.includes('T')
        ? initialData.deadline.split('T')[0]
        : initialData.deadline
      : null
    const initialTime =
      initialData?.deadline && initialData.deadline.includes('T')
        ? initialData.deadline.split('T')[1].slice(0, 5)
        : null
    setDueDate(initialDate)
    setDueTime(initialTime)
    setGoalType(initialData?.goalType || 'deep')
    setActivePopover(null)
  }

  const handleCancel = (force = false): void => {
    if (!force && isFormDirty && !showDiscardConfirm) {
      setShowDiscardConfirm(true)
      if (discardTimeoutRef.current) clearTimeout(discardTimeoutRef.current)
      discardTimeoutRef.current = setTimeout(() => {
        setShowDiscardConfirm(false)
      }, 4000)
      return
    }

    if (discardTimeoutRef.current) {
      clearTimeout(discardTimeoutRef.current)
      discardTimeoutRef.current = null
    }
    setShowDiscardConfirm(false)

    if (mode === 'edit') {
      onCancel?.()
    } else {
      resetForm()
      setExpandedState(false)
      onCancel?.()
    }
  }

  const handleSubmit = async (e?: FormEvent): Promise<void> => {
    e?.preventDefault()
    const { cleanTitle, parsedMinutes, parsedTag, parsedDueDate, parsedDueTime } =
      parseTaskShorthand(heading)
    const trimmed = cleanTitle || heading.trim()
    if (!trimmed) return

    const effectiveTag = groupTag.trim() || parsedTag || ''
    const effectiveMinutes = initialData?.targetMinutes || parsedMinutes

    let resolvedColor = groupColor
    if (effectiveTag) {
      if (!groupTag.trim() && parsedTag) {
        resolvedColor = getPreferredGroupColor(parsedTag)
      }
      saveGroupColor(effectiveTag, resolvedColor)
    }

    const effectiveDueDate = dueDate || parsedDueDate
    const effectiveDueTime = dueTime || parsedDueTime

    let finalDeadline: string | undefined = undefined
    if (effectiveDueDate) {
      finalDeadline = effectiveDueTime
        ? `${effectiveDueDate}T${effectiveDueTime}:00`
        : effectiveDueDate
    }

    await onAdd({
      title: trimmed,
      note: note.trim() || undefined,
      deadline: finalDeadline,
      groupTag: effectiveTag || undefined,
      groupColor: effectiveTag ? resolvedColor : undefined,
      targetMinutes: effectiveMinutes || undefined,
      goalType
    })

    if (mode === 'edit') {
      onCancel?.()
    } else {
      resetForm()
      setExpandedState(false)
    }
  }

  const calculatePopoverPos = useCallback((type: 'due' | 'group') => {
    const triggerEl = type === 'due' ? dueTriggerRef.current : groupTriggerRef.current
    if (!triggerEl) return { x: 20, y: 100 }
    const rect = triggerEl.getBoundingClientRect()
    const popoverWidth = type === 'due' ? 280 : 300
    const popoverHeight = type === 'due' ? 350 : 360
    const spaceBelow = window.innerHeight - rect.bottom
    const x = Math.max(8, Math.min(rect.left - 6, window.innerWidth - popoverWidth - 12))
    const y =
      spaceBelow < popoverHeight
        ? Math.max(52, rect.top - popoverHeight - 6)
        : Math.min(window.innerHeight - popoverHeight - 12, rect.bottom + 6)
    return { x, y }
  }, [])

  const lastToggleTimeRef = useRef<number>(0)

  const togglePopover = useCallback(
    (type: 'due' | 'group'): void => {
      const now = Date.now()
      if (now - lastToggleTimeRef.current < 200) {
        return
      }
      lastToggleTimeRef.current = now

      if (activePopover === type) {
        setActivePopover(null)
      } else {
        const pos = calculatePopoverPos(type)
        setPopoverPos(pos)
        setActivePopover(type)
      }
    },
    [activePopover, calculatePopoverPos]
  )

  // Global card key handler
  const handleCardKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    // 1. Submit from anywhere with Ctrl+Enter or Cmd+Enter
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation()
      handleSubmit()
      return
    }

    // 2. Quick shortcut: Ctrl+D or Alt+D for Due Date
    if ((e.ctrlKey || e.altKey) && e.key.toLowerCase() === 'd') {
      e.preventDefault()
      e.stopPropagation()
      togglePopover('due')
      return
    }

    // 3. Quick shortcut: Ctrl+G or Alt+G for Group Tag
    if ((e.ctrlKey || e.altKey) && e.key.toLowerCase() === 'g') {
      e.preventDefault()
      e.stopPropagation()
      togglePopover('group')
      return
    }

    // 4. Escape isolation: if popover open, close popover and stop propagation
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      if (activePopover) {
        const prev = activePopover
        setActivePopover(null)
        if (prev === 'due') {
          dueTriggerRef.current?.focus()
        } else if (prev === 'group') {
          groupTriggerRef.current?.focus()
        }
      } else {
        handleCancel()
      }
    }
  }

  const currentPos = popoverPos || (activePopover ? calculatePopoverPos(activePopover) : null)

  // Only render the card when active
  if (!expanded) {
    return null
  }

  return (
    <div
      ref={containerRef}
      onKeyDown={handleCardKeyDown}
      className={cn(
        'relative rounded-2xl border border-border bg-card p-3 shadow-apple-card apple-card-elevated transition-all duration-200 focus-within:ring-1 focus-within:ring-ring/40 text-left'
      )}
    >
      <form onSubmit={handleSubmit} className="space-y-2.5">
        {/* Main Content: Title & Note Inputs */}
        <div className="space-y-1.5">
          {/* Title Input */}
          <input
            ref={headingInputRef}
            type="text"
            value={heading}
            onChange={handleHeadingChange}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                noteTextareaRef.current?.focus()
                return
              }
              if (e.key === 'Tab' && !e.shiftKey) {
                e.preventDefault()
                noteTextareaRef.current?.focus()
                return
              }
              if (e.key === 'Tab' && e.shiftKey) {
                e.preventDefault()
                submitButtonRef.current?.focus()
                return
              }
              if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
                e.preventDefault()
                handleSubmit()
                return
              }
            }}
            placeholder={mode === 'edit' ? 'Task title' : 'What do you want to accomplish?'}
            className="w-full bg-transparent text-[13.5px] font-medium text-foreground placeholder:text-muted-foreground/50 outline-none"
            autoFocus
          />

          {/* Note Input */}
          <div className="flex items-start gap-1.5">
            <textarea
              ref={noteTextareaRef}
              value={note}
              onChange={handleNoteChange}
              onKeyDown={(e) => {
                if (e.key === 'ArrowUp' && (e.currentTarget.selectionStart === 0 || !note)) {
                  e.preventDefault()
                  headingInputRef.current?.focus()
                  return
                }
                if (e.key === 'Tab' && e.shiftKey) {
                  e.preventDefault()
                  headingInputRef.current?.focus()
                  return
                }
                if (e.key === 'Tab' && !e.shiftKey) {
                  e.preventDefault()
                  if (activePopover !== 'due') {
                    const pos = calculatePopoverPos('due')
                    setPopoverPos(pos)
                    setActivePopover('due')
                  }
                  setTimeout(() => {
                    const timeControl = popoverRef.current?.querySelector(
                      '[role="spinbutton"]'
                    ) as HTMLElement | null
                    if (timeControl) {
                      timeControl.focus()
                    } else {
                      const firstFocusable = popoverRef.current?.querySelector(
                        '[tabindex="0"]'
                      ) as HTMLElement | null
                      firstFocusable?.focus()
                    }
                  }, 30)
                  return
                }
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault()
                  handleSubmit()
                  return
                }
              }}
              placeholder="Add note"
              rows={note ? Math.min(5, Math.max(2, note.split('\n').length)) : 1}
              className="w-full bg-transparent text-[12px] text-foreground/90 placeholder:text-muted-foreground/50 outline-none resize-y min-h-[22px] max-h-[160px] leading-relaxed custom-scrollbar"
            />
          </div>
        </div>

        {/* Selected Properties Chips / Tags Row */}
        <TaskPropertiesRow
          groupTag={groupTag}
          setGroupTag={setGroupTag}
          currentGroupTheme={currentGroupTheme}
          dueDate={dueDate}
          dueTime={dueTime}
          setDueDate={setDueDate}
          setDueTime={setDueTime}
          dayCutoffHour={dayCutoffHour}
        />

        {/* Goal Type 2-Way Selector & Micro-copy */}
        <div className="pt-1.5 pb-0.5 space-y-1">
          <div className="flex items-center gap-1.5 bg-secondary/50 p-0.5 rounded-lg w-fit">
            <button
              type="button"
              onClick={() => setGoalType('deep')}
              className={cn(
                'px-2 py-0.5 rounded-md text-[11px] font-medium transition-all cursor-pointer',
                goalType === 'deep'
                  ? 'bg-card text-foreground shadow-2xs font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              🎯 Deep Focus
            </button>
            <button
              type="button"
              onClick={() => setGoalType('routine')}
              className={cn(
                'px-2 py-0.5 rounded-md text-[11px] font-medium transition-all cursor-pointer',
                goalType === 'routine'
                  ? 'bg-card text-foreground shadow-2xs font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              ⚡ Routine
            </button>
          </div>
          <div className="text-[10.5px] text-muted-foreground/75 italic px-0.5">
            {goalType === 'deep'
              ? 'Lyrics compete with verbal memory — Silence or Rain recommended'
              : 'Routine work — music keeps your pace up'}
          </div>
        </div>

        {/* Bottom Bar: Action Icons on Left, Add/Cancel on Right */}
        <div className="flex items-center justify-between pt-2 border-t border-border/40">
          <div className="flex items-center gap-1">
            {/* Due Date & Time Button (Calendar Icon) */}
            <button
              ref={dueTriggerRef}
              type="button"
              data-popover-trigger="true"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                togglePopover('due')
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  e.stopPropagation()
                  togglePopover('due')
                  return
                }
                if (e.key === 'ArrowRight' || (e.key === 'Tab' && !e.shiftKey)) {
                  e.preventDefault()
                  if (activePopover === 'due') {
                    const timeControl = popoverRef.current?.querySelector(
                      '[role="spinbutton"]'
                    ) as HTMLElement | null
                    if (timeControl) {
                      timeControl.focus()
                    } else {
                      const popoverContainer = popoverRef.current?.querySelector(
                        '[tabindex="0"]'
                      ) as HTMLElement | null
                      popoverContainer?.focus()
                    }
                  } else {
                    groupTriggerRef.current?.focus()
                  }
                  return
                }
                if (e.key === 'ArrowLeft' || (e.key === 'Tab' && e.shiftKey)) {
                  e.preventDefault()
                  noteTextareaRef.current?.focus()
                  return
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  noteTextareaRef.current?.focus()
                  return
                }
              }}
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-all duration-150 hover:bg-secondary hover:text-foreground focus:outline-none focus:ring-[1.5px] focus:ring-primary cursor-pointer',
                dueDate && 'text-foreground bg-secondary font-semibold ring-1 ring-border',
                activePopover === 'due' && 'bg-secondary text-foreground ring-1 ring-primary'
              )}
              title="Set deadline: Due Date & Time (Enter or Ctrl+D)"
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
                <line x1="16" x2="16" y1="2" y2="6" />
                <line x1="8" x2="8" y1="2" y2="6" />
                <line x1="3" x2="21" y1="10" y2="10" />
                <path d="M8 14h.01" />
                <path d="M12 14h.01" />
                <path d="M16 14h.01" />
                <path d="M8 18h.01" />
                <path d="M12 18h.01" />
                <path d="M16 18h.01" />
              </svg>
            </button>

            {/* Group Tag & Color Theme Button */}
            <button
              ref={groupTriggerRef}
              type="button"
              data-popover-trigger="true"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                togglePopover('group')
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  e.stopPropagation()
                  togglePopover('group')
                  return
                }
                if (e.key === 'ArrowLeft' || (e.key === 'Tab' && e.shiftKey)) {
                  e.preventDefault()
                  dueTriggerRef.current?.focus()
                  return
                }
                if (e.key === 'ArrowRight' || (e.key === 'Tab' && !e.shiftKey)) {
                  e.preventDefault()
                  cancelButtonRef.current?.focus()
                  return
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  noteTextareaRef.current?.focus()
                  return
                }
              }}
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-all duration-150 hover:bg-secondary hover:text-foreground focus:outline-none focus:ring-[1.5px] focus:ring-primary cursor-pointer',
                groupTag && 'text-foreground bg-secondary ring-1 ring-border',
                activePopover === 'group' && 'bg-secondary text-foreground ring-1 ring-primary'
              )}
              title="Add group tag (Enter or Ctrl+G)"
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z" />
                <path d="M7 7h.01" />
              </svg>
            </button>
          </div>

          {/* Right Action Buttons */}
          <div className="flex items-center gap-1.5">
            {showDiscardConfirm && (
              <span
                role="status"
                className="text-[10px] text-destructive font-medium animate-in fade-in duration-150 mr-1 select-none"
              >
                Draft unsaved: Esc again to discard
              </span>
            )}
            <button
              ref={cancelButtonRef}
              type="button"
              onClick={() => handleCancel()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  e.stopPropagation()
                  handleCancel()
                  return
                }
                if (e.key === 'ArrowLeft' || (e.key === 'Tab' && e.shiftKey)) {
                  e.preventDefault()
                  groupTriggerRef.current?.focus()
                  return
                }
                if (e.key === 'ArrowRight' || (e.key === 'Tab' && !e.shiftKey)) {
                  e.preventDefault()
                  submitButtonRef.current?.focus()
                  return
                }
              }}
              className={cn(
                'h-7 rounded-lg px-2.5 text-[11px] font-medium transition-colors cursor-pointer focus:outline-none focus:ring-[1.5px] focus:ring-primary',
                showDiscardConfirm
                  ? 'bg-destructive/15 text-destructive font-semibold hover:bg-destructive/25 border border-destructive/30'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              )}
            >
              {showDiscardConfirm ? 'Discard?' : 'Cancel'}
            </button>
            <button
              ref={submitButtonRef}
              type="submit"
              disabled={!heading.trim()}
              onKeyDown={(e) => {
                if (e.key === 'ArrowLeft' || (e.key === 'Tab' && e.shiftKey)) {
                  e.preventDefault()
                  cancelButtonRef.current?.focus()
                  return
                }
                if (e.key === 'Tab' && !e.shiftKey) {
                  e.preventDefault()
                  headingInputRef.current?.focus()
                  return
                }
              }}
              className="h-7 rounded-lg bg-primary px-3 text-[11px] font-semibold tracking-[-0.01em] text-primary-foreground shadow-sm hover:opacity-90 disabled:opacity-40 transition-all apple-press active:scale-[0.97] focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 cursor-pointer"
            >
              {submitLabel || (mode === 'edit' ? 'Save' : 'Add')}
            </button>
          </div>
        </div>
      </form>

      {/* --- POPUP 1: Due Date & Time Popover (Simple, Minimal Apple Design) --- */}
      {activePopover === 'due' && currentPos && (
        <div
          ref={popoverRef}
          tabIndex={-1}
          style={
            {
              left: currentPos.x,
              top: currentPos.y,
              WebkitAppRegion: 'no-drag'
            } as React.CSSProperties
          }
          className="fixed z-[9999]"
        >
          <DueDateTimePicker
            dueDate={dueDate}
            dueTime={dueTime}
            dayCutoffHour={dayCutoffHour}
            onDateChange={(newDate) => setDueDate(newDate)}
            onTimeChange={(newTime) => setDueTime(newTime)}
            onClearAll={() => {
              setDueDate(null)
              setDueTime(null)
            }}
            onClose={(returnFocusTo) => {
              setActivePopover(null)
              if (returnFocusTo === 'note') {
                noteTextareaRef.current?.focus()
              } else {
                dueTriggerRef.current?.focus()
              }
            }}
          />
        </div>
      )}

      {/* --- POPUP 2: Group Tag & Color Theme Popover --- */}
      {activePopover === 'group' && currentPos && (
        <TaskTagPopover
          pos={currentPos}
          groupTag={groupTag}
          setGroupTag={setGroupTag}
          groupColor={groupColor}
          setGroupColor={setGroupColor}
          currentGroupTheme={currentGroupTheme}
          existingGroups={existingGroups}
          onClose={() => setActivePopover(null)}
          popoverRef={popoverRef}
          groupInputRef={groupInputRef}
          groupTriggerRef={groupTriggerRef}
        />
      )}
    </div>
  )
}
