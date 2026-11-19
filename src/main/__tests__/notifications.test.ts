import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  showNativeNotification,
  closeNativeNotification,
  getActiveNotification
} from '../notifications'
import { Notification } from 'electron'

vi.mock('../../../build/icon.png?asset', () => ({
  default: 'mock-icon.png'
}))

describe('Native OS Notification Fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    closeNativeNotification()
  })

  afterEach(() => {
    closeNativeNotification()
  })

  it('checks Notification.isSupported and displays native notification', () => {
    const isSupportedSpy = vi.spyOn(Notification, 'isSupported').mockReturnValue(true)
    const showSpy = vi.spyOn(Notification.prototype, 'show')

    const success = showNativeNotification({
      title: 'Focus Check-in',
      body: 'Time to record your work or take a break.'
    })

    expect(isSupportedSpy).toHaveBeenCalled()
    expect(success).toBe(true)
    expect(showSpy).toHaveBeenCalled()
    expect(getActiveNotification()).toBeDefined()
  })

  it('invokes onClick callback when notification is clicked', () => {
    vi.spyOn(Notification, 'isSupported').mockReturnValue(true)
    const onClick = vi.fn()

    showNativeNotification({
      title: 'Focus Reminder',
      body: 'Click to record work',
      onClick
    })

    const notif = getActiveNotification()
    expect(notif).toBeDefined()

    // Trigger click event
    notif?.emit('click')
    expect(onClick).toHaveBeenCalled()
  })

  it('closes active notification on closeNativeNotification', () => {
    vi.spyOn(Notification, 'isSupported').mockReturnValue(true)
    const closeSpy = vi.spyOn(Notification.prototype, 'close')

    showNativeNotification({
      title: 'Focus Reminder',
      body: 'To be closed'
    })

    expect(getActiveNotification()).toBeDefined()
    closeNativeNotification()
    expect(closeSpy).toHaveBeenCalled()
    expect(getActiveNotification()).toBeNull()
  })

  it('returns false when Notification is not supported on OS', () => {
    vi.spyOn(Notification, 'isSupported').mockReturnValue(false)

    const success = showNativeNotification({
      title: 'Focus Reminder',
      body: 'Unsupported'
    })

    expect(success).toBe(false)
    expect(getActiveNotification()).toBeNull()
  })
})
