package com.evolucaoclinica.app;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Build;
import android.text.TextUtils;
import android.util.Log;

import androidx.core.app.NotificationCompat;
import androidx.core.graphics.drawable.IconCompat;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Map;

/** Shows the FCM data notifications sent by the platform while the WebView is closed. */
public class NativeFirebaseMessagingService extends FirebaseMessagingService {
    private static final String LOG_TAG = "EvolucaoPush";
    private static final String CHANNEL_ID = "evolucao_clinica_push";
    private static final String CHANNEL_NAME = "Notificações do Evolução Clínica";
    private static final String CHANNEL_DESCRIPTION = "Alertas e atualizações do aplicativo";

    @Override
    public void onMessageReceived(RemoteMessage remoteMessage) {
        Map<String, String> data = remoteMessage.getData();
        RemoteMessage.Notification remoteNotification = remoteMessage.getNotification();

        String title = firstNonBlank(
                data.get("title"),
                remoteNotification == null ? null : remoteNotification.getTitle(),
                getString(R.string.appName)
        );
        String body = firstNonBlank(
                data.get("body"),
                remoteNotification == null ? null : remoteNotification.getBody(),
                ""
        );
        showNotification(
                title,
                body,
                data.get("link"),
                data.get("icon"),
                data.get("badge"),
                data.get("image")
        );
    }

    private Bitmap getBitmapFromUrl(String urlString) {
        if (TextUtils.isEmpty(urlString)) return null;

        HttpURLConnection connection = null;
        try {
            URL url = new URL(urlString);
            connection = (HttpURLConnection) url.openConnection();
            connection.setDoInput(true);
            connection.setConnectTimeout(5000);
            connection.setReadTimeout(5000);
            connection.connect();
            if (connection.getResponseCode() < 200 || connection.getResponseCode() >= 300) return null;
            try (InputStream input = connection.getInputStream()) {
                return BitmapFactory.decodeStream(input);
            }
        } catch (Exception error) {
            Log.w(LOG_TAG, "Não foi possível carregar o ícone remoto da notificação.", error);
            return null;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private void showNotification(
            String title,
            String body,
            String link,
            String iconUrl,
            String badgeUrl,
            String imageUrl
    ) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return;
        }

        NotificationManager notificationManager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (notificationManager == null) return;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    CHANNEL_NAME,
                    NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription(CHANNEL_DESCRIPTION);
            notificationManager.createNotificationChannel(channel);
        }

        Intent openAppIntent = new Intent(this, LauncherActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (link != null && !link.trim().isEmpty()) openAppIntent.putExtra("notification_link", link);
        PendingIntent contentIntent = PendingIntent.getActivity(
                this,
                (int) (System.currentTimeMillis() & 0x7fffffff),
                openAppIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Bitmap largeIcon = getBitmapFromUrl(iconUrl);
        Bitmap badgeIcon = getBitmapFromUrl(badgeUrl);
        Bitmap bigPicture = getBitmapFromUrl(imageUrl);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_notification_icon)
                .setContentTitle(title)
                .setContentText(body)
                .setAutoCancel(true)
                .setContentIntent(contentIntent)
                .setPriority(NotificationCompat.PRIORITY_HIGH);

        if (badgeIcon != null) {
            builder.setSmallIcon(IconCompat.createWithBitmap(badgeIcon));
        }
        if (largeIcon != null) {
            builder.setLargeIcon(largeIcon);
        }
        if (bigPicture != null) {
            builder.setStyle(new NotificationCompat.BigPictureStyle()
                    .bigPicture(bigPicture)
                    .setSummaryText(body));
        } else {
            builder.setStyle(new NotificationCompat.BigTextStyle().bigText(body));
        }

        notificationManager.notify((int) (System.currentTimeMillis() & 0x7fffffff), builder.build());
    }

    private String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.trim().isEmpty()) return value;
        }
        return "";
    }
}
