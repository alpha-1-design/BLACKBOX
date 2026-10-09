# Changelog

All notable changes to BLACKBOX will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [2.0.6] — 2026-10-09

### Fixed
- **First-run PIN setup always said "PINs don't match"** (issues #3, #4) — the confirm step reassigned `confirmDigits` to a fresh array while the keypad closure kept pushing into the original one, so the comparison was always `"" === firstPin` and the pad went dead after the first attempt. Digits are now cleared in place, so re-entering the same PIN succeeds and the dots track every tap.
- **Microphone permission dialog never appeared** — `RECORD_AUDIO` and `MODIFY_AUDIO_SETTINGS` were missing from `AndroidManifest.xml`, so the WebView's `AUDIO_CAPTURE` request was auto-denied before Android could show a prompt. Declared both; voice notes now trigger the normal system mic permission flow.
- **Fingerprint/PIN rejected after the 2.0.4 update** (issue #3) — covered by the 2.0.5 legacy-verifier migration and Keystore-backed biometric key; 2.0.6 keeps that path and fixes the remaining first-run setup blocker.
- **Speech model + transcription library re-downloaded after every app update** — the service worker's activate step deleted *every* cache that wasn't the current shell, including transformers.js's own `transformers-cache` and the cached library bundle, so each release forced a ~40 MB re-download and made the first post-update transcription need a connection. The purge is now scoped: stale shell caches still go on every release, while the version-pinned library lives in a new release-independent cache and the model cache is spared — transcription works offline even immediately after updating.
- **"Cancel" didn't cancel the model download** — transformers.js v2 exposes no AbortSignal (upstream #1182), so the voice modal now messages the service worker to fail in-flight CDN transfers on the spot and tear down their response bodies; the panel stops immediately and a cancelled run's result is discarded, never saved.
- **Transcription progress showed the wrong percentage** — progress callbacks deliver `{progress, …}` objects (0–100) but were multiplied as 0–1 fractions, so the bar read "1%" or "NaN%". Progress is now normalized and the panel discloses the download honestly ("first time only · ~40 MB").
- **Edits and favorites moved journal entries to "today"** — saving an edited entry always stamped `Date.now()`; the original timestamp is now preserved so a diary entry never jumps to the present.
- **"Zero servers" now discloses the one-time model download** — new FAQ answer and Privacy Policy bullet explain the ~40 MB on-device model fetch (weights only; audio and transcripts never leave the device).

### Added
- **Update notification** — the app now checks for a new release shortly after unlock and shows a notification when one is available, instead of only when you tap "Check for Updates".
- **Request a feature** — new row in Settings that opens a pre-filled email so you can send ideas straight to the developer.
- **Password Generator** — cryptographically random passwords (rejection-sampled `getRandomValues`, guaranteed character-class coverage, secure shuffle) with a live entropy readout, length 8–64 and per-class toggles; reachable from Home and directly inside the secret form ("Generate a strong password" → "Use in secret").
- **Vault Health** — an offline audit that scores every entry 0–100 for strength (embedded dictionary, patterns, length, variety) and reuse, lists each issue with a jump-to-entry shortcut, and keeps a live score line on Home. No network involved.
- **Journal upgrade** — read-first entry view, calendar with mood-tinted days, day filter, entry stats, moods, tags, templates, writing prompts, favorites, per-entry photo attachments and .txt export.
- **Photo gallery & full-screen viewer** — list/gallery toggle for encrypted files and a full-screen viewer shared by Files and Journal.
- **Secret detail view** — tapping a secret opens a read-first detail (masked value, reveal on demand, copy/delete) instead of jumping straight into the editor.
- **Tap-to-copy 2FA codes** — tapping a TOTP row copies the current code.

### Improved
- **Premium feature voice across the app** — Home cards, Settings subtitles, the onboarding tour, empty states and toasts rewritten to speak plainly and precisely ("Wanna see something cool?" → "Take the tour"); removed a "passkeys" overclaim the Auth tab doesn't deliver; PWA install description updated.
- **Alive colours actually appear** — the aurora layer was inserted behind the opaque wallpaper and blended into the white theme, so toggling it looked dead; layering and blend modes fixed, plus a UI polish pass over panels, buttons, empty states and the photo viewer.

## [2.0.5] — 2026-09-28

### Fixed
- **Login broken after updating from ≤2.0.3** — the v2.0.4 PIN-hash change ignored existing plaintext verifiers, so every updating user was locked out with "Wrong PIN". Legacy plaintext verifiers are now accepted and silently upgraded to salted SHA-256 hashes on first successful unlock (both real and decoy PINs).
- **Fingerprint unlock dead after app restart** — the master key only lived in `sessionStorage`, which dies with the Android app process, so biometric unlock had nothing to unlock with on a cold start. The key is now mirrored into Android Keystore–encrypted storage (`EncryptedSharedPreferences`) and only handed back after a successful `BiometricPrompt`.
- **APK updates could serve a stale app session** — the service worker cached the document cache-first under a hand-managed cache name, so the first launch after an update was still served entirely from the previous release's cache (users saw the old hardcoded "BLACKBOX v2.0" About text and old behaviour), and any future release that didn't bump the cache name would freeze users on old assets permanently. The cache is now version-keyed per release and the document is network-first with the cache as the offline fallback, so an updated APK is live from the first launch.
- Self-destruct now also wipes the Keystore-backed biometric key and session storage.

### Improved
- **Lock screen motion** — staggered entrance for logo, PIN dots and numpad; springy dot fill and keypress scaling; red pulse + shake on wrong PIN; a vault-door fade-out transition into the app reveal; fingerprint button with icon and pulse on unlock.

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
