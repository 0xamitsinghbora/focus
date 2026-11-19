import { Notification, nativeImage } from 'electron'
import icon from '../../build/icon.png?asset'
import { logger } from './logger'

interface FallbackNotificationOptions {
  title?: string
  body?: string
  onClick?: () => void
}

let activeNotification: Notification | null = null

export function showNativeNotification(options: FallbackNotificationOptions = {}): boolean {
  try {
    if (typeof Notification.isSupported === 'function' && !Notification.isSupported()) {
      return false
    }

    if (activeNotification) {
      try {
        activeNotification.close()
      } catch {
        // ignore
      }
      activeNotification = null
    }

    const title = options.title || 'Focus Check-in'
    const body = options.body || 'Time to review your progress or take a quick break.'

    let notifIcon: Electron.NativeImage | undefined
    try {
      const img = nativeImage.createFromPath(icon)
      if (!img.isEmpty()) {
        notifIcon = img
      }
    } catch {
      // ignore
    }

    const notification = new Notification({
      title,
      body,
      icon: notifIcon,
      silent: false
    })

    if (options.onClick) {
      notification.on('click', () => {
        options.onClick?.()
      })
    }

    notification.show()
    activeNotification = notification
    return true
  } catch (err) {
    logger.warn('notification', 'Failed to display native OS notification:', err)
    return false
  }
}

export function closeNativeNotification(): void {
  if (activeNotification) {
    try {
      activeNotification.close()
    } catch {
      // ignore
    }
    activeNotification = null
  }
}

export function getActiveNotification(): Notification | null {
  return activeNotification
}
