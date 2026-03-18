package com.shieldspace.app;

import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Register ALL native plugins before super.onCreate
        registerPlugin(ShieldPermissionsPlugin.class);
        registerPlugin(ShieldBiometricPlugin.class);
        registerPlugin(ShieldOverlayPlugin.class);
        super.onCreate(savedInstanceState);

        // Block screenshots and screen recording
        getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_SECURE,
            WindowManager.LayoutParams.FLAG_SECURE
        );

        // Start overlay service in OFF state so it's ready
        ShieldOverlayService.hide(this);
    }

    @Override
    protected void onPause() {
        super.onPause();
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
    }
}
