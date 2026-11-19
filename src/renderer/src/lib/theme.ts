import { useState, useEffect, useCallback } from 'react'
import { ThemeMode } from '../../../shared/types'

let inMemoryTheme: ThemeMode | null = null

export function _resetThemeForTesting(): void {
  inMemoryTheme = null
}

export function getStoredTheme(): ThemeMode {
  if (inMemoryTheme !== null) {
    return inMemoryTheme
  }
  if (typeof window !== 'undefined' && window.api?.theme?.getInitialTheme) {
    try {
      const initial = window.api.theme.getInitialTheme()
      if (initial === 'light' || initial === 'dark' || initial === 'system') {
        inMemoryTheme = initial
        return initial
      }
    } catch {
      // fallback
    }
  }
  return 'system'
}

function resolveIsDark(theme: ThemeMode): boolean {
  if (theme === 'dark') return true
  if (theme === 'light') return false
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  }
  return true
}

export function applyTheme(theme: ThemeMode, broadcast = false): void {
  inMemoryTheme = theme
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('focus-theme', theme)
    }
  } catch {
    // ignore
  }
  const isDark = resolveIsDark(theme)
  if (typeof document !== 'undefined') {
    if (isDark) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }
  if (broadcast && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('focus-theme-change', { detail: theme }))
    const isSecondaryWindow =
      typeof window.location?.pathname === 'string' &&
      (window.location.pathname.includes('widget.html') ||
        window.location.pathname.includes('prompt.html'))
    if (!isSecondaryWindow && window.api?.settings?.patch) {
      window.api.settings.patch({ theme }).catch(() => {})
    }
  }
}

export function useTheme(): [ThemeMode, (theme: ThemeMode, broadcast?: boolean) => void, boolean] {
  const [theme, setThemeState] = useState<ThemeMode>(getStoredTheme)
  const [isDark, setIsDark] = useState<boolean>(() => resolveIsDark(getStoredTheme()))

  const setTheme = useCallback((newTheme: ThemeMode, broadcast = true) => {
    let changed = false
    setThemeState((prev) => {
      if (prev === newTheme) return prev
      changed = true
      setIsDark(resolveIsDark(newTheme))
      return newTheme
    })
    if (changed || inMemoryTheme !== newTheme) {
      applyTheme(newTheme, broadcast)
    }
  }, [])

  useEffect(() => {
    const handleThemeChange = (e: Event): void => {
      const customEvent = e as CustomEvent<ThemeMode>
      if (customEvent.detail) {
        setThemeState((prev) => {
          if (prev === customEvent.detail) return prev
          setIsDark(resolveIsDark(customEvent.detail))
          return customEvent.detail
        })
      }
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleMediaChange = (): void => {
      const current = getStoredTheme()
      if (current === 'system') {
        const nextDark = mediaQuery.matches
        setIsDark(nextDark)
        if (typeof document !== 'undefined') {
          if (nextDark) {
            document.documentElement.classList.add('dark')
          } else {
            document.documentElement.classList.remove('dark')
          }
        }
      }
    }

    window.addEventListener('focus-theme-change', handleThemeChange)
    mediaQuery.addEventListener('change', handleMediaChange)

    let cleanupIpc: (() => void) | undefined
    if (typeof window !== 'undefined' && window.api?.theme?.onThemeUpdated) {
      cleanupIpc = window.api.theme.onThemeUpdated((nextTheme: ThemeMode) => {
        setThemeState((prev) => {
          if (prev === nextTheme) return prev
          setIsDark(resolveIsDark(nextTheme))
          return nextTheme
        })
        applyTheme(nextTheme, false)
      })
    }

    return () => {
      window.removeEventListener('focus-theme-change', handleThemeChange)
      mediaQuery.removeEventListener('change', handleMediaChange)
      cleanupIpc?.()
    }
  }, [])

  return [theme, setTheme, isDark]
}
