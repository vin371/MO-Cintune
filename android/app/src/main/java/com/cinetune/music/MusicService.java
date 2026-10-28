package com.cinetune.music;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaMetadata;
import android.media.MediaPlayer;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class MusicService extends Service implements AudioManager.OnAudioFocusChangeListener {
    private static final String CHANNEL = "cinetune_playback";
    private static final int NOTIFICATION_ID = 11;
    private static volatile MusicService active;
    private static volatile String lastSnapshot = "{}";

    private final ArrayList<Track> queue = new ArrayList<>();
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ExecutorService network = Executors.newSingleThreadExecutor();
    private MediaPlayer player;
    private MediaSession session;
    private AudioManager audioManager;
    private AudioFocusRequest focusRequest;
    private int index = -1;
    private int generation = 0;
    private boolean playing = false;
    private boolean prepared = false;
    private String repeat = "all";
    private long sleepUntil = 0;
    private int failedInRow = 0;
    private String error = "";

    static boolean isAllowedAction(String action) {
        return "playQueue".equals(action) || "toggle".equals(action) || "next".equals(action)
            || "previous".equals(action) || "seek".equals(action) || "repeat".equals(action)
            || "sleep".equals(action) || "updateQueue".equals(action) || "stop".equals(action);
    }
    static boolean isActive() { return active != null; }
    static String snapshot() {
        return lastSnapshot;
    }

    @Override public void onCreate() {
        super.onCreate();
        active = this;
        audioManager = (AudioManager) getSystemService(AUDIO_SERVICE);
        if (Build.VERSION.SDK_INT >= 26) {
            ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).createNotificationChannel(
                new NotificationChannel(CHANNEL, "Phát nhạc CineTune", NotificationManager.IMPORTANCE_LOW));
        }
        session = new MediaSession(this, "CineTune");
        session.setCallback(new MediaSession.Callback() {
            @Override public void onPlay() { toggleIfPaused(); }
            @Override public void onPause() { pause(); }
            @Override public void onSkipToNext() { advance(1, false); }
            @Override public void onSkipToPrevious() { advance(-1, false); }
            @Override public void onSeekTo(long pos) { seek((int) pos); }
            @Override public void onStop() { stopSelf(); }
        });
        session.setActive(true);
        publish();
        handler.postDelayed(progressTask, 1000);
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) return START_NOT_STICKY;
        String action = intent.getAction();
        String payload = intent.getStringExtra("payload");
        if ("playQueue".equals(action)) {
            startForeground(NOTIFICATION_ID, notification());
            loadQueue(payload, true);
        } else if ("updateQueue".equals(action)) loadQueue(payload, false);
        else if ("toggle".equals(action)) toggle();
        else if ("next".equals(action)) advance(1, false);
        else if ("previous".equals(action)) advance(-1, false);
        else if ("seek".equals(action)) { try { seek(Integer.parseInt(payload)); } catch (Exception ignored) {} }
        else if ("repeat".equals(action)) { if ("all".equals(payload) || "one".equals(payload) || "off".equals(payload)) repeat = payload; publish(); }
        else if ("sleep".equals(action)) { try { sleepUntil = Long.parseLong(payload); } catch (Exception ignored) { sleepUntil = 0; } scheduleSleep(); publish(); }
        else if ("stop".equals(action)) stopSelf();
        return START_NOT_STICKY;
    }

    private void loadQueue(String payload, boolean start) {
        try {
            JSONObject input = new JSONObject(payload);
            JSONArray songs = input.getJSONArray("tracks");
            ArrayList<Track> parsed = new ArrayList<>();
            for (int i = 0; i < songs.length() && i < 300; i++) {
                JSONObject song = songs.optJSONObject(i);
                if (song == null) continue;
                String id = song.optString("id");
                if (id.matches("[A-Za-z0-9]{4,24}")) parsed.add(new Track(id, song.optString("title"), song.optString("artist")));
            }
            if (parsed.isEmpty()) return;
            String currentId = current() == null ? "" : current().id;
            queue.clear(); queue.addAll(parsed);
            repeat = input.optString("repeat", repeat);
            if (start) {
                String startId = input.optString("startId");
                index = find(startId);
                if (index < 0) index = 0;
                failedInRow = 0;
                prepareCurrent();
            } else {
                index = find(currentId);
                if (index < 0) index = 0;
                publish();
            }
        } catch (Exception ignored) { if (start) { error = "Không đọc được danh sách phát."; publish(); } }
    }

    private int find(String id) { for (int i = 0; i < queue.size(); i++) if (queue.get(i).id.equals(id)) return i; return -1; }
    private Track current() { return index >= 0 && index < queue.size() ? queue.get(index) : null; }

    private void prepareCurrent() {
        Track track = current();
        if (track == null) return;
        int token = ++generation;
        releasePlayer();
        prepared = false; playing = false; error = ""; publish();
        network.execute(() -> {
            String url = null;
            try {
                JSONObject source = new JSONObject(new NativeZingBridge().getSong(track.id));
                if (source.optInt("err", -1) == 0) url = source.getJSONObject("data").optString("128");
            } catch (Exception ignored) {}
            String stream = url;
            handler.post(() -> {
                if (token != generation) return;
                if (stream == null || stream.isEmpty()) { onTrackFailure(); return; }
                try {
                    MediaPlayer next = new MediaPlayer();
                    next.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build());
                    next.setWakeMode(this, PowerManager.PARTIAL_WAKE_LOCK);
                    Map<String, String> headers = new HashMap<>();
                    headers.put("User-Agent", "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36");
                    headers.put("Referer", "https://zingmp3.vn/");
                    next.setDataSource(this, android.net.Uri.parse(stream), headers);
                    next.setOnPreparedListener(mp -> {
                        if (token != generation) return;
                        prepared = true; failedInRow = 0;
                        if (requestFocus()) { mp.start(); playing = true; }
                        publish();
                    });
                    next.setOnCompletionListener(mp -> advance(1, true));
                    next.setOnErrorListener((mp, what, extra) -> { if (token == generation) onTrackFailure(); return true; });
                    player = next;
                    next.prepareAsync();
                } catch (Exception ignored) { onTrackFailure(); }
            });
        });
    }

    private void onTrackFailure() {
        failedInRow++;
        if (failedInRow < queue.size()) advance(1, false);
        else { error = "Các bài trong hàng chờ hiện chưa phát được."; playing = false; prepared = false; releasePlayer(); publish(); }
    }

    private boolean requestFocus() {
        if (Build.VERSION.SDK_INT >= 26) {
            if (focusRequest == null) focusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                .setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build())
                .setOnAudioFocusChangeListener(this).build();
            return audioManager.requestAudioFocus(focusRequest) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
        }
        return audioManager.requestAudioFocus(this, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
    }
    private void abandonFocus() {
        if (Build.VERSION.SDK_INT >= 26 && focusRequest != null) audioManager.abandonAudioFocusRequest(focusRequest);
        else audioManager.abandonAudioFocus(this);
    }
    @Override public void onAudioFocusChange(int change) {
        if (change <= 0) pause();
    }
    private void toggleIfPaused() { if (!playing) toggle(); }
    private void toggle() {
        if (player == null || !prepared) { if (current() != null) prepareCurrent(); return; }
        if (playing) pause();
        else if (requestFocus()) { player.start(); playing = true; publish(); }
    }
    private void pause() {
        if (player != null && prepared && playing) { player.pause(); playing = false; abandonFocus(); publish(); }
    }
    private void advance(int direction, boolean ended) {
        if (queue.isEmpty()) return;
        if (ended && "one".equals(repeat) && player != null) { player.seekTo(0); player.start(); playing = true; publish(); return; }
        if (ended && "off".equals(repeat) && index >= queue.size() - 1) { playing = false; publish(); return; }
        int next = index + direction;
        if (next < 0) next = queue.size() - 1;
        if (next >= queue.size()) next = 0;
        index = next;
        prepareCurrent();
    }
    private void seek(int positionMs) {
        if (player != null && prepared) { player.seekTo(Math.max(0, Math.min(positionMs, player.getDuration()))); publish(); }
    }
    private void scheduleSleep() {
        handler.removeCallbacks(sleepTask);
        if (sleepUntil > System.currentTimeMillis()) handler.postDelayed(sleepTask, sleepUntil - System.currentTimeMillis());
    }
    private final Runnable sleepTask = () -> { sleepUntil = 0; pause(); publish(); };
    private final Runnable progressTask = new Runnable() {
        @Override public void run() {
            lastSnapshot = buildSnapshot();
            handler.postDelayed(this, 1000);
        }
    };

    private synchronized String buildSnapshot() {
        JSONObject json = new JSONObject();
        try {
            Track track = current();
            json.put("id", track == null ? "" : track.id);
            json.put("playing", playing);
            json.put("ready", prepared);
            json.put("position", player != null && prepared ? player.getCurrentPosition() : 0);
            json.put("duration", player != null && prepared ? player.getDuration() : 0);
            json.put("repeat", repeat);
            json.put("sleepUntil", sleepUntil);
            json.put("error", error);
        } catch (Exception ignored) {}
        return json.toString();
    }
    private PendingIntent command(String action, int requestCode) {
        Intent intent = new Intent(this, MusicService.class).setAction(action);
        return PendingIntent.getService(this, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
    private Notification notification() {
        Track track = current();
        Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent content = PendingIntent.getActivity(this, 1, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder builder = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
        builder.setSmallIcon(com.cinetune.music.R.drawable.ic_launcher_foreground)
            .setContentTitle(track == null ? "CineTune" : track.title)
            .setContentText(track == null ? "Đang chuẩn bị nhạc" : track.artist)
            .setContentIntent(content).setVisibility(Notification.VISIBILITY_PUBLIC)
            .setOngoing(playing).setOnlyAlertOnce(true)
            .addAction(android.R.drawable.ic_media_previous, "Trước", command("previous", 2))
            .addAction(playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play, playing ? "Dừng" : "Phát", command("toggle", 3))
            .addAction(android.R.drawable.ic_media_next, "Tiếp", command("next", 4))
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Tắt", command("stop", 5))
            .setStyle(new Notification.MediaStyle().setMediaSession(session.getSessionToken()).setShowActionsInCompactView(0, 1, 2));
        return builder.build();
    }
    private void publish() {
        lastSnapshot = buildSnapshot();
        Track track = current();
        if (session != null) {
            session.setMetadata(new MediaMetadata.Builder().putString(MediaMetadata.METADATA_KEY_TITLE, track == null ? "CineTune" : track.title)
                .putString(MediaMetadata.METADATA_KEY_ARTIST, track == null ? "" : track.artist)
                .putLong(MediaMetadata.METADATA_KEY_DURATION, player != null && prepared ? player.getDuration() : 0).build());
            long actions = PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE | PlaybackState.ACTION_PLAY_PAUSE
                | PlaybackState.ACTION_SKIP_TO_NEXT | PlaybackState.ACTION_SKIP_TO_PREVIOUS | PlaybackState.ACTION_SEEK_TO | PlaybackState.ACTION_STOP;
            session.setPlaybackState(new PlaybackState.Builder().setActions(actions)
                .setState(playing ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED,
                    player != null && prepared ? player.getCurrentPosition() : 0, playing ? 1f : 0f).build());
        }
        if (active == this) ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).notify(NOTIFICATION_ID, notification());
    }
    private void releasePlayer() { if (player != null) { player.reset(); player.release(); player = null; } }
    @Override public void onDestroy() {
        ++generation; active = null; playing = false; prepared = false; releasePlayer(); abandonFocus();
        session.release(); network.shutdownNow(); handler.removeCallbacksAndMessages(null);
        lastSnapshot = "{}";
        super.onDestroy();
    }
    @Override public IBinder onBind(Intent intent) { return null; }
    private static final class Track {
        final String id, title, artist;
        Track(String id, String title, String artist) { this.id = id; this.title = title; this.artist = artist; }
    }
}
