const { execFileSync } = require('child_process')
const path = require('path')

/**
 * electron-builder leaves the main executable linker-signed with the
 * generic "Electron" identifier. macOS Gatekeeper then reports the app as
 * "damaged" because the identifier does not match the bundle ID.
 *
 * Additionally, ad-hoc signed Electron apps need the
 * disable-library-validation entitlement (plus hardened runtime) or dyld
 * kills the process at launch with EXC_BREAKPOINT.
 */
module.exports = function afterSign(context) {
  const { electronPlatformName, appOutDir } = context
  if (electronPlatformName !== 'darwin') {
    return
  }

  const appName = context.packager.appInfo.productFilename
  const appPath = path.join(appOutDir, `${appName}.app`)
  const entitlements = path.join(context.packager.info.projectDir, 'build', 'entitlements.mac.plist')

  console.log(`[afterSign] Re-signing ${appPath} with com.smile.framework identifier + entitlements`)
  execFileSync('xattr', ['-cr', appPath], { stdio: 'inherit' })
  execFileSync(
    'codesign',
    [
      '--force',
      '--deep',
      '--sign',
      '-',
      '--identifier',
      'com.smile.framework',
      '--entitlements',
      entitlements,
      '--options',
      'runtime',
      appPath,
    ],
    { stdio: 'inherit' },
  )
}
