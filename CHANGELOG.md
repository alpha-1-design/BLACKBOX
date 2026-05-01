# Changelog

All notable changes to BLACKBOX will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

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
