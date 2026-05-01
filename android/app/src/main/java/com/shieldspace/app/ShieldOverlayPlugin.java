package com.shieldspace.app;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "ShieldOverlay")
public class ShieldOverlayPlugin extends Plugin {

    private static final String PREFS = "shield_overlay_prefs";

    @PluginMethod
    public void show(PluginCall call) {
        Context ctx = getContext();
        if (!_hasPermission(ctx)) {
            _openOverlaySettings(ctx);
            call.reject("PERMISSION_DENIED", "Opened overlay settings — please grant permission then try again");
            return;
        }
        float alphaFloat = call.getFloat("alpha", 0.6f);
        int alpha = Math.round(alphaFloat * 255);
        alpha = Math.max(20, Math.min(230, alpha));
        ShieldOverlayService.show(ctx, alpha);
        _savePrefs(ctx, true, alpha, call.getString("mode","all"));
        call.resolve(_status(true));
    }

    @PluginMethod
    public void hide(PluginCall call) {
        ShieldOverlayService.hide(getContext());
        call.resolve(_status(false));
    }

    @PluginMethod
    public void toggle(PluginCall call) {
        Context ctx = getContext();
        if (!_hasPermission(ctx)) {
            _openOverlaySettings(ctx);
            call.reject("PERMISSION_DENIED", "Please grant overlay permission in Settings");
            return;
        }
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        boolean wasActive = p.getBoolean("overlay_active", false);
        if (wasActive) ShieldOverlayService.hide(ctx);
        else ShieldOverlayService.show(ctx, p.getInt("overlay_alpha", 0x99));
        call.resolve(_status(!wasActive));
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        Context ctx = getContext();
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        JSObject r = new JSObject();
        r.put("active",        p.getBoolean("overlay_active", false));
        r.put("alpha",         p.getInt("overlay_alpha", 0x99));
        r.put("hasPermission", _hasPermission(ctx));
        r.put("mode",          p.getString("overlay_mode", "off"));
        call.resolve(r);
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        Context ctx = getContext();
        if (_hasPermission(ctx)) {
            JSObject r = new JSObject(); r.put("granted", true);
            call.resolve(r); return;
        }
        _openOverlaySettings(ctx);
        JSObject r = new JSObject();
        r.put("granted", false);
        r.put("message", "Opened Settings — find BLACKBOX and enable 'Display over other apps'");
        call.resolve(r);
    }

    @PluginMethod
    public void configure(PluginCall call) {
        Context ctx = getContext();
        String mode      = call.getString("mode", "off");
        float alphaFloat = call.getFloat("dimAmount", 0.6f);
        int alpha        = Math.round(alphaFloat * 255);
        _savePrefs(ctx, !mode.equals("off"), alpha, mode);
        if ("off".equals(mode)) ShieldOverlayService.hide(ctx);
        else if (_hasPermission(ctx)) ShieldOverlayService.show(ctx, alpha);
        call.resolve(_status(!mode.equals("off")));
    }

    // ── Helpers ──────────────────────────────────────
    private boolean _hasPermission(Context ctx) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M)
            return Settings.canDrawOverlays(ctx);
        return true;
    }

    private void _openOverlaySettings(Context ctx) {
        try {
            // Direct package URI — works on stock Android + most skins
            Intent i = new Intent(
                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:" + ctx.getPackageName())
            );
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(i);
        } catch (Exception e) {
            // Fallback — open general settings
            Intent i = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(i);
        }
    }

    private void _savePrefs(Context ctx, boolean active, int alpha, String mode) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putBoolean("overlay_active", active)
            .putInt("overlay_alpha", alpha)
            .putString("overlay_mode", mode)
            .apply();
    }

    private JSObject _status(boolean active) {
        JSObject r = new JSObject();
        r.put("active", active);
        return r;
    }
}
