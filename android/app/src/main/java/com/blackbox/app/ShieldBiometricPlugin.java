package com.blackbox.app;

import androidx.annotation.NonNull;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.concurrent.Executor;

/**
 * ShieldBiometricPlugin
 * Uses androidx.biometric.BiometricPrompt — the correct API.
 * Works on ALL Android phones with fingerprint/face unlock
 * including Tecno HiOS, Samsung One UI, Xiaomi MIUI etc.
 */
@CapacitorPlugin(name = "ShieldBiometric")
public class ShieldBiometricPlugin extends Plugin {

    @PluginMethod
    public void isAvailable(PluginCall call) {
        BiometricManager bm = BiometricManager.from(getContext());
        int result = bm.canAuthenticate(
            BiometricManager.Authenticators.BIOMETRIC_STRONG
            | BiometricManager.Authenticators.BIOMETRIC_WEAK
        );
        JSObject r = new JSObject();
        switch (result) {
            case BiometricManager.BIOMETRIC_SUCCESS:
                r.put("available", true);
                r.put("reason", "ready");
                break;
            case BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE:
                r.put("available", false);
                r.put("reason", "no_hardware");
                break;
            case BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE:
                r.put("available", false);
                r.put("reason", "hw_unavailable");
                break;
            case BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED:
                r.put("available", false);
                r.put("reason", "none_enrolled");
                break;
            default:
                r.put("available", false);
                r.put("reason", "unknown");
        }
        call.resolve(r);
    }

    @PluginMethod
    public void authenticate(PluginCall call) {
        String title    = call.getString("title",    "BLACKBOX");
        String subtitle = call.getString("subtitle", "Verify your identity to unlock");
        String cancel   = call.getString("cancel",   "Use PIN instead");

        Executor executor = ContextCompat.getMainExecutor(getContext());

        BiometricPrompt prompt = new BiometricPrompt(
            (FragmentActivity) getActivity(),
            executor,
            new BiometricPrompt.AuthenticationCallback() {
                @Override
                public void onAuthenticationSucceeded(
                        @NonNull BiometricPrompt.AuthenticationResult result) {
                    JSObject r = new JSObject();
                    r.put("success", true);
                    call.resolve(r);
                }

                @Override
                public void onAuthenticationError(int code, @NonNull CharSequence msg) {
                    // User cancelled or too many attempts
                    JSObject r = new JSObject();
                    r.put("success", false);
                    r.put("code",    code);
                    r.put("message", msg.toString());
                    call.resolve(r);
                }

                @Override
                public void onAuthenticationFailed() {
                    // Single failed attempt — prompt stays open, don't reject
                }
            }
        );

        BiometricPrompt.PromptInfo info = new BiometricPrompt.PromptInfo.Builder()
            .setTitle(title)
            .setSubtitle(subtitle)
            .setNegativeButtonText(cancel)
            .setAllowedAuthenticators(
                BiometricManager.Authenticators.BIOMETRIC_STRONG
                | BiometricManager.Authenticators.BIOMETRIC_WEAK
            )
            .build();

        getActivity().runOnUiThread(() -> prompt.authenticate(info));
    }
}
