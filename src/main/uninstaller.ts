import { app, shell } from 'electron'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { spawn } from 'child_process'
import { logger } from './logger'
import { UninstallResult } from '../shared/types'

export interface UninstallOptions {
  isPackaged?: boolean
  platform?: NodeJS.Platform
  execPath?: string
  userDataPath?: string
  portableExePath?: string
  appImagePath?: string
  dataManager?: { close: () => void }
  quitApp?: () => void
  skipTimeout?: boolean
  spawnProcess?: typeof spawn
  keepUserData?: boolean
  prepareForExit?: () => Promise<void> | void
}

/**
 * Recursively purges the application user data directory (databases, logs, settings, cache).
 * Handles locked files gracefully by deleting unlockable child entries first and retrying with delay.
 */
export function purgeUserData(userDataPath: string): void {
  if (!userDataPath || typeof userDataPath !== 'string' || !fs.existsSync(userDataPath)) {
    return
  }

  // Guard against accidental root, system, or home directory deletion
  try {
    const resolved = path.resolve(userDataPath)
    const root = path.parse(resolved).root
    if (resolved === root || resolved === os.homedir() || resolved === path.dirname(os.homedir())) {
      logger.error(
        'app:uninstall',
        `Refusing to purge dangerous system or home directory: ${resolved}`
      )
      return
    }
  } catch (err) {
    logger.warn('app:uninstall', 'Failed to validate userDataPath safety:', err)
    return
  }

  // Attempt direct atomic recursive removal first
  try {
    fs.rmSync(userDataPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 })
    return
  } catch {
    // If top-level removal fails due to locked files (e.g. SQLite WAL or Chromium cache),
    // proceed to granular child traversal so non-locked directories and files are still purged.
  }

  function deleteRecursive(targetPath: string): void {
    if (!fs.existsSync(targetPath)) return
    try {
      const stat = fs.lstatSync(targetPath)
      if (stat.isDirectory()) {
        const entries = fs.readdirSync(targetPath)
        for (const entry of entries) {
          deleteRecursive(path.join(targetPath, entry))
        }
        try {
          fs.rmdirSync(targetPath)
        } catch {
          // ignore if directory still holds locked children
        }
      } else {
        try {
          fs.rmSync(targetPath, { force: true, maxRetries: 3, retryDelay: 50 })
        } catch {
          // If locked (e.g. SQLite WAL or Chromium cache), omit destructive truncation;
          // the post-exit script will cleanly remove the directory once processes exit.
        }
      }
    } catch {
      // ignore
    }
  }

  try {
    deleteRecursive(userDataPath)
  } catch (err) {
    logger.warn('app:uninstall', 'Error during user data recursive purge:', err)
  }

  try {
    if (fs.existsSync(userDataPath)) {
      fs.rmSync(userDataPath, { recursive: true, force: true })
    }
  } catch {
    // If files are still open by the OS or Chromium runtime, directory removal can be finalized by post-exit scripts
  }
}

/**
 * Executes a full uninstallation flow across platforms and distribution formats:
 * - Windows NSIS: Spawns the dedicated uninstaller executable and exits.
 * - Windows Portable: Purges user data, spawns a detached self-deleting script, and exits.
 * - macOS (.app): Purges user data, moves the .app bundle to the Trash, and exits.
 * - Linux (AppImage / Package): Purges user data, trashes AppImage if applicable, and exits.
 * - Dev Mode: Safely rejects the uninstallation to protect workspace files and developer data.
 */
