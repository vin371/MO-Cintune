package com.cinetune.music;

import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.webkit.JavascriptInterface;

public final class NativePlaybackBridge {
    private final Context context;

    NativePlaybackBridge(Context context) { this.context = context.getApplicationContext(); }

    @JavascriptInterface public void command(String action, String payload) {
        if (!MusicService.isAllowedAction(action)) return;
        Intent intent = new Intent(context, MusicService.class).setAction(action);
        if (payload != null) intent.putExtra("payload", payload);
        if ("playQueue".equals(action)) {
            if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(intent);
            else context.startService(intent);
        } else if (MusicService.isActive()) {
            context.startService(intent);
        }
    }

    @JavascriptInterface public String state() { return MusicService.snapshot(); }
}
