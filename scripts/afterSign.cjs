const { execSync } = require('child_process')
const path = require('path')
const fs = require('fs')
const os = require('os')

function run(cmd, options = {}) {
  console.log(`[afterSign] ${cmd}`)
  return execSync(cmd, { stdio: 'inherit', ...options })
}

function runSilent(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] })
  } catch {
    return ''
  }
}

module.exports = async function afterSign(context) {
  const { electronPlatformName, appOutDir } = context
  if (electronPlatformName !== 'darwin') return

  const appName = context.packager.appInfo.productFilename
  const appPath = path.join(appOutDir, `${appName}.app`)
  const entitlements = path.join(context.packager.info.projectDir, 'build/entitlements.mac.plist')

  console.log(`[afterSign] Ad-hoc signing ${appPath} with hardened runtime entitlements`)

  // macOS system daemons (Finder, fileprovider, Spotlight) can re-apply extended
  // attributes such as com.apple.FinderInfo and com.apple.fileprovider.fpfs#P to
  // the app bundle and its nested frameworks within seconds of clearing them.
  // codesign refuses with "resource fork, Finder information, or similar detritus
  // not allowed". Signing in /tmp avoids this race because those daemons do not
  // actively tag that location.
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smile-sign-'))
  const tmpAppPath = path.join(tmpDir, `${appName}.app`)

  try {
    // Copy to /tmp without resource forks / extended attributes.
    run(`ditto --norsrc "${appPath}" "${tmpAppPath}"`)

    // Strip any inherited attributes on the temp copy, then sign.
    runSilent(`/usr/bin/xattr -cr "${tmpAppPath}" 2>/dev/null`)
    runSilent(`/usr/bin/xattr -c "${tmpAppPath}" 2>/dev/null`)

    run(
      `codesign --force --deep --sign - --identifier com.smile.framework --entitlements "${entitlements}" --options runtime "${tmpAppPath}"`,
    )

    // Replace the original app with the signed copy.
    run(`rm -rf "${appPath}"`)
    run(`mv "${tmpAppPath}" "${appPath}"`)
  } finally {
    runSilent(`rm -rf "${tmpDir}"`)
  }

  console.log(`[afterSign] Finished signing ${appPath}`)
}
