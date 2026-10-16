# BLACKBOX device smoke test

Run after `npm run sync` + debug APK install.

- Voice: grant mic; record >=3s; timer increments; Stop saves; backdrop/Escape closes; row play toggles and progress bar advances; transcription downloads once then transcribes; Cancel stops; delete requires confirm.
- TOTP: add a known secret; code matches provider within +/-30s; progress bar resets at boundary; copy works; delete confirms.
- Crypto: export encrypted backup with 8+ char pass; confirm mismatch rejected; import restores counts; wrong pass fails cleanly.
- UI: dark mode follows system; Alive toggle persists after restart; close modal via backdrop closes only top modal.
- Regression: `npm test` passes before device test.
