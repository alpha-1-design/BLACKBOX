# Changelog

All notable changes to BLACKBOX will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [2.0.4]

### Added
- **Encrypted File Vault** — import any file (photos, documents, recordings) into the vault: encrypted at rest with AES-256-GCM, list, download back from `Documents/BLACKBOX/`, delete.
- **Encrypted packages (`.bbshare`)** — wrap any file + a message with a shared PIN and send it any way you like (WhatsApp, email, Bluetooth); the recipient opens it in BLACKBOX, enters the PIN, and it decrypts. No server, no accounts.
- **Voice notes** — record in-app (encrypted like everything else), replay, and transcribe on-device (Whisper via transformers.js; model downloads once, then works offline). Transcripts are stored encrypted.
- **Alive colours** — liquid, Gemini-style colour blobs drift behind your vault (opt-in).
- **Wallpapers** — four hand-built gradients as backdrop for your notes pad, toggleable.
- **"Wanna see something cool?"** — a 30-second in-app tour that demos the alive colours and wallpapers live and turns everything on.
- **Encrypted full backup (`.bbvault`)** — export everything encrypted with its own passphrase (min 8 chars); the vault salt travels inside the envelope so the backup restores on any device. Legacy `.blackbox` import still works.
- In-app About version now renders from the single version source — it can no longer drift from the real build version.

### Fixed
- **Dim overlay actually works now** — `.privacy-overlay` had no CSS at all, so the toggle did nothing visible.
- Backup/export guards: export is blocked in non-main profiles to avoid confusing state.
- **Auth (2FA): codes now render correctly** — they previously showed `[object Promise]`; codes are also cached per 30-second window so Copy always copies the real code.
- **Change PIN no longer corrupts data** — it re-encrypts every store under the new key; previously changing the PIN made all saved secrets/journal entries unreadable after a restart.
- **PINs are no longer stored in plaintext** — only salted SHA-256 verifiers are kept. (Existing plaintext PINs are ignored; use Change PIN to set a new one.)
- **Journal: tapping an entry opens it** in the editor; Delete lives inside the editor — the "OK = Edit | Cancel = Delete" confirm maze is gone.
- **All system popups replaced with styled in-app dialogs** — alert/confirm/prompt rendered in the OS theme (not the app's colours) and broke flows.
- **Home clipboard copies readable text** — it previously pasted a `[BB:…]` base64 tag into other apps; text is still encrypted at rest and the system clipboard auto-clears after 30 seconds.
- Permission Audit now shows its results instead of only a toast.
- Update checker no longer errors when an update is found; GitHub repo casing fixed (`Blackbox` → `BLACKBOX`).
- Privacy tools (Tracker Cleaner / Fingerprint / URL Scanner) now reliably swap views; service worker caches the full app shell for offline launch.
- Decoy calculator no longer uses `eval()`; PIN setup requires a confirm step; theme colour aligned with the light UI.

## [2.0.3] — 2026-09-15
- Fix: **startup crash on Android 14+** — removed `@capacitor/share` v5, whose `load()` registers a `BroadcastReceiver` without the `RECEIVER_EXPORTED`/`RECEIVER_NOT_EXPORTED` flag required when targeting SDK 34 (`SecurityException` at plugin registration, before the UI could render).
- Fix: exports/backup files are now written to `Documents/BLACKBOX/` as promised (the previous build wrote to `Documents/Exports/` while the toast claimed `BLACKBOX/`).
- Share-sheet is gone for now; the saved file's real path is shown and the file can be opened from any Files app. A safe share implementation may return later.

## [2.0.2] — 2026-09-04
- Fix: secret list "click to reveal" now actually reveals the decrypted value.
- Fix: backups and file downloads now save via the native Filesystem plugin to `Documents/BLACKBOX/` (with the path shown) and offer a share sheet — no more invisible downloads.

## [2.0.1] — 2026-08-12
- Release APK now builds unsigned when no keystore env is set (F-Droid compatibility).

## [2.0.0] — 2026-05-01

Complete rebrand from ShieldSpace to BLACKBOX. Full UI rewrite with clean, minimal design system.

### Added
- Encrypted secrets manager with categories, tap-to-reveal, and one-tap copy
- Encrypted journal with timestamps and category tags
- TOTP 2FA authenticator with live countdown and manual secret entry
- Privacy tools module (permission audit, tracker URL cleaner, fingerprint viewer, URL scanner)
- F-Droid metadata structure (fastlane directory)
- Quick Settings tile for privacy overlay toggle
- Foreground service with notification for overlay persistence

### Changed
- Complete CSS rewrite: removed gradients, shadows, emojis; clean Pinterest-style design
- Renamed package from `com.shieldspace.app` to `com.blackbox.app`
- Updated app label from ShieldSpace to BLACKBOX across all components
- Increased PBKDF2 iterations from default to 150,000
- Extended vault.js to support multiple encrypted data stores
- Rewritten app.js for 6-tab navigation and module loading

### Removed
- Private browser tab (removed to reduce complexity)
- Intruder selfie camera feature
- Legacy JS modules (browser.js, camera.js, icons.js, overlay-manager.js, permissions.js)
- Legacy Python generator scripts (fix.py, native.py, update.py)
- All cyberpunk aesthetic elements

### Fixed
- MainActivity now properly registers Capacitor plugins
- AndroidManifest includes required foreground service and overlay permissions
- ShieldBiometricPlugin uses correct BiometricPrompt API
- ShieldOverlayService properly handles Android O+ foreground service requirements

### Security
- FLAG_SECURE enforced in onCreate and onPause
- All native plugins updated with BLACKBOX branding
- build.gradle includes androidx.biometric and androidx.security dependencies
