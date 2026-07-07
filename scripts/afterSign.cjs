const { execFileSync } = require('child_process')
const path = require('path')

/**
 * electron-builder leaves the main executable linker-signed with the
 * generic "Electron" identifier. macOS Gatekeeper then reports the app as
 * "damaged" because the identifier does not match the bundle ID.
 * Re-sign the .app bundle ad-hoc with the correct bundle identifier.
 */
module.exports = function afterSign(context) {
  const { electronPlatformName, appOutDir } = context
  if (electronPlatformName !== 'darwin') {
    return
  }

  const appName = context.packager.appInfo.productFilename
  const appPath = path.join(appOutDir, `${appName}.app`)

  console.log(`[afterSign] Clearing extended attributes and re-signing ${appPath}`)
  execFileSync('xattr', ['-cr', appPath], { stdio: 'inherit' })
  execFileSync(
    'codesign',
    ['--force', '--deep', '--sign', '-', '--identifier', 'com.smile.framework', appPath],
    { stdio: 'inherit' },
  )
}
