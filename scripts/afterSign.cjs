const { notarize } = require('@electron/notarize')

module.exports = async function afterSign(context) {
  const { electronPlatformName, appOutDir } = context

  if (electronPlatformName !== 'darwin') {
    return
  }

  const appName = context.packager.appInfo.productFilename
  const appPath = `${appOutDir}/${appName}.app`

  const { APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID } = process.env

  if (!APPLE_ID || !APPLE_APP_SPECIFIC_PASSWORD || !APPLE_TEAM_ID) {
    console.log('[afterSign] Skipping notarization: missing Apple credentials')
    return
  }

  console.log(`[afterSign] Notarizing ${appPath}`)

  await notarize({
    appPath,
    appleId: APPLE_ID,
    appleIdPassword: APPLE_APP_SPECIFIC_PASSWORD,
    teamId: APPLE_TEAM_ID,
    tool: 'notarytool',
  })

  console.log(`[afterSign] Notarization complete for ${appPath}`)
}
