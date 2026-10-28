package com.cinetune.music;

import android.app.Activity;
import android.os.Bundle;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public class MainActivity extends Activity {
    private static final int MAX_RETRIES = 4;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private WebView webView;
    private LinearLayout statusPanel;
    private TextView statusText;
    private Button retryButton;
    private int retryCount = 0;
    private boolean pageFailed = false;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        FrameLayout root = new FrameLayout(this);
        webView = new WebView(this);
        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        webView.getSettings().setMediaPlaybackRequiresUserGesture(false);
        webView.addJavascriptInterface(new NativeZingBridge(), "CineTuneNative");
        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (Uri.parse(BuildConfig.CINETUNE_URL).getHost().equals(uri.getHost())) return false;
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
                return true;
            }
            @Override public void onPageFinished(WebView view, String url) {
                if (!pageFailed) {
                    retryCount = 0;
                    statusPanel.setVisibility(View.GONE);
                }
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) handleLoadFailure();
            }
            @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
                if (request.isForMainFrame() && response.getStatusCode() >= 500) handleLoadFailure();
            }
        });
        root.addView(webView, new FrameLayout.LayoutParams(-1, -1));

        statusPanel = new LinearLayout(this);
        statusPanel.setOrientation(LinearLayout.VERTICAL);
        statusPanel.setGravity(Gravity.CENTER);
        statusPanel.setPadding(32, 32, 32, 32);
        statusPanel.setBackgroundColor(Color.rgb(248, 249, 255));
        statusText = new TextView(this);
        statusText.setText("Đang kết nối CineTune…");
        statusText.setTextSize(18);
        statusText.setTextColor(Color.rgb(18, 28, 42));
        statusText.setGravity(Gravity.CENTER);
        statusPanel.addView(statusText);
        retryButton = new Button(this);
        retryButton.setText("Thử lại");
        retryButton.setVisibility(View.GONE);
        retryButton.setOnClickListener(v -> { retryCount = 0; loadSite(); });
        statusPanel.addView(retryButton);
        root.addView(statusPanel, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);
        loadSite();
    }

    private void loadSite() {
        pageFailed = false;
        retryButton.setVisibility(View.GONE);
        statusText.setText("Đang kết nối CineTune…");
        statusPanel.setVisibility(View.VISIBLE);
        webView.loadUrl(BuildConfig.CINETUNE_URL);
    }

    private void handleLoadFailure() {
        if (pageFailed) return;
        pageFailed = true;
        if (retryCount < MAX_RETRIES) {
            retryCount++;
            statusText.setText("Máy chủ đang khởi động. Đang thử lại…");
            handler.postDelayed(this::loadSite, retryCount * 4000L);
        } else {
            statusText.setText("Chưa kết nối được. Hãy kiểm tra mạng rồi thử lại.");
            retryButton.setVisibility(View.VISIBLE);
        }
    }

    @Override public void onBackPressed() {
        if (webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }
}
