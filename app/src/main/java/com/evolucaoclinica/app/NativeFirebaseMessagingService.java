package com.evolucaoclinica.app;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

/** Shows the FCM data notifications sent by the platform while the WebView is closed. */
public class NativeFirebaseMessagingService extends FirebaseMessagingService {
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
        showNotification(title, body, data.get("link"));
    }

    private void showNotification(String title, String body, String link) {
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

        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, CHANNEL_ID)
                : new Notification.Builder(this);
        builder
                .setSmallIcon(R.drawable.ic_notification_icon)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new Notification.BigTextStyle().bigText(body))
                .setAutoCancel(true)
                .setContentIntent(contentIntent)
                .setPriority(Notification.PRIORITY_HIGH);

        notificationManager.notify((int) (System.currentTimeMillis() & 0x7fffffff), builder.build());
    }

    private String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.trim().isEmpty()) return value;
        }
        return "";
    }
}
