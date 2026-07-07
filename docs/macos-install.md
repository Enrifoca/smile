# Installing smile:D on macOS

The macOS `.dmg` and `.zip` releases are not signed with an Apple Developer ID, so macOS Gatekeeper may show **"app is damaged"** or **"Apple cannot verify"** when you try to open them. This is expected for an unsigned open-source app.

You can allow the app to run using one of the methods below.

## Quick fix: remove the quarantine flag

This is the safest and most reliable workaround. After copying `smile:D.app` to `/Applications`, run:

```bash
xattr -r -d com.apple.quarantine /Applications/smile:D.app
```

Then open the app normally. This works on macOS 14, 15, and 26 (Tahoe).

If the warning appears while opening the `.dmg`, remove the quarantine flag from the disk image before mounting it:

```bash
xattr -d com.apple.quarantine ~/Downloads/smileD-*.dmg
```

## Alternative: allow apps from anywhere

If removing the quarantine flag is not enough, you can temporarily show the **"Anywhere"** option in System Settings:

1. Open **System Settings → Privacy & Security**. Leave the window open.
2. In **Terminal**, run:
   ```bash
   sudo spctl --master-disable
   ```
   Enter your admin password when asked.
3. In **System Settings**, switch to another section (for example **Lock Screen**), then go back to **Privacy & Security**.
4. Scroll to **Security** and change **"Allow applications from"** to **"Anywhere"**.
5. Open `smile:D.app`.
6. When you are done, re-enable Gatekeeper:
   ```bash
   sudo spctl --master-enable
   ```

On macOS 26 you may still need to remove the quarantine flag even after allowing apps from anywhere.

## Why this happens

Apple Silicon Macs require apps to be **signed and notarized** by a registered Apple Developer to open without warnings. smile:D is currently distributed unsigned, so Gatekeeper intervenes. The steps above are the standard community workarounds for running unsigned software you trust.

## See also

- [Apple Support: Safely open apps on your Mac](https://support.apple.com/en-us/102445)
- [Swiss Mac User: Allow downloaded Apps in macOS Tahoe](https://swissmacuser.ch/fix-macos-tahoe-app-is-damaged-and-cant-be-opened-move-trash/)
