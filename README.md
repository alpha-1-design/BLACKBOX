# BLACKBOX

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![F-Droid Metadata](https://img.shields.io/badge/F--Droid-ready-green.svg)](https://f-droid.org)

Offline security hub for developers and creators. AES-256 encrypted secrets manager, journal, 2FA authenticator, and privacy tools — 100% on-device, zero cloud.

---

## Screenshots

_(Placeholder — add screenshots to `fastlane/metadata/android/en-US/images/phoneScreenshots/`)_

---

## Features

### Secrets Manager
- Store API keys, passwords, tokens, and credentials in an encrypted vault
- Organize by category (API, Database, SSH, OAuth, etc.)
- Tap-to-reveal sensitive values, one-tap copy to clipboard
- Full-text search across all stored secrets

### Encrypted Journal
- Timestamped entries with category tags (work, personal, security, ideas)
- AES-256-GCM encryption per entry
- Category filtering and chronological browsing

### 2FA / Authenticator
- TOTP (Time-based One-Time Password) generator per RFC 6238
- Manual secret entry with Base32 decoding
- Live countdown with visual progress indicator
- No cloud sync, no account registration needed

### Privacy Tools
- **Permission Audit** — Review which Android permissions the app has
- **Tracker URL Cleaner** — Strip tracking parameters from URLs (utm_, fbclid, etc.)
- **Browser Fingerprint** — View your browser's exposed fingerprint data
- **URL Scanner** — Check URLs against known phishing/malware databases

### Security Core
- **AES-256-GCM** encryption via Web Crypto API
- **PBKDF2-SHA256** key derivation with 150,000 iterations
- **FLAG_SECURE** — blocks screenshots and screen recording on Android
- **Biometric unlock** — fingerprint or face via Android BiometricPrompt
- **Panic mode** — calculator decoy triggered by PIN prefix
- **Auto-lock** — locks on inactivity or app backgrounding
- **Privacy overlay** — screen dim overlay via Quick Settings tile
- **Shake-to-lock** — shake device to instantly lock the vault

---

## Install

### From Source

```bash
# Clone the repository
git clone https://github.com/alpha-1-design/BLACKBOX.git
cd BLACKBOX

# Install dependencies
npm install

# Initialize Capacitor
npx cap init BLACKBOX com.blackbox.app --web-dir www

# Add Android platform
npx cap add android

# Sync web assets and native plugins
npx cap sync android

# Open in Android Studio
npx cap open android

# Or build APK directly from CLI
cd android && ./gradlew assembleDebug
```

The APK will be at `android/app/build/outputs/apk/debug/app-debug.apk`.

### Build Requirements
- Node.js 18+
- Java 17 JDK
- Android SDK 34
- Gradle 8.9

---

## Architecture

```
BLACKBOX/
├── www/                     # Web frontend (HTML/CSS/JS)
│   ├── index.html           # Main application shell
│   ├── styles.css           # Design system + component styles
│   ├── app.js               # Core app logic (routing, lock, settings)
│   ├── vault.js             # Multi-store AES-256-GCM encryption engine
│   ├── secrets.js           # Secrets manager module
│   ├── journal.js           # Encrypted journal module
│   ├── auth.js              # TOTP authenticator module
│   ├── privacy.js           # Privacy tools module
│   ├── overlay.js           # Screen blur overlay
│   ├── shake.js             # Device shake detection
│   ├── clipboard.js         # Encrypted clipboard helper
│   └── manifest.json        # PWA manifest
├── android/                 # Android native (Capacitor)
│   └── app/src/main/java/com/blackbox/app/
│       ├── MainActivity.java          # Entry point + plugin registration
│       ├── ShieldBiometricPlugin.java # Fingerprint/face unlock
│       ├── ShieldPermissionsPlugin.java # Runtime permissions
│       ├── ShieldOverlayPlugin.java   # Privacy overlay control
│       ├── ShieldOverlayService.java  # Foreground overlay service
│       ├── ShieldOverlayTile.java     # Quick Settings tile
│       └── ShieldNotificationService.java # Notification helper
└── fastlane/                # F-Droid metadata
    └── metadata/android/en-US/
```

All data is stored in `localStorage` encrypted with keys derived from the user's master PIN. Nothing is ever transmitted over the network.

---

## F-Droid Submission

BLACKBOX is designed to be F-Droid compatible. The build process is:

1. **Local build verification** — F-Droid maintainers first build the APK from source using the Gradle commands above. The output APK must be byte-for-byte reproducible with their build server.
2. **Metadata submission** — The `fastlane/metadata/android/` directory contains the title, descriptions, and screenshot placeholders required by F-Droid.
3. **fdroiddata merge request** — A new YAML file is added to the [fdroiddata repository](https://gitlab.com/fdroid/fdroiddata) with build instructions, version codes, and source references.
4. **Automated build** — F-Droid's build server clones this repo, builds the APK with the specified Gradle task, verifies the hash, and publishes it.

### Reproducible Build Check

To verify your build matches what F-Droid expects:

```bash
cd android
./gradlew assembleRelease
sha256sum app/build/outputs/apk/release/app-release.apk
```

The SHA-256 should be consistent across builds with the same source code and toolchain.

### Current F-Droid Checklist
- [x] `fastlane/metadata/android/` directory with title and descriptions
- [x] No proprietary dependencies (Google Play Services, Firebase, etc.)
- [x] No network calls or analytics
- [x] Reproducible Gradle build
- [x] Clean open-source license (MIT)
- [ ] Screenshots in `fastlane/metadata/android/en-US/images/phoneScreenshots/`
- [ ] App icon in `fastlane/metadata/android/en-US/images/icon/`
- [ ] Submission to fdroiddata via merge request

---

## Security Model

### Encryption Flow

```
User enters PIN
      │
      ▼
PBKDF2-SHA256 (150,000 iterations)
      │
      ▼
AES-256-GCM encryption key (256-bit)
      │
      ▼
Encrypt/decrypt data stores via Web Crypto API
      │
      ▼
Store encrypted blobs in localStorage
```

### Key Properties
- **Key is never stored** — derived fresh from PIN on each unlock
- **No server-side key** — impossible to recover without PIN
- **GCM mode** — provides authenticated encryption (detects tampering)
- **Unique IVs** — each encryption uses a fresh initialization vector
- **PIN reset = data loss** — by design, ensures no backdoor exists

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on how to contribute to BLACKBOX.

---

## Roadmap

- [ ] Hardware-backed key storage (Android Keystore)
- [ ] Encrypted QR code export/import for 2FA secrets
- [ ] Passkey/WebAuthn support for biometric PIN recovery
- [ ] Dark theme (auto, light, dark, system)
- [ ] Encrypted file attachment support
- [ ] Secure note sharing via encrypted QR codes

---

## License

MIT License — see [LICENSE](LICENSE) for details.

BLACKBOX is free software. You are free to use, modify, and distribute it under the terms of the MIT License.

Built by Alpha-1 Studio.
