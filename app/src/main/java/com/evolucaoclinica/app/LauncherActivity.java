package com.evolucaoclinica.app;

import android.Manifest;
import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.ContentValues;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.ConsoleMessage;
import android.webkit.CookieManager;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;
import androidx.webkit.WebSettingsCompat;
import androidx.webkit.WebViewFeature;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;

public class LauncherActivity extends Activity {
    private static final String LOG_TAG = "EvolucaoAudio";
    private static final int REQUEST_PERMISSIONS = 1001;
    private static final int REQUEST_FILE_CHOOSER = 1002;
    private static final String DOWNLOAD_NOTIFICATION_CHANNEL_ID = "file_downloads";
    private static final String APP_URL = "https://www.evolucaoclinica.app.br/?utm_source=pwa";
    private static final String TRUSTED_HOST = "www.evolucaoclinica.app.br";
    private static final String SUPABASE_HOST = "kvxboovgrrhhttaqinld.supabase.co";
    private WebView webView;
    private SwipeRefreshLayout swipeRefreshLayout;
    private ValueCallback<Uri[]> filePathCallback;
    private Uri sharedFileUri;
    private String sharedFileMimeType;
    private String sharedFileName;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // O LauncherActivity original do Bubblewrap usa uma janela translúcida porque
        // apenas encaminha a navegação para o Chrome/TWA. Como esta Activity agora
        // mantém um WebView próprio, garantimos uma superfície opaca e acelerada para
        // evitar falhas de composição em overlays, backdrop e conteúdo dos modais.
        getWindow().setBackgroundDrawable(new ColorDrawable(Color.WHITE));
        getWindow().setStatusBarColor(Color.rgb(0, 92, 19));
        getWindow().setNavigationBarColor(Color.BLACK);

