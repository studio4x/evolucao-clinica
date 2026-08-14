package com.evolucaoclinica.app;

import android.Manifest;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.ContentValues;
import android.content.SharedPreferences;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
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
import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;
import androidx.core.content.FileProvider;
import androidx.webkit.ServiceWorkerControllerCompat;
import androidx.webkit.WebViewFeature;

import com.google.firebase.FirebaseApp;
import com.google.firebase.analytics.FirebaseAnalytics;
import com.google.firebase.messaging.FirebaseMessaging;

import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;
import com.stripe.android.PaymentConfiguration;
import com.stripe.android.paymentsheet.PaymentSheet;
import com.stripe.android.paymentsheet.PaymentSheetResult;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

public class LauncherActivity extends ComponentActivity {
    private static final String LOG_TAG = "EvolucaoAudio";
    private static final int REQUEST_PERMISSIONS = 1001;
    private static final int REQUEST_FILE_CHOOSER = 1002;
    private static final String[] AUDIO_FILE_CHOOSER_MIME_TYPES = {
            "audio/*",
            "audio/ogg",
            "audio/x-ogg",
            "application/ogg",
            "application/octet-stream"
    };
    private static final String APP_URL = "https://www.evolucaoclinica.app.br/login?utm_source=pwa";
    private static final String TRUSTED_HOST = "www.evolucaoclinica.app.br";
    private static final String SUPABASE_HOST = "kvxboovgrrhhttaqinld.supabase.co";
    private WebView webView;
    private SwipeRefreshLayout swipeRefreshLayout;
    private ValueCallback<Uri[]> filePathCallback;
    private Uri sharedFileUri;
    private String sharedFileMimeType;
    private String sharedFileName;
    private MediaPlayer sharedAudioPlayer;
    private boolean sharedAudioPlayerPrepared;
    private String sharedAudioPlaybackStatus = "idle";
    private String sharedAudioPlaybackError = "";
    private int sharedAudioPlaybackPositionMs;
    private int sharedAudioPlaybackDurationMs;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final Runnable sharedAudioStateTicker = new Runnable() {
        @Override
        public void run() {
            emitSharedAudioPlaybackState();
            if ("playing".equals(sharedAudioPlaybackStatus) || "preparing".equals(sharedAudioPlaybackStatus)) {
                mainHandler.postDelayed(this, 250);
            }
        }
    };
    private BillingClient billingClient;
    private FirebaseAnalytics firebaseAnalytics;
    // The Web consent UI is the source of truth. Collection starts denied.
    private boolean analyticsConsentGranted = false;
    private PaymentSheet paymentSheet;
    private final Map<String, ProductDetails> subscriptionProducts = new HashMap<>();
    private String pendingBillingPlanId;
    private String pendingBillingAccountId;

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
        requestRequiredPermissions();
        initializeFirebaseAnalytics();
        paymentSheet = new PaymentSheet(this, this::onPaymentSheetResult);
        initializeBillingClient();

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
        webView.addJavascriptInterface(new NativeBillingBridge(), "NativeBillingBridge");
        webView.addJavascriptInterface(new NativeAppInfoBridge(), "NativeAppInfoBridge");
        webView.addJavascriptInterface(new NativePushBridge(), "NativePushBridge");
        webView.addJavascriptInterface(new NativeAnalyticsBridge(), "NativeAnalyticsBridge");
        configureWebView(webView);
        webView.clearCache(true);