export async function performUninstall(options: UninstallOptions = {}): Promise<UninstallResult> {
  try {
    const isPackaged = options.isPackaged ?? (app ? app.isPackaged : false)
    const platform = options.platform ?? process.platform
    const execPath = options.execPath ?? process.execPath
    const userDataPath = options.userDataPath ?? (app ? app.getPath('userData') : '')
    const quitApp =
      options.quitApp ??
      (() => {
        if (typeof app?.exit === 'function') {
          app.exit(0)
        } else if (typeof app?.quit === 'function') {
          app.quit()
        }
      })
    const spawnFn = options.spawnProcess ?? spawn

    logger.info(
      'app:uninstall',
      `Uninstallation initiated. Platform: ${platform}, Packaged: ${isPackaged}`
    )

    // 1. Guard against accidental uninstallation in development mode
    if (!isPackaged) {
      logger.warn(
        'app:uninstall',
        'Uninstallation requested in development mode. Aborting to protect project workspace.'
      )
      return {
        success: false,
        error:
          'Uninstallation is disabled in development mode to protect your source code. Please build and run a packaged application to test uninstallation.'
      }
    }

    // 2. Disable system startup / login item
    try {
      app?.setLoginItemSettings?.({ openAtLogin: false })
    } catch (err) {
      logger.warn('app:uninstall', 'Failed to disable startup login item:', err)
    }

    // 3. Prepare application resources and teardown windows/timers before releasing database & files
    if (options.prepareForExit) {
      try {
        await options.prepareForExit()
      } catch (err) {
        logger.warn('app:uninstall', 'Failed during prepareForExit teardown:', err)
      }
    }

    // 4. Close open database connections cleanly
    try {
      options.dataManager?.close()
    } catch (err) {
      logger.warn('app:uninstall', 'Failed to close database during uninstallation:', err)
    }

    // 5. Flush and release logger file descriptors before purging user data
    try {
      await logger.shutdown()
    } catch {
      // ignore
    }

    const scheduleExit = (callback: () => void, delayMs = 500): void => {
      if (options.skipTimeout) {
        callback()
      } else {
        setTimeout(callback, delayMs)
      }
    }

    // 4. Windows Platform
    if (platform === 'win32') {
      const uninstallerPath = path.join(path.dirname(execPath), 'Uninstall Focus.exe')

      if (fs.existsSync(uninstallerPath)) {
        try {
          const child = spawnFn(uninstallerPath, [], { detached: true, stdio: 'ignore' })
          child.unref()
          // Exit promptly (50ms) to avoid NSIS process collision / "Focus is running" dialog
          scheduleExit(() => quitApp(), 50)
          return {
            success: true,
            message: 'Launching Focus uninstaller...'
          }
        } catch (err) {
          logger.error('app:uninstall', 'Failed to launch Windows uninstaller executable:', err)
          return {
            success: false,
            error: `Failed to launch uninstaller: ${err instanceof Error ? err.message : String(err)}`
          }
        }
      }

      // Windows Portable or unpacked build (no dedicated uninstaller)
      logger.info('app:uninstall', 'Windows uninstaller not found. Running portable cleanup.')
      if (!options.keepUserData) {
        purgeUserData(userDataPath)
      }

      const portableExe = options.portableExePath ?? process.env.PORTABLE_EXECUTABLE_FILE
      if (portableExe && fs.existsSync(portableExe)) {
        try {
          // Sanitize paths to prevent command injection via quotes or newline control characters
          const sanitizeWinPath = (p: string): string => p.replace(/["\r\n\0]/g, '')
          const safeUserData = sanitizeWinPath(userDataPath)
          const safeExe = sanitizeWinPath(portableExe)

          // Schedule background cmd script to remove the locked portable executable after Focus terminates
          // Using ping for a reliable delay that works in detached/redirected environments (unlike timeout)
          const deleteUserDataCmd = options.keepUserData
            ? ''
            : `if exist "${safeUserData}" rmdir /s /q "${safeUserData}" & `
          const cmdScript = `ping 127.0.0.1 -n 3 > NUL & ${deleteUserDataCmd}if exist "${safeExe}" del /f /q "${safeExe}"`
          const child = spawnFn('cmd.exe', ['/d', '/s', '/c', `"${cmdScript}"`], {
            detached: true,
            stdio: 'ignore',
            windowsHide: true,
            windowsVerbatimArguments: true
          })
          child.unref()
        } catch (err) {
          logger.warn('app:uninstall', 'Failed to schedule portable exe cleanup script:', err)
        }
      }

      scheduleExit(() => quitApp(), 500)
      return {
        success: true,
        message:
          'Local application data removed and portable installation cleaned up. Focus will now close.'
      }
    }

    // 5. macOS Platform
    if (platform === 'darwin') {
      logger.info('app:uninstall', 'Running macOS uninstallation.')
      if (!options.keepUserData) {
        purgeUserData(userDataPath)
      }

      // In macOS packaged builds, execPath resides at Focus.app/Contents/MacOS/Focus
      const appBundlePath = path.resolve(execPath, '../../..')
      let bundleTrashed = false

      if (appBundlePath.endsWith('.app') && fs.existsSync(appBundlePath)) {
        try {
          await shell.trashItem(appBundlePath)
          bundleTrashed = true
          logger.info('app:uninstall', `Moved macOS app bundle to Trash: ${appBundlePath}`)
        } catch (err) {
          logger.warn(
            'app:uninstall',
            'Direct shell.trashItem failed on running app bundle, scheduling detached trash helper:',
            err
          )
          try {
            // macOS Finder locks the running binary; schedule background osascript to trash the bundle after exit
            const sanitizeMacPath = (p: string): string => p.replace(/["'\\]/g, '\\$&')
            const safeBundlePath = sanitizeMacPath(appBundlePath)
            const script = `sleep 1 && osascript -e 'tell application "Finder" to delete POSIX file "${safeBundlePath}"'`
            const child = spawnFn('sh', ['-c', script], { detached: true, stdio: 'ignore' })
            child.unref()
            bundleTrashed = true
          } catch (spawnErr) {
            logger.warn(
              'app:uninstall',
              'Failed to schedule detached macOS trash script:',
              spawnErr
            )
          }
        }
      }

      scheduleExit(() => quitApp(), 500)
      return {
        success: true,
        message: bundleTrashed
          ? 'Focus application and data moved to Trash. Focus will now close.'
          : 'Local application data removed. Please drag Focus.app to the Trash to complete uninstallation.'
      }
    }

    // 6. Linux Platform
    if (platform === 'linux') {
      logger.info('app:uninstall', 'Running Linux uninstallation.')
      if (!options.keepUserData) {
        purgeUserData(userDataPath)
      }

      const appImagePath = options.appImagePath ?? process.env.APPIMAGE
      let appImageTrashed = false

      if (appImagePath && fs.existsSync(appImagePath)) {
        try {
          await shell.trashItem(appImagePath)
          appImageTrashed = true
          logger.info('app:uninstall', `Moved Linux AppImage to Trash: ${appImagePath}`)
        } catch (err) {
          logger.warn('app:uninstall', 'Could not move Linux AppImage to Trash:', err)
        }
      }

      scheduleExit(() => quitApp(), 500)
      return {
        success: true,
        message: appImageTrashed
          ? 'Focus AppImage and local application data removed. Focus will now close.'
          : 'Local application data removed. You can now remove Focus using your system package manager.'
      }
    }

    // 7. Generic Fallback
    if (!options.keepUserData) {
      purgeUserData(userDataPath)
    }
    scheduleExit(() => quitApp(), 500)
    return {
      success: true,
      message: 'Local application data removed. Focus will now close.'
    }
  } catch (err) {
    logger.error('app:uninstall', 'Unexpected error during uninstallation:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err)
    }
  }
}
