#!/usr/bin/env node
/**
 * Build bin/smile-dev.exe — a branded copy of Electron for local dev on Windows.
 * Packaged installers get their icon from electron-builder; dev must not use stock electron.exe.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const binDir = path.join(root, 'bin')
const sourceExe = path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe')
const brandedExe = path.join(binDir, 'smile-dev.exe')
const iconPath = path.join(root, 'public', 'icon.ico')

async function main() {
  if (process.platform !== 'win32') {
    console.log('brand-electron: skipped (Windows only)')
    return
  }

  const rceditModule = await import('rcedit')
  const rcedit = rceditModule.rcedit ?? rceditModule.default
  if (typeof rcedit !== 'function') {
    throw new TypeError(
      `rcedit export is not a function (available keys: ${Object.keys(rceditModule).join(', ')})`,
    )
  }

  if (!fs.existsSync(sourceExe)) {
    console.warn('brand-electron: electron.exe not found — run npm install first')
    return
  }
  if (!fs.existsSync(iconPath)) {
    console.warn('brand-electron: public/icon.ico missing — run npm run icons first')
    return
  }

  fs.mkdirSync(binDir, { recursive: true })

  const sourceMtime = fs.statSync(sourceExe).mtimeMs
  const needsCopy =
    !fs.existsSync(brandedExe) || fs.statSync(brandedExe).mtimeMs < sourceMtime

  if (needsCopy) {
    fs.copyFileSync(sourceExe, brandedExe)
  }

  await rcedit(brandedExe, {
    icon: iconPath,
    'version-string': {
      FileDescription: 'smile:D',
      ProductName: 'smile:D',
      InternalName: 'smile',
      OriginalFilename: 'smile.exe',
      CompanyName: 'smile:D',
    },
  })

  const info = fs.statSync(brandedExe)
  console.log(`brand-electron: ready ${brandedExe} (${Math.round(info.size / 1024)} KB)`)
}

main().catch(error => {
  console.error('brand-electron failed:', error)
  process.exit(1)
})
