import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../../lib/utils'
import { ToastContext, ToastItem, ToastType } from '../../lib/useToast'

export function ToastProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const timerMapRef = useRef<Map<string, NodeJS.Timeout>>(new Map())

  const clearToastTimer = useCallback((id: string): void => {
    const timer = timerMapRef.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timerMapRef.current.delete(id)
    }
  }, [])

  const removeToast = useCallback(
    (id: string): void => {
      clearToastTimer(id)
      setToasts((prev) => prev.filter((t) => t.id !== id))
    },
    [clearToastTimer]
  )

  useEffect(() => {
    const timerMap = timerMapRef.current
    return () => {
      for (const timer of timerMap.values()) {
        clearTimeout(timer)
      }
      timerMap.clear()
    }
  }, [])

  const show = useCallback(
    (
      message: string,
      options?: {
        title?: string
        type?: ToastType
        duration?: number
        action?: ToastItem['action']
      }
    ): void => {
      const id = crypto.randomUUID()
      const type = options?.type || 'info'
      const title = options?.title
      const duration = options?.duration ?? 3000
      const action = options?.action

      const newToast: ToastItem = { id, title, message, type, duration, action }

      setToasts((prev) => {
        // Clear timers for any toasts being evicted
        for (const t of prev) {
          if (t.message === message) {
            clearToastTimer(t.id)
          }
        }
        const filtered = prev.filter((t) => t.message !== message)
        if (filtered.length > 1) {
          const evicted = filtered.slice(0, filtered.length - 1)
          for (const e of evicted) {
            clearToastTimer(e.id)
          }
        }
        return [...filtered.slice(-1), newToast]
      })

      if (duration > 0) {
        const timer = setTimeout(() => {
          removeToast(id)
        }, duration)
        timerMapRef.current.set(id, timer)
      }
    },
    [clearToastTimer, removeToast]
  )

  const success = useCallback(
    (message: string, title?: string, action?: ToastItem['action']): void => {
      show(message, { title, type: 'success', duration: action ? 5000 : 3000, action })
    },
    [show]
  )

  const error = useCallback(
    (message: string, title?: string): void => {
      show(message, { title, type: 'error', duration: 4000 })
    },
    [show]
  )

  const info = useCallback(
    (message: string, title?: string): void => {
      show(message, { title, type: 'info' })
    },
    [show]
  )

  const contextValue = useMemo(
    () => ({
      toast: { show, success, error, info }
    }),
    [show, success, error, info]
  )

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      {typeof document !== 'undefined' &&
        createPortal(
          <div
            aria-live="polite"
            className="fixed bottom-5 right-6 z-[9999] flex flex-col gap-2 pointer-events-none max-w-sm w-full"
          >
            {toasts.map((t) => (
              <div
                key={t.id}
                className={cn(
                  'pointer-events-auto apple-glass rounded-2xl p-3.5 shadow-apple-popover border border-border/80 flex items-start gap-3 transition-all duration-200 select-none animate-in fade-in slide-in-from-bottom-2',
                  t.type === 'success' && 'border-apple-green/30',
                  t.type === 'error' && 'border-apple-red/30'
                )}
              >
                {/* Icon */}
                <div className="shrink-0 mt-0.5">
                  {t.type === 'success' && (
                    <div className="h-5 w-5 rounded-full bg-apple-green/15 text-apple-green flex items-center justify-center">
                      <svg
                        width="11"
                        height="11"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                  )}
                  {t.type === 'error' && (
                    <div className="h-5 w-5 rounded-full bg-apple-red/15 text-apple-red flex items-center justify-center">
                      <svg
                        width="11"
                        height="11"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </div>
                  )}
                  {t.type === 'info' && (
                    <div className="h-5 w-5 rounded-full bg-accent/15 text-accent flex items-center justify-center">
                      <svg
                        width="11"
                        height="11"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="16" x2="12" y2="12" />
                        <line x1="12" y1="8" x2="12.01" y2="8" />
                      </svg>
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  {t.title && (
                    <div className="text-[13px] font-semibold tracking-tight text-foreground leading-snug">
                      {t.title}
                    </div>
                  )}
                  <div className="text-[12px] text-muted-foreground leading-snug">{t.message}</div>
                  {t.action && (
                    <button
                      onClick={() => {
                        t.action!.onClick()
                        removeToast(t.id)
                      }}
                      className="mt-1.5 text-[12px] font-semibold text-primary hover:text-primary/80 transition-colors"
                    >
                      {t.action.label}
                    </button>
                  )}
                </div>

                {/* Dismiss button */}
                <button
                  onClick={() => removeToast(t.id)}
                  className="shrink-0 h-5 w-5 rounded-md flex items-center justify-center text-muted-foreground/60 hover:text-foreground hover:bg-secondary/80 transition-colors"
                  title="Dismiss notification"
                  aria-label="Dismiss notification"
                >
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    aria-hidden="true"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            ))}
          </div>,
          document.body
        )}
    </ToastContext.Provider>
  )
}
