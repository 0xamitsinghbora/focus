import { useEffect, useRef } from 'react'

interface UseDialogA11yOptions {
  isOpen: boolean
  onClose: () => void
  initialFocusRef?: React.RefObject<HTMLElement | null>
  closeOnEscape?: boolean
  shouldIgnoreFocusOut?: (target: HTMLElement) => boolean
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const selector =
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
  return Array.from(container.querySelectorAll<HTMLElement>(selector)).filter(
    (el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true'
  )
}

export function useDialogA11y<T extends HTMLElement = HTMLDivElement>({
  isOpen,
  onClose,
  initialFocusRef,
  closeOnEscape = true,
  shouldIgnoreFocusOut
}: UseDialogA11yOptions): React.RefObject<T | null> {
  const containerRef = useRef<T | null>(null)
  const previousActiveElementRef = useRef<HTMLElement | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const shouldIgnoreFocusOutRef = useRef(shouldIgnoreFocusOut)
  shouldIgnoreFocusOutRef.current = shouldIgnoreFocusOut
  const closeOnEscapeRef = useRef(closeOnEscape)
  closeOnEscapeRef.current = closeOnEscape
  const initialFocusRefRef = useRef(initialFocusRef)
  initialFocusRefRef.current = initialFocusRef

  useEffect(() => {
    if (!isOpen) return

    const isElementInsidePortal = (el: HTMLElement | null): boolean => {
      if (!el) return false
      if (containerRef.current?.contains(el)) return false
      if (shouldIgnoreFocusOutRef.current && shouldIgnoreFocusOutRef.current(el)) return true
      return Boolean(
        el.closest(
          '[data-portal], [role="dialog"], [role="alertdialog"], [role="listbox"], [role="menu"], [role="tooltip"], [data-radix-portal], [data-radix-popper-content-wrapper], [data-floating-ui-portal], [data-toast], .portal-root, .apple-popover, [data-dialog-portal]'
        )
      )
    }

    // Save active element prior to opening dialog
    previousActiveElementRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null

    // Focus initial element or first focusable element or container
    const timer = setTimeout(() => {
      if (initialFocusRefRef.current?.current) {
        initialFocusRefRef.current.current.focus()
      } else if (containerRef.current) {
        const focusables = getFocusableElements(containerRef.current)
        if (focusables.length > 0) {
          focusables[0].focus()
        } else {
          containerRef.current.focus()
        }
      }
    }, 20)

    const handleKeyDown = (e: KeyboardEvent): void => {
      if (closeOnEscapeRef.current && e.key === 'Escape' && !e.defaultPrevented) {
        e.preventDefault()
        onCloseRef.current()
        return
      }

      if (e.key === 'Tab' && containerRef.current) {
        const active = document.activeElement as HTMLElement | null
        if (isElementInsidePortal(active)) {
          return
        }

        const focusables = getFocusableElements(containerRef.current)
        if (focusables.length === 0) {
          e.preventDefault()
          containerRef.current.focus()
          return
        }

        const first = focusables[0]
        const last = focusables[focusables.length - 1]

        if (e.shiftKey) {
          if (
            document.activeElement === first ||
            document.activeElement === containerRef.current ||
            !containerRef.current.contains(document.activeElement)
          ) {
            e.preventDefault()
            last.focus()
          }
        } else {
          if (
            document.activeElement === last ||
            document.activeElement === containerRef.current ||
            !containerRef.current.contains(document.activeElement)
          ) {
            e.preventDefault()
            first.focus()
          }
        }
      }
    }

    const handleFocusIn = (e: FocusEvent): void => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        const target = e.target as HTMLElement | null
        if (isElementInsidePortal(target)) {
          return
        }
        e.preventDefault()
        const focusables = getFocusableElements(containerRef.current)
        if (focusables.length > 0) {
          focusables[0].focus()
        } else {
          containerRef.current.focus()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown, true)
    document.addEventListener('focusin', handleFocusIn)

    return () => {
      clearTimeout(timer)
      window.removeEventListener('keydown', handleKeyDown, true)
      document.removeEventListener('focusin', handleFocusIn)
      // Restore focus to previous element if still in document
      if (previousActiveElementRef.current && document.contains(previousActiveElementRef.current)) {
        try {
          previousActiveElementRef.current.focus()
        } catch {
          // ignore
        }
      }
    }
  }, [isOpen])

  return containerRef
}
