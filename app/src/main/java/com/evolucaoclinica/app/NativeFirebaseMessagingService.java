package com.evolucaoclinica.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.os.Build;
import android.text.TextUtils;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

public class NativeFirebaseMessagingService extends FirebaseMessagingService {
    private static final String LOG_TAG = "EvolucaoPush";
    private static final String CHANNEL_ID = "app_notifications";

    @Override
    public void onNewToken(String token) {
        super.onNewToken(token);
        Log.d(LOG_TAG, "Novo token FCM recebido; será registrado quando o usuário abrir o app.");
    }

    @Override
    public void onMessageReceived(RemoteMessage message) {
        super.onMessageReceived(message);

        String title = message.getData().get("title");
        String body = message.getData().get("body");
        if (TextUtils.isEmpty(title) && message.getNotification() != null) title = message.getNotification().getTitle();
        if (TextUtils.isEmpty(body) && message.getNotification() != null) body = message.getNotification().getBody();
        if (TextUtils.isEmpty(title)) title = "Evolução Clínica";
        if (TextUtils.isEmpty(body)) body = "Você tem uma nova notificação.";

        showNotification(title, body, message.getData().get("link"));
    }

    private void showNotification(String title, String body, String link) {
        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (manager == null) return;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Notificações do aplicativo",
                    NotificationManager.IMPORTANCE_DEFAULT
            );
            channel.setDescription("Alertas e notificações da Evolução Clínica");
            manager.createNotificationChannel(channel);
        }

        Intent intent = new Intent(this, LauncherActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (!TextUtils.isEmpty(link)) intent.putExtra("notification_link", link);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent pendingIntent = PendingIntent.getActivity(this, (int) System.currentTimeMillis(), intent, flags);

        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_notification_icon)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setContentIntent(pendingIntent)
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .build();

        manager.notify((int) (System.currentTimeMillis() & 0x7FFFFFFF), notification);
    }
}
