# Contributing to BLACKBOX

Thank you for your interest in contributing to BLACKBOX. This project is built on the principle that privacy tools should be transparent, auditable, and community-driven.

## Security-First Contributions

BLACKBOX is a security application. All contributions are reviewed with security as the top priority.

### Before You Start
- Read the [architecture overview](README.md#architecture) to understand how the codebase is organized
- Read the [security model](README.md#security-model) to understand encryption flow
- Check existing [issues](https://github.com/alpha-1-design/BLACKBOX/issues) for ongoing work

### What We Accept

**Features** — New modules that work offline and don't introduce network dependencies.

**Bug fixes** — Especially encryption, storage, and Android native plugin issues.

**UI improvements** — Keep the interface clean, minimal, and lightweight. No gradients, no emojis, no visual clutter.

**Documentation** — Clarifications, translations, build instructions.

**Security audits** — If you find a vulnerability, see [SECURITY.md](SECURITY.md) for responsible disclosure.

### What We Don't Accept

- Anything that sends data over the network without explicit user consent
- Cloud sync features (this app is offline-only by design)
- Analytics, telemetry, or crash reporting
- Heavy dependencies that bloat the APK
- Emoji usage anywhere in the UI or codebase

## Development Setup

```bash
git clone https://github.com/alpha-1-design/BLACKBOX.git
cd BLACKBOX
npm install
npx cap init BLACKBOX com.blackbox.app --web-dir www
npx cap add android
npx cap sync android
```

### Quick Iteration (Web Only)

For frontend changes, you can test in a browser without Android:

```bash
npm run serve
# Open http://localhost:3000
```

### Full Android Build

```bash
cd android && ./gradlew assembleDebug
```

## Code Style

- **No comments unless necessary** — code should be self-explanatory
- **Use existing patterns** — match the style of surrounding code
- **Inline SVG icons only** — no icon libraries, no emojis
- **Consistent stroke weights** — all icons use 1.5px stroke
- **CSS variables** — use the design system variables in `styles.css`

### JavaScript Conventions
- IIFE pattern for module encapsulation: `const Module = (() => { ... })();`
- `async/await` over `.then()` chains
- No global scope pollution — everything scoped to module closures
- Error handling with try/catch, never silent failures

### Java Conventions
- Capacitor `@CapacitorPlugin` annotation pattern
- `@PluginMethod` for all exposed methods
- JSObject for return values
- Context lifecycle awareness

## Pull Request Process

1. Create a feature branch: `git checkout -b feature/your-feature`
2. Make your changes following the code style above
3. Test on both browser (`npm run serve`) and Android (`./gradlew assembleDebug`)
4. Commit with a clear message: `feat: add XYZ module` or `fix: resolve ABC issue`
5. Push and open a pull request against `main`
6. Maintainers will review within 48 hours

### Commit Message Format

```
type: short description

type is one of:
  feat     - New feature
  fix      - Bug fix
  docs     - Documentation changes
  style    - Code style changes (formatting, no logic change)
  refactor - Code refactoring (no behavior change)
  test     - Test additions or changes
  chore    - Build process or auxiliary tool changes
```

## F-Droid Contributors

If you're helping with F-Droid submission:

1. Ensure `fastlane/metadata/android/` is complete with screenshots
2. Verify reproducible builds: build locally, compare SHA-256 hashes
3. Remove all proprietary dependencies from `build.gradle`
4. Test that the app works without any network connectivity
5. Submit a merge request to [fdroiddata](https://gitlab.com/fdroid/fdroiddata)

## Reporting Security Issues

See [SECURITY.md](SECURITY.md). Do not open a public issue for security vulnerabilities.

## Code of Conduct

Be respectful. Review code, not people. Assume good faith. The goal is to build the best offline security tool for everyone.
