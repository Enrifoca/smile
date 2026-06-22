import fs from 'fs'
import path from 'path'
import { app, nativeImage, type BrowserWindow, type NativeImage } from 'electron'

const APP_USER_MODEL_ID = 'com.smile.framework'
const APP_USER_MODEL_ID_DEV = 'com.smile.framework.dev'

function iconCandidates(): string[] {
  // PNG first — ICO can load as empty in some Electron/Windows combinations.
  if (process.platform === 'win32') return ['icon.png', 'icon.ico']
  if (process.platform === 'darwin') return ['icon.icns', 'icon.png']
  return ['icon.png', 'icon.ico']
}

function iconSearchDirs(): string[] {
  const root = app.getAppPath()
  const dirs = [
    path.join(root, 'public'),
    path.join(process.cwd(), 'public'),
    path.join(__dirname, '..', 'public'),
  ]
  if (app.isPackaged) {
    dirs.unshift(path.join(root, 'dist'))
  }
  return [...new Set(dirs)]
}

/** Absolute path to the first loadable app icon asset, or null if none exist. */
export function resolveAppIconPath(): string | null {
  for (const dir of iconSearchDirs()) {
    for (const name of iconCandidates()) {
      const candidate = path.join(dir, name)
      if (!fs.existsSync(candidate)) continue
      const image = nativeImage.createFromPath(candidate)
      if (!image.isEmpty()) return candidate
    }
  }
  return null
}

export function loadAppIcon(): NativeImage | undefined {
  const iconPath = resolveAppIconPath()
  if (!iconPath) return undefined

  const image = nativeImage.createFromPath(iconPath)
  return image.isEmpty() ? undefined : image
}

/** Window + dock icon, and Windows taskbar identity for dev and packaged builds. */
export function applyAppIcon(win?: BrowserWindow | null): void {
  const image = loadAppIcon()
  const iconPath = resolveAppIconPath()

  if (process.platform === 'win32') {
    // Packaged: stable ID for pinning. Dev: separate ID to avoid Windows icon cache from stock Electron.
    app.setAppUserModelId(app.isPackaged ? APP_USER_MODEL_ID : APP_USER_MODEL_ID_DEV)
  }

  if (!image) {
    if (!app.isPackaged) {
      console.warn('[appIcon] No loadable icon found — run npm run icons && npm run brand-electron on Windows')
    }
    return
  }

  if (!app.isPackaged && iconPath) {
    console.log('[appIcon] Using', iconPath, '| process:', process.execPath)
  }

  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(image)
  }

  if (win && !win.isDestroyed()) {
    win.setIcon(image)
  }
}
