# F-Droid Build Standards

## Overview
BLACKBOX is built to be F-Droid compliant. This means it must be 100% free and open-source, reproducible, and stripped of proprietary tracking or binary blobs.

## Submission Checklist
- [x] **License:** MIT License (Permissive).
- [x] **Tracking:** Zero analytics or telemetry.
- [x] **Binary Blobs:** No proprietary SDKs (Google Play Services, Firebase).
- [x] **Metadata:** Complete `fastlane/metadata/android/en-US/` directory.

## Reproducible Build Protocol
To verify that your local build is identical to what F-Droid will produce:
1.  **Environment:** Ensure you are using the specified Android SDK and Gradle versions (refer to `build.gradle`).
2.  **Clean:** `./gradlew clean`
3.  **Assemble:** `./gradlew assembleRelease`
4.  **Verification:** Run `sha256sum` on the output APK. This hash should be consistent across all environments.

## Maintenance
*   Always update `versionCode` in `android/app/build.gradle` before pushing a new release to F-Droid.
*   Ensure the `fastlane` screenshots are current if the UI significantly changes.
*   Check the `fdroiddata` repository for any automated build failure reports after submission.
