import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ipcMain } from 'electron'
import { EvaluationIpcController } from '../EvaluationIpcController'
import { IpcChannels } from '../../../shared/types'

describe('EvaluationIpcController', () => {
  let handlers: Record<string, (...args: any[]) => any> = {}
  let controller: EvaluationIpcController
  let mockEvaluatorService: any
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

    mockEvaluatorService = {
      getSettings: vi.fn().mockReturnValue({ mode: 'embedded_lite', strictness: 'strict', requireProofOfWork: true }),
      updateSettings: vi.fn().mockReturnValue({ success: true }),
      submitForReview: vi.fn().mockResolvedValue({ id: 'eval-1', status: 'verified', score: 90 }),
      runAiReview: vi.fn().mockResolvedValue({ id: 'eval-1', status: 'verified', score: 90 }),
      getEvaluations: vi.fn().mockReturnValue([]),
      getMetrics: vi.fn().mockReturnValue({ mode: 'embedded_lite', totalEvaluations: 10, averageHonestyScore: 92 })
    }

    mockSecurity = {
      assertSenderIsAppWindow: vi.fn()
    }

    controller = new EvaluationIpcController({
      evaluatorService: mockEvaluatorService,
      security: mockSecurity
    })
    controller.register()
  })

  it('registers EvaluatorGetSettings and calls evaluatorService.getSettings', async () => {
    expect(handlers[IpcChannels.EvaluatorGetSettings]).toBeDefined()
    const result = await handlers[IpcChannels.EvaluatorGetSettings]({} as any)
    expect(mockSecurity.assertSenderIsAppWindow).toHaveBeenCalled()
    expect(result.mode).toBe('embedded_lite')
  })

  it('handles EvaluatorSubmitForReview with validation', async () => {
    expect(handlers[IpcChannels.EvaluatorSubmitForReview]).toBeDefined()
    const result = await handlers[IpcChannels.EvaluatorSubmitForReview]({} as any, {
      entityType: 'goal',
      entityId: 'goal-1',
      proofOfWork: 'Finished tasks'
    })
    expect(mockEvaluatorService.submitForReview).toHaveBeenCalled()
    expect(result.status).toBe('verified')

    await expect(handlers[IpcChannels.EvaluatorSubmitForReview]({} as any, {} as any)).rejects.toThrow()
  })

  it('unregisters all handlers on unregister()', () => {
    controller.unregister()
    expect(handlers[IpcChannels.EvaluatorGetSettings]).toBeUndefined()
    expect(handlers[IpcChannels.EvaluatorSubmitForReview]).toBeUndefined()
  })
})
