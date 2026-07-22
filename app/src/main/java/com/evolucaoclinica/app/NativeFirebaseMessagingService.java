package com.evolucaoclinica.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Build;
import android.text.TextUtils;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

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
        String iconUrl = message.getData().get("icon");
        String imageUrl = message.getData().get("image");

        if (TextUtils.isEmpty(title) && message.getNotification() != null) title = message.getNotification().getTitle();
        if (TextUtils.isEmpty(body) && message.getNotification() != null) body = message.getNotification().getBody();
        if (TextUtils.isEmpty(title)) title = "Evolução Clínica";
        if (TextUtils.isEmpty(body)) body = "Você tem uma nova notificação.";

        showNotification(title, body, message.getData().get("link"), iconUrl, imageUrl);
    }

    private Bitmap getBitmapFromUrl(String urlString) {
        if (TextUtils.isEmpty(urlString)) return null;
        try {
            URL url = new URL(urlString);
            HttpURLConnection connection = (HttpURLConnection) url.openConnection();
            connection.setDoInput(true);
            connection.setConnectTimeout(5000);
            connection.setReadTimeout(5000);
            connection.connect();
            InputStream input = connection.getInputStream();
            return BitmapFactory.decodeStream(input);
        } catch (Exception e) {
            Log.e(LOG_TAG, "Erro ao carregar imagem/ícone da notificação: " + urlString, e);
            return null;
        }
    }

    private void showNotification(String title, String body, String link, String iconUrl, String imageUrl) {
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

        Bitmap largeIcon = getBitmapFromUrl(iconUrl);
        Bitmap bigPicture = getBitmapFromUrl(imageUrl);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_notification_icon)
                .setContentTitle(title)
                .setContentText(body)
                .setContentIntent(pendingIntent)
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT);

        if (largeIcon != null) {
            builder.setLargeIcon(largeIcon);
        }

        if (bigPicture != null) {
            builder.setStyle(new NotificationCompat.BigPictureStyle().bigPicture(bigPicture).setSummaryText(body));
        } else {
            builder.setStyle(new NotificationCompat.BigTextStyle().bigText(body));
        }

        Notification notification = builder.build();
        manager.notify((int) (System.currentTimeMillis() & 0x7FFFFFFF), notification);
    }
}

