import { describe, it, expect } from 'vitest'
import {
  formatSecondsForTaskbar,
  formatHumanDuration,
  formatTaskbarTitle,
  formatTaskbarThumbnailTooltip,
  formatTrayTooltip,
  formatTrayMenuLabel,
  calculateTaskbarProgress
} from '../taskbar'
import { SessionTimerPayload } from '../types'

describe('taskbar helpers', () => {
  describe('formatSecondsForTaskbar', () => {
    it('formats mm:ss correctly', () => {
      expect(formatSecondsForTaskbar(0)).toBe('00:00')
      expect(formatSecondsForTaskbar(59)).toBe('00:59')
      expect(formatSecondsForTaskbar(60)).toBe('01:00')
      expect(formatSecondsForTaskbar(1475)).toBe('24:35')
    })

    it('formats hh:mm:ss for durations >= 1 hour', () => {
      expect(formatSecondsForTaskbar(3600)).toBe('1:00:00')
      expect(formatSecondsForTaskbar(3665)).toBe('1:01:05')
    })
  })

  describe('formatHumanDuration', () => {
    it('formats seconds, minutes, and hours', () => {
      expect(formatHumanDuration(30)).toBe('30s')
      expect(formatHumanDuration(60)).toBe('1m')
      expect(formatHumanDuration(1500)).toBe('25m')
      expect(formatHumanDuration(3600)).toBe('1h')
      expect(formatHumanDuration(3900)).toBe('1h 5m')
    })
  })

  describe('formatTaskbarTitle', () => {
    it('returns "focus" when inactive', () => {
      const payload: SessionTimerPayload = {
        isActive: false,
        isPaused: false,
        isBreak: false,
        isOvertime: false,
        secondsRemaining: 0,
        totalSeconds: 0
      }
      expect(formatTaskbarTitle(payload)).toBe('focus')
    })

    it('formats active focus session with goal title', () => {
      const payload: SessionTimerPayload = {
        isActive: true,
        isPaused: false,
        isBreak: false,
        isOvertime: false,
        goalTitle: 'Deep Work',
        secondsRemaining: 1500,
        totalSeconds: 1500
      }
      expect(formatTaskbarTitle(payload)).toBe('25:00 - Deep Work | focus')
    })

    it('formats paused session', () => {
      const payload: SessionTimerPayload = {
        isActive: true,
        isPaused: true,
        isBreak: false,
        isOvertime: false,
        goalTitle: 'Deep Work',
        secondsRemaining: 1200,
        totalSeconds: 1500
      }
      expect(formatTaskbarTitle(payload)).toBe('20:00 (Paused) - Deep Work | focus')
    })

    it('formats paused session with pause red timer and noted green task time', () => {
      const payload: SessionTimerPayload = {
        isActive: true,
        isPaused: true,
        isBreak: false,
        isOvertime: false,
        goalTitle: 'Deep Work',
        secondsRemaining: 1200,
        totalSeconds: 1500,
        pauseStartEpoch: Date.now() - 35 * 1000
      }
      expect(formatTaskbarTitle(payload)).toBe('[Pause 00:35] Deep Work (Noted: 20:00) | focus')
    })

    it('formats overtime session', () => {
      const payload: SessionTimerPayload = {
        isActive: true,
        isPaused: false,
        isBreak: false,
        isOvertime: true,
        goalTitle: 'Deep Work',
        secondsRemaining: -75,
        totalSeconds: 1500
      }
      expect(formatTaskbarTitle(payload)).toBe('+01:15 (Overtime) - Deep Work | focus')
    })

    it('formats break session', () => {
      const payload: SessionTimerPayload = {
        isActive: true,
        isPaused: false,
        isBreak: true,
        isOvertime: false,
        secondsRemaining: 300,
        totalSeconds: 300
      }
      expect(formatTaskbarTitle(payload)).toBe('05:00 - Break | focus')
    })
  })

  describe('formatTaskbarThumbnailTooltip', () => {
    it('formats thumbnail tooltip for various states', () => {
      expect(
        formatTaskbarThumbnailTooltip({
          isActive: true,
          isPaused: false,
          isBreak: false,
          isOvertime: false,
          goalTitle: 'Refactor',
          secondsRemaining: 600,
          totalSeconds: 1500
        })
      ).toBe('Focusing: Refactor (10m left)')

      expect(
        formatTaskbarThumbnailTooltip({
          isActive: true,
          isPaused: true,
          isBreak: false,
          isOvertime: false,
          goalTitle: 'Refactor',
          secondsRemaining: 600,
          totalSeconds: 1500
        })
      ).toBe('Paused: Refactor (10m left)')

      expect(
        formatTaskbarThumbnailTooltip({
          isActive: true,
          isPaused: true,
          isBreak: false,
          isOvertime: false,
          goalTitle: 'Refactor',
          secondsRemaining: 600,
          totalSeconds: 1500,
          pauseStartEpoch: Date.now() - 60 * 1000
        })
      ).toBe('Paused: 1m · Noted green task: Refactor (10m left)')

      expect(
        formatTaskbarThumbnailTooltip({
          isActive: true,
          isPaused: false,
          isBreak: false,
          isOvertime: true,
          goalTitle: 'Refactor',
          secondsRemaining: -120,
          totalSeconds: 1500
        })
      ).toBe('Overtime: Refactor (+2m)')

      expect(
        formatTaskbarThumbnailTooltip({
          isActive: true,
          isPaused: false,
          isBreak: true,
          isOvertime: false,
          secondsRemaining: 180,
          totalSeconds: 300
        })
      ).toBe('Break (3m left)')
    })
  })

  describe('formatTrayTooltip and formatTrayMenuLabel', () => {
    it('formats tray tooltip with seconds and menu status label', () => {
      const payload: SessionTimerPayload = {
        isActive: true,
        isPaused: false,
        isBreak: false,
        isOvertime: false,
        goalTitle: 'Write Docs',
        secondsRemaining: 900,
        totalSeconds: 1500
      }

      expect(formatTrayTooltip(payload)).toBe('Focus: 15:00 remaining - Write Docs')
      expect(formatTrayMenuLabel(payload)).toBe('Focusing: Write Docs (15:00)')

      const pausedPayload: SessionTimerPayload = {
        ...payload,
        isPaused: true,
        pauseStartEpoch: Date.now() - 45 * 1000
      }
      expect(formatTrayTooltip(pausedPayload)).toBe(
        'Pause: 00:45 · Noted green task: Write Docs (15:00 remaining)'
      )
    })

    it('formats tray tooltip and menu label when idle with next prompt text', () => {
      const payload: SessionTimerPayload = {
        isActive: false,
        isPaused: false,
        isBreak: false,
        isOvertime: false,
        secondsRemaining: 0,
        totalSeconds: 0
      }

      expect(formatTrayTooltip(payload, 'Next session in 14m')).toBe('focus - Next session in 14m')
      expect(formatTrayMenuLabel(payload, 'Next session in 14m')).toBe('Next session in 14m')
    })
  })

  describe('calculateTaskbarProgress', () => {
    it('returns -1 and none when inactive', () => {
      expect(
        calculateTaskbarProgress({
          isActive: false,
          isPaused: false,
          isBreak: false,
          isOvertime: false,
          secondsRemaining: 0,
          totalSeconds: 0
        })
      ).toEqual({ progress: -1, mode: 'none' })
    })

    it('calculates fraction and normal mode during active session', () => {
      expect(
        calculateTaskbarProgress({
          isActive: true,
          isPaused: false,
          isBreak: false,
          isOvertime: false,
          secondsRemaining: 750,
          totalSeconds: 1500
        })
      ).toEqual({ progress: 0.5, mode: 'normal' })
    })

    it('returns paused mode when paused', () => {
      expect(
        calculateTaskbarProgress({
          isActive: true,
          isPaused: true,
          isBreak: false,
          isOvertime: false,
          secondsRemaining: 750,
          totalSeconds: 1500
        })
      ).toEqual({ progress: 0.5, mode: 'paused' })
    })

    it('returns error mode with 1.0 progress when in overtime', () => {
      expect(
        calculateTaskbarProgress({
          isActive: true,
          isPaused: false,
          isBreak: false,
          isOvertime: true,
          secondsRemaining: -30,
          totalSeconds: 1500
        })
      ).toEqual({ progress: 1, mode: 'error' })
    })
  })
})
