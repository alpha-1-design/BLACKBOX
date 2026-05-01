package com.shieldspace.app;

import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;
import java.util.ArrayList;

public class MainActivity extends BridgeActivity {
  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    getWindow().setFlags(
      WindowManager.LayoutParams.FLAG_SECURE,
      WindowManager.LayoutParams.FLAG_SECURE
    );
    registerPlugins();
  }

  @Override
  protected void onPause() {
    super.onPause();
    getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
  }

  private void registerPlugins() {
    ArrayList<Class<? extends Plugin>> plugins = new ArrayList<>();
    plugins.add(ShieldBiometricPlugin.class);
    plugins.add(ShieldPermissionsPlugin.class);
    plugins.add(ShieldOverlayPlugin.class);
    init(plugins);
  }
}
