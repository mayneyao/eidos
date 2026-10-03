package space.eidos.android

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.work.ForegroundInfo
import androidx.work.WorkManager
import java.util.UUID
import kotlinx.coroutines.*

internal object SyncNotification {
    const val CHANNEL = "space-sync"

    fun foreground(
        context: Context,
        workId: UUID,
        spaceId: String,
        epoch: String?,
        phase: String,
    ): ForegroundInfo {
        context
            .getSystemService(NotificationManager::class.java)
            .createNotificationChannel(
                NotificationChannel(CHANNEL, "文件同步", NotificationManager.IMPORTANCE_LOW)
            )
        val cancel =
            PendingIntent.getBroadcast(
                context,
                0,
                Intent(context, SyncCancelReceiver::class.java)
                    .setData(Uri.parse("eidos-sync://cancel/$workId"))
                    .putExtra("workId", workId.toString())
                    .putExtra("spaceId", spaceId)
                    .putExtra("epoch", epoch),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
        val name = SpaceCatalog(context).spaces().firstOrNull { it.id == spaceId }?.name ?: "Space"
        val notification =
            NotificationCompat.Builder(context, CHANNEL)
                .setSmallIcon(R.drawable.ic_eidos)
                .setContentTitle("正在同步 · $name")
                .setContentText(phase)
                .setContentIntent(
                    PendingIntent.getActivity(
                        context,
                        0,
                        Intent(context, MainActivity::class.java)
                            .addFlags(
                                Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
                            ),
                        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
                    )
                )
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
                .setCategory(NotificationCompat.CATEGORY_PROGRESS)
                .setProgress(0, 0, true)
                .addAction(0, if (epoch == null) "取消同步" else "暂停自动同步", cancel)
                .build()
        val notificationId = workId.hashCode() and Int.MAX_VALUE
        return if (Build.VERSION.SDK_INT >= 29)
            ForegroundInfo(
                notificationId,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC,
            )
        else ForegroundInfo(notificationId, notification)
    }
}

/** Explicit, unexported receiver; old notifications cannot stop a newer automatic schedule. */
class SyncCancelReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val id =
            runCatching { UUID.fromString(intent.getStringExtra("workId")) }.getOrNull() ?: return
        val spaceId = intent.getStringExtra("spaceId") ?: return
        val epoch = intent.getStringExtra("epoch")
        val pending = goAsync()
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            try {
                if (epoch != null)
                    BackgroundSync.pauseAutomatic(context, spaceId, "已从通知暂停自动同步", epoch)
                WorkManager.getInstance(context).cancelWorkById(id).result.get()
            } catch (_: Exception) {
                android.util.Log.w(
                    "EidosSync",
                    "Unable to cancel background sync from notification",
                )
            } finally {
                pending.finish()
            }
        }
    }
}
