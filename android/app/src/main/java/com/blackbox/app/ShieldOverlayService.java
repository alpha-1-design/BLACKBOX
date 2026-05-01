package com.blackbox.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.os.Build;
import android.os.IBinder;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

/**
 * ShieldOverlayService
 *
 * Draws a Samsung Extra Dim-style overlay over all apps.
 * Uses WindowManager TYPE_APPLICATION_OVERLAY — the same mechanism
 * Samsung uses for Extra Dim, Blue Light Filter, etc.
 *
 * Overlay specs (matched to Samsung Extra Dim):
 *   - Full screen ARGB black layer
 *   - Default alpha: 0x99 (~60% opacity) — same as Samsung default
 *   - Non-interactive (touches pass through)
 *   - Sits above all apps, below system UI (status bar / nav bar)
 *   - Persists until user turns it off
 */
public class ShieldOverlayService extends Service {

    public static final String ACTION_SHOW   = "com.blackbox.app.OVERLAY_SHOW";
    public static final String ACTION_HIDE   = "com.blackbox.app.OVERLAY_HIDE";
    public static final String ACTION_TOGGLE = "com.blackbox.app.OVERLAY_TOGGLE";
    public static final String ACTION_ALPHA  = "com.blackbox.app.OVERLAY_ALPHA";
    public static final String EXTRA_ALPHA   = "alpha";

    private static final String CHANNEL_ID   = "shield_overlay";
    private static final int    NOTIF_ID     = 1001;
    private static final String PREFS_NAME   = "shield_overlay_prefs";
    private static final String PREF_ACTIVE  = "overlay_active";
    private static final String PREF_ALPHA   = "overlay_alpha";

    // Samsung Extra Dim default: 0x99 = 153 = ~60%
    private static final int DEFAULT_ALPHA = 0x99;

    private WindowManager windowManager;
    private View          overlayView;
    private boolean       isShowing = false;
    private int           currentAlpha = DEFAULT_ALPHA;

    @Override
    public void onCreate() {
        super.onCreate();
        windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);
        _createNotificationChannel();
        _startForeground();
        _restoreState();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) return START_STICKY;
        String action = intent.getAction();
        if (action == null) return START_STICKY;

        switch (action) {
            case ACTION_SHOW:
                currentAlpha = intent.getIntExtra(EXTRA_ALPHA, currentAlpha);
                _showOverlay();
                break;
            case ACTION_HIDE:
                _hideOverlay();
                break;
            case ACTION_TOGGLE:
                if (isShowing) _hideOverlay(); else _showOverlay();
                break;
            case ACTION_ALPHA:
                currentAlpha = intent.getIntExtra(EXTRA_ALPHA, currentAlpha);
                _updateAlpha();
                break;
        }
        return START_STICKY;
    }

    // ── Overlay control ──────────────────────────────
    private void _showOverlay() {
        if (isShowing) { _updateAlpha(); return; }
        overlayView = new View(this);
        overlayView.setBackgroundColor(Color.argb(currentAlpha, 0, 0, 0));

        WindowManager.LayoutParams params = new WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.MATCH_PARENT,
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                : WindowManager.LayoutParams.TYPE_SYSTEM_OVERLAY,
            // Non-interactive + not focusable = touches pass through
            WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
                | WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
                | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT
        );
        params.gravity = Gravity.TOP | Gravity.START;
        params.x = 0;
        params.y = 0;

        try {
            windowManager.addView(overlayView, params);
            isShowing = true;
            _saveState();
            _updateNotification(true);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private void _hideOverlay() {
        if (!isShowing || overlayView == null) return;
        try {
            windowManager.removeView(overlayView);
        } catch (Exception ignored) {}
        overlayView = null;
        isShowing   = false;
        _saveState();
        _updateNotification(false);
    }

    private void _updateAlpha() {
        if (!isShowing || overlayView == null) return;
        overlayView.setBackgroundColor(Color.argb(currentAlpha, 0, 0, 0));
        _saveState();
    }

    // ── State persistence ────────────────────────────
    private void _saveState() {
        getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(PREF_ACTIVE, isShowing)
            .putInt(PREF_ALPHA, currentAlpha)
            .apply();
    }

    private void _restoreState() {
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        currentAlpha = prefs.getInt(PREF_ALPHA, DEFAULT_ALPHA);
        if (prefs.getBoolean(PREF_ACTIVE, false)) {
            _showOverlay();
        }
    }

    // ── Foreground notification ──────────────────────
    private void _createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(
                CHANNEL_ID, "Privacy Overlay",
                NotificationManager.IMPORTANCE_LOW
            );
            ch.setDescription("BLACKBOX privacy overlay is active");
            ch.setShowBadge(false);
            ((NotificationManager) getSystemService(NOTIFICATION_SERVICE))
                .createNotificationChannel(ch);
        }
    }

    private void _startForeground() {
        startForeground(NOTIF_ID, _buildNotification(false));
    }

    private void _updateNotification(boolean active) {
        ((NotificationManager) getSystemService(NOTIFICATION_SERVICE))
            .notify(NOTIF_ID, _buildNotification(active));
    }

    private Notification _buildNotification(boolean active) {
        // Tap notification = open BLACKBOX
        Intent open = new Intent(this, MainActivity.class);
        PendingIntent pi = PendingIntent.getActivity(
            this, 0, open,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        // Quick toggle action in notification
        Intent toggle = new Intent(this, ShieldOverlayService.class);
        toggle.setAction(ACTION_TOGGLE);
        PendingIntent togglePi = PendingIntent.getService(
            this, 1, toggle,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_lock_lock)
            .setContentTitle(active ? "Privacy Overlay ON" : "BLACKBOX")
            .setContentText(active ? "Screen dimmed for privacy. Tap to manage." : "Overlay ready — tap to activate.")
            .setContentIntent(pi)
            .addAction(android.R.drawable.ic_lock_lock,
                active ? "Turn Off" : "Turn On", togglePi)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setSilent(true)
            .build();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public void onDestroy() {
        _hideOverlay();
        super.onDestroy();
    }

    // ── Static helpers ───────────────────────────────
    public static void show(Context ctx, int alpha) {
        Intent i = new Intent(ctx, ShieldOverlayService.class);
        i.setAction(ACTION_SHOW);
        i.putExtra(EXTRA_ALPHA, alpha);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
            ctx.startForegroundService(i);
        else ctx.startService(i);
    }

    public static void hide(Context ctx) {
        Intent i = new Intent(ctx, ShieldOverlayService.class);
        i.setAction(ACTION_HIDE);
        ctx.startService(i);
    }

    public static void toggle(Context ctx) {
        Intent i = new Intent(ctx, ShieldOverlayService.class);
        i.setAction(ACTION_TOGGLE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
            ctx.startForegroundService(i);
        else ctx.startService(i);
    }
}
