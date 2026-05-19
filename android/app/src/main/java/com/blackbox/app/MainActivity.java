package com.blackbox.app;

import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;
import java.util.ArrayList;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    ArrayList<Class<? extends Plugin>> plugins = new ArrayList<>();
    plugins.add(ShieldBiometricPlugin.class);
    plugins.add(ShieldPermissionsPlugin.class);
    plugins.add(ShieldOverlayPlugin.class);
    registerPlugins(plugins);

    super.onCreate(savedInstanceState);

    getWindow().setFlags(
      WindowManager.LayoutParams.FLAG_SECURE,
      WindowManager.LayoutParams.FLAG_SECURE
    );
  }

  @Override
  public void onPause() {
    super.onPause();
    getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
  }
}
