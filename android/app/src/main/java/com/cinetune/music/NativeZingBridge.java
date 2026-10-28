package com.cinetune.music;

import android.webkit.JavascriptInterface;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.PushbackInputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.List;
import java.util.Map;
import java.util.zip.GZIPInputStream;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

public final class NativeZingBridge {
    private static final String VERSION = "1.6.34";
    private static final String SECRET_KEY = "2aa2d1c561e809b267f3638c4a307aab";
    private static final String API_KEY = "88265e23d4284f25963e6eedac8fbfa3";
    private static final String SONG_PATH = "/api/v2/song/get/streaming";
    private static final String USER_AGENT = "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36";

    @JavascriptInterface public String getSong(String id) {
        if (id == null || !id.matches("[A-Za-z0-9]{4,24}")) return "{\"err\":-1,\"msg\":\"Invalid song ID\"}";
        try {
            String ctime = Long.toString(System.currentTimeMillis() / 1000L);
            String hash = sha256("ctime=" + ctime + "id=" + id + "version=" + VERSION);
            String sig = hmac512(SONG_PATH + hash, SECRET_KEY);
            String url = "https://zingmp3.vn" + SONG_PATH
                + "?id=" + URLEncoder.encode(id, "UTF-8")
                + "&sig=" + sig + "&ctime=" + ctime
                + "&version=" + VERSION + "&apiKey=" + API_KEY;
            HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
            connection.setConnectTimeout(10000);
            connection.setReadTimeout(10000);
            connection.setRequestProperty("User-Agent", USER_AGENT);
            connection.setRequestProperty("Accept-Encoding", "identity");
            String cookie = getCookie();
            if (!cookie.isEmpty()) connection.setRequestProperty("Cookie", cookie);
            try {
                if (connection.getResponseCode() != 200) return "{\"err\":-1,\"msg\":\"Source unavailable\"}";
                return readText(connection.getInputStream());
            } finally {
                connection.disconnect();
            }
        } catch (Exception ignored) {
            return "{\"err\":-1,\"msg\":\"Connection failed\"}";
        }
    }

    private static String getCookie() throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL("https://zingmp3.vn").openConnection();
        connection.setConnectTimeout(10000);
        connection.setReadTimeout(10000);
        connection.setRequestProperty("User-Agent", USER_AGENT);
        try {
            connection.getResponseCode();
            for (Map.Entry<String, List<String>> entry : connection.getHeaderFields().entrySet()) {
                if (entry.getKey() != null && "Set-Cookie".equalsIgnoreCase(entry.getKey())) {
                    List<String> cookies = entry.getValue();
                    return cookies.get(cookies.size() > 1 ? 1 : 0);
                }
            }
            return "";
        } finally {
            connection.disconnect();
        }
    }

    private static String sha256(String value) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        return hex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
    }

    private static String hmac512(String value, String key) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA512");
        mac.init(new SecretKeySpec(key.getBytes(StandardCharsets.UTF_8), "HmacSHA512"));
        return hex(mac.doFinal(value.getBytes(StandardCharsets.UTF_8)));
    }

    private static String hex(byte[] bytes) {
        StringBuilder result = new StringBuilder(bytes.length * 2);
        for (byte value : bytes) result.append(String.format("%02x", value & 0xff));
        return result.toString();
    }

    private static String readText(InputStream stream) throws Exception {
        PushbackInputStream input = new PushbackInputStream(stream, 2);
        byte[] magic = new byte[2];
        int prefix = input.read(magic);
        if (prefix > 0) input.unread(magic, 0, prefix);
        InputStream decoded = prefix == 2 && (magic[0] & 0xff) == 0x1f && (magic[1] & 0xff) == 0x8b ? new GZIPInputStream(input) : input;
        try (InputStream body = decoded; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096];
            int count;
            while ((count = body.read(buffer)) != -1) {
                output.write(buffer, 0, count);
                if (output.size() > 100000) throw new Exception("Response too large");
            }
            return output.toString("UTF-8");
        }
    }
}
