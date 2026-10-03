package space.eidos.android

import androidx.test.platform.app.InstrumentationRegistry
import androidx.work.ListenableWorker
import androidx.work.NetworkType
import androidx.work.WorkManager
import androidx.work.testing.TestListenableWorkerBuilder
import androidx.work.workDataOf
import java.io.File
import java.util.UUID
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.json.JSONArray
import org.junit.Assert.*
import org.junit.Assume
import org.junit.Test

class AutomaticSyncTest {
    private val context
        get() = InstrumentationRegistry.getInstrumentation().targetContext

    private suspend fun removeSpace(id: String) {
        BackgroundSync.setAutomatic(context, id, false)
        SpaceRepository(context, id).close()
        SyncProfileStore(context, id).clear()
        val prefs =
            context.getSharedPreferences("space-catalog", android.content.Context.MODE_PRIVATE)
        val all = JSONArray(prefs.getString("spaces", "[]"))
        prefs
            .edit()
            .putString(
                "spaces",
                JSONArray(
                        (0 until all.length()).map(all::getJSONObject).filter {
                            it.getString("id") != id
                        }
                    )
                    .toString(),
            )
            .commit()
        File(context.filesDir, "spaces/$id").deleteRecursively()
        listOf("space-$id", "automatic-sync-$id", "background-sync-$id-auto")
            .forEach(context::deleteSharedPreferences)
    }

    @Test
    fun persistsScheduleRepairsMissingWorkAndRejectsObsoletePause(): Unit = runBlocking {
        val first = SpaceCatalog(context).create("自动同步-${UUID.randomUUID()}")
        val second = SpaceCatalog(context).create("独立配置-${UUID.randomUUID()}")
        val manager = WorkManager.getInstance(context)
        try {
            BackgroundSync.setAutomatic(context, first.id, true)
            val old = BackgroundSync.automaticSettings(context, first.id)
            val work =
                manager
                    .getWorkInfosForUniqueWork(BackgroundSync.automaticName(first.id))
                    .get()
                    .single { !it.state.isFinished }
            assertEquals(NetworkType.CONNECTED, work.constraints.requiredNetworkType)
            assertEquals(15 * 60 * 1000L, work.periodicityInfo!!.repeatIntervalMillis)
            assertFalse(BackgroundSync.automaticSettings(context, second.id).enabled)
            manager.cancelUniqueWork(BackgroundSync.automaticName(first.id)).result.get()
            BackgroundSync.reconcileAutomatic(context, first.id)
            assertTrue(
                manager
                    .getWorkInfosForUniqueWork(BackgroundSync.automaticName(first.id))
                    .get()
                    .any { !it.state.isFinished }
            )
            assertEquals(old.epoch, BackgroundSync.automaticSettings(context, first.id).epoch)
            BackgroundSync.setAutomatic(context, first.id, true)
            val current = BackgroundSync.automaticSettings(context, first.id)
            assertNotEquals(old.epoch, current.epoch)
            BackgroundSync.pauseAutomatic(context, first.id, "过期任务", old.epoch)
            assertTrue(BackgroundSync.automaticSettings(context, first.id).enabled)
            val obsolete =
                TestListenableWorkerBuilder<SpaceSyncWorker>(context)
                    .setInputData(
                        workDataOf(
                            "spaceId" to first.id,
                            "automatic" to true,
                            "automaticEpoch" to old.epoch,
                        )
                    )
                    .build()
            assertEquals(ListenableWorker.Result.success(), obsolete.doWork())
            assertFalse(File(context.filesDir, "spaces/${first.id}/.graft").exists())
            val active =
                TestListenableWorkerBuilder<SpaceSyncWorker>(context)
                    .setInputData(
                        workDataOf(
                            "spaceId" to first.id,
                            "automatic" to true,
                            "automaticEpoch" to current.epoch,
                        )
                    )
                    .build()
            assertTrue(active.doWork() is ListenableWorker.Result.Failure)
            val paused =
                withTimeout(15_000) {
                    BackgroundSync.observeAutomatic(context, first.id).first {
                        !it.enabled && it.message.contains("已暂停")
                    }
                }
            assertTrue(paused.message.contains("请先连接远程"))
            BackgroundSync.setAutomatic(context, second.id, true)
            BackgroundSync.setAutomatic(context, first.id, false)
            assertTrue(BackgroundSync.automaticSettings(context, second.id).enabled)
        } finally {
            removeSpace(first.id)
            removeSpace(second.id)
        }
    }

    @Test
    fun successfulCycleResetsRetryAllowance(): Unit = runBlocking {
        val base = InstrumentationRegistry.getArguments().getString("graftRemoteUrl")
        Assume.assumeNotNull(base)
        val space = SpaceCatalog(context).create("自动重试-${UUID.randomUUID()}")
        val repository = SpaceRepository(context, space.id)
        val url = "$base/android/automatic-${UUID.randomUUID()}"
        try {
            repository.create("", "离线笔记", "markdown")
            repository.connectRemote(url, "ephemeral-test-token")
            repository.syncRemote(publish = true)
            BackgroundSync.setAutomatic(context, space.id, true)
            val epoch = BackgroundSync.automaticSettings(context, space.id).epoch
            val worker =
                TestListenableWorkerBuilder<SpaceSyncWorker>(context)
                    .setInputData(
                        workDataOf(
                            "spaceId" to space.id,
                            "automatic" to true,
                            "automaticEpoch" to epoch,
                        )
                    )
                    .build()
            val details = BackgroundSyncDetails(context, space.id, automatic = true)
            repeat(5) { details.record(worker.id.toString(), "先前失败", failed = true) }
            assertTrue(worker.doWork() is ListenableWorker.Result.Success)
            assertTrue(details.message(worker.id.toString())!!.contains("已完成"))
            repository.connectRemote(url, "wrong-token")
            assertEquals(ListenableWorker.Result.retry(), worker.doWork())
            assertTrue(details.message(worker.id.toString())!!.contains("第 1 次"))
            assertTrue(BackgroundSync.automaticSettings(context, space.id).enabled)
            repeat(4) { assertEquals(ListenableWorker.Result.retry(), worker.doWork()) }
            assertTrue(worker.doWork() is ListenableWorker.Result.Failure)
            assertFalse(BackgroundSync.automaticSettings(context, space.id).enabled)
            assertTrue(File(context.filesDir, "spaces/${space.id}/离线笔记.md").isFile)
        } finally {
            removeSpace(space.id)
        }
    }
}
