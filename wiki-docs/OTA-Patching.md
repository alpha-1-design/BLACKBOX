# OTA Patching Protocol

To push a bug fix without an APK update:
1. Make your change in `www/`.
2. Push to `main`.
3. The CI/CD pipeline runs tests.
4. If successful, the script uploads the minified asset to our patch server.
5. Clients fetch this during boot, bypassing the Android app store review cycle.
