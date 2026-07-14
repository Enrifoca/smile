const fs = require('fs')
const path = require('path')

// An AppImage is a read-only mount, so chrome-sandbox cannot be setuid root and
// Chromium aborts with "no usable sandbox" on distros that also restrict
// unprivileged user namespaces (Ubuntu 23.10+). AppRun execs the binary with no
// arguments, and --no-sandbox has to be set before the process starts, so neither
// the .desktop Exec line nor app.commandLine can supply it: the real executable is
// wrapped in a launcher that adds the flag.
//
// The .deb installs a setuid chrome-sandbox in its postinst, so it keeps a working
// sandbox — hence the flag is added only when running from an AppImage ($APPIMAGE).
const LAUNCHER = `#!/bin/bash
BIN="$(dirname "$(readlink -f "$0")")/%EXE%.bin"
if [ -n "$APPIMAGE" ]; then
  exec "$BIN" --no-sandbox "$@"
fi
exec "$BIN" "$@"
`

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'linux') return

  const executableName = context.packager.executableName
  const executable = path.join(context.appOutDir, executableName)
  const real = `${executable}.bin`

  if (fs.existsSync(real)) return

  fs.renameSync(executable, real)
  fs.writeFileSync(executable, LAUNCHER.replace('%EXE%', executableName), { mode: 0o755 })

  console.log(`[afterPack] Wrapped ${executableName} in a sandbox-aware launcher`)
}
