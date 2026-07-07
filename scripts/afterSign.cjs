const { execSync } = require('child_process')
const path = require('path')

module.exports = async function afterSign(context) {
  const { electronPlatformName, appOutDir } = context
  if (electronPlatformName !== 'darwin') return

  const appName = context.packager.appInfo.productFilename
  const appPath = path.join(appOutDir, `${appName}.app`)
  const entitlements = path.join(context.packager.info.projectDir, 'build/entitlements.mac.plist')

  console.log(`[afterSign] Ad-hoc signing ${appPath} with hardened runtime entitlements`)

  execSync(`xattr -cr ${appPath}`)
  execSync(
    `codesign --force --deep --sign - --identifier com.smile.framework --entitlements ${entitlements} --options runtime ${appPath}`,
  )

  console.log(`[afterSign] Finished signing ${appPath}`)
}
