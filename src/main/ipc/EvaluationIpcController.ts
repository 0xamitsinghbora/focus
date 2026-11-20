import { ipcMain } from 'electron'
import { IpcChannels, EvaluationSubmission } from '../../shared/types'
import { logger } from '../logger'
import type { EvaluatorService } from '../services/EvaluatorService'

export interface EvaluationIpcDependencies {
  evaluatorService: EvaluatorService
  security: {
    assertSenderIsAppWindow: (event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent) => void
  }
}

export class EvaluationIpcController {
  private deps: EvaluationIpcDependencies
  private isRegistered = false

  constructor(deps: EvaluationIpcDependencies) {
    this.deps = deps
  }

  public register(): void {
    if (this.isRegistered) return
    const { evaluatorService, security } = this.deps

    ipcMain.handle(IpcChannels.EvaluatorGetSettings, async (event) => {
      security.assertSenderIsAppWindow(event)
      try {
        return evaluatorService.getSettings()
      } catch (err) {
        logger.error('evaluator:ipc', 'Failed to get evaluator settings:', err)
        throw err
      }
    })

    ipcMain.handle(IpcChannels.EvaluatorUpdateSettings, async (event, settings) => {
      security.assertSenderIsAppWindow(event)
      try {
        return evaluatorService.updateSettings(settings || {})
      } catch (err) {
        logger.error('evaluator:ipc', 'Failed to update evaluator settings:', err)
        throw err
      }
    })

    ipcMain.handle(
      IpcChannels.EvaluatorSubmitForReview,
      async (event, submission?: EvaluationSubmission) => {
        security.assertSenderIsAppWindow(event)
        if (!submission || !submission.entityId || !submission.entityType) {
          throw new Error('Valid submission with entityId and entityType is required.')
        }
        try {
          return await evaluatorService.submitForReview(submission)
        } catch (err) {
          logger.error('evaluator:ipc', 'Failed to submit for local lite LLM review:', err)
          throw err
        }
      }
    )

    ipcMain.handle(
      IpcChannels.EvaluatorRunAiReview,
      async (event, submission?: EvaluationSubmission) => {
        security.assertSenderIsAppWindow(event)
        if (!submission || !submission.entityId) {
          throw new Error('Valid submission is required for local lite LLM review.')
        }
        try {
          return await evaluatorService.runAiReview(submission)
        } catch (err) {
          logger.error('evaluator:ipc', 'Failed to run local lite LLM review:', err)
          throw err
        }
      }
    )

    ipcMain.handle(
      IpcChannels.EvaluatorGetEvaluations,
      async (
        event,
        filter?: {
          entityType?: 'goal' | 'day_review' | 'session'
          entityId?: string
          date?: string
        }
      ) => {
        security.assertSenderIsAppWindow(event)
        try {
          return evaluatorService.getEvaluations(filter)
        } catch (err) {
          logger.error('evaluator:ipc', 'Failed to get evaluations:', err)
          throw err
        }
      }
    )

    ipcMain.handle(IpcChannels.EvaluatorGetMetrics, async (event) => {
      security.assertSenderIsAppWindow(event)
      try {
        return evaluatorService.getMetrics()
      } catch (err) {
        logger.error('evaluator:ipc', 'Failed to get evaluator metrics:', err)
        throw err
      }
    })

    this.isRegistered = true
  }

  public unregister(): void {
    if (!this.isRegistered) return
    ipcMain.removeHandler(IpcChannels.EvaluatorGetSettings)
    ipcMain.removeHandler(IpcChannels.EvaluatorUpdateSettings)
    ipcMain.removeHandler(IpcChannels.EvaluatorSubmitForReview)
    ipcMain.removeHandler(IpcChannels.EvaluatorRunAiReview)
    ipcMain.removeHandler(IpcChannels.EvaluatorGetEvaluations)
    ipcMain.removeHandler(IpcChannels.EvaluatorGetMetrics)
    this.isRegistered = false
  }
}
