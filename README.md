# BLACKBOX

> Offline security hub for developers and creators. AES-256 encrypted secrets, journal, 2FA, and privacy tools — 100% on-device.

---

## Features

| Module | Description |
|--------|-------------|
| **Secrets Manager** | Categorized encrypted vault for API keys, passwords, tokens. Tap-to-reveal, one-tap copy. |
| **Encrypted Journal** | Timestamped entries with category tags, all encrypted locally. |
| **2FA Authenticator** | TOTP generator with live countdown. Manual secret entry, no cloud. |
| **Privacy Tools** | Permission audit, tracker URL cleaner, fingerprint viewer, URL scanner. |
| **Settings** | Master PIN, auto-lock, biometric unlock, panic mode, screenshot block. |

## Security

- AES-256-GCM encryption via Web Crypto API
- PBKDF2-SHA256 key derivation (150,000 iterations)
- FLAG_SECURE screenshot/screen recording blocking
- Biometric unlock (fingerprint/face) via Android BiometricPrompt
- Panic mode with calculator decoy
- Auto-lock on inactivity or app switch
- Zero network calls, zero analytics, zero tracking

## Build

```bash
cd BLACKBOX
npm install
npx cap init BLACKBOX com.blackbox.app --web-dir www
npx cap add android
npx cap sync android
npx cap open android
```

Or build directly with Gradle:

```bash
cd android
./gradlew assembleRelease
```

## F-Droid

Metadata is in `fastlane/metadata/android/`. To submit to F-Droid:

1. Tag a release: `git tag v2.0.0 && git push --tags`
2. Fork the [f-droid data](https://gitlab.com/fdroid/fdroiddata) repo
3. Add a new YAML entry in `metadata/com.blackbox.app.yml`
4. Submit a merge request

## License

MIT
