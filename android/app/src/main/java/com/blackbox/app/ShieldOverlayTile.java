package com.blackbox.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.drawable.Icon;
import android.os.Build;
import android.service.quicksettings.Tile;
import android.service.quicksettings.TileService;
import androidx.annotation.RequiresApi;

/**
 * ShieldOverlayTile
 * Adds BLACKBOX to the Android Quick Settings panel.
 * User can pull down notification shade and tap once to
 * toggle privacy overlay — exactly like Samsung Extra Dim tile.
 */
@RequiresApi(api = Build.VERSION_CODES.N)
public class ShieldOverlayTile extends TileService {

    private static final String PREFS  = "shield_overlay_prefs";
    private static final String ACTIVE = "overlay_active";

    @Override
    public void onTileAdded() {
        super.onTileAdded();
        _syncTile();
    }

    @Override
    public void onStartListening() {
        super.onStartListening();
        _syncTile();
    }

    @Override
    public void onClick() {
        super.onClick();
        Context ctx = getApplicationContext();
        ShieldOverlayService.toggle(ctx);
        // Small delay to let service update prefs before we read them
        getQsTile().getIcon(); // keep reference
        new android.os.Handler().postDelayed(this::_syncTile, 300);
    }

    private void _syncTile() {
        Tile tile = getQsTile();
        if (tile == null) return;
        SharedPreferences prefs = getApplicationContext()
            .getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        boolean active = prefs.getBoolean(ACTIVE, false);
        tile.setState(active ? Tile.STATE_ACTIVE : Tile.STATE_INACTIVE);
        tile.setLabel("Privacy Dim");
        tile.setSubtitle(active ? "On" : "Off");
        tile.setIcon(Icon.createWithResource(this, android.R.drawable.ic_lock_lock));
        tile.updateTile();
    }
}
