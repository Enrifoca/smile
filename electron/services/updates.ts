import { app, BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdateState } from '../../src/shared/updates'

/**
 * electron-updater can only update an AppImage on Linux, and detects one via the
 * APPIMAGE env var the AppImage runtime injects. Anywhere else on Linux a check
 * would fail and surface a raw error, so it is skipped entirely.
 */
function isUnsupportedLinuxBuild(): boolean {
  return process.platform === 'linux' && !process.env.APPIMAGE
}

/** Poll GitHub Releases (via electron-builder publish config) and auto-download updates. */
export class UpdateService {
  private window: BrowserWindow | null = null

  constructor() {
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = false
    autoUpdater.allowDowngrade = false

    autoUpdater.on('checking-for-update', () => {
      this.pushState({ status: 'checking', currentVersion: app.getVersion() })
    })

    autoUpdater.on('update-available', info => {
      this.pushState({
        status: 'available',
        currentVersion: app.getVersion(),
        version: info.version,
      })
    })

    autoUpdater.on('update-not-available', () => {
      this.pushState({
        status: 'idle',
        currentVersion: app.getVersion(),
        message: 'You are on the latest version.',
      })
    })

    autoUpdater.on('download-progress', progress => {
      this.pushState({
        status: 'downloading',
        currentVersion: app.getVersion(),
        percent: progress.percent,
      })
    })

    autoUpdater.on('update-downloaded', info => {
      this.pushState({
        status: 'ready',
        currentVersion: app.getVersion(),
        version: info.version,
      })
    })

    autoUpdater.on('error', error => {
      this.pushState({
        status: 'error',
        currentVersion: app.getVersion(),
        message: error.message,
      })
    })
  }

  setMainWindow(window: BrowserWindow | null): void {
    this.window = window
  }

  /** Start background checks once the app shell is ready. */
  scheduleStartupCheck(delayMs = 8000): void {
    if (!app.isPackaged) return
    if (isUnsupportedLinuxBuild()) return
    setTimeout(() => {
      void this.checkForUpdates()
    }, delayMs)
  }

  async checkForUpdates(): Promise<UpdateState> {
    if (!app.isPackaged) {
      const state: UpdateState = {
        status: 'dev-skipped',
        currentVersion: app.getVersion(),
        message: 'Updates are checked in installed releases only.',
      }
      this.pushState(state)
      return state
    }

    if (isUnsupportedLinuxBuild()) {
      const state: UpdateState = {
        status: 'idle',
        currentVersion: app.getVersion(),
        message: 'Automatic updates are available in the AppImage build only.',
      }
      this.pushState(state)
      return state
    }

    try {
      await autoUpdater.checkForUpdates()
    } catch (error) {
      const state: UpdateState = {
        status: 'error',
        currentVersion: app.getVersion(),
        message: error instanceof Error ? error.message : 'Update check failed',
      }
      this.pushState(state)
      return state
    }

    return {
      status: 'checking',
      currentVersion: app.getVersion(),
    }
  }

  quitAndInstall(): void {
    if (!app.isPackaged) return
    autoUpdater.quitAndInstall()
  }

  getVersion(): string {
    return app.getVersion()
  }

  isPackaged(): boolean {
    return app.isPackaged
  }

  private pushState(state: UpdateState): void {
    this.window?.webContents.send('updates:state', state)
  }
}

let updateService: UpdateService | null = null

export function getUpdateService(): UpdateService {
  if (!updateService) updateService = new UpdateService()
  return updateService
}
