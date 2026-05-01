# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 2.0.x   | :white_check_mark: |

## Reporting a Vulnerability

BLACKBOX is a security application. If you discover a vulnerability, please report it responsibly.

### Do NOT
- Open a public GitHub issue
- Post details on forums or social media
- Exploit the vulnerability beyond what is needed to prove existence

### DO
- Email your findings to the repository maintainers
- Include steps to reproduce the issue
- Specify the affected component (encryption, Android native, frontend, etc.)
- Allow reasonable time for a fix before public disclosure

### What to Expect
- Acknowledgment within 48 hours
- Initial assessment within 1 week
- A fix released as soon as possible
- Credit in the release notes (if you wish to be credited)

## Security Scope

### Auditable Components

The following components are designed to be independently auditable:

1. **Encryption Engine** (`vault.js`) — Web Crypto API AES-256-GCM with PBKDF2 key derivation
2. **TOTP Generator** (`auth.js`) — HMAC-SHA1 per RFC 6238, Base32 decoding
3. **Android Native Plugins** — BiometricPrompt, FLAG_SECURE, overlay service
4. **Key Derivation** — PBKDF2-SHA256, 150,000 iterations

### Known Limitations

- localStorage is used for encrypted data storage. While the data is encrypted, localStorage itself is not sandboxed beyond standard browser isolation.
- The panic calculator decoy uses a UI overlay, not a separate app. It is effective against casual observers but not against forensic analysis.
- Web Crypto API operations depend on the browser/runtime implementation. Capacitor uses Android's built-in WebView (Chromium-based).

### Out of Scope

- Capacitor framework vulnerabilities (report to Ionic/Capacitor)
- Android WebView vulnerabilities (report to Google/Chromium)
- Device-level compromises (root access, keyloggers, physical access)