        swipeRefreshLayout.addView(webView);
        setContentView(swipeRefreshLayout);

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (webView != null && webView.canGoBack()) {
                    webView.goBack();
                    return;
                }
                setEnabled(false);
                getOnBackPressedDispatcher().onBackPressed();
                setEnabled(true);
            }
        });

        webView.loadUrl(resolveLaunchUrl(getIntent()));
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        captureShareIntent(intent);
        if (webView != null) {
            webView.loadUrl(resolveLaunchUrl(intent));
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        // O estado de uma compra pendente pode mudar enquanto o Pix é pago fora
        // do aplicativo. Reconsultamos o Play Billing a cada retorno ao primeiro plano.
        if (pendingBillingAccountId != null && !pendingBillingAccountId.trim().isEmpty()) {
            mainHandler.postDelayed(() -> restoreNativePurchases(pendingBillingAccountId), 350);
        }
    }

    private String resolveLaunchUrl(Intent intent) {
        Uri uri = intent == null ? null : intent.getData();
        // O callback OAuth precisa ser consumido antes de reabrir o áudio. Caso
        // contrário, o arquivo compartilhado faz o app descartar os tokens novos.
        if (isNativeOAuthCallback(uri)) return nativeOAuthCallbackUrl(uri);
        if (hasSharedFile()) return shareTargetUrl();
        String notificationLink = intent == null ? null : intent.getStringExtra("notification_link");
        return notificationUrl(notificationLink, uri);
    }

    private String notificationUrl(String link, Uri fallbackUri) {
        if (link != null && !link.trim().isEmpty()) {
            Uri linkUri = Uri.parse(link.startsWith("http") ? link : "https://" + TRUSTED_HOST + (link.startsWith("/") ? link : "/" + link));
            if (isTrustedUrl(linkUri)) return linkUri.toString();
        }
        if (isNativeOAuthCallback(fallbackUri)) return nativeOAuthCallbackUrl(fallbackUri);
        return isTrustedUrl(fallbackUri) ? fallbackUri.toString() : appUrl();
    }

    private boolean isNativeOAuthCallback(Uri uri) {
        return uri != null
                && "evolucaoclinica".equalsIgnoreCase(uri.getScheme())
                && "auth-callback".equalsIgnoreCase(uri.getHost());
    }

    private String nativeOAuthCallbackUrl(Uri callbackUri) {
        String query = callbackUri.getEncodedQuery();
        String fragment = callbackUri.getEncodedFragment();
        return "https://" + TRUSTED_HOST + "/auth/callback"
                + (query == null || query.isEmpty() ? "" : "?" + query)
                + (fragment == null || fragment.isEmpty() ? "" : "#" + fragment);
    }

    private String shareTargetUrl() {
        return "https://" + TRUSTED_HOST + "/painel/share-target?nativeShare=1";
    }

    private String appUrl() {
        return APP_URL + "&native_version=" + getInstalledVersionCode();
    }

    private long getInstalledVersionCode() {
        try {
            android.content.pm.PackageInfo packageInfo = getPackageManager().getPackageInfo(getPackageName(), 0);
            return Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
                    ? packageInfo.getLongVersionCode()
                    : packageInfo.versionCode;
        } catch (Exception exception) {
            return 0;
        }
    }

    private String getInstalledVersionName() {
        try {
            String versionName = getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
            return versionName == null || versionName.trim().isEmpty() ? "unknown" : versionName;
        } catch (Exception exception) {
            return "unknown";
        }
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

        releaseSharedAudioPlayer(true);
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

    private String resolveSharedAudioMimeType(String fileName, String declaredMimeType) {
        String name = fileName == null ? "" : fileName.toLowerCase();
        if (name.endsWith(".opus") || name.endsWith(".ogg")) return "audio/ogg; codecs=opus";
        if (name.endsWith(".webm")) return "audio/webm; codecs=opus";
        if (name.endsWith(".m4a")) return "audio/mp4";
        if (name.endsWith(".mp3")) return "audio/mpeg";
        if (name.endsWith(".wav")) return "audio/wav";

        String mimeType = declaredMimeType == null ? "" : declaredMimeType.trim();
        return mimeType.startsWith("audio/") ? mimeType : "audio/ogg; codecs=opus";
    }

    private void emitSharedAudioPlaybackState() {
        if (webView == null) return;

        int positionMs = sharedAudioPlaybackPositionMs;
        int durationMs = sharedAudioPlaybackDurationMs;
        if (sharedAudioPlayer != null && sharedAudioPlayerPrepared) {
            try {
                positionMs = Math.max(0, sharedAudioPlayer.getCurrentPosition());
                durationMs = Math.max(0, sharedAudioPlayer.getDuration());
                sharedAudioPlaybackPositionMs = positionMs;
                sharedAudioPlaybackDurationMs = durationMs;
            } catch (IllegalStateException exception) {
                Log.w(LOG_TAG, "Não foi possível consultar o player nativo", exception);
            }
        }

        try {
            JSONObject state = new JSONObject();
            state.put("status", sharedAudioPlaybackStatus);
            state.put("positionMs", positionMs);
            state.put("durationMs", durationMs);
            state.put("error", sharedAudioPlaybackError);
            webView.evaluateJavascript(
                    "window.dispatchEvent(new CustomEvent('native-shared-audio-state',{detail:" + state + "}));",
                    null
            );
        } catch (Exception exception) {
            Log.w(LOG_TAG, "Não foi possível enviar o estado do player nativo", exception);
        }
    }

    private void scheduleSharedAudioStateUpdates() {
        mainHandler.removeCallbacks(sharedAudioStateTicker);
        mainHandler.post(sharedAudioStateTicker);
    }

    private void playSharedAudio() {
        if (sharedFileUri == null) {
            sharedAudioPlaybackStatus = "error";
            sharedAudioPlaybackError = "O arquivo compartilhado não está mais disponível.";
            emitSharedAudioPlaybackState();
            return;
        }

        if (sharedAudioPlayer != null && sharedAudioPlayerPrepared) {
            try {
                if ("completed".equals(sharedAudioPlaybackStatus)) {
                    sharedAudioPlaybackPositionMs = 0;
                    sharedAudioPlayer.seekTo(0);
                }
                sharedAudioPlayer.start();
                sharedAudioPlaybackStatus = "playing";
                sharedAudioPlaybackError = "";
                scheduleSharedAudioStateUpdates();
                return;
            } catch (IllegalStateException exception) {
                Log.w(LOG_TAG, "Recriando o player nativo após estado inválido", exception);
                releaseSharedAudioPlayer(false);
            }
        }

        releaseSharedAudioPlayer(false);
        sharedAudioPlaybackStatus = "preparing";
        sharedAudioPlaybackError = "";
        emitSharedAudioPlaybackState();

        try {
            MediaPlayer player = new MediaPlayer();
            sharedAudioPlayer = player;
            player.setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build());
            player.setDataSource(this, sharedFileUri);
            player.setOnPreparedListener(preparedPlayer -> {
                if (sharedAudioPlayer != preparedPlayer) return;
                sharedAudioPlayerPrepared = true;
                try {
                    sharedAudioPlaybackDurationMs = Math.max(0, preparedPlayer.getDuration());
                    if (sharedAudioPlaybackPositionMs > 0
                            && sharedAudioPlaybackPositionMs < sharedAudioPlaybackDurationMs) {
                        preparedPlayer.seekTo(sharedAudioPlaybackPositionMs);
                    }
                    preparedPlayer.start();
                    sharedAudioPlaybackStatus = "playing";
                    scheduleSharedAudioStateUpdates();
                } catch (IllegalStateException exception) {
                    sharedAudioPlaybackStatus = "error";
                    sharedAudioPlaybackError = "Não foi possível iniciar a reprodução neste aparelho.";
                    emitSharedAudioPlaybackState();
                }
            });
            player.setOnCompletionListener(completedPlayer -> {
                if (sharedAudioPlayer != completedPlayer) return;
                sharedAudioPlaybackDurationMs = Math.max(0, completedPlayer.getDuration());
                sharedAudioPlaybackPositionMs = sharedAudioPlaybackDurationMs;
                sharedAudioPlaybackStatus = "completed";
                mainHandler.removeCallbacks(sharedAudioStateTicker);
                emitSharedAudioPlaybackState();
            });
            player.setOnErrorListener((failedPlayer, what, extra) -> {
                if (sharedAudioPlayer == failedPlayer) {
                    sharedAudioPlaybackStatus = "error";
                    sharedAudioPlaybackError = "O Android não conseguiu decodificar este áudio (" + what + "/" + extra + ").";
                    mainHandler.removeCallbacks(sharedAudioStateTicker);
                    emitSharedAudioPlaybackState();
                }
                return true;
            });
            player.prepareAsync();
            scheduleSharedAudioStateUpdates();
        } catch (Exception exception) {
            Log.e(LOG_TAG, "Não foi possível preparar o áudio compartilhado", exception);
            sharedAudioPlaybackStatus = "error";
            sharedAudioPlaybackError = "Não foi possível preparar o áudio para reprodução.";
            releaseSharedAudioPlayer(false);
            emitSharedAudioPlaybackState();
        }
    }

    private void pauseSharedAudio() {
        if (sharedAudioPlayer != null && sharedAudioPlayerPrepared) {
            try {
                sharedAudioPlaybackPositionMs = Math.max(0, sharedAudioPlayer.getCurrentPosition());
                sharedAudioPlaybackDurationMs = Math.max(0, sharedAudioPlayer.getDuration());
            } catch (IllegalStateException exception) {
                Log.w(LOG_TAG, "Não foi possível salvar a posição do player nativo", exception);
            }
        }

        // Alguns aparelhos continuam emitindo áudio após MediaPlayer.pause().
        // Liberar a instância garante a interrupção; playSharedAudio recria o
        // player e retoma da posição armazenada acima.
        releaseSharedAudioPlayer(false);
        sharedAudioPlaybackStatus = "paused";
        sharedAudioPlaybackError = "";
        emitSharedAudioPlaybackState();
    }

    private void seekSharedAudio(int positionMs) {
        int durationMs = Math.max(0, sharedAudioPlaybackDurationMs);
        int targetPositionMs = Math.max(0, Math.min(positionMs, durationMs));
        sharedAudioPlaybackPositionMs = targetPositionMs;

        if (sharedAudioPlayer == null || !sharedAudioPlayerPrepared) {
            emitSharedAudioPlaybackState();
            return;
        }
        try {
            sharedAudioPlayer.seekTo(targetPositionMs);
            emitSharedAudioPlaybackState();
        } catch (IllegalStateException exception) {
            Log.w(LOG_TAG, "Não foi possível avançar o player nativo", exception);
        }
    }

    private void releaseSharedAudioPlayer(boolean resetState) {
        mainHandler.removeCallbacks(sharedAudioStateTicker);
        if (sharedAudioPlayer != null) {
            try {
                sharedAudioPlayer.release();
            } catch (Exception exception) {
                Log.w(LOG_TAG, "Não foi possível liberar o player nativo", exception);
            }
        }
        sharedAudioPlayer = null;
        sharedAudioPlayerPrepared = false;
        if (resetState) {
            sharedAudioPlaybackStatus = "idle";
            sharedAudioPlaybackError = "";
            sharedAudioPlaybackPositionMs = 0;
            sharedAudioPlaybackDurationMs = 0;
        }
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
                mimeType = resolveSharedAudioMimeType(sharedFileName, mimeType);

                JSONObject payload = new JSONObject();
                payload.put("name", sharedFileName == null ? "audio-compartilhado.ogg" : sharedFileName);
                payload.put("type", mimeType);
                payload.put("size", output.size());
                payload.put("data", Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP));
                return payload.toString();
            } catch (Exception exception) {
                Log.e(LOG_TAG, "Não foi possível ler o áudio compartilhado", exception);
                return "";
            }
        }

        @android.webkit.JavascriptInterface
        public boolean playSharedFile() {
            if (sharedFileUri == null) return false;
            runOnUiThread(LauncherActivity.this::playSharedAudio);
            return true;
        }

        @android.webkit.JavascriptInterface
        public void pauseSharedFile() {
            runOnUiThread(LauncherActivity.this::pauseSharedAudio);
        }

        @android.webkit.JavascriptInterface
        public void seekSharedFile(int positionMs) {
            runOnUiThread(() -> seekSharedAudio(positionMs));
        }

        @android.webkit.JavascriptInterface
        public void clearSharedFile() {
            runOnUiThread(() -> {
                releaseSharedAudioPlayer(true);
                sharedFileUri = null;
                sharedFileMimeType = null;
                sharedFileName = null;
                emitSharedAudioPlaybackState();
            });
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
            Uri savedUri;

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
                    savedUri = pendingUri;
                } else {
                    File downloadsDirectory = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                    if (downloadsDirectory == null) return false;
                    if (!downloadsDirectory.exists() && !downloadsDirectory.mkdirs()) return false;
                    File target = new File(downloadsDirectory, safeName);
                    try (FileOutputStream output = new FileOutputStream(target)) {
                        output.write(bytes);
                    }
                    savedUri = FileProvider.getUriForFile(
                            LauncherActivity.this,
                            getPackageName() + ".fileprovider",
                            target
                    );
                }

                Uri finalSavedUri = savedUri;
                runOnUiThread(() -> openDownloadedFile(finalSavedUri, safeMimeType, safeName));
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

    private final class NativeBillingBridge {
        @android.webkit.JavascriptInterface
        public boolean isAvailable() {
            return true;
        }

        @android.webkit.JavascriptInterface
        public void startSubscription(String planId, String accountId) {
            runOnUiThread(() -> startNativeSubscription(planId, accountId));
        }

        @android.webkit.JavascriptInterface
        public void restorePurchases(String accountId) {
            runOnUiThread(() -> restoreNativePurchases(accountId));
        }

        @android.webkit.JavascriptInterface
        public void presentStripePaymentSheet(String clientSecret, String publishableKey, boolean production) {
            runOnUiThread(() -> showStripePaymentSheet(clientSecret, publishableKey, production));
        }
    }

    private void initializeBillingClient() {
        billingClient = BillingClient.newBuilder(this)
                .setListener(this::onPurchasesUpdated)
                .enablePendingPurchases(
                        PendingPurchasesParams.newBuilder()
                                .enableOneTimeProducts()
                                .build()
                )
                .enableUserChoiceBilling(userChoiceDetails -> {
                    try {
                        JSONObject payload = new JSONObject();
                        payload.put("type", "alternative_selected");
                        payload.put("planId", pendingBillingPlanId == null ? "" : pendingBillingPlanId);
                        payload.put("externalTransactionToken", userChoiceDetails.getExternalTransactionToken());
                        dispatchBillingEvent(payload);
                    } catch (Exception exception) {
                        dispatchBillingError("Não foi possível receber a escolha de faturamento.");
                    }
                })
                .build();
        connectBillingClient(null);
    }

    private void connectBillingClient(Runnable onReady) {
        if (billingClient == null) initializeBillingClient();
        if (billingClient.isReady()) {
            if (onReady != null) onReady.run();
            return;
        }
        billingClient.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(BillingResult billingResult) {
                if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                    if (onReady != null) onReady.run();
                } else {
                    dispatchBillingError(billingMessage("Não foi possível conectar à Google Play.", billingResult));
                }
            }

            @Override
            public void onBillingServiceDisconnected() {
                Log.w(LOG_TAG, "Conexão com Google Play Billing interrompida.");
            }
        });
    }

    private void startNativeSubscription(String planId, String accountId) {
        if (!"monthly".equals(planId) && !"yearly".equals(planId)) {
            dispatchBillingError("Plano de assinatura inválido.");
            return;
        }
        if (accountId == null || accountId.trim().isEmpty()) {
            dispatchBillingError("Conta autenticada não identificada.");
            return;
        }
        pendingBillingPlanId = planId;
        pendingBillingAccountId = accountId;
        connectBillingClient(() -> queryProductAndLaunch(planId));
    }

    private void queryProductAndLaunch(String planId) {
        String productId = productIdForPlan(planId);
        QueryProductDetailsParams.Product product = QueryProductDetailsParams.Product.newBuilder()
                .setProductId(productId)
                .setProductType(BillingClient.ProductType.SUBS)
                .build();
        QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder()
                .setProductList(Collections.singletonList(product))
                .build();

        billingClient.queryProductDetailsAsync(params, (billingResult, queryResult) -> {
            if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                dispatchBillingError(billingMessage("Não foi possível consultar o plano na Google Play.", billingResult));
                return;
            }
            List<ProductDetails> products = queryResult.getProductDetailsList();
            if (products == null || products.isEmpty()) {
                dispatchBillingError("O produto ainda não está disponível para esta conta na Google Play.");
                return;
            }

            ProductDetails details = products.get(0);
            subscriptionProducts.put(details.getProductId(), details);
            List<ProductDetails.SubscriptionOfferDetails> offers = details.getSubscriptionOfferDetails();
            if (offers == null || offers.isEmpty()) {
                dispatchBillingError("O plano base da assinatura não foi encontrado na Google Play.");
                return;
            }

            String expectedBasePlan = "yearly".equals(planId) ? "yearly-auto" : "monthly-auto";
            ProductDetails.SubscriptionOfferDetails selectedOffer = offers.get(0);
            for (ProductDetails.SubscriptionOfferDetails offer : offers) {
                if (expectedBasePlan.equals(offer.getBasePlanId())) {
                    selectedOffer = offer;
                    break;
                }
            }

            BillingFlowParams.ProductDetailsParams productParams =
                    BillingFlowParams.ProductDetailsParams.newBuilder()
                            .setProductDetails(details)
                            .setOfferToken(selectedOffer.getOfferToken())
                            .build();
            BillingFlowParams flowParams = BillingFlowParams.newBuilder()
                    .setProductDetailsParamsList(Collections.singletonList(productParams))
                    .setObfuscatedAccountId(sha256(pendingBillingAccountId))
                    .build();
            BillingResult launchResult = billingClient.launchBillingFlow(this, flowParams);
            if (launchResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                dispatchBillingError(billingMessage("Não foi possível abrir a compra na Google Play.", launchResult));
            }
        });
    }

    private void onPurchasesUpdated(BillingResult billingResult, List<Purchase> purchases) {
        if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.USER_CANCELED) {
            dispatchSimpleBillingEvent("billing_cancelled", pendingBillingPlanId, null);
            return;
        }
        if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
            dispatchBillingError(billingMessage("A compra não foi concluída pela Google Play.", billingResult));
            return;
        }
        if (purchases == null) return;
        for (Purchase purchase : purchases) dispatchPlayPurchase(purchase, false);
    }

    private void dispatchPlayPurchase(Purchase purchase, boolean restored) {
        try {
            List<String> products = purchase.getProducts();
            String productId = products == null || products.isEmpty() ? "" : products.get(0);
            String planId = planIdForProduct(productId);
            JSONObject payload = new JSONObject();
            payload.put(
                    "type",
                    purchase.getPurchaseState() == Purchase.PurchaseState.PURCHASED
                            ? "play_purchase"
                            : "play_purchase_pending"
            );
            payload.put("planId", planId);
            payload.put("productId", productId);
            payload.put("purchaseToken", purchase.getPurchaseToken());
            payload.put("orderId", purchase.getOrderId() == null ? "" : purchase.getOrderId());
            payload.put("restored", restored);
            dispatchBillingEvent(payload);
        } catch (Exception exception) {
            dispatchBillingError("Não foi possível validar os dados retornados pela Google Play.");
        }
    }

    private void restoreNativePurchases(String accountId) {
        pendingBillingAccountId = accountId;
        connectBillingClient(() -> {
            QueryPurchasesParams params = QueryPurchasesParams.newBuilder()
                    .setProductType(BillingClient.ProductType.SUBS)
                    .build();
            billingClient.queryPurchasesAsync(params, (billingResult, purchases) -> {
                if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    Log.w(LOG_TAG, billingMessage("Falha ao restaurar compras.", billingResult));
                    return;
                }
                for (Purchase purchase : purchases) dispatchPlayPurchase(purchase, true);
            });
        });
    }

    private void showStripePaymentSheet(String clientSecret, String publishableKey, boolean production) {
        if (clientSecret == null || clientSecret.trim().isEmpty() ||
                publishableKey == null || publishableKey.trim().isEmpty()) {
            dispatchBillingError("Configuração Stripe incompleta.");
            return;
        }
        PaymentConfiguration.init(getApplicationContext(), publishableKey);
        PaymentSheet.GooglePayConfiguration.Environment environment = production
                ? PaymentSheet.GooglePayConfiguration.Environment.Production
                : PaymentSheet.GooglePayConfiguration.Environment.Test;
        PaymentSheet.GooglePayConfiguration googlePay =
                new PaymentSheet.GooglePayConfiguration(environment, "BR", "BRL");
        PaymentSheet.Configuration configuration = new PaymentSheet.Configuration.Builder("Evolução Clínica")
                .googlePay(googlePay)
                .allowsDelayedPaymentMethods(false)
                .build();
        paymentSheet.presentWithPaymentIntent(clientSecret, configuration);
    }

    private void onPaymentSheetResult(PaymentSheetResult result) {
        if (result instanceof PaymentSheetResult.Completed) {
            dispatchSimpleBillingEvent("stripe_payment_completed", pendingBillingPlanId, null);
        } else if (result instanceof PaymentSheetResult.Canceled) {
            dispatchSimpleBillingEvent("stripe_payment_cancelled", pendingBillingPlanId, null);
        } else if (result instanceof PaymentSheetResult.Failed) {
            Throwable error = ((PaymentSheetResult.Failed) result).getError();
            dispatchSimpleBillingEvent(
                    "stripe_payment_failed",
                    pendingBillingPlanId,
                    error == null ? "Pagamento recusado pela Stripe." : error.getLocalizedMessage()
            );
        }
    }

    private void dispatchBillingError(String message) {
        dispatchSimpleBillingEvent("billing_error", pendingBillingPlanId, message);
    }

    private void dispatchSimpleBillingEvent(String type, String planId, String message) {
        try {
            JSONObject payload = new JSONObject();
            payload.put("type", type);
            payload.put("planId", planId == null ? "" : planId);
            if (message != null) payload.put("message", message);
            dispatchBillingEvent(payload);
        } catch (Exception exception) {
            Log.e(LOG_TAG, "Falha ao montar evento de pagamento", exception);
        }
    }

    private void dispatchBillingEvent(JSONObject payload) {
        runOnUiThread(() -> {
            if (webView == null) return;
            String script = "window.dispatchEvent(new CustomEvent('native-billing',{detail:" + payload + "}));";
            webView.evaluateJavascript(script, null);
        });
    }

    private String billingMessage(String fallback, BillingResult result) {
        String details = result == null ? "" : result.getDebugMessage();
        return details == null || details.trim().isEmpty() ? fallback : fallback + " " + details;
    }

    private String productIdForPlan(String planId) {
        return "yearly".equals(planId) ? "evolucao_yearly" : "evolucao_monthly";
    }

    private String planIdForProduct(String productId) {
        return "evolucao_yearly".equals(productId) ? "yearly" : "monthly";
    }

    private String sha256(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] bytes = digest.digest(String.valueOf(value).getBytes(StandardCharsets.UTF_8));
            StringBuilder result = new StringBuilder();
            for (byte item : bytes) result.append(String.format("%02x", item));
            return result.toString();
        } catch (Exception exception) {
            return String.valueOf(value).replaceAll("[^a-zA-Z0-9]", "");
        }
    }

    private void initializeFirebaseAnalytics() {
        try {
            if (FirebaseApp.getApps(this).isEmpty()) {
                FirebaseApp.initializeApp(this);
            }
            if (!FirebaseApp.getApps(this).isEmpty()) {
                firebaseAnalytics = FirebaseAnalytics.getInstance(this);
                firebaseAnalytics.setAnalyticsCollectionEnabled(analyticsConsentGranted);
            }
        } catch (Exception exception) {
            Log.w(LOG_TAG, "Firebase Analytics indisponível", exception);
        }
    }

    private void openDownloadedFile(Uri fileUri, String mimeType, String fileName) {
        Intent viewIntent = new Intent(Intent.ACTION_VIEW);
        viewIntent.setDataAndType(fileUri, mimeType);
        viewIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NO_HISTORY);

        try {
            startActivity(viewIntent);
        } catch (ActivityNotFoundException exception) {
            Log.w(LOG_TAG, "Nenhum aplicativo disponível para abrir o arquivo " + fileName, exception);
            Toast.makeText(
                    this,
                    "PDF salvo em Downloads. Instale um leitor de PDF para abri-lo.",
                    Toast.LENGTH_LONG
            ).show();
        }
    }

    private boolean isValidAnalyticsEventName(String eventName) {
        if (eventName == null || !eventName.matches("^[a-z][a-z0-9_]{0,39}$")) return false;
        return !"first_open".equals(eventName)
                && !"session_start".equals(eventName)
                && !"in_app_purchase".equals(eventName);
    }

    private boolean isAllowedAnalyticsParameter(String name) {
        if (name == null || name.length() > 40) return false;
        return "method".equals(name)
                || "plan_id".equals(name)
                || "plan_name".equals(name)
                || "value".equals(name)
                || "currency".equals(name)
                || "payment_provider".equals(name)
                || "input_mode".equals(name)
                || "is_first_activation".equals(name)
                || "professional_segment".equals(name)
                || "work_context".equals(name)
                || "transaction_id".equals(name)
                || "page_location".equals(name)
                || "page_title".equals(name)
                || "day".equals(name);
    }

    private boolean isSafeAnalyticsValue(String value) {
        if (value == null || value.trim().isEmpty() || value.length() > 100) return false;
        String normalized = value.toLowerCase(java.util.Locale.ROOT);
        return !normalized.matches(".*(patient|evolution|clinical|diagnos|transcri|document|drive|https?://|email|phone|token|secret|access[_-]?token|record|cid).*" );
    }

    private final class NativeAnalyticsBridge {
        @android.webkit.JavascriptInterface
        public void logEvent(String eventName, String parametersJson) {
            if (!analyticsConsentGranted || !isValidAnalyticsEventName(eventName)) return;
            try {
                if (firebaseAnalytics == null) initializeFirebaseAnalytics();
                if (firebaseAnalytics == null) return;

                JSONObject json = new JSONObject(parametersJson == null ? "{}" : parametersJson);
                Bundle bundle = new Bundle();
                java.util.Iterator<String> keys = json.keys();
                int accepted = 0;
                while (keys.hasNext() && accepted < 25) {
                    String key = keys.next();
                    if (!isAllowedAnalyticsParameter(key)) continue;
                    Object value = json.opt(key);
                    if (value instanceof String && isSafeAnalyticsValue((String) value)) {
                        bundle.putString(key, ((String) value).trim());
                        accepted++;
                    } else if (value instanceof Boolean) {
                        bundle.putBoolean(key, (Boolean) value);
                        accepted++;
                    } else if (value instanceof Number) {
                        double number = ((Number) value).doubleValue();
                        if (!Double.isNaN(number) && !Double.isInfinite(number)) {
                            bundle.putDouble(key, number);
                            accepted++;
                        }
                    }
                }
                firebaseAnalytics.logEvent(eventName, bundle);
            } catch (Exception exception) {
                Log.w(LOG_TAG, "Evento de Analytics rejeitado", exception);
            }
        }

        @android.webkit.JavascriptInterface
        @android.annotation.SuppressLint("InvalidAnalyticsName")
        public boolean logStripeInAppPurchase(String transactionId, double value, String currency, String itemName) {
            if (!analyticsConsentGranted
                    || transactionId == null
                    || !transactionId.matches("^[A-Za-z0-9_-]{1,100}$")
                    || Double.isNaN(value)
                    || Double.isInfinite(value)
                    || value <= 0
                    || !"BRL".equals(currency)
                    || !isSafeAnalyticsValue(itemName)) {
                return false;
            }
            synchronized (LauncherActivity.this) {
                try {
                    if (firebaseAnalytics == null) initializeFirebaseAnalytics();
                    if (firebaseAnalytics == null) return false;
                    SharedPreferences dedupe = getSharedPreferences("analytics_purchase_dedupe", MODE_PRIVATE);
                    String dedupeKey = "stripe_" + sha256(transactionId);
                    if (dedupe.getBoolean(dedupeKey, false)) return false;

                    Bundle params = new Bundle();
                    params.putString(FirebaseAnalytics.Param.TRANSACTION_ID, transactionId);
                    params.putDouble(FirebaseAnalytics.Param.VALUE, value);
                    params.putString(FirebaseAnalytics.Param.CURRENCY, currency);
                    params.putString(FirebaseAnalytics.Param.ITEM_NAME, itemName.trim());
                    params.putString("payment_provider", "stripe");
                    firebaseAnalytics.logEvent(FirebaseAnalytics.Event.IN_APP_PURCHASE, params);
                    dedupe.edit().putBoolean(dedupeKey, true).apply();
                    return true;
                } catch (Exception exception) {
                    Log.w(LOG_TAG, "Compra Stripe confirmada não registrada no Firebase Analytics.");
                    return false;
                }
            }
        }

        @android.webkit.JavascriptInterface
        public void setUserId(String userId) {
            if (firebaseAnalytics == null) initializeFirebaseAnalytics();
            if (firebaseAnalytics == null) return;
            if (userId == null || userId.trim().isEmpty()) {
                firebaseAnalytics.setUserId(null);
                return;
            }
            if (!analyticsConsentGranted) return;
            if (userId.matches("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$")) {
                firebaseAnalytics.setUserId(userId);
            }
        }

        @android.webkit.JavascriptInterface
        public void setUserProperty(String name, String value) {
            if (firebaseAnalytics == null) initializeFirebaseAnalytics();
            if (firebaseAnalytics == null) return;
            if ("professional_segment".equals(name)
                    || "work_context".equals(name)
                    || "subscription_plan".equals(name)
                    || "app_environment".equals(name)) {
                if (value == null) {
                    firebaseAnalytics.setUserProperty(name, null);
                    return;
                }
                if (!analyticsConsentGranted || value.length() > 36 || !isSafeAnalyticsValue(value)) return;
                firebaseAnalytics.setUserProperty(name, value.trim());
            }
        }

        @android.webkit.JavascriptInterface
        public void setAnalyticsCollectionEnabled(boolean enabled) {
            analyticsConsentGranted = enabled;
            if (firebaseAnalytics == null) initializeFirebaseAnalytics();
            if (firebaseAnalytics != null) {
                firebaseAnalytics.setAnalyticsCollectionEnabled(enabled);
                if (!enabled) {
                    firebaseAnalytics.setUserId(null);
                    firebaseAnalytics.setUserProperty("professional_segment", null);
                    firebaseAnalytics.setUserProperty("work_context", null);
                    firebaseAnalytics.setUserProperty("subscription_plan", null);
                    firebaseAnalytics.setUserProperty("app_environment", null);
                }
            }
        }
    }

    private final class NativeAppInfoBridge {
        @android.webkit.JavascriptInterface
        public String getAppInfo() {
            try {
                JSONObject payload = new JSONObject();
                payload.put("versionCode", getInstalledVersionCode());
                payload.put("versionName", getInstalledVersionName());
                return payload.toString();
            } catch (Exception exception) {
                Log.e(LOG_TAG, "Não foi possível obter a versão instalada", exception);
                return "{}";
            }
        }

        @android.webkit.JavascriptInterface
        public void setPullToRefreshEnabled(boolean enabled) {
            runOnUiThread(() -> {
                if (swipeRefreshLayout == null) return;
                swipeRefreshLayout.setEnabled(enabled);
                if (!enabled) swipeRefreshLayout.setRefreshing(false);
            });
        }
    }

    private final class NativePushBridge {
        @android.webkit.JavascriptInterface
        public boolean isAvailable() {
            try {
                return !FirebaseApp.getApps(LauncherActivity.this).isEmpty();
            } catch (Exception exception) {
                Log.w(LOG_TAG, "Firebase ainda não está configurado para push", exception);
                return false;
            }
        }

        @android.webkit.JavascriptInterface
        public boolean isPermissionGranted() {
            return hasNotificationPermission();
        }

        @android.webkit.JavascriptInterface
        public void requestToken() {
            if (!isAvailable()) return;
            FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
                if (!task.isSuccessful() || task.getResult() == null || webView == null) {
                    Log.w(LOG_TAG, "Não foi possível obter o token FCM", task.getException());
                    return;
                }
                String token = JSONObject.quote(task.getResult());
                runOnUiThread(() -> webView.evaluateJavascript(
                        "window.dispatchEvent(new CustomEvent('native-push-token',{detail:{token:" + token + "}}));",
                        null
                ));
            });
        }

        /**
         * Recria o token FCM antes de concluir a ativação iniciada pelo convite
         * web. Isso evita persistir uma inscrição antiga que pode estar inválida
         * no Firebase, sem exigir que o usuário desligue e ligue o push manualmente.
         */
        @android.webkit.JavascriptInterface
        public void refreshToken() {
            if (!isAvailable()) return;
            FirebaseMessaging.getInstance().deleteToken()
                    .continueWithTask(task -> FirebaseMessaging.getInstance().getToken())
                    .addOnCompleteListener(task -> {
                        if (!task.isSuccessful() || task.getResult() == null || webView == null) {
                            Log.w(LOG_TAG, "Não foi possível renovar o token FCM", task.getException());
                            return;
                        }
                        String token = JSONObject.quote(task.getResult());
                        runOnUiThread(() -> webView.evaluateJavascript(
                                "window.dispatchEvent(new CustomEvent('native-push-token',{detail:{token:" + token + "}}));",
                                null
                        ));
                    });
        }

        @android.webkit.JavascriptInterface
        public void deleteToken() {
            if (!isAvailable()) return;
            FirebaseMessaging.getInstance().deleteToken().addOnFailureListener(error ->
                    Log.w(LOG_TAG, "Não foi possível remover o token FCM", error));
        }
    }

    private void configureWebView(WebView view) {
        WebSettings settings = view.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(false);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setTextZoom(100);
        settings.setSupportMultipleWindows(false);
        String userAgent = settings.getUserAgentString() + " EvolucaoClinicaApp/" + getInstalledVersionName();
        settings.setUserAgentString(userAgent);

        if (WebViewFeature.isFeatureSupported(WebViewFeature.SERVICE_WORKER_CACHE_MODE)) {
            ServiceWorkerControllerCompat.getInstance()
                    .getServiceWorkerWebSettings()
                    .setCacheMode(WebSettings.LOAD_NO_CACHE);
        }

        view.setOverScrollMode(View.OVER_SCROLL_NEVER);
        view.setVerticalScrollBarEnabled(false);

        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(view, true);

        view.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView webView, String url) {
                super.onPageFinished(webView, url);
                if (swipeRefreshLayout != null) swipeRefreshLayout.setRefreshing(false);
                refreshWebAppCacheIfNeeded(webView, url);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView webView, WebResourceRequest request) {
                Uri url = request.getUrl();
                try {
                    if (url != null && url.isHierarchical() && url.getQueryParameter("open_external") != null) {
                        try {
                            startActivity(new Intent(Intent.ACTION_VIEW, url));
                        } catch (Exception ignored) {
                            Toast.makeText(LauncherActivity.this, "Não foi possível abrir no navegador.", Toast.LENGTH_SHORT).show();
                        }
                        return true;
                    }
                } catch (Exception ignored) {}

                if (isOAuthUrl(url)) {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, url));
                    } catch (Exception ignored) {
                        Toast.makeText(LauncherActivity.this, "Não foi possível abrir o login do Google.", Toast.LENGTH_SHORT).show();
                    }
                    return true;
                }
                if (isTrustedUrl(url)) return false;
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
                String[] requestedTypes = params.getAcceptTypes();
                ArrayList<String> acceptedMimeTypes = new ArrayList<>();
                if (requestedTypes != null) {
                    for (String requestedType : requestedTypes) {
                        if (requestedType != null && requestedType.contains("/")) {
                            acceptedMimeTypes.add(requestedType);
                        }
                    }
                }

                if (acceptsAudioFiles(requestedTypes)) {
                    // Alguns gerenciadores Android registram .ogg como
                    // application/ogg ou application/octet-stream, e não como
                    // audio/ogg. O filtro explícito impede que esses arquivos
                    // desapareçam no seletor do tablet/celular.
                    intent.setType("*/*");
                    intent.putExtra(Intent.EXTRA_MIME_TYPES, AUDIO_FILE_CHOOSER_MIME_TYPES);
                } else if (acceptedMimeTypes.isEmpty()) {
                    // Campos sem filtro, como o anexo de suporte, devem permitir qualquer arquivo.
                    intent.setType("*/*");
                } else if (acceptedMimeTypes.size() == 1) {
                    intent.setType(acceptedMimeTypes.get(0));
                } else {
                    intent.setType("*/*");
                    intent.putExtra(Intent.EXTRA_MIME_TYPES, acceptedMimeTypes.toArray(new String[0]));
                }

                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.putExtra(
                        Intent.EXTRA_ALLOW_MULTIPLE,
                        params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE
                );
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

    private boolean acceptsAudioFiles(String[] requestedTypes) {
        if (requestedTypes == null) return false;
        for (String requestedType : requestedTypes) {
            if (requestedType == null) continue;
            String normalized = requestedType.trim().toLowerCase(java.util.Locale.ROOT);
            if (normalized.startsWith("audio/")
                    || normalized.equals("application/ogg")
                    || normalized.equals("application/octet-stream")
                    || normalized.endsWith(".ogg")
                    || normalized.endsWith(".oga")
                    || normalized.endsWith(".opus")) {
                return true;
            }
        }
        return false;
    }

    private void refreshWebAppCacheIfNeeded(WebView webView, String url) {
        Uri pageUri;
        try {
            pageUri = Uri.parse(url);
        } catch (Exception exception) {
            return;
        }
        if (!isTrustedUrl(pageUri)) return;

        String cacheMarker = "evolucao_native_cache_" + getInstalledVersionCode();
        String script = "(async function(){try{"
                + "var key='" + cacheMarker + "';"
                + "if(localStorage.getItem(key)==='1')return;"
                + "localStorage.setItem(key,'1');"
                + "if('caches' in window){var names=await caches.keys();"
                + "await Promise.all(names.map(function(name){return caches.delete(name);}));}"
                + "if('serviceWorker' in navigator){var regs=await navigator.serviceWorker.getRegistrations();"
                + "await Promise.all(regs.map(function(reg){return reg.update();}));}"
                + "location.reload();"
                + "}catch(error){console.warn('[NativeCache] Falha ao atualizar cache',error);}})();";
        webView.evaluateJavascript(script, null);
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
    protected void onDestroy() {
        releaseSharedAudioPlayer(true);
        if (billingClient != null) billingClient.endConnection();
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
