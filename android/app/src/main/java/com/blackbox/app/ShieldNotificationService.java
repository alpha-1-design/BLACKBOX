package com.blackbox.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

/**
 * ShieldNotificationService
 * Notification listener — detects when notifications arrive.
 * If overlay mode is set to NOTIFICATIONS, triggers the dim.
 * User controls this from the overlay manager in the app.
 */
public class ShieldNotificationService extends NotificationListenerService {

    private static final String PREFS = "shield_overlay_prefs";

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        SharedPreferences prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String mode = prefs.getString("overlay_mode", "off");
        // Only auto-trigger if user chose notifications mode
        if ("notifications".equals(mode)) {
            int alpha = prefs.getInt("overlay_alpha", 0x99);
            ShieldOverlayService.show(getApplicationContext(), alpha);
            // Auto-hide after 8 seconds
            new android.os.Handler().postDelayed(
                () -> ShieldOverlayService.hide(getApplicationContext()),
                8000
            );
        }
    }

    @Override
    public void onNotificationRemoved(StatusBarNotification sbn) {
        // Nothing needed here
    }
}
