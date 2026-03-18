package com.shieldspace.app;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * ShieldPermissionsPlugin
 * Handles ALL Android runtime permission requests from Java.
 * This is the correct way — JS cannot request Android permissions.
 */
@CapacitorPlugin(
    name = "ShieldPermissions",
    permissions = {
        @Permission(strings = {Manifest.permission.CAMERA},                alias = "camera"),
        @Permission(strings = {Manifest.permission.RECORD_AUDIO},          alias = "microphone"),
        @Permission(strings = {Manifest.permission.READ_MEDIA_IMAGES,
                               Manifest.permission.READ_MEDIA_VIDEO,
                               Manifest.permission.READ_MEDIA_AUDIO},      alias = "storage"),
    }
)
public class ShieldPermissionsPlugin extends Plugin {

    // ── Camera ───────────────────────────────────────
    @PluginMethod
    public void requestCamera(PluginCall call) {
        if (_hasPermission(Manifest.permission.CAMERA)) {
            call.resolve(_result(true, "already_granted"));
            return;
        }
        requestPermissionForAlias("camera", call, "cameraResult");
    }

    @PermissionCallback
    private void cameraResult(PluginCall call) {
        boolean granted = _hasPermission(Manifest.permission.CAMERA);
        call.resolve(_result(granted, granted ? "granted" : "denied"));
    }

    // ── Storage ──────────────────────────────────────
    @PluginMethod
    public void requestStorage(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            requestPermissionForAlias("storage", call, "storageResult");
        } else {
            String perm = Manifest.permission.READ_EXTERNAL_STORAGE;
            if (_hasPermission(perm)) {
                call.resolve(_result(true, "already_granted"));
                return;
            }
            ActivityCompat.requestPermissions(
                getActivity(),
                new String[]{perm, Manifest.permission.WRITE_EXTERNAL_STORAGE},
                1001
            );
            call.resolve(_result(true, "requested"));
        }
    }

    @PermissionCallback
    private void storageResult(PluginCall call) {
        call.resolve(_result(true, "granted"));
    }

    // ── Notifications ────────────────────────────────
    @PluginMethod
    public void requestNotifications(PluginCall call) {
        Context ctx = getContext();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (_hasPermission(Manifest.permission.POST_NOTIFICATIONS)) {
                call.resolve(_result(true, "already_granted"));
                return;
            }
            ActivityCompat.requestPermissions(
                getActivity(),
                new String[]{Manifest.permission.POST_NOTIFICATIONS},
                1002
            );
            call.resolve(_result(true, "requested"));
        } else {
            boolean enabled = NotificationManagerCompat.from(ctx).areNotificationsEnabled();
            if (!enabled) {
                Intent intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                    .putExtra(Settings.EXTRA_APP_PACKAGE, ctx.getPackageName())
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(intent);
            }
            call.resolve(_result(true, "requested"));
        }
    }

    // ── Overlay (Display over other apps) ────────────
    @PluginMethod
    public void requestOverlay(PluginCall call) {
        Context ctx = getContext();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            if (Settings.canDrawOverlays(ctx)) {
                call.resolve(_result(true, "already_granted"));
                return;
            }
            // Open the EXACT settings page with package URI
            Intent intent = new Intent(
                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:" + ctx.getPackageName())
            );
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(intent);
            call.resolve(_result(false, "opened_settings"));
        } else {
            call.resolve(_result(true, "not_required"));
        }
    }

    // ── Check overlay ────────────────────────────────
    @PluginMethod
    public void checkOverlay(PluginCall call) {
        boolean granted = Build.VERSION.SDK_INT < Build.VERSION_CODES.M
            || Settings.canDrawOverlays(getContext());
        call.resolve(_result(granted, granted ? "granted" : "not_granted"));
    }

    // ── Check all permissions status ─────────────────
    @PluginMethod
    public void checkAll(PluginCall call) {
        Context ctx = getContext();
        JSObject r = new JSObject();
        r.put("camera",    _hasPermission(Manifest.permission.CAMERA));
        r.put("overlay",   Build.VERSION.SDK_INT < Build.VERSION_CODES.M
                           || Settings.canDrawOverlays(ctx));
        r.put("notifications", NotificationManagerCompat.from(ctx).areNotificationsEnabled());
        r.put("storage",   Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                           ? _hasPermission(Manifest.permission.READ_MEDIA_IMAGES)
                           : _hasPermission(Manifest.permission.READ_EXTERNAL_STORAGE));
        call.resolve(r);
    }

    // ── Helpers ──────────────────────────────────────
    private boolean _hasPermission(String perm) {
        return ContextCompat.checkSelfPermission(getContext(), perm)
               == PackageManager.PERMISSION_GRANTED;
    }

    private JSObject _result(boolean granted, String status) {
        JSObject r = new JSObject();
        r.put("granted", granted);
        r.put("status",  status);
        return r;
    }
}
