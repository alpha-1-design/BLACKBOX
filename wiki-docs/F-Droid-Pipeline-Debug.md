## F-Droid Pipeline Debug Postmortem

**Duration:** ~2 hours, ~15 pipeline iterations

### The Problem

Adding BLACKBOX to F-Droid hit multiple pipeline failures:

- `android update lib-project` crashed — Capacitor project layout doesn't match F-Droid's expectations
- `fdroid rewritemeta` rejected format repeatedly — strict YAML canonicalization rules
- Build succeeded but APK not found — F-Droid couldn't auto-discover the output

### Root Causes

| Issue | Cause | Fix |
|-------|-------|-----|
| android update crash | No `gradle:` field set; F-Droid defaulted to legacy build method | `gradle:\n  - yes` |
| rewritemeta failures | Wrong key order, inline vs multi-line list format, redundant defaults | Canonical order: `gradle:` → `output:` → `prebuild:` |
| APK not found | Auto-discovery failed with `subdir: android` | Explicit `output:` path |
| Binary scanner errors | `node_modules` with false positives | `rm -rf` bypass paths in `init` |

### Final Recipe

```yaml
Builds:
  - versionName: 2.0.0
    versionCode: 2
    commit: fcbe6590d5c6a21c2d4df1878d2333a29bac9fee
    subdir: android
    sudo:
      - apt-get update
      - apt-get install -y nodejs npm
    init: cd .. && npm install && npx cap sync android && rm -rf
      node_modules/clipboardy/fallbacks
      node_modules/@capacitor/cli/assets
    gradle:
      - yes
    output: app/build/outputs/apk/release/app-release-unsigned.apk
    prebuild: sed -i
      's/com.android.tools.build:gradle:8.1.4/com.android.tools.build:gradle:8.5.2/'
      build.gradle
```

### Key Lessons

- `gradle:` field is required — without it, F-Droid tries `android update lib-project` which fails on Capacitor projects
- `gradle: ['yes']` → canonical form is multi-line `gradle:\n  - yes`
- Build entry keys must follow canonical order: versionName → versionCode → commit → subdir → sudo → init → gradle → output → prebuild
- `init:` runs inside `subdir:` — use `cd ..` to reach project root
- `rm` bypass paths in `init` are relative to init's working directory
- `output:` may be required when `subdir:` changes the project root
- Run `fdroid rewritemeta` locally before pushing to catch format issues instantly

### Auto-Update

Future releases only need a new tag on GitHub — F-Droid bot handles the rest.
