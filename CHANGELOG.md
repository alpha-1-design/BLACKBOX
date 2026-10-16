# Changelog

All notable changes to BLACKBOX will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [2.0.7] — 2026-10-16

### Fixed
- **Voice note durations were wrong — and got saved wrong** — the recorder's clock did `_elapsedMs += 100` per `setInterval` tick and *saved that number* as the note's duration. A WebView throttles timers aggressively once the screen is off or the app is backgrounded, which is exactly when someone records a long note, so a ten-minute recording could be sealed with a duration minutes short and the on-screen timer was wrong for the same reason. Time is now measured in wall-clock segments: committed on pause and on stop, derived while live, and still only accruing while actually recording, so a paused minute is not billed.
- **A reviewed voice note could be destroyed by a stray tap — twice** — `review` holds the only unrecoverable thing in the panel, yet tapping **Record** started a new take and dropped it with no warning and no toast, and **Close** (or a tap on the backdrop) tore it down through `abort()`. Both now ask first, so a finished take needs a deliberate Discard. Locking still tears everything down unconditionally — `app.js` calls `VoiceModule.abort()` directly, not `close()`.
- **Playing voice notes leaked decrypted audio** — every play minted a fresh object URL for the decrypted blob and never released the previous one, so each replay pinned another full copy of the plaintext recording in memory for the life of the page. The previous URL is now released when playback is replaced, when a note ends, and on close.
- **Changing the speech model in settings silently did nothing** — `_getASR()` began with `if (_asr) return _asr;`, so the reload branch that compares `_loadedModel` against the configured model sat *after* an early return and could never run: once Whisper was loaded, changing `voiceModel` kept transcribing with the first model for the rest of the session. The cached pipeline is now reused only when it is the model actually being asked for.
- **The lock screen looked dead while the key was derived** — PBKDF2 is deliberately expensive, so between the 4th digit and either outcome there was a real gap with no feedback: the dots had already cleared and nothing said the tap registered. The pad now dims and the dots pulse (`.verifying`, reusing the existing `dotPulse` keyframes) for exactly as long as `_verifyPin()` is in flight, cleared by a `finally` on every exit path — success, wrong PIN, decoy panic, self-destruct — with an 8s watchdog behind it, because that state also ignores input and getting stuck in it would lock a user out of their own lock screen. Input during a check is ignored, which also removes a double-`_checkPin` race (two shakes, two `_refreshAll()`).
- **Dark mode made key controls invisible** — the dark accent is near-white (`#f5f5f7`), but Save buttons, active pills, active tabs, the toggle knob, the 2FA playback button, `.clip-btn`, `.tool-btn`, `.modal-save`, `.cool-cta` and toasts all hardcoded `color:#fff`. White text on a white fill. A `--on-accent` / `--on-text` / `--on-vivid` token set now supplies the foreground for every themed fill, per theme.
- **"Light" did nothing** — there was no `.theme-light` rule at all, and the OS dark default was an unscoped `@media (prefers-color-scheme: dark)` block that beat the user's class. Choosing Light on a dark-OS phone silently kept dark mode. The choice now lives on `<html data-theme>` (so it can theme the root element, which a `<body>` class never could) and the OS default is scoped to `html:not([data-theme])`. The status-bar `theme-color` follows the real theme, and `auto` keeps tracking the OS after load.
- **Glass and Neumorphic were stubs** — glass restyled only 7 hand-listed selectors and used `color-mix()`, which older Android WebViews drop, so it fell back to solid; with no wallpaper there was also nothing behind a card for `backdrop-filter` to refract. Neumo painted cards `var(--bg2)` (two hex points from `var(--surface)`) and paired a 12% black shadow with an invisible 5% white highlight. Glass now swaps the surface *tokens* (every surface goes translucent at once), keeps an ambient field behind the app, and adds real glass edges; neumo uses the page colour as the surface, a real shadow pair, inset inputs, and a true inset press state.
- **Wallpaper never changed back** — `Appearance.apply()` removed only `wall-1`..`wall-4`, so going from "Aurora" back to "Midnight" left both classes on and the later stylesheet rule won. Every `wall-*` class is cleared before one is applied.
- **Decoy calculator was unreadable in dark mode** — a hardcoded `#f2f2f7` sheet with `var(--text)` (near-white in dark) rendered the display and title at ~1:1 contrast. The sheet is now themed.
- **Journal Save button sat behind the bottom navigation bar, unscrollable** — `.main-app>*:not(#wallpaperLayer):not(#auroraLayer)` carried two ID selectors (specificity 2,0,0), which beat `.bottom-nav`'s own `z-index:10` and tied the nav and every `.tab-content` at `z-index:1`. Document order then painted the nav over modals opened from inside a tab, and `.tab-content` being a positioned element *with* a z-index also created a stacking context that trapped the modal's `z-index:1100` locally. Content now uses `position:relative` with no z-index, so a modal opened from a tab can climb above the nav.
- **Sensitive panels stayed on top of the lock screen** — `#genModal`, `#healthModal`, `#voiceModal`, `#coolModal`, `#infoModal`, `#deleteModal` and `#promptModal` are `<body>` children at `z-index:1100`, above the lock screen's `1000`, and locking only hid `#mainApp`. Opening the Password Generator and walking away left the plaintext password on an unlocked-looking lock screen. Locking now closes every overlay, stops the recorder and releases decrypted object URLs.
- **Auto-lock only reset on touch** — binding `touchstart` alone meant typing on the Android soft keyboard (a separate window whose taps never reach the document) let the vault seal mid-sentence with the form unsaved. Now `touchstart`, `pointerdown`, `keydown`, `wheel`, `scroll` and `mousemove` count, throttled to once a second.
- **Self-Destruct could never fire** — attempts 1–3 started a lockout, the lockout reset the counter to 0, and input is refused while locked out, so `failCount` could never reach the documented `>= 5`; the wipe was unreachable. Failures now accumulate across lockouts and only a successful unlock clears them.
- **The Home "Clipboard" switch did nothing** — it was wired to an empty callback, so it always rendered checked and silently lied. It now drives the real auto-clear, and turning it off cancels a pending purge.
- **"Check for Updates" fired twice per tap** — the row had its own listener *and* matched a document-level chooser, so tapping an available update re-ran the network check and popped the store picker on top of it.
- **Panic button had no danger affordance** — `.panic-btn` was defined in CSS but never applied to the element.
- **Copied secrets and 2FA codes never left the clipboard** — the Home panel promised a 30-second purge, but `secrets.js` (both copy buttons) and `auth.js` (copy button and row tap) called `navigator.clipboard.writeText()` directly and fire-and-forget, so an API key, password or live TOTP code stayed on the system clipboard indefinitely — exactly the exposure this app exists to prevent. Every sensitive copy now routes through `EncClipboard.copy()` — the secrets list, the secret detail view, both 2FA copy paths, generated passwords, and voice-note **transcripts** (the words of a private note, same exposure). It arms the same purge and reports whether the write actually landed; the old promise was never awaited, so a rejected write still reported "Copied".
- **Copy feedback could over-promise** — `copy()` returns `{ ok, purges }` rather than a boolean, and `EncClipboard.copyMessage()` is the single source of the wording, because returning a bare `true` when auto-clear is switched off made every "clears in 30s" message a lie — the same over-promise this change exists to remove. The `Clear` button in the Home panel already cancelled a pending purge when the toggle was turned off.
- **Backdrop dismissal was inconsistent** — tapping outside closed most panels but did nothing for the FAQ, confirm and prompt dialogs. All three now route through their own cancel path (`false` / `null` / dismiss), so the same affordance behaves the same everywhere.
- **"Overlay Dim" did nothing when toggled** — `overlay.js` existed and the service worker cached it (and CI asserted that caching), but there was **no `<script src="overlay.js">` tag**, so `PrivacyOverlay` was undefined at runtime. The toggle threw on change (the setting saved, nothing visible happened) and `_lockApp()` threw on its last line. The script is now loaded, and a new contract check asserts every app script is actually included by `index.html` — a file that is cached but never loaded was invisible to every existing check.
- **Escape could close a panel on an inactive tab** — `querySelectorAll('.modal:not(.hidden)')` also matches dialogs nested in a `.tab-content.hidden`, which are hidden by their ancestor rather than their own class, so Escape could "click" a close button on something not rendered. Now filtered by `getClientRects()`.
- **The FAQ and Privacy Policy had two nested scroll regions** — `.info-body` capped itself at `55vh` with its own `overflow-y` inside an already-scrolling panel.
- Removed dead CSS `.modal-actions-row:has(.modal-save[disabled])` — nothing in the app ever disables a `.modal-save`, so the rule never matched. This also drops the `:has()` dependency, alongside `color-mix()` which the glass rules no longer use.

