package com.blackbox.app;

import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;
import java.util.ArrayList;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    
    // Explicitly bridge the local plugins
    this.bridge.getPluginManager().addPlugin(ShieldBiometricPlugin.class);
    this.bridge.getPluginManager().addPlugin(ShieldPermissionsPlugin.class);
    this.bridge.getPluginManager().addPlugin(ShieldOverlayPlugin.class);

    getWindow().setFlags(
      WindowManager.LayoutParams.FLAG_SECURE,
      WindowManager.LayoutParams.FLAG_SECURE
    );
  }

  @Override
  protected void onPause() {
    super.onPause();
    getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
  }
}
