import { applyTheme, getStoredTheme } from './theme'
import { ThemeMode } from '../../../shared/types'

export function initializeTheme(): void {
  // Apply stored theme synchronously to avoid any dark/light flicker
  try {
    const currentTheme = getStoredTheme()
    applyTheme(currentTheme, false)
  } catch {
    // fallback
    if (typeof document !== 'undefined') {
      document.documentElement.classList.add('dark')
    }
  }

  // Subscribe to live multi-window theme broadcasts from main process
  if (typeof window !== 'undefined' && window.api?.theme?.onThemeUpdated) {
    window.api.theme.onThemeUpdated((nextTheme: ThemeMode) => {
      applyTheme(nextTheme, false)
    })
  }

  // Prevent accidental drop navigation across all renderer windows
  if (typeof window !== 'undefined') {
    window.addEventListener('dragover', (e) => e.preventDefault())
    window.addEventListener('drop', (e) => e.preventDefault())
  }
}

initializeTheme()
