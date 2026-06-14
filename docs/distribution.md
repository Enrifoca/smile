# Distribution & updates

How to ship smile:D as `.exe` / `.dmg`, host downloads on your website, and deliver automatic updates from GitHub Releases.

## Overview

| Piece | Role |
| --- | --- |
| **electron-builder** | Builds installers into `release/` |
| **GitHub Releases** | Hosts installers + `latest.yml` / `latest-mac.yml` for auto-update |
| **electron-updater** | Checks releases and downloads updates in the installed app |
| **Update toast** | Bottom-right notification (`UpdateToast`) — restart when ready |
| **Settings → App updates** | Manual “Check for updates” + current version |

Manual download (website): link to the `.exe` or `.dmg` assets on the [GitHub Release](https://github.com/enrifoca/smile/releases) page.

Auto-update (installed app): uses the same release metadata — users do not re-download from the site for patch/minor updates.

## Build locally

```bash
npm ci
# Windows (unsigned — set env var to skip code-sign tooling; see note below)
set CSC_IDENTITY_AUTO_DISCOVERY=false
npm run build:win
npm run build:mac   # macOS → release/*.dmg + .zip (zip is used by auto-updater)
```

On Windows, if the build fails extracting `winCodeSign` with a symlink error, use `CSC_IDENTITY_AUTO_DISCOVERY=false` as above (already set in CI). `signAndEditExecutable: false` in `package.json` avoids editing the executable for signing.

Outputs land in `release/`.

Generate app icons from `public/icon.svg` (white canvas, `:D` mark) before release:

```bash
npm run icons   # writes public/icon.png, icon.ico, icon.icns
```

1. Bump `version` in `package.json` (semver).
2. Commit and tag: `git tag v0.2.0 && git push origin v0.2.0`
3. GitHub Actions workflow [`.github/workflows/release.yml`](../.github/workflows/release.yml) builds Windows + macOS and runs `electron-builder --publish always`.
4. Assets appear on the GitHub Release. Point your website download buttons to:
   - `…/releases/latest/download/smile-D-Setup-x.y.z.exe` (exact name varies — check release assets)
   - `…/releases/latest/download/smile-D-x.y.z.dmg`

Update `build.publish.owner` / `repo` in `package.json` if you fork or rename the repository.

### CI notes

- Requires `GITHUB_TOKEN` (provided automatically in Actions).
- `CSC_IDENTITY_AUTO_DISCOVERY: false` in CI skips code signing until you configure certificates (see below).
- macOS builds must run on `macos-latest`; Windows on `windows-latest`.

## Auto-update behavior

Implemented in `electron/services/updates.ts`.

- Runs only when `app.isPackaged` (not in `npm run dev`).
- Checks ~8 seconds after startup, then on demand from Settings.
- **autoDownload: true** — update downloads in background.
- When ready → toast **“Restart to update”** → `quitAndInstall()`.

Dev mode: Settings shows *“Updates are checked in installed releases only.”*

## Code signing — do you need it?

**Not required** for the app to run or for auto-update to work in development / internal beta.

**Strongly recommended** for public distribution:

| Platform | Without signing | With signing |
| --- | --- | --- |
| **Windows** | SmartScreen: “Windows protected your PC” / unknown publisher | Trusted publisher, fewer scary dialogs |
| **macOS** | Gatekeeper may block open; users must right-click → Open | Normal double-click install |

### What is code signing?

A **digital certificate** proves the installer/app was built by you (or your company), not tampered with. The OS trusts signed binaries from known publishers.

- **Windows**: Authenticode certificate (from a CA such as DigiCert, Sectigo). Sign the `.exe` installer.
- **macOS**: Apple Developer Program ($99/year) + **Developer ID Application** cert + **notarization** (Apple scans and approves the build).

electron-builder supports both via env vars in CI:

```bash
# Windows (example)
CSC_LINK=path/to/cert.pfx
CSC_KEY_PASSWORD=…

# macOS (example)
CSC_LINK=path/to/DeveloperID.p12
CSC_KEY_PASSWORD=…
APPLE_ID=…
APPLE_APP_SPECIFIC_PASSWORD=…
APPLE_TEAM_ID=…
```

Until then, unsigned builds are fine for testing and early adopters who accept OS warnings.

## Website download page

Minimal pattern:

1. Two buttons: **Download for Windows** / **Download for Mac**.
2. Links to GitHub Release assets (stable URL with `/releases/latest/download/…` once naming is stable).
3. Optional: show current version from the latest GitHub release API.

The auto-updater does **not** replace first install — users still need the installer once.

## Related files

| File | Purpose |
| --- | --- |
| `package.json` → `build` | electron-builder targets + `publish` |
| `electron/services/updates.ts` | UpdateService |
| `src/context/UpdateContext.tsx` | Renderer state |
| `src/components/UpdateToast.tsx` | Toast UI |
| `src/components/SettingsView.tsx` | Manual check |
| `.github/workflows/release.yml` | CI release |
