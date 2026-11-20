import React, { useMemo } from 'react'
import { PromptOption } from './types'
import { cn } from '../../lib/utils'
import { getGroupTheme, getPreferredGroupColor } from '../../lib/groupTheme'

export interface PromptDetailInputProps {
  currentOption?: PromptOption
  note: string
  setNote: (note: string) => void
  validationError: string | null
  setValidationError: (err: string | null) => void
  status: 'idle' | 'saving' | 'error'
  detailInputRef: React.RefObject<HTMLInputElement | null>
  onBack: () => void
  onSubmit: () => void
  onKeyDown: (e: React.KeyboardEvent) => void
}

export function PromptDetailInput({
  currentOption,
  note,
  setNote,
  validationError,
  setValidationError,
  status,
  detailInputRef,
  onBack,
  onSubmit,
  onKeyDown
}: PromptDetailInputProps): React.JSX.Element {
  const isDetailRequired = currentOption?.type === 'other'
  const canSubmit = status !== 'saving'

  const placeholderText = useMemo(() => {
    if (currentOption?.type === 'goal') {
      return `What did you work on "${currentOption.goal.title}"?`
    }
    return 'What did you do?'
  }, [currentOption])

  return (
    <>
      {/* Selected Item Summary Card */}
      <div className="rounded-xl border border-border/80 bg-card p-2.5 shadow-apple-subtle flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {currentOption?.type === 'goal' && (
            <>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-semibold tracking-wider uppercase text-muted-foreground">
                  {currentOption.goal.status === 'in_progress'
                    ? 'In-Progress Task'
                    : 'Planned Task'}
                </div>
                <div className="text-[13px] font-semibold text-foreground truncate">
                  {currentOption.goal.title}
                </div>
              </div>
              {currentOption.goal.groupTag && (
                <span
                  className={cn(
                    'inline-flex items-center gap-1 px-1.5 py-0.2 rounded-md font-medium text-[10px] border shadow-2xs shrink-0',
                    getGroupTheme(
                      currentOption.goal.groupColor ||
                        getPreferredGroupColor(currentOption.goal.groupTag)
                    ).badgeBg,
                    getGroupTheme(
                      currentOption.goal.groupColor ||
                        getPreferredGroupColor(currentOption.goal.groupTag)
                    ).badgeText,
                    getGroupTheme(
                      currentOption.goal.groupColor ||
                        getPreferredGroupColor(currentOption.goal.groupTag)
                    ).badgeBorder
                  )}
                >
                  <span>{currentOption.goal.groupTag}</span>
                </span>
              )}
            </>
          )}
          {currentOption?.type === 'other' && (
            <>
              <div className="h-6 w-6 rounded-lg bg-apple-amber/15 text-apple-amber flex items-center justify-center shrink-0">
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-semibold tracking-wider uppercase text-apple-amber">
                  Activity
                </div>
                <div className="text-[13px] font-semibold text-foreground">Something Else</div>
              </div>
            </>
          )}
          {currentOption?.type === 'break' && (
            <>
              <div className="h-6 w-6 rounded-lg bg-apple-red/15 text-apple-red flex items-center justify-center shrink-0">
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
                  <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" />
                  <line x1="6" y1="1" x2="6" y2="4" />
                  <line x1="10" y1="1" x2="10" y2="4" />
                  <line x1="14" y1="1" x2="14" y2="4" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-semibold tracking-wider uppercase text-apple-red">
                  Rest
                </div>
                <div className="text-[13px] font-semibold text-foreground">Break</div>
              </div>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={onBack}
          className="text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-secondary/60 cursor-pointer shrink-0"
          title="Change selection (Esc)"
        >
          Change
        </button>
      </div>

      {/* Ask Detail */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px] font-medium px-0.5">
          <span
            className={isDetailRequired ? 'text-foreground font-semibold' : 'text-muted-foreground'}
          >
            Detail
          </span>
          <span className="text-[10px] text-muted-foreground/70">
            {isDetailRequired ? 'Required' : 'Optional'}
          </span>
        </div>
        <div className="relative">
          <input
            ref={detailInputRef}
            type="text"
            value={note}
            onChange={(e) => {
              setNote(e.target.value)
              if (validationError) setValidationError(null)
            }}
            onKeyDown={onKeyDown}
            placeholder={placeholderText}
            disabled={status === 'saving'}
            className={`w-full px-3.5 py-2.5 rounded-xl text-[13px] text-foreground placeholder:text-muted-foreground/60 border bg-card shadow-apple-subtle transition-all outline-none select-text disabled:opacity-50 ${
              validationError
                ? 'border-apple-red focus:ring-2 focus:ring-apple-red/40'
                : 'border-input focus:ring-2 focus:ring-primary/60 focus:border-primary'
            }`}
          />
        </div>
        {validationError && (
          <div
            role="alert"
            className="text-[11px] font-medium text-apple-red px-0.5 animate-in fade-in"
          >
            {validationError}
          </div>
        )}
      </div>

      {status === 'error' && (
        <div className="text-center text-[12px] font-medium text-apple-red">
          Failed to save. Please try again.
        </div>
      )}

      {/* Action Footer for Step 2 */}
      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          disabled={status === 'saving'}
          onClick={onBack}
          className="px-3.5 py-1.5 text-[12px] font-medium text-foreground bg-card hover:bg-secondary border border-border/80 hover:border-border transition-all rounded-xl shadow-apple-subtle hover:shadow-apple-card flex items-center gap-1.5 cursor-pointer active:scale-95 disabled:opacity-40"
        >
          <span>Back</span>
          <kbd className="px-1.5 py-0.5 rounded-md bg-secondary text-muted-foreground border border-border/70 text-[10px] font-mono leading-none">
            Esc
          </kbd>
        </button>

        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit}
          className="px-4 py-1.5 text-[12px] font-semibold rounded-xl transition-all duration-150 bg-secondary/80 hover:bg-secondary text-foreground border border-border/80 hover:border-border shadow-apple-subtle active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 cursor-pointer"
        >
          <span>{status === 'saving' ? 'Saving...' : 'Submit'}</span>
          <kbd className="px-1.5 py-0.5 rounded-md bg-secondary text-muted-foreground border border-border/70 text-[10px] font-mono leading-none">
            Enter
          </kbd>
        </button>
      </div>
    </>
  )
}
