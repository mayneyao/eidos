package space.eidos.android

import android.app.NotificationManager
import android.content.Context
import androidx.test.platform.app.InstrumentationRegistry
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkInfo
import androidx.work.WorkManager
import java.io.File
import java.net.InetAddress
import java.net.ServerSocket
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.first
import org.json.JSONArray
import org.junit.Assert.*
import org.junit.Test

class SyncNotificationTest {
    private val context = InstrumentationRegistry.getInstrumentation().targetContext

    @Test
    fun runningWorkerShowsPhaseAndNotificationCancelsNativeFetch(): Unit = runBlocking {
        if (android.os.Build.VERSION.SDK_INT >= 33)
            android.os.ParcelFileDescriptor.AutoCloseInputStream(
                    InstrumentationRegistry.getInstrumentation()
                        .uiAutomation
                        .executeShellCommand(
                            "pm grant ${context.packageName} android.permission.POST_NOTIFICATIONS"
                        )
                )
                .use { it.readBytes() }
        val space = SpaceCatalog(context).create("通知测试-${UUID.randomUUID()}")
        val repository = SpaceRepository(context, space.id)
        val server = ServerSocket(0, 1, InetAddress.getByName("127.0.0.1"))
        val received = CountDownLatch(1)
        val release = CountDownLatch(1)
        val thread =
            Thread {
                    try {
                        server.accept().use { socket ->
                            socket.getInputStream().bufferedReader().readLine()
                            received.countDown()
                            release.await(30, TimeUnit.SECONDS)
                        }
                    } catch (_: Exception) {}
                }
                .apply { start() }
        try {
            repository.create("", "保留本地", "markdown")
            repository.connectRemote("http://127.0.0.1:${server.localPort}/test/notification", "")
            BackgroundSync.enqueue(context, space.id)
            assertTrue(received.await(15, TimeUnit.SECONDS))
            val manager = context.getSystemService(NotificationManager::class.java)
            val notification =
                withTimeout(10_000) {
                    var found =
                        manager.activeNotifications.firstOrNull {
                            it.notification.extras
                                .getString("android.title")
                                ?.contains(space.name) == true
                        }
                    while (
                        found == null ||
                            found.notification.extras.getString("android.text") != "获取远程更新"
                    ) {
                        delay(50)
                        found =
                            manager.activeNotifications.firstOrNull {
                                it.notification.extras
                                    .getString("android.title")
                                    ?.contains(space.name) == true
                            }
                    }
                    found.notification
                }
            assertEquals(SyncNotification.CHANNEL, notification.channelId)
            assertEquals("取消同步", notification.actions.single().title)
            notification.actions.single().actionIntent.send()
            withTimeout(5_000) {
                BackgroundSync.observe(context, space.id).first { infos ->
                    infos.any { it.state == WorkInfo.State.CANCELLED }
                }
                // WorkManager marks cancellation before JNI exits; this also proves mutex release.
                repository.graftStatus()
            }
            assertTrue(File(context.filesDir, "spaces/${space.id}/保留本地.md").exists())
            withTimeout(5_000) {
                while (
                    manager.activeNotifications.any {
                        it.notification.extras.getString("android.title")?.contains(space.name) ==
                            true
                    }
                ) delay(50)
            }
        } finally {
            release.countDown()
            server.close()
            thread.join(2_000)
            BackgroundSync.cancel(context, space.id)
            repository.close()
            SyncProfileStore(context, space.id).clear()
            File(context.filesDir, "spaces/${space.id}").deleteRecursively()
            val prefs = context.getSharedPreferences("space-catalog", Context.MODE_PRIVATE)
            val all = JSONArray(prefs.getString("spaces", "[]"))
            prefs
                .edit()
                .putString(
                    "spaces",
                    JSONArray(
                            (0 until all.length()).map(all::getJSONObject).filter {
                                it.getString("id") != space.id
                            }
                        )
                        .toString(),
                )
                .commit()
            context.deleteSharedPreferences("background-sync-${space.id}")
        }
    }

    @Test
    fun obsoleteNotificationCannotPauseANewerSchedule(): Unit = runBlocking {
        val id = "notification-${UUID.randomUUID()}"
        try {
            BackgroundSync.setAutomatic(context, id, true)
            val oldEpoch = BackgroundSync.automaticSettings(context, id).epoch
            val oldWork =
                OneTimeWorkRequestBuilder<SpaceSyncWorker>()
                    .setInitialDelay(1, TimeUnit.DAYS)
                    .build()
            val manager = WorkManager.getInstance(context)
            manager.enqueue(oldWork).result.get()
            val old = SyncNotification.foreground(context, oldWork.id, id, oldEpoch, "同步中")
            BackgroundSync.setAutomatic(context, id, true)
            val current = BackgroundSync.automaticSettings(context, id)
            old.notification.actions.single().actionIntent.send()
            withTimeout(5_000) {
                manager.getWorkInfoByIdFlow(oldWork.id).first {
                    it?.state == WorkInfo.State.CANCELLED
                }
            }
            assertTrue(BackgroundSync.automaticSettings(context, id).enabled)
            val active =
                SyncNotification.foreground(context, UUID.randomUUID(), id, current.epoch, "同步中")
            active.notification.actions.single().actionIntent.send()
            withTimeout(5_000) {
                while (BackgroundSync.automaticSettings(context, id).enabled) delay(25)
            }
            assertEquals(current.epoch, BackgroundSync.automaticSettings(context, id).epoch)
            assertEquals("已从通知暂停自动同步", BackgroundSync.automaticSettings(context, id).reason)
        } finally {
            BackgroundSync.setAutomatic(context, id, false)
            context.deleteSharedPreferences("automatic-sync-$id")
        }
    }
}
