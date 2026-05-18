# Biometric Integration

## Overview
BLACKBOX utilizes the Android `androidx.biometric` library, bridging the gap between native hardware and our web-based shell via a custom Capacitor plugin: `ShieldBiometricPlugin`.

## Technical Implementation
The plugin uses `BiometricPrompt` to ensure compatibility with modern Android authentication requirements, supporting both "Strong" (fingerprint/iris) and "Weak" (facial recognition) authenticators depending on the hardware availability.

### Registration Flow
1.  **Availability Check:** Upon initial PIN setup, `app.js` triggers `window.ShieldBiometric.isAvailable()`.
2.  **Opt-in:** If hardware is supported, the user is prompted to register their biometric profile.
3.  **Storage:** The biometric secret is not stored by us; we simply register a secure prompt that, upon successful authentication, releases the master PIN from the device's secure enclave (via our Java implementation).

### Security Considerations
*   **Hardware-Backed:** The authentication is processed by the Android system; BLACKBOX only receives a success/failure callback.
*   **Decoupled:** The biometric flow is strictly for unlocking the UI. It does not replace the master PIN, ensuring that if biometric hardware fails or is removed, the master PIN remains the ultimate key.

## Troubleshooting
If biometrics fail:
*   Ensure the app has the `USE_BIOMETRIC` permission in `AndroidManifest.xml`.
*   Verify that `ShieldBiometricPlugin` is correctly registered in `MainActivity.java`.
*   Check that the Android SDK version is at least 34 (as specified in `build.gradle`).
