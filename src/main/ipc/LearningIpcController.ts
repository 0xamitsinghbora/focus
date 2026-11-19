import { ipcMain } from 'electron'
import { IpcChannels, LearningStage } from '../../shared/types'
import { logger } from '../logger'
import type { LearningService } from '../services/LearningService'

export interface LearningIpcDependencies {
  learningService: LearningService
  security: {
    assertSenderIsAppWindow: (event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent) => void
  }
}

export class LearningIpcController {
  private deps: LearningIpcDependencies
  private isRegistered = false

  constructor(deps: LearningIpcDependencies) {
    this.deps = deps
  }

  public register(): void {
    if (this.isRegistered) return
    const { learningService, security } = this.deps

    ipcMain.handle(IpcChannels.LearningGetTracks, async (event, status?: 'active' | 'mastered') => {
      security.assertSenderIsAppWindow(event)
      try {
        return await learningService.getTracks(status)
      } catch (err) {
        logger.error('learning:ipc', 'Failed to get learning tracks:', err)
        throw err
      }
    })

    ipcMain.handle(
      IpcChannels.LearningResetStage,
      async (event, payload?: { trackId: string; stage: LearningStage; newDate: string }) => {
        security.assertSenderIsAppWindow(event)
        if (
          !payload ||
          typeof payload.trackId !== 'string' ||
          !payload.trackId.trim() ||
          typeof payload.stage !== 'number' ||
          typeof payload.newDate !== 'string'
        ) {
          throw new Error('Invalid LearningResetStage payload')
        }
        try {
          await learningService.resetStage(payload.trackId, payload.stage, payload.newDate)
          return { success: true }
        } catch (err) {
          logger.error('learning:ipc', 'Failed to reset learning stage:', err)
          throw err
        }
      }
    )

    this.isRegistered = true
  }

  public unregister(): void {
    if (!this.isRegistered) return
    ipcMain.removeHandler(IpcChannels.LearningGetTracks)
    ipcMain.removeHandler(IpcChannels.LearningResetStage)
    this.isRegistered = false
  }
}