        if (Build.VERSION.SDK_INT > Build.VERSION_CODES.O) {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_USER_PORTRAIT);
        }

        captureShareIntent(getIntent());
        createDownloadNotificationChannel();
        requestRequiredPermissions();

        swipeRefreshLayout = new SwipeRefreshLayout(this);
        swipeRefreshLayout.setBackgroundColor(Color.WHITE);
        swipeRefreshLayout.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));
        swipeRefreshLayout.setColorSchemeColors(Color.rgb(0, 92, 19));
        swipeRefreshLayout.setOnChildScrollUpCallback((parent, child) -> webView != null && webView.getScrollY() > 0);
        swipeRefreshLayout.setOnRefreshListener(() -> webView.reload());

        webView = new WebView(this);
        webView.setBackgroundColor(Color.WHITE);
        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        webView.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));
        webView.addJavascriptInterface(new NativeShareBridge(), "NativeShare");
        webView.addJavascriptInterface(new NativeFileDownloadBridge(), "NativeFileDownload");
        webView.addJavascriptInterface(new NativePaymentBridge(), "NativePaymentBridge");
        configureWebView(webView);

        swipeRefreshLayout.addView(webView);
        setContentView(swipeRefreshLayout);

        Uri launchUri = getIntent() == null ? null : getIntent().getData();
        webView.loadUrl(hasSharedFile() ? shareTargetUrl() : (isTrustedUrl(launchUri) ? launchUri.toString() : APP_URL));
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        captureShareIntent(intent);
        Uri callbackUri = intent == null ? null : intent.getData();
        if (webView != null) {
            webView.loadUrl(hasSharedFile() ? shareTargetUrl() : (isTrustedUrl(callbackUri) ? callbackUri.toString() : APP_URL));
        }
    }

    private String shareTargetUrl() {
        return "https://" + TRUSTED_HOST + "/painel/share-target?nativeShare=1";
    }

    private boolean hasSharedFile() {
        return sharedFileUri != null;
    }

    private void captureShareIntent(Intent intent) {
        if (intent == null) return;

        String action = intent.getAction();
        Uri fileUri = null;
        if (Intent.ACTION_SEND.equals(action)) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                fileUri = intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri.class);
            } else {
                fileUri = (Uri) intent.getParcelableExtra(Intent.EXTRA_STREAM);
            }
        } else if (Intent.ACTION_SEND_MULTIPLE.equals(action)) {
            ArrayList<Uri> uris = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (uris != null && !uris.isEmpty()) fileUri = uris.get(0);
        }

        if (fileUri == null) return;

        sharedFileUri = fileUri;
        sharedFileMimeType = intent.getType();
        sharedFileName = queryDisplayName(fileUri);
        Log.d(LOG_TAG, "Áudio compartilhado recebido: " + fileUri + " (" + sharedFileMimeType + ")");
    }

    private String queryDisplayName(Uri uri) {
        Cursor cursor = null;
        try {
            cursor = getContentResolver().query(uri, new String[]{"_display_name"}, null, null, null);
            if (cursor != null && cursor.moveToFirst()) {
                String name = cursor.getString(0);
                if (name != null && !name.trim().isEmpty()) return name;
            }
        } catch (Exception exception) {
            Log.w(LOG_TAG, "Não foi possível obter o nome do áudio compartilhado", exception);
        } finally {
            if (cursor != null) cursor.close();
        }
        return "audio-compartilhado.ogg";
    }

    private final class NativeShareBridge {
        @android.webkit.JavascriptInterface
        public synchronized String getSharedFile() {
            if (sharedFileUri == null) return "";

            try (InputStream input = getContentResolver().openInputStream(sharedFileUri);
                 ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                if (input == null) return "";

                byte[] buffer = new byte[8192];
                int read;
                while ((read = input.read(buffer)) != -1) {
                    output.write(buffer, 0, read);
                }

                String mimeType = sharedFileMimeType;
                if (mimeType == null || mimeType.trim().isEmpty() || "application/octet-stream".equalsIgnoreCase(mimeType)) {
                    mimeType = getContentResolver().getType(sharedFileUri);
                }
                if (mimeType == null || mimeType.trim().isEmpty() || "application/octet-stream".equalsIgnoreCase(mimeType)) {
                    mimeType = "audio/ogg";
                }

                JSONObject payload = new JSONObject();
                payload.put("name", sharedFileName == null ? "audio-compartilhado.ogg" : sharedFileName);
                payload.put("type", mimeType);
                payload.put("data", Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP));
                return payload.toString();
            } catch (Exception exception) {
                Log.e(LOG_TAG, "Não foi possível ler o áudio compartilhado", exception);
                return "";
            }
        }

        @android.webkit.JavascriptInterface
        public synchronized void clearSharedFile() {
            sharedFileUri = null;
            sharedFileMimeType = null;
            sharedFileName = null;
        }
    }

    private final class NativeFileDownloadBridge {
        private ByteArrayOutputStream pendingFileBuffer;
        private String pendingFileName;
        private String pendingFileMimeType;

        @android.webkit.JavascriptInterface
        public synchronized boolean saveFile(String fileName, String mimeType, String base64Data) {
            if (base64Data == null || base64Data.trim().isEmpty()) return false;

            byte[] bytes;

            try {
                bytes = Base64.decode(base64Data, Base64.DEFAULT);
            } catch (IllegalArgumentException exception) {
                Log.e(LOG_TAG, "Base64 inválido ao salvar arquivo", exception);
                return false;
            }

            return saveDecodedFile(fileName, mimeType, bytes);
        }

        @android.webkit.JavascriptInterface
        public synchronized boolean beginFile(String fileName, String mimeType) {
            pendingFileBuffer = new ByteArrayOutputStream();
            pendingFileName = fileName;
            pendingFileMimeType = mimeType;
            return true;
        }

        @android.webkit.JavascriptInterface
        public synchronized boolean appendFileChunk(String base64Chunk) {
            if (pendingFileBuffer == null || base64Chunk == null || base64Chunk.trim().isEmpty()) return false;

            try {
                pendingFileBuffer.write(Base64.decode(base64Chunk, Base64.DEFAULT));
                return true;
            } catch (IllegalArgumentException | java.io.IOException exception) {
                Log.e(LOG_TAG, "Não foi possível receber bloco do arquivo", exception);
                clearPendingFile();
                return false;
            }
        }

        @android.webkit.JavascriptInterface
        public synchronized boolean finishFile() {
            if (pendingFileBuffer == null) return false;

            byte[] bytes = pendingFileBuffer.toByteArray();
            String fileName = pendingFileName;
            String mimeType = pendingFileMimeType;
            clearPendingFile();
            return saveDecodedFile(fileName, mimeType, bytes);
        }

        private void clearPendingFile() {
            pendingFileBuffer = null;
            pendingFileName = null;
            pendingFileMimeType = null;
        }

        private boolean saveDecodedFile(String fileName, String mimeType, byte[] bytes) {
            if (bytes == null || bytes.length == 0) return false;

            String safeName = fileName == null || fileName.trim().isEmpty()
                    ? "arquivo.pdf"
                    : fileName.replaceAll("[^a-zA-Z0-9._-]", "_");
            String safeMimeType = mimeType == null || mimeType.trim().isEmpty()
                    ? "application/octet-stream"
                    : mimeType;
            Uri pendingUri = null;

            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.Downloads.DISPLAY_NAME, safeName);
                    values.put(MediaStore.Downloads.MIME_TYPE, safeMimeType);
                    values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                    values.put(MediaStore.Downloads.IS_PENDING, 1);

                    pendingUri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                    if (pendingUri == null) return false;

                    try (OutputStream output = getContentResolver().openOutputStream(pendingUri)) {
                        if (output == null) throw new IllegalStateException("Não foi possível abrir o arquivo no Downloads.");
                        output.write(bytes);
                    }

                    values.clear();
                    values.put(MediaStore.Downloads.IS_PENDING, 0);
                    getContentResolver().update(pendingUri, values, null, null);
                } else {
                    File downloadsDirectory = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                    if (downloadsDirectory == null) return false;
                    if (!downloadsDirectory.exists() && !downloadsDirectory.mkdirs()) return false;
                    File target = new File(downloadsDirectory, safeName);
                    try (FileOutputStream output = new FileOutputStream(target)) {
                        output.write(bytes);
                    }
                }

                runOnUiThread(() -> {
                    Toast.makeText(LauncherActivity.this, "PDF salvo na pasta Downloads", Toast.LENGTH_SHORT).show();
                    showDownloadNotification(safeName);
                });
                return true;
            } catch (Exception exception) {
                if (pendingUri != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    getContentResolver().delete(pendingUri, null, null);
                }
                Log.e(LOG_TAG, "Não foi possível salvar o arquivo", exception);
                return false;
            }
        }
    }

    private final class NativePaymentBridge {
        @android.webkit.JavascriptInterface
        public boolean isPaymentRequestSupported() {
            return WebViewFeature.isFeatureSupported(WebViewFeature.PAYMENT_REQUEST);
        }
    }

    private void configureWebView(WebView view) {
        WebSettings settings = view.getSettings();
        settings.setJavaScriptEnabled(true);
        boolean paymentRequestSupported = WebViewFeature.isFeatureSupported(WebViewFeature.PAYMENT_REQUEST);
        if (paymentRequestSupported) {
            WebSettingsCompat.setPaymentRequestEnabled(settings, true);
        }
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(false);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setTextZoom(100);
        settings.setSupportMultipleWindows(false);
        String userAgent = settings.getUserAgentString() + " EvolucaoClinicaApp/52";
        if (paymentRequestSupported) userAgent += " GOOGLE_PAY_SUPPORTED";
        settings.setUserAgentString(userAgent);

        view.setOverScrollMode(View.OVER_SCROLL_NEVER);
        view.setVerticalScrollBarEnabled(false);

        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(view, true);

        view.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView webView, String url) {
                super.onPageFinished(webView, url);
                if (swipeRefreshLayout != null) swipeRefreshLayout.setRefreshing(false);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView webView, WebResourceRequest request) {
                Uri url = request.getUrl();
                if (isOAuthUrl(url)) {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, url));
                    } catch (Exception ignored) {
                        Toast.makeText(LauncherActivity.this, "Não foi possível abrir o login do Google.", Toast.LENGTH_SHORT).show();
                    }
                    return true;
                }
                if ("http".equalsIgnoreCase(url.getScheme()) || "https".equalsIgnoreCase(url.getScheme())) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, url));
                } catch (Exception ignored) {
                    Toast.makeText(LauncherActivity.this, "Não foi possível abrir este endereço.", Toast.LENGTH_SHORT).show();
                }
                return true;
            }
        });

        view.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage consoleMessage) {
                Log.d(LOG_TAG, consoleMessage.message() + " (" + consoleMessage.sourceId() + ":" + consoleMessage.lineNumber() + ")");
                return true;
            }

            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> {
                    if (isTrustedUrl(request.getOrigin()) && hasMicrophonePermission()) {
                        request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
                    } else {
                        request.deny();
                    }
                });
            }

            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (filePathCallback != null) filePathCallback.onReceiveValue(null);
                filePathCallback = callback;
                Intent intent = params.createIntent();
                intent.setType("audio/*");
                intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                try {
                    startActivityForResult(intent, REQUEST_FILE_CHOOSER);
                } catch (Exception exception) {
                    filePathCallback = null;
                    callback.onReceiveValue(null);
                    return false;
                }
                return true;
            }
        });
    }

    private void requestRequiredPermissions() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return;

        ArrayList<String> permissions = new ArrayList<>();
        if (!hasMicrophonePermission()) permissions.add(Manifest.permission.RECORD_AUDIO);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && !hasNotificationPermission()) {
            permissions.add(Manifest.permission.POST_NOTIFICATIONS);
        }

        if (!permissions.isEmpty()) requestPermissions(permissions.toArray(new String[0]), REQUEST_PERMISSIONS);
    }

    private boolean hasMicrophonePermission() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.M
                || checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
    }

    private boolean hasNotificationPermission() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU
                || checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
    }

    private void createDownloadNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

        NotificationManager notificationManager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (notificationManager == null) return;

        NotificationChannel channel = new NotificationChannel(
                DOWNLOAD_NOTIFICATION_CHANNEL_ID,
                "Downloads de arquivos",
                NotificationManager.IMPORTANCE_DEFAULT
        );
        channel.setDescription("Avisos sobre arquivos salvos na pasta Downloads");
        notificationManager.createNotificationChannel(channel);
    }

    private void showDownloadNotification(String fileName) {
        if (!hasNotificationPermission()) return;

        NotificationManager notificationManager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (notificationManager == null) return;

        Intent openAppIntent = new Intent(this, LauncherActivity.class);
        openAppIntent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        int pendingIntentFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) pendingIntentFlags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent openAppPendingIntent = PendingIntent.getActivity(this, 2001, openAppIntent, pendingIntentFlags);

        String message = fileName + " foi salvo na pasta Downloads.";
        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, DOWNLOAD_NOTIFICATION_CHANNEL_ID)
                : new Notification.Builder(this);

        Notification notification = builder
                .setSmallIcon(R.drawable.ic_notification_icon)
                .setContentTitle("Download concluído")
                .setContentText(message)
                .setStyle(new Notification.BigTextStyle().bigText(message))
                .setContentIntent(openAppPendingIntent)
                .setAutoCancel(true)
                .setOnlyAlertOnce(true)
                .setCategory(Notification.CATEGORY_STATUS)
                .setPriority(Notification.PRIORITY_DEFAULT)
                .build();

        notificationManager.notify((int) (System.currentTimeMillis() & 0x7FFFFFFF), notification);
    }

    private boolean isTrustedUrl(Uri uri) {
        return uri != null && "https".equalsIgnoreCase(uri.getScheme()) && TRUSTED_HOST.equalsIgnoreCase(uri.getHost());
    }

    private boolean isTrustedUrl(String origin) {
        try {
            return isTrustedUrl(Uri.parse(origin));
        } catch (Exception exception) {
            return false;
        }
    }

    private boolean isOAuthUrl(Uri uri) {
        if (uri == null) return false;
        String host = uri.getHost();
        return "accounts.google.com".equalsIgnoreCase(host)
                || (SUPABASE_HOST.equalsIgnoreCase(host) && uri.getPath() != null && uri.getPath().startsWith("/auth/v1/authorize"));
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.stopLoading();
            webView.destroy();
        }
        super.onDestroy();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQUEST_FILE_CHOOSER && filePathCallback != null) {
            Uri[] results = resultCode == RESULT_OK && data != null
                    ? WebChromeClient.FileChooserParams.parseResult(resultCode, data) : null;
            filePathCallback.onReceiveValue(results);
            filePathCallback = null;
        }
    }
}