### Added
- **The lock screen has a character** — a little black box that shuts its eyes with its paws the instant a digit lands and peeks again once you stop typing (`.pin-buddy`, driven by `buddy.js`). The paws spring up on a bezier, it blinks and breathes while idle, smiles on a correct PIN and throws its paws up on a wrong one. It is drawn to look manufactured: a face panel set into the body like a screen (so the `--bg` eyes read as cut-outs in both themes), an antenna LED in the accent colour that breathes while idle and **quickens while the key is being derived**, pupil highlights that blink with the eyes, a lid seam and two corner bolts. All inline SVG painted from `--text`/`--bg`/`--accent` — no image asset to ship or fail to load. The state machine is state + timing only, and `ci/buddy.test.js` drives it against a virtual clock: verified to fail when the stale-timer guard is removed (a pending peek would fire mid-PIN and wipe the smile), then restored byte-identical. Honours `prefers-reduced-motion`, and the LED halo is a stroked ring rather than a `drop-shadow` filter because a blur per frame is what drops frames on a low-end phone.
- **The lock screen answers on a phone** — an 8 ms tick per digit, a 12 ms pulse on unlock and a double pulse on a wrong PIN, carried by the same character module. `navigator.vibrate` is absent on desktop and in the web build, so it degrades to a silent no-op rather than an error (Android already declares `android.permission.VIBRATE`).
- **`ci/voice.test.js`** — drives `www/voice.js` through its own click handlers behind a DOM stub with fake timers and a fake clock, because the recorder's bugs live in behaviour no grep can see: it asserts a 2-minute take recorded with **zero timer callbacks firing** still saves as 120s (the old accounting saved 0s), that a 10-minute pause is not billed, that Record and Close refuse to discard a reviewed take when the confirm is declined, and that playing two notes releases the first object URL. Each assertion was verified to fail against a deliberately reverted fix, then the file was restored byte-identical.
- **`ci/buddy.test.js`** — the first check of *timing* rather than wiring. It also pins the two things that rot silently around a character: a state class the JS applies but the stylesheet never draws (the face just stops reacting, with no error), and a state nothing triggers (written but never shown). Wired into `npm test`.
- **`ci/boot.test.js` — the app is now booted, not just parsed** — it loads `www/` in the order `index.html` declares behind a DOM stub, runs the real `DOMContentLoaded` path, and asserts every global the app depends on exists plus eight cross-module contracts. Verified to fail when the `overlay.js` script tag is removed (reports `globals missing after boot: PrivacyOverlay`) and to pass once restored. Wired into `npm test`.
- **Live wallpapers** — every backdrop is oversized and drifts on a long transform-only loop (compositor-cheap, no per-frame repaint), plus four new live presets (Violet Drift, Nebula Bloom, Ember Flow, Graphite). Honours `prefers-reduced-motion`.
- **Voice notes: pause, resume, pre-listen, and a note** — the recorder only had start/stop. It is now a four-state machine (idle → recording ⇄ paused → review) with a live input level meter from an `AnalyserNode`, a real timer that only accrues while recording, MediaRecorder pause/resume, preview of the take before it is committed, an optional note saved encrypted alongside the recording, and Discard. Recordings are never auto-saved, so an accidental tap costs nothing.
- **Voice notes: real metadata** — recordings store their duration and note (encrypted, via an optional `meta` argument to `Vault.saveFile`), and the list shows the duration, the note, and a collapsible transcript instead of dumping the whole transcript into the row.
- **`ci/ui-contract.js` guards for the stub bug class** — one check asserts every class styled in `styles.css` is reachable from markup or JS (the voice recorder's entire design was orphaned CSS keyed off `.record-btn`/`.status-text`/`.mic-dot`/`.exit-rec`, none of which existed in the DOM); another asserts every `www/*.js` file is actually loaded by a `<script src>` tag (this is what `overlay.js` failed); and a third pins the theme/UI-style contract so the variants cannot silently regress to stubs.
- **Shake to Lock** — the README has advertised this since 2.0.0, but nothing ever called `ShakeLock.enable()`, there was no settings row and `S.shake` was declared and never read. It is now a real Settings → Security toggle that persists, and `enable()` resolves `true` only when the motion listener is actually attached — a declined permission prompt can no longer leave the switch claiming a capability the device refused.
- **Dialog accessibility** — every panel gets `role="dialog"`, `aria-modal="true"` and an `aria-labelledby` taken from its own title bar. Focus now moves into a dialog when it opens (first control, `preventScroll` so the page behind does not jump) and returns to whatever opened it on close. Previously only the voice panel was announced as a dialog and Tab walked straight into the page behind it.

### Changed
- The lock screen's `<meta name="theme-color">` is a single element rewritten from JS rather than a media-scoped pair that could only ever track the OS.
- Removed dead code that shipped to every user: `maintenance.js` (loaded in `<head>` and cached by the service worker, but its `MaintenanceModule` was never called by anything), `overlay.js`'s `_sync()` (wrote to `#blurDot`/`#blurTxt`, which have never existed) and `shake.js`'s `_sync()`, plus dead CSS (`.modal-action-bar`, `.setup-hint`, `.modal-save.in-progress`).
- The panic button is labelled for screen readers and now carries its danger styling.

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
