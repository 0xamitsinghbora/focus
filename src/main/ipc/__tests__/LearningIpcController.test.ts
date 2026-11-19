import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ipcMain } from 'electron'
import { LearningIpcController } from '../LearningIpcController'
import { IpcChannels } from '../../../shared/types'

describe('LearningIpcController', () => {
  let handlers: Record<string, (...args: any[]) => any> = {}
  let controller: LearningIpcController
  let mockLearningService: any
  let mockSecurity: any

  beforeEach(() => {
    handlers = {}
    vi.spyOn(ipcMain, 'handle').mockImplementation((channel: string, handler: any) => {
      handlers[channel] = handler
      return undefined as any
    })
    vi.spyOn(ipcMain, 'removeHandler').mockImplementation((channel: string) => {
      delete handlers[channel]
      return undefined as any
    })

    mockLearningService = {
      getTracks: vi.fn().mockResolvedValue([{ id: 'track-1', title: 'Rust' }]),
      resetStage: vi.fn().mockResolvedValue(undefined)
    }

    mockSecurity = {
      assertSenderIsAppWindow: vi.fn()
    }

    controller = new LearningIpcController({
      learningService: mockLearningService,
      security: mockSecurity
    })
    controller.register()
  })

  it('registers LearningGetTracks and returns tracks', async () => {
    expect(handlers[IpcChannels.LearningGetTracks]).toBeDefined()
    const result = await handlers[IpcChannels.LearningGetTracks]({} as any, 'active')
    expect(mockSecurity.assertSenderIsAppWindow).toHaveBeenCalled()
    expect(mockLearningService.getTracks).toHaveBeenCalledWith('active')
    expect(result).toEqual([{ id: 'track-1', title: 'Rust' }])
  })

  it('handles LearningResetStage with validation', async () => {
    expect(handlers[IpcChannels.LearningResetStage]).toBeDefined()
    const result = await handlers[IpcChannels.LearningResetStage]({} as any, {
      trackId: 'track-1',
      stage: 2,
      newDate: '2026-11-25'
    })
    expect(mockLearningService.resetStage).toHaveBeenCalledWith('track-1', 2, '2026-11-25')
    expect(result).toEqual({ success: true })

    await expect(
      handlers[IpcChannels.LearningResetStage]({} as any, {
        trackId: '',
        stage: 2,
        newDate: '2026-11-25'
      })
    ).rejects.toThrow('Invalid LearningResetStage payload')
  })

  it('unregisters handlers cleanly', () => {
    controller.unregister()
    expect(handlers[IpcChannels.LearningGetTracks]).toBeUndefined()
    expect(handlers[IpcChannels.LearningResetStage]).toBeUndefined()
  })
})
